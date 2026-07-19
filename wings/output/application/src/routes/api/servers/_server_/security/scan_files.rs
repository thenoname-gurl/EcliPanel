pub mod get {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{DetectionRule, GetState, api::servers::_server_::GetServer},
    };
    use regex::Regex;
    use serde::Serialize;
    use utoipa::ToSchema;

    #[derive(ToSchema, Serialize)]
    struct SuspiciousFile {
        path: String,
        reason: String,
        severity: String, // "critical", "high", "medium", "low"
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        suspicious_files: Vec<SuspiciousFile>,
        total: usize,
    }

    fn extract_file_patterns(rules: &[DetectionRule]) -> Vec<(Regex, String, String)> {
        let mut patterns = Vec::new();
        for rule in rules {
            let Some(rules_arr) = rule.conditions.get("rules").and_then(|v| v.as_array()) else {
                continue;
            };
            for r in rules_arr {
                let field = r.get("field").and_then(|v| v.as_str()).unwrap_or("");
                if field != "file.name" {
                    continue;
                }
                let op = r.get("operator").and_then(|v| v.as_str()).unwrap_or("");
                let value = r.get("value").and_then(|v| v.as_str()).unwrap_or("");
                if value.is_empty() {
                    continue;
                }

                let pattern = match op {
                    "regex" => value.to_string(),
                    "contains" => regex::escape(value),
                    "equals" => format!("^{}$", regex::escape(value)),
                    _ => continue,
                };

                if let Ok(re) = Regex::new(&format!("(?i){}", pattern)) {
                    patterns.push((re, rule.name.clone(), rule.severity.clone()));
                }
            }
        }
        patterns
    }

    #[utoipa::path(get, path = "/scan-files", responses(
        (status = OK, body = inline(Response)),
    ), params(
        (
            "server" = uuid::Uuid,
            description = "The server uuid",
            example = "123e4567-e89b-12d3-a456-426614174000",
        ),
    ))]
    pub async fn route(state: GetState, server: GetServer) -> ApiResponseResult {
        let rules_guard = state.detection_rules.read().await;
        let file_patterns = extract_file_patterns(&rules_guard);
        drop(rules_guard);

        let mut suspicious: Vec<SuspiciousFile> = Vec::new();

        let check_dirs = vec![
            std::path::PathBuf::from("."),
            std::path::PathBuf::from("plugins"),
            std::path::PathBuf::from("mods"),
            std::path::PathBuf::from("data"),
            std::path::PathBuf::from("tmp"),
            std::path::PathBuf::from("config"),
        ];

        for dir in &check_dirs {
            let entries = match server.filesystem.async_read_dir(dir).await {
                Ok(mut entries) => {
                    let mut vec = Vec::new();
                    while let Some(Ok((_, name))) = entries.next_entry().await {
                        vec.push(name);
                    }
                    vec
                }
                Err(_) => continue,
            };

            for entry_name in &entries {
                let path = dir.join(entry_name).to_string_lossy().to_string();
                for (regex, reason, severity) in &file_patterns {
                    if regex.is_match(entry_name) {
                        if !suspicious.iter().any(|s| s.path == path) {
                            suspicious.push(SuspiciousFile {
                                path,
                                reason: reason.clone(),
                                severity: severity.clone(),
                            });
                        }
                        break;
                    }
                }
            }
        }

        let total = suspicious.len();

        ApiResponse::new_serialized(Response {
            suspicious_files: suspicious,
            total,
        })
        .ok()
    }
}
