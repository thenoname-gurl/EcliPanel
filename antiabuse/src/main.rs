mod backend;
mod config;
mod detector;
mod parser;
mod runtime;
mod scanner;
mod state;

use anyhow::{Context, Result};
use std::collections::HashSet;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use backend::BackendClient;
use state::{ConnectionEvent, SharedState};

fn is_syn_ack_line(line: &str) -> bool {
    line.contains("Flags [S.]")
}

fn pick_single_candidate(
    ip_candidates: &[String],
    port_candidates: &[String],
) -> Option<String> {
    if !ip_candidates.is_empty() && !port_candidates.is_empty() {
        let ip_set = ip_candidates.iter().cloned().collect::<HashSet<String>>();
        let overlap = port_candidates
            .iter()
            .filter(|id| ip_set.contains(*id))
            .cloned()
            .collect::<Vec<String>>();
        if overlap.len() == 1 {
            return overlap.first().cloned();
        }
    }

    let mut union = ip_candidates
        .iter()
        .chain(port_candidates.iter())
        .cloned()
        .collect::<Vec<String>>();
    union.sort();
    union.dedup();
    if union.len() == 1 {
        union.first().cloned()
    } else {
        None
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let config = config::from_env()?;
    let backend = BackendClient::new(&config)?;
    let shared = Arc::new(SharedState::new());

    println!(
        "[antiabuse] started: backend={}, detector={}, node={}",
        config.backend_url, config.detector_name, config.node_name
    );

    if config.yara_enabled {
        if let Some(path) = &config.yara_rules_path {
            println!(
                "[antiabuse] YARA enabled: binary={}, rules={}",
                config.yara_binary, path
            );
        } else {
            eprintln!(
                "[antiabuse] YARA enabled but no rules file found. Set YARA_RULES_PATH or place rules as signatures.yar"
            );
        }
    }

    runtime::refresh_ip_map(&backend, shared.clone(), &config).await;

    {
        let backend_clone = backend.clone();
        let shared_clone = shared.clone();
        let refresh_config = config.clone();
        let refresh_every = config.refresh_interval;
        tokio::spawn(async move {
            let mut timer = tokio::time::interval(refresh_every);
            loop {
                timer.tick().await;
                runtime::refresh_ip_map(&backend_clone, shared_clone.clone(), &refresh_config).await;
            }
        });
    }

    {
        let backend_clone = backend.clone();
        let detector_name = config.detector_name.clone();
        let node_name = config.node_name.clone();
        let heartbeat_every = config.heartbeat_interval;
        tokio::spawn(async move {
            let mut timer = tokio::time::interval(heartbeat_every);
            loop {
                timer.tick().await;
                let payload = serde_json::json!({
                    "agentId": format!("{}@{}", detector_name, node_name),
                    "detectorName": detector_name,
                    "nodeName": node_name,
                    "pid": std::process::id(),
                    "version": env!("CARGO_PKG_VERSION"),
                });
                if let Err(err) = backend_clone.send_heartbeat(payload).await {
                    eprintln!("[antiabuse] heartbeat failed: {}", err);
                }
            }
        });
    }

    {
        let backend_clone = backend.clone();
        let shared_clone = shared.clone();
        let scan_config = config.clone();
        tokio::spawn(async move {
            scanner::start_background_scanner(shared_clone, scan_config, backend_clone).await;
        });
    }

    let (reader, mut child) = runtime::open_input_reader(&config).await?;
    let mut lines = BufReader::new(reader).lines();
    let mut parsed_packets: u64 = 0;
    let mut unmapped_packets: u64 = 0;
    let unmapped_log_every = config.unmapped_log_every.max(1);
    let node_fallback_server_id = format!("node@{}", config.node_name);

    while let Some(line) = lines.next_line().await.context("failed reading input")? {
        if line.trim().is_empty() {
            continue;
        }

        if is_syn_ack_line(&line) {
            continue;
        }

        let Some((src_ip, src_port, dest_ip, dest_port)) = parser::parse_tcpdump_line(&line) else {
            continue;
        };

        parsed_packets += 1;

        let (server_id, server_is_source) = {
            let ip_map = shared.ip_to_server.read().await;
            if let Some(id) = ip_map.get(&src_ip).cloned() {
                (Some(id), true)
            } else if let Some(id) = ip_map.get(&dest_ip).cloned() {
                (Some(id), false)
            } else {
                drop(ip_map);
                let port_map = shared.source_port_to_server.read().await;
                if let Some(id) = port_map.get(&src_port).cloned() {
                    (Some(id), true)
                } else if let Some(id) = port_map.get(&dest_port).cloned() {
                    (Some(id), false)
                } else {
                    (None, false)
                }
            }
        };

        let mut suspected_server_ids: Vec<String> = Vec::new();

        let (server_id, server_is_source) = if let Some(server_id) = server_id {
            (server_id, server_is_source)
        } else {
            let (
                src_ip_candidates,
                dest_ip_candidates,
                src_port_candidates,
                dest_port_candidates,
            ) = {
                let all_ip = shared.ip_to_servers.read().await;
                let all_ports = shared.source_port_to_servers.read().await;

                (
                    all_ip.get(&src_ip).cloned().unwrap_or_default(),
                    all_ip.get(&dest_ip).cloned().unwrap_or_default(),
                    all_ports.get(&src_port).cloned().unwrap_or_default(),
                    all_ports.get(&dest_port).cloned().unwrap_or_default(),
                )
            };

            let mut all_candidates = src_ip_candidates
                .iter()
                .chain(dest_ip_candidates.iter())
                .chain(src_port_candidates.iter())
                .chain(dest_port_candidates.iter())
                .cloned()
                .collect::<Vec<String>>();
            all_candidates.sort();
            all_candidates.dedup();
            suspected_server_ids = all_candidates;

            if let Some(candidate) = pick_single_candidate(&src_ip_candidates, &src_port_candidates) {
                (candidate, true)
            } else if let Some(candidate) =
                pick_single_candidate(&dest_ip_candidates, &dest_port_candidates)
            {
                (candidate, false)
            } else if config.enable_node_fallback_detection
                && !suspected_server_ids.is_empty()
                && !dest_ip.starts_with("127.")
                && !src_ip.starts_with("127.")
            {
                (node_fallback_server_id.clone(), false)
            } else {
                unmapped_packets += 1;
                if unmapped_packets % unmapped_log_every == 0 {
                    let mapped_packets = parsed_packets.saturating_sub(unmapped_packets);
                    eprintln!(
                        "[antiabuse] unmapped packets: {} of {} parsed (mapped={}); last flow {}:{} -> {}:{}",
                        unmapped_packets,
                        parsed_packets,
                        mapped_packets,
                        src_ip,
                        src_port,
                        dest_ip,
                        dest_port
                    );
                }
                continue;
            }
        };

        let event = ConnectionEvent {
            src_ip,
            src_port,
            dest_ip,
            dest_port,
            server_id,
            server_is_source,
            suspected_server_ids,
        };

        detector::process_connection(event, &config, shared.clone(), &backend).await;
    }

    if let Some(c) = child.as_mut() {
        let _ = c.kill().await;
    }

    Ok(())
}