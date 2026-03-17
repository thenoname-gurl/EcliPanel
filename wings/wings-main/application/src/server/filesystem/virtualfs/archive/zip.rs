use crate::{
    io::{
        compression::{CompressionLevel, writer::CompressionWriter},
        counting_reader::CountingReader,
    },
    models::DirectoryEntry,
    routes::MimeCacheValue,
    server::filesystem::{
        archive::{
            StreamableArchiveFormat, multi_reader::MultiReader, zip_entry_get_modified_time,
        },
        cap::FileType,
        encode_mode,
        usage::UsedSpace,
        virtualfs::{
            AsyncFileRead, AsyncReadableFileStream, ByteRange, DirectoryListing,
            DirectoryStreamWalk, DirectoryWalk, FileMetadata, FileRead, IsIgnoredFn,
            VirtualReadableFilesystem,
        },
    },
    utils::PortableModeExt,
};
use std::{
    io::{Read, Seek, Write},
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};
use tokio::io::AsyncWriteExt;

pub trait BetterZipArchiveExt<R: Read + Seek> {
    fn better_by_path(
        &mut self,
        path: impl AsRef<Path>,
    ) -> Result<zip::read::ZipFile<'_, R>, zip::result::ZipError>;
    fn better_index_for_path(&self, path: impl AsRef<Path>) -> Option<usize>;
}

impl<R: Read + Seek + Clone> BetterZipArchiveExt<R> for zip::ZipArchive<R> {
    fn better_by_path(
        &mut self,
        path: impl AsRef<Path>,
    ) -> Result<zip::read::ZipFile<'_, R>, zip::result::ZipError> {
        match self.index_for_path(path.as_ref()) {
            Some(index) => self.by_index(index),
            None => self.by_name(&format!("{}/", path.as_ref().display())),
        }
    }

    fn better_index_for_path(&self, path: impl AsRef<Path>) -> Option<usize> {
        match self.index_for_path(path.as_ref()) {
            Some(index) => Some(index),
            None => self.index_for_name(&format!("{}/", path.as_ref().display())),
        }
    }
}

#[derive(Clone)]
pub struct VirtualZipArchive {
    pub server: crate::server::Server,
    pub archive: zip::ZipArchive<MultiReader>,
    pub archive_created: chrono::DateTime<chrono::Utc>,
    pub mime_cache: moka::sync::Cache<usize, MimeCacheValue>,
    pub sizes: Arc<Vec<(UsedSpace, PathBuf)>>,
}

impl VirtualZipArchive {
    pub fn new(
        server: crate::server::Server,
        mut archive: zip::ZipArchive<MultiReader>,
        archive_created: chrono::DateTime<chrono::Utc>,
    ) -> Self {
        let names = archive
            .file_names()
            .map(|name| name.to_string())
            .collect::<Vec<_>>();
        let mut sizes = names
            .into_iter()
            .map(|name| {
                (
                    {
                        let entry = archive.by_name(&name);

                        entry
                            .map(|e| UsedSpace::new(e.size(), e.compressed_size()))
                            .unwrap_or_default()
                    },
                    PathBuf::from(name),
                )
            })
            .collect::<Vec<_>>();
        sizes.shrink_to_fit();

        Self {
            server,
            archive,
            archive_created,
            mime_cache: moka::sync::Cache::new(10240),
            sizes: Arc::new(sizes),
        }
    }

    pub async fn open(
        server: crate::server::Server,
        archive_path: &Path,
    ) -> Result<Self, anyhow::Error> {
        let file = server
            .filesystem
            .async_open(archive_path)
            .await?
            .into_std()
            .await;
        let reader = MultiReader::new(Arc::new(file))?;

        let archive = tokio::task::spawn_blocking(
            move || -> Result<zip::ZipArchive<MultiReader>, anyhow::Error> {
                let archive = zip::ZipArchive::new(reader)?;
                Ok(archive)
            },
        )
        .await??;

        let metadata = server.filesystem.async_metadata(archive_path).await?;

        Ok(Self::new(
            server,
            archive,
            metadata
                .created()
                .map_or_else(|_| Default::default(), |dt| dt.into_std().into()),
        ))
    }

    fn zip_entry_to_directory_entry(
        archive_created: &chrono::DateTime<chrono::Utc>,
        path: &Path,
        entry_index: usize,
        mime_cache: &moka::sync::Cache<usize, MimeCacheValue>,
        sizes: &[(UsedSpace, PathBuf)],
        buffer: Option<&[u8]>,
        mut entry: zip::read::ZipFile<impl Read + Seek>,
    ) -> DirectoryEntry {
        let (size, size_physical) = if entry.is_dir() {
            let space: UsedSpace = sizes
                .iter()
                .filter(|(_, name)| name.starts_with(path))
                .map(|(size, _)| *size)
                .sum();

            (space.get_logical(), space.get_physical())
        } else {
            (entry.size(), entry.compressed_size())
        };

        let mime_type = if entry.is_dir() {
            (false, "inode/directory").into()
        } else if entry.is_symlink() {
            (false, "inode/symlink").into()
        } else if let Some(mime_type) = mime_cache.get(&entry_index) {
            mime_type
        } else if let Some(buffer) = buffer {
            let valid_utf8 = crate::utils::is_valid_utf8_slice(buffer) || buffer.is_empty();

            let mime_type = if let Some(mime) = infer::get(buffer) {
                (valid_utf8, mime.mime_type())
            } else if let Some(mime) = new_mime_guess::from_path(entry.name()).iter_raw().next() {
                (valid_utf8, mime)
            } else if valid_utf8 {
                (true, "text/plain")
            } else {
                (false, "application/octet-stream")
            };

            mime_cache.insert(entry_index, mime_type.into());

            mime_type.into()
        } else {
            let mut buffer = [0; 64];
            let buffer = if entry.read(&mut buffer).is_err() {
                None
            } else {
                Some(&buffer)
            };

            let mime_type = if let Some(buffer) = buffer {
                let valid_utf8 = crate::utils::is_valid_utf8_slice(buffer) || buffer.is_empty();

                if let Some(mime) = infer::get(buffer) {
                    (valid_utf8, mime.mime_type())
                } else if let Some(mime) = new_mime_guess::from_path(entry.name()).iter_raw().next()
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

            mime_cache.insert(entry_index, mime_type.into());

            mime_type.into()
        };

        let mode = entry
            .unix_mode()
            .unwrap_or(if entry.is_dir() { 0o755 } else { 0o644 });

        DirectoryEntry {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            mode: encode_mode(mode),
            mode_bits: compact_str::format_compact!("{:o}", mode & 0o777),
            size,
            size_physical,
            editable: entry.is_file() && mime_type.valid_utf8,
            directory: entry.is_dir(),
            file: entry.is_file(),
            symlink: entry.is_symlink(),
            mime: mime_type.mime,
            modified: crate::server::filesystem::archive::zip_entry_get_modified_time(&entry)
                .map(|dt| dt.into_std().into())
                .unwrap_or_default(),
            created: crate::server::filesystem::archive::zip_entry_get_created_time(&entry)
                .map(|dt| dt.into_std().into())
                .unwrap_or_else(|| *archive_created),
        }
    }

    fn zip_entry_to_file_type(entry: &zip::read::ZipFile<impl Read + Seek>) -> FileType {
        match () {
            _ if entry.is_dir() => FileType::Dir,
            _ if entry.is_file() => FileType::File,
            _ if entry.is_symlink() => FileType::Symlink,
            _ => FileType::Unknown,
        }
    }
}

#[async_trait::async_trait]
impl VirtualReadableFilesystem for VirtualZipArchive {
    fn backing_server(&self) -> &crate::server::Server {
        &self.server
    }

    fn metadata(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<FileMetadata, anyhow::Error> {
        if path.as_ref() == Path::new("") || path.as_ref() == Path::new("/") {
            return Ok(FileMetadata {
                file_type: FileType::Dir,
                permissions: cap_std::fs::Permissions::from_portable_mode(0o755),
                size: 0,
                modified: None,
                created: None,
            });
        }

        let mut archive = self.archive.clone();
        let path = path.as_ref();

        let entry = archive.better_by_path(path)?;

        Ok(FileMetadata {
            file_type: Self::zip_entry_to_file_type(&entry),
            permissions: if let Some(mode) = entry.unix_mode() {
                cap_std::fs::Permissions::from_portable_mode(mode & 0o777)
            } else if entry.is_dir() {
                cap_std::fs::Permissions::from_portable_mode(0o755)
            } else {
                cap_std::fs::Permissions::from_portable_mode(0o644)
            },
            size: entry.size(),
            modified: crate::server::filesystem::archive::zip_entry_get_modified_time(&entry)
                .map(|dt| dt.into_std()),
            created: None,
        })
    }
    async fn async_metadata(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<FileMetadata, anyhow::Error> {
        self.metadata(path)
    }

    fn symlink_metadata(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<FileMetadata, anyhow::Error> {
        self.metadata(path)
    }
    async fn async_symlink_metadata(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<FileMetadata, anyhow::Error> {
        self.metadata(path)
    }

    async fn async_directory_entry(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<DirectoryEntry, anyhow::Error> {
        let mut archive = self.archive.clone();
        let archive_created = self.archive_created;
        let mime_cache = self.mime_cache.clone();
        let sizes = self.sizes.clone();
        let path = path.as_ref().to_path_buf();

        let entry = tokio::task::spawn_blocking(move || {
            let entry_index = archive.better_index_for_path(&path).unwrap_or(usize::MAX);
            let entry = archive.by_index(entry_index)?;

            Ok::<_, zip::result::ZipError>(Self::zip_entry_to_directory_entry(
                &archive_created,
                &path,
                entry_index,
                &mime_cache,
                &sizes,
                None,
                entry,
            ))
        })
        .await??;

        Ok(entry)
    }

    async fn async_directory_entry_buffer(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        buffer: &[u8],
    ) -> Result<DirectoryEntry, anyhow::Error> {
        let mut archive = self.archive.clone();
        let archive_created = self.archive_created;
        let mime_cache = self.mime_cache.clone();
        let sizes = self.sizes.clone();
        let path = path.as_ref().to_path_buf();
        let buffer = buffer.to_owned();

        let entry = tokio::task::spawn_blocking(move || {
            let entry_index = archive.better_index_for_path(&path).unwrap_or(usize::MAX);
            let entry = archive.by_index(entry_index)?;

            Ok::<_, zip::result::ZipError>(Self::zip_entry_to_directory_entry(
                &archive_created,
                &path,
                entry_index,
                &mime_cache,
                &sizes,
                Some(&buffer),
                entry,
            ))
        })
        .await??;

        Ok(entry)
    }

    async fn async_read_dir(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        per_page: Option<usize>,
        page: usize,
        is_ignored: IsIgnoredFn,
    ) -> Result<DirectoryListing, anyhow::Error> {
        let mut archive = self.archive.clone();
        let archive_created = self.archive_created;
        let mime_cache = self.mime_cache.clone();
        let sizes = self.sizes.clone();
        let path = path.as_ref().to_path_buf();

        let entries =
            tokio::task::spawn_blocking(move || -> Result<DirectoryListing, anyhow::Error> {
                let mut directory_entries = Vec::new();
                let mut other_entries = Vec::new();

                let path_len = path.components().count();
                for i in 0..archive.len() {
                    let entry = archive.by_index(i)?;
                    let name = match entry.enclosed_name() {
                        Some(name) => name,
                        None => continue,
                    };

                    let name_len = name.components().count();
                    if name_len < path_len
                        || !name.starts_with(&path)
                        || name == path
                        || name_len > path_len + 1
                    {
                        continue;
                    }

                    if (is_ignored)(Self::zip_entry_to_file_type(&entry), name).is_none() {
                        continue;
                    }

                    if entry.is_dir() {
                        directory_entries.push((i, entry.name().to_string()));
                    } else {
                        other_entries.push((i, entry.name().to_string()));
                    }
                }

                directory_entries.sort_unstable_by(|a, b| a.1.cmp(&b.1));
                other_entries.sort_unstable_by(|a, b| a.1.cmp(&b.1));

                let total_entries = directory_entries.len() + other_entries.len();
                let mut entries = Vec::new();

                if let Some(per_page) = per_page {
                    let start = (page - 1) * per_page;

                    for (entry_index, _) in directory_entries
                        .into_iter()
                        .chain(other_entries.into_iter())
                        .skip(start)
                        .take(per_page)
                    {
                        let entry = archive.by_index(entry_index)?;
                        let entry_path = match entry.enclosed_name() {
                            Some(name) => name,
                            None => continue,
                        };

                        entries.push(Self::zip_entry_to_directory_entry(
                            &archive_created,
                            &entry_path,
                            entry_index,
                            &mime_cache,
                            &sizes,
                            None,
                            entry,
                        ));
                    }
                } else {
                    for (entry_index, _) in directory_entries
                        .into_iter()
                        .chain(other_entries.into_iter())
                    {
                        let entry = archive.by_index(entry_index)?;
                        let entry_path = match entry.enclosed_name() {
                            Some(name) => name,
                            None => continue,
                        };

                        entries.push(Self::zip_entry_to_directory_entry(
                            &archive_created,
                            &entry_path,
                            entry_index,
                            &mime_cache,
                            &sizes,
                            None,
                            entry,
                        ));
                    }
                }

                Ok(DirectoryListing {
                    total_entries,
                    entries,
                })
            })
            .await??;

        Ok(entries)
    }

    async fn async_walk_dir<'a>(
        &'a self,
        path: &(dyn AsRef<Path> + Send + Sync),
        is_ignored: IsIgnoredFn,
    ) -> Result<Box<dyn DirectoryWalk + Send + Sync + 'a>, anyhow::Error> {
        struct IgnoreAsyncWalkDir {
            path: PathBuf,
            archive: zip::ZipArchive<MultiReader>,
            current_index: usize,
            is_ignored: IsIgnoredFn,
        }

        #[async_trait::async_trait]
        impl DirectoryWalk for IgnoreAsyncWalkDir {
            async fn next_entry(&mut self) -> Option<Result<(FileType, PathBuf), anyhow::Error>> {
                while self.current_index < self.archive.len() {
                    let entry = self.archive.by_index(self.current_index).ok()?;
                    self.current_index += 1;

                    let name = match entry.enclosed_name() {
                        Some(name) => name.to_path_buf(),
                        None => continue,
                    };

                    if !name.starts_with(&self.path) || name == self.path {
                        continue;
                    }

                    let file_type = VirtualZipArchive::zip_entry_to_file_type(&entry);

                    if let Some(name) = (self.is_ignored)(file_type, name.to_path_buf()) {
                        return Some(Ok((file_type, name)));
                    }
                }
                None
            }
        }

        Ok(Box::new(IgnoreAsyncWalkDir {
            path: path.as_ref().to_path_buf(),
            archive: self.archive.clone(),
            current_index: 0,
            is_ignored,
        }))
    }

    async fn async_walk_dir_stream<'a>(
        &'a self,
        path: &(dyn AsRef<Path> + Send + Sync),
        is_ignored: IsIgnoredFn,
    ) -> Result<Box<dyn DirectoryStreamWalk + Send + Sync + 'a>, anyhow::Error> {
        struct IgnoreAsyncWalkDir {
            path: PathBuf,
            archive: zip::ZipArchive<MultiReader>,
            current_index: usize,
            is_ignored: IsIgnoredFn,
        }

        #[async_trait::async_trait]
        impl DirectoryStreamWalk for IgnoreAsyncWalkDir {
            async fn next_entry(
                &mut self,
            ) -> Option<Result<(FileType, PathBuf, AsyncReadableFileStream), anyhow::Error>>
            {
                while self.current_index < self.archive.len() {
                    let entry = self.archive.by_index(self.current_index).ok()?;
                    let i = self.current_index;
                    self.current_index += 1;

                    let name = match entry.enclosed_name() {
                        Some(name) => name.to_path_buf(),
                        None => continue,
                    };

                    if !name.starts_with(&self.path) || name == self.path {
                        continue;
                    }

                    let file_type = VirtualZipArchive::zip_entry_to_file_type(&entry);

                    if let Some(name) = (self.is_ignored)(file_type, name) {
                        if entry.is_file() {
                            let (reader, mut writer) = tokio::io::simplex(crate::BUFFER_SIZE);

                            drop(entry);

                            tokio::task::spawn_blocking({
                                let runtime = tokio::runtime::Handle::current();
                                let mut archive = self.archive.clone();

                                move || {
                                    let mut entry = archive.by_index(i).unwrap();

                                    let mut buffer = vec![0; crate::BUFFER_SIZE];
                                    loop {
                                        match entry.read(&mut buffer) {
                                            Ok(0) => break,
                                            Ok(n) => {
                                                if runtime
                                                    .block_on(writer.write_all(&buffer[..n]))
                                                    .is_err()
                                                {
                                                    break;
                                                }
                                            }
                                            Err(err) => {
                                                tracing::error!(
                                                    "error reading from zip entry: {:?}",
                                                    err
                                                );
                                                break;
                                            }
                                        }
                                    }

                                    runtime.block_on(writer.shutdown()).ok();
                                }
                            });

                            return Some(Ok((file_type, name, Box::new(reader))));
                        } else {
                            return Some(Ok((file_type, name, Box::new(tokio::io::empty()))));
                        }
                    }
                }
                None
            }
        }

        Ok(Box::new(IgnoreAsyncWalkDir {
            path: path.as_ref().to_path_buf(),
            archive: self.archive.clone(),
            current_index: 0,
            is_ignored,
        }))
    }

    fn read_file(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        _range: Option<ByteRange>,
    ) -> Result<FileRead, anyhow::Error> {
        let mut archive = self.archive.clone();
        let size = archive.better_by_path(path.as_ref())?.size();

        #[ouroboros::self_referencing]
        pub struct ZipFileReader {
            archive: zip::ZipArchive<MultiReader>,

            #[borrows(mut archive)]
            #[covariant]
            entry: zip::read::ZipFile<'this, MultiReader>,
        }

        impl std::io::Read for ZipFileReader {
            fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
                self.with_entry_mut(|entry| entry.read(buf))
            }
        }

        Ok(FileRead {
            size,
            total_size: size,
            reader_range: None,
            reader: Box::new(ZipFileReader::try_new(archive, |archive| {
                archive.better_by_path(path.as_ref())
            })?),
        })
    }
    async fn async_read_file(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        _range: Option<ByteRange>,
    ) -> Result<AsyncFileRead, anyhow::Error> {
        let mut archive = self.archive.clone();

        let size = archive.better_by_path(path.as_ref())?.size();
        let (simplex_reader, mut writer) = tokio::io::simplex(crate::BUFFER_SIZE);

        let path = path.as_ref().to_path_buf();
        tokio::task::spawn_blocking(move || {
            let runtime = tokio::runtime::Handle::current();
            let mut entry = archive.better_by_path(&path).unwrap();

            let mut buffer = vec![0; crate::BUFFER_SIZE];
            loop {
                match entry.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(n) => {
                        if runtime.block_on(writer.write_all(&buffer[..n])).is_err() {
                            break;
                        }
                    }
                    Err(err) => {
                        tracing::error!("error reading from zip entry: {:?}", err);
                        break;
                    }
                }
            }

            runtime.block_on(writer.shutdown()).ok();
        });

        Ok(AsyncFileRead {
            size,
            total_size: size,
            reader_range: None,
            reader: Box::new(simplex_reader),
        })
    }

    fn read_symlink(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<PathBuf, anyhow::Error> {
        let mut archive = self.archive.clone();
        let mut entry = archive.better_by_path(path.as_ref())?;

        if entry.size() > 1024 {
            return Err(anyhow::anyhow!(
                "symlink target size exceeds maximum allowed size"
            ));
        }
        if !entry.is_symlink() {
            return Err(anyhow::anyhow!("not a symlink"));
        }

        let mut symlink_target = String::new();
        entry.read_to_string(&mut symlink_target)?;

        Ok(PathBuf::from(symlink_target))
    }
    async fn async_read_symlink(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<PathBuf, anyhow::Error> {
        let mut archive = self.archive.clone();
        let entry = archive.better_by_path(path.as_ref())?;

        if entry.size() > 1024 {
            return Err(anyhow::anyhow!(
                "symlink target size exceeds maximum allowed size"
            ));
        }
        if !entry.is_symlink() {
            return Err(anyhow::anyhow!("not a symlink"));
        }

        drop(entry);

        let path = path.as_ref().to_path_buf();
        let symlink_target =
            tokio::task::spawn_blocking(move || -> Result<String, anyhow::Error> {
                let mut entry = archive.better_by_path(&path)?;
                let mut symlink_target = String::new();
                entry.read_to_string(&mut symlink_target)?;
                Ok(symlink_target)
            })
            .await??;

        Ok(PathBuf::from(symlink_target))
    }

    async fn async_read_dir_archive(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        archive_format: StreamableArchiveFormat,
        compression_level: CompressionLevel,
        bytes_archived: Option<Arc<AtomicU64>>,
        is_ignored: IsIgnoredFn,
    ) -> Result<tokio::io::ReadHalf<tokio::io::SimplexStream>, anyhow::Error> {
        let mut archive = self.archive.clone();
        let path = path.as_ref().to_path_buf();

        let (simplex_reader, writer) = tokio::io::simplex(crate::BUFFER_SIZE);

        match archive_format {
            StreamableArchiveFormat::Zip => {
                crate::spawn_blocking_handled(move || -> Result<(), anyhow::Error> {
                    let writer = tokio_util::io::SyncIoBridge::new(writer);
                    let mut zip = zip::ZipWriter::new_stream(writer);

                    for i in 0..archive.len() {
                        let entry = archive.by_index(i)?;
                        let name = match entry.enclosed_name() {
                            Some(name) => name,
                            None => continue,
                        };

                        let name = match name.strip_prefix(&path) {
                            Ok(name) => name,
                            Err(_) => continue,
                        };

                        if name.components().count() == 0 {
                            continue;
                        }

                        if (is_ignored)(
                            VirtualZipArchive::zip_entry_to_file_type(&entry),
                            name.to_path_buf(),
                        )
                        .is_none()
                        {
                            continue;
                        }

                        if entry.is_dir() {
                            zip.add_directory(name.to_string_lossy(), entry.options())?;
                        } else {
                            let entry_size = entry.size();
                            zip.raw_copy_file_to_path(entry, name)?;
                            if let Some(bytes_archived) = &bytes_archived {
                                bytes_archived.fetch_add(entry_size, Ordering::SeqCst);
                            }
                        }
                    }

                    let mut inner = zip.finish()?.into_inner();
                    inner.flush()?;
                    inner.shutdown()?;

                    Ok(())
                });
            }
            _ => {
                let writer = CompressionWriter::new(
                    tokio_util::io::SyncIoBridge::new(writer),
                    archive_format.compression_format(),
                    compression_level,
                    self.server.app_state.config.api.file_compression_threads,
                )?;

                crate::spawn_blocking_handled(move || -> Result<(), anyhow::Error> {
                    let mut tar = tar::Builder::new(writer);
                    tar.mode(tar::HeaderMode::Complete);

                    for i in 0..archive.len() {
                        let entry = archive.by_index(i)?;
                        let name = match entry.enclosed_name() {
                            Some(name) => name,
                            None => continue,
                        };

                        let name = match name.strip_prefix(&path) {
                            Ok(name) => name,
                            Err(_) => continue,
                        };

                        if name.components().count() == 0 {
                            continue;
                        }

                        if (is_ignored)(
                            VirtualZipArchive::zip_entry_to_file_type(&entry),
                            name.to_path_buf(),
                        )
                        .is_none()
                        {
                            continue;
                        }

                        let mut entry_header = tar::Header::new_gnu();
                        entry_header.set_size(0);
                        if let Some(mode) = entry.unix_mode() {
                            entry_header.set_mode(mode);
                        }
                        entry_header.set_mtime(
                            zip_entry_get_modified_time(&entry)
                                .map(|dt| {
                                    dt.into_std()
                                        .duration_since(std::time::UNIX_EPOCH)
                                        .unwrap_or_default()
                                        .as_secs()
                                })
                                .unwrap_or_default(),
                        );

                        if entry.is_dir() {
                            entry_header.set_entry_type(tar::EntryType::Directory);

                            tar.append_data(&mut entry_header, name, std::io::empty())?;
                        } else if entry.is_file() {
                            entry_header.set_entry_type(tar::EntryType::Regular);
                            entry_header.set_size(entry.size());

                            let reader: Box<dyn Read> = match &bytes_archived {
                                Some(bytes_archived) => {
                                    Box::new(CountingReader::new_with_bytes_read(
                                        entry,
                                        Arc::clone(bytes_archived),
                                    ))
                                }
                                None => Box::new(entry),
                            };

                            tar.append_data(&mut entry_header, name, reader)?;
                        } else if entry.is_symlink() && (1..=2048).contains(&entry.size()) {
                            entry_header.set_entry_type(tar::EntryType::Symlink);

                            let link_name = std::io::read_to_string(entry)?;
                            tar.append_link(&mut entry_header, name, link_name)?;
                        }
                    }

                    tar.finish()?;
                    let mut inner = tar.into_inner()?.finish()?;
                    inner.flush()?;
                    inner.shutdown()?;

                    Ok(())
                });
            }
        }

        Ok(simplex_reader)
    }
}
