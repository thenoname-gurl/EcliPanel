use crate::server::filesystem::limiter::DiskLimiterExt;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc, OnceLock,
        atomic::{AtomicI64, Ordering},
    },
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::UnixStream,
    sync::RwLock,
};

type DeltaSyncMap = HashMap<uuid::Uuid, Arc<AtomicI64>>;
static DELTA_SYNC_REGISTRY: OnceLock<Arc<RwLock<DeltaSyncMap>>> = OnceLock::new();

pub struct FuseQuotaLimiter<'a> {
    pub filesystem: &'a crate::server::filesystem::Filesystem,
}

impl<'a> FuseQuotaLimiter<'a> {
    #[inline]
    fn get_fusequota_path(&self) -> PathBuf {
        self.filesystem
            .config
            .vmount_path(self.filesystem.uuid)
            .join("fs")
    }

    #[inline]
    fn get_fusequota_socket_path(&self) -> PathBuf {
        let mut socket_path = self.get_fusequota_path();
        socket_path.set_extension("fqsock");
        socket_path
    }

    async fn talk_to_socket(&self, cmd: &str) -> Result<String, std::io::Error> {
        let socket_path = self.get_fusequota_socket_path();

        let run = async || -> Result<String, std::io::Error> {
            let (reader, mut writer) = UnixStream::connect(socket_path).await?.into_split();

            writer.write_all(format!("{}\n", cmd).as_bytes()).await?;
            writer.shutdown().await?;

            let mut reader = BufReader::new(reader);
            let mut response = String::new();
            let mut line = String::new();

            while reader.read_line(&mut line).await.is_ok_and(|l| l > 0) {
                response.push_str(&line);
                line.clear();
            }

            for line in response.lines() {
                if line.starts_with("ERROR:") {
                    return Err(std::io::Error::other(format!(
                        "fusequota socket returned error: {line}"
                    )));
                }
            }

            Ok(response)
        };

        let response = tokio::time::timeout(std::time::Duration::from_secs(5), run()).await??;

        Ok(response)
    }

    pub async fn is_socket_functional(&self) -> bool {
        let socket_path = self.get_fusequota_socket_path();

        if tokio::fs::metadata(&socket_path).await.is_err() {
            return false;
        }

        match self.talk_to_socket("get quota_used").await {
            Ok(resp) => resp.contains("OK"),
            Err(_) => false,
        }
    }

    #[tracing::instrument(skip(self))]
    pub async fn spawn_fusequota_daemon(&self) -> Result<(), std::io::Error> {
        let fusequota_bin = crate::bins::get_fusequota_bin_path(&self.filesystem.config).await?;
        let base_fuse_path = self.get_fusequota_path();
        let socket_path = self.get_fusequota_socket_path();

        tokio::process::Command::new(fusequota_bin)
            .arg("--quota")
            .arg(self.filesystem.disk_limit().to_string())
            .arg("--quota-rescan-interval")
            .arg(
                self.filesystem
                    .config
                    .system
                    .disk_check_interval
                    .to_string(),
            )
            .arg("--clone-fd")
            .arg("--communication-socket-path")
            .arg(&socket_path)
            .arg("--uid")
            .arg(self.filesystem.config.system.user.uid.to_string())
            .arg("--gid")
            .arg(self.filesystem.config.system.user.gid.to_string())
            .arg("--nocache")
            .arg("-o")
            .arg("io_uring,allow_other")
            .arg(&self.filesystem.base_path)
            .arg(&base_fuse_path)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()?;

        Ok(())
    }

    async fn register_delta_sync(&self) {
        let registry = DELTA_SYNC_REGISTRY.get_or_init(|| {
            let registry_map: Arc<RwLock<DeltaSyncMap>> = Arc::new(RwLock::new(HashMap::new()));
            let state = self.filesystem.app_state.clone();

            tokio::spawn({
                let registry_map = Arc::clone(&registry_map);

                async move {
                    loop {
                        tokio::time::sleep(std::time::Duration::from_secs(10)).await;

                        for (uuid, delta) in registry_map.read().await.iter() {
                            let Some(server) = state.server_manager.get_server(*uuid).await else {
                                continue;
                            };

                            let delta = delta.swap(0, Ordering::Relaxed);

                            if delta == 0 {
                                continue;
                            }

                            tracing::debug!(
                                server = %server.uuid,
                                delta = delta,
                                "syncing fusequota disk usage delta"
                            );

                            let limiter = FuseQuotaLimiter {
                                filesystem: &server.filesystem,
                            };

                            if let Err(err) = if delta > 0 {
                                limiter
                                    .talk_to_socket(&format!("add quota_used = {}", delta))
                                    .await
                            } else {
                                limiter
                                    .talk_to_socket(&format!("rem quota_used = {}", -delta))
                                    .await
                            } {
                                tracing::warn!(
                                    server = %server.uuid,
                                    "failed to sync fusequota delta: {}",
                                    err
                                );
                                continue;
                            }
                        }
                    }
                }
            });

            registry_map
        });

        registry.write().await.insert(
            self.filesystem.uuid,
            Arc::clone(&self.filesystem.disk_usage_delta_cached),
        );
    }
}

#[async_trait::async_trait]
impl<'a> DiskLimiterExt for FuseQuotaLimiter<'a> {
    async fn setup(&self) -> Result<(), std::io::Error> {
        tracing::debug!(
            path = %self.filesystem.base_path.display(),
            "setting up fuse disk limiter for volume"
        );

        tokio::fs::create_dir_all(&self.filesystem.base_path).await?;

        if crate::bins::FUSEQUOTA_BIN.is_empty() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "fusequota binary is not available",
            ));
        }

        let base_fuse_path = self.get_fusequota_path();
        tokio::fs::create_dir_all(&base_fuse_path).await?;
        self.filesystem
            .set_base_fs_mount_path(base_fuse_path)
            .await?;

        Ok(())
    }

    async fn attach(&self) -> Result<(), std::io::Error> {
        tracing::debug!(
            path = %self.filesystem.base_path.display(),
            "attaching fuse disk limiter for volume"
        );

        if crate::bins::FUSEQUOTA_BIN.is_empty() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "fusequota binary is not available",
            ));
        }

        let base_fuse_path = self.get_fusequota_path();
        tokio::fs::create_dir_all(&base_fuse_path).await?;
        self.filesystem
            .set_base_fs_mount_path(base_fuse_path)
            .await?;

        Ok(())
    }

    async fn startup(&self) -> Result<(), std::io::Error> {
        tracing::debug!(
            path = %self.filesystem.base_path.display(),
            "starting fuse disk limiter daemon"
        );

        if !self.is_socket_functional().await {
            self.spawn_fusequota_daemon().await?;
        }

        self.register_delta_sync().await;

        Ok(())
    }

    async fn shutdown(&self) -> Result<(), std::io::Error> {
        tracing::debug!(
            path = %self.filesystem.base_path.display(),
            "stopping fuse disk limiter daemon"
        );

        if let Some(registry) = DELTA_SYNC_REGISTRY.get() {
            registry.write().await.remove(&self.filesystem.uuid);
        }

        match self.talk_to_socket("do end").await {
            Ok(response) if response.contains("OK") => {
                tracing::debug!("fusequota daemon acknowledged 'do end' command");
            }
            Ok(_) => {
                tracing::debug!("fusequota daemon did not acknowledge 'do end' command");
            }
            Err(err) => {
                tracing::debug!("failed to send 'do end' (daemon might be dead): {:?}", err);
            }
        }

        Ok(())
    }

    async fn disk_usage(&self) -> Result<u64, std::io::Error> {
        let response = self.talk_to_socket("get quota_used").await?;

        for line in response.lines() {
            if line.starts_with("quota_used =")
                && let Some(val_str) = line.split('=').nth(1)
            {
                return val_str
                    .trim()
                    .parse::<u64>()
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e));
            }
        }

        Err(std::io::Error::new(
            std::io::ErrorKind::UnexpectedEof,
            "socket failed to return usage data",
        ))
    }

    async fn update_disk_limit(&self, limit: u64) -> Result<(), std::io::Error> {
        tracing::debug!(
            path = %self.filesystem.base_path.display(),
            limit = limit,
            "updating fuse disk limit"
        );

        let cmd = format!("set quota = {}", limit);
        let response = self.talk_to_socket(&cmd).await?;

        if response.contains("OK") {
            Ok(())
        } else {
            Err(std::io::Error::other(format!(
                "fusequota rejected limit update: {}",
                response
            )))
        }
    }

    async fn destroy(&self) -> Result<(), std::io::Error> {
        if let Some(registry) = DELTA_SYNC_REGISTRY.get() {
            registry.write().await.remove(&self.filesystem.uuid);
        }

        tokio::fs::remove_dir_all(&self.filesystem.base_path).await?;

        match self.talk_to_socket("do end").await {
            Ok(response) if response.contains("OK") => {
                tracing::debug!("fusequota daemon acknowledged 'do end' command");
            }
            Ok(_) => {
                tracing::warn!("fusequota daemon did not acknowledge 'do end' command");
            }
            Err(err) => {
                tracing::warn!(
                    "could not send 'do end' to fq socket (daemon might be dead): {}",
                    err
                );
            }
        }

        Ok(())
    }
}
