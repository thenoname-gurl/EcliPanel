use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct AbConfig {
    pub enabled: bool,
    pub cpu_threshold_pct: f64,
    pub network_threshold_mbps: f64,
    pub cooldown_seconds: u64,
    pub strikes_for_suspend: u32,
}

impl Default for AbConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            cpu_threshold_pct: 90.0,
            network_threshold_mbps: 150.0,
            cooldown_seconds: 300,
            strikes_for_suspend: 3,
        }
    }
}

pub use crate::dpi::engine::VpnDpiConfig;

pub struct PanelSync {
    panel_url: String,
    panel_token: String,
    node_name: String,
    wings_version: String,
    http_client: reqwest::Client,
    config_version: tokio::sync::RwLock<String>,
}

impl PanelSync {
    pub fn new(
        panel_url: String,
        panel_token: String,
        node_name: String,
        wings_version: String,
    ) -> Self {
        Self {
            panel_url: panel_url.trim_end_matches('/').to_string(),
            panel_token,
            node_name,
            wings_version,
            http_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .expect("failed to create http client"),
            config_version: tokio::sync::RwLock::new(String::new()),
        }
    }

    fn auth_header(&self) -> String {
        format!("Bearer {}", self.panel_token)
    }

    pub async fn heartbeat_loop(self: &Arc<Self>) {
        let url = format!("{}/api/admin/antiabuse/heartbeat", self.panel_url);
        loop {
            let config_ver = self.config_version.read().await.clone();
            let payload = serde_json::json!({
                "agentId": format!("wings@{}", self.node_name),
                "detectorName": "wings",
                "nodeName": self.node_name,
                "version": self.wings_version,
                "configVersion": config_ver,
            });
            let result = self.http_client
                .post(&url)
                .header("Authorization", self.auth_header())
                .header("Content-Type", "application/json")
                .json(&payload)
                .send()
                .await;

            match result {
                Ok(resp) => {
                    tracing::info!("heartbeat sent (config={})", config_ver);
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        if let Some(cmds) = json.get("commands").and_then(|v| v.as_array()) {
                            for cmd in cmds {
                                let action = cmd.get("action").and_then(|v| v.as_str()).unwrap_or("");
                                match action {
                                    "reapply_config" => {
                                        tracing::info!("received reapply_config command — forcing config refresh");
                                        self.fetch_config_once().await;
                                    }
                                    "restart" => {
                                        tracing::warn!("received restart command — shutting down");
                                        std::process::exit(0);
                                    }
                                    other => {
                                        tracing::warn!("unknown command from panel: {}", other);
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => tracing::warn!("heartbeat failed: {}", e),
            }
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    }

    async fn fetch_config_once(&self) {
        let url = format!("{}/api/wings/config", self.panel_url);
        let resp = match self.http_client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => { tracing::warn!("config re-fetch failed: {}", e); return; }
        };
        let json = match resp.json::<serde_json::Value>().await {
            Ok(j) => j,
            Err(_) => return,
        };
        if let Some(cv) = json.get("configVersion").and_then(|v| v.as_str()) {
            let old = {
                let mut guard = self.config_version.write().await;
                let old = guard.clone();
                *guard = cv.to_string();
                old
            };
            tracing::info!("config re-fetched: version {} -> {}", old, cv);
        } else {
            tracing::info!("config re-fetched (no version in response)");
        }
    }

    pub async fn config_loop(
        self: &Arc<Self>,
        config: Arc<tokio::sync::RwLock<AbConfig>>,
        vpn_dpi_config: Arc<tokio::sync::RwLock<VpnDpiConfig>>,
        detection_rules: Arc<tokio::sync::RwLock<Vec<crate::routes::DetectionRule>>>,
    ) {
        let url = format!("{}/api/wings/config", self.panel_url);
        let mut last_version = String::new();
        loop {
            tokio::time::sleep(Duration::from_secs(120)).await;
            let resp = match self.http_client
                .get(&url)
                .header("Authorization", self.auth_header())
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => { tracing::warn!("config poll failed: {}", e); continue; }
            };
            let json = match resp.json::<serde_json::Value>().await {
                Ok(j) => j,
                Err(_) => continue,
            };

            if let Some(cv) = json.get("configVersion").and_then(|v| v.as_str()) {
                *self.config_version.write().await = cv.to_string();
            }

            if let Some(ab) = json.get("antiabuse") {
                let new_config = AbConfig {
                    enabled: ab.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
                    cpu_threshold_pct: ab.get("cpuThresholdPct").and_then(|v| v.as_f64()).unwrap_or(80.0),
                    network_threshold_mbps: ab.get("networkThresholdMbps").and_then(|v| v.as_f64()).unwrap_or(100.0),
                    cooldown_seconds: ab.get("cooldownSeconds").and_then(|v| v.as_u64()).unwrap_or(300),
                    strikes_for_suspend: ab.get("strikesForSuspend").and_then(|v| v.as_u64()).unwrap_or(3) as u32,
                };
                *config.write().await = new_config;
            }

            if let Some(vd) = json.get("vpnDpi") {
                let protocol_actions: std::collections::HashMap<String, String> = vd
                    .get("protocolActions")
                    .and_then(|v| v.as_object())
                    .map(|obj| {
                        obj.iter()
                            .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                            .collect()
                    })
                    .unwrap_or_default();

                let dpi_rules: Vec<crate::dpi::engine::DpiRule> = vd
                    .get("dpiRules")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|r| {
                                Some(crate::dpi::engine::DpiRule {
                                    pattern: r.get("pattern")?.as_str()?.to_string(),
                                    protocol: r.get("protocol")?.as_str()?.to_string(),
                                    action: r.get("action")?.as_str()?.to_string(),
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                let vpn_config = VpnDpiConfig {
                    enabled: vd.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
                    protocol_actions,
                    dpi_rules,
                    sample_interval_seconds: vd.get("sampleIntervalSeconds")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(300),
                    sample_duration_ms: vd.get("sampleDurationMs")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(10000),
                    bandwidth_threshold_kbps: vd.get("bandwidthThresholdKbps")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(1),
                    port_scan_threshold: vd.get("portScanThreshold")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(15) as u32,
                    port_scan_action: vd.get("portScanAction")
                        .and_then(|v| v.as_str())
                        .unwrap_or("alert")
                        .to_string(),
                };
                *vpn_dpi_config.write().await = vpn_config;
            }

            if let Some(rules) = json.get("rules").and_then(|v| v.as_array()) {
                let parsed: Vec<crate::routes::DetectionRule> = rules
                    .iter()
                    .filter_map(|r| serde_json::from_value(r.clone()).ok())
                    .collect();
                *detection_rules.write().await = parsed;
            }

            if let Some(ver) = json.get("latestVersion").and_then(|v| v.as_str()) {
                if last_version.is_empty() {
                    last_version = ver.to_string();
                } else if ver != last_version {
                    tracing::info!("new Wings version: {} -> {}", last_version, ver);
                    last_version = ver.to_string();
                    self.trigger_upgrade(&json).await;
                }
            }
        }
    }

    async fn trigger_upgrade(&self, config: &serde_json::Value) {
        let path = config.get("downloadUrl").and_then(|v| v.as_str()).unwrap_or("/api/wings/download");
        let download_url = format!("{}{}", self.panel_url, path);
        let upgrade_url = format!("{}/api/system/upgrade", self.panel_url);
        let payload = serde_json::json!({
            "url": download_url,
            "headers": { "Authorization": self.auth_header() },
            "sha256": "",
            "restart_command": "systemctl",
            "restart_command_args": ["restart", "wings"],
        });
        if let Err(e) = self.http_client.post(&upgrade_url)
            .header("Authorization", self.auth_header())
            .json(&payload).send().await
        {
            tracing::warn!("auto-upgrade failed: {}", e);
        }
    }

    pub async fn report_incident(
        &self,
        server_id: &str,
        reason: &str,
        detection_type: &str,
        enforcement_action: &str,
        strike_count: u32,
        metrics: serde_json::Value,
    ) {
        let url = format!("{}/api/admin/antiabuse/events", self.panel_url);
        let payload = serde_json::json!({
            "serverId": server_id,
            "reason": reason,
            "nodeName": self.node_name,
            "detectionType": detection_type,
            "enforcementAction": enforcement_action,
            "strikeCount": strike_count,
            "suspendAttempted": enforcement_action == "suspend",
            "suspendSuccess": false,
            "detectorName": "wings",
            "metrics": metrics,
            "recentEvents": [],
        });
        match self.http_client
            .post(&url)
            .header("Authorization", self.auth_header())
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
        {
            Ok(_) => tracing::info!("incident reported: {} on {} (strikes={})", detection_type, server_id, strike_count),
            Err(e) => tracing::error!("incident report failed: {}", e),
        }
    }
}