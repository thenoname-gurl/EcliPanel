use crate::{
    io::{
        SafeSliceExt,
        abort::{AbortGuard, AbortListener},
    },
    utils::{PortablePermissions, PortablePermissionsApplier},
};
use arc_swap::ArcSwapOption;
use cap_std::fs::{Metadata, OpenOptions};
use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

mod utils;
pub use utils::{AsyncReadDir, AsyncWalkDir, FileType, ReadDir, WalkDir};

#[derive(Debug, Clone)]
pub struct CapFilesystem {
    pub base_path: Arc<Path>,
    pub(super) inner: Arc<ArcSwapOption<cap_std::fs::Dir>>,
}

impl CapFilesystem {
    pub async fn new(base_path: &Path) -> Result<Self, std::io::Error> {
        let base_path: Arc<Path> = Arc::from(base_path);

        let inner = tokio::task::spawn_blocking({
            let base_path = base_path.clone();

            move || cap_std::fs::Dir::open_ambient_dir(&*base_path, cap_std::ambient_authority())
        })
        .await??;

        Ok(Self {
            base_path,
            inner: Arc::new(ArcSwapOption::new(Some(Arc::new(inner)))),
        })
    }

    pub fn new_uninitialized(base_path: &Path) -> Self {
        Self {
            base_path: Arc::from(base_path),
            inner: Arc::new(ArcSwapOption::empty()),
        }
    }

    pub fn get_virtual(
        &self,
        server: crate::server::Server,
    ) -> crate::server::filesystem::virtualfs::cap::VirtualCapFilesystem {
        crate::server::filesystem::virtualfs::cap::VirtualCapFilesystem {
            inner: self.clone(),
            server,
            is_primary_server_fs: false,
            is_writable: false,
            is_ignored: None,
        }
    }

    #[inline]
    pub fn is_uninitialized(&self) -> bool {
        self.inner.load().is_none()
    }

    /// Closes the inner fd, preventing any further operations from succeeding.
    #[inline]
    pub fn close(&self) {
        self.inner.store(None);
    }

    #[inline]
    pub fn get_inner(&self) -> Result<Arc<cap_std::fs::Dir>, std::io::Error> {
        self.inner
            .load_full()
            .ok_or_else(|| std::io::Error::other("filesystem not initialized"))
    }

    #[inline]
    pub fn resolve_path(path: &Path) -> PathBuf {
        let mut result = PathBuf::new();

        for component in path.components() {
            match component {
                std::path::Component::ParentDir => {
                    if !result.as_os_str().is_empty()
                        && result.components().next_back() != Some(std::path::Component::RootDir)
                    {
                        result.pop();
                    }
                }
                std::path::Component::CurDir => {}
                _ => {
                    result.push(component);
                }
            }
        }

        result
    }

    #[inline]
    pub fn relative_path(&self, path: &Path) -> PathBuf {
        Self::resolve_path(if let Ok(path) = path.strip_prefix(&*self.base_path) {
            path
        } else if let Ok(path) = path.strip_prefix("/") {
            path
        } else {
            path
        })
    }

    pub async fn async_create_dir(&self, path: impl AsRef<Path>) -> Result<(), std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        tokio::task::spawn_blocking(move || inner.create_dir(path)).await??;

        Ok(())
    }

    pub fn create_dir(&self, path: impl AsRef<Path>) -> Result<(), std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        inner.create_dir(path)?;

        Ok(())
    }

    pub async fn async_create_dir_all(&self, path: impl AsRef<Path>) -> Result<(), std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        tokio::task::spawn_blocking(move || inner.create_dir_all(path)).await??;

        Ok(())
    }

    pub fn create_dir_all(&self, path: impl AsRef<Path>) -> Result<(), std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        inner.create_dir_all(path)?;

        Ok(())
    }

    pub async fn async_remove_dir_all(&self, path: impl AsRef<Path>) -> Result<(), std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        tokio::task::spawn_blocking(move || inner.remove_dir_all(path)).await??;

        Ok(())
    }

    pub fn remove_dir_all(&self, path: impl AsRef<Path>) -> Result<(), std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        inner.remove_dir_all(path)?;

        Ok(())
    }

    pub async fn async_remove_file(&self, path: impl AsRef<Path>) -> Result<(), std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        tokio::task::spawn_blocking(move || inner.remove_file(path)).await??;

        Ok(())
    }

    pub fn remove_file(&self, path: impl AsRef<Path>) -> Result<(), std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        inner.remove_file(path)?;

        Ok(())
    }

    pub async fn async_rename(
        &self,
        from: impl AsRef<Path>,
        to_dir: &CapFilesystem,
        to: impl AsRef<Path>,
    ) -> Result<(), std::io::Error> {
        let from = self.relative_path(from.as_ref());
        let to = self.relative_path(to.as_ref());

        let inner = self.get_inner()?;
        let to_inner = to_dir.get_inner()?;
        tokio::task::spawn_blocking(move || inner.rename(from, &to_inner, to)).await??;

        Ok(())
    }

    pub fn rename(
        &self,
        from: impl AsRef<Path>,
        to_dir: &CapFilesystem,
        to: impl AsRef<Path>,
    ) -> Result<(), std::io::Error> {
        let from = self.relative_path(from.as_ref());
        let to = self.relative_path(to.as_ref());

        let inner = self.get_inner()?;
        let to_inner = to_dir.get_inner()?;
        inner.rename(from, &to_inner, to)?;

        Ok(())
    }

    pub async fn async_metadata(&self, path: impl AsRef<Path>) -> Result<Metadata, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let metadata = if path.components().next().is_none() {
            cap_std::fs::Metadata::from_just_metadata(tokio::fs::metadata(&*self.base_path).await?)
        } else {
            let inner = self.get_inner()?;

            tokio::task::spawn_blocking(move || inner.metadata(path)).await??
        };

        Ok(metadata)
    }

    pub fn metadata(&self, path: impl AsRef<Path>) -> Result<Metadata, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let metadata = if path.components().next().is_none() {
            cap_std::fs::Metadata::from_just_metadata(std::fs::metadata(&*self.base_path)?)
        } else {
            let inner = self.get_inner()?;

            inner.metadata(path)?
        };

        Ok(metadata)
    }

    pub async fn async_symlink_metadata(
        &self,
        path: impl AsRef<Path>,
    ) -> Result<Metadata, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let metadata = if path.components().next().is_none() {
            cap_std::fs::Metadata::from_just_metadata(
                tokio::fs::symlink_metadata(&*self.base_path).await?,
            )
        } else {
            let inner = self.get_inner()?;

            tokio::task::spawn_blocking(move || inner.symlink_metadata(path)).await??
        };

        Ok(metadata)
    }

    pub fn symlink_metadata(&self, path: impl AsRef<Path>) -> Result<Metadata, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let metadata = if path.components().next().is_none() {
            cap_std::fs::Metadata::from_just_metadata(std::fs::symlink_metadata(&*self.base_path)?)
        } else {
            let inner = self.get_inner()?;

            inner.symlink_metadata(path)?
        };

        Ok(metadata)
    }

    pub async fn async_canonicalize(
        &self,
        path: impl AsRef<Path>,
    ) -> Result<PathBuf, std::io::Error> {
        let path = self.relative_path(path.as_ref());
        if path.components().next().is_none() {
            return Ok(path);
        }

        let inner = self.get_inner()?;
        let canonicalized = tokio::task::spawn_blocking(move || inner.canonicalize(path)).await??;

        Ok(canonicalized)
    }

    pub async fn async_read_link(&self, path: impl AsRef<Path>) -> Result<PathBuf, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        let link = tokio::task::spawn_blocking(move || inner.read_link(path)).await??;

        Ok(link)
    }

    pub fn read_link(&self, path: impl AsRef<Path>) -> Result<PathBuf, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        let link = inner.read_link(path)?;

        Ok(link)
    }

    pub fn read_link_contents(&self, path: impl AsRef<Path>) -> Result<PathBuf, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        let link_contents = inner.read_link_contents(path)?;

        Ok(link_contents)
    }

    pub async fn async_read_to_string(
        &self,
        path: impl AsRef<Path>,
        limit: usize,
    ) -> Result<String, std::io::Error> {
        let content = self.async_read_to_vec(path, limit).await?;

        String::from_utf8(content)
            .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidData, err))
    }

    pub async fn async_read_to_vec(
        &self,
        path: impl AsRef<Path>,
        limit: usize,
    ) -> Result<Vec<u8>, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let mut file = self.async_open(path).await?;
        let mut content = Vec::new();

        let mut buffer = vec![0; crate::BUFFER_SIZE];
        loop {
            let bytes_read = file.read(&mut buffer).await?;

            if crate::unlikely(bytes_read == 0) {
                break;
            }

            content.extend_from_slice(buffer.get_slice(..bytes_read)?);

            if crate::unlikely(content.len() >= limit) {
                content.truncate(limit);
                break;
            }
        }

        Ok(content)
    }

    pub async fn async_open(
        &self,
        path: impl AsRef<Path>,
    ) -> Result<tokio::fs::File, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        let file = tokio::task::spawn_blocking(move || inner.open(path)).await??;

        Ok(tokio::fs::File::from_std(file.into_std()))
    }

    pub fn open(&self, path: impl AsRef<Path>) -> Result<std::fs::File, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        let file = inner.open(path)?;

        Ok(file.into_std())
    }

    pub async fn async_open_with(
        &self,
        path: impl AsRef<Path>,
        options: OpenOptions,
    ) -> Result<tokio::fs::File, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        let file = tokio::task::spawn_blocking(move || inner.open_with(path, &options)).await??;

        Ok(tokio::fs::File::from_std(file.into_std()))
    }

    pub fn open_with(
        &self,
        path: impl AsRef<Path>,
        options: OpenOptions,
    ) -> Result<std::fs::File, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        let file = inner.open_with(path, &options)?;

        Ok(file.into_std())
    }

    pub async fn async_write(
        &self,
        path: impl AsRef<Path>,
        data: impl AsRef<[u8]>,
    ) -> Result<(), std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let mut file = self.async_create(path).await?;
        file.write_all(data.as_ref()).await?;
        file.sync_all().await?;

        Ok(())
    }

    pub async fn async_create(
        &self,
        path: impl AsRef<Path>,
    ) -> Result<tokio::fs::File, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        let file = tokio::task::spawn_blocking(move || inner.create(path)).await??;

        Ok(tokio::fs::File::from_std(file.into_std()))
    }

    pub fn create(&self, path: impl AsRef<Path>) -> Result<std::fs::File, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        let inner = self.get_inner()?;
        let file = inner.create(path)?;

        Ok(file.into_std())
    }

    pub async fn async_quota_copy(
        &self,
        path: impl AsRef<Path>,
        destination_path: impl AsRef<Path>,
        destination_server: &crate::server::Server,
        progress: Option<&Arc<AtomicU64>>,
    ) -> Result<u64, std::io::Error> {
        let (guard, listener) = AbortGuard::new();

        let bytes_copied = tokio::task::spawn_blocking({
            let self_clone = self.clone();
            let destination_server = destination_server.clone();
            let path = path.as_ref().to_owned();
            let destination_path = destination_path.as_ref().to_owned();
            let progress = progress.cloned();

            move || {
                self_clone.quota_copy(
                    &path,
                    &destination_path,
                    &destination_server,
                    progress.as_ref(),
                    listener,
                )
            }
        })
        .await??;

        drop(guard);

        Ok(bytes_copied)
    }

    pub fn quota_copy(
        &self,
        path: impl AsRef<Path>,
        destination_path: impl AsRef<Path>,
        destination_server: &crate::server::Server,
        progress: Option<&Arc<AtomicU64>>,
        listener: AbortListener,
    ) -> Result<u64, std::io::Error> {
        let path = self.relative_path(path.as_ref());
        let destination_path = destination_server
            .filesystem
            .relative_path(destination_path.as_ref());

        let Some(destination_parent) = destination_path.parent() else {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Destination path has no parent",
            ));
        };

        let destination_metadata = destination_server
            .filesystem
            .metadata(&destination_path)
            .ok();
        if let Some(metadata) = &destination_metadata
            && !metadata.is_file()
        {
            return Err(std::io::Error::new(
                std::io::ErrorKind::AlreadyExists,
                "Destination path exists and is not a file",
            ));
        }

        let mut reader = self.open(&path)?;
        let mut writer = destination_server.filesystem.create(&destination_path)?;

        if let Some(destination_metadata) = &destination_metadata {
            destination_server.filesystem.allocate_in_path(
                destination_parent,
                -(destination_metadata.len() as i64),
                false,
            );
        }

        let mut cached_allocation_progress = 0;

        let bytes_copied = crate::io::copy_file_progress(
            &mut reader,
            &mut writer,
            |bytes_read| {
                if let Some(progress) = progress {
                    progress.fetch_add(bytes_read as u64, Ordering::Relaxed);
                }
                cached_allocation_progress += bytes_read as i64;

                if cached_allocation_progress >= super::file::ALLOCATION_THRESHOLD {
                    if !destination_server.filesystem.allocate_in_path(
                        destination_parent,
                        cached_allocation_progress,
                        false,
                    ) {
                        return Err(std::io::Error::new(
                            std::io::ErrorKind::StorageFull,
                            "Failed to allocate space",
                        ));
                    }

                    cached_allocation_progress = 0;
                }

                Ok(())
            },
            listener,
        )?;

        if cached_allocation_progress > 0
            && !destination_server.filesystem.allocate_in_path(
                destination_parent,
                cached_allocation_progress,
                false,
            )
        {
            return Err(std::io::Error::new(
                std::io::ErrorKind::StorageFull,
                "Failed to allocate space",
            ));
        }

        Ok(bytes_copied)
    }

    pub async fn async_set_permissions(
        &self,
        path: impl AsRef<Path>,
        permissions: PortablePermissions,
    ) -> Result<(), std::io::Error> {
        let path = self.relative_path(path.as_ref());

        if path.components().next().is_none() {
            if let Some(permissions) = permissions.into_std_permissions() {
                tokio::fs::set_permissions(&*self.base_path, permissions).await?;
            }
        } else {
            let inner = self.get_inner()?;

            if let Some(permissions) = permissions.into_std_permissions() {
                tokio::task::spawn_blocking(move || {
                    inner.set_permissions(path, cap_std::fs::Permissions::from_std(permissions))
                })
                .await??;
            } else {
                tokio::task::spawn_blocking(move || {
                    let file = inner.open(&path)?;
                    file.apply_permissions(permissions)
                })
                .await??;
            }
        }

        Ok(())
    }

    pub fn set_permissions(
        &self,
        path: impl AsRef<Path>,
        permissions: PortablePermissions,
    ) -> Result<(), std::io::Error> {
        let path = self.relative_path(path.as_ref());

        if path.components().next().is_none() {
            if let Some(permissions) = permissions.into_std_permissions() {
                std::fs::set_permissions(&*self.base_path, permissions)?;
            }
        } else {
            let inner = self.get_inner()?;

            if let Some(permissions) = permissions.into_std_permissions() {
                inner.set_permissions(path, cap_std::fs::Permissions::from_std(permissions))?;
            } else {
                let file = inner.open(&path)?;
                file.apply_permissions(permissions)?;
            }
        }

        Ok(())
    }

    pub async fn async_set_symlink_permissions(
        &self,
        path: impl AsRef<Path>,
        permissions: PortablePermissions,
    ) -> Result<(), std::io::Error> {
        let path = self.relative_path(path.as_ref());

        if path.components().next().is_none() {
            if let Some(permissions) = permissions.into_std_permissions() {
                tokio::fs::set_permissions(&*self.base_path, permissions).await?;
            }
        } else {
            let inner = self.get_inner()?;

            #[cfg(unix)]
            tokio::task::spawn_blocking(move || {
                use std::os::fd::AsFd;

                rustix::fs::chmodat(
                    inner.as_fd(),
                    path,
                    rustix::fs::Mode::from_raw_mode(permissions.mode() as _),
                    rustix::fs::AtFlags::SYMLINK_NOFOLLOW,
                )
            })
            .await??;
            #[cfg(not(unix))]
            tokio::task::spawn_blocking(move || {
                let file = inner.open(&path)?;
                file.apply_permissions(permissions)
            })
            .await??;
        }

        Ok(())
    }

    pub async fn async_set_times(
        &self,
        path: impl AsRef<Path>,
        modification_time: std::time::SystemTime,
        access_time: Option<std::time::SystemTime>,
    ) -> Result<(), std::io::Error> {
        #[cfg(unix)]
        {
            use std::os::fd::AsFd;

            let path = self.relative_path(path.as_ref());
            let inner = self.get_inner()?;

            let elapsed_modification = modification_time
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| {
                    std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "modification time is before UNIX_EPOCH",
                    )
                })?;
            let elapsed_access = access_time
                .unwrap_or_else(std::time::SystemTime::now)
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| {
                    std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "access time is before UNIX_EPOCH",
                    )
                })?;

            let times = rustix::fs::Timestamps {
                last_modification: elapsed_modification.try_into().map_err(|_| {
                    std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "modification time is too large",
                    )
                })?,
                last_access: elapsed_access.try_into().map_err(|_| {
                    std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "access time is too large",
                    )
                })?,
            };

            tokio::task::spawn_blocking(move || {
                rustix::fs::utimensat(
                    inner.as_fd(),
                    path,
                    &times,
                    rustix::fs::AtFlags::SYMLINK_NOFOLLOW,
                )
            })
            .await??;

            Ok(())
        }
        #[cfg(not(unix))]
        {
            let path = self.relative_path(path.as_ref());
            let inner = self.get_inner()?;

            let mut times = std::fs::FileTimes::new().set_modified(modification_time);
            if let Some(atime) = access_time {
                times = times.set_accessed(atime);
            }

            tokio::task::spawn_blocking(move || {
                let file = inner.open(path)?.into_std();

                file.set_times(times)
            })
            .await??;

            Ok(())
        }
    }

    pub fn set_times(
        &self,
        path: impl AsRef<Path>,
        modification_time: std::time::SystemTime,
        access_time: Option<std::time::SystemTime>,
    ) -> Result<(), std::io::Error> {
        #[cfg(unix)]
        {
            use std::os::fd::AsFd;

            let path = self.relative_path(path.as_ref());
            let inner = self.get_inner()?;

            let elapsed_modification = modification_time
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| {
                    std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "modification time is before UNIX_EPOCH",
                    )
                })?;
            let elapsed_access = access_time
                .unwrap_or_else(std::time::SystemTime::now)
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| {
                    std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "access time is before UNIX_EPOCH",
                    )
                })?;

            let times = rustix::fs::Timestamps {
                last_modification: elapsed_modification.try_into().map_err(|_| {
                    std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "modification time is too large",
                    )
                })?,
                last_access: elapsed_access.try_into().map_err(|_| {
                    std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "access time is too large",
                    )
                })?,
            };

            rustix::fs::utimensat(
                inner.as_fd(),
                path,
                &times,
                rustix::fs::AtFlags::SYMLINK_NOFOLLOW,
            )?;

            Ok(())
        }
        #[cfg(not(unix))]
        {
            let path = self.relative_path(path.as_ref());
            let inner = self.get_inner()?;

            let mut times = std::fs::FileTimes::new().set_modified(modification_time);
            if let Some(atime) = access_time {
                times = times.set_accessed(atime);
            }

            let file = inner.open(path)?.into_std();
            file.set_times(times)?;

            Ok(())
        }
    }

    pub async fn async_symlink(
        &self,
        target: impl AsRef<Path>,
        link: impl AsRef<Path>,
    ) -> Result<(), std::io::Error> {
        let target = self.relative_path(target.as_ref());
        let link = self.relative_path(link.as_ref());

        let inner = self.get_inner()?;
        #[cfg(unix)]
        tokio::task::spawn_blocking(move || inner.symlink(target, link)).await??;
        #[cfg(windows)]
        tokio::task::spawn_blocking(move || {
            let metadata = inner.metadata(&target)?;
            if metadata.is_dir() {
                inner.symlink_dir(target, link)
            } else {
                inner.symlink_file(target, link)
            }
        })
        .await??;

        Ok(())
    }

    pub fn symlink(
        &self,
        target: impl AsRef<Path>,
        link: impl AsRef<Path>,
    ) -> Result<(), std::io::Error> {
        let target = self.relative_path(target.as_ref());
        let link = self.relative_path(link.as_ref());

        let inner = self.get_inner()?;

        #[cfg(unix)]
        inner.symlink(target, link)?;
        #[cfg(windows)]
        {
            let metadata = inner.metadata(&target)?;
            if metadata.is_dir() {
                inner.symlink_dir(target, link)?;
            } else {
                inner.symlink_file(target, link)?;
            }
        }

        Ok(())
    }

    pub async fn async_hard_link(
        &self,
        target: impl AsRef<Path>,
        dst_dir: &CapFilesystem,
        link: impl AsRef<Path>,
    ) -> Result<(), std::io::Error> {
        let target = self.relative_path(target.as_ref());
        let link = self.relative_path(link.as_ref());

        let inner = self.get_inner()?;
        let dst_inner = dst_dir.get_inner()?;
        tokio::task::spawn_blocking(move || inner.hard_link(target, &dst_inner, link)).await??;

        Ok(())
    }

    pub fn hard_link(
        &self,
        target: impl AsRef<Path>,
        dst_dir: &CapFilesystem,
        link: impl AsRef<Path>,
    ) -> Result<(), std::io::Error> {
        let target = self.relative_path(target.as_ref());
        let link = self.relative_path(link.as_ref());

        let inner = self.get_inner()?;
        let dst_inner = dst_dir.get_inner()?;
        inner.hard_link(target, &dst_inner, link)?;

        Ok(())
    }

    pub async fn async_read_dir_all(
        &self,
        path: impl AsRef<Path>,
    ) -> Result<Vec<String>, std::io::Error> {
        let mut read_dir = self.async_read_dir(path).await?;

        let mut names = Vec::new();
        while let Some(Ok((_, entry))) = read_dir.next_entry().await {
            names.push(entry);
        }

        Ok(names)
    }

    pub async fn async_read_dir(
        &self,
        path: impl AsRef<Path>,
    ) -> Result<AsyncReadDir, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        Ok(if path.components().next().is_none() {
            AsyncReadDir::Tokio(utils::AsyncTokioReadDir(
                tokio::fs::read_dir(&*self.base_path).await?,
            ))
        } else {
            let inner = self.get_inner()?;

            AsyncReadDir::Cap(utils::AsyncCapReadDir(
                Some(tokio::task::spawn_blocking(move || inner.read_dir(path)).await??),
                Some(VecDeque::with_capacity(128)),
            ))
        })
    }

    pub fn read_dir(&self, path: impl AsRef<Path>) -> Result<ReadDir, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        Ok(if path.components().next().is_none() {
            ReadDir::Std(utils::StdReadDir(std::fs::read_dir(&*self.base_path)?))
        } else {
            let inner = self.get_inner()?;

            ReadDir::Cap(utils::CapReadDir(inner.read_dir(path)?))
        })
    }

    pub async fn async_walk_dir(
        &self,
        path: impl AsRef<Path>,
    ) -> Result<AsyncWalkDir, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        AsyncWalkDir::new(self.clone(), path).await
    }

    pub fn walk_dir(&self, path: impl AsRef<Path>) -> Result<WalkDir, std::io::Error> {
        let path = self.relative_path(path.as_ref());

        WalkDir::new(self.clone(), path)
    }
}
