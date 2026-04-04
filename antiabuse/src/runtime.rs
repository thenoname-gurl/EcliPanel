use crate::backend::BackendClient;
use crate::config::Config;
use crate::state::SharedState;
use anyhow::{Context, Result};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::net::Ipv4Addr;
use std::sync::Arc;
use tokio::io::{self, AsyncRead};
use tokio::process::{Child, ChildStdout, Command};

fn extract_container_server_id(container: &Value, known_server_ids: &HashSet<String>) -> Option<String> {
    let known_lower = known_server_ids
        .iter()
        .map(|v| (v.to_ascii_lowercase(), v.clone()))
        .collect::<Vec<(String, String)>>();

    let mut candidates: Vec<String> = Vec::new();

    if let Some(name) = container.get("Name").and_then(Value::as_str) {
        candidates.push(name.trim_start_matches('/').to_string());
    }
    if let Some(hostname) = container
        .get("Config")
        .and_then(|c| c.get("Hostname"))
        .and_then(Value::as_str)
    {
        candidates.push(hostname.to_string());
    }
    if let Some(id) = container.get("Id").and_then(Value::as_str) {
        candidates.push(id.to_string());
    }

    for raw in candidates {
        if known_server_ids.contains(&raw) {
            return Some(raw);
        }

        let raw_lower = raw.to_ascii_lowercase();
        if let Some((_, canonical)) = known_lower.iter().find(|(k, _)| k == &raw_lower) {
            return Some(canonical.clone());
        }

        for (known_l, canonical) in &known_lower {
            if raw_lower.contains(known_l) {
                return Some(canonical.clone());
            }
        }
    }

    None
}

async fn collect_docker_ip_owners(
    known_server_ids: &HashSet<String>,
) -> Result<HashMap<String, HashSet<String>>> {
    let list_output = Command::new("docker")
        .arg("ps")
        .arg("-q")
        .output()
        .await
        .context("failed to run docker ps")?;

    if !list_output.status.success() {
        anyhow::bail!("docker ps failed with status {}", list_output.status);
    }

    let container_ids = String::from_utf8_lossy(&list_output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect::<Vec<String>>();

    if container_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut inspect_cmd = Command::new("docker");
    inspect_cmd.arg("inspect");
    for id in &container_ids {
        inspect_cmd.arg(id);
    }

    let inspect_output = inspect_cmd
        .output()
        .await
        .context("failed to run docker inspect")?;

    if !inspect_output.status.success() {
        anyhow::bail!("docker inspect failed with status {}", inspect_output.status);
    }

    let containers: Value = serde_json::from_slice(&inspect_output.stdout)
        .context("invalid docker inspect JSON")?;

    let mut ip_owners: HashMap<String, HashSet<String>> = HashMap::new();

    let Some(arr) = containers.as_array() else {
        return Ok(ip_owners);
    };

    for container in arr {
        let Some(server_id) = extract_container_server_id(container, known_server_ids) else {
            continue;
        };

        let networks = container
            .get("NetworkSettings")
            .and_then(|n| n.get("Networks"))
            .and_then(Value::as_object);

        let Some(networks) = networks else {
            continue;
        };

        for network in networks.values() {
            let Some(ip) = network.get("IPAddress").and_then(Value::as_str) else {
                continue;
            };
            if ip.is_empty() || ip == "0.0.0.0" || ip.parse::<Ipv4Addr>().is_err() {
                continue;
            }
            ip_owners
                .entry(ip.to_string())
                .or_default()
                .insert(server_id.clone());
        }
    }

    Ok(ip_owners)
}

fn extract_ips_from_allocations(v: &Value) -> Vec<String> {
    let mut ips = HashSet::new();

    if let Some(default_ip) = v
        .get("default")
        .and_then(|d| d.get("ip"))
        .and_then(Value::as_str)
    {
        ips.insert(default_ip.to_string());
    }

    if let Some(mappings) = v.get("mappings").and_then(Value::as_object) {
        for ip in mappings.keys() {
            ips.insert(ip.to_string());
        }
    }

    ips.into_iter().collect()
}

fn collect_ipv4_strings(v: &Value, out: &mut HashSet<String>) {
    match v {
        Value::String(s) => {
            if s == "0.0.0.0" {
                return;
            }
            if s.parse::<Ipv4Addr>().is_ok() {
                out.insert(s.to_string());
            }
        }
        Value::Array(arr) => {
            for item in arr {
                collect_ipv4_strings(item, out);
            }
        }
        Value::Object(map) => {
            for (_, value) in map {
                collect_ipv4_strings(value, out);
            }
        }
        _ => {}
    }
}

fn extract_ports_from_allocations(v: &Value) -> Vec<u16> {
    let mut ports = HashSet::new();

    if let Some(default_port) = v
        .get("default")
        .and_then(|d| d.get("port"))
        .and_then(Value::as_u64)
    {
        if default_port <= u16::MAX as u64 {
            ports.insert(default_port as u16);
        }
    }

    if let Some(mappings) = v.get("mappings").and_then(Value::as_object) {
        for mapping_ports in mappings.values() {
            if let Some(arr) = mapping_ports.as_array() {
                for p in arr {
                    if let Some(port) = p.as_u64() {
                        if port <= u16::MAX as u64 {
                            ports.insert(port as u16);
                        }
                    }
                }
            }
        }
    }

    ports.into_iter().collect()
}

pub async fn refresh_ip_map(client: &BackendClient, shared: Arc<SharedState>, cfg: &Config) {
    match client.fetch_servers().await {
        Ok(servers) => {
            let mut ip_owners: HashMap<String, HashSet<String>> = HashMap::new();
            let mut source_port_owners: HashMap<u16, HashSet<String>> = HashMap::new();
            let mut new_server_name = HashMap::new();

            for server in servers {
                let server_id = server
                    .get("uuid")
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
                    .unwrap_or_default();

                if server_id.is_empty() {
                    continue;
                }

                let server_name = server
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or(&server_id)
                    .to_string();

                new_server_name.insert(server_id.clone(), server_name);

                let mut server_ips = HashSet::new();

                if let Some(alloc) = server.get("allocations") {
                    for ip in extract_ips_from_allocations(alloc) {
                        server_ips.insert(ip);
                    }
                    for port in extract_ports_from_allocations(alloc) {
                        source_port_owners
                            .entry(port)
                            .or_default()
                            .insert(server_id.clone());
                    }
                }

                if let Some(alloc) = server.get("configuration").and_then(|c| c.get("allocations")) {
                    for ip in extract_ips_from_allocations(alloc) {
                        server_ips.insert(ip);
                    }
                    for port in extract_ports_from_allocations(alloc) {
                        source_port_owners
                            .entry(port)
                            .or_default()
                            .insert(server_id.clone());
                    }
                }

                if cfg.use_server_network_map {
                    if let Ok(network) = client.fetch_server_network(&server_id).await {
                        collect_ipv4_strings(&network, &mut server_ips);
                    }
                }

                for ip in server_ips {
                    ip_owners.entry(ip).or_default().insert(server_id.clone());
                }
            }

            if cfg.use_docker_network_map {
                let known_server_ids = new_server_name.keys().cloned().collect::<HashSet<String>>();
                match collect_docker_ip_owners(&known_server_ids).await {
                    Ok(docker_map) => {
                        let docker_ip_count = docker_map.len();
                        for (ip, owners) in docker_map {
                            for owner in owners {
                                ip_owners.entry(ip.clone()).or_default().insert(owner);
                            }
                        }
                        println!(
                            "[antiabuse] docker map merged: {} IPs from running containers",
                            docker_ip_count
                        );
                    }
                    Err(err) => {
                        eprintln!("[antiabuse] docker map refresh failed: {err:#}");
                    }
                }
            }

            let mut new_ip_to_server = HashMap::new();
            let mut ambiguous_ips = 0usize;
            for (ip, owners) in &ip_owners {
                if owners.len() == 1 {
                    if let Some(owner) = owners.iter().next() {
                        new_ip_to_server.insert(ip.clone(), owner.clone());
                    }
                } else {
                    ambiguous_ips += 1;
                }
            }

            let mut new_source_port_to_server = HashMap::new();
            let mut ambiguous_ports = 0usize;
            for (port, owners) in &source_port_owners {
                if owners.len() == 1 {
                    if let Some(owner) = owners.iter().next() {
                        new_source_port_to_server.insert(*port, owner.clone());
                    }
                } else {
                    ambiguous_ports += 1;
                }
            }

            let mut new_ip_to_servers = HashMap::new();
            for (ip, owners) in &ip_owners {
                let mut list = owners.iter().cloned().collect::<Vec<String>>();
                list.sort();
                list.dedup();
                if !list.is_empty() {
                    new_ip_to_servers.insert(ip.clone(), list);
                }
            }

            let mut new_source_port_to_servers = HashMap::new();
            for (port, owners) in &source_port_owners {
                let mut list = owners.iter().cloned().collect::<Vec<String>>();
                list.sort();
                list.dedup();
                if !list.is_empty() {
                    new_source_port_to_servers.insert(*port, list);
                }
            }

            let mapped_count = new_ip_to_server.len();
            let port_mapped_count = new_source_port_to_server.len();
            {
                let mut map_guard = shared.ip_to_server.write().await;
                *map_guard = new_ip_to_server;
            }
            {
                let mut port_map_guard = shared.source_port_to_server.write().await;
                *port_map_guard = new_source_port_to_server;
            }
            {
                let mut name_guard = shared.server_name.write().await;
                *name_guard = new_server_name;
            }
            {
                let mut all_ip_guard = shared.ip_to_servers.write().await;
                *all_ip_guard = new_ip_to_servers;
            }
            {
                let mut all_port_guard = shared.source_port_to_servers.write().await;
                *all_port_guard = new_source_port_to_servers;
            }

            println!(
                "[antiabuse] map refreshed: {} source IPs ({} ambiguous IPs skipped), {} source ports ({} ambiguous ports skipped)",
                mapped_count,
                ambiguous_ips,
                port_mapped_count,
                ambiguous_ports
            );
        }
        Err(err) => {
            eprintln!("[antiabuse] failed to refresh IP map: {err:#}");
        }
    }
}

pub async fn open_input_reader(cfg: &Config) -> Result<(Box<dyn AsyncRead + Unpin + Send>, Option<Child>)> {
    if let Some(cmd) = &cfg.tcpdump_cmd {
        println!("[antiabuse] launching TCPDUMP_CMD: {}", cmd);
        let mut child = Command::new("/bin/sh")
            .arg("-lc")
            .arg(cmd)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit())
            .spawn()
            .context("failed to spawn TCPDUMP_CMD")?;

        let stdout: ChildStdout = child
            .stdout
            .take()
            .context("TCPDUMP_CMD did not expose stdout")?;
        return Ok((Box::new(stdout), Some(child)));
    }

    println!("[antiabuse] reading tcpdump lines from stdin");
    Ok((Box::new(io::stdin()), None))
}