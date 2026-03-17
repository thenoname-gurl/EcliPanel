use crate::server::filesystem::virtualfs::IsIgnoredFn;
use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{Arc, RwLock},
};
use tokio::sync::Semaphore;

#[derive(Clone, Copy, Debug)]
pub enum FileType {
    File,
    Dir,
    Symlink,
    Unknown,
}

impl FileType {
    #[inline]
    pub fn is_file(self) -> bool {
        matches!(self, FileType::File)
    }

    #[inline]
    pub fn is_dir(self) -> bool {
        matches!(self, FileType::Dir)
    }

    #[inline]
    pub fn is_symlink(self) -> bool {
        matches!(self, FileType::Symlink)
    }
}

impl From<cap_std::fs::FileType> for FileType {
    fn from(ft: cap_std::fs::FileType) -> Self {
        match () {
            _ if ft.is_file() => FileType::File,
            _ if ft.is_dir() => FileType::Dir,
            _ if ft.is_symlink() => FileType::Symlink,
            _ => FileType::Unknown,
        }
    }
}

impl From<std::fs::FileType> for FileType {
    fn from(ft: std::fs::FileType) -> Self {
        match () {
            _ if ft.is_file() => FileType::File,
            _ if ft.is_dir() => FileType::Dir,
            _ if ft.is_symlink() => FileType::Symlink,
            _ => FileType::Unknown,
        }
    }
}

pub struct AsyncCapReadDir(
    pub Option<cap_std::fs::ReadDir>,
    pub Option<VecDeque<std::io::Result<(FileType, String)>>>,
);

impl AsyncCapReadDir {
    async fn next_entry(&mut self) -> Option<std::io::Result<(FileType, String)>> {
        if let Some(buffer) = self.1.as_mut()
            && !buffer.is_empty()
        {
            return buffer.pop_front();
        }

        let mut read_dir = self.0.take()?;
        let mut buffer = self.1.take()?;

        match tokio::task::spawn_blocking(move || {
            for _ in 0..32 {
                if let Some(entry) = read_dir.next() {
                    buffer.push_back(entry.map(|e| {
                        (
                            e.file_type().map_or(FileType::Unknown, FileType::from),
                            e.file_name().to_string_lossy().to_string(),
                        )
                    }));
                } else {
                    break;
                }
            }

            (buffer, read_dir)
        })
        .await
        {
            Ok((buffer, read_dir)) => {
                self.0 = Some(read_dir);
                self.1 = Some(buffer);

                self.1.as_mut()?.pop_front()
            }
            Err(_) => None,
        }
    }
}

pub struct AsyncTokioReadDir(pub tokio::fs::ReadDir);

impl AsyncTokioReadDir {
    async fn next_entry(&mut self) -> Option<std::io::Result<(FileType, String)>> {
        match self.0.next_entry().await {
            Ok(Some(entry)) => Some(Ok((
                entry
                    .file_type()
                    .await
                    .map_or(FileType::Unknown, FileType::from),
                entry.file_name().to_string_lossy().to_string(),
            ))),
            Ok(None) => None,
            Err(err) => Some(Err(err)),
        }
    }
}

pub enum AsyncReadDir {
    Cap(AsyncCapReadDir),
    Tokio(AsyncTokioReadDir),
}

impl AsyncReadDir {
    pub async fn next_entry(&mut self) -> Option<std::io::Result<(FileType, String)>> {
        match self {
            AsyncReadDir::Cap(read_dir) => read_dir.next_entry().await,
            AsyncReadDir::Tokio(read_dir) => read_dir.next_entry().await,
        }
    }
}

pub struct CapReadDir(pub cap_std::fs::ReadDir);

impl CapReadDir {
    pub fn next_entry(&mut self) -> Option<std::io::Result<(FileType, String)>> {
        match self.0.next() {
            Some(Ok(entry)) => Some(Ok((
                entry.file_type().map_or(FileType::Unknown, FileType::from),
                entry.file_name().to_string_lossy().to_string(),
            ))),
            Some(Err(err)) => Some(Err(err)),
            None => None,
        }
    }
}

pub struct StdReadDir(pub std::fs::ReadDir);

impl StdReadDir {
    pub fn next_entry(&mut self) -> Option<std::io::Result<(FileType, String)>> {
        match self.0.next() {
            Some(Ok(entry)) => Some(Ok((
                entry.file_type().map_or(FileType::Unknown, FileType::from),
                entry.file_name().to_string_lossy().to_string(),
            ))),
            Some(Err(err)) => Some(Err(err)),
            None => None,
        }
    }
}

pub enum ReadDir {
    Cap(CapReadDir),
    Std(StdReadDir),
}

impl ReadDir {
    pub fn next_entry(&mut self) -> Option<std::io::Result<(FileType, String)>> {
        match self {
            ReadDir::Cap(read_dir) => read_dir.next_entry(),
            ReadDir::Std(read_dir) => read_dir.next_entry(),
        }
    }
}

pub struct AsyncWalkDir {
    cap_filesystem: super::CapFilesystem,
    stack: Vec<(PathBuf, AsyncReadDir)>,
    is_ignored: IsIgnoredFn,
}

impl AsyncWalkDir {
    pub async fn new(
        cap_filesystem: super::CapFilesystem,
        path: PathBuf,
    ) -> Result<Self, anyhow::Error> {
        let read_dir = cap_filesystem.async_read_dir(&path).await?;

        Ok(Self {
            cap_filesystem,
            stack: vec![(path, read_dir)],
            is_ignored: IsIgnoredFn::default(),
        })
    }

    pub fn with_is_ignored(mut self, is_ignored: IsIgnoredFn) -> Self {
        self.is_ignored = is_ignored;
        self
    }

    pub async fn next_entry(&mut self) -> Option<Result<(FileType, PathBuf), anyhow::Error>> {
        'stack: while let Some((parent_path, read_dir)) = self.stack.last_mut() {
            match read_dir.next_entry().await {
                Some(Ok((file_type, name))) => {
                    let full_path = parent_path.join(&name);

                    let Some(full_path) = (self.is_ignored)(file_type, full_path) else {
                        continue 'stack;
                    };

                    if file_type.is_dir() {
                        match self.cap_filesystem.async_read_dir(&full_path).await {
                            Ok(dir) => self.stack.push((full_path.clone(), dir)),
                            Err(err) => return Some(Err(err)),
                        };
                    }

                    return Some(Ok((file_type, full_path)));
                }
                Some(Err(err)) => return Some(Err(err.into())),
                None => {
                    self.stack.pop();
                }
            }
        }

        None
    }

    pub async fn run_multithreaded<F, Fut>(
        &mut self,
        threads: usize,
        func: Arc<F>,
    ) -> Result<(), anyhow::Error>
    where
        F: Fn(FileType, PathBuf) -> Fut + Send + Sync + 'static,
        Fut: futures::Future<Output = Result<(), anyhow::Error>> + Send + 'static,
    {
        let semaphore = Arc::new(Semaphore::new(threads));
        let error = Arc::new(RwLock::new(None));

        while let Some(entry) = self.next_entry().await {
            match entry {
                Ok((file_type, path)) => {
                    let semaphore = Arc::clone(&semaphore);
                    let error = Arc::clone(&error);
                    let func = Arc::clone(&func);

                    if crate::unlikely(error.read().unwrap().is_some()) {
                        break;
                    }

                    let permit = match semaphore.acquire_owned().await {
                        Ok(permit) => permit,
                        Err(_) => break,
                    };
                    tokio::spawn(async move {
                        let _permit = permit;
                        match func(file_type, path).await {
                            Ok(_) => {}
                            Err(err) => {
                                *error.write().unwrap() = Some(err);
                            }
                        }
                    });
                }
                Err(err) => return Err(err),
            }
        }

        semaphore.acquire_many(threads as u32).await.ok();

        if let Some(err) = error.write().unwrap().take() {
            return Err(err);
        }

        Ok(())
    }
}

pub struct WalkDir {
    cap_filesystem: super::CapFilesystem,
    stack: Vec<(PathBuf, ReadDir)>,
    is_ignored: IsIgnoredFn,
}

impl WalkDir {
    pub fn new(cap_filesystem: super::CapFilesystem, path: PathBuf) -> Result<Self, anyhow::Error> {
        let read_dir = cap_filesystem.read_dir(&path)?;

        Ok(Self {
            cap_filesystem,
            stack: vec![(path, read_dir)],
            is_ignored: IsIgnoredFn::default(),
        })
    }

    pub fn with_is_ignored(mut self, is_ignored: IsIgnoredFn) -> Self {
        self.is_ignored = is_ignored;
        self
    }

    pub fn next_entry(&mut self) -> Option<Result<(FileType, PathBuf), anyhow::Error>> {
        'stack: while let Some((parent_path, read_dir)) = self.stack.last_mut() {
            match read_dir.next_entry() {
                Some(Ok((file_type, name))) => {
                    let full_path = parent_path.join(&name);

                    let Some(full_path) = (self.is_ignored)(file_type, full_path) else {
                        continue 'stack;
                    };

                    if file_type.is_dir() {
                        match self.cap_filesystem.read_dir(&full_path) {
                            Ok(dir) => self.stack.push((full_path.clone(), dir)),
                            Err(err) => return Some(Err(err)),
                        };
                    }

                    return Some(Ok((file_type, full_path)));
                }
                Some(Err(err)) => {
                    return Some(Err(err.into()));
                }
                None => {
                    self.stack.pop();
                }
            }
        }

        None
    }
}
