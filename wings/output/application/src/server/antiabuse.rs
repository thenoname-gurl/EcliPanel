//! Anti-abuse detection engine embedded in Wings.
//!
//! Monitors container stats for DDoS / crypto mining patterns and reports
//! incidents to the panel's `/admin/antiabuse/events` endpoint.
//! Also sends periodic heartbeats so the panel knows Wings is the detector.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// Per-server state for abuse detection
#[derive(Debug, Clone, Default)]
struct ServerAbuseState {
    /// Network rx_bytes from last sample (for rate calculation)
    last_rx_bytes: u64,
    /// Network tx_bytes from last sample
    last_tx_bytes: u64,
    /// Time of last sample
    last_sample: Option<Instant>,
    /// Consecutive high-CPU readings (potential crypto mining)
    high_cpu_count: u32,
    /// Consecutive high-network readings (potential DDoS)
    high_network_count: u32,
    /// Strike count for escalation
    strike_count: u32,
    /// Last time an incident was reported (cooldown)
    last_incident_at: Option<Instant>,
    /// Detected mining process names
    mining_hits: Vec<String>,
}

struct AntiAbuseEngine {
    panel_url: String,
    panel_token: String,
    node_name: String,
    wings_version: String,
    states: RwLock<HashMap<String, ServerAbuseState>>,
    http_client: reqwest::Client,
}

impl AntiAbuseEngine {
    fn new(
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
            states: RwLock::new(HashMap::new()),
            http_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .expect("failed to create http client"),
        }
    }

    /// Send heartbeat to panel every 30 seconds
    async fn heartbeat_loop(self: &Arc<Self>) {
        let url = format!("{}/api/admin/antiabuse/heartbeat", self.panel_url);
        loop {
            let payload = serde_json::json!({
                "agentId": format!("wings@{}", self.node_name),
                "detectorName": "wings",
                "nodeName": self.node_name,
                "version": self.wings_version,
            });

            if let Err(e) = self
                .http_client
                .post(&url)
                .header("Authorization", format!("Bearer {}", self.panel_token))
                .header("Content-Type", "application/json")
                .json(&payload)
                .send()
                .await
            {
                tracing::warn!("antiabuse heartbeat failed: {}", e);
            }

            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    }

    /// Report an incident to the panel
    async fn report_incident(
        &self,
        server_id: &str,
        reason: &str,
        detection_type: &str,
        enforcement_action: &str,
        strike_count: u32,
        source_ip: Option<&str>,
        target_ip: Option<&str>,
        target_port: Option<u16>,
        metrics: serde_json::Value,
    ) {
        let url = format!("{}/api/admin/antiabuse/events", self.panel_url);
        let payload = serde_json::json!({
            "serverId": server_id,
            "reason": reason,
            "nodeName": self.node_name,
            "sourceIp": source_ip,
            "targetIp": target_ip,
            "targetPort": target_port,
            "detectionType": detection_type,
            "enforcementAction": enforcement_action,
            "strikeCount": strike_count,
            "suspendAttempted": enforcement_action == "suspend",
            "suspendSuccess": false,
            "detectorName": "wings",
            "metrics": metrics,
            "recentEvents": [],
        });

        match self
            .http_client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.panel_token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
        {
            Ok(resp) => {
                tracing::info!(
                    "antiabuse incident reported: {} on {} (type={}, strikes={})",
                    detection_type,
                    server_id,
                    enforcement_action,
                    strike_count
                );
                if let Ok(body) = resp.text().await {
                    tracing::debug!("panel response: {}", body);
                }
            }
            Err(e) => {
                tracing::error!("antiabuse incident report failed: {}", e);
            }
        }
    }

    /// Process resource usage for a single server
    async fn process_stats(
        &self,
        server_id: &str,
        cpu_percent: f64,
        rx_bytes: u64,
        tx_bytes: u64,
        memory_bytes: u64,
        memory_limit: u64,
    ) {
        let now = Instant::now();
        let mut states = self.states.write().await;
        let state = states.entry(server_id.to_string()).or_default();

        // --- Crypto mining detection: sustained high CPU ---
        let cpu_threshold = 95.0;
        if cpu_percent > cpu_threshold {
            state.high_cpu_count += 1;
        } else {
            state.high_cpu_count = state.high_cpu_count.saturating_sub(1);
        }

        // If CPU >95% for 60 consecutive seconds (12 samples at 5s interval)
        if state.high_cpu_count >= 12 {
            // Check cooldown (5 minutes)
            let cooldown = state
                .last_incident_at
                .map(|t| now.duration_since(t).as_secs() < 300)
                .unwrap_or(false);

            if !cooldown {
                state.strike_count += 1;
                state.last_incident_at = Some(now);

                let metrics = serde_json::json!({
                    "cpu_percent": cpu_percent,
                    "high_cpu_duration_seconds": state.high_cpu_count * 5,
                    "memory_bytes": memory_bytes,
                    "memory_limit": memory_limit,
                });

                let action = if state.strike_count >= 3 { "suspend" } else { "alert" };
                self.report_incident(
                    server_id,
                    &format!(
                        "Sustained high CPU ({:.1}%) for {}s — potential crypto mining",
                        cpu_percent,
                        state.high_cpu_count * 5
                    ),
                    "crypto_mining",
                    action,
                    state.strike_count,
                    None, None, None,
                    metrics,
                )
                .await;
            }
        }

        // --- DDoS / traffic anomaly detection ---
        if let Some(last_sample) = state.last_sample {
            if let Some(elapsed) = {
                let d = now.duration_since(last_sample);
                if d.as_secs_f64() > 0.0 { Some(d) } else { None }
            } {
                let rx_rate = (rx_bytes.saturating_sub(state.last_rx_bytes)) as f64
                    / elapsed.as_secs_f64();
                let tx_rate = (tx_bytes.saturating_sub(state.last_tx_bytes)) as f64
                    / elapsed.as_secs_f64();
                let total_rate = rx_rate + tx_rate;

                // Flag if rate exceeds 100 MB/s (potential DDoS target)
                let threshold_bytes_per_sec: f64 = 100.0 * 1024.0 * 1024.0;
                if total_rate > threshold_bytes_per_sec {
                    state.high_network_count += 1;
                } else {
                    state.high_network_count = state.high_network_count.saturating_sub(1);
                }

                // If high traffic sustained for 30s (6 samples at 5s interval)
                if state.high_network_count >= 6 {
                    let cooldown = state
                        .last_incident_at
                        .map(|t| now.duration_since(t).as_secs() < 300)
                        .unwrap_or(false);

                    if !cooldown {
                        state.strike_count += 1;
                        state.last_incident_at = Some(now);

                        let metrics = serde_json::json!({
                            "rx_rate_mbps": rx_rate / (1024.0 * 1024.0),
                            "tx_rate_mbps": tx_rate / (1024.0 * 1024.0),
                            "total_rate_mbps": total_rate / (1024.0 * 1024.0),
                            "high_network_duration_seconds": state.high_network_count * 5,
                        });

                        let action = if state.strike_count >= 5 { "suspend" } else { "alert" };
                        self.report_incident(
                            server_id,
                            &format!(
                                "Abnormal network traffic ({:.1} MB/s) sustained for {}s",
                                total_rate / (1024.0 * 1024.0),
                                state.high_network_count * 5
                            ),
                            "ddos_fast_threshold_tcp",
                            action,
                            state.strike_count,
                            None, None, None,
                            metrics,
                        )
                        .await;
                    }
                }
            }
        }

        // Update state
        state.last_rx_bytes = rx_bytes;
        state.last_tx_bytes = tx_bytes;
        state.last_sample = Some(now);
    }
}

/// Start the anti-abuse engine. Returns handles that must be kept alive.
pub async fn start(
    panel_url: String,
    panel_token: String,
    node_name: String,
    wings_version: String,
    state: crate::routes::State,
) {
    tracing::info!("starting embedded anti-abuse detection engine");

    let engine = Arc::new(AntiAbuseEngine::new(
        panel_url,
        panel_token,
        node_name,
        wings_version,
    ));

    // Spawn heartbeat loop
    let engine_hb = Arc::clone(&engine);
    tokio::spawn(async move {
        engine_hb.heartbeat_loop().await;
    });

    // Spawn stats monitoring loop — polls all servers every 5 seconds
    let engine_stats = Arc::clone(&engine);
    let state_mon = state.clone();
    tokio::spawn(async move {
        loop {
            // Clone servers out of the lock before any async work
            let server_list: Vec<_> = {
                let guard = state_mon.server_manager.get_servers().await;
                guard.iter().cloned().collect()
            };
            drop(server_list); // just for clarity — it's dropped here anyway

            let servers_guard = state_mon.server_manager.get_servers().await;
            let server_snapshots: Vec<_> = servers_guard.iter().map(|s| {
                (s.uuid, s.resource_usage())
            }).collect();
            drop(servers_guard);

            for (uuid, usage) in server_snapshots {
                engine_stats
                    .process_stats(
                        &uuid.to_string(),
                        usage.cpu_absolute,
                        usage.network.rx_bytes,
                        usage.network.tx_bytes,
                        usage.memory_bytes,
                        usage.memory_limit_bytes,
                    )
                    .await;
            }

            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });

    tracing::info!("anti-abuse detection engine started");
}
