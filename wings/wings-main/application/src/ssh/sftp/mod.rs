use crate::{
    routes::State,
    server::{
        activity::{Activity, ActivityEvent},
        permissions::Permission,
    },
    utils::PortableModeExt,
};
use cap_std::fs::{Metadata, OpenOptions};
use positioned_io::{ReadAt, WriteAt};
use russh_sftp::protocol::{
    Data, File, FileAttributes, Handle, Name, OpenFlags, Status, StatusCode,
};
use serde_json::json;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, RwLock},
};

mod extended;

pub struct FileHandle {
    path: PathBuf,
    path_components: Vec<String>,

    file: Arc<RwLock<std::fs::File>>,
}

pub struct DirHandle {
    path: PathBuf,

    dir: crate::server::filesystem::cap::AsyncReadDir,
    consumed: u64,
}

pub enum ServerHandle {
    File(FileHandle),
    Dir(DirHandle),
}

impl ServerHandle {
    #[inline]
    fn path(&self) -> &Path {
        match self {
            ServerHandle::File(handle) => handle.path.as_path(),
            ServerHandle::Dir(handle) => handle.path.as_path(),
        }
    }
}

const HANDLE_LIMIT: usize = 32;

pub struct SftpSession {
    pub state: State,
    pub server: crate::server::Server,

    pub user_ip: std::net::IpAddr,
    pub user_uuid: uuid::Uuid,

    pub handle_id: u64,
    pub handles: HashMap<compact_str::CompactString, ServerHandle>,
}

impl SftpSession {
    #[inline]
    fn convert_entry(path: &Path, metadata: Metadata, target_metadata: Option<Metadata>) -> File {
        let mut attrs = FileAttributes {
            size: Some(metadata.len()),
            atime: None,
            mtime: Some(
                metadata
                    .modified()
                    .map(|t| {
                        t.into_std()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                    })
                    .unwrap_or_default()
                    .as_secs() as u32,
            ),
            permissions: Some(metadata.permissions().mode()),
            ..Default::default()
        };

        match rustix::fs::FileType::from_raw_mode(metadata.permissions().mode()) {
            rustix::fs::FileType::RegularFile => attrs.set_regular(true),
            rustix::fs::FileType::Directory => attrs.set_dir(true),
            rustix::fs::FileType::Symlink => attrs.set_symlink(true),
            rustix::fs::FileType::BlockDevice => attrs.set_block(true),
            rustix::fs::FileType::CharacterDevice => attrs.set_character(true),
            rustix::fs::FileType::Fifo => attrs.set_fifo(true),
            _ => {}
        }

        if let Some(target_metadata) = target_metadata {
            match rustix::fs::FileType::from_raw_mode(target_metadata.permissions().mode()) {
                rustix::fs::FileType::RegularFile => attrs.set_regular(true),
                rustix::fs::FileType::Directory => attrs.set_dir(true),
                rustix::fs::FileType::BlockDevice => attrs.set_block(true),
                rustix::fs::FileType::CharacterDevice => attrs.set_character(true),
                rustix::fs::FileType::Fifo => attrs.set_fifo(true),
                _ => {}
            }
        }

        File::new(
            path.file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| "/".to_string()),
            attrs,
        )
    }

    #[inline]
    fn next_handle_id(&mut self) -> compact_str::CompactString {
        let id = self.handle_id;
        self.handle_id += 1;

        compact_str::format_compact!("{id:x}")
    }

    #[inline]
    async fn has_permission(&self, permission: Permission) -> bool {
        self.server
            .user_permissions
            .has_permission(self.user_uuid, permission)
            .await
    }

    #[inline]
    async fn is_ignored(&self, path: &Path, is_dir: bool) -> bool {
        Self::is_ignored_server(&self.server, self.user_uuid, path, is_dir).await
    }

    #[inline]
    async fn is_ignored_server(
        server: &crate::server::Server,
        user_uuid: uuid::Uuid,
        path: &Path,
        is_dir: bool,
    ) -> bool {
        if path == Path::new("/") || path == Path::new("") {
            return false;
        }

        server.filesystem.is_ignored(path, is_dir).await
            || server
                .user_permissions
                .is_ignored(user_uuid, path, is_dir)
                .await
    }

    #[inline]
    async fn allow_action(&self) -> bool {
        !self.server.is_locked_state()
            && self
                .server
                .user_permissions
                .has_permission(self.user_uuid, Permission::FileSftp)
                .await
    }
}

impl russh_sftp::server::Handler for SftpSession {
    type Error = StatusCode;

    #[inline]
    fn unimplemented(&self) -> Self::Error {
        StatusCode::OpUnsupported
    }

    async fn init(
        &mut self,
        _version: u32,
        _extensions: HashMap<String, String>,
    ) -> Result<russh_sftp::protocol::Version, Self::Error> {
        Ok(russh_sftp::protocol::Version {
            version: russh_sftp::protocol::VERSION,
            extensions: HashMap::from([
                ("check-file".to_string(), "1".to_string()),
                ("copy-file".to_string(), "1".to_string()),
                ("space-available".to_string(), "6".to_string()),
                ("limits@openssh.com".to_string(), "1".to_string()),
                ("statvfs@openssh.com".to_string(), "2".to_string()),
                ("hardlink@openssh.com".to_string(), "1".to_string()),
                ("fsync@openssh.com".to_string(), "1".to_string()),
                ("lsetstat@openssh.com".to_string(), "1".to_string()),
                (
                    "users-groups-by-id@openssh.com".to_string(),
                    "1".to_string(),
                ),
            ]),
        })
    }

    async fn close(&mut self, id: u32, handle: String) -> Result<Status, Self::Error> {
        self.handles.remove(handle.as_str());

        Ok(Status {
            id,
            status_code: StatusCode::Ok,
            error_message: "Ok".to_string(),
            language_tag: "en-US".to_string(),
        })
    }

    async fn realpath(&mut self, id: u32, path: String) -> Result<Name, Self::Error> {
        if path == "/.." || path == "." || path == "/" {
            return Ok(Name {
                id,
                files: vec![File::dummy("/".to_string())],
            });
        }

        if let Ok(path) = self.server.filesystem.async_canonicalize(&path).await {
            Ok(Name {
                id,
                files: vec![File::dummy(format!("/{}", path.display()))],
            })
        } else {
            Ok(Name {
                id,
                files: vec![File::dummy(format!(
                    "/{}",
                    self.server
                        .filesystem
                        .relative_path(Path::new(&path))
                        .display()
                ))],
            })
        }
    }

    async fn opendir(&mut self, id: u32, path: String) -> Result<Handle, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        if self.handles.len() >= HANDLE_LIMIT {
            return Err(StatusCode::Failure);
        }

        if !self.has_permission(Permission::FileRead).await {
            return Err(StatusCode::PermissionDenied);
        }

        let path = match self.server.filesystem.async_canonicalize(&path).await {
            Ok(path) => path,
            Err(_) => return Err(StatusCode::NoSuchFile),
        };

        if self.is_ignored(&path, true).await {
            return Err(StatusCode::NoSuchFile);
        }

        let dir = match self.server.filesystem.async_read_dir(&path).await {
            Ok(dir) => dir,
            Err(_) => return Err(StatusCode::NoSuchFile),
        };

        let handle = self.next_handle_id();

        self.handles.insert(
            handle.clone(),
            ServerHandle::Dir(DirHandle {
                path,
                dir,
                consumed: 0,
            }),
        );

        Ok(Handle {
            id,
            handle: handle.into(),
        })
    }

    async fn readdir(&mut self, id: u32, handle: String) -> Result<Name, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        let handle = match self.handles.get_mut(handle.as_str()) {
            Some(ServerHandle::Dir(handle)) => handle,
            _ => return Err(StatusCode::NoSuchFile),
        };

        if handle.consumed >= self.state.config.system.sftp.directory_entry_limit {
            return Err(StatusCode::Eof);
        }

        let mut files = Vec::new();

        loop {
            let file = match handle.dir.next_entry().await {
                Some(Ok((_, file))) => file,
                _ => {
                    if files.is_empty() {
                        return Err(StatusCode::Eof);
                    }

                    break;
                }
            };

            let path = handle.path.join(file);
            let metadata = match self.server.filesystem.async_symlink_metadata(&path).await {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };

            if Self::is_ignored_server(&self.server, self.user_uuid, &path, metadata.is_dir()).await
            {
                continue;
            }

            let target_metadata = if metadata.is_symlink() {
                self.server.filesystem.async_metadata(&path).await.ok()
            } else {
                None
            };

            files.push(Self::convert_entry(&path, metadata, target_metadata));
            handle.consumed += 1;

            if handle.consumed >= self.state.config.system.sftp.directory_entry_limit
                || files.len() >= self.state.config.system.sftp.directory_entry_send_amount
            {
                tracing::debug!(
                    "{} entries sent early in sftp readdir ({} total)",
                    files.len(),
                    handle.consumed,
                );

                break;
            }
        }

        Ok(Name { id, files })
    }

    async fn remove(&mut self, id: u32, filename: String) -> Result<Status, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        if self.state.config.system.sftp.read_only {
            return Err(StatusCode::PermissionDenied);
        }

        if !self.has_permission(Permission::FileDelete).await {
            return Err(StatusCode::PermissionDenied);
        }

        let path = match self.server.filesystem.async_canonicalize(&filename).await {
            Ok(path) => path,
            Err(_) => PathBuf::from(filename),
        };

        if let Ok(metadata) = self.server.filesystem.async_symlink_metadata(&path).await {
            if metadata.is_dir() {
                return Err(StatusCode::NoSuchFile);
            }

            if self.is_ignored(&path, metadata.is_dir()).await {
                return Err(StatusCode::NoSuchFile);
            }

            if self.server.filesystem.truncate_path(&path).await.is_err() {
                return Err(StatusCode::NoSuchFile);
            }

            self.server
                .activity
                .log_activity(Activity {
                    event: ActivityEvent::SftpDelete,
                    user: Some(self.user_uuid),
                    ip: Some(self.user_ip),
                    metadata: Some(json!({
                        "files": [self.server.filesystem.relative_path(&path)],
                    })),
                    schedule: None,
                    timestamp: chrono::Utc::now(),
                })
                .await;
        }

        Ok(Status {
            id,
            status_code: StatusCode::Ok,
            error_message: "Ok".to_string(),
            language_tag: "en-US".to_string(),
        })
    }

    async fn rmdir(&mut self, id: u32, path: String) -> Result<Status, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        if self.state.config.system.sftp.read_only {
            return Err(StatusCode::PermissionDenied);
        }

        if !self.has_permission(Permission::FileDelete).await {
            return Err(StatusCode::PermissionDenied);
        }

        let path = match self.server.filesystem.async_canonicalize(&path).await {
            Ok(path) => path,
            Err(_) => return Err(StatusCode::NoSuchFile),
        };

        if let Ok(metadata) = self.server.filesystem.async_symlink_metadata(&path).await {
            if !metadata.is_dir() {
                return Err(StatusCode::NoSuchFile);
            }

            if self.is_ignored(&path, true).await {
                return Err(StatusCode::NoSuchFile);
            }

            if path != self.server.filesystem.base_path
                && self.server.filesystem.truncate_path(&path).await.is_err()
            {
                return Err(StatusCode::NoSuchFile);
            }

            self.server
                .activity
                .log_activity(Activity {
                    event: ActivityEvent::SftpDelete,
                    user: Some(self.user_uuid),
                    ip: Some(self.user_ip),
                    metadata: Some(json!({
                        "files": [self.server.filesystem.relative_path(&path)],
                    })),
                    schedule: None,
                    timestamp: chrono::Utc::now(),
                })
                .await;
        }

        Ok(Status {
            id,
            status_code: StatusCode::Ok,
            error_message: "Ok".to_string(),
            language_tag: "en-US".to_string(),
        })
    }

    async fn mkdir(
        &mut self,
        id: u32,
        path: String,
        attrs: FileAttributes,
    ) -> Result<Status, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        if self.state.config.system.sftp.read_only {
            return Err(StatusCode::PermissionDenied);
        }

        if !self.has_permission(Permission::FileCreate).await {
            return Err(StatusCode::PermissionDenied);
        }

        let path = Path::new(&path);

        if self.is_ignored(path, true).await {
            return Err(StatusCode::NoSuchFile);
        }
        if self
            .server
            .filesystem
            .async_symlink_metadata(&path)
            .await
            .is_ok()
        {
            return Ok(Status {
                id,
                status_code: StatusCode::Ok,
                error_message: "Ok".to_string(),
                language_tag: "en-US".to_string(),
            });
        }

        if self
            .server
            .filesystem
            .async_create_dir(&path)
            .await
            .is_err()
        {
            return Err(StatusCode::NoSuchFile);
        }

        if self.server.filesystem.chown_path(path).await.is_err() {
            return Err(StatusCode::Failure);
        }
        if let Some(permissions) = attrs.permissions {
            let permissions = cap_std::fs::Permissions::from_portable_mode(permissions);

            if self
                .server
                .filesystem
                .async_set_permissions(&path, permissions)
                .await
                .is_err()
            {
                return Err(StatusCode::Failure);
            }
        }

        self.server
            .activity
            .log_activity(Activity {
                event: ActivityEvent::SftpCreateDirectory,
                user: Some(self.user_uuid),
                ip: Some(self.user_ip),
                metadata: Some(json!({
                    "files": [self.server.filesystem.relative_path(path)],
                })),
                schedule: None,
                timestamp: chrono::Utc::now(),
            })
            .await;

        Ok(Status {
            id,
            status_code: StatusCode::Ok,
            error_message: "Ok".to_string(),
            language_tag: "en-US".to_string(),
        })
    }

    async fn rename(
        &mut self,
        id: u32,
        old_path: String,
        new_path: String,
    ) -> Result<Status, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        if self.state.config.system.sftp.read_only {
            return Err(StatusCode::PermissionDenied);
        }

        if !self.has_permission(Permission::FileUpdate).await {
            return Err(StatusCode::PermissionDenied);
        }

        let old_path = match self.server.filesystem.async_canonicalize(&old_path).await {
            Ok(path) => path,
            Err(_) => return Err(StatusCode::NoSuchFile),
        };
        let new_path = PathBuf::from(new_path);

        let old_metadata = match self
            .server
            .filesystem
            .async_symlink_metadata(&old_path)
            .await
        {
            Ok(metadata) => metadata,
            Err(_) => return Err(StatusCode::NoSuchFile),
        };

        if self
            .server
            .filesystem
            .async_symlink_metadata(&new_path)
            .await
            .is_ok()
            || self.is_ignored(&old_path, old_metadata.is_dir()).await
            || self.is_ignored(&new_path, old_metadata.is_dir()).await
        {
            return Err(StatusCode::Failure);
        }

        let activity = Activity {
            event: ActivityEvent::SftpRename,
            user: Some(self.user_uuid),
            ip: Some(self.user_ip),
            metadata: Some(json!({
                "files": [
                    {
                        "from": self.server.filesystem.relative_path(&old_path),
                        "to": self.server.filesystem.relative_path(&new_path),
                    }
                ],
            })),
            schedule: None,
            timestamp: chrono::Utc::now(),
        };

        if self
            .server
            .filesystem
            .rename_path(old_path, new_path)
            .await
            .is_err()
        {
            return Err(StatusCode::NoSuchFile);
        }

        self.server.activity.log_activity(activity).await;

        Ok(Status {
            id,
            status_code: StatusCode::Ok,
            error_message: "Ok".to_string(),
            language_tag: "en-US".to_string(),
        })
    }

    async fn setstat(
        &mut self,
        id: u32,
        path: String,
        attrs: FileAttributes,
    ) -> Result<Status, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        if self.state.config.system.sftp.read_only {
            return Err(StatusCode::PermissionDenied);
        }

        if !self.has_permission(Permission::FileUpdate).await {
            return Err(StatusCode::PermissionDenied);
        }

        let path = match self.server.filesystem.async_canonicalize(&path).await {
            Ok(path) => path,
            Err(_) => return Err(StatusCode::NoSuchFile),
        };

        let metadata = match self.server.filesystem.async_symlink_metadata(&path).await {
            Ok(metadata) => metadata,
            Err(_) => return Err(StatusCode::NoSuchFile),
        };

        if self.is_ignored(&path, metadata.is_dir()).await {
            return Err(StatusCode::NoSuchFile);
        }

        if let Some(permissions) = attrs.permissions {
            let permissions = cap_std::fs::Permissions::from_portable_mode(permissions);

            self.server
                .filesystem
                .async_set_permissions(&path, permissions)
                .await
                .map_err(|_| StatusCode::Failure)?;
        }

        Ok(Status {
            id,
            status_code: StatusCode::Ok,
            error_message: "Ok".to_string(),
            language_tag: "en-US".to_string(),
        })
    }

    async fn fsetstat(
        &mut self,
        id: u32,
        handle: String,
        attrs: FileAttributes,
    ) -> Result<Status, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        let handle = match self.handles.get(handle.as_str()) {
            Some(ServerHandle::File(handle)) => handle,
            _ => return Err(StatusCode::NoSuchFile),
        };

        self.setstat(id, handle.path.to_string_lossy().to_string(), attrs)
            .await
    }

    async fn stat(
        &mut self,
        id: u32,
        path: String,
    ) -> Result<russh_sftp::protocol::Attrs, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        if !self.has_permission(Permission::FileRead).await {
            return Err(StatusCode::PermissionDenied);
        }

        let path = match self.server.filesystem.async_canonicalize(&path).await {
            Ok(path) => path,
            Err(_) => return Err(StatusCode::NoSuchFile),
        };

        let metadata = match self.server.filesystem.async_metadata(&path).await {
            Ok(metadata) => metadata,
            Err(_) => return Err(StatusCode::NoSuchFile),
        };

        if self.is_ignored(&path, metadata.is_dir()).await {
            return Err(StatusCode::NoSuchFile);
        }

        let file = Self::convert_entry(&path, metadata, None);

        Ok(russh_sftp::protocol::Attrs {
            id,
            attrs: file.attrs,
        })
    }

    async fn fstat(
        &mut self,
        id: u32,
        handle: String,
    ) -> Result<russh_sftp::protocol::Attrs, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        let handle = match self.handles.get(handle.as_str()) {
            Some(handle) => handle,
            None => return Err(StatusCode::NoSuchFile),
        };

        self.stat(id, handle.path().to_string_lossy().to_string())
            .await
    }

    async fn lstat(
        &mut self,
        id: u32,
        path: String,
    ) -> Result<russh_sftp::protocol::Attrs, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        if !self.has_permission(Permission::FileRead).await {
            return Err(StatusCode::PermissionDenied);
        }

        let path = Path::new(&path);

        let metadata = match self.server.filesystem.async_symlink_metadata(&path).await {
            Ok(metadata) => metadata,
            Err(_) => return Err(StatusCode::NoSuchFile),
        };

        if self.is_ignored(path, metadata.is_dir()).await {
            return Err(StatusCode::NoSuchFile);
        }

        let target_metadata = if metadata.is_symlink() {
            self.server.filesystem.async_metadata(path).await.ok()
        } else {
            None
        };

        let file = Self::convert_entry(path, metadata, target_metadata);

        Ok(russh_sftp::protocol::Attrs {
            id,
            attrs: file.attrs,
        })
    }

    async fn readlink(&mut self, id: u32, path: String) -> Result<Name, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        if !self.has_permission(Permission::FileRead).await {
            return Err(StatusCode::PermissionDenied);
        }

        let path = match self.server.filesystem.async_read_link(&path).await {
            Ok(path) => path,
            Err(_) => return Err(StatusCode::NoSuchFile),
        };

        let metadata = match self.server.filesystem.async_symlink_metadata(&path).await {
            Ok(metadata) => metadata,
            Err(_) => return Err(StatusCode::NoSuchFile),
        };

        if self.is_ignored(&path, metadata.is_dir()).await {
            return Err(StatusCode::NoSuchFile);
        }

        let target_metadata = if metadata.is_symlink() {
            self.server.filesystem.async_metadata(&path).await.ok()
        } else {
            None
        };

        let file = Self::convert_entry(&path, metadata, target_metadata);

        Ok(Name {
            id,
            files: vec![file],
        })
    }

    async fn symlink(
        &mut self,
        id: u32,
        linkpath: String,
        targetpath: String,
    ) -> Result<Status, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        if self.state.config.system.sftp.read_only {
            return Err(StatusCode::PermissionDenied);
        }

        if !self.has_permission(Permission::FileCreate).await {
            return Err(StatusCode::PermissionDenied);
        }

        if linkpath == targetpath {
            return Err(StatusCode::NoSuchFile);
        }

        let linkpath = PathBuf::from(linkpath);
        let targetpath = match self.server.filesystem.async_canonicalize(&targetpath).await {
            Ok(path) => path,
            Err(_) => return Err(StatusCode::NoSuchFile),
        };

        let metadata = match self
            .server
            .filesystem
            .async_symlink_metadata(&targetpath)
            .await
        {
            Ok(metadata) => metadata,
            Err(_) => return Err(StatusCode::NoSuchFile),
        };

        if !metadata.is_file()
            || self.is_ignored(&targetpath, metadata.is_dir()).await
            || self.is_ignored(&linkpath, false).await
        {
            return Err(StatusCode::NoSuchFile);
        }

        if self
            .server
            .filesystem
            .async_symlink(&targetpath, &linkpath)
            .await
            .is_err()
        {
            return Err(StatusCode::Failure);
        }

        self.server
            .activity
            .log_activity(Activity {
                event: ActivityEvent::SftpCreate,
                user: Some(self.user_uuid),
                ip: Some(self.user_ip),
                metadata: Some(json!({
                    "files": [self.server.filesystem.relative_path(&linkpath)],
                })),
                schedule: None,
                timestamp: chrono::Utc::now(),
            })
            .await;

        Ok(Status {
            id,
            status_code: StatusCode::Ok,
            error_message: "Ok".to_string(),
            language_tag: "en-US".to_string(),
        })
    }

    async fn open(
        &mut self,
        id: u32,
        filename: String,
        pflags: russh_sftp::protocol::OpenFlags,
        _attrs: FileAttributes,
    ) -> Result<Handle, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        if self.handles.len() >= HANDLE_LIMIT {
            return Err(StatusCode::Failure);
        }

        if (pflags.contains(OpenFlags::WRITE) || pflags.contains(OpenFlags::APPEND))
            && !self.has_permission(Permission::FileUpdate).await
        {
            return Err(StatusCode::PermissionDenied);
        }
        if pflags.contains(OpenFlags::CREATE) && !self.has_permission(Permission::FileCreate).await
        {
            return Err(StatusCode::PermissionDenied);
        }
        if pflags.contains(OpenFlags::TRUNCATE)
            && !self.has_permission(Permission::FileDelete).await
        {
            return Err(StatusCode::PermissionDenied);
        }
        if pflags.contains(OpenFlags::READ)
            && !self.has_permission(Permission::FileReadContent).await
        {
            return Err(StatusCode::PermissionDenied);
        }

        let path = match self.server.filesystem.async_canonicalize(&filename).await {
            Ok(path) => path,
            Err(_) => PathBuf::from(filename.strip_prefix("/").unwrap_or(&filename)),
        };

        match self.server.filesystem.async_symlink_metadata(&path).await {
            Ok(metadata) => {
                if !metadata.is_file() {
                    return Err(StatusCode::NoSuchFile);
                }
            }
            Err(_) => {
                if !pflags.contains(OpenFlags::CREATE) {
                    return Err(StatusCode::NoSuchFile);
                }
            }
        }

        if self.is_ignored(&path, false).await {
            return Err(StatusCode::NoSuchFile);
        }

        let mut activity_event = None;
        if pflags.contains(OpenFlags::TRUNCATE) || pflags.contains(OpenFlags::CREATE) {
            activity_event = Some(ActivityEvent::SftpCreate);
        } else if pflags.contains(OpenFlags::WRITE) || pflags.contains(OpenFlags::APPEND) {
            activity_event = Some(ActivityEvent::SftpWrite);
        } else if pflags.contains(OpenFlags::READ)
            && self.state.config.system.sftp.activity.log_file_reads
        {
            activity_event = Some(ActivityEvent::SftpRead);
        }

        let file = tokio::task::spawn_blocking({
            let server = self.server.clone();
            let path = path.clone();

            move || {
                let mut open_options = OpenOptions::new();
                if pflags.contains(OpenFlags::READ) {
                    open_options.read(true);
                }
                if pflags.contains(OpenFlags::WRITE) {
                    open_options.write(true);
                }
                if pflags.contains(OpenFlags::APPEND) {
                    open_options.append(true);
                }
                if pflags.contains(OpenFlags::CREATE) {
                    if pflags.contains(OpenFlags::EXCLUDE) {
                        open_options.create_new(true);
                    } else {
                        open_options.create(true);
                    }
                }
                if pflags.contains(OpenFlags::TRUNCATE) {
                    open_options.truncate(true);
                }

                server.filesystem.open_with(path, open_options)
            }
        })
        .await
        .map_err(|_| StatusCode::Failure)?
        .map_err(|_| StatusCode::Failure)?;

        let path_components = self.server.filesystem.path_to_components(&path);

        if let Some(event) = activity_event {
            self.server
                .activity
                .log_activity(Activity {
                    event,
                    user: Some(self.user_uuid),
                    ip: Some(self.user_ip),
                    metadata: Some(json!({
                        "files": [self.server.filesystem.relative_path(&path)],
                    })),
                    schedule: None,
                    timestamp: chrono::Utc::now(),
                })
                .await;
        }

        let handle = self.next_handle_id();

        self.handles.insert(
            handle.clone(),
            ServerHandle::File(FileHandle {
                path,
                path_components,
                file: Arc::new(RwLock::new(file)),
            }),
        );

        Ok(Handle {
            id,
            handle: handle.into(),
        })
    }

    async fn read(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        len: u32,
    ) -> Result<russh_sftp::protocol::Data, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        let handle = match self.handles.get_mut(handle.as_str()) {
            Some(ServerHandle::File(handle)) => handle,
            _ => return Err(StatusCode::NoSuchFile),
        };

        let data = tokio::task::spawn_blocking({
            let file = Arc::clone(&handle.file);

            move || -> Result<Vec<u8>, std::io::Error> {
                let mut data = vec![0; len.min(256 * 1024) as usize];
                let bytes_read = file.read().unwrap().read_at(offset, &mut data)?;

                data.truncate(bytes_read);
                data.shrink_to_fit();
                Ok(data)
            }
        })
        .await
        .map_err(|_| StatusCode::Failure)?
        .map_err(|_| StatusCode::Failure)?;

        if data.is_empty() {
            return Err(StatusCode::Eof);
        }

        Ok(Data { id, data })
    }

    async fn write(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        data: Vec<u8>,
    ) -> Result<Status, Self::Error> {
        if !self.allow_action().await {
            return Err(StatusCode::PermissionDenied);
        }

        let handle = match self.handles.get_mut(handle.as_str()) {
            Some(ServerHandle::File(handle)) => handle,
            _ => return Err(StatusCode::NoSuchFile),
        };

        if self.state.config.system.sftp.read_only {
            return Err(StatusCode::PermissionDenied);
        }

        if !self
            .server
            .filesystem
            .async_allocate_in_path_iterator(
                &handle.path_components[0..handle.path_components.len() - 1],
                data.len() as i64,
                false,
            )
            .await
        {
            return Err(StatusCode::Failure);
        }

        tokio::task::spawn_blocking({
            let file = Arc::clone(&handle.file);

            move || file.write().unwrap().write_all_at(offset, &data)
        })
        .await
        .map_err(|_| StatusCode::Failure)?
        .map_err(|_| StatusCode::Failure)?;

        Ok(Status {
            id,
            status_code: StatusCode::Ok,
            error_message: "Ok".to_string(),
            language_tag: "en-US".to_string(),
        })
    }

    async fn extended(
        &mut self,
        id: u32,
        command: String,
        data: Vec<u8>,
    ) -> Result<russh_sftp::protocol::Packet, Self::Error> {
        extended::handle_extended(self, id, command, data).await
    }
}
