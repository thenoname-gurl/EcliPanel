use crate::server::filesystem::limiter::DiskLimiterExt;

pub struct NoneLimiter<'a> {
    pub filesystem: &'a crate::server::filesystem::Filesystem,
}

#[async_trait::async_trait]
impl<'a> DiskLimiterExt for NoneLimiter<'a> {
    async fn setup(&self) -> Result<(), std::io::Error> {
        tracing::debug!(
            path = %self.filesystem.base_path.display(),
            "setting up no disk limiter for volume"
        );

        tokio::fs::create_dir_all(&self.filesystem.base_path).await?;

        Ok(())
    }

    async fn attach(&self) -> Result<(), std::io::Error> {
        tracing::debug!(
            path = %self.filesystem.base_path.display(),
            "attaching no disk limiter for volume"
        );

        Ok(())
    }

    async fn disk_usage(&self) -> Result<u64, std::io::Error> {
        Ok(self.filesystem.get_physical_cached_size())
    }

    async fn update_disk_limit(&self, _limit: u64) -> Result<(), std::io::Error> {
        Ok(())
    }

    async fn destroy(&self) -> Result<(), std::io::Error> {
        tokio::fs::remove_dir_all(&self.filesystem.base_path).await
    }
}
