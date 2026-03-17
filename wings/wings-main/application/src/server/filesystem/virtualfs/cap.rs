use super::{
    AsyncFileRead, AsyncReadableFileStream, AsyncWritableSeekableFileStream, ByteRange,
    DirectoryListing, DirectoryStreamWalk, DirectoryWalk, FileMetadata, FileRead, FileType,
    IsIgnoredFn, WritableSeekableFileStream,
};
use crate::{
    io::compression::CompressionLevel,
    models::DirectoryEntry,
    server::filesystem::{
        archive::StreamableArchiveFormat,
        virtualfs::{AsyncReadableWritableSeekableFileStream, ReadableWritableSeekableFileStream},
    },
};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, atomic::AtomicU64},
};
use tokio::io::AsyncWriteExt;

pub struct VirtualCapFilesystem {
    pub inner: crate::server::filesystem::cap::CapFilesystem,
    pub server: crate::server::Server,
    pub is_primary_server_fs: bool,
    pub is_writable: bool,
    pub is_ignored: Option<IsIgnoredFn>,
}

impl VirtualCapFilesystem {
    pub fn with_is_ignored(mut self, is_ignored: IsIgnoredFn) -> Self {
        if let Some(existing_is_ignored) = self.is_ignored {
            self.is_ignored = Some(existing_is_ignored.merge(is_ignored));
        } else {
            self.is_ignored = Some(is_ignored);
        }

        self
    }

    pub fn check_ignored(
        &self,
        file_type: FileType,
        path: impl Into<PathBuf>,
    ) -> Result<PathBuf, anyhow::Error> {
        let path = path.into();
        let Some(is_ignored) = &self.is_ignored else {
            return Ok(path);
        };
        let Some(path) = (is_ignored)(file_type, path) else {
            return Err(anyhow::anyhow!(std::io::Error::from(
                rustix::io::Errno::NOENT
            )));
        };

        Ok(path)
    }
}

#[async_trait::async_trait]
impl super::VirtualReadableFilesystem for VirtualCapFilesystem {
    fn is_primary_server_fs(&self) -> bool {
        self.is_primary_server_fs
    }
    fn is_fast(&self) -> bool {
        true
    }
    fn is_writable(&self) -> bool {
        self.is_writable
    }

    fn backing_server(&self) -> &crate::server::Server {
        &self.server
    }

    fn metadata(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<FileMetadata, anyhow::Error> {
        let metadata = self.inner.metadata(path)?;
        let metadata: FileMetadata = metadata.into();

        self.check_ignored(metadata.file_type, path.as_ref())?;

        Ok(metadata)
    }
    async fn async_metadata(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<FileMetadata, anyhow::Error> {
        let metadata = self.inner.async_metadata(path).await?;
        let metadata: FileMetadata = metadata.into();

        self.check_ignored(metadata.file_type, path.as_ref())?;

        Ok(metadata)
    }

    fn symlink_metadata(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<FileMetadata, anyhow::Error> {
        let metadata = self.inner.symlink_metadata(path)?;
        let metadata: FileMetadata = metadata.into();

        self.check_ignored(metadata.file_type, path.as_ref())?;

        Ok(metadata)
    }
    async fn async_symlink_metadata(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<FileMetadata, anyhow::Error> {
        let metadata = self.inner.async_symlink_metadata(path).await?;
        let metadata: FileMetadata = metadata.into();

        self.check_ignored(metadata.file_type, path.as_ref())?;

        Ok(metadata)
    }

    async fn async_directory_entry(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<DirectoryEntry, anyhow::Error> {
        let metadata = self.inner.async_symlink_metadata(path).await?;

        let path = self.check_ignored(metadata.file_type().into(), path.as_ref())?;

        Ok(self
            .server
            .filesystem
            .to_api_entry_cap(&self.inner, path, metadata, !self.is_primary_server_fs)
            .await)
    }

    async fn async_directory_entry_buffer(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        buffer: &[u8],
    ) -> Result<DirectoryEntry, anyhow::Error> {
        let metadata = self.inner.async_symlink_metadata(path).await?;

        let path = self.check_ignored(metadata.file_type().into(), path.as_ref())?;

        Ok(self
            .server
            .filesystem
            .to_api_entry_buffer(
                path,
                &metadata,
                !self.is_primary_server_fs,
                Some(buffer),
                None,
                None,
            )
            .await)
    }

    async fn async_read_dir(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        per_page: Option<usize>,
        page: usize,
        is_ignored: IsIgnoredFn,
    ) -> Result<DirectoryListing, anyhow::Error> {
        let path = path.as_ref();
        let is_ignored = if let Some(existing_is_ignored) = &self.is_ignored {
            existing_is_ignored.clone().merge(is_ignored)
        } else {
            is_ignored
        };
        let mut directory_reader = self.inner.async_read_dir(path).await?;
        let mut directory_entries = Vec::new();
        let mut other_entries = Vec::new();

        while let Some(Ok((file_type, entry))) = directory_reader.next_entry().await {
            let path = path.join(&entry);

            if is_ignored(file_type, path).is_none() {
                continue;
            }

            if file_type.is_dir() {
                directory_entries.push(entry);
            } else {
                other_entries.push(entry);
            }
        }

        directory_entries.sort_unstable();
        other_entries.sort_unstable();

        let total_entries = directory_entries.len() + other_entries.len();
        let mut entries = Vec::new();

        if let Some(per_page) = per_page {
            let start = (page - 1) * per_page;

            for entry in directory_entries
                .into_iter()
                .chain(other_entries.into_iter())
                .skip(start)
                .take(per_page)
            {
                let path = path.join(&entry);
                let entry = match self.async_directory_entry(&path).await {
                    Ok(entry) => entry,
                    Err(_) => continue,
                };

                entries.push(entry);
            }
        } else {
            for entry in directory_entries
                .into_iter()
                .chain(other_entries.into_iter())
            {
                let path = path.join(&entry);
                let entry = match self.async_directory_entry(&path).await {
                    Ok(entry) => entry,
                    Err(_) => continue,
                };

                entries.push(entry);
            }
        }

        Ok(DirectoryListing {
            total_entries,
            entries,
        })
    }

    async fn async_walk_dir<'a>(
        &'a self,
        path: &(dyn AsRef<Path> + Send + Sync),
        is_ignored: IsIgnoredFn,
    ) -> Result<Box<dyn DirectoryWalk + Send + Sync + 'a>, anyhow::Error> {
        let walk_dir = self.inner.async_walk_dir(path).await?.with_is_ignored(
            if let Some(existing_is_ignored) = &self.is_ignored {
                existing_is_ignored.clone().merge(is_ignored)
            } else {
                is_ignored
            },
        );

        struct IgnoreAsyncWalkDir {
            inner: crate::server::filesystem::cap::AsyncWalkDir,
        }

        #[async_trait::async_trait]
        impl DirectoryWalk for IgnoreAsyncWalkDir {
            async fn next_entry(&mut self) -> Option<Result<(FileType, PathBuf), anyhow::Error>> {
                self.inner.next_entry().await
            }
        }

        Ok(Box::new(IgnoreAsyncWalkDir { inner: walk_dir }))
    }

    async fn async_walk_dir_stream<'a>(
        &'a self,
        path: &(dyn AsRef<Path> + Send + Sync),
        is_ignored: IsIgnoredFn,
    ) -> Result<Box<dyn DirectoryStreamWalk + Send + Sync + 'a>, anyhow::Error> {
        let walk_dir = self.inner.async_walk_dir(path).await?.with_is_ignored(
            if let Some(existing_is_ignored) = &self.is_ignored {
                existing_is_ignored.clone().merge(is_ignored)
            } else {
                is_ignored
            },
        );

        struct IgnoreAsyncWalkDir<'a> {
            inner_fs: &'a crate::server::filesystem::cap::CapFilesystem,
            inner: crate::server::filesystem::cap::AsyncWalkDir,
        }

        #[async_trait::async_trait]
        impl<'a> DirectoryStreamWalk for IgnoreAsyncWalkDir<'a> {
            async fn next_entry(
                &mut self,
            ) -> Option<Result<(FileType, PathBuf, AsyncReadableFileStream), anyhow::Error>>
            {
                let entry = self.inner.next_entry().await?;

                let (file_type, path) = match entry {
                    Ok((file_type, path)) => (file_type, path),
                    Err(err) => return Some(Err(err)),
                };

                let reader: AsyncReadableFileStream = if file_type.is_file() {
                    match self.inner_fs.async_open(&path).await {
                        Ok(file) => Box::new(file),
                        Err(_) => Box::new(tokio::io::empty()),
                    }
                } else {
                    Box::new(tokio::io::empty())
                };

                Some(Ok((file_type, path, reader)))
            }
        }

        Ok(Box::new(IgnoreAsyncWalkDir {
            inner_fs: &self.inner,
            inner: walk_dir,
        }))
    }

    fn read_file(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        range: Option<ByteRange>,
    ) -> Result<FileRead, anyhow::Error> {
        let path = self.check_ignored(FileType::File, path.as_ref())?;
        let file = self.inner.open(path)?;

        Ok(FileRead::from_file(file, range)?)
    }
    async fn async_read_file(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        range: Option<ByteRange>,
    ) -> Result<AsyncFileRead, anyhow::Error> {
        let path = self.check_ignored(FileType::File, path.as_ref())?;
        let file = self.inner.async_open(path).await?;

        Ok(AsyncFileRead::from_file(file, range).await?)
    }

    fn read_symlink(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<PathBuf, anyhow::Error> {
        let path = self.check_ignored(FileType::Symlink, path.as_ref())?;
        let link_path = self.inner.read_link(&path)?;

        Ok(link_path)
    }
    async fn async_read_symlink(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<PathBuf, anyhow::Error> {
        let path = self.check_ignored(FileType::Symlink, path.as_ref())?;
        let link_path = self.inner.async_read_link(&path).await?;

        Ok(link_path)
    }

    async fn async_read_dir_archive(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        archive_format: StreamableArchiveFormat,
        compression_level: CompressionLevel,
        bytes_archived: Option<Arc<AtomicU64>>,
        is_ignored: IsIgnoredFn,
    ) -> Result<tokio::io::ReadHalf<tokio::io::SimplexStream>, anyhow::Error> {
        let names = self.inner.async_read_dir_all(path).await?;
        let file_compression_threads = self.server.app_state.config.api.file_compression_threads;
        let (reader, writer) = tokio::io::simplex(crate::BUFFER_SIZE);

        tokio::spawn({
            let filesystem = self.inner.clone();
            let is_ignored = if let Some(existing_is_ignored) = &self.is_ignored {
                existing_is_ignored.clone().merge(is_ignored)
            } else {
                is_ignored
            };
            let path = path.as_ref().to_path_buf();

            async move {
                let writer = tokio_util::io::SyncIoBridge::new(writer);

                match archive_format {
                    StreamableArchiveFormat::Zip => {
                        match crate::server::filesystem::archive::create::create_zip_streaming(
                            filesystem,
                            writer,
                            &path,
                            names,
                            bytes_archived,
                            is_ignored,
                            crate::server::filesystem::archive::create::CreateZipOptions {
                                compression_level,
                            },
                        )
                        .await
                        {
                            Ok(inner) => {
                                inner.into_inner().shutdown().await.ok();
                            }
                            Err(err) => {
                                tracing::error!(
                                    "failed to create zip archive for cap vfs: {}",
                                    err
                                );
                            }
                        }
                    }
                    _ => {
                        match crate::server::filesystem::archive::create::create_tar(
                            filesystem,
                            writer,
                            &path,
                            names,
                            bytes_archived,
                            is_ignored,
                            crate::server::filesystem::archive::create::CreateTarOptions {
                                compression_type: archive_format.compression_format(),
                                compression_level,
                                threads: file_compression_threads,
                            },
                        )
                        .await
                        {
                            Ok(inner) => {
                                inner.into_inner().shutdown().await.ok();
                            }
                            Err(err) => {
                                tracing::error!(
                                    "failed to create tar archive for cap vfs: {}",
                                    err
                                );
                            }
                        }
                    }
                }
            }
        });

        Ok(reader)
    }
}

#[async_trait::async_trait]
impl super::VirtualWritableFilesystem for VirtualCapFilesystem {
    fn create_dir_all(&self, path: &(dyn AsRef<Path> + Send + Sync)) -> Result<(), anyhow::Error> {
        let path = self.check_ignored(FileType::Dir, path.as_ref())?;

        self.inner.create_dir_all(path)
    }
    async fn async_create_dir_all(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<(), anyhow::Error> {
        let path = self.check_ignored(FileType::Dir, path.as_ref())?;

        self.inner.async_create_dir_all(path).await
    }

    fn remove_dir_all(&self, path: &(dyn AsRef<Path> + Send + Sync)) -> Result<(), anyhow::Error> {
        let path = self.check_ignored(FileType::Dir, path.as_ref())?;

        self.inner.remove_dir_all(path)
    }
    async fn async_remove_dir_all(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<(), anyhow::Error> {
        let path = self.check_ignored(FileType::Dir, path.as_ref())?;

        self.inner.async_remove_dir_all(path).await
    }

    fn remove_file(&self, path: &(dyn AsRef<Path> + Send + Sync)) -> Result<(), anyhow::Error> {
        let path = self.check_ignored(FileType::File, path.as_ref())?;

        self.inner.remove_file(path)
    }
    async fn async_remove_file(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<(), anyhow::Error> {
        let path = self.check_ignored(FileType::File, path.as_ref())?;

        self.inner.async_remove_file(path).await
    }

    fn create_symlink(
        &self,
        original: &(dyn AsRef<Path> + Send + Sync),
        link: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<(), anyhow::Error> {
        let original = self.check_ignored(FileType::File, original.as_ref())?;
        let link = self.check_ignored(FileType::Symlink, link.as_ref())?;

        self.inner.symlink(original, link)
    }
    async fn async_create_symlink(
        &self,
        original: &(dyn AsRef<Path> + Send + Sync),
        link: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<(), anyhow::Error> {
        let original = self.check_ignored(FileType::File, original.as_ref())?;
        let link = self.check_ignored(FileType::Symlink, link.as_ref())?;

        self.inner.async_symlink(original, link).await
    }

    fn create_seekable_file(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<WritableSeekableFileStream, anyhow::Error> {
        let path = self.check_ignored(FileType::File, path.as_ref())?;

        if self.is_primary_server_fs {
            let writer = crate::server::filesystem::writer::FileSystemWriter::new(
                self.server.clone(),
                &path,
                None,
                None,
            )?;

            Ok(Box::new(writer))
        } else {
            let file = self.inner.create(path)?;

            Ok(Box::new(file))
        }
    }
    async fn async_create_seekable_file(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<AsyncWritableSeekableFileStream, anyhow::Error> {
        let path = self.check_ignored(FileType::File, path.as_ref())?;

        if self.is_primary_server_fs {
            let writer = crate::server::filesystem::writer::AsyncFileSystemWriter::new(
                self.server.clone(),
                &path,
                None,
                None,
            )
            .await?;

            Ok(Box::new(writer))
        } else {
            let file = self.inner.async_create(path).await?;

            Ok(Box::new(file))
        }
    }
    fn open_file_with_options(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        options: cap_std::fs::OpenOptions,
    ) -> Result<ReadableWritableSeekableFileStream, anyhow::Error> {
        let path = self.check_ignored(FileType::File, path.as_ref())?;

        let file = self.inner.open_with(&path, options)?;

        Ok(Box::new(file))
    }
    async fn async_open_file_with_options(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        options: cap_std::fs::OpenOptions,
    ) -> Result<AsyncReadableWritableSeekableFileStream, anyhow::Error> {
        let path = self.check_ignored(FileType::File, path.as_ref())?;

        let file = self.inner.async_open_with(&path, options).await?;

        Ok(Box::new(file))
    }

    fn set_permissions(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        permissions: cap_std::fs::Permissions,
    ) -> Result<(), anyhow::Error> {
        let path = self.check_ignored(FileType::File, path.as_ref())?;

        self.inner.set_permissions(path, permissions)
    }
    async fn async_set_permissions(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        permissions: cap_std::fs::Permissions,
    ) -> Result<(), anyhow::Error> {
        let path = self.check_ignored(FileType::File, path.as_ref())?;

        self.inner.async_set_permissions(path, permissions).await
    }

    fn rename(
        &self,
        from: &(dyn AsRef<Path> + Send + Sync),
        to: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<(), anyhow::Error> {
        let from = self.check_ignored(FileType::File, from.as_ref())?;
        let to = self.check_ignored(FileType::File, to.as_ref())?;

        self.inner.rename(from, &self.inner, to)
    }
    async fn async_rename(
        &self,
        from: &(dyn AsRef<Path> + Send + Sync),
        to: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<(), anyhow::Error> {
        let from = self.check_ignored(FileType::File, from.as_ref())?;
        let to = self.check_ignored(FileType::File, to.as_ref())?;

        self.inner.async_rename(from, &self.inner, to).await
    }

    fn chown(&self, _path: &(dyn AsRef<Path> + Send + Sync)) -> Result<(), anyhow::Error> {
        Ok(())
    }
    async fn async_chown(
        &self,
        _path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<(), anyhow::Error> {
        Ok(())
    }
}
