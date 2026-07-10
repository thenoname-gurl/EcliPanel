use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

pub const FUSEQUOTA_VERSION: &str = env!("FUSEQUOTA_VERSION");
pub static FUSEQUOTA_BIN: &[u8] = include_bytes!("../bins/fusequota");

pub async fn get_fusequota_bin_path(
    config: &crate::config::Config,
) -> Result<PathBuf, std::io::Error> {
    pub static BIN_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    let config = config.load();
    let tmp_dir = Path::new(&config.system.tmp_directory);
    let bin_path = tmp_dir.join(format!("wings_fusequota_bin_{}", FUSEQUOTA_VERSION));
    let tmp_bin_path = tmp_dir.join(format!("wings_fusequota_bin_{}_tmp", FUSEQUOTA_VERSION));
    drop(config);

    if tokio::fs::metadata(&bin_path).await.is_err() {
        let _lock = BIN_LOCK.lock().await;

        if tokio::fs::metadata(&bin_path).await.is_ok() {
            return Ok(bin_path);
        }

        let decompressed = tokio::task::spawn_blocking(|| {
            zstd::decode_all(FUSEQUOTA_BIN).map_err(std::io::Error::other)
        })
        .await??;

        let mut file = tokio::fs::File::create(&tmp_bin_path).await?;
        file.write_all(&decompressed).await?;
        file.flush().await?;
        drop(file);

        tokio::fs::rename(&tmp_bin_path, &bin_path).await?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = std::fs::Permissions::from_mode(0o755);
            tokio::fs::set_permissions(&bin_path, perms).await?;
        }
    }

    Ok(bin_path)
}
