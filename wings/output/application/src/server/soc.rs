use std::sync::Arc;
use super::panel_sync::{AbConfig, PanelSync};

pub async fn start(
    panel_url: String,
    panel_token: String,
    node_name: String,
    wings_version: String,
    state: crate::routes::State,
) {
    let panel = Arc::new(PanelSync::new(panel_url, panel_token, node_name, wings_version));
    let ab_config = Arc::new(tokio::sync::RwLock::new(AbConfig::default()));

    let panel_hb = Arc::clone(&panel);
    tokio::spawn(async move { panel_hb.heartbeat_loop().await; });

    let panel_cfg = Arc::clone(&panel);
    let cfg = Arc::clone(&ab_config);
    tokio::spawn(async move { panel_cfg.config_loop(cfg).await; });

    super::antiabuse::start(panel, ab_config, Arc::clone(&state)).await;
}