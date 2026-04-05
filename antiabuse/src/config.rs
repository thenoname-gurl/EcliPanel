use anyhow::{Context, Result};
use std::collections::HashSet;
use std::env;
use std::path::Path;
use std::str::FromStr;
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
    pub fast_threshold_window: Duration,
    pub slow_threshold_window: Duration,
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
    pub auto_suspend_enabled: bool,
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

fn env_req<T>(name: &str) -> Result<T>
where
    T: FromStr,
    T::Err: std::error::Error + Send + Sync + 'static,
{
    let type_name = std::any::type_name::<T>();
    env::var(name)
        .with_context(|| format!("{name} is required"))?
        .trim()
        .parse::<T>()
        .with_context(|| format!("{name} has an invalid value for type {type_name}"))
}

fn env_or<T>(name: &str, default: T) -> Result<T>
where
    T: FromStr,
    T::Err: std::error::Error + Send + Sync + 'static,
{
    let type_name = std::any::type_name::<T>();
    env::var(name)
        .ok()
        // if we have a value, try parsing it
        .map(|s| {
            s.trim()
                .parse::<T>()
                .with_context(|| format!("{name} has an invalid value for type {type_name}"))
        })
        // if we do not have a value, fall back to `default`
        .unwrap_or(Ok(default))
}

fn env_bool_req(name: &str) -> Result<bool> {
    let raw = env::var(name).with_context(|| format!("{} is required", name))?;
    let s = raw.trim().to_ascii_lowercase();
    Ok(matches!(s.as_str(), "1" | "true" | "yes" | "on"))
}

fn env_bool_or(name: &str, default: bool) -> bool {
    env::var(name)
        .ok()
        .map(|v| {
            matches!(
                v.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(default)
}

fn env_str_req(name: &str) -> Result<String> {
    let raw = env::var(name).with_context(|| format!("{} is required", name))?;
    let trimmed = raw.trim().to_string();
    if trimmed.is_empty() {
        anyhow::bail!("{} cannot be empty", name);
    }
    Ok(trimmed)
}

fn env_csv_req(name: &str) -> Result<Vec<String>> {
    let raw = env::var(name).with_context(|| format!("{} is required", name))?;
    Ok(raw
        .split(',')
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| !s.is_empty())
        .collect())
}

fn env_csv_set_req(name: &str) -> Result<HashSet<String>> {
    Ok(env_csv_req(name)?.into_iter().collect())
}

fn port_set(var_name: &str, default_raw: &str) -> HashSet<u16> {
    let raw = env::var(var_name).unwrap_or_else(|_| default_raw.to_string());
    raw.split(',')
        .filter_map(|p| p.trim().parse::<u16>().ok())
        .collect::<HashSet<u16>>()
}

fn discover_default_yara_rules_path() -> Option<String> {
    const LOCAL: &[&str] = &["signatures", "signatures/malware.sig"];
    const SEARCH: &[&str] = &["signatures", "antiabuse/signatures"];

    for candidate in LOCAL {
        if Path::new(candidate).exists() {
            return Some(candidate.to_string());
        }
    }

    let depth = 5;
    let exe = env::current_exe().ok()?;
    exe.parent()?
        .ancestors()
        .take(depth)
        .flat_map(|dir| SEARCH.iter().map(move |rel| dir.join(rel)))
        .find(|p| p.exists())
        // to anyone that has non-utf8 paths... tf is wrong with you?
        .map(|p| p.to_string_lossy().into_owned())
}

pub fn from_env() -> Result<Config> {
    let _ = dotenvy::dotenv();

    let backend_url = env::var("BACKEND_URL").context("BACKEND_URL is required")?;
    let api_key = env::var("ANTIABUSE_API_KEY").context("ANTIABUSE_API_KEY is required")?;

    Ok(Config {
        backend_url: backend_url.trim_end_matches('/').to_string(),
        api_key,
        detector_name: env::var("DETECTOR_NAME").unwrap_or_else(|_| "antiabuse-rs".to_string()),
        node_name: env::var("NODE_NAME")
            .or_else(|_| env::var("HOSTNAME"))
            .unwrap_or_else(|_| "unknown".to_string()),
        tcpdump_cmd: env::var("TCPDUMP_CMD")
            .ok()
            .filter(|s| !s.trim().is_empty()),

        refresh_interval: Duration::from_millis(env_req("MAP_REFRESH_MS")?),
        window: Duration::from_millis(env_req("WINDOW_MS")?),
        suspend_cooldown: Duration::from_millis(env_req("SUSPEND_COOLDOWN_MS")?),
        strike_decay_window: Duration::from_millis(env_req("STRIKE_DECAY_MS")?),

        slow_big_hit_threshold: env_req("SLOW_BIG_HIT_THRESHOLD")?,
        slow_ip_threshold: env_req("SLOW_IP_THRESHOLD")?,
        fast_big_hit_threshold: env_req("FAST_BIG_HIT_THRESHOLD")?,
        fast_ip_threshold: env_req("FAST_IP_THRESHOLD")?,
        fast_threshold_window: Duration::from_millis(env_or("FAST_THRESHOLD_WINDOW_MS", 30_000u64)?),
        slow_threshold_window: Duration::from_millis(env_or("SLOW_THRESHOLD_WINDOW_MS", 300_000u64)?),
        sequential_port_trigger: env_req("SEQUENTIAL_PORT_TRIGGER")?,
        unique_ports_threshold: env_req("UNIQUE_PORTS_THRESHOLD")?,
        mining_port_hit_threshold: env_req("MINING_PORT_HIT_THRESHOLD")?,
        mining_ip_threshold: env_req("MINING_IP_THRESHOLD")?,
        udp_flood_hit_threshold: env_req("UDP_FLOOD_HIT_THRESHOLD")?,
        udp_flood_ip_threshold: env_req("UDP_FLOOD_IP_THRESHOLD")?,
        amplification_hit_threshold: env_req("AMPLIFICATION_HIT_THRESHOLD")?,
        amplification_target_threshold: env_req("AMPLIFICATION_TARGET_THRESHOLD")?,
        alert_strikes: env_req("ALERT_STRIKES")?,
        throttle_strikes: env_req("THROTTLE_STRIKES")?,
        suspend_strikes: env_req("SUSPEND_STRIKES")?,
        auto_suspend_enabled: env_bool_or("AUTO_SUSPEND_ENABLED", true),
        safe_ports: port_set("SAFE_PORTS", "80,443"),
        mining_ports: port_set("MINING_PORTS", "3333,4444,5555,6666,7777,14444"),
        throttle_cpu_limit_percent: env_req("THROTTLE_CPU_LIMIT_PERCENT")?,
        throttle_duration_seconds: env_req("THROTTLE_DURATION_SECONDS")?,
        heartbeat_interval: Duration::from_millis(env_req("HEARTBEAT_MS")?),
        use_server_network_map: env_bool_or("USE_SERVER_NETWORK_MAP", true),
        wings_volume_path: env_str_req("WINGS_VOLUME_PATH")?,
        file_scan_interval: env_req("FILE_SCAN_INTERVAL_SECONDS")?,
        signature_reload_interval: Some(env_req("SIGNATURE_RELOAD_INTERVAL_SECONDS")?),
        unmapped_log_every: env_or("UNMAPPED_LOG_EVERY", 100)?,
        enable_node_fallback_detection: env_bool_or("ENABLE_NODE_FALLBACK_DETECTION", true),
        detection_cooldown: Duration::from_millis(env_req("DETECTION_COOLDOWN_MS")?),
        use_docker_network_map: env_bool_req("USE_DOCKER_NETWORK_MAP")?,
        port_scan_auto_suspend_unique_ports: env_req("PORT_SCAN_AUTO_SUSPEND_UNIQUE_PORTS")?,
        yara_enabled: env_bool_or("YARA_ENABLED", false),

        malware_suspend_signature_severity: env_req("MALWARE_SUSPEND_SIGNATURE_SEVERITY")?,
        malware_suspend_signature_matches: env_bool_or("MALWARE_SUSPEND_SIGNATURES", false),
        malware_report_cap_per_server: env_req("MALWARE_REPORT_CAP_PER_SERVER")?,
        malware_skip_path_patterns: env_csv_req("MALWARE_SKIP_PATH_PATTERNS")?,
        malware_skip_extensions: env_csv_set_req("MALWARE_SKIP_EXTENSIONS")?,

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
