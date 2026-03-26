use crate::server::filesystem::limiter::DiskLimiterExt;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, LazyLock},
};
use tokio::{process::Command, sync::RwLock};

type DiskUsageMap = HashMap<String, (PathBuf, String, i64)>;

static DISK_USAGE: LazyLock<Arc<RwLock<DiskUsageMap>>> = LazyLock::new(|| {
    let disk_usage: Arc<RwLock<DiskUsageMap>> = Arc::new(RwLock::new(HashMap::new()));
    let disk_usage_clone = Arc::clone(&disk_usage);

    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

            let is_empty = disk_usage_clone.read().await.is_empty();
            if is_empty {
                continue;
            }

            let output = Command::new("zfs")
                .arg("list")
                .arg("-H")
                .arg("-p")
                .arg("-o")
                .arg("name,used")
                .arg("-t")
                .arg("filesystem")
                .output()
                .await;

            match output {
                Ok(output) if output.status.success() => {
                    let output_str = String::from_utf8_lossy(&output.stdout);

                    let mut system_usage: HashMap<&str, i64> = HashMap::new();

                    for line in output_str.lines() {
                        let parts: Vec<&str> = line.split('\t').collect();
                        if parts.len() >= 2
                            && let Ok(bytes) = parts[1].parse::<i64>()
                        {
                            system_usage.insert(parts[0], bytes);
                        }
                    }

                    let mut usage_map = disk_usage_clone.write().await;

                    for (_, dataset_name, usage_ref) in usage_map.values_mut() {
                        if let Some(found_usage) = system_usage.get(dataset_name.as_str()) {
                            *usage_ref = *found_usage;
                        }
                    }
                }
                Ok(output) => {
                    tracing::error!(
                        "failed to retrieve global ZFS usage list: {}",
                        String::from_utf8_lossy(&output.stderr)
                    );
                }
                Err(err) => {
                    tracing::error!("error executing zfs list command: {:?}", err);
                }
            }
        }
    });

    disk_usage
});

async fn get_root_pool_name(path: &Path) -> Result<String, std::io::Error> {
    let output = Command::new("zfs")
        .arg("list")
        .arg("-H")
        .arg("-o")
        .arg("name,mountpoint")
        .output()
        .await?;

    if !output.status.success() {
        return Err(std::io::Error::other(format!(
            "Failed to list ZFS datasets: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    let path_str = path.to_string_lossy();

    let mut best_match: Option<String> = None;
    let mut best_match_len = 0;

    for line in output_str.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 2 {
            let dataset = parts[0];
            let mountpoint = parts[1];

            if path_str.starts_with(mountpoint) && mountpoint.len() > best_match_len {
                best_match = Some(dataset.to_string());
                best_match_len = mountpoint.len();
            }
        }
    }

    if let Some(dataset) = best_match {
        if let Some(pool_end) = dataset.find('/') {
            return Ok(dataset[0..pool_end].to_string());
        }
        return Ok(dataset);
    }

    Err(std::io::Error::other(format!(
        "No ZFS pool found covering path: {path_str}"
    )))
}

pub struct ZfsDatasetLimiter<'a> {
    pub filesystem: &'a crate::server::filesystem::Filesystem,
}

#[async_trait::async_trait]
impl<'a> DiskLimiterExt for ZfsDatasetLimiter<'a> {
    async fn setup(&self) -> Result<(), std::io::Error> {
        tracing::debug!(
            path = %self.filesystem.base_path.display(),
            "setting up zfs dataset for volume"
        );

        let pool_name = get_root_pool_name(&self.filesystem.base_path).await?;
        let dataset_name = format!("{}/server-{}", pool_name, self.filesystem.uuid);

        if tokio::fs::metadata(&self.filesystem.base_path)
            .await
            .is_err()
        {
            let output = Command::new("zfs")
                .arg("create")
                .arg("-o")
                .arg(format!(
                    "mountpoint={}",
                    self.filesystem.base_path.display()
                ))
                .arg(&dataset_name)
                .output()
                .await?;

            if !output.status.success() {
                return Err(std::io::Error::other(format!(
                    "Failed to create ZFS dataset {}: {}",
                    dataset_name,
                    String::from_utf8_lossy(&output.stderr)
                )));
            }
        }

        DISK_USAGE.write().await.insert(
            self.filesystem.uuid.to_string(),
            (self.filesystem.base_path.clone(), dataset_name, 0),
        );

        Ok(())
    }

    async fn attach(&self) -> Result<(), std::io::Error> {
        tracing::debug!(
            path = %self.filesystem.base_path.display(),
            "attaching zfs disk limiter for volume"
        );

        let pool_name = get_root_pool_name(&self.filesystem.base_path).await?;
        let dataset_name = format!("{}/server-{}", pool_name, self.filesystem.uuid);

        DISK_USAGE.write().await.insert(
            self.filesystem.uuid.to_string(),
            (self.filesystem.base_path.clone(), dataset_name, 0),
        );

        Ok(())
    }

    async fn disk_usage(&self) -> Result<u64, std::io::Error> {
        let map = DISK_USAGE.read().await;
        if let Some(usage) = map.get(&self.filesystem.uuid.to_string())
            && usage.2 >= 0
        {
            return Ok(usage.2 as u64);
        }

        Err(std::io::Error::other(format!(
            "Failed to load ZFS disk usage for {}",
            self.filesystem.base_path.display()
        )))
    }

    async fn update_disk_limit(&self, limit: u64) -> Result<(), std::io::Error> {
        tracing::debug!(
            path = %self.filesystem.base_path.display(),
            limit = limit,
            "setting zfs disk limit"
        );

        let dataset_name = {
            let map = DISK_USAGE.read().await;
            match map.get(&self.filesystem.uuid.to_string()) {
                Some(u) => u.1.clone(),
                None => {
                    let pool_name = get_root_pool_name(&self.filesystem.base_path).await?;
                    format!("{}/server-{}", pool_name, self.filesystem.uuid)
                }
            }
        };

        let limit_val = if limit == 0 {
            "none".to_string()
        } else {
            format!("{}M", limit / 1024 / 1024)
        };

        let output = Command::new("zfs")
            .arg("set")
            .arg(format!("refquota={}", limit_val))
            .arg(&dataset_name)
            .output()
            .await?;

        if !output.status.success() {
            return Err(std::io::Error::other(format!(
                "Failed to set ZFS quota for {}: {}",
                dataset_name,
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        Ok(())
    }

    async fn destroy(&self) -> Result<(), std::io::Error> {
        tracing::debug!(
            path = %self.filesystem.base_path.display(),
            "destroying zfs dataset for server"
        );

        let dataset_name = {
            let map = DISK_USAGE.read().await;
            match map.get(&self.filesystem.uuid.to_string()) {
                Some(u) => u.1.clone(),
                None => {
                    let pool_name = get_root_pool_name(&self.filesystem.base_path).await?;
                    format!("{}/server-{}", pool_name, self.filesystem.uuid)
                }
            }
        };

        let output = Command::new("zfs")
            .arg("destroy")
            .arg("-r")
            .arg(&dataset_name)
            .output()
            .await?;

        if !output.status.success() {
            tokio::fs::remove_dir_all(&self.filesystem.base_path)
                .await
                .ok();
        }

        DISK_USAGE
            .write()
            .await
            .remove(&self.filesystem.uuid.to_string());

        Ok(())
    }
}
