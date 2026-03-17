use crate::{
    io::{
        compression::{CompressionLevel, writer::CompressionWriter},
        counting_reader::CountingReader,
    },
    models::DirectoryEntry,
    routes::MimeCacheValue,
    server::filesystem::{
        archive::{StreamableArchiveFormat, multi_reader::MultiReader},
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
use chrono::{Datelike, Timelike};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};
use tokio::io::AsyncWriteExt;

#[derive(Clone)]
pub struct VirtualSevenZipArchive {
    pub server: crate::server::Server,
    pub archive: Arc<sevenz_rust2::Archive>,
    pub archive_created: chrono::DateTime<chrono::Utc>,
    pub mime_cache: moka::sync::Cache<usize, MimeCacheValue>,
    pub reader: MultiReader,
    pub sizes: Arc<Vec<(UsedSpace, PathBuf)>>,
}

impl VirtualSevenZipArchive {
    pub fn new(
        server: crate::server::Server,
        archive: Arc<sevenz_rust2::Archive>,
        archive_created: chrono::DateTime<chrono::Utc>,
        reader: MultiReader,
    ) -> Self {
        let mut sizes = archive
            .files
            .iter()
            .map(|entry| {
                (
                    UsedSpace::new(entry.size, entry.compressed_size),
                    PathBuf::from(&entry.name),
                )
            })
            .collect::<Vec<_>>();
        sizes.shrink_to_fit();

        Self {
            server,
            archive,
            archive_created,
            mime_cache: moka::sync::Cache::new(10240),
            reader,
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

        let archive = tokio::task::spawn_blocking({
            let mut reader = reader.clone();

            move || {
                let password = sevenz_rust2::Password::empty();
                sevenz_rust2::Archive::read(&mut reader, &password)
            }
        })
        .await??;

        let metadata = server.filesystem.async_metadata(archive_path).await?;

        Ok(Self::new(
            server,
            Arc::new(archive),
            metadata
                .created()
                .map_or_else(|_| Default::default(), |dt| dt.into_std().into()),
            reader,
        ))
    }

    #[allow(clippy::too_many_arguments)]
    fn seven_zip_entry_to_directory_entry(
        archive_created: &chrono::DateTime<chrono::Utc>,
        path: &Path,
        entry_index: usize,
        mime_cache: &moka::sync::Cache<usize, MimeCacheValue>,
        sizes: &[(UsedSpace, PathBuf)],
        buffer: Option<&[u8]>,
        entry: &sevenz_rust2::ArchiveEntry,
        reader: &mut dyn Read,
    ) -> DirectoryEntry {
        let (size, size_physical) = if entry.is_directory() {
            let space: UsedSpace = sizes
                .iter()
                .filter(|(_, name)| name.starts_with(path))
                .map(|(size, _)| *size)
                .sum();

            (space.get_logical(), space.get_physical())
        } else {
            (entry.size, entry.compressed_size)
        };

        let mime_type = if entry.is_directory() {
            (false, "inode/directory").into()
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
            let buffer = if reader.read(&mut buffer).is_err() {
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

        let mode = if entry.is_directory() { 0o755 } else { 0o644 };

        DirectoryEntry {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            mode: encode_mode(mode),
            mode_bits: compact_str::format_compact!("{:o}", mode),
            size,
            size_physical,
            editable: !entry.is_directory() && mime_type.valid_utf8,
            directory: entry.is_directory(),
            file: !entry.is_directory(),
            symlink: false,
            mime: mime_type.mime,
            modified: if entry.has_last_modified_date {
                std::time::SystemTime::from(entry.last_modified_date).into()
            } else {
                Default::default()
            },
            created: if entry.has_creation_date {
                std::time::SystemTime::from(entry.creation_date).into()
            } else {
                *archive_created
            },
        }
    }

    fn seven_zip_entry_to_file_type(entry: &sevenz_rust2::ArchiveEntry) -> FileType {
        if entry.is_directory() {
            FileType::Dir
        } else {
            FileType::File
        }
    }
}

#[async_trait::async_trait]
impl VirtualReadableFilesystem for VirtualSevenZipArchive {
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

        let archive = self.archive.clone();
        let path = path.as_ref();

        let entry = archive
            .files
            .iter()
            .find(|entry| Path::new(entry.name()) == path)
            .ok_or_else(|| anyhow::anyhow!("Entry not found"))?;

        Ok(FileMetadata {
            file_type: Self::seven_zip_entry_to_file_type(entry),
            permissions: if entry.is_directory() {
                cap_std::fs::Permissions::from_portable_mode(0o755)
            } else {
                cap_std::fs::Permissions::from_portable_mode(0o644)
            },
            size: entry.size(),
            modified: if entry.has_last_modified_date {
                Some(std::time::SystemTime::from(entry.last_modified_date))
            } else {
                None
            },
            created: if entry.has_creation_date {
                Some(std::time::SystemTime::from(entry.creation_date))
            } else {
                None
            },
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
        let archive = self.archive.clone();
        let archive_created = self.archive_created;
        let mime_cache = self.mime_cache.clone();
        let sizes = self.sizes.clone();
        let mut reader = self.reader.clone();
        let path = path.as_ref().to_path_buf();

        let entry = tokio::task::spawn_blocking(move || {
            let (entry_index, entry) = archive
                .files
                .iter()
                .enumerate()
                .find(|(_, entry)| Path::new(entry.name()) == path)
                .ok_or_else(|| anyhow::anyhow!("Entry not found"))?;

            match archive.stream_map.file_block_index[entry_index] {
                Some(block_index)
                    if !mime_cache.contains_key(&entry_index) && !entry.is_directory() =>
                {
                    let password = sevenz_rust2::Password::empty();
                    let folder = sevenz_rust2::BlockDecoder::new(
                        1,
                        block_index,
                        &archive,
                        &password,
                        &mut reader,
                    );

                    let mut result = None;

                    folder
                        .for_each_entries(&mut |block_entry, reader| {
                            if block_entry.name() == entry.name() {
                                result = Some(Self::seven_zip_entry_to_directory_entry(
                                    &archive_created,
                                    &path,
                                    entry_index,
                                    &mime_cache,
                                    &sizes,
                                    None,
                                    entry,
                                    reader,
                                ));
                                return Ok(true);
                            }
                            std::io::copy(reader, &mut std::io::sink())?;
                            Ok(false)
                        })
                        .ok();

                    result.ok_or_else(|| anyhow::anyhow!("Failed to read 7z entry for metadata"))
                }
                _ => Ok(Self::seven_zip_entry_to_directory_entry(
                    &archive_created,
                    &path,
                    entry_index,
                    &mime_cache,
                    &sizes,
                    None,
                    entry,
                    &mut std::io::empty(),
                )),
            }
        })
        .await??;

        Ok(entry)
    }

    async fn async_directory_entry_buffer(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        buffer: &[u8],
    ) -> Result<DirectoryEntry, anyhow::Error> {
        let archive = self.archive.clone();
        let archive_created = self.archive_created;
        let mime_cache = self.mime_cache.clone();
        let sizes = self.sizes.clone();
        let path = path.as_ref().to_path_buf();
        let buffer = buffer.to_owned();

        let entry = tokio::task::spawn_blocking(move || {
            let (entry_index, entry) = archive
                .files
                .iter()
                .enumerate()
                .find(|(_, entry)| Path::new(entry.name()) == path)
                .ok_or_else(|| anyhow::anyhow!("Entry not found"))?;

            Ok::<_, anyhow::Error>(Self::seven_zip_entry_to_directory_entry(
                &archive_created,
                &path,
                entry_index,
                &mime_cache,
                &sizes,
                Some(&buffer),
                entry,
                &mut std::io::empty(),
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
        let archive = self.archive.clone();
        let archive_created = self.archive_created;
        let mime_cache = self.mime_cache.clone();
        let mut reader = self.reader.clone();
        let sizes = self.sizes.clone();
        let path = path.as_ref().to_path_buf();

        let entries =
            tokio::task::spawn_blocking(move || -> Result<DirectoryListing, anyhow::Error> {
                let mut directory_entries = Vec::new();
                let mut other_entries = Vec::new();

                let path_len = path.components().count();
                for (i, entry) in archive.files.iter().enumerate() {
                    let name = Path::new(entry.name());

                    let name_len = name.components().count();
                    if name_len < path_len
                        || !name.starts_with(&path)
                        || name == path
                        || name_len > path_len + 1
                    {
                        continue;
                    }

                    if (is_ignored)(
                        Self::seven_zip_entry_to_file_type(entry),
                        name.to_path_buf(),
                    )
                    .is_none()
                    {
                        continue;
                    }

                    if entry.is_directory() {
                        directory_entries.push((i, entry.name()));
                    } else {
                        other_entries.push((i, entry.name()));
                    }
                }

                directory_entries.sort_unstable_by(|a, b| a.1.cmp(b.1));
                other_entries.sort_unstable_by(|a, b| a.1.cmp(b.1));

                let total_entries = directory_entries.len() + other_entries.len();
                let mut entries = Vec::new();

                let iterator = directory_entries
                    .into_iter()
                    .chain(other_entries.into_iter());

                let target_entries: Vec<(usize, &str)> = if let Some(per_page) = per_page {
                    let start = (page - 1) * per_page;
                    iterator.skip(start).take(per_page).collect()
                } else {
                    iterator.collect()
                };

                for (entry_index, _) in target_entries {
                    let archive_entry = &archive.files[entry_index];
                    let entry_path = Path::new(archive_entry.name());

                    let needs_read =
                        !archive_entry.is_directory() && !mime_cache.contains_key(&entry_index);

                    match archive.stream_map.file_block_index[entry_index] {
                        Some(block_index) if needs_read => {
                            let password = sevenz_rust2::Password::empty();
                            let folder = sevenz_rust2::BlockDecoder::new(
                                1,
                                block_index,
                                &archive,
                                &password,
                                &mut reader,
                            );

                            let mut entry_processed = false;
                            folder.for_each_entries(&mut |entry, reader| {
                                let path = entry.name();
                                if path != archive_entry.name() {
                                    std::io::copy(reader, &mut std::io::sink())?;
                                    return Ok(true);
                                }

                                entries.push(Self::seven_zip_entry_to_directory_entry(
                                    &archive_created,
                                    entry_path,
                                    entry_index,
                                    &mime_cache,
                                    &sizes,
                                    None,
                                    archive_entry,
                                    reader,
                                ));
                                entry_processed = true;
                                Ok(false)
                            })?;

                            if !entry_processed {
                                entries.push(Self::seven_zip_entry_to_directory_entry(
                                    &archive_created,
                                    entry_path,
                                    entry_index,
                                    &mime_cache,
                                    &sizes,
                                    None,
                                    archive_entry,
                                    &mut std::io::empty(),
                                ));
                            }
                        }
                        _ => entries.push(Self::seven_zip_entry_to_directory_entry(
                            &archive_created,
                            entry_path,
                            entry_index,
                            &mime_cache,
                            &sizes,
                            None,
                            archive_entry,
                            &mut std::io::empty(),
                        )),
                    };
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
        struct InMemoryWalkDir {
            path: PathBuf,
            archive: Arc<sevenz_rust2::Archive>,
            current_index: usize,
            is_ignored: IsIgnoredFn,
        }

        #[async_trait::async_trait]
        impl DirectoryWalk for InMemoryWalkDir {
            async fn next_entry(&mut self) -> Option<Result<(FileType, PathBuf), anyhow::Error>> {
                while self.current_index < self.archive.files.len() {
                    let entry = &self.archive.files[self.current_index];
                    self.current_index += 1;

                    let name = Path::new(entry.name());

                    if !name.starts_with(&self.path) || name == self.path {
                        continue;
                    }

                    let file_type = VirtualSevenZipArchive::seven_zip_entry_to_file_type(entry);

                    if let Some(name) = (self.is_ignored)(file_type, name.to_path_buf()) {
                        return Some(Ok((file_type, name)));
                    }
                }
                None
            }
        }

        Ok(Box::new(InMemoryWalkDir {
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
        let (tx, rx) = tokio::sync::mpsc::channel(4);

        let archive = self.archive.clone();
        let mut reader = self.reader.clone();
        let root_path = path.as_ref().to_path_buf();

        tokio::task::spawn_blocking(move || {
            let mut target_files_by_block: HashMap<usize, HashSet<String>> = HashMap::new();
            let mut loose_files: VecDeque<(String, FileType)> = VecDeque::new();

            for (i, entry) in archive.files.iter().enumerate() {
                let name_path = Path::new(entry.name());

                if !name_path.starts_with(&root_path) || name_path == root_path {
                    continue;
                }

                let file_type = VirtualSevenZipArchive::seven_zip_entry_to_file_type(entry);

                if (is_ignored)(file_type, name_path.to_path_buf()).is_some() {
                    if entry.is_directory() {
                        loose_files.push_back((entry.name().to_string(), file_type));
                    } else if let Some(block_index) = archive.stream_map.file_block_index[i] {
                        target_files_by_block
                            .entry(block_index)
                            .or_default()
                            .insert(entry.name().to_string());
                    } else {
                        loose_files.push_back((entry.name().to_string(), file_type));
                    }
                }
            }

            let runtime = tokio::runtime::Handle::current();

            while let Some((name, ft)) = loose_files.pop_front() {
                let res = Ok((
                    ft,
                    PathBuf::from(name),
                    Box::new(tokio::io::empty()) as AsyncReadableFileStream,
                ));
                if runtime.block_on(tx.send(res)).is_err() {
                    return;
                }
            }

            let mut sorted_blocks: Vec<_> = target_files_by_block.keys().cloned().collect();
            sorted_blocks.sort_unstable();

            for block_index in sorted_blocks {
                let targets = &target_files_by_block[&block_index];

                let password = sevenz_rust2::Password::empty();
                let folder = sevenz_rust2::BlockDecoder::new(
                    1,
                    block_index,
                    &archive,
                    &password,
                    &mut reader,
                );

                if let Err(err) = folder.for_each_entries(&mut |entry, entry_reader| {
                    if targets.contains(entry.name()) {
                        let (simplex_reader, mut simplex_writer) =
                            tokio::io::simplex(crate::BUFFER_SIZE);

                        let send_result = runtime.block_on(tx.send(Ok((
                            FileType::File,
                            PathBuf::from(entry.name()),
                            Box::new(simplex_reader),
                        ))));

                        if send_result.is_err() {
                            return Ok(false);
                        }

                        let mut buffer = vec![0; crate::BUFFER_SIZE];
                        loop {
                            match entry_reader.read(&mut buffer) {
                                Ok(0) => break,
                                Ok(n) => {
                                    if runtime
                                        .block_on(simplex_writer.write_all(&buffer[..n]))
                                        .is_err()
                                    {
                                        break;
                                    }
                                }
                                Err(err) => return Err(err.into()),
                            }
                        }

                        runtime.block_on(simplex_writer.shutdown()).ok();
                    } else {
                        std::io::copy(entry_reader, &mut std::io::sink())?;
                    }
                    Ok(true)
                }) {
                    tx.blocking_send(Err(err.into())).ok();
                    return;
                }
            }
        });

        struct ChannelStreamWalker {
            rx: tokio::sync::mpsc::Receiver<
                Result<(FileType, PathBuf, AsyncReadableFileStream), anyhow::Error>,
            >,
        }

        #[async_trait::async_trait]
        impl DirectoryStreamWalk for ChannelStreamWalker {
            async fn next_entry(
                &mut self,
            ) -> Option<Result<(FileType, PathBuf, AsyncReadableFileStream), anyhow::Error>>
            {
                self.rx.recv().await
            }
        }

        Ok(Box::new(ChannelStreamWalker { rx }))
    }

    fn read_file(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        _range: Option<ByteRange>,
    ) -> Result<FileRead, anyhow::Error> {
        let archive = self.archive.clone();
        let mut reader = self.reader.clone();
        let path = path.as_ref().to_path_buf();

        let (entry_index, size) = match archive
            .files
            .iter()
            .enumerate()
            .find(|f| Path::new(f.1.name()) == path)
        {
            Some((i, entry)) => (i, entry.size),
            None => return Err(anyhow::anyhow!("7z archive entry not found")),
        };

        let (pipe_reader, mut writer) = std::io::pipe()?;

        tokio::task::spawn_blocking(move || {
            if let Some(block_index) = archive.stream_map.file_block_index[entry_index] {
                let password = sevenz_rust2::Password::empty();
                let folder = sevenz_rust2::BlockDecoder::new(
                    1,
                    block_index,
                    &archive,
                    &password,
                    &mut reader,
                );

                let _ = folder.for_each_entries(&mut |entry, reader| {
                    let entry_path = Path::new(entry.name());
                    if entry_path != path {
                        std::io::copy(reader, &mut std::io::sink())?;
                        return Ok(true);
                    }

                    let mut buffer = vec![0; crate::BUFFER_SIZE];
                    loop {
                        match reader.read(&mut buffer) {
                            Ok(0) => break,
                            Ok(n) => {
                                if writer.write_all(&buffer[..n]).is_err() {
                                    break;
                                }
                            }
                            Err(err) => {
                                tracing::error!("error reading from 7z entry: {:#?}", err);
                                break;
                            }
                        }
                    }

                    Ok(true)
                });
            };
        });

        Ok(FileRead {
            size,
            total_size: size,
            reader_range: None,
            reader: Box::new(pipe_reader),
        })
    }
    async fn async_read_file(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        _range: Option<ByteRange>,
    ) -> Result<AsyncFileRead, anyhow::Error> {
        let archive = self.archive.clone();
        let mut reader = self.reader.clone();
        let path = path.as_ref().to_path_buf();

        let (entry_index, size) = match archive
            .files
            .iter()
            .enumerate()
            .find(|f| Path::new(f.1.name()) == path)
        {
            Some((i, entry)) => (i, entry.size),
            None => return Err(anyhow::anyhow!("7z archive entry not found")),
        };

        let (simplex_reader, mut writer) = tokio::io::simplex(crate::BUFFER_SIZE);

        tokio::task::spawn_blocking(move || {
            let runtime = tokio::runtime::Handle::current();

            if let Some(block_index) = archive.stream_map.file_block_index[entry_index] {
                let password = sevenz_rust2::Password::empty();
                let folder = sevenz_rust2::BlockDecoder::new(
                    1,
                    block_index,
                    &archive,
                    &password,
                    &mut reader,
                );

                let _ = folder.for_each_entries(&mut |entry, reader| {
                    let entry_path = Path::new(entry.name());
                    if entry_path != path {
                        std::io::copy(reader, &mut std::io::sink())?;
                        return Ok(true);
                    }

                    let mut buffer = vec![0; crate::BUFFER_SIZE];
                    loop {
                        match reader.read(&mut buffer) {
                            Ok(0) => break,
                            Ok(n) => {
                                if runtime.block_on(writer.write_all(&buffer[..n])).is_err() {
                                    break;
                                }
                            }
                            Err(err) => {
                                tracing::error!("error reading from 7z entry: {:#?}", err);
                                break;
                            }
                        }
                    }

                    Ok(true)
                });

                runtime.block_on(writer.shutdown()).ok();
            };
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
        _path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<PathBuf, anyhow::Error> {
        Err(anyhow::anyhow!("Symlinks not supported in 7z archives"))
    }
    async fn async_read_symlink(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
    ) -> Result<PathBuf, anyhow::Error> {
        self.read_symlink(path)
    }

    async fn async_read_dir_archive(
        &self,
        path: &(dyn AsRef<Path> + Send + Sync),
        archive_format: StreamableArchiveFormat,
        compression_level: CompressionLevel,
        bytes_archived: Option<Arc<AtomicU64>>,
        is_ignored: IsIgnoredFn,
    ) -> Result<tokio::io::ReadHalf<tokio::io::SimplexStream>, anyhow::Error> {
        let archive = self.archive.clone();
        let mut reader = self.reader.clone();
        let path = path.as_ref().to_path_buf();

        let (simplex_reader, writer) = tokio::io::simplex(crate::BUFFER_SIZE);

        match archive_format {
            StreamableArchiveFormat::Zip => {
                crate::spawn_blocking_handled(move || -> Result<(), anyhow::Error> {
                    let writer = tokio_util::io::SyncIoBridge::new(writer);
                    let mut zip = zip::ZipWriter::new_stream(writer);

                    let mut read_buffer = vec![0; crate::BUFFER_SIZE];
                    for (i, entry) in archive.files.iter().enumerate() {
                        let name = match Path::new(entry.name()).strip_prefix(&path) {
                            Ok(name) => name,
                            Err(_) => continue,
                        };

                        if name.components().count() == 0 {
                            continue;
                        }

                        if (is_ignored)(
                            VirtualSevenZipArchive::seven_zip_entry_to_file_type(entry),
                            name.to_path_buf(),
                        )
                        .is_none()
                        {
                            continue;
                        }

                        let mut zip_options: zip::write::FileOptions<'_, ()> =
                            zip::write::FileOptions::default()
                                .compression_level(
                                    Some(compression_level.to_deflate_level() as i64),
                                )
                                .large_file(true);

                        if entry.has_last_modified_date {
                            let mtime: chrono::DateTime<chrono::Utc> = chrono::DateTime::from(
                                std::time::SystemTime::from(entry.last_modified_date),
                            );

                            if let Ok(mtime) = zip::DateTime::from_date_and_time(
                                mtime.year() as u16,
                                mtime.month() as u8,
                                mtime.day() as u8,
                                mtime.hour() as u8,
                                mtime.minute() as u8,
                                mtime.second() as u8,
                            ) {
                                zip_options = zip_options.last_modified_time(mtime);
                            }
                        }

                        if entry.is_directory() {
                            zip.add_directory(name.to_string_lossy(), zip_options)?;
                        } else {
                            zip.start_file(name.to_string_lossy(), zip_options)?;

                            if let Some(block_index) = archive.stream_map.file_block_index[i] {
                                let password = sevenz_rust2::Password::empty();
                                let folder = sevenz_rust2::BlockDecoder::new(
                                    1,
                                    block_index,
                                    &archive,
                                    &password,
                                    &mut reader,
                                );

                                let entry_size = entry.size;

                                folder
                                    .for_each_entries(&mut |block_entry, reader| {
                                        if block_entry.name() != entry.name() {
                                            std::io::copy(reader, &mut std::io::sink())?;
                                            return Ok(true);
                                        }

                                        crate::io::copy_shared(&mut read_buffer, reader, &mut zip)?;

                                        if let Some(bytes_archived) = &bytes_archived {
                                            bytes_archived.fetch_add(entry_size, Ordering::SeqCst);
                                        }

                                        Ok(false)
                                    })
                                    .unwrap_or_default();
                            };
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

                    for (i, entry) in archive.files.iter().enumerate() {
                        let name = match Path::new(entry.name()).strip_prefix(&path) {
                            Ok(name) => name,
                            Err(_) => continue,
                        };

                        if name.components().count() == 0 {
                            continue;
                        }

                        if (is_ignored)(
                            VirtualSevenZipArchive::seven_zip_entry_to_file_type(entry),
                            name.to_path_buf(),
                        )
                        .is_none()
                        {
                            continue;
                        }

                        let mut entry_header = tar::Header::new_gnu();
                        entry_header.set_size(0);
                        if entry.has_last_modified_date {
                            entry_header.set_mtime(
                                std::time::SystemTime::from(entry.last_modified_date)
                                    .elapsed()
                                    .unwrap_or_default()
                                    .as_secs(),
                            );
                        }

                        if entry.is_directory() {
                            entry_header.set_entry_type(tar::EntryType::Directory);

                            tar.append_data(&mut entry_header, name, std::io::empty())?;
                        } else {
                            entry_header.set_entry_type(tar::EntryType::Regular);
                            entry_header.set_size(entry.size);

                            if let Some(block_index) = archive.stream_map.file_block_index[i] {
                                let password = sevenz_rust2::Password::empty();
                                let folder = sevenz_rust2::BlockDecoder::new(
                                    1,
                                    block_index,
                                    &archive,
                                    &password,
                                    &mut reader,
                                );

                                folder
                                    .for_each_entries(&mut |block_entry, reader| {
                                        if block_entry.name() != entry.name() {
                                            std::io::copy(reader, &mut std::io::sink())?;
                                            return Ok(true);
                                        }

                                        let reader: Box<dyn Read> = match &bytes_archived {
                                            Some(bytes_archived) => {
                                                Box::new(CountingReader::new_with_bytes_read(
                                                    reader,
                                                    Arc::clone(bytes_archived),
                                                ))
                                            }
                                            None => Box::new(reader),
                                        };

                                        tar.append_data(&mut entry_header, name, reader)?;

                                        Ok(false)
                                    })
                                    .unwrap_or_default();
                            };
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
