use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;
use super::panel_sync::{AbConfig, PanelSync};
use crate::dpi::engine::VpnDpiState;

struct ServerAbuseState {
    last_rx_bytes: u64,
    last_tx_bytes: u64,
    last_sample: Option<Instant>,
    high_cpu_count: u32,
    high_network_count: u32,
    strike_count: u32,
    last_incident_at: Option<Instant>,
}

impl Default for ServerAbuseState {
    fn default() -> Self {
        Self {
            last_rx_bytes: 0,
            last_tx_bytes: 0,
            last_sample: None,
            high_cpu_count: 0,
            high_network_count: 0,
            strike_count: 0,
            last_incident_at: None,
        }
    }
}

pub struct AntiAbuseEngine {
    panel: Arc<PanelSync>,
    config: Arc<RwLock<AbConfig>>,
    states: RwLock<HashMap<String, ServerAbuseState>>,
    vpn_dpi: Arc<VpnDpiState>,
    docker: Arc<bollard::Docker>,
    sandbox_cache: RwLock<HashMap<String, Option<String>>>,
}

impl AntiAbuseEngine {
    pub fn new(
        panel: Arc<PanelSync>,
        config: Arc<RwLock<AbConfig>>,
        vpn_dpi: Arc<VpnDpiState>,
        docker: Arc<bollard::Docker>,
    ) -> Self {
        Self {
            panel,
            config,
            states: RwLock::new(HashMap::new()),
            vpn_dpi,
            docker,
            sandbox_cache: RwLock::new(HashMap::new()),
        }
    }

    pub async fn process_stats(
        &self,
        server_id: &str,
        cpu_percent: f64,
        cpu_limit: f64,
        rx_bytes: u64,
        tx_bytes: u64,
        memory_bytes: u64,
        memory_limit: u64,
    ) {
        let cfg = self.config.read().await.clone();
        if !cfg.enabled { return; }

        let now = Instant::now();
        let mut states = self.states.write().await;
        let state = states.entry(server_id.to_string()).or_default();

        self.check_cpu_mining(state, cpu_percent, cpu_limit, &cfg, server_id, memory_bytes, memory_limit, now).await;
        self.check_ddos(state, rx_bytes, tx_bytes, &cfg, server_id, now).await;
    }

    pub async fn check_vpn(&self, server_id: &str, rx_bytes: u64, tx_bytes: u64) {
        let sandbox_key = {
            let cache = self.sandbox_cache.read().await;
            if let Some(val) = cache.get(server_id) {
                val.clone()
            } else {
                drop(cache);
                let key = self.resolve_sandbox_key(server_id).await;
                self.sandbox_cache.write().await.insert(server_id.to_string(), key.clone());
                key
            }
        };

        let Some(sandbox_key) = sandbox_key else { return; };

        let dpi = self.vpn_dpi.clone();
        let sid = server_id.to_string();
        let _detected = tokio::task::spawn_blocking(move || {
            dpi.sample_container(&sid, &sandbox_key, rx_bytes, tx_bytes)
        }).await.unwrap_or_default();

        for (proto_name, action) in &_detected {
            if proto_name.contains(':') && !proto_name.starts_with("PortScan:") {
                let parts: Vec<&str> = proto_name.splitn(3, ':').collect();
                let atype = parts.first().copied().unwrap_or("?");
                let ip = parts.get(1).copied().unwrap_or("?");
                let count = parts.get(2).copied().unwrap_or("?");
                let reason = format!("{} detected: {} ports → {}", atype, count, ip);
                self.panel.report_incident(
                    server_id,
                    &reason,
                    "ddos_attack",
                    action,
                    1,
                    serde_json::json!({
                        "attack_type": atype,
                        "target_ip": ip,
                        "port_count": count,
                        "detector": "ndpi",
                    }),
                ).await;
            } else if proto_name.starts_with("PortScan:") {
                let parts: Vec<&str> = proto_name.splitn(3, ':').collect();
                let ip = parts.get(1).copied().unwrap_or("?");
                let count = parts.get(2).copied().unwrap_or("?");
                let reason = format!("Outgoing port scan: {} unique ports → {}", count, ip);
                self.panel.report_incident(
                    server_id,
                    &reason,
                    "port_scan",
                    action,
                    1,
                    serde_json::json!({
                        "target_ip": ip,
                        "port_count": count,
                        "detector": "ndpi",
                    }),
                ).await;
            } else {
                let reason = format!(
                    "VPN protocol detected: {} — enforcement: {}",
                    proto_name, action
                );
                self.panel.report_incident(
                    server_id,
                    &reason,
                    "vpn_protocol",
                    action,
                    1,
                    serde_json::json!({
                        "protocol": proto_name,
                        "enforcement": action,
                        "detector": "ndpi",
                    }),
                ).await;
            }
        }
    }

    async fn resolve_sandbox_key(&self, server_id: &str) -> Option<String> {
        let containers = self.docker.list_containers(None).await.ok()?;
        let mut container_id: Option<String> = None;
        let uuid_short = server_id.replace('-', "");
        for c in &containers {
            let names = c.names.as_ref()?;
            for name in names {
                if name.contains(server_id) || name.contains(&uuid_short) {
                    container_id = c.id.clone();
                    break;
                }
            }
            if container_id.is_some() { break; }
        }
        let cid = container_id?;

        let sandbox_key = format!("/var/run/docker/netns/{}", cid);
        if std::path::Path::new(&sandbox_key).exists() {
            Some(sandbox_key)
        } else {
            None
        }
    }

    async fn prune_stale(&self, active_ids: &std::collections::HashSet<String>) {
        self.sandbox_cache.write().await.retain(|id, _| active_ids.contains(id));
        self.states.write().await.retain(|id, _| active_ids.contains(id));
        self.vpn_dpi.prune_stale(active_ids);
    }

    async fn check_cpu_mining(
        &self,
        state: &mut ServerAbuseState,
        cpu_percent: f64,
        cpu_limit: f64,
        cfg: &AbConfig,
        server_id: &str,
        memory_bytes: u64,
        memory_limit: u64,
        now: Instant,
    ) {
        let usage_pct = if cpu_limit > 0.0 { (cpu_percent / cpu_limit) * 100.0 } else { cpu_percent };
        if usage_pct > cfg.cpu_threshold_pct {
            state.high_cpu_count += 1;
        } else {
            state.high_cpu_count = state.high_cpu_count.saturating_sub(1);
        }

        if state.high_cpu_count < 12 { return; }
        if state.last_incident_at.map(|t| now.duration_since(t).as_secs() < cfg.cooldown_seconds).unwrap_or(false) { return; }

        state.strike_count += 1;
        state.last_incident_at = Some(now);
        let action = if state.strike_count >= cfg.strikes_for_suspend { "suspend" } else { "alert" };

        self.panel.report_incident(
            server_id,
            &format!("Sustained high CPU ({:.1}% of {:.0}% allocated) for {}s", usage_pct, cpu_limit, state.high_cpu_count * 5),
            "crypto_mining",
            action,
            state.strike_count,
            serde_json::json!({"cpu_percent": cpu_percent, "cpu_limit": cpu_limit, "cpu_usage_pct": usage_pct, "duration_s": state.high_cpu_count * 5, "memory_bytes": memory_bytes, "memory_limit": memory_limit}),
        ).await;
    }

    async fn check_ddos(
        &self,
        state: &mut ServerAbuseState,
        rx_bytes: u64,
        tx_bytes: u64,
        cfg: &AbConfig,
        server_id: &str,
        now: Instant,
    ) {
        let last = match state.last_sample {
            Some(t) => t,
            None => { state.last_sample = Some(now); state.last_rx_bytes = rx_bytes; state.last_tx_bytes = tx_bytes; return; }
        };
        let elapsed = now.duration_since(last);
        if elapsed.as_secs_f64() <= 0.0 { return; }
        state.last_sample = Some(now);

        let rx_rate = (rx_bytes.saturating_sub(state.last_rx_bytes)) as f64 / elapsed.as_secs_f64();
        let tx_rate = (tx_bytes.saturating_sub(state.last_tx_bytes)) as f64 / elapsed.as_secs_f64();
        state.last_rx_bytes = rx_bytes;
        state.last_tx_bytes = tx_bytes;

        let total_mbps = (rx_rate + tx_rate) / (1024.0 * 1024.0);
        if total_mbps > cfg.network_threshold_mbps {
            state.high_network_count += 1;
        } else {
            state.high_network_count = state.high_network_count.saturating_sub(1);
        }

        if state.high_network_count < 6 { return; }
        if state.last_incident_at.map(|t| now.duration_since(t).as_secs() < cfg.cooldown_seconds).unwrap_or(false) { return; }

        state.strike_count += 1;
        state.last_incident_at = Some(now);
        let action = if state.strike_count >= cfg.strikes_for_suspend + 2 { "suspend" } else { "alert" };

        self.panel.report_incident(
            server_id,
            &format!("Abnormal network traffic ({:.1} MB/s) sustained for {}s", total_mbps, state.high_network_count * 5),
            "ddos_fast_threshold_tcp",
            action,
            state.strike_count,
            serde_json::json!({"rx_mbps": rx_rate / (1024.0 * 1024.0), "tx_mbps": tx_rate / (1024.0 * 1024.0), "total_mbps": total_mbps, "duration_s": state.high_network_count * 5}),
        ).await;
    }
}

pub async fn start(
    panel: Arc<PanelSync>,
    config: Arc<RwLock<AbConfig>>,
    vpn_dpi: Arc<VpnDpiState>,
    state: crate::routes::State,
) {
    tracing::info!("starting embedded anti-abuse detection engine");

    let engine = Arc::new(AntiAbuseEngine::new(
        panel,
        config,
        vpn_dpi,
        state.docker.clone(),
    ));
    let state_mon = state.clone();

    tokio::spawn(async move {
        let mut tick = 0u64;
        loop {
            let servers_guard = state_mon.server_manager.get_servers().await;
            let snapshots: Vec<_> = servers_guard.iter().map(|s| {
                let usage = s.resource_usage();
                (s.uuid, usage.cpu_absolute, usage.network.rx_bytes, usage.network.tx_bytes, usage.memory_bytes, usage.memory_limit_bytes)
            }).collect();
            let active_ids: std::collections::HashSet<String> = snapshots.iter().map(|(uuid, ..)| uuid.to_string()).collect();
            drop(servers_guard);

            for (uuid, cpu, rx, tx, mem, mem_limit) in &snapshots {
                let sid = uuid.to_string();
                engine.process_stats(&sid, *cpu, 100.0, *rx, *tx, *mem, *mem_limit).await;
            }

            for (uuid, _cpu, rx, tx, _mem, _mem_limit) in &snapshots {
                engine.check_vpn(&uuid.to_string(), *rx, *tx).await;
            }

            tick += 1;
            if tick % 60 == 0 {
                engine.prune_stale(&active_ids).await;
            }

            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
    });

    tracing::info!("anti-abuse detection engine started");
}
