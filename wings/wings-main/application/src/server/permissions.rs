use serde::{
    Deserialize, Deserializer, Serialize,
    de::{SeqAccess, Visitor},
};
use std::{
    collections::{HashMap, HashSet},
    marker::PhantomData,
    ops::{Deref, DerefMut},
    sync::Arc,
};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
pub enum Permission {
    #[serde(rename = "*")]
    All,
    #[serde(rename = "meta.calagopus")]
    MetaCalagopus,

    #[serde(rename = "websocket.connect")]
    WebsocketConnect,
    #[serde(rename = "control.read-console")]
    ControlReadConsole,
    #[serde(rename = "control.console")]
    ControlConsole,
    #[serde(rename = "control.start")]
    ControlStart,
    #[serde(rename = "control.stop")]
    ControlStop,
    #[serde(rename = "control.restart")]
    ControlRestart,
    #[serde(rename = "admin.websocket.errors")]
    AdminWebsocketErrors,
    #[serde(rename = "admin.websocket.install")]
    AdminWebsocketInstall,
    #[serde(rename = "admin.websocket.transfer")]
    AdminWebsocketTransfer,
    #[serde(rename = "backup.read", alias = "backups.read")]
    BackupRead,
    #[serde(rename = "schedule.read", alias = "schedules.read")]
    ScheduleRead,

    #[serde(rename = "file.read", alias = "files.read")]
    FileRead,
    #[serde(rename = "file.read-content", alias = "files.read-content")]
    FileReadContent,
    #[serde(rename = "file.create", alias = "files.create")]
    FileCreate,
    #[serde(rename = "file.update", alias = "files.update")]
    FileUpdate,
    #[serde(rename = "file.delete", alias = "files.delete")]
    FileDelete,
    #[serde(rename = "file.archive", alias = "files.archive")]
    FileArchive,
    #[serde(rename = "file.sftp", alias = "files.sftp")]
    FileSftp,
}

impl Permission {
    #[inline]
    pub fn is_admin(self) -> bool {
        matches!(
            self,
            Permission::AdminWebsocketErrors
                | Permission::AdminWebsocketInstall
                | Permission::AdminWebsocketTransfer
        )
    }

    #[inline]
    pub fn matches(self, other: Permission) -> bool {
        self == other || (other == Permission::All && !other.is_admin())
    }
}

type UserPermissions = (
    Permissions,
    Option<ignore::overrides::Override>,
    std::time::Instant,
);
pub struct UserPermissionsMap {
    map: Arc<Mutex<HashMap<uuid::Uuid, UserPermissions>>>,
    removal_sender: tokio::sync::broadcast::Sender<uuid::Uuid>,
    _removal_receiver: tokio::sync::broadcast::Receiver<uuid::Uuid>,

    task: tokio::task::JoinHandle<()>,
}

impl Default for UserPermissionsMap {
    fn default() -> Self {
        let map = Arc::new(Mutex::new(HashMap::new()));
        let (tx, rx) = tokio::sync::broadcast::channel(32);

        Self {
            map: Arc::clone(&map),
            removal_sender: tx,
            _removal_receiver: rx,
            task: tokio::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;

                    let mut map = map.lock().await;
                    map.retain(|_, (_, _, last_access)| {
                        last_access.elapsed().as_secs() < 60 * 60 * 24
                    });
                }
            }),
        }
    }
}

impl UserPermissionsMap {
    pub async fn wait_for_removal(&self, user_uuid: uuid::Uuid) {
        let mut receiver = self.removal_sender.subscribe();

        while let Ok(uuid) = receiver.recv().await {
            if uuid == user_uuid {
                break;
            }
        }
    }

    pub async fn has_permission(&self, user_uuid: uuid::Uuid, permission: Permission) -> bool {
        let mut map = self.map.lock().await;
        if let Some((permissions, _, last_access)) = map.get_mut(&user_uuid) {
            *last_access = std::time::Instant::now();

            permissions.has_permission(permission)
        } else {
            false
        }
    }

    pub async fn has_calagopus_permission_or(
        &self,
        user_uuid: uuid::Uuid,
        permission: Permission,
        default: bool,
    ) -> bool {
        let mut map = self.map.lock().await;
        if let Some((permissions, _, last_access)) = map.get_mut(&user_uuid) {
            *last_access = std::time::Instant::now();

            permissions.has_calagopus_permission_or(permission, default)
        } else {
            default
        }
    }

    pub async fn is_ignored(
        &self,
        user_uuid: uuid::Uuid,
        path: impl AsRef<std::path::Path>,
        is_dir: bool,
    ) -> bool {
        let mut map = self.map.lock().await;
        if let Some((_, ignored, last_access)) = map.get_mut(&user_uuid) {
            *last_access = std::time::Instant::now();

            ignored
                .as_ref()
                .map(|ig| ig.matched(path, is_dir).is_whitelist())
                .unwrap_or(false)
        } else {
            false
        }
    }

    pub async fn set_permissions(
        &self,
        user_uuid: uuid::Uuid,
        permissions: Permissions,
        ignored_files: Option<&[impl AsRef<str>]>,
    ) {
        if permissions.is_empty() {
            self.map.lock().await.remove(&user_uuid);
            self.removal_sender.send(user_uuid).ok();
            return;
        }

        let overrides = if let Some(ignored_files) = ignored_files {
            let mut overrides = ignore::overrides::OverrideBuilder::new("/");
            for file in ignored_files {
                overrides.add(file.as_ref()).ok();
            }

            Some(overrides)
        } else {
            None
        };

        let mut map = self.map.lock().await;
        if let Some((current_permissions, current_ignored, _)) = map.get_mut(&user_uuid) {
            *current_permissions = permissions;
            if let Some(overrides) = overrides {
                *current_ignored = overrides.build().ok();
            }
        } else {
            map.insert(
                user_uuid,
                (
                    permissions,
                    overrides.as_ref().and_then(|o| o.build().ok()),
                    std::time::Instant::now(),
                ),
            );
        }
    }

    pub async fn clear_permissions(&self) {
        let mut map = self.map.lock().await;
        for user_uuid in map.keys().copied().collect::<Vec<_>>() {
            map.remove(&user_uuid);
            self.removal_sender.send(user_uuid).ok();
        }
    }
}

impl Drop for UserPermissionsMap {
    fn drop(&mut self) {
        self.task.abort();
    }
}

#[derive(Debug, Default, Clone, Serialize)]
#[repr(transparent)]
pub struct Permissions(HashSet<Permission>);

impl Permissions {
    #[inline]
    pub fn is_calagopus(&self) -> bool {
        self.0.contains(&Permission::MetaCalagopus)
    }

    #[inline]
    pub fn has_permission(&self, permission: Permission) -> bool {
        for p in self.0.iter().copied() {
            if permission.matches(p) {
                return true;
            }
        }

        false
    }

    #[inline]
    pub fn has_calagopus_permission_or(&self, permission: Permission, default: bool) -> bool {
        if !self.is_calagopus() {
            return default;
        }

        self.has_permission(permission)
    }
}

impl Deref for Permissions {
    type Target = HashSet<Permission>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for Permissions {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl<'de> Deserialize<'de> for Permissions {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct PermissionsVisitor(PhantomData<fn() -> Permissions>);

        impl<'de> Visitor<'de> for PermissionsVisitor {
            type Value = Permissions;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a sequence of permissions")
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where
                A: SeqAccess<'de>,
            {
                let mut permissions = HashSet::new();

                while let Ok(Some(result)) = seq.next_element::<serde_json::Value>() {
                    if let Ok(permission) = serde_json::from_value::<Permission>(result) {
                        permissions.insert(permission);
                    }
                }

                Ok(Permissions(permissions))
            }
        }

        deserializer.deserialize_seq(PermissionsVisitor(PhantomData))
    }
}
