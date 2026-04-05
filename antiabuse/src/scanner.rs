use crate::backend::BackendClient;
use crate::config::Config;
use crate::state::{DetectionTrigger, SharedState};
use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration};
use walkdir::WalkDir;

const MAX_SCAN_SIZE: u64 = 100 * 1024 * 1024;
const SAMPLE_MAX_SIZE: u64 = 100 * 1024 * 1024;
const HASH_CHUNK_SIZE: usize = 8192;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MalwareCategory {
    Cryptominer,
    DDoS,
    Botnet,
    Exploit,
    Rootkit,
    Spam,
    Phishing,
    Proxy,
    Obfuscated,
    Packed,
    Unknown,
}

impl MalwareCategory {
    fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "CRYPTOMINER" => Self::Cryptominer,
            "DDOS" => Self::DDoS,
            "BOTNET" => Self::Botnet,
            "EXPLOIT" => Self::Exploit,
            "ROOTKIT" => Self::Rootkit,
            "SPAM" => Self::Spam,
            "PHISHING" => Self::Phishing,
            "PROXY" => Self::Proxy,
            "OBFUSCATED" => Self::Obfuscated,
            "PACKED" => Self::Packed,
            _ => Self::Unknown,
        }
    }

    fn as_str(&self) -> &'static str {
        match self {
            Self::Cryptominer => "cryptominer",
            Self::DDoS => "ddos",
            Self::Botnet => "botnet",
            Self::Exploit => "exploit",
            Self::Rootkit => "rootkit",
            Self::Spam => "spam",
            Self::Phishing => "phishing",
            Self::Proxy => "proxy",
            Self::Obfuscated => "obfuscated",
            Self::Packed => "packed",
            Self::Unknown => "unknown",
        }
    }

    fn default_severity(&self) -> f64 {
        match self {
            Self::Cryptominer => 0.95,
            Self::DDoS => 0.98,
            Self::Botnet => 0.98,
            Self::Exploit => 0.85,
            Self::Rootkit => 0.99,
            Self::Spam => 0.70,
            Self::Phishing => 0.80,
            Self::Proxy => 0.50,
            Self::Obfuscated => 0.60,
            Self::Packed => 0.55,
            Self::Unknown => 0.50,
        }
    }
}

#[derive(Debug, Clone)]
pub struct MalwareSignature {
    pub category: MalwareCategory,
    pub name: String,
    pub pattern: String,
    pub is_regex: bool,
    pub severity: f64,
    pub description: String,
    compiled_regex: Option<Regex>,
}

impl MalwareSignature {
    fn compile(&mut self) {
        if self.is_regex {
            match Regex::new(&self.pattern) {
                Ok(re) => self.compiled_regex = Some(re),
                Err(e) => {
                    eprintln!(
                        "[antiabuse] failed to compile regex for '{}': {}",
                        self.name, e
                    );
                    self.compiled_regex = None;
                }
            }
        }
    }

    fn matches(&self, content: &[u8]) -> Option<SignatureMatch> {
        let matched = if self.is_regex {
            if let Some(ref re) = self.compiled_regex {
                let text = String::from_utf8_lossy(content);
                if let Some(m) = re.find(&text) {
                    Some(m.as_str().to_string())
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            let pattern_bytes = self.pattern.as_bytes();
            if memmem_search(content, pattern_bytes) {
                Some(self.pattern.clone())
            } else {
                None
            }
        };

        matched.map(|matched_content| SignatureMatch {
            signature_name: self.name.clone(),
            category: self.category.clone(),
            severity: self.severity,
            matched_content: truncate_match(&matched_content, 200),
            description: self.description.clone(),
        })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SignatureMatch {
    pub signature_name: String,
    pub category: MalwareCategory,
    pub severity: f64,
    pub matched_content: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct YaraMatch {
    pub rule_name: String,
    pub rule_file: String,
    pub matched_strings: Vec<String>,
    pub tags: Vec<String>,
    pub meta: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HashMatch {
    pub hash_type: String,
    pub hash_value: String,
    pub known_malware_name: String,
    pub sample_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileDetection {
    pub file_path: String,
    pub file_size: u64,
    pub file_hash_sha256: String,
    pub file_hash_md5: String,
    pub signature_matches: Vec<SignatureMatch>,
    pub yara_matches: Vec<YaraMatch>,
    pub hash_matches: Vec<HashMatch>,
    pub highest_severity: f64,
    pub primary_category: MalwareCategory,
    pub detection_time: String,
}

impl FileDetection {
    fn is_malicious(&self) -> bool {
        !self.signature_matches.is_empty()
            || !self.yara_matches.is_empty()
            || !self.hash_matches.is_empty()
    }

    fn compute_severity(&mut self) {
        let sig_max = self
            .signature_matches
            .iter()
            .map(|m| m.severity)
            .fold(0.0, f64::max);

        let yara_severity = if !self.yara_matches.is_empty() {
            0.95
        } else {
            0.0
        };

        let hash_severity = if !self.hash_matches.is_empty() {
            1.0
        } else {
            0.0
        };

        self.highest_severity = sig_max.max(yara_severity).max(hash_severity);
    }

    fn determine_category(&mut self) {
        if !self.hash_matches.is_empty() {
            self.primary_category = MalwareCategory::Unknown;
            return;
        }

        if let Some(best_match) = self
            .signature_matches
            .iter()
            .max_by(|a, b| a.severity.partial_cmp(&b.severity).unwrap())
        {
            self.primary_category = best_match.category.clone();
            return;
        }

        if !self.yara_matches.is_empty() {
            let rule_name = self.yara_matches[0].rule_name.to_lowercase();
            if rule_name.contains("miner") || rule_name.contains("crypto") {
                self.primary_category = MalwareCategory::Cryptominer;
            } else if rule_name.contains("ddos") || rule_name.contains("flood") {
                self.primary_category = MalwareCategory::DDoS;
            } else if rule_name.contains("botnet") || rule_name.contains("bot") {
                self.primary_category = MalwareCategory::Botnet;
            } else {
                self.primary_category = MalwareCategory::Unknown;
            }
            return;
        }

        self.primary_category = MalwareCategory::Unknown;
    }
}

pub struct ScannerState {
    pub signatures: Vec<MalwareSignature>,
    pub known_hashes: HashMap<String, KnownMalware>,
    pub last_sig_load: std::time::Instant,
    pub scanned_files: HashSet<String>,
    pub report_state: HashMap<String, ServerReportState>,
}

#[derive(Debug, Clone, Default)]
pub struct ServerReportState {
    pub report_count: u32,
    pub last_submission_id: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct KnownMalware {
    pub name: String,
    pub sha256: String,
    pub md5: Option<String>,
    pub category: MalwareCategory,
    pub source_path: String,
}

impl ScannerState {
    pub fn new() -> Self {
        Self {
            signatures: Vec::new(),
            known_hashes: HashMap::new(),
            last_sig_load: std::time::Instant::now(),
            scanned_files: HashSet::new(),
            report_state: HashMap::new(),
        }
    }
}

pub async fn start_background_scanner(
    shared: Arc<SharedState>,
    config: Config,
    backend: BackendClient,
) {
    let scanner_state = Arc::new(RwLock::new(ScannerState::new()));

    {
        let mut state = scanner_state.write().await;
        reload_signatures(&mut state, &config);
    }

    let sig_reload_interval = Duration::from_secs(
        config.signature_reload_interval.unwrap_or(3600),
    );
    let mut last_sig_reload = std::time::Instant::now();

    loop {
        if last_sig_reload.elapsed() > sig_reload_interval {
            let mut state = scanner_state.write().await;
            reload_signatures(&mut state, &config);
            last_sig_reload = std::time::Instant::now();
        }

        let servers = {
            let names = shared.server_name.read().await;
            names.keys().cloned().collect::<Vec<String>>()
        };

        for server_id in servers {
            let mut server_path = PathBuf::from(&config.wings_volume_path);
            server_path.push(&server_id);

            if !server_path.exists() || !server_path.is_dir() {
                continue;
            }

            let scan_config = config.clone();
            let scanner_state_clone = scanner_state.clone();
            let backend_clone = backend.clone();
            let shared_clone = shared.clone();
            let server_id_clone = server_id.clone();

            let detections = tokio::task::spawn_blocking(move || {
                let state = scanner_state_clone.blocking_read();
                scan_server_directory(&server_path, &scan_config, &state)
            })
            .await
            .unwrap_or_default();

            for detection in detections {
                if detection.is_malicious() {
                    if is_actionable_detection(&detection) {
                        handle_detection(
                            &server_id_clone,
                            detection,
                            &config,
                            shared_clone.clone(),
                            &backend_clone,
                            scanner_state.clone(),
                        )
                        .await;
                    } else {
                        eprintln!(
                            "[antiabuse] malware scanner: detection below enforcement threshold for {}: {}",
                            server_id_clone,
                            detection.file_path
                        );
                    }
                }
            }
        }

        sleep(Duration::from_secs(config.file_scan_interval)).await;
    }
}

fn reload_signatures(state: &mut ScannerState, config: &Config) {
    eprintln!("[antiabuse] reloading malware signatures...");

    state.signatures.clear();
    state.known_hashes.clear();

    if let Some(ref rules_path) = config.yara_rules_path {
        let sig_files = collect_sig_files(Path::new(rules_path));
        for file in sig_files {
            if let Ok(sigs) = parse_signature_file(&file) {
                state.signatures.extend(sigs);
            }
        }
    }

    if let Some(ref rules_path) = config.yara_rules_path {
        let malware_dir = Path::new(rules_path).join("MALWARE");
        if malware_dir.exists() && malware_dir.is_dir() {
            load_malware_samples(&malware_dir, &mut state.known_hashes);
        }

        let alt_malware_dir = Path::new(rules_path)
            .parent()
            .map(|p| p.join("signatures").join("MALWARE"))
            .unwrap_or_else(|| PathBuf::from("signatures/MALWARE"));

        if alt_malware_dir.exists() && alt_malware_dir.is_dir() {
            load_malware_samples(&alt_malware_dir, &mut state.known_hashes);
        }
    }

    for sig in &mut state.signatures {
        sig.compile();
    }

    eprintln!(
        "[antiabuse] loaded {} signatures, {} known malware hashes",
        state.signatures.len(),
        state.known_hashes.len()
    );

    state.last_sig_load = std::time::Instant::now();
}

fn parse_signature_file(path: &Path) -> Result<Vec<MalwareSignature>, std::io::Error> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut signatures = Vec::new();

    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim();

        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("//") {
            continue;
        }

        let parts: Vec<&str> = trimmed.splitn(6, '|').collect();
        if parts.len() < 4 {
            signatures.push(MalwareSignature {
                category: MalwareCategory::Unknown,
                name: format!("legacy_{}", signatures.len()),
                pattern: trimmed.to_string(),
                is_regex: false,
                severity: 0.7,
                description: "Legacy signature".to_string(),
                compiled_regex: None,
            });
            continue;
        }

        let category = MalwareCategory::from_str(parts[0]);
        let name = parts[1].to_string();
        let pattern = parts[2].to_string();
        let is_regex = parts[3].eq_ignore_ascii_case("true");
        let severity = parts
            .get(4)
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(category.default_severity());
        let description = parts.get(5).unwrap_or(&"").to_string();

        signatures.push(MalwareSignature {
            category,
            name,
            pattern,
            is_regex,
            severity,
            description,
            compiled_regex: None,
        });
    }

    Ok(signatures)
}

fn load_malware_samples(dir: &Path, hashes: &mut HashMap<String, KnownMalware>) {
    for entry in WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();
        if let Ok(meta) = path.metadata() {
            if meta.len() > SAMPLE_MAX_SIZE {
                continue;
            }
        }

        if let Ok(hash) = compute_sha256(path) {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            let category = infer_category_from_path(path);
            let md5 = compute_md5(path).ok();

            hashes.insert(
                hash.clone(),
                KnownMalware {
                    name: name.clone(),
                    sha256: hash,
                    md5,
                    category,
                    source_path: path.display().to_string(),
                },
            );
        }
    }
}

fn infer_category_from_path(path: &Path) -> MalwareCategory {
    let path_str = path.display().to_string().to_lowercase();

    if path_str.contains("miner") || path_str.contains("crypto") {
        MalwareCategory::Cryptominer
    } else if path_str.contains("ddos") || path_str.contains("flood") {
        MalwareCategory::DDoS
    } else if path_str.contains("botnet") || path_str.contains("bot") {
        MalwareCategory::Botnet
    } else if path_str.contains("rootkit") {
        MalwareCategory::Rootkit
    } else if path_str.contains("exploit") {
        MalwareCategory::Exploit
    } else {
        MalwareCategory::Unknown
    }
}

fn scan_server_directory(
    path: &Path,
    config: &Config,
    state: &ScannerState,
) -> Vec<FileDetection> {
    let mut detections = Vec::new();

    for entry in WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let file_path = entry.path();
        let metadata = match file_path.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        if metadata.len() > MAX_SCAN_SIZE {
            continue;
        }

        if should_skip_path(file_path, config) {
            continue;
        }

        if let Some(detection) = scan_file(file_path, config, state) {
            if detection.is_malicious() {
                detections.push(detection);
            }
        }
    }

    if config.yara_enabled {
        if let Some(yara_detections) = run_yara_scan(path, config) {
            for (file_path, yara_matches) in yara_detections {
                if let Some(existing) = detections.iter_mut().find(|d| d.file_path == file_path) {
                    existing.yara_matches.extend(yara_matches);
                    existing.compute_severity();
                    existing.determine_category();
                } else {
                    let path_obj = Path::new(&file_path);
                    let (sha256, md5, size) = if let Ok(content) = fs::read(path_obj) {
                        (
                            sha256_bytes(&content),
                            md5_bytes(&content),
                            content.len() as u64,
                        )
                    } else {
                        (String::new(), String::new(), 0)
                    };

                    let mut detection = FileDetection {
                        file_path,
                        file_size: size,
                        file_hash_sha256: sha256,
                        file_hash_md5: md5,
                        signature_matches: Vec::new(),
                        yara_matches,
                        hash_matches: Vec::new(),
                        highest_severity: 0.0,
                        primary_category: MalwareCategory::Unknown,
                        detection_time: Utc::now().to_rfc3339(),
                    };
                    detection.compute_severity();
                    detection.determine_category();
                    detections.push(detection);
                }
            }
        }
    }

    detections
}

fn should_skip_path(path: &Path, config: &Config) -> bool {
    let path_str = path.display().to_string().to_lowercase();
    for pattern in &config.malware_skip_path_patterns {
        if path_str.contains(pattern) {
            return true;
        }
    }

    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let ext_lower = ext.to_lowercase();
        if config.malware_skip_extensions.contains(ext_lower.as_str()) {
            return true;
        }
    }

    false
}

fn scan_file(path: &Path, _config: &Config, state: &ScannerState) -> Option<FileDetection> {
    let content = match fs::read(path) {
        Ok(c) => c,
        Err(_) => return None,
    };

    let sha256 = sha256_bytes(&content);
    let md5 = md5_bytes(&content);

    let mut detection = FileDetection {
        file_path: path.display().to_string(),
        file_size: content.len() as u64,
        file_hash_sha256: sha256.clone(),
        file_hash_md5: md5.clone(),
        signature_matches: Vec::new(),
        yara_matches: Vec::new(),
        hash_matches: Vec::new(),
        highest_severity: 0.0,
        primary_category: MalwareCategory::Unknown,
        detection_time: Utc::now().to_rfc3339(),
    };

    if let Some(known) = state.known_hashes.get(&sha256) {
        detection.hash_matches.push(HashMatch {
            hash_type: "sha256".to_string(),
            hash_value: sha256.clone(),
            known_malware_name: known.name.clone(),
            sample_path: known.source_path.clone(),
        });
    }

    for (_, known) in &state.known_hashes {
        if let Some(ref known_md5) = known.md5 {
            if known_md5 == &md5 {
                detection.hash_matches.push(HashMatch {
                    hash_type: "md5".to_string(),
                    hash_value: md5.clone(),
                    known_malware_name: known.name.clone(),
                    sample_path: known.source_path.clone(),
                });
                break;
            }
        }
    }

    for signature in &state.signatures {
        if let Some(sig_match) = signature.matches(&content) {
            if !detection
                .signature_matches
                .iter()
                .any(|m| m.signature_name == sig_match.signature_name)
            {
                detection.signature_matches.push(sig_match);
            }
        }
    }

    detection.compute_severity();
    detection.determine_category();

    Some(detection)
}

fn is_actionable_detection(detection: &FileDetection) -> bool {
    !detection.hash_matches.is_empty()
        || !detection.signature_matches.is_empty()
        || !detection.yara_matches.is_empty()
}

fn should_suspend_detection(detection: &FileDetection, config: &Config) -> bool {
    if !detection.hash_matches.is_empty() {
        return true;
    }

    if !config.malware_suspend_signature_matches {
        return false;
    }

    detection
        .signature_matches
        .iter()
        .any(|m| m.severity >= config.malware_suspend_signature_severity)
}

fn run_yara_scan(path: &Path, config: &Config) -> Option<HashMap<String, Vec<YaraMatch>>> {
    let Some(rules_path) = &config.yara_rules_path else {
        return None;
    };

    let rules_files = collect_yara_rule_files(Path::new(rules_path));
    if rules_files.is_empty() {
        return None;
    }

    let mut all_matches: HashMap<String, Vec<YaraMatch>> = HashMap::new();

    for rule_file in rules_files {
        let output = Command::new(&config.yara_binary)
            .arg("-r")
            .arg("-s")
            .arg("-m")
            .arg(&rule_file)
            .arg(path)
            .output()
            .ok()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.trim().is_empty() {
            continue;
        }

        for line in stdout.lines() {
            if let Some((yara_match, file_path)) = parse_yara_line(line, &rule_file) {
                all_matches
                    .entry(file_path.clone())
                    .or_default()
                    .push(yara_match);
            }
        }
    }

    if all_matches.is_empty() {
        None
    } else {
        Some(all_matches)
    }
}

fn parse_yara_line(line: &str, rule_file: &Path) -> Option<(YaraMatch, String)> {
    let line = line.trim();
    if line.is_empty() || line.starts_with("0x") {
        return None;
    }

    let parts: Vec<&str> = line.splitn(2, ' ').collect();
    if parts.len() < 2 {
        return None;
    }

    let rule_name = parts[0].to_string();
    let file_path = parts[1].trim().to_string();

    let mut tags = Vec::new();
    if let Some(start) = rule_name.find('[') {
        if let Some(end) = rule_name.find(']') {
            let tag_str = &rule_name[start + 1..end];
            tags = tag_str.split(',').map(|s| s.trim().to_string()).collect();
        }
    }

    let clean_rule_name = rule_name
        .split('[')
        .next()
        .unwrap_or(&rule_name)
        .to_string();

    Some(
        (
            YaraMatch {
                rule_name: clean_rule_name,
                rule_file: rule_file.display().to_string(),
                matched_strings: Vec::new(),
                tags,
                meta: HashMap::new(),
            },
            file_path,
        )
    )
}

async fn handle_detection(
    server_id: &str,
    mut detection: FileDetection,
    config: &Config,
    shared: Arc<SharedState>,
    backend: &BackendClient,
    scanner_state: Arc<RwLock<ScannerState>>,
) {
    detection.compute_severity();
    detection.determine_category();

    let detection_type = format!(
        "malware_{}",
        detection.primary_category.as_str()
    );

    let reason = build_detection_reason(&detection, config.malware_suspend_signature_severity);

    let server_name = {
        let names = shared.server_name.read().await;
        names.get(server_id).cloned().unwrap_or_else(|| server_id.to_string())
    };

    let metrics = json!({
        "filePath": detection.file_path,
        "fileSize": detection.file_size,
        "sha256": detection.file_hash_sha256,
        "md5": detection.file_hash_md5,
        "severity": detection.highest_severity,
        "category": detection.primary_category.as_str(),
        "signatureMatches": detection.signature_matches.len(),
        "yaraMatches": detection.yara_matches.len(),
        "hashMatches": detection.hash_matches.len(),
        "detectionTime": detection.detection_time,
    });

    let match_details = json!({
        "signatures": detection.signature_matches.iter().map(|m| json!({
            "name": m.signature_name,
            "category": m.category.as_str(),
            "severity": m.severity,
            "matched": m.matched_content,
            "description": m.description,
        })).collect::<Vec<_>>(),
        "yara": detection.yara_matches.iter().map(|m| json!({
            "rule": m.rule_name,
            "file": m.rule_file,
            "tags": m.tags,
        })).collect::<Vec<_>>(),
        "hashes": detection.hash_matches.iter().map(|m| json!({
            "type": m.hash_type,
            "hash": m.hash_value,
            "knownAs": m.known_malware_name,
        })).collect::<Vec<_>>(),
    });

    let should_suspend = should_suspend_detection(&detection, config);
    let mut suspend_success = false;
    let action;
    let suspend_attempted;

    if should_suspend {
        let result = backend.suspend_server(server_id, &reason).await;
        suspend_success = result.is_ok();
        if let Err(ref e) = result {
            eprintln!("[antiabuse] malware scanner: suspend failed for {}: {}", server_id, e);
        }
        action = "Suspend";
        suspend_attempted = true;
    } else {
        action = "Warn";
        suspend_attempted = false;
    }

    let trigger = DetectionTrigger {
        detection_type: detection_type.clone(),
        reason: reason.clone(),
        metrics: metrics.clone(),
        recent_events: Vec::new(),
    };

    let payload = json!({
        "serverId": server_id,
        "serverName": server_name,
        "reason": trigger.reason,
        "nodeName": config.node_name,
        "sourceIp": "127.0.0.1",
        "targetIp": "127.0.0.1",
        "targetPort": 0,
        "detectionType": detection_type,
        "enforcementAction": action,
        "strikeCount": 1,
        "suspendAttempted": suspend_attempted,
        "suspendSuccess": suspend_success,
        "detectorName": config.detector_name,
        "metrics": metrics,
        "matchDetails": match_details,
        "recentEvents": trigger.recent_events,
        "enforcementNote": format!(
            "Malware detection: {} (severity: {:.2})",
            detection.primary_category.as_str(),
            detection.highest_severity
        ),
    });

    let (should_update_existing, existing_id, should_clamp_to_three) = {
        let state = scanner_state.read().await;
        let entry = state.report_state.get(server_id);
        let count = entry.map(|e| e.report_count).unwrap_or(0);
        let last_submission = entry.and_then(|e| e.last_submission_id);

        if count >= config.malware_report_cap_per_server {
            if let Some(id) = last_submission {
                (true, Some(id), false)
            } else {
                (false, None, true)
            }
        } else {
            (false, None, false)
        }
    };

    let report_payload = if should_update_existing {
        match payload.clone() {
            serde_json::Value::Object(mut map) => {
                if let Some(id) = existing_id {
                    map.insert("incidentId".to_string(), json!(id));
                }
                serde_json::Value::Object(map)
            }
            other => other,
        }
    } else {
        payload.clone()
    };

    let report_result = backend.report_incident(report_payload).await;

    if let Ok(ref response) = report_result {
        let mut state = scanner_state.write().await;
        let entry = state
            .report_state
            .entry(server_id.to_string())
            .or_default();

        if should_update_existing {
            if entry.report_count < config.malware_report_cap_per_server {
                entry.report_count = config.malware_report_cap_per_server;
            }
            if let Some(id) = existing_id {
                entry.last_submission_id = Some(id);
            }
        } else {
            if should_clamp_to_three {
                entry.report_count = config.malware_report_cap_per_server;
            } else {
                entry.report_count = (entry.report_count + 1)
                    .min(config.malware_report_cap_per_server);
            }

            if let Some(submission_id) = response.submission_id {
                entry.last_submission_id = Some(submission_id);
            }
        }
    }

    if let Err(err) = report_result {
        eprintln!("[antiabuse] malware scanner: failed to report incident: {err:#}");
    }
}

fn build_detection_reason(detection: &FileDetection, suspend_signature_severity: f64) -> String {
    let mut reasons = Vec::new();

    if !detection.hash_matches.is_empty() {
        let names: Vec<_> = detection
            .hash_matches
            .iter()
            .map(|m| m.known_malware_name.as_str())
            .collect();
        reasons.push(format!("known malware: {}", names.join(", ")));
    }

    if !detection.signature_matches.is_empty() {
        let signature_names: Vec<_> = detection
            .signature_matches
            .iter()
            .map(|m| m.signature_name.as_str())
            .collect();

        let high_severity: Vec<_> = detection
            .signature_matches
            .iter()
            .filter(|m| m.severity >= suspend_signature_severity)
            .map(|m| m.signature_name.as_str())
            .collect();

        if !high_severity.is_empty() {
            reasons.push(format!("signatures: {}", high_severity.join(", ")));
        } else if signature_names.len() == 1 {
            reasons.push(format!("signature: {}", signature_names.join(", ")));
        } else {
            reasons.push(format!(
                "{} signatures: {}",
                signature_names.len(),
                signature_names.join(", ")
            ));
        }
    }

    if !detection.yara_matches.is_empty() {
        let rules: Vec<_> = detection
            .yara_matches
            .iter()
            .map(|m| m.rule_name.as_str())
            .collect();
        reasons.push(format!("YARA: {}", rules.join(", ")));
    }

    if reasons.is_empty() {
        return format!(
            "suspicious file detected at {}",
            detection.file_path
        );
    }

    format!(
        "malware detected at {}: {}",
        detection.file_path,
        reasons.join("; ")
    )
}

fn collect_sig_files(base: &Path) -> Vec<PathBuf> {
    if base.is_file() {
        let ext = base
            .extension()
            .and_then(|v| v.to_str())
            .map(|v| v.to_ascii_lowercase())
            .unwrap_or_default();
        if ext == "sig" || ext == "signatures" {
            return vec![base.to_path_buf()];
        }
        return Vec::new();
    }

    if !base.is_dir() {
        return Vec::new();
    }

    let mut files: Vec<PathBuf> = WalkDir::new(base)
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

            if ext == "sig" || ext == "signatures" {
                Some(path.to_path_buf())
            } else {
                None
            }
        })
        .collect();

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

    let mut files: Vec<PathBuf> = WalkDir::new(base)
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
        .collect();

    files.sort();
    files
}

fn is_excluded_signature_path(path: &Path) -> bool {
    path.components().any(|component| {
        let value = component.as_os_str().to_string_lossy().to_ascii_lowercase();
        matches!(value.as_str(), "samples" | "sample")
    })
}

fn memmem_search(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() {
        return true;
    }
    if haystack.len() < needle.len() {
        return false;
    }

    if needle.len() == 1 {
        return memchr::memchr(needle[0], haystack).is_some();
    }

    memchr::memmem::find(haystack, needle).is_some()
}

fn truncate_match(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}

fn compute_sha256(path: &Path) -> Result<String, std::io::Error> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; HASH_CHUNK_SIZE];

    loop {
        let bytes_read = file.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hex::encode(hasher.finalize()))
}

fn compute_md5(path: &Path) -> Result<String, std::io::Error> {
    let content = fs::read(path)?;
    Ok(md5_bytes(&content))
}

fn sha256_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

fn md5_bytes(data: &[u8]) -> String {
    let digest = md5::compute(data);
    format!("{:x}", digest)
}
