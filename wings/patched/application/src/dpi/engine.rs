use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

use super::VpnDpiDetector;
use super::capture;
use super::DetectedProtocol;

#[derive(Debug, Clone)]
pub struct VpnDpiConfig {
    pub enabled: bool,
    pub protocol_actions: HashMap<String, String>,
    pub sample_interval_seconds: u64,
    pub sample_duration_ms: u64,
    pub bandwidth_threshold_kbps: u64,
    pub port_scan_threshold: u32,
    pub port_scan_action: String,
}

impl Default for VpnDpiConfig {
    fn default() -> Self {
        let mut actions = HashMap::new();
        actions.insert("WireGuard".into(), "alert".into());
        actions.insert("OpenVPN".into(), "alert".into());
        actions.insert("IPsec".into(), "alert".into());
        actions.insert("IKEv2".into(), "alert".into());
        actions.insert("SoftEther".into(), "alert".into());
        actions.insert("Tor".into(), "suspend".into());
        actions.insert("Tailscale".into(), "alert".into());
        Self {
            enabled: true,
            protocol_actions: actions,
            sample_interval_seconds: 300,
            sample_duration_ms: 10000,
            bandwidth_threshold_kbps: 1,
            port_scan_threshold: 15,
            port_scan_action: "alert".into(),
        }
    }
}

pub struct VpnDpiState {
    pub config: Arc<RwLock<VpnDpiConfig>>,
    last_sampled: Mutex<HashMap<String, Instant>>,
    detector: Mutex<Option<VpnDpiDetector>>,
    prev_bytes: Mutex<HashMap<String, u64>>,
}

impl VpnDpiState {
    pub fn new(config: Arc<RwLock<VpnDpiConfig>>) -> Self {
        let detector = Mutex::new(VpnDpiDetector::new());
        Self {
            config,
            last_sampled: Mutex::new(HashMap::new()),
            detector,
            prev_bytes: Mutex::new(HashMap::new()),
        }
    }

    pub fn sample_container(
        &self,
        server_id: &str,
        sandbox_key: &str,
        rx_bytes: u64,
        tx_bytes: u64,
    ) -> Vec<(String, String)> {
        let cfg = match self.config.try_read() {
            Ok(c) => c.clone(),
            Err(_) => return Vec::new(),
        };
        if !cfg.enabled || cfg.protocol_actions.is_empty() {
            return Vec::new();
        }

        {
            let mut last = self.last_sampled.lock().unwrap();
            if let Some(prev) = last.get(server_id) {
                if prev.elapsed().as_secs() < cfg.sample_interval_seconds {
                    return Vec::new();
                }
            }
        }

        let total = rx_bytes.saturating_add(tx_bytes);
        let delta_bytes = {
            let mut prev = self.prev_bytes.lock().unwrap();
            let prev_total = prev.get(server_id).copied().unwrap_or(0);
            prev.insert(server_id.to_string(), total);
            if prev_total > 0 && total > prev_total {
                total.saturating_sub(prev_total)
            } else {
                0
            }
        };

        if delta_bytes < cfg.bandwidth_threshold_kbps * 1024 {
            return Vec::new();
        }

        {
            let mut last = self.last_sampled.lock().unwrap();
            last.insert(server_id.to_string(), Instant::now());
        }

        let duration = Duration::from_millis(cfg.sample_duration_ms);
        let packets = capture::capture_sample(sandbox_key, duration);

        if packets.is_empty() {
            return Vec::new();
        }

        let mut results: Vec<(String, String)> = Vec::new();

        let profile = capture::analyze_packets(&packets);
        let connections = capture::extract_connections(&packets);

        let attack_type = classify_attack(&profile);

        for (dst_ip, ports) in &connections {
            if ports.len() >= cfg.port_scan_threshold as usize {
                let ip_str = format!("{}.{}.{}.{}",
                    (dst_ip >> 24) as u8, (dst_ip >> 16) as u8,
                    (dst_ip >> 8) as u8, *dst_ip as u8);
                let tag = if let Some(ref at) = attack_type {
                    format!("{}:{}:{}", at, ip_str, ports.len())
                } else {
                    format!("PortScan:{}:{}", ip_str, ports.len())
                };
                results.push((tag, cfg.port_scan_action.clone()));
                let label = attack_type.as_deref().unwrap_or("Port scan");
                tracing::info!("{} detected on {}: {} ports → {}", label, server_id, ports.len(), ip_str);
            }
        }

        if let Some(ref at) = attack_type {
            if connections.values().all(|p| p.len() < cfg.port_scan_threshold as usize) {
                results.push((format!("{}:0.0.0.0:0", at), "alert".into()));
                tracing::info!("{} detected on {} ({} total packets)", at, server_id, profile.total);
            }
        }

        let mut detector = self.detector.lock().unwrap();
        let d = match detector.as_mut() {
            Some(d) => d,
            None => return results,
        };

        let mut matches: HashMap<String, DetectedProtocol> = HashMap::new();
        for pkt in &packets {
            if let Some(proto) = d.classify_packet(pkt) {
                let name = proto.name.clone();
                matches
                    .entry(name.clone())
                    .and_modify(|e| e.packet_count += 1)
                    .or_insert(proto);
            }
        }

        let vpn: Vec<(String, String)> = matches
            .into_values()
            .filter(|p| p.packet_count >= 3)
            .filter_map(|p| {
                let name_lower = p.name.to_lowercase();
                cfg.protocol_actions.iter().find(|(proto, _)| {
                    name_lower.contains(&proto.to_lowercase())
                }).map(|(_, action)| (p.name.clone(), action.clone()))
            })
            .collect();

        if !vpn.is_empty() {
            tracing::info!(
                "VPN DPI: detected on {} (delta={} bytes): {:?}",
                server_id, delta_bytes,
                vpn.iter().map(|(n, a)| format!("{n}→{a}")).collect::<Vec<_>>()
            );
        }

        results.extend(vpn);
        results
    }

    pub fn prune_stale(&self, active_ids: &std::collections::HashSet<String>) {
        self.last_sampled.lock().unwrap().retain(|id, _| active_ids.contains(id));
        self.prev_bytes.lock().unwrap().retain(|id, _| active_ids.contains(id));
    }
}

fn classify_attack(profile: &capture::PacketProfile) -> Option<String> {
    let t = profile.total.max(1) as f64;
    if profile.udp as f64 / t > 0.7 {
        if profile.dns > 100 { return Some("DNS amplification".into()); }
        if profile.ntp > 50 { return Some("NTP amplification".into()); }
        if profile.ssdp > 50 { return Some("SSDP amplification".into()); }
        if profile.memcached > 30 { return Some("Memcached amplification".into()); }
        return Some("UDP flood".into());
    }
    if profile.tcp_syn as f64 / t > 0.7 {
        if profile.http > 200 { return Some("HTTP flood".into()); }
        if profile.ssh > 50 { return Some("SSH brute force".into()); }
        return Some("SYN flood".into());
    }
    if profile.icmp as f64 / t > 0.5 {
        return Some("ICMP flood".into());
    }
    if profile.http > 500 {
        return Some("HTTP flood".into());
    }
    if profile.ssh > 100 {
        return Some("SSH brute force".into());
    }
    None
}
