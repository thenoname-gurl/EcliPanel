use notify::Watcher;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::sync::Mutex;

type ServerNotifiers = Arc<Mutex<HashMap<uuid::Uuid, InotifyServerNotifier>>>;

pub struct InotifyManager {
    watcher: Arc<std::sync::Mutex<notify::RecommendedWatcher>>,
    server_notifiers: ServerNotifiers,
}

impl InotifyManager {
    pub fn new() -> Result<Self, notify::Error> {
        let server_notifiers: ServerNotifiers = Arc::new(Mutex::new(HashMap::new()));

        let watcher = notify::RecommendedWatcher::new(
            {
                let server_notifiers = Arc::clone(&server_notifiers);

                move |res: Result<notify::Event, notify::Error>| {
                    if let Ok(event) = res {
                        if event.kind.is_access() || event.kind.is_other() {
                            return;
                        }

                        for path in event.paths {
                            let notifier = {
                                let notifiers = server_notifiers.blocking_lock();
                                notifiers
                                    .values()
                                    .find(|n| path.starts_with(&n.path))
                                    .cloned()
                            };
                            if let Some(notifier) = notifier {
                                notifier.add_path(path);
                            }
                        }
                    }
                }
            },
            notify::Config::default().with_follow_symlinks(false),
        )?;

        Ok(Self {
            watcher: Arc::new(std::sync::Mutex::new(watcher)),
            server_notifiers,
        })
    }

    pub async fn register_server(
        &self,
        base_path: &Path,
        uuid: uuid::Uuid,
    ) -> Result<InotifyServerNotifier, anyhow::Error> {
        let base_path = tokio::task::spawn_blocking({
            let base_path = base_path.to_path_buf();
            let watcher = Arc::clone(&self.watcher);

            move || {
                watcher
                    .lock()
                    .unwrap()
                    .watch(&base_path, notify::RecursiveMode::Recursive)?;
                Ok::<_, anyhow::Error>(base_path)
            }
        })
        .await??;

        let notifier = InotifyServerNotifier::new(base_path);
        self.server_notifiers
            .lock()
            .await
            .insert(uuid, notifier.clone());

        Ok(notifier)
    }

    pub async fn register_server_with_notifier(
        &self,
        notifier: InotifyServerNotifier,
        uuid: uuid::Uuid,
    ) -> Result<(), anyhow::Error> {
        let base_path = notifier.path.clone();
        let watcher = Arc::clone(&self.watcher);

        tokio::task::spawn_blocking(move || {
            watcher
                .lock()
                .unwrap()
                .watch(&base_path, notify::RecursiveMode::Recursive)?;
            Ok::<_, anyhow::Error>(())
        })
        .await??;

        self.server_notifiers.lock().await.insert(uuid, notifier);

        Ok(())
    }

    pub async fn unregister_server(&self, uuid: uuid::Uuid) {
        if let Some(notifier) = self.server_notifiers.lock().await.remove(&uuid) {
            crate::spawn_blocking_handled({
                let path = notifier.path.clone();
                let watcher = Arc::clone(&self.watcher);

                move || watcher.lock().unwrap().unwatch(&path)
            });
        }
    }
}

#[derive(Clone)]
pub struct InotifyServerNotifier {
    path: PathBuf,
    modified_paths: Arc<Mutex<Vec<PathBuf>>>,
}

impl InotifyServerNotifier {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path: path.clone(),
            modified_paths: Arc::new(Mutex::new(vec![path])),
        }
    }

    fn add_path(&self, path: PathBuf) {
        const MAX_PATHS_BEFORE_DEDUP: usize = 512;

        let mut paths = self.modified_paths.blocking_lock();
        if paths.first() == Some(&self.path) {
            return;
        }

        paths.push(path);

        if paths.len() >= MAX_PATHS_BEFORE_DEDUP {
            *paths = crate::utils::deduplicate_paths(std::mem::take(&mut *paths));
        }

        if paths.len() >= MAX_PATHS_BEFORE_DEDUP {
            // still too many paths, just keep the base path
            *paths = vec![self.path.clone()];
        }
    }

    pub async fn clear_modified_paths(&self) {
        let mut paths = self.modified_paths.lock().await;
        paths.clear();
    }

    pub async fn take_modified_paths(&self) -> Vec<PathBuf> {
        let mut paths = self.modified_paths.lock().await;
        crate::utils::deduplicate_paths(std::mem::take(&mut *paths))
    }
}
