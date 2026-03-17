use crate::server::filesystem::virtualfs::VirtualWritableFilesystem;
use anyhow::Context;
use compact_str::ToCompactString;
use rand::Rng;
use serde::Serialize;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    str::FromStr,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};
use tokio::{io::AsyncWriteExt, sync::RwLock};
use utoipa::ToSchema;

mod resolver;

static DOWNLOAD_CLIENT: RwLock<Option<Arc<reqwest::Client>>> = RwLock::const_new(None);

async fn get_download_client(
    config: &Arc<crate::config::Config>,
) -> Result<Arc<reqwest::Client>, anyhow::Error> {
    let client = DOWNLOAD_CLIENT.read().await;
    if let Some(client) = client.as_ref() {
        return Ok(Arc::clone(client));
    }

    drop(client);
    let mut write_lock = DOWNLOAD_CLIENT.write().await;

    let new_client = reqwest::Client::builder()
        .user_agent("Pterodactyl Panel (https://pterodactyl.io)")
        .connect_timeout(std::time::Duration::from_secs(30))
        .dns_resolver(Arc::new(resolver::DnsResolver::new(config)))
        .build()
        .context("failed to build download client")?;

    let new_client = Arc::new(new_client);
    *write_lock = Some(Arc::clone(&new_client));

    Ok(new_client)
}

#[derive(ToSchema, Serialize)]
pub struct PullQueryResponse {
    pub file_name: Option<compact_str::CompactString>,
    pub file_size: Option<u64>,

    pub final_url: compact_str::CompactString,
    pub headers: HashMap<compact_str::CompactString, compact_str::CompactString>,
}

impl PullQueryResponse {
    pub async fn query(
        config: &Arc<crate::config::Config>,
        url: &str,
    ) -> Result<Self, anyhow::Error> {
        let response = get_download_client(config)
            .await?
            .get(url)
            .send()
            .await
            .context("failed to send HEAD request")?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "failed to query download URL: code {}",
                response.status()
            ));
        }

        let mut headers = HashMap::new();
        for (key, value) in response.headers().iter() {
            if let Ok(value_str) = value.to_str() {
                headers.insert(key.to_compact_string(), value_str.to_compact_string());
            }
        }

        let file_name = if let Some(header) = response.headers().get("Content-Disposition")
            && let Ok(header) = header.to_str()
            && let Some(filename) = crate::utils::parse_content_disposition_filename(header)
        {
            Some(filename.into())
        } else {
            None
        };

        Ok(Self {
            file_name,
            file_size: response.content_length().or_else(|| {
                response
                    .headers()
                    .get("Content-Length")
                    .and_then(|c| c.to_str().ok())
                    .and_then(|c| c.parse::<u64>().ok())
            }),
            final_url: response.url().to_compact_string(),
            headers,
        })
    }
}

pub struct Download {
    pub identifier: uuid::Uuid,
    pub progress: Arc<AtomicU64>,
    pub total: u64,
    pub destination: PathBuf,
    pub server: crate::server::Server,
    pub filesystem: Arc<dyn VirtualWritableFilesystem>,
    pub response: Option<reqwest::Response>,
}

impl Download {
    pub async fn new(
        server: crate::server::Server,
        filesystem: Arc<dyn VirtualWritableFilesystem>,
        destination: &Path,
        file_name: Option<compact_str::CompactString>,
        url: compact_str::CompactString,
        use_header: bool,
    ) -> Result<Self, anyhow::Error> {
        let url = reqwest::Url::parse(&url).context("failed to parse download URL")?;

        if let Some(host) = url.host_str()
            && let Ok(ip) = std::net::IpAddr::from_str(host)
        {
            for cidr in server
                .app_state
                .config
                .api
                .remote_download_blocked_cidrs
                .iter()
            {
                if cidr.contains(&ip) {
                    tracing::warn!("blocking internal IP address in pull: {}", ip);
                    return Err(anyhow::anyhow!("IP address {} is blocked", ip));
                }
            }
        }

        let response = get_download_client(&server.app_state.config)
            .await?
            .get(url)
            .send()
            .await
            .context("failed to send download request")?;
        let mut real_destination = destination.to_path_buf();

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "failed to download file: code {}",
                response.status()
            ));
        }

        'header_check: {
            if let Some(file_name) = file_name {
                real_destination.push(file_name);
            } else if use_header {
                if let Some(header) = response.headers().get("Content-Disposition")
                    && let Ok(header) = header.to_str()
                    && let Some(filename) = crate::utils::parse_content_disposition_filename(header)
                {
                    real_destination.push(filename);
                    break 'header_check;
                }

                real_destination.push(
                    response
                        .url()
                        .path_segments()
                        .and_then(|mut segments| segments.next_back())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| {
                            let random_string: String = rand::rng()
                                .sample_iter(&rand::distr::Alphanumeric)
                                .take(8)
                                .map(char::from)
                                .collect();

                            format!("download_{random_string}")
                        }),
                );
            } else {
                real_destination.push(
                    response
                        .url()
                        .path_segments()
                        .and_then(|mut segments| segments.next_back())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| {
                            let random_string: String = rand::rng()
                                .sample_iter(&rand::distr::Alphanumeric)
                                .take(8)
                                .map(char::from)
                                .collect();

                            format!("download_{random_string}")
                        }),
                );
            }
        }

        if filesystem.is_primary_server_fs()
            && server.filesystem.is_ignored(&real_destination, false).await
        {
            return Err(anyhow::anyhow!("file not found"));
        }

        Ok(Self {
            identifier: uuid::Uuid::new_v4(),
            progress: Arc::new(AtomicU64::new(0)),
            total: response.content_length().unwrap_or_else(|| {
                response
                    .headers()
                    .get("Content-Length")
                    .and_then(|h| h.to_str().ok())
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0)
            }),
            destination: real_destination,
            server,
            filesystem,
            response: Some(response),
        })
    }

    pub async fn start(
        &mut self,
    ) -> Result<
        (
            uuid::Uuid,
            tokio::task::JoinHandle<Option<Result<(), anyhow::Error>>>,
        ),
        anyhow::Error,
    > {
        let progress = Arc::clone(&self.progress);
        let destination = self.destination.clone();
        let server = self.server.clone();
        let filesystem = self.filesystem.clone();
        let mut response = self
            .response
            .take()
            .ok_or_else(|| anyhow::anyhow!("response already taken"))?;

        let (identifier, task) = self
            .server
            .filesystem
            .operations
            .add_operation(
                super::operations::FilesystemOperation::Pull {
                    destination_path: self.destination.clone(),
                    start_time: chrono::Utc::now(),
                    progress: self.progress.clone(),
                    total: Arc::new(AtomicU64::new(self.total)),
                },
                async move {
                    let mut run_inner = async || -> Result<(), anyhow::Error> {
                        let mut writer = filesystem.async_create_file(&destination).await?;

                        while let Some(chunk) = response.chunk().await? {
                            writer.write_all(&chunk).await?;
                            progress.fetch_add(chunk.len() as u64, Ordering::Relaxed);
                        }

                        writer.shutdown().await?;
                        Ok(())
                    };

                    match run_inner().await {
                        Ok(_) => {
                            tracing::info!(
                                server = %server.uuid,
                                "pull completed: {}",
                                destination.to_string_lossy()
                            );

                            Ok(())
                        }
                        Err(err) => {
                            tracing::error!(
                                server = %server.uuid,
                                "failed to pull file: {:#?}",
                                err
                            );

                            Err(err)
                        }
                    }
                },
            )
            .await;

        self.identifier = identifier;

        Ok((identifier, task))
    }

    #[inline]
    pub fn to_api_response(&self) -> crate::models::Download {
        crate::models::Download {
            identifier: self.identifier,
            destination: self.destination.to_string_lossy().to_string(),
            progress: self.progress.load(Ordering::Relaxed),
            total: self.total,
        }
    }
}
