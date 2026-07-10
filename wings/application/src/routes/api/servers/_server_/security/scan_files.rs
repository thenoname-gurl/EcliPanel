use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

pub mod get {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{GetState, api::servers::_server_::GetServer},
    };
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

    /// Known suspicious filename patterns
    const SUSPICIOUS_PATTERNS: &[(&str, &str, &str)] = &[
        // Crypto miners
        ("xmrig", "Potential crypto miner binary (xmrig)", "critical"),
        ("minerd", "Potential crypto miner binary (minerd)", "critical"),
        ("cpuminer", "Potential crypto miner binary (cpuminer)", "critical"),
        ("t-rex", "Potential crypto miner (T-Rex)", "critical"),
        ("phoenixminer", "Potential crypto miner (PhoenixMiner)", "critical"),
        ("lolminer", "Potential crypto miner (lolMiner)", "critical"),
        ("nbminer", "Potential crypto miner (NBMiner)", "critical"),
        ("gminer", "Potential crypto miner (GMiner)", "critical"),
        ("config.json", "Possible miner configuration file", "medium"),
        ("pools.txt", "Possible mining pool configuration", "medium"),
        ("mine.sh", "Possible mining script", "high"),
        ("start_mining", "Possible mining start script", "high"),
        // Backdoors / webshells
        ("shell.php", "Potential PHP webshell", "critical"),
        ("cmd.php", "Potential command execution script", "critical"),
        ("backdoor", "Potential backdoor file", "critical"),
        ("c99", "Known webshell (c99)", "critical"),
        ("r57", "Known webshell (r57)", "critical"),
        ("wso.php", "Known webshell (WSO)", "critical"),
        // DDoS tools
        ("slowloris", "DDoS tool (Slowloris)", "critical"),
        ("hping", "DDoS tool (hping)", "critical"),
        ("flood", "Potential DDoS script", "high"),
        ("stresser", "Potential DDoS stresser tool", "high"),
        // Info stealers / rats
        ("stealer", "Potential info stealer", "critical"),
        ("keylogger", "Potential keylogger", "critical"),
        ("rat_server", "Potential RAT server", "critical"),
        // Suspicious permissions
        ("id_rsa", "SSH private key may be exposed", "high"),
        ("id_ed25519", "SSH private key may be exposed", "high"),
        (".env", "Environment file may contain secrets", "medium"),
        ("credentials", "Possible credentials file", "high"),
        ("password", "Possible password file", "high"),
    ];

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
    ), params(
        (
            "server" = uuid::Uuid,
            description = "The server uuid",
            example = "123e4567-e89b-12d3-a456-426614174000",
        ),
    ))]
    pub async fn route(server: GetServer) -> ApiResponseResult {
        let mut suspicious: Vec<SuspiciousFile> = Vec::new();

        // Check common directories for suspicious files
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
                let lower = entry_name.to_lowercase();
                for (pattern, reason, severity) in SUSPICIOUS_PATTERNS {
                    if lower.contains(pattern) {
                        let path = dir.join(entry_name).to_string_lossy().to_string();
                        // Avoid duplicates
                        if !suspicious.iter().any(|s| s.path == path) {
                            suspicious.push(SuspiciousFile {
                                path,
                                reason: reason.to_string(),
                                severity: severity.to_string(),
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
