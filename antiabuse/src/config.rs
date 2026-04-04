use anyhow::{Context, Result};
use std::collections::HashSet;
use std::env;
use std::path::Path;
use std::time::Duration;

const DEFAULT_WINDOW_MS: u64 = 15 * 60 * 1000;
const DEFAULT_SLOW_BIG_HIT_THRESHOLD: usize = 20;
const DEFAULT_SLOW_IP_THRESHOLD: usize = 10;
const DEFAULT_FAST_BIG_HIT_THRESHOLD: usize = 5;
const DEFAULT_FAST_IP_THRESHOLD: usize = 3;
const DEFAULT_SEQUENTIAL_PORT_TRIGGER: usize = 4;
const DEFAULT_UNIQUE_PORTS_THRESHOLD: usize = 20;
const DEFAULT_SUSPEND_COOLDOWN_MS: u64 = 60_000;
const DEFAULT_MAP_REFRESH_MS: u64 = 60_000;

const DEFAULT_MINING_PORT_HIT_THRESHOLD: usize = 8;
const DEFAULT_MINING_IP_THRESHOLD: usize = 2;
const DEFAULT_STRIKE_DECAY_MS: u64 = 60 * 60 * 1000;
const DEFAULT_ALERT_STRIKES: u32 = 1;
const DEFAULT_THROTTLE_STRIKES: u32 = 2;
const DEFAULT_SUSPEND_STRIKES: u32 = 3;
const DEFAULT_THROTTLE_CPU_LIMIT_PERCENT: u16 = 20;
const DEFAULT_THROTTLE_DURATION_SECONDS: u64 = 900;
const DEFAULT_HEARTBEAT_MS: u64 = 30_000;
const DEFAULT_FILE_SCAN_INTERVAL_SECONDS: u64 = 21600;
const DEFAULT_WINGS_VOLUME_PATH: &str = "/var/lib/pterodactyl/volumes";
const DEFAULT_DETECTION_COOLDOWN_MS: u64 = 30_000;
const DEFAULT_USE_DOCKER_NETWORK_MAP: bool = true;
const DEFAULT_PORT_SCAN_AUTO_SUSPEND_UNIQUE_PORTS: usize = 40;

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

fn parse_env_usize(name: &str, default: usize) -> usize {
    env::var(name)
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(default)
}

fn parse_env_u32(name: &str, default: u32) -> u32 {
    env::var(name)
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(default)
}

fn parse_env_u16(name: &str, default: u16) -> u16 {
    env::var(name)
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(default)
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

    let alert_strikes = parse_env_u32("ALERT_STRIKES", DEFAULT_ALERT_STRIKES);
    let throttle_strikes = parse_env_u32("THROTTLE_STRIKES", DEFAULT_THROTTLE_STRIKES);
    let suspend_strikes = parse_env_u32("SUSPEND_STRIKES", DEFAULT_SUSPEND_STRIKES);

    Ok(Config {
        backend_url,
        api_key,
        detector_name,
        node_name,
        tcpdump_cmd,
        refresh_interval: Duration::from_millis(parse_env_u64("MAP_REFRESH_MS", DEFAULT_MAP_REFRESH_MS)),
        window: Duration::from_millis(parse_env_u64("WINDOW_MS", DEFAULT_WINDOW_MS)),
        suspend_cooldown: Duration::from_millis(parse_env_u64(
            "SUSPEND_COOLDOWN_MS",
            DEFAULT_SUSPEND_COOLDOWN_MS,
        )),
        strike_decay_window: Duration::from_millis(parse_env_u64(
            "STRIKE_DECAY_MS",
            DEFAULT_STRIKE_DECAY_MS,
        )),
        slow_big_hit_threshold: parse_env_usize("SLOW_BIG_HIT_THRESHOLD", DEFAULT_SLOW_BIG_HIT_THRESHOLD),
        slow_ip_threshold: parse_env_usize("SLOW_IP_THRESHOLD", DEFAULT_SLOW_IP_THRESHOLD),
        fast_big_hit_threshold: parse_env_usize("FAST_BIG_HIT_THRESHOLD", DEFAULT_FAST_BIG_HIT_THRESHOLD),
        fast_ip_threshold: parse_env_usize("FAST_IP_THRESHOLD", DEFAULT_FAST_IP_THRESHOLD),
        sequential_port_trigger: parse_env_usize("SEQUENTIAL_PORT_TRIGGER", DEFAULT_SEQUENTIAL_PORT_TRIGGER),
        unique_ports_threshold: parse_env_usize("UNIQUE_PORTS_THRESHOLD", DEFAULT_UNIQUE_PORTS_THRESHOLD),
        mining_port_hit_threshold: parse_env_usize(
            "MINING_PORT_HIT_THRESHOLD",
            DEFAULT_MINING_PORT_HIT_THRESHOLD,
        ),
        mining_ip_threshold: parse_env_usize("MINING_IP_THRESHOLD", DEFAULT_MINING_IP_THRESHOLD),
        alert_strikes,
        throttle_strikes,
        suspend_strikes,
        safe_ports: parse_port_set("SAFE_PORTS", "80,443"),
        mining_ports: parse_port_set("MINING_PORTS", "3333,4444,5555,6666,7777,14444"),
        throttle_cpu_limit_percent: parse_env_u16(
            "THROTTLE_CPU_LIMIT_PERCENT",
            DEFAULT_THROTTLE_CPU_LIMIT_PERCENT,
        ),
        throttle_duration_seconds: parse_env_u64(
            "THROTTLE_DURATION_SECONDS",
            DEFAULT_THROTTLE_DURATION_SECONDS,
        ),
        heartbeat_interval: Duration::from_millis(parse_env_u64("HEARTBEAT_MS", DEFAULT_HEARTBEAT_MS)),
        use_server_network_map: parse_env_bool("USE_SERVER_NETWORK_MAP", true),
        wings_volume_path: env::var("WINGS_VOLUME_PATH")
            .unwrap_or_else(|_| DEFAULT_WINGS_VOLUME_PATH.to_string()),
        file_scan_interval: parse_env_u64(
            "FILE_SCAN_INTERVAL_SECONDS",
            DEFAULT_FILE_SCAN_INTERVAL_SECONDS,
        ),
        unmapped_log_every: parse_env_u64("UNMAPPED_LOG_EVERY", 100),
        enable_node_fallback_detection: parse_env_bool("ENABLE_NODE_FALLBACK_DETECTION", true),
        detection_cooldown: Duration::from_millis(parse_env_u64(
            "DETECTION_COOLDOWN_MS",
            DEFAULT_DETECTION_COOLDOWN_MS,
        )),
        use_docker_network_map: parse_env_bool(
            "USE_DOCKER_NETWORK_MAP",
            DEFAULT_USE_DOCKER_NETWORK_MAP,
        ),
        port_scan_auto_suspend_unique_ports: parse_env_usize(
            "PORT_SCAN_AUTO_SUSPEND_UNIQUE_PORTS",
            DEFAULT_PORT_SCAN_AUTO_SUSPEND_UNIQUE_PORTS,
        ),
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
    })
}