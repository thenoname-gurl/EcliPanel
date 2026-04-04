use crate::backend::BackendClient;
use crate::config::Config;
use crate::state::{DetectionTrigger, SharedState};
use serde_json::json;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use tokio::time::{sleep, Duration};
use walkdir::WalkDir;

const MAX_SCAN_SIZE: u64 = 100 * 1024 * 1024;

pub async fn start_background_scanner(
    shared: Arc<SharedState>,
    config: Config,
    backend: BackendClient,
) {
    let wings_dir = config.wings_volume_path.clone();
    
    loop {
        let servers = {
            let names = shared.server_name.read().await;
            names.keys().cloned().collect::<Vec<String>>()
        };

        for server_id in servers {
            let mut server_path = PathBuf::from(&wings_dir);
            server_path.push(&server_id);
            
            if !server_path.exists() || !server_path.is_dir() {
                continue;
            }

            let scan_config = config.clone();
            if let Some(reason) = tokio::task::spawn_blocking(move || {
                scan_server_directory(&server_path, &scan_config)
            })
            .await
            .unwrap_or(None)
            {
                let metrics = json!({
                    "reason": reason,
                    "server_id": server_id,
                });
                
                let trigger = DetectionTrigger {
                    detection_type: "crypto_mining_files".to_string(),
                    reason: reason.clone(),
                    metrics,
                    recent_events: Vec::new(),
                };
                
                report_file_abuse(&server_id, trigger, &config, shared.clone(), &backend).await;
            }
        }
        
        sleep(Duration::from_secs(config.file_scan_interval)).await;
    }
}

fn scan_server_directory(path: &Path, config: &Config) -> Option<String> {
    let plain_signatures = load_plain_signatures(config);

    for entry in WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        if let Ok(metadata) = entry.metadata() {
            if metadata.len() > MAX_SCAN_SIZE {
                continue;
            }
        }

        let file_path = entry.path();
        if let Some(reason) = scan_file(file_path, &plain_signatures) {
            return Some(format!("Found suspicious file at {:?}: {}", file_path, reason));
        }
    }

    if config.yara_enabled {
        if let Some(reason) = run_yara_scan(path, config) {
            return Some(reason);
        }
    }

    None
}

fn run_yara_scan(path: &Path, config: &Config) -> Option<String> {
    let Some(rules_path) = &config.yara_rules_path else {
        return None;
    };

    let rules_files = collect_yara_rule_files(Path::new(rules_path));
    if rules_files.is_empty() {
        return None;
    }

    for rule_file in rules_files {
        let output = Command::new(&config.yara_binary)
            .arg("-r")
            .arg(&rule_file)
            .arg(path)
            .output()
            .ok()?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            continue;
        }

        let first_match = stdout.lines().next().unwrap_or_default();
        return Some(format!(
            "YARA match detected ({}): {}",
            rule_file.display(),
            first_match
        ));
    }

    None
}

fn load_plain_signatures(config: &Config) -> Vec<Vec<u8>> {
    let Some(rules_path) = &config.yara_rules_path else {
        return Vec::new();
    };

    let mut signatures = Vec::new();
    for file in collect_sig_files(Path::new(rules_path)) {
        let Ok(content) = fs::read_to_string(&file) else {
            continue;
        };

        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("//") {
                continue;
            }

            signatures.push(trimmed.as_bytes().to_vec());
        }
    }

    signatures
}

fn collect_sig_files(base: &Path) -> Vec<PathBuf> {
    if base.is_file() {
        let ext = base
            .extension()
            .and_then(|v| v.to_str())
            .map(|v| v.to_ascii_lowercase())
            .unwrap_or_default();
        if ext == "sig" {
            return vec![base.to_path_buf()];
        }
        return Vec::new();
    }

    if !base.is_dir() {
        return Vec::new();
    }

    let mut files = WalkDir::new(base)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| !is_excluded_signature_path(e.path()))
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| {
            let path = e.path();
            let ext = path
                .extension()
                .and_then(|v| v.to_str())
                .map(|v| v.to_ascii_lowercase())
                .unwrap_or_default();

            if ext == "sig" {
                Some(path.to_path_buf())
            } else {
                None
            }
        })
        .collect::<Vec<PathBuf>>();

    files.sort();
    files
}

fn collect_yara_rule_files(base: &Path) -> Vec<PathBuf> {
    if base.is_file() {
        return vec![base.to_path_buf()];
    }

    if !base.is_dir() {
        return Vec::new();
    }

    let mut files = WalkDir::new(base)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| !is_excluded_signature_path(e.path()))
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| {
            let path = e.path();
            let ext = path
                .extension()
                .and_then(|v| v.to_str())
                .map(|v| v.to_ascii_lowercase())
                .unwrap_or_default();

            if matches!(ext.as_str(), "yar" | "yara" | "rule" | "rules") {
                Some(path.to_path_buf())
            } else {
                None
            }
        })
        .collect::<Vec<PathBuf>>();

    files.sort();
    files
}

fn is_excluded_signature_path(path: &Path) -> bool {
    path.components().any(|component| {
        let value = component.as_os_str().to_string_lossy().to_ascii_lowercase();
        matches!(value.as_str(), "malware" | "samples" | "sample")
    })
}

fn scan_file(path: &Path, plain_signatures: &[Vec<u8>]) -> Option<String> {
    let mut file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return None,
    };

    let mut buffer = Vec::new();
    if file.read_to_end(&mut buffer).is_err() {
        return None;
    }

    for signature in plain_signatures {
        if signature.is_empty() {
            continue;
        }
        if memchr_search(&buffer, signature) {
            return Some(format!(
                "contains .sig signature: '{}'",
                String::from_utf8_lossy(signature)
            ));
        }
    }

    None
}

fn memchr_search(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() { return true; }
    if haystack.len() < needle.len() { return false; }
    
    haystack.windows(needle.len()).any(|window| window == needle)
}

async fn report_file_abuse(
    server_id: &str,
    trigger: DetectionTrigger,
    config: &Config,
    _shared: Arc<SharedState>,
    backend: &BackendClient,
) {
    let payload = json!({
        "serverId": server_id,
        "reason": trigger.reason,
        "nodeName": config.node_name,
        "sourceIp": "127.0.0.1",
        "targetIp": "127.0.0.1",
        "targetPort": 0,
        "detectionType": trigger.detection_type,
        "enforcementAction": "Alert",
        "strikeCount": 1,
        "suspendAttempted": false,
        "suspendSuccess": false,
        "detectorName": config.detector_name,
        "metrics": trigger.metrics,
        "recentEvents": trigger.recent_events,
        "enforcementNote": "File scanning detected malicious content.",
    });

    if let Err(err) = backend.report_incident(payload).await {
        eprintln!("[antiabuse] file scanner: failed to report incident: {err:#}");
    }
}
