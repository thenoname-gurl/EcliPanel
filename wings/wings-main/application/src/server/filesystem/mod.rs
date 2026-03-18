use crate::{
    io::counting_reader::AsyncCountingReader,
    routes::MimeCacheValue,
    server::filesystem::virtualfs::{
        DirectoryStreamWalkFn, VirtualReadableFilesystem, VirtualWritableFilesystem,
    },
    utils::{PortableModeExt, PortableSizeExt},
};
use cap_std::fs::Metadata;
use compact_str::ToCompactString;
use std::{
    collections::{HashMap, HashSet},
    fmt::Debug,
    hint::unreachable_unchecked,
    ops::Deref,
    os::fd::AsFd,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering},
    },
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{RwLock, RwLockReadGuard},
};

pub mod archive;
pub mod cap;
pub mod inotify;
pub mod limiter;
pub mod operations;
pub mod pull;
pub mod usage;
pub mod virtualfs;
pub mod writer;

#[inline]
pub fn encode_mode(mode: u32) -> compact_str::CompactString {
    let mut mode_str = compact_str::CompactString::default();

    mode_str.push(match rustix::fs::FileType::from_raw_mode(mode) {
        rustix::fs::FileType::RegularFile => '-',
        rustix::fs::FileType::Directory => 'd',
        rustix::fs::FileType::Symlink => 'l',
        rustix::fs::FileType::BlockDevice => 'b',
        rustix::fs::FileType::CharacterDevice => 'c',
        rustix::fs::FileType::Socket => 's',
        rustix::fs::FileType::Fifo => 'p',
        rustix::fs::FileType::Unknown => '?',
    });

    for i in 0u8..9 {
        if mode & (1 << (8 - i)) != 0 {
            mode_str.push(match i.rem_euclid(3) {
                0 => 'r',
                1 => 'w',
                2 => 'x',
                _ => unsafe { unreachable_unchecked() },
            });
        } else {
            mode_str.push('-');
        }
    }

    mode_str
}

pub struct Filesystem {
    uuid: uuid::Uuid,
    app_state: crate::routes::State,

    disk_checker_rescan: Arc<tokio::sync::Notify>,
    pub disk_checker_state_dirty: Arc<AtomicBool>,
    disk_checker: tokio::task::JoinHandle<()>,
    config: Arc<crate::config::Config>,

    pub base_path: PathBuf,
    base_fs_mount_path: RwLock<PathBuf>,
    cap_filesystem: cap::CapFilesystem,
    server_notifier: inotify::InotifyServerNotifier,
    use_server_notifier: Arc<AtomicBool>,

    disk_limit: AtomicI64,
    disk_usage_delta_cached: Arc<AtomicI64>,
    disk_usage_cached_logical: Arc<AtomicU64>,
    disk_usage_cached_physical: Arc<AtomicU64>,
    pub disk_usage: Arc<RwLock<usage::DiskUsage>>,
    disk_ignored: Arc<RwLock<ignore::gitignore::Gitignore>>,

    pub archive_fs_cache: moka::future::Cache<PathBuf, Arc<dyn VirtualReadableFilesystem>>,
    pub pulls: RwLock<HashMap<uuid::Uuid, Arc<RwLock<pull::Download>>>>,
    pub operations: operations::OperationManager,
}

impl Filesystem {
    pub fn new(
        uuid: uuid::Uuid,
        app_state: crate::routes::State,
        disk_limit: u64,
        sender: tokio::sync::broadcast::Sender<crate::server::websocket::WebsocketMessage>,
        config: Arc<crate::config::Config>,
        deny_list: &[compact_str::CompactString],
    ) -> Self {
        let base_path = config.data_path(uuid);

        let disk_checker_state_dirty = Arc::new(AtomicBool::new(true));

        let disk_usage = Arc::new(RwLock::new(usage::DiskUsage::default()));
        let disk_usage_cached_logical = Arc::new(AtomicU64::new(0));
        let disk_usage_cached_physical = Arc::new(AtomicU64::new(0));
        let mut disk_ignored = ignore::gitignore::GitignoreBuilder::new("/");

        for entry in deny_list {
            disk_ignored.add_line(None, entry).ok();
        }

        let cap_filesystem = cap::CapFilesystem::new_uninitialized(base_path.clone());
        let server_notifier = inotify::InotifyServerNotifier::new(base_path.clone());
        let use_server_notifier = Arc::new(AtomicBool::new(false));
        let disk_checker_rescan = Arc::new(tokio::sync::Notify::new());

        Self {
            uuid,
            app_state,
            disk_checker_rescan: Arc::clone(&disk_checker_rescan),
            disk_checker_state_dirty: Arc::clone(&disk_checker_state_dirty),
            disk_checker: tokio::spawn({
                let config = Arc::clone(&config);
                let disk_usage = Arc::clone(&disk_usage);
                let disk_usage_cached_logical = Arc::clone(&disk_usage_cached_logical);
                let disk_usage_cached_physical = Arc::clone(&disk_usage_cached_physical);
                let cap_filesystem = cap_filesystem.clone();
                let server_notifier = server_notifier.clone();
                let use_server_notifier = Arc::clone(&use_server_notifier);

                async move {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;

                    loop {
                        let run_inner = async |paths_to_scan: Option<Vec<PathBuf>>| -> Result<(), anyhow::Error> {
                            tracing::debug!(
                                path = %cap_filesystem.base_path.display(),
                                "checking disk usage"
                            );

                            'selective_scan: {
                                if let Some(modified_paths) = paths_to_scan {
                                    if modified_paths.is_empty() {
                                        tracing::debug!(
                                            path = %cap_filesystem.base_path.display(),
                                            "skipping disk usage check, no modified paths"
                                        );
                                        return Ok(());
                                    }

                                    let mut dirs_to_scan = Vec::new();
                                    for modified_path in &modified_paths {
                                        let relative = match modified_path.strip_prefix(&*cap_filesystem.base_path) {
                                            Ok(relative) => relative,
                                            Err(_) => continue,
                                        };

                                        let dir = match cap_filesystem.async_symlink_metadata(relative).await {
                                            Ok(metadata) if metadata.is_dir() => relative.to_path_buf(),
                                            Ok(_) => match relative.parent() {
                                                Some(relative) => relative.to_path_buf(),
                                                None => continue,
                                            },
                                            Err(_) => {
                                                let mut parent = relative;
                                                loop {
                                                    parent = match parent.parent() {
                                                        Some(p) => p,
                                                        None => break,
                                                    };

                                                    match cap_filesystem.async_symlink_metadata(parent).await {
                                                        Ok(metadata) if metadata.is_dir() => {
                                                            dirs_to_scan.push(parent.to_path_buf());
                                                            break;
                                                        }
                                                        _ => continue,
                                                    }
                                                }

                                                parent.to_path_buf()
                                            }
                                        };

                                        dirs_to_scan.push(dir);
                                    }

                                    let dirs_to_scan = crate::utils::deduplicate_paths(dirs_to_scan);

                                    if dirs_to_scan.first().is_some_and(|p| p == Path::new("")) {
                                        break 'selective_scan;
                                    }

                                    tracing::debug!(
                                        path = %cap_filesystem.base_path.display(),
                                        "checking disk usage for {} modified directories: {:?}",
                                        dirs_to_scan.len(),
                                        dirs_to_scan
                                    );

                                    for dir in &dirs_to_scan {
                                        let mut tmp_disk_usage = usage::DiskUsage::default();
                                        let mut seen_inodes = HashSet::new();

                                        let mut walker = cap_filesystem.async_walk_dir(dir).await?;
                                        while let Some(entry) = walker.next_entry().await {
                                            let (_, path) = entry?;
                                            let metadata = match cap_filesystem.async_symlink_metadata(&path).await {
                                                Ok(metadata) => metadata,
                                                Err(_) => continue,
                                            };
                                            let delta = usage::SpaceDelta::new(metadata.size_logical() as i64, metadata.size_physical() as i64);

                                            let relative = match path.strip_prefix(dir) {
                                                Ok(relative) => relative,
                                                Err(_) => continue,
                                            };

                                            #[cfg(unix)]
                                            {
                                                use cap_std::fs::MetadataExt;

                                                if !metadata.is_dir() && metadata.nlink() > 1 {
                                                    if seen_inodes.contains(&metadata.ino()) {
                                                        if let Some(parent) = relative.parent() {
                                                            tmp_disk_usage
                                                                .update_size(parent, usage::SpaceDelta::only_logical(delta.logical));
                                                        }
                                                        continue;
                                                    } else {
                                                        seen_inodes.insert(metadata.ino());
                                                    }
                                                }
                                            }

                                            if metadata.is_dir() {
                                                tmp_disk_usage.update_size(relative, delta);
                                            } else if let Some(parent) = relative.parent() {
                                                tmp_disk_usage.update_size(parent, delta);
                                            }
                                        }

                                        let mut disk_usage_write = disk_usage.write().await;
                                        disk_usage_write.remove_path(dir);
                                        disk_usage_write.add_directory(
                                            &dir.components()
                                                .map(|c| c.as_os_str().to_string_lossy().to_string())
                                                .collect::<Vec<_>>(),
                                            tmp_disk_usage
                                        );
                                        let root_space = disk_usage_write.space;
                                        drop(disk_usage_write);

                                        disk_usage_cached_logical.store(root_space.get_logical(), Ordering::Relaxed);
                                        disk_usage_cached_physical.store(root_space.get_physical(), Ordering::Relaxed);
                                    }

                                    return Ok(());
                                }
                            }

                            let mut tmp_disk_usage = usage::DiskUsage::default();
                            let mut seen_inodes = HashSet::new();
                            let mut total_entries = 0;
                            let mut total_size = 0;
                            let mut total_size_physical = 0;

                            let mut walker = cap_filesystem.async_walk_dir(Path::new("")).await?;

                            while let Some(entry) = walker.next_entry().await {
                                let (_, path) = entry?;

                                let metadata = match cap_filesystem.async_symlink_metadata(&path).await {
                                    Ok(metadata) => metadata,
                                    Err(_) => return Ok(()),
                                };
                                let delta = usage::SpaceDelta::new(metadata.size_logical() as i64, metadata.size_physical() as i64);

                                total_entries += 1;

                                #[cfg(unix)]
                                {
                                    use cap_std::fs::MetadataExt;

                                    if !metadata.is_dir() && metadata.nlink() > 1 {
                                        if seen_inodes.contains(&metadata.ino()) {
                                            if let Some(parent) = path.parent() {
                                                tmp_disk_usage
                                                    .update_size(parent, usage::SpaceDelta::only_logical(delta.logical));
                                            }
                                            total_size += metadata.size_logical();
                                            continue;
                                        } else {
                                            seen_inodes.insert(metadata.ino());
                                        }
                                    }
                                }

                                if metadata.is_dir() {
                                    tmp_disk_usage.update_size(&path, delta);
                                } else if let Some(parent) = path.parent() {
                                    tmp_disk_usage.update_size(parent, delta);
                                }

                                total_size += metadata.size_logical();
                                total_size_physical += metadata.size_physical();
                            }

                            *disk_usage.write().await = tmp_disk_usage;
                            disk_usage_cached_logical.store(total_size, Ordering::Relaxed);
                            disk_usage_cached_physical.store(total_size_physical, Ordering::Relaxed);

                            tracing::debug!(
                                path = %cap_filesystem.base_path.display(),
                                total_entries = total_entries,
                                "{} bytes disk usage",
                                total_size
                            );

                            Ok(())
                        };

                        if !disk_checker_state_dirty.swap(false, Ordering::Relaxed) {
                            tracing::debug!(
                                "skipping disk usage check due to server state inactivity"
                            );
                        } else {
                            let paths_to_scan = if use_server_notifier.load(Ordering::Relaxed) {
                                let paths = server_notifier.take_modified_paths().await;

                                tracing::debug!(
                                    path = %cap_filesystem.base_path.display(),
                                    "checking disk usage for {} modified paths",
                                    paths.len()
                                );
                                Some(paths)
                            } else {
                                None
                            };

                            match run_inner(paths_to_scan).await {
                                Ok(_) => {
                                    tracing::debug!(
                                        path = %cap_filesystem.base_path.display(),
                                        "disk usage check completed successfully"
                                    );
                                }
                                Err(err) => {
                                    tracing::error!(
                                        path = %cap_filesystem.base_path.display(),
                                        "disk usage check failed: {}",
                                        err
                                    );
                                }
                            }
                        }

                        tokio::select! {
                            _ = tokio::time::sleep(std::time::Duration::from_secs(
                                config.system.disk_check_interval,
                            )) => {},
                            _ = disk_checker_rescan.notified() => {
                                server_notifier.clear_modified_paths().await;
                            }
                        }
                    }
                }
            }),
            config: Arc::clone(&config),

            base_path: base_path.clone(),
            base_fs_mount_path: RwLock::new(base_path),
            cap_filesystem,
            server_notifier,
            use_server_notifier,

            disk_limit: AtomicI64::new(disk_limit as i64),
            disk_usage_delta_cached: Arc::new(AtomicI64::new(0)),
            disk_usage_cached_logical,
            disk_usage_cached_physical,
            disk_usage,
            disk_ignored: Arc::new(RwLock::new(disk_ignored.build().unwrap())),

            archive_fs_cache: moka::future::CacheBuilder::new(8)
                .time_to_idle(std::time::Duration::from_mins(1))
                .build(),
            pulls: RwLock::new(HashMap::new()),
            operations: operations::OperationManager::new(sender),
        }
    }

    #[inline]
    pub fn get_logical_cached_size(&self) -> u64 {
        self.disk_usage_cached_logical.load(Ordering::Relaxed)
    }

    #[inline]
    pub fn get_physical_cached_size(&self) -> u64 {
        self.disk_usage_cached_logical.load(Ordering::Relaxed)
    }

    #[inline]
    pub async fn rerun_disk_checker(&self) {
        self.server_notifier.clear_modified_paths().await;
        self.disk_checker_rescan.notify_one();
    }

    pub async fn update_ignored(&self, deny_list: &[impl AsRef<str>]) {
        let mut disk_ignored = ignore::gitignore::GitignoreBuilder::new("");
        for entry in deny_list {
            disk_ignored.add_line(None, entry.as_ref()).ok();
        }

        *self.disk_ignored.write().await = disk_ignored.build().unwrap();
    }

    pub async fn is_ignored(&self, path: &Path, is_dir: bool) -> bool {
        self.disk_ignored
            .read()
            .await
            .matched(path, is_dir)
            .is_ignore()
    }

    pub async fn get_ignored(&self) -> ignore::gitignore::Gitignore {
        self.disk_ignored.read().await.clone()
    }

    pub fn is_ignored_sync(&self, path: &Path, is_dir: bool) -> bool {
        self.disk_ignored
            .blocking_read()
            .matched(path, is_dir)
            .is_ignore()
    }

    pub async fn pulls(
        &self,
    ) -> RwLockReadGuard<'_, HashMap<uuid::Uuid, Arc<RwLock<pull::Download>>>> {
        if let Ok(mut pulls) = self.pulls.try_write() {
            let operations = self.operations.operations().await;

            for key in pulls.keys().copied().collect::<Vec<_>>() {
                if !operations.contains_key(&key) {
                    pulls.remove(&key);
                }
            }
        }

        self.pulls.read().await
    }

    #[inline]
    pub fn get_disk_limiter<'a>(&'a self) -> Box<dyn limiter::DiskLimiterExt + 'a> {
        self.config.system.disk_limiter_mode.get_limiter(self)
    }

    #[inline]
    pub async fn limiter_usage(&self) -> u64 {
        self.get_disk_limiter()
            .disk_usage()
            .await
            .unwrap_or_else(|_| self.get_physical_cached_size())
    }

    #[inline]
    pub async fn update_disk_limit(&self, limit: u64) {
        self.disk_limit.store(limit as i64, Ordering::Relaxed);

        if let Err(err) = self.get_disk_limiter().update_disk_limit(limit).await {
            tracing::warn!("failed to update disk limit: {:?}", err);
        }
    }

    /// Sets the base fs path, this is the path used by the container filesystem
    /// It may differ from the base_path for some disk limiters.
    ///
    /// DO NOT CALL THIS FUNCTION UNLESS YOU KNOW WHAT YOU ARE DOING
    pub async fn set_base_fs_mount_path(&self, path: PathBuf) -> Result<(), std::io::Error> {
        let mut base_fs_path = self.base_fs_mount_path.write().await;
        if *base_fs_path == path {
            return Ok(());
        }
        *base_fs_path = path;

        Ok(())
    }

    /// Returns the base fs path, this is the path used by the container filesystem
    /// It may differ from the base_path for some disk limiters
    pub async fn get_base_fs_mount_path(&self) -> PathBuf {
        self.base_fs_mount_path.read().await.clone()
    }

    #[inline]
    pub fn disk_limit(&self) -> i64 {
        self.disk_limit.load(Ordering::Relaxed)
    }

    #[inline]
    pub async fn is_full(&self) -> bool {
        self.disk_limit() != 0 && self.limiter_usage().await >= self.disk_limit() as u64
    }

    #[inline]
    pub fn base(&self) -> compact_str::CompactString {
        self.base_path.to_string_lossy().to_compact_string()
    }

    #[inline]
    pub fn path_to_components(&self, path: &Path) -> Vec<String> {
        self.relative_path(path)
            .components()
            .map(|c| c.as_os_str().to_string_lossy().to_string())
            .collect()
    }

    pub async fn resolve_readable_fs(
        &self,
        server: &crate::server::Server,
        path: &Path,
    ) -> (PathBuf, Arc<dyn VirtualReadableFilesystem>) {
        let path = self.relative_path(path);

        'backupfs: {
            if !self.config.system.backups.mounting.enabled {
                break 'backupfs;
            }

            if !path.starts_with(&self.config.system.backups.mounting.path) {
                break 'backupfs;
            }

            let backup_path = match path.strip_prefix(&self.config.system.backups.mounting.path) {
                Ok(p) => p,
                Err(_) => break 'backupfs,
            };
            let uuid: uuid::Uuid = match backup_path
                .components()
                .next()
                .and_then(|c| c.as_os_str().to_string_lossy().parse().ok())
            {
                Some(u) => u,
                None => break 'backupfs,
            };

            if !server.configuration.read().await.backups.contains(&uuid) {
                break 'backupfs;
            }

            match self.app_state.backup_manager.browse(server, uuid).await {
                Ok(Some(backup)) => {
                    let path = match backup_path.strip_prefix(uuid.to_string()) {
                        Ok(p) => p.to_path_buf(),
                        Err(_) => PathBuf::new(),
                    };

                    return (path, backup);
                }
                Ok(None) => break 'backupfs,
                Err(err) => {
                    tracing::error!(server = %server.uuid, backup = %uuid, "failed to find backup: {:?}", err);
                    break 'backupfs;
                }
            }
        }

        'archivefs: {
            let mut archive_path = PathBuf::new();
            let mut found = false;
            for component in path.components() {
                let Some(component_str) = component.as_os_str().to_str() else {
                    break 'archivefs;
                };

                archive_path.push(component);

                if component_str.ends_with(".zip")
                    || component_str.ends_with(".7z")
                    || component_str.ends_with(".ddup")
                {
                    found = true;
                    break;
                }
            }

            if !found || archive_path == PathBuf::new() {
                break 'archivefs;
            }

            let inner_path = match path.strip_prefix(&archive_path) {
                Ok(p) => p,
                Err(_) => break 'archivefs,
            };

            if self
                .async_metadata(&archive_path)
                .await
                .ok()
                .is_none_or(|m| !m.is_file())
            {
                break 'archivefs;
            }

            if let Some(archive_fs) = self.archive_fs_cache.get(&archive_path).await {
                return (inner_path.to_path_buf(), archive_fs);
            }

            let archive_fs: Arc<dyn VirtualReadableFilesystem> =
                match archive_path.extension().and_then(|ext| ext.to_str()) {
                    Some("zip") => {
                        match virtualfs::archive::zip::VirtualZipArchive::open(
                            server.clone(),
                            &archive_path,
                        )
                        .await
                        {
                            Ok(archive) => Arc::new(archive),
                            Err(err) => {
                                tracing::error!(
                                    "failed to open archivefs zip archive {}: {:?}",
                                    archive_path.display(),
                                    err
                                );
                                break 'archivefs;
                            }
                        }
                    }
                    Some("7z") => {
                        match virtualfs::archive::seven_zip::VirtualSevenZipArchive::open(
                            server.clone(),
                            &archive_path,
                        )
                        .await
                        {
                            Ok(archive) => Arc::new(archive),
                            Err(err) => {
                                tracing::error!(
                                    "failed to open archivefs 7z archive {}: {:?}",
                                    archive_path.display(),
                                    err
                                );
                                break 'archivefs;
                            }
                        }
                    }
                    Some("ddup") => {
                        match virtualfs::archive::ddup_bak::VirtualDdupBakArchive::open(
                            server.clone(),
                            &archive_path,
                        )
                        .await
                        {
                            Ok(archive) => Arc::new(archive),
                            Err(err) => {
                                tracing::error!(
                                    "failed to open archivefs ddup archive {}: {:?}",
                                    archive_path.display(),
                                    err
                                );
                                break 'archivefs;
                            }
                        }
                    }
                    _ => break 'archivefs,
                };

            self.archive_fs_cache
                .insert(archive_path, archive_fs.clone())
                .await;

            return (inner_path.to_path_buf(), archive_fs);
        }

        let mut fs = self.cap_filesystem.get_virtual(server.clone());
        fs.is_primary_server_fs = true;
        fs.is_writable = true;

        (path, Arc::new(fs))
    }

    pub async fn resolve_writable_fs(
        &self,
        server: &crate::server::Server,
        path: impl AsRef<Path>,
    ) -> (PathBuf, Arc<dyn VirtualWritableFilesystem>) {
        let mut fs = self.cap_filesystem.get_virtual(server.clone());
        fs.is_primary_server_fs = true;
        fs.is_writable = true;

        (self.relative_path(path.as_ref()), Arc::new(fs))
    }

    pub async fn truncate_path(&self, path: impl AsRef<Path>) -> Result<(), anyhow::Error> {
        let path = self.relative_path(path.as_ref());

        let metadata = self.async_symlink_metadata(&path).await?;

        let size = if metadata.is_dir() {
            let disk_usage = self.disk_usage.read().await;
            disk_usage.get_size(&path).map_or(0, |s| s.get_logical())
        } else {
            metadata.len()
        };

        self.async_allocate_in_path(&path, -(size as i64), false)
            .await;

        if metadata.is_dir() {
            let mut disk_usage = self.disk_usage.write().await;
            disk_usage.remove_path(&path);
        }

        if metadata.is_dir() {
            self.async_remove_dir_all(path).await?;
        } else {
            self.async_remove_file(path).await?;
        }

        Ok(())
    }

    pub async fn rename_path(
        &self,
        old_path: impl AsRef<Path>,
        new_path: impl AsRef<Path>,
    ) -> Result<(), anyhow::Error> {
        let old_path = self.relative_path(old_path.as_ref());
        let new_path = self.relative_path(new_path.as_ref());

        if let Some(parent) = new_path.parent() {
            self.async_create_dir_all(parent).await?;
        }

        let metadata = self.async_metadata(&old_path).await?;
        let is_dir = metadata.is_dir();

        let old_parent = self
            .async_canonicalize(match old_path.parent() {
                Some(parent) => parent,
                None => return Err(anyhow::anyhow!("failed to get old path parent")),
            })
            .await
            .unwrap_or_default();
        let new_parent = self
            .async_canonicalize(match new_path.parent() {
                Some(parent) => parent,
                None => return Err(anyhow::anyhow!("failed to get new path parent")),
            })
            .await
            .unwrap_or_default();

        let abs_new_path = new_parent.join(match new_path.file_name() {
            Some(name) => name,
            None => return Err(anyhow::anyhow!("failed to get new path file name")),
        });

        if is_dir {
            let mut disk_usage = self.disk_usage.write().await;

            let path = disk_usage.remove_path(&old_path);
            if let Some(path) = path {
                disk_usage.add_directory(
                    &abs_new_path
                        .components()
                        .map(|c| c.as_os_str().to_string_lossy().to_string())
                        .collect::<Vec<_>>(),
                    path,
                );
            }
        } else {
            let size = metadata.len() as i64;

            self.async_allocate_in_path(&old_parent, -size, true).await;
            self.async_allocate_in_path(&new_parent, size, true).await;
        }

        self.async_rename(old_path, &self.cap_filesystem, new_path)
            .await?;

        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn copy_path(
        &self,
        progress: Arc<AtomicU64>,
        server: &crate::server::Server,
        metadata: virtualfs::FileMetadata,
        path: PathBuf,
        filesystem: Arc<dyn VirtualReadableFilesystem>,
        destination_path: PathBuf,
        destination_filesystem: Arc<dyn VirtualWritableFilesystem>,
    ) -> Result<(), anyhow::Error> {
        if metadata.file_type.is_file() {
            if filesystem.is_primary_server_fs() && destination_filesystem.is_primary_server_fs() {
                server
                    .filesystem
                    .async_quota_copy(&path, &destination_path, server, Some(&progress))
                    .await?;
                destination_filesystem
                    .async_set_permissions(&destination_path, metadata.permissions)
                    .await?;
            } else {
                let file_read = filesystem.async_read_file(&path, None).await?;
                let mut reader = AsyncCountingReader::new_with_bytes_read(
                    file_read.reader,
                    Arc::clone(&progress),
                );

                let mut writer = destination_filesystem
                    .async_create_file(&destination_path)
                    .await?;
                destination_filesystem
                    .async_set_permissions(&destination_path, metadata.permissions)
                    .await?;

                tokio::io::copy(&mut reader, &mut writer).await?;
                writer.shutdown().await?;
            }
        } else {
            let ignored = server.filesystem.get_ignored().await;
            let mut walker = filesystem
                .async_walk_dir_stream(&path, ignored.into())
                .await?;

            walker
                .run_multithreaded(
                    server.app_state.config.api.file_copy_threads,
                    DirectoryStreamWalkFn::from({
                        let server = server.clone();
                        let filesystem = filesystem.clone();
                        let source_path = Arc::new(path);
                        let destination_path = Arc::new(destination_path);
                        let destination_filesystem = destination_filesystem.clone();
                        let progress = Arc::clone(&progress);

                        move |_, path: PathBuf, stream| {
                            let server = server.clone();
                            let filesystem = filesystem.clone();
                            let source_path = Arc::clone(&source_path);
                            let destination_path = Arc::clone(&destination_path);
                            let destination_filesystem = destination_filesystem.clone();
                            let progress = Arc::clone(&progress);

                            async move {
                                let metadata =
                                    match filesystem.async_symlink_metadata(&path).await {
                                        Ok(metadata) => metadata,
                                        Err(_) => return Ok(()),
                                    };

                                let relative_path = match path.strip_prefix(&*source_path) {
                                    Ok(p) => p,
                                    Err(_) => return Ok(()),
                                };
                                let destination_path = destination_path.join(relative_path);

                                if metadata.file_type.is_file() {
                                    if let Some(parent) = destination_path.parent() {
                                        destination_filesystem.async_create_dir_all(&parent).await?;
                                    }

                                    if filesystem.is_primary_server_fs()
                                        && destination_filesystem.is_primary_server_fs()
                                        && filesystem.backing_server().uuid == destination_filesystem.backing_server().uuid
                                    {
                                        server
                                            .filesystem
                                            .async_quota_copy(
                                                &path,
                                                &destination_path,
                                                &server,
                                                Some(&progress),
                                            )
                                            .await?;
                                        destination_filesystem
                                            .async_set_permissions(&destination_path, metadata.permissions)
                                            .await?;
                                    } else {
                                        let mut reader = AsyncCountingReader::new_with_bytes_read(
                                            stream,
                                            Arc::clone(&progress),
                                        );

                                        let mut writer = destination_filesystem
                                            .async_create_file(&destination_path)
                                            .await?;
                                        destination_filesystem
                                            .async_set_permissions(&destination_path, metadata.permissions)
                                            .await?;

                                        tokio::io::copy(&mut reader, &mut writer).await?;
                                        writer.shutdown().await?;
                                    }
                                } else if metadata.file_type.is_dir() {
                                    destination_filesystem.async_create_dir_all(&destination_path).await?;
                                    destination_filesystem
                                        .async_set_permissions(&destination_path, metadata.permissions)
                                        .await?;

                                    progress.fetch_add(metadata.size, Ordering::Relaxed);
                                } else if metadata.file_type.is_symlink() && let Ok(target) = filesystem.async_read_symlink(&path).await
                                    && let Err(err) = destination_filesystem.async_create_symlink(&target, &destination_path).await {
                                        tracing::debug!(path = %destination_path.display(), "failed to create symlink from copy: {:?}", err);
                                    }

                                Ok(())
                            }
                        }
                    }),
                )
                .await?;
        }

        Ok(())
    }

    fn try_update_atomics(&self, delta: i64, ignorant: bool) -> bool {
        if crate::unlikely(delta == 0) {
            return true;
        }

        if delta > 0 {
            let delta_u64 = delta as u64;

            if !ignorant && self.disk_limit() != 0 {
                let limit = self.disk_limit() as u64;

                let result = self.disk_usage_cached_logical.fetch_update(
                    Ordering::SeqCst,
                    Ordering::Relaxed,
                    |current| {
                        if current + delta_u64 > limit {
                            None
                        } else {
                            Some(current + delta_u64)
                        }
                    },
                );

                if result.is_err() {
                    tracing::debug!(
                        "failed to allocate {} bytes: disk limit of {} bytes would be exceeded",
                        delta_u64,
                        limit
                    );
                    return false;
                }
            } else {
                self.disk_usage_cached_logical
                    .fetch_add(delta_u64, Ordering::Relaxed);
            }

            self.disk_usage_cached_physical
                .fetch_add(delta_u64, Ordering::Relaxed);
        } else {
            let abs_size = delta.unsigned_abs();

            self.disk_usage_cached_logical
                .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |current| {
                    Some(current.saturating_sub(abs_size))
                })
                .ok();
            self.disk_usage_cached_physical
                .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |current| {
                    Some(current.saturating_sub(abs_size))
                })
                .ok();
        }

        self.disk_usage_delta_cached
            .fetch_add(delta, Ordering::Relaxed);

        true
    }

    /// Allocates (or deallocates) space for a path in the filesystem.
    /// Updates both the disk_usage map for directories and the cached total.
    ///
    /// - `path`: The path to allocate space for
    /// - `size`: The amount of space to allocate (positive) or deallocate (negative)
    /// - `ignorant`: If `true`, ignores disk limit checks
    ///
    /// Returns `true` if allocation was successful, `false` if it would exceed disk limit
    pub async fn async_allocate_in_path(&self, path: &Path, delta: i64, ignorant: bool) -> bool {
        if !self.try_update_atomics(delta, ignorant) {
            return false;
        }

        self.disk_usage
            .write()
            .await
            .update_size(path, delta.into());

        true
    }

    /// Allocates (or deallocates) space for a path in the filesystem.
    /// Updates both the disk_usage map for directories and the cached total.
    ///
    /// - `path`: The path to allocate space for
    /// - `size`: The amount of space to allocate (positive) or deallocate (negative)
    /// - `ignorant`: If `true`, ignores disk limit checks
    ///
    /// Returns `true` if allocation was successful, `false` if it would exceed disk limit
    pub async fn async_allocate_in_path_iterator(
        &self,
        path: impl IntoIterator<Item = impl AsRef<str> + Debug> + Debug,
        delta: i64,
        ignorant: bool,
    ) -> bool {
        if !self.try_update_atomics(delta, ignorant) {
            return false;
        }

        self.disk_usage
            .write()
            .await
            .update_size_iterator(path, delta.into());

        true
    }

    /// Allocates (or deallocates) space for a path in the filesystem.
    /// Updates both the disk_usage map for directories and the cached total.
    ///
    /// - `path`: The path to allocate space for
    /// - `size`: The amount of space to allocate (positive) or deallocate (negative)
    /// - `ignorant`: If `true`, ignores disk limit checks
    ///
    /// Returns `true` if allocation was successful, `false` if it would exceed disk limit
    pub fn allocate_in_path(&self, path: &Path, delta: i64, ignorant: bool) -> bool {
        if !self.try_update_atomics(delta, ignorant) {
            return false;
        }

        self.disk_usage
            .blocking_write()
            .update_size(path, delta.into());

        true
    }

    /// Allocates (or deallocates) space for a path in the filesystem.
    /// Updates both the disk_usage map for directories and the cached total.
    ///
    /// - `path`: The path to allocate space for
    /// - `size`: The amount of space to allocate (positive) or deallocate (negative)
    /// - `ignorant`: If `true`, ignores disk limit checks
    ///
    /// Returns `true` if allocation was successful, `false` if it would exceed disk limit
    pub fn allocate_in_path_iterator(
        &self,
        path: impl IntoIterator<Item = impl AsRef<str> + Debug> + Debug,
        delta: i64,
        ignorant: bool,
    ) -> bool {
        if !self.try_update_atomics(delta, ignorant) {
            return false;
        }

        self.disk_usage
            .blocking_write()
            .update_size_iterator(path, delta.into());

        true
    }

    pub async fn truncate_root(&self) -> Result<(), anyhow::Error> {
        self.disk_usage.write().await.clear();
        self.disk_usage_cached_logical.store(0, Ordering::Relaxed);
        self.disk_usage_cached_physical.store(0, Ordering::Relaxed);

        let mut directory = self.async_read_dir(Path::new("")).await?;
        while let Some(Ok((file_type, path))) = directory.next_entry().await {
            if file_type.is_dir() {
                self.async_remove_dir_all(&path).await?;
            } else {
                self.async_remove_file(&path).await?;
            }
        }

        Ok(())
    }

    pub async fn chown_path(&self, path: impl AsRef<Path>) -> Result<(), anyhow::Error> {
        #[cfg(unix)]
        {
            let metadata = self.async_metadata(path.as_ref()).await?;

            let owner_uid = rustix::fs::Uid::from_raw_unchecked(self.config.system.user.uid);
            let owner_gid = rustix::fs::Gid::from_raw_unchecked(self.config.system.user.gid);

            tokio::task::spawn_blocking({
                let cap_filesystem = self.cap_filesystem.clone();
                let path = self.relative_path(path.as_ref());
                let base_path = self.base_path.clone();

                move || {
                    if crate::unlikely(path == Path::new("") || path == Path::new("/")) {
                        Ok::<_, anyhow::Error>(std::os::unix::fs::chown(
                            &base_path,
                            Some(owner_uid.as_raw()),
                            Some(owner_gid.as_raw()),
                        )?)
                    } else {
                        Ok(rustix::fs::chownat(
                            cap_filesystem.get_inner()?.as_fd(),
                            path,
                            Some(owner_uid),
                            Some(owner_gid),
                            rustix::fs::AtFlags::SYMLINK_NOFOLLOW,
                        )?)
                    }
                }
            })
            .await??;

            if metadata.is_dir() {
                let cap_filesystem = self.cap_filesystem.clone();

                self.async_walk_dir(path)
                    .await?
                    .run_multithreaded(
                        self.config.system.check_permissions_on_boot_threads,
                        Arc::new(move |_, path: PathBuf| {
                            let cap_filesystem = cap_filesystem.clone();

                            async move {
                                tokio::task::spawn_blocking(move || {
                                    rustix::fs::chownat(
                                        cap_filesystem.get_inner()?.as_fd(),
                                        path,
                                        Some(owner_uid),
                                        Some(owner_gid),
                                        rustix::fs::AtFlags::SYMLINK_NOFOLLOW,
                                    )
                                    .ok();

                                    Ok(())
                                })
                                .await?
                            }
                        }),
                    )
                    .await
            } else {
                Ok(())
            }
        }
        #[cfg(not(unix))]
        {
            Ok(())
        }
    }

    pub async fn setup(&self) {
        let limiter = self.get_disk_limiter();

        if let Err(err) = limiter.setup().await {
            tracing::error!(
                path = %self.base_path.display(),
                "failed to create server base directory: {}",
                err
            );

            return;
        }

        if let Err(err) = limiter
            .update_disk_limit(self.disk_limit.load(Ordering::Relaxed) as u64)
            .await
        {
            tracing::error!(
                path = %self.base_path.display(),
                "failed to update disk limit for server: {}",
                err
            );
        }

        if self.cap_filesystem.is_uninitialized().await {
            let base_path = self.base_path.clone();
            match tokio::task::spawn_blocking(move || {
                cap_std::fs::Dir::open_ambient_dir(&base_path, cap_std::ambient_authority())
            })
            .await
            {
                Ok(Ok(dir)) => {
                    *self.cap_filesystem.inner.write().await = Some(Arc::new(dir));
                    if self.app_state.config.system.disk_check_use_inotify {
                        if let Err(err) = self
                            .app_state
                            .inotify_manager
                            .register_server_with_notifier(self.server_notifier.clone(), self.uuid)
                            .await
                        {
                            tracing::error!(
                                "error while trying to attach server inotify listener, falling back to regular scans: {}",
                                err
                            );
                        } else {
                            self.use_server_notifier.store(true, Ordering::Relaxed);
                        }
                    }
                }
                Ok(Err(err)) => {
                    tracing::error!(
                        path = %self.base_path.display(),
                        "failed to open server base directory: {:?}",
                        err
                    );
                }
                Err(err) => {
                    tracing::error!(
                        path = %self.base_path.display(),
                        "failed to open server base directory: {:?}",
                        err
                    );
                }
            }
        }
    }

    pub async fn attach(&self) {
        if let Err(err) = self.get_disk_limiter().attach().await {
            tracing::error!(
                path = %self.base_path.display(),
                "failed to attach server base directory: {}",
                err
            );
        }

        if self.cap_filesystem.is_uninitialized().await {
            let base_path = self.base_path.clone();
            match tokio::task::spawn_blocking(move || {
                cap_std::fs::Dir::open_ambient_dir(&base_path, cap_std::ambient_authority())
            })
            .await
            {
                Ok(Ok(dir)) => {
                    *self.cap_filesystem.inner.write().await = Some(Arc::new(dir));
                    if self.app_state.config.system.disk_check_use_inotify {
                        if let Err(err) = self
                            .app_state
                            .inotify_manager
                            .register_server_with_notifier(self.server_notifier.clone(), self.uuid)
                            .await
                        {
                            tracing::error!(
                                "error while trying to attach server inotify listener, falling back to regular scans: {}",
                                err
                            );
                        } else {
                            self.use_server_notifier.store(true, Ordering::Relaxed);
                        }
                    }
                }
                Ok(Err(err)) => {
                    tracing::error!(
                        path = %self.base_path.display(),
                        "failed to open server base directory: {}",
                        err
                    );
                }
                Err(err) => {
                    tracing::error!(
                        path = %self.base_path.display(),
                        "failed to open server base directory: {}",
                        err
                    );
                }
            }
        }
    }

    pub async fn destroy(&self) {
        self.disk_checker.abort();
        self.app_state
            .inotify_manager
            .unregister_server(self.uuid)
            .await;

        if let Err(err) = self.get_disk_limiter().destroy().await {
            tracing::error!(
                path = %self.base_path.display(),
                "failed to delete server base directory for: {}",
                err
            );
        }
    }

    pub async fn to_api_entry_buffer(
        &self,
        path: PathBuf,
        metadata: &Metadata,
        no_directory_size: bool,
        buffer: Option<&[u8]>,
        symlink_destination: Option<PathBuf>,
        symlink_destination_metadata: Option<Metadata>,
    ) -> crate::models::DirectoryEntry {
        let real_metadata = symlink_destination_metadata.as_ref().unwrap_or(metadata);
        let real_path = symlink_destination.as_ref().unwrap_or(&path);

        let (size, size_physical) = if real_metadata.is_dir() {
            if !no_directory_size && !self.config.api.disable_directory_size {
                let space = self.disk_usage.read().await.get_size(real_path);

                space.map_or((0, 0), |s| (s.get_logical(), s.get_physical()))
            } else {
                (0, 0)
            }
        } else {
            (real_metadata.size_logical(), real_metadata.size_physical())
        };

        let (valid_utf8, mime) = if real_metadata.is_dir() {
            (false, "inode/directory")
        } else if real_metadata.is_symlink() {
            (false, "inode/symlink")
        } else if let Some(buffer) = buffer {
            let valid_utf8 = crate::utils::is_valid_utf8_slice(buffer) || buffer.is_empty();

            if let Some(mime) = infer::get(buffer) {
                (valid_utf8, mime.mime_type())
            } else if let Some(mime) = new_mime_guess::from_path(real_path).first_raw() {
                (valid_utf8, mime)
            } else if valid_utf8 {
                (true, "text/plain")
            } else {
                (false, "application/octet-stream")
            }
        } else {
            (false, "application/octet-stream")
        };

        crate::models::DirectoryEntry {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            mode: encode_mode(metadata.permissions().mode()),
            mode_bits: compact_str::format_compact!("{:o}", metadata.permissions().mode() & 0o777),
            size,
            size_physical,
            editable: real_metadata.is_file() && valid_utf8,
            directory: real_metadata.is_dir(),
            file: real_metadata.is_file(),
            symlink: metadata.is_symlink(),
            mime,
            modified: chrono::DateTime::from_timestamp(
                metadata
                    .modified()
                    .map(|t| {
                        t.into_std()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                    })
                    .unwrap_or_default()
                    .as_secs() as i64,
                0,
            )
            .unwrap_or_default(),
            created: chrono::DateTime::from_timestamp(
                metadata
                    .created()
                    .map(|t| {
                        t.into_std()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                    })
                    .unwrap_or_default()
                    .as_secs() as i64,
                0,
            )
            .unwrap_or_default(),
        }
    }

    pub async fn to_api_entry_mime_type(
        &self,
        path: PathBuf,
        metadata: &Metadata,
        no_directory_size: bool,
        mime_type: Option<MimeCacheValue>,
        symlink_destination: Option<PathBuf>,
        symlink_destination_metadata: Option<Metadata>,
    ) -> crate::models::DirectoryEntry {
        let real_metadata = symlink_destination_metadata.as_ref().unwrap_or(metadata);
        let real_path = symlink_destination.as_ref().unwrap_or(&path);

        let (size, size_physical) = if real_metadata.is_dir() {
            if !no_directory_size && !self.config.api.disable_directory_size {
                let space = self.disk_usage.read().await.get_size(real_path);

                space.map_or((0, 0), |s| (s.get_logical(), s.get_physical()))
            } else {
                (0, 0)
            }
        } else {
            (real_metadata.size_logical(), real_metadata.size_physical())
        };

        let mime_type = if real_metadata.is_dir() {
            (false, "inode/directory").into()
        } else if real_metadata.is_symlink() {
            (false, "inode/symlink").into()
        } else {
            mime_type.unwrap_or_else(|| (false, "application/octet-stream").into())
        };

        crate::models::DirectoryEntry {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            mode: encode_mode(metadata.permissions().mode()),
            mode_bits: compact_str::format_compact!("{:o}", metadata.permissions().mode() & 0o777),
            size,
            size_physical,
            editable: real_metadata.is_file() && mime_type.valid_utf8,
            directory: real_metadata.is_dir(),
            file: real_metadata.is_file(),
            symlink: metadata.is_symlink(),
            mime: mime_type.mime,
            modified: chrono::DateTime::from_timestamp(
                metadata
                    .modified()
                    .map(|t| {
                        t.into_std()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                    })
                    .unwrap_or_default()
                    .as_secs() as i64,
                0,
            )
            .unwrap_or_default(),
            created: chrono::DateTime::from_timestamp(
                metadata
                    .created()
                    .map(|t| {
                        t.into_std()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                    })
                    .unwrap_or_default()
                    .as_secs() as i64,
                0,
            )
            .unwrap_or_default(),
        }
    }

    pub async fn to_api_entry(
        &self,
        path: PathBuf,
        metadata: Metadata,
    ) -> crate::models::DirectoryEntry {
        let symlink_destination = if metadata.is_symlink() {
            match self.async_read_link(&path).await {
                Ok(link) => self.async_canonicalize(link).await.ok(),
                Err(_) => None,
            }
        } else {
            None
        };

        let symlink_destination_metadata =
            if let Some(symlink_destination) = symlink_destination.clone() {
                self.async_symlink_metadata(&symlink_destination).await.ok()
            } else {
                None
            };

        let mime_key = (&metadata).into();
        let mime_type = if let Some(mime_type) = self.app_state.mime_cache.get(&mime_key).await {
            mime_type
        } else {
            let mut buffer = [0; 64];
            let buffer = if metadata.is_file()
                || (symlink_destination.is_some()
                    && symlink_destination_metadata
                        .as_ref()
                        .is_some_and(|m| m.is_file()))
            {
                match self
                    .async_open(symlink_destination.as_ref().unwrap_or(&path))
                    .await
                {
                    Ok(mut file) => {
                        let bytes_read = file.read(&mut buffer).await.unwrap_or(0);

                        Some(&buffer[..bytes_read])
                    }
                    Err(_) => None,
                }
            } else {
                None
            };

            let mime_type = if let Some(buffer) = buffer {
                let valid_utf8 = crate::utils::is_valid_utf8_slice(buffer) || buffer.is_empty();

                if let Some(mime) = infer::get(buffer) {
                    (valid_utf8, mime.mime_type())
                } else if let Some(mime) =
                    new_mime_guess::from_path(symlink_destination.as_ref().unwrap_or(&path))
                        .iter_raw()
                        .next()
                {
                    (valid_utf8, mime)
                } else if valid_utf8 {
                    (true, "text/plain")
                } else {
                    (false, "application/octet-stream")
                }
            } else {
                (false, "application/octet-stream")
            };

            self.app_state
                .mime_cache
                .insert(mime_key, mime_type.into())
                .await;

            mime_type.into()
        };

        self.to_api_entry_mime_type(
            path,
            &metadata,
            false,
            Some(mime_type),
            symlink_destination,
            symlink_destination_metadata,
        )
        .await
    }

    pub async fn to_api_entry_cap(
        &self,
        filesystem: &cap::CapFilesystem,
        path: PathBuf,
        metadata: Metadata,
        no_directory_size: bool,
    ) -> crate::models::DirectoryEntry {
        let symlink_destination = if metadata.is_symlink() {
            match filesystem.async_read_link(&path).await {
                Ok(link) => filesystem.async_canonicalize(link).await.ok(),
                Err(_) => None,
            }
        } else {
            None
        };

        let symlink_destination_metadata =
            if let Some(symlink_destination) = symlink_destination.clone() {
                filesystem
                    .async_symlink_metadata(&symlink_destination)
                    .await
                    .ok()
            } else {
                None
            };

        let mime_key = (&metadata).into();
        let mime_type = if let Some(mime_type) = self.app_state.mime_cache.get(&mime_key).await {
            mime_type
        } else {
            let mut buffer = [0; 64];
            let buffer = if metadata.is_file()
                || (symlink_destination.is_some()
                    && symlink_destination_metadata
                        .as_ref()
                        .is_some_and(|m| m.is_file()))
            {
                match self
                    .async_open(symlink_destination.as_ref().unwrap_or(&path))
                    .await
                {
                    Ok(mut file) => {
                        let bytes_read = file.read(&mut buffer).await.unwrap_or(0);

                        Some(&buffer[..bytes_read])
                    }
                    Err(_) => None,
                }
            } else {
                None
            };

            let mime_type = if let Some(buffer) = buffer {
                let valid_utf8 = crate::utils::is_valid_utf8_slice(buffer) || buffer.is_empty();
                if let Some(mime) = infer::get(buffer) {
                    (valid_utf8, mime.mime_type())
                } else if let Some(mime) =
                    new_mime_guess::from_path(symlink_destination.as_ref().unwrap_or(&path))
                        .iter_raw()
                        .next()
                {
                    (valid_utf8, mime)
                } else if valid_utf8 {
                    (true, "text/plain")
                } else {
                    (false, "application/octet-stream")
                }
            } else {
                (false, "application/octet-stream")
            };

            self.app_state
                .mime_cache
                .insert(mime_key, mime_type.into())
                .await;

            mime_type.into()
        };

        self.to_api_entry_mime_type(
            path,
            &metadata,
            no_directory_size,
            Some(mime_type),
            symlink_destination,
            symlink_destination_metadata,
        )
        .await
    }
}

impl Deref for Filesystem {
    type Target = cap::CapFilesystem;

    fn deref(&self) -> &Self::Target {
        &self.cap_filesystem
    }
}
