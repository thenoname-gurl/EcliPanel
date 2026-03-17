use crate::server::filesystem::limiter::DiskLimiterExt;
use std::{
    collections::{HashMap, HashSet},
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
    sync::{Arc, LazyLock},
};
use tokio::{process::Command, sync::RwLock};

type DiskUsageMap = HashMap<String, (PathBuf, PathBuf, u64, i64)>;

static DISK_USAGE: LazyLock<Arc<RwLock<DiskUsageMap>>> = LazyLock::new(|| {
    let disk_usage: Arc<RwLock<DiskUsageMap>> = Arc::new(RwLock::new(HashMap::new()));
    let disk_usage_clone = Arc::clone(&disk_usage);

    tokio::spawn(async move {
        loop {
            let mut mount_groups: HashMap<PathBuf, HashSet<u64>> = HashMap::new();

            {
                let usage_map = disk_usage_clone.read().await;
                if usage_map.is_empty() {
                    drop(usage_map);
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    continue;
                }
                for (_, (_, mount, subvol_id, _)) in usage_map.iter() {
                    mount_groups
                        .entry(mount.clone())
                        .or_default()
                        .insert(*subvol_id);
                }
            }

            let mut results: HashMap<u64, i64> = HashMap::new();

            for (mount_point, subvol_ids) in mount_groups {
                match fetch_btrfs_usage(&mount_point).await {
                    Ok(quota_map) => {
                        for subvol_id in subvol_ids {
                            if let Some(usage) = quota_map.get(&subvol_id) {
                                results.insert(subvol_id, *usage);
                            }
                        }
                    }
                    Err(err) => {
                        tracing::error!(
                            mount_point = %mount_point.display(),
                            "failed to get Btrfs quota report: {}",
                            err
                        );
                    }
                }
            }

            {
                let mut usage_map = disk_usage_clone.write().await;
                for (_, _, subvol_id, usage_ref) in usage_map.values_mut() {
                    if let Some(new_usage) = results.get(subvol_id) {
                        *usage_ref = *new_usage;
                    }
                }
            }

            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    });

    disk_usage
});

async fn fetch_btrfs_usage(mount_point: &Path) -> Result<HashMap<u64, i64>, String> {
    let output = Command::new("btrfs")
        .arg("qgroup")
        .arg("show")
        .arg("--raw")
        .arg(mount_point)
        .output()
        .await
        .map_err(|e| format!("execution error: {:?}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    let mut usage_map = HashMap::new();

    for line in output_str.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();

        if parts.len() >= 2
            && let Some((_, id_str)) = parts[0].split_once('/')
            && let (Ok(subvol_id), Ok(rfer_bytes)) =
                (id_str.parse::<u64>(), parts[1].parse::<i64>())
        {
            usage_map.insert(subvol_id, rfer_bytes);
        }
    }
    Ok(usage_map)
}

async fn get_btrfs_subvol_id(path: &Path) -> Result<u64, std::io::Error> {
    let metadata = tokio::fs::metadata(path).await?;

    // btrfs subvolumes always have inode number 256
    if metadata.ino() != 256 {
        return Err(std::io::Error::other(format!(
            "Path is not a Btrfs subvolume: {}",
            path.display()
        )));
    }

    let output = Command::new("btrfs")
        .arg("inspect-internal")
        .arg("rootid")
        .arg(path)
        .output()
        .await?;

    if !output.status.success() {
        return Err(std::io::Error::other(format!(
            "Failed to get subvolume ID: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    output_str
        .trim()
        .parse::<u64>()
        .map_err(|_| std::io::Error::other("Invalid subvolume ID output"))
}

async fn get_mount_point(path: &Path) -> Result<PathBuf, std::io::Error> {
    let output = Command::new("df")
        .arg("--output=target")
        .arg(path)
        .output()
        .await?;

    if !output.status.success() {
        return Err(std::io::Error::other(String::from_utf8_lossy(
            &output.stderr,
        )));
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = output_str.lines().collect();
    if lines.len() < 2 {
        return Err(std::io::Error::other("Unexpected output format"));
    }

    Ok(PathBuf::from(lines[1].trim()))
}

pub struct BtrfsSubvolumeLimiter<'a> {
    pub filesystem: &'a crate::server::filesystem::Filesystem,
}

#[async_trait::async_trait]
impl<'a> DiskLimiterExt for BtrfsSubvolumeLimiter<'a> {
    async fn setup(&self) -> Result<(), std::io::Error> {
        tracing::debug!(
            path = %self.filesystem.base_path.display(),
            "setting up btrfs disk limiter for volume"
        );

        if tokio::fs::metadata(&self.filesystem.base_path)
            .await
            .is_err()
        {
            let output = Command::new("btrfs")
                .arg("subvolume")
                .arg("create")
                .arg(&self.filesystem.base_path)
                .output()
                .await?;

            if !output.status.success() {
                return Err(std::io::Error::other(format!(
                    "Failed to create Btrfs subvolume: {}",
                    String::from_utf8_lossy(&output.stderr)
                )));
            }

            let _ = Command::new("btrfs")
                .arg("quota")
                .arg("enable")
                .arg(&self.filesystem.base_path)
                .output()
                .await;
        }

        let subvol_id = get_btrfs_subvol_id(&self.filesystem.base_path).await?;

        let mount_point = match get_mount_point(&self.filesystem.base_path).await {
            Ok(mp) => mp,
            Err(err) => {
                tracing::warn!(
                    "failed to resolve mount point, falling back to path: {}",
                    err
                );
                self.filesystem.base_path.clone()
            }
        };

        DISK_USAGE.write().await.insert(
            self.filesystem.uuid.to_string(),
            (self.filesystem.base_path.clone(), mount_point, subvol_id, 0),
        );

        Ok(())
    }

    async fn attach(&self) -> Result<(), std::io::Error> {
        tracing::debug!(
            path = %self.filesystem.base_path.display(),
            "attaching btrfs disk limiter for volume"
        );

        let subvol_id = get_btrfs_subvol_id(&self.filesystem.base_path).await?;
        let mount_point = match get_mount_point(&self.filesystem.base_path).await {
            Ok(mp) => mp,
            Err(_) => self.filesystem.base_path.clone(),
        };

        DISK_USAGE.write().await.insert(
            self.filesystem.uuid.to_string(),
            (self.filesystem.base_path.clone(), mount_point, subvol_id, 0),
        );

        Ok(())
    }

    async fn disk_usage(&self) -> Result<u64, std::io::Error> {
        let map = DISK_USAGE.read().await;
        if let Some(usage) = map.get(&self.filesystem.uuid.to_string())
            && usage.3 >= 0
        {
            return Ok(usage.3 as u64);
        }

        Err(std::io::Error::other(format!(
            "Failed to load Btrfs disk usage for {}",
            self.filesystem.base_path.display()
        )))
    }

    async fn update_disk_limit(&self, limit: u64) -> Result<(), std::io::Error> {
        tracing::debug!(
            path = %self.filesystem.base_path.display(),
            limit = limit,
            "setting btrfs disk limit"
        );

        let limit_val = if limit == 0 {
            "none".to_string()
        } else {
            format!("{}M", limit / 1024 / 1024)
        };

        let output = Command::new("btrfs")
            .arg("qgroup")
            .arg("limit")
            .arg(limit_val)
            .arg(&self.filesystem.base_path)
            .output()
            .await?;

        if !output.status.success() {
            return Err(std::io::Error::other(format!(
                "Failed to set Btrfs disk limit: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        Ok(())
    }

    async fn destroy(&self) -> Result<(), std::io::Error> {
        tracing::debug!(
            path = %self.filesystem.base_path.display(),
            "destroying btrfs subvolume"
        );

        if let Some(usage) = DISK_USAGE
            .read()
            .await
            .get(&self.filesystem.uuid.to_string())
        {
            let qgroup_id = format!("0/{}", usage.2);
            let _ = Command::new("btrfs")
                .arg("qgroup")
                .arg("destroy")
                .arg(&qgroup_id)
                .arg(&self.filesystem.base_path)
                .output()
                .await;
        }

        let output = Command::new("btrfs")
            .arg("subvolume")
            .arg("delete")
            .arg(&self.filesystem.base_path)
            .output()
            .await?;

        if !output.status.success() {
            tokio::fs::remove_dir_all(&self.filesystem.base_path).await?;
        }

        DISK_USAGE
            .write()
            .await
            .remove(&self.filesystem.uuid.to_string());

        Ok(())
    }
}
