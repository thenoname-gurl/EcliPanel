use anyhow::{Context, Result};
use std::collections::HashSet;
use std::env;
use std::path::Path;
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct Config {
    pub backend_url: String,
    pub api_key: String,
    pub detector_name: String,
    pub node_name: String,
    pub tcpdump_cmd: Option<String>,
    pub refresh_interval: Duration,
    pub window: Duration,
    pub suspend_cooldown: Duration,
    pub strike_decay_window: Duration,
    pub slow_big_hit_threshold: usize,
    pub slow_ip_threshold: usize,
    pub fast_big_hit_threshold: usize,
    pub fast_ip_threshold: usize,
    pub sequential_port_trigger: usize,
    pub unique_ports_threshold: usize,
    pub mining_port_hit_threshold: usize,
    pub mining_ip_threshold: usize,
    pub udp_flood_hit_threshold: usize,
    pub udp_flood_ip_threshold: usize,
    pub amplification_hit_threshold: usize,
    pub amplification_target_threshold: usize,
    pub alert_strikes: u32,
    pub throttle_strikes: u32,
    pub suspend_strikes: u32,
    pub safe_ports: HashSet<u16>,
    pub mining_ports: HashSet<u16>,
    pub throttle_cpu_limit_percent: u16,
    pub throttle_duration_seconds: u64,
    pub heartbeat_interval: Duration,
    pub use_server_network_map: bool,
    pub wings_volume_path: String,
    pub file_scan_interval: u64,
    pub unmapped_log_every: u64,
    pub enable_node_fallback_detection: bool,
    pub detection_cooldown: Duration,
    pub use_docker_network_map: bool,
    pub port_scan_auto_suspend_unique_ports: usize,
    pub yara_enabled: bool,
    pub yara_rules_path: Option<String>,
    pub yara_binary: String,
    pub signature_reload_interval: Option<u64>,
    pub malware_suspend_signature_severity: f64,
    pub malware_suspend_signature_matches: bool,
    pub malware_report_cap_per_server: u32,
    pub malware_skip_path_patterns: Vec<String>,
    pub malware_skip_extensions: HashSet<String>,
}

fn parse_env_bool(name: &str, default: bool) -> bool {
    match env::var(name) {
        Ok(v) => {
            let s = v.trim().to_ascii_lowercase();
            matches!(s.as_str(), "1" | "true" | "yes" | "on")
        }
        Err(_) => default,
    }
}

fn parse_env_u64(name: &str, default: u64) -> u64 {
    env::var(name)
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(default)
}

fn parse_env_f64_required(name: &str) -> Result<f64> {
    let raw = env::var(name).with_context(|| format!("{} is required", name))?;
    raw.parse::<f64>()
        .with_context(|| format!("{} must be a valid float", name))
}

fn parse_env_u64_required(name: &str) -> Result<u64> {
    let raw = env::var(name).with_context(|| format!("{} is required", name))?;
    raw.parse::<u64>()
        .with_context(|| format!("{} must be a valid integer", name))
}

fn parse_env_usize_required(name: &str) -> Result<usize> {
    let raw = env::var(name).with_context(|| format!("{} is required", name))?;
    raw.parse::<usize>()
        .with_context(|| format!("{} must be a valid integer", name))
}

fn parse_env_u32_required(name: &str) -> Result<u32> {
    let raw = env::var(name).with_context(|| format!("{} is required", name))?;
    raw.parse::<u32>()
        .with_context(|| format!("{} must be a valid integer", name))
}

fn parse_env_u16_required(name: &str) -> Result<u16> {
    let raw = env::var(name).with_context(|| format!("{} is required", name))?;
    raw.parse::<u16>()
        .with_context(|| format!("{} must be a valid integer", name))
}

fn parse_env_bool_required(name: &str) -> Result<bool> {
    let raw = env::var(name).with_context(|| format!("{} is required", name))?;
    let s = raw.trim().to_ascii_lowercase();
    Ok(matches!(s.as_str(), "1" | "true" | "yes" | "on"))
}

fn parse_env_string_required(name: &str) -> Result<String> {
    let raw = env::var(name).with_context(|| format!("{} is required", name))?;
    let trimmed = raw.trim().to_string();
    if trimmed.is_empty() {
        anyhow::bail!("{} cannot be empty", name);
    }
    Ok(trimmed)
}

fn parse_env_csv_required(name: &str) -> Result<Vec<String>> {
    let raw = env::var(name).with_context(|| format!("{} is required", name))?;
    Ok(raw
        .split(',')
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| !s.is_empty())
        .collect())
}

fn parse_env_csv_set_required(name: &str) -> Result<HashSet<String>> {
    Ok(parse_env_csv_required(name)?.into_iter().collect())
}

fn parse_port_set(var_name: &str, default_raw: &str) -> HashSet<u16> {
    let raw = env::var(var_name).unwrap_or_else(|_| default_raw.to_string());
    raw.split(',')
        .filter_map(|p| p.trim().parse::<u16>().ok())
        .collect::<HashSet<u16>>()
}

fn discover_default_yara_rules_path() -> Option<String> {
    let candidates = [
        "signatures",
        "signatures/malware.sig",
    ];

    for candidate in candidates {
        if Path::new(candidate).exists() {
            return Some(candidate.to_string());
        }
    }

    if let Ok(exe_path) = env::current_exe() {
        if let Some(mut dir) = exe_path.parent() {
            let mut depth = 0;
            while depth < 5 {
                for candidate in ["signatures", "antiabuse/signatures"] {
                    let path = dir.join(candidate);
                    if path.exists() {
                        return Some(path.to_string_lossy().to_string());
                    }
                }

                if let Some(parent) = dir.parent() {
                    dir = parent;
                    depth += 1;
                } else {
                    break;
                }
            }
        }
    }

    None
}

pub fn from_env() -> Result<Config> {
    let _ = dotenvy::dotenv();

    let backend_url = env::var("BACKEND_URL").context("BACKEND_URL is required")?;
    let api_key = env::var("ANTIABUSE_API_KEY").context("ANTIABUSE_API_KEY is required")?;

    let backend_url = backend_url.trim_end_matches('/').to_string();
    let detector_name = env::var("DETECTOR_NAME").unwrap_or_else(|_| "antiabuse-rs".to_string());
    let node_name = env::var("NODE_NAME")
        .or_else(|_| env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown".to_string());
    let tcpdump_cmd = env::var("TCPDUMP_CMD").ok().filter(|s| !s.trim().is_empty());

    let alert_strikes = parse_env_u32_required("ALERT_STRIKES")?;
    let throttle_strikes = parse_env_u32_required("THROTTLE_STRIKES")?;
    let suspend_strikes = parse_env_u32_required("SUSPEND_STRIKES")?;
    let mining_port_hit_threshold = parse_env_usize_required("MINING_PORT_HIT_THRESHOLD")?;
    let mining_ip_threshold = parse_env_usize_required("MINING_IP_THRESHOLD")?;
    let udp_flood_hit_threshold = parse_env_usize_required("UDP_FLOOD_HIT_THRESHOLD")?;
    let udp_flood_ip_threshold = parse_env_usize_required("UDP_FLOOD_IP_THRESHOLD")?;
    let amplification_hit_threshold = parse_env_usize_required("AMPLIFICATION_HIT_THRESHOLD")?;
    let amplification_target_threshold = parse_env_usize_required("AMPLIFICATION_TARGET_THRESHOLD")?;
    let strike_decay_ms = parse_env_u64_required("STRIKE_DECAY_MS")?;
    let throttle_cpu_limit_percent = parse_env_u16_required("THROTTLE_CPU_LIMIT_PERCENT")?;
    let throttle_duration_seconds = parse_env_u64_required("THROTTLE_DURATION_SECONDS")?;
    let heartbeat_ms = parse_env_u64_required("HEARTBEAT_MS")?;
    let file_scan_interval_seconds = parse_env_u64_required("FILE_SCAN_INTERVAL_SECONDS")?;
    let signature_reload_interval_seconds = parse_env_u64_required("SIGNATURE_RELOAD_INTERVAL_SECONDS")?;
    let wings_volume_path = parse_env_string_required("WINGS_VOLUME_PATH")?;
    let detection_cooldown_ms = parse_env_u64_required("DETECTION_COOLDOWN_MS")?;
    let use_docker_network_map = parse_env_bool_required("USE_DOCKER_NETWORK_MAP")?;
    let port_scan_auto_suspend_unique_ports = parse_env_usize_required("PORT_SCAN_AUTO_SUSPEND_UNIQUE_PORTS")?;
    let malware_suspend_signature_severity = parse_env_f64_required("MALWARE_SUSPEND_SIGNATURE_SEVERITY")?;
    let malware_suspend_signature_matches = parse_env_bool("MALWARE_SUSPEND_SIGNATURES", false);
    let malware_report_cap_per_server = parse_env_u32_required("MALWARE_REPORT_CAP_PER_SERVER")?;
    let malware_skip_path_patterns = parse_env_csv_required("MALWARE_SKIP_PATH_PATTERNS")?;
    let malware_skip_extensions = parse_env_csv_set_required("MALWARE_SKIP_EXTENSIONS")?;

    Ok(Config {
        backend_url,
        api_key,
        detector_name,
        node_name,
        tcpdump_cmd,
        refresh_interval: Duration::from_millis(parse_env_u64_required("MAP_REFRESH_MS")?),
        window: Duration::from_millis(parse_env_u64_required("WINDOW_MS")?),
        suspend_cooldown: Duration::from_millis(parse_env_u64_required("SUSPEND_COOLDOWN_MS")?),
        strike_decay_window: Duration::from_millis(strike_decay_ms),
        slow_big_hit_threshold: parse_env_usize_required("SLOW_BIG_HIT_THRESHOLD")?,
        slow_ip_threshold: parse_env_usize_required("SLOW_IP_THRESHOLD")?,
        fast_big_hit_threshold: parse_env_usize_required("FAST_BIG_HIT_THRESHOLD")?,
        fast_ip_threshold: parse_env_usize_required("FAST_IP_THRESHOLD")?,
        sequential_port_trigger: parse_env_usize_required("SEQUENTIAL_PORT_TRIGGER")?,
        unique_ports_threshold: parse_env_usize_required("UNIQUE_PORTS_THRESHOLD")?,
        mining_port_hit_threshold,
        mining_ip_threshold,
        udp_flood_hit_threshold,
        udp_flood_ip_threshold,
        amplification_hit_threshold,
        amplification_target_threshold,
        alert_strikes,
        throttle_strikes,
        suspend_strikes,
        safe_ports: parse_port_set("SAFE_PORTS", "80,443"),
        mining_ports: parse_port_set("MINING_PORTS", "3333,4444,5555,6666,7777,14444"),
        throttle_cpu_limit_percent,
        throttle_duration_seconds,
        heartbeat_interval: Duration::from_millis(heartbeat_ms),
        use_server_network_map: parse_env_bool("USE_SERVER_NETWORK_MAP", true),
        wings_volume_path,
        file_scan_interval: file_scan_interval_seconds,
        signature_reload_interval: Some(signature_reload_interval_seconds),
        unmapped_log_every: parse_env_u64("UNMAPPED_LOG_EVERY", 100),
        enable_node_fallback_detection: parse_env_bool("ENABLE_NODE_FALLBACK_DETECTION", true),
        detection_cooldown: Duration::from_millis(detection_cooldown_ms),
        use_docker_network_map,
        port_scan_auto_suspend_unique_ports,
        yara_enabled: parse_env_bool("YARA_ENABLED", false),
        yara_rules_path: env::var("YARA_RULES_PATH")
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .or_else(discover_default_yara_rules_path),
        yara_binary: env::var("YARA_BINARY")
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| "yara".to_string()),
        malware_suspend_signature_severity,
        malware_suspend_signature_matches,
        malware_report_cap_per_server,
        malware_skip_path_patterns,
        malware_skip_extensions,
    })
}