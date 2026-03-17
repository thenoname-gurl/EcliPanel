use crate::{
    remote::backups::RawServerBackup,
    response::ApiResponse,
    server::filesystem::{
        archive::StreamableArchiveFormat,
        virtualfs::{ByteRange, VirtualReadableFilesystem},
    },
};
use std::sync::{Arc, atomic::AtomicU64};

pub mod adapters;
pub mod manager;

pub enum Backup {
    Wings(adapters::wings::WingsBackup),
    S3(adapters::s3::S3Backup),
    DdupBak(adapters::ddup_bak::DdupBakBackup),
    Btrfs(adapters::btrfs::BtrfsBackup),
    Zfs(adapters::zfs::ZfsBackup),
    Restic(adapters::restic::ResticBackup),
}

impl Backup {
    pub fn uuid(&self) -> uuid::Uuid {
        match self {
            Backup::Wings(backup) => backup.uuid(),
            Backup::S3(backup) => backup.uuid(),
            Backup::DdupBak(backup) => backup.uuid(),
            Backup::Btrfs(backup) => backup.uuid(),
            Backup::Zfs(backup) => backup.uuid(),
            Backup::Restic(backup) => backup.uuid(),
        }
    }

    #[inline]
    pub fn adapter(&self) -> adapters::BackupAdapter {
        match self {
            Backup::Wings(_) => adapters::BackupAdapter::Wings,
            Backup::S3(_) => adapters::BackupAdapter::S3,
            Backup::DdupBak(_) => adapters::BackupAdapter::DdupBak,
            Backup::Btrfs(_) => adapters::BackupAdapter::Btrfs,
            Backup::Zfs(_) => adapters::BackupAdapter::Zfs,
            Backup::Restic(_) => adapters::BackupAdapter::Restic,
        }
    }

    pub async fn download(
        &self,
        config: &Arc<crate::config::Config>,
        archive_format: StreamableArchiveFormat,
        range: Option<ByteRange>,
    ) -> Result<ApiResponse, anyhow::Error> {
        match self {
            Backup::Wings(backup) => backup.download(config, archive_format, range).await,
            Backup::S3(backup) => backup.download(config, archive_format, range).await,
            Backup::DdupBak(backup) => backup.download(config, archive_format, range).await,
            Backup::Btrfs(backup) => backup.download(config, archive_format, range).await,
            Backup::Zfs(backup) => backup.download(config, archive_format, range).await,
            Backup::Restic(backup) => backup.download(config, archive_format, range).await,
        }
    }

    pub async fn restore(
        &self,
        server: &crate::server::Server,
        progress: Arc<AtomicU64>,
        total: Arc<AtomicU64>,
        download_url: Option<compact_str::CompactString>,
    ) -> Result<(), anyhow::Error> {
        match self {
            Backup::Wings(backup) => backup.restore(server, progress, total, download_url).await,
            Backup::S3(backup) => backup.restore(server, progress, total, download_url).await,
            Backup::DdupBak(backup) => backup.restore(server, progress, total, download_url).await,
            Backup::Btrfs(backup) => backup.restore(server, progress, total, download_url).await,
            Backup::Zfs(backup) => backup.restore(server, progress, total, download_url).await,
            Backup::Restic(backup) => backup.restore(server, progress, total, download_url).await,
        }
    }

    pub async fn delete(&self, config: &Arc<crate::config::Config>) -> Result<(), anyhow::Error> {
        match self {
            Backup::Wings(backup) => backup.delete(config).await,
            Backup::S3(backup) => backup.delete(config).await,
            Backup::DdupBak(backup) => backup.delete(config).await,
            Backup::Btrfs(backup) => backup.delete(config).await,
            Backup::Zfs(backup) => backup.delete(config).await,
            Backup::Restic(backup) => backup.delete(config).await,
        }
    }

    async fn browse(
        &self,
        server: &crate::server::Server,
    ) -> Result<Arc<dyn VirtualReadableFilesystem>, anyhow::Error> {
        match self {
            Backup::Wings(backup) => backup.browse(server).await,
            Backup::S3(backup) => backup.browse(server).await,
            Backup::DdupBak(backup) => backup.browse(server).await,
            Backup::Btrfs(backup) => backup.browse(server).await,
            Backup::Zfs(backup) => backup.browse(server).await,
            Backup::Restic(backup) => backup.browse(server).await,
        }
    }
}

#[async_trait::async_trait]
pub trait BackupFindExt {
    async fn exists(
        config: &Arc<crate::config::Config>,
        uuid: uuid::Uuid,
    ) -> Result<bool, anyhow::Error>;
    async fn find(
        config: &Arc<crate::config::Config>,
        uuid: uuid::Uuid,
    ) -> Result<Option<Backup>, anyhow::Error>;
}

#[async_trait::async_trait]
pub trait BackupCreateExt {
    async fn create(
        server: &crate::server::Server,
        uuid: uuid::Uuid,
        progress: Arc<AtomicU64>,
        total: Arc<AtomicU64>,
        ignore: ignore::gitignore::Gitignore,
        ignore_raw: compact_str::CompactString,
    ) -> Result<RawServerBackup, anyhow::Error>;
}

#[async_trait::async_trait]
pub trait BackupExt {
    fn uuid(&self) -> uuid::Uuid;

    async fn download(
        &self,
        config: &Arc<crate::config::Config>,
        archive_format: StreamableArchiveFormat,
        range: Option<ByteRange>,
    ) -> Result<ApiResponse, anyhow::Error>;

    async fn restore(
        &self,
        server: &crate::server::Server,
        progress: Arc<AtomicU64>,
        total: Arc<AtomicU64>,
        download_url: Option<compact_str::CompactString>,
    ) -> Result<(), anyhow::Error>;
    async fn delete(&self, config: &Arc<crate::config::Config>) -> Result<(), anyhow::Error>;

    async fn browse(
        &self,
        server: &crate::server::Server,
    ) -> Result<Arc<dyn VirtualReadableFilesystem>, anyhow::Error>;
}

#[async_trait::async_trait]
pub trait BackupCleanExt {
    async fn clean(server: &crate::server::Server, uuid: uuid::Uuid) -> Result<(), anyhow::Error>;
}
