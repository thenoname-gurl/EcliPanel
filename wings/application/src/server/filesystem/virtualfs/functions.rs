use super::{AsyncReadableFileStream, FileType};
use std::{ops::Deref, path::PathBuf, sync::Arc};

type IsIgnoredFnInner = dyn Fn(FileType, PathBuf) -> Option<PathBuf> + Send + Sync + 'static;

#[derive(Clone)]
pub struct IsIgnoredFn(Arc<IsIgnoredFnInner>);

impl IsIgnoredFn {
    pub fn merge(self, other: IsIgnoredFn) -> IsIgnoredFn {
        IsIgnoredFn(Arc::new(move |file_type, path| {
            let path = (self.0)(file_type, path)?;
            (other.0)(file_type, path)
        }))
    }
}

impl Default for IsIgnoredFn {
    fn default() -> Self {
        Self(Arc::new(|_, path| Some(path)))
    }
}

impl Deref for IsIgnoredFn {
    type Target = IsIgnoredFnInner;

    fn deref(&self) -> &Self::Target {
        &*self.0
    }
}

impl From<ignore::gitignore::Gitignore> for IsIgnoredFn {
    fn from(gi: ignore::gitignore::Gitignore) -> Self {
        Self(Arc::new(move |file_type, path| {
            if gi.matched(&path, file_type.is_dir()).is_ignore() {
                None
            } else {
                Some(path)
            }
        }))
    }
}

impl From<Vec<ignore::gitignore::Gitignore>> for IsIgnoredFn {
    fn from(gis: Vec<ignore::gitignore::Gitignore>) -> Self {
        Self(Arc::new(move |file_type, path| {
            for gi in &gis {
                if gi.matched(&path, file_type.is_dir()).is_ignore() {
                    return None;
                }
            }
            Some(path)
        }))
    }
}

impl<T: Fn(FileType, PathBuf) -> Option<PathBuf> + Send + Sync + 'static> From<T> for IsIgnoredFn {
    fn from(f: T) -> Self {
        Self(Arc::new(f))
    }
}

type DirectoryWalkFnInner =
    dyn Fn(FileType, PathBuf) -> Result<(), anyhow::Error> + Send + Sync + 'static;

#[derive(Clone)]
pub struct DirectoryWalkFn(Arc<DirectoryWalkFnInner>);

impl<T: Fn(FileType, PathBuf) -> Result<(), anyhow::Error> + Send + Sync + 'static> From<T>
    for DirectoryWalkFn
{
    fn from(f: T) -> Self {
        Self(Arc::new(f))
    }
}

impl Deref for DirectoryWalkFn {
    type Target = DirectoryWalkFnInner;

    fn deref(&self) -> &Self::Target {
        &*self.0
    }
}

type AsyncDirectoryWalkFnInner = dyn Fn(FileType, PathBuf) -> futures::future::BoxFuture<'static, Result<(), anyhow::Error>>
    + Send
    + Sync
    + 'static;

#[derive(Clone)]
pub struct AsyncDirectoryWalkFn(Arc<AsyncDirectoryWalkFnInner>);

impl<
    T: Fn(FileType, PathBuf) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<(), anyhow::Error>> + Send + 'static,
> From<T> for AsyncDirectoryWalkFn
{
    fn from(f: T) -> Self {
        Self(Arc::new(move |file_type, path| {
            let fut = f(file_type, path);
            Box::pin(fut)
        }))
    }
}

impl Deref for AsyncDirectoryWalkFn {
    type Target = AsyncDirectoryWalkFnInner;

    fn deref(&self) -> &Self::Target {
        &*self.0
    }
}

type DirectoryStreamWalkFnInner = dyn Fn(
        FileType,
        PathBuf,
        AsyncReadableFileStream,
    ) -> futures::future::BoxFuture<'static, Result<(), anyhow::Error>>
    + Send
    + Sync
    + 'static;

#[derive(Clone)]
pub struct AsyncDirectoryStreamWalkFn(Arc<DirectoryStreamWalkFnInner>);

impl<
    T: Fn(FileType, PathBuf, AsyncReadableFileStream) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<(), anyhow::Error>> + Send + 'static,
> From<T> for AsyncDirectoryStreamWalkFn
{
    fn from(f: T) -> Self {
        Self(Arc::new(move |file_type, path, stream| {
            let fut = f(file_type, path, stream);
            Box::pin(fut)
        }))
    }
}

impl Deref for AsyncDirectoryStreamWalkFn {
    type Target = DirectoryStreamWalkFnInner;

    fn deref(&self) -> &Self::Target {
        &*self.0
    }
}
