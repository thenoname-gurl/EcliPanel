use crate::backend::BackendClient;
use crate::config::Config;
use crate::state::{
    ConnectionEvent,
    DetectionTrigger,
    EnforcementAction,
    IncidentRollupState,
    Protocol,
    ServerState,
    SharedState,
    StrikeState,
};
use chrono::Utc;
use serde_json::json;
use std::collections::{HashSet, VecDeque};
use std::sync::Arc;
use std::time::{Duration, Instant};

const PORT_SCAN_REPORT_WINDOW: Duration = Duration::from_secs(5 * 60);

fn is_ephemeral_port(port: u16) -> bool {
    port >= 32768
}

fn is_scannable_port(port: u16) -> bool {
    port < 32768
}

// EcliPolice when???????
// I won't lie, this is A HELL OF A MESS THAT BARELY WORKS-
fn is_sequential(ports: &VecDeque<u16>, trigger: usize) -> bool {
    if trigger == 0 || ports.len() < trigger {
        return false;
    }

    let mut values: Vec<u16> = ports.iter().copied().collect();
    values.sort_unstable();
    values.dedup();

    if values.len() < trigger {
        return false;
    }

    let mut run = 1usize;
    for idx in 1..values.len() {
        if values[idx] == values[idx - 1] + 1 {
            run += 1;
            if run >= trigger {
                return true;
            }
        } else {
            run = 1;
        }
    }

    false
}

fn prune_timed_events(events: &mut VecDeque<(Instant, String)>, now: Instant, keep_window: Duration) {
    while let Some((ts, _)) = events.front() {
        if now.duration_since(*ts) > keep_window {
            events.pop_front();
        } else {
            break;
        }
    }
}

fn timed_event_metrics(
    events: &VecDeque<(Instant, String)>,
    now: Instant,
    window: Duration,
) -> (usize, usize) {
    let mut hits = 0usize;
    let mut unique_ips: HashSet<&str> = HashSet::new();

    for (ts, ip) in events.iter().rev() {
        if now.duration_since(*ts) > window {
            break;
        }
        hits += 1;
        unique_ips.insert(ip.as_str());
    }

    (hits, unique_ips.len())
}

fn pick_action(strike_count: u32, cfg: &Config) -> EnforcementAction {
    if strike_count >= cfg.suspend_strikes {
        EnforcementAction::Suspend
    } else if strike_count >= cfg.throttle_strikes {
        EnforcementAction::Throttle
    } else if strike_count >= cfg.alert_strikes {
        EnforcementAction::Alert
    } else {
        EnforcementAction::Alert
    }
}

fn is_node_fallback_id(server_id: &str) -> bool {
    server_id.starts_with("node@")
}

fn should_force_suspend(trigger: &DetectionTrigger, config: &Config) -> bool {
    if !trigger.detection_type.starts_with("port_scan_unique_ports") {
        return false;
    }

    let unique_ports = unique_ports_on_target(trigger);

    unique_ports >= config.port_scan_auto_suspend_unique_ports
}

fn unique_ports_on_target(trigger: &DetectionTrigger) -> usize {
    trigger
        .metrics
        .get("uniquePortsOnTarget")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize
}

fn is_private_or_local_ip(ip: &str) -> bool {
    if ip == "127.0.0.1" || ip == "0.0.0.0" {
        return true;
    }

    let mut parts = ip.split('.').filter_map(|p| p.parse::<u8>().ok());
    let Some(a) = parts.next() else {
        return false;
    };
    let Some(b) = parts.next() else {
        return false;
    };

    a == 10
        || a == 127
        || (a == 192 && b == 168)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 169 && b == 254)
}

fn is_amplification_port(port: u16) -> bool {
    matches!(
        port,
        19
        | 53
        | 111
        | 123
        | 137
        | 161
        | 389
        | 520
        | 751
        | 1434
        | 1900
        | 5353
        | 11211
        | 27015
    )
}

fn is_udp_flood_port(port: u16) -> bool {
    is_amplification_port(port)
        || matches!(
            port,
            80 | 443 | 8080
            | 69
            | 500 | 4500
            | 514
            | 1194
            | 3478 | 3479
            | 5060 | 5061
            | 27000..=27050
            | 25565
        )
}

pub async fn process_connection(
    event: ConnectionEvent,
    config: &Config,
    shared: Arc<SharedState>,
    backend: &BackendClient,
) {
    let now = Instant::now();
    let protocol = event.protocol;

    let trigger: Option<DetectionTrigger> = {
        let mut containers = shared.containers.write().await;
        let state = containers
            .entry(event.server_id.clone())
            .or_insert_with(|| ServerState::fresh(now));

        if now.duration_since(state.last_reset) > config.window {
            *state = ServerState::fresh(now);
        }

        let is_big_hit = !config.safe_ports.contains(&event.dest_port);
        let is_mining_port = config.mining_ports.contains(&event.dest_port);
        let is_amplification = protocol == Protocol::Udp && is_amplification_port(event.dest_port);
        let is_udp_risky = protocol == Protocol::Udp && is_udp_flood_port(event.dest_port);

        let topology_inbound =
            !is_private_or_local_ip(&event.src_ip) && is_private_or_local_ip(&event.dest_ip);
        let topology_outbound =
            is_private_or_local_ip(&event.src_ip) && !is_private_or_local_ip(&event.dest_ip);

        let is_outbound = if topology_inbound {
            false
        } else if topology_outbound {
            true
        } else {
            event.server_is_source
        };
        let is_inbound = !is_outbound;

        let remote_ip = if is_outbound {
            event.dest_ip.clone()
        } else {
            event.src_ip.clone()
        };
        let is_public_remote = !is_private_or_local_ip(&remote_ip);
        let ddos_eligible = is_outbound && is_public_remote;

        match protocol {
            Protocol::Tcp => {
                if is_big_hit && ddos_eligible {
                    state.tcp_big_hits += 1;
                    state.tcp_unique_ips.insert(remote_ip.clone());
                }
            }
            Protocol::Udp => {
                if ddos_eligible {
                    state.udp_hits += 1;
                    state.udp_unique_ips.insert(remote_ip.clone());
                }
                if is_amplification && is_outbound {
                    state.amplification_hits += 1;
                    state.amplification_targets.insert(remote_ip.clone());
                }
            }
        }

        if is_big_hit && ddos_eligible {
            state.big_hits += 1;
        }
        if is_mining_port {
            state.mining_hits += 1;
            state.mining_unique_ips.insert(remote_ip.clone());
        }

        if ddos_eligible {
            state.unique_ips.insert(remote_ip.clone());
        }

        let max_threshold_window = config
            .fast_threshold_window
            .max(config.slow_threshold_window);

        if is_big_hit && ddos_eligible {
            match protocol {
                Protocol::Tcp => state.tcp_big_hit_events.push_back((now, remote_ip.clone())),
                Protocol::Udp => state.udp_big_hit_events.push_back((now, remote_ip.clone())),
            }
        }

        prune_timed_events(&mut state.tcp_big_hit_events, now, max_threshold_window);
        prune_timed_events(&mut state.udp_big_hit_events, now, max_threshold_window);

        let port_scan_key = match protocol {
            Protocol::Tcp => format!("tcp:{}", event.dest_ip),
            Protocol::Udp => format!("udp:{}", event.dest_ip),
        };

        // =====================================================================
        // PORT SCAN DETECTION FIX:
        // Only track non-ephemeral destination ports for port scan detection.
        // Ephemeral ports (32768+) are OS-assigned source ports used for
        // return traffic in normal bidirectional connections (e.g., a player
        // connecting to a Minecraft server). These should NOT count as a
        // "port scan" since no attacker would scan ephemeral ports.
        // =====================================================================
        let is_port_scan_relevant = is_big_hit && is_scannable_port(event.dest_port);

        if is_port_scan_relevant {
            state
                .ports_per_dest
                .entry(port_scan_key.clone())
                .or_default()
                .insert(event.dest_port);

            state
                .ports_per_dest
                .entry(event.dest_ip.clone())
                .or_default()
                .insert(event.dest_port);
        }

        // Also filter sequential port tracking to exclude ephemeral ports
        if is_scannable_port(event.dest_port) {
            let seq_ports = state
                .recent_ports_per_dest
                .entry(port_scan_key.clone())
                .or_insert_with(VecDeque::new);
            seq_ports.push_back(event.dest_port);
            let max_recent = config.sequential_port_trigger + 1;
            while seq_ports.len() > max_recent {
                seq_ports.pop_front();
            }
        }

        state.recent_events.push_back(json!({
            "ts": Utc::now().to_rfc3339(),
            "protocol": protocol.as_str(),
            "sourceIp": event.src_ip,
            "targetIp": event.dest_ip,
            "targetPort": event.dest_port,
            "direction": if is_inbound { "inbound" } else { "outbound" },
        }));
        while state.recent_events.len() > 30 {
            state.recent_events.pop_front();
        }

        let unique_ports_on_dest = state
            .ports_per_dest
            .get(&port_scan_key)
            .map(|s| s.len())
            .unwrap_or(0);

        let unique_ports_combined = state
            .ports_per_dest
            .get(&event.dest_ip)
            .map(|s| s.len())
            .unwrap_or(0);

        let seq_ports = state
            .recent_ports_per_dest
            .get(&port_scan_key);

        let (fast_window_hits, fast_window_unique_ips, slow_window_hits, slow_window_unique_ips) =
            match protocol {
                Protocol::Tcp => {
                    let (fast_hits, fast_ips) = timed_event_metrics(
                        &state.tcp_big_hit_events,
                        now,
                        config.fast_threshold_window,
                    );
                    let (slow_hits, slow_ips) = timed_event_metrics(
                        &state.tcp_big_hit_events,
                        now,
                        config.slow_threshold_window,
                    );
                    (fast_hits, fast_ips, slow_hits, slow_ips)
                }
                Protocol::Udp => {
                    let (fast_hits, fast_ips) = timed_event_metrics(
                        &state.udp_big_hit_events,
                        now,
                        config.fast_threshold_window,
                    );
                    let (slow_hits, slow_ips) = timed_event_metrics(
                        &state.udp_big_hit_events,
                        now,
                        config.slow_threshold_window,
                    );
                    (fast_hits, fast_ips, slow_hits, slow_ips)
                }
            };

        let metrics = json!({
            "protocol": protocol.as_str(),
            "bigHits": state.big_hits,
            "tcpBigHits": state.tcp_big_hits,
            "tcpUniqueIps": state.tcp_unique_ips.len(),
            "udpHits": state.udp_hits,
            "udpUniqueIps": state.udp_unique_ips.len(),
            "amplificationHits": state.amplification_hits,
            "amplificationTargets": state.amplification_targets.len(),
            "uniqueIps": state.unique_ips.len(),
            "uniquePortsOnTarget": unique_ports_on_dest,
            "uniquePortsCombined": unique_ports_combined,
            "miningPortHits": state.mining_hits,
            "miningUniqueTargets": state.mining_unique_ips.len(),
            "fastWindowMs": config.fast_threshold_window.as_millis(),
            "slowWindowMs": config.slow_threshold_window.as_millis(),
            "fastWindowHits": fast_window_hits,
            "fastWindowUniqueIps": fast_window_unique_ips,
            "slowWindowHits": slow_window_hits,
            "slowWindowUniqueIps": slow_window_unique_ips,
            "ddosEligible": ddos_eligible,
            "isInbound": is_inbound,
            "isAmplificationPort": is_amplification,
            "isUdpRisky": is_udp_risky,
            "windowMs": config.window.as_millis(),
            "destPortIsEphemeral": is_ephemeral_port(event.dest_port),
        });

        let recent_events: Vec<_> = state.recent_events.iter().cloned().collect();

        let candidate_trigger = if protocol == Protocol::Udp
            && state.amplification_hits >= config.amplification_hit_threshold
            && state.amplification_targets.len() >= config.amplification_target_threshold
        {
            Some(DetectionTrigger {
                detection_type: "udp_amplification_attack".to_string(),
                reason: format!(
                    "UDP amplification attack: {} requests to {} unique targets on amplification ports",
                    state.amplification_hits,
                    state.amplification_targets.len()
                ),
                metrics: metrics.clone(),
                recent_events: recent_events.clone(),
            })
        } else if protocol == Protocol::Udp
            && state.udp_hits >= config.udp_flood_hit_threshold
            && state.udp_unique_ips.len() >= config.udp_flood_ip_threshold
        {
            Some(DetectionTrigger {
                detection_type: "udp_flood".to_string(),
                reason: format!(
                    "UDP flood detected: {} hits from {} unique IPs",
                    state.udp_hits,
                    state.udp_unique_ips.len()
                ),
                metrics: metrics.clone(),
                recent_events: recent_events.clone(),
            })
        } else if unique_ports_on_dest >= config.unique_ports_threshold {
            Some(DetectionTrigger {
                detection_type: format!("port_scan_unique_ports_{}", protocol.as_str()),
                reason: format!(
                    "{} port scan on {}: {} unique ports (excluding ephemeral)",
                    protocol.as_str().to_uppercase(),
                    event.dest_ip,
                    unique_ports_on_dest
                ),
                metrics: metrics.clone(),
                recent_events: recent_events.clone(),
            })
        } else if unique_ports_combined >= config.unique_ports_threshold {
            Some(DetectionTrigger {
                detection_type: "port_scan_unique_ports".to_string(),
                reason: format!(
                    "port scan on {}: {} unique ports (combined protocols, excluding ephemeral)",
                    event.dest_ip, unique_ports_combined
                ),
                metrics: metrics.clone(),
                recent_events: recent_events.clone(),
            })
        } else if seq_ports.map_or(false, |ports| is_sequential(ports, config.sequential_port_trigger)) {
            Some(DetectionTrigger {
                detection_type: format!("port_scan_sequential_{}", protocol.as_str()),
                reason: format!(
                    "{} sequential port scan detected (reached port {})",
                    protocol.as_str().to_uppercase(),
                    event.dest_port
                ),
                metrics: metrics.clone(),
                recent_events: recent_events.clone(),
            })
        } else if {
            let (big_hits, unique_ips) = (fast_window_hits, fast_window_unique_ips);

            if protocol == Protocol::Tcp && unique_ports_combined <= 1 {
                let elevated_hit_threshold = config.fast_big_hit_threshold.saturating_mul(10).max(50);
                let elevated_ip_threshold = config.fast_ip_threshold.saturating_mul(4).max(20);
                big_hits >= elevated_hit_threshold && unique_ips >= elevated_ip_threshold
            } else {
                big_hits >= config.fast_big_hit_threshold && unique_ips >= config.fast_ip_threshold
            }
        }
        {
            let detection_type = match protocol {
                Protocol::Tcp => "ddos_fast_threshold_tcp",
                Protocol::Udp => "ddos_fast_threshold_udp",
            };
            let (big_hits, unique_ips) = (fast_window_hits, fast_window_unique_ips);
            Some(DetectionTrigger {
                detection_type: detection_type.to_string(),
                reason: format!(
                    "fast threshold ({}): {} big hits across {} IPs in {}ms",
                    protocol.as_str().to_uppercase(),
                    big_hits,
                    unique_ips,
                    config.fast_threshold_window.as_millis()
                ),
                metrics: metrics.clone(),
                recent_events: recent_events.clone(),
            })
        } else if {
            let (big_hits, unique_ips) = (slow_window_hits, slow_window_unique_ips);

            if protocol == Protocol::Tcp && unique_ports_combined <= 1 {
                let elevated_hit_threshold = config.slow_big_hit_threshold.saturating_mul(5).max(100);
                let elevated_ip_threshold = config.slow_ip_threshold.saturating_mul(3).max(30);
                big_hits >= elevated_hit_threshold && unique_ips >= elevated_ip_threshold
            } else {
                big_hits >= config.slow_big_hit_threshold && unique_ips >= config.slow_ip_threshold
            }
        }
        {
            let detection_type = match protocol {
                Protocol::Tcp => "ddos_slow_threshold_tcp",
                Protocol::Udp => "ddos_slow_threshold_udp",
            };
            let (big_hits, unique_ips) = (slow_window_hits, slow_window_unique_ips);
            Some(DetectionTrigger {
                detection_type: detection_type.to_string(),
                reason: format!(
                    "slow threshold ({}): {} big hits across {} IPs in {}ms",
                    protocol.as_str().to_uppercase(),
                    big_hits,
                    unique_ips,
                    config.slow_threshold_window.as_millis()
                ),
                metrics: metrics.clone(),
                recent_events: recent_events.clone(),
            })
        } else if state.mining_hits >= config.mining_port_hit_threshold
            && state.mining_unique_ips.len() >= config.mining_ip_threshold
        {
            Some(DetectionTrigger {
                detection_type: "crypto_mining_pool_ports".to_string(),
                reason: format!(
                    "suspected mining traffic: {} connections to {} unique mining targets",
                    state.mining_hits,
                    state.mining_unique_ips.len()
                ),
                metrics,
                recent_events,
            })
        } else {
            None
        };

        if let Some(trigger) = candidate_trigger {
            let dedupe_key = format!("{}:{}:{}", trigger.detection_type, protocol.as_str(), event.dest_ip);

            let should_emit = match state.last_detection_at.get(&dedupe_key) {
                Some(last) => now.duration_since(*last) >= config.detection_cooldown,
                None => true,
            };

            if should_emit {
                state.last_detection_at.insert(dedupe_key, now);
                Some(trigger)
            } else {
                None
            }
        } else {
            None
        }
    };

    let Some(trigger) = trigger else {
        return;
    };

    let strike_count = {
        let mut strikes = shared.strikes.write().await;
        let entry = strikes.entry(event.server_id.clone()).or_insert(StrikeState {
            count: 0,
            last_at: now,
        });

        if now.duration_since(entry.last_at) > config.strike_decay_window {
            entry.count = 0;
        }

        entry.count += 1;
        entry.last_at = now;
        entry.count
    };

    let is_amplification_attack = trigger.detection_type == "udp_amplification_attack";

    let action = if is_node_fallback_id(&event.server_id) {
        EnforcementAction::Alert
    } else if is_amplification_attack {
        EnforcementAction::Suspend
    } else if should_force_suspend(&trigger, config) {
        EnforcementAction::Suspend
    } else {
        pick_action(strike_count, config)
    };

    let server_name = {
        let names = shared.server_name.read().await;
        names
            .get(&event.server_id)
            .cloned()
            .unwrap_or_else(|| event.server_id.clone())
    };

    let suspected_server_names = if event.suspected_server_ids.is_empty() {
        Vec::new()
    } else {
        let names = shared.server_name.read().await;
        event
            .suspected_server_ids
            .iter()
            .map(|id| {
                names
                    .get(id)
                    .map(|name| format!("{} ({})", name, id))
                    .unwrap_or_else(|| id.clone())
            })
            .collect::<Vec<String>>()
    };

    let mut suspend_attempted = false;
    let mut suspend_success = false;
    let mut enforcement_note: Option<String> = None;
    let mut effective_action = action;

    let server_status = {
        let statuses = shared.server_status.read().await;
        statuses.get(&event.server_id).cloned()
    };

    fn is_offline_status(status: &str) -> bool {
        matches!(
            status,
            "offline" | "stopped" | "hibernated" | "suspended" | "unknown"
        )
    }

    let suspend_allowed = match server_status.as_deref() {
        Some(status) if is_offline_status(status) => false,
        _ => true,
    };

    if action == EnforcementAction::Suspend && !config.auto_suspend_enabled {
        enforcement_note = Some("auto suspend disabled by config".to_string());
        effective_action = EnforcementAction::Alert;
    }

    if action == EnforcementAction::Suspend && !suspend_allowed {
        enforcement_note = Some(format!("server status '{}' blocks suspend", server_status.unwrap_or_else(|| "unknown".to_string())));
        effective_action = EnforcementAction::Alert;
    }

    if effective_action == EnforcementAction::Suspend {
        let allow_suspend = {
            let mut suspended = shared.last_suspended.write().await;
            if let Some(last) = suspended.get(&event.server_id) {
                if now.duration_since(*last) < config.suspend_cooldown {
                    false
                } else {
                    suspended.insert(event.server_id.clone(), now);
                    true
                }
            } else {
                suspended.insert(event.server_id.clone(), now);
                true
            }
        };

        if allow_suspend {
            eprintln!(
                "[antiabuse] suspending server {} ({}) => {}",
                event.server_id, server_name, trigger.reason
            );

            suspend_attempted = true;
            let suspend_result = backend
                .suspend_server(&event.server_id, &trigger.reason)
                .await;
            suspend_success = suspend_result.is_ok();
            if let Err(err) = &suspend_result {
                eprintln!("[antiabuse] suspend failed for {}: {err:#}", event.server_id);
                enforcement_note = Some("suspend request failed".to_string());
            }
        } else {
            enforcement_note = Some("suspend cooldown active".to_string());
            effective_action = EnforcementAction::Alert;
        }
    } else if action == EnforcementAction::Throttle {
        match backend
            .throttle_server(
                &event.server_id,
                config.throttle_cpu_limit_percent,
                config.throttle_duration_seconds,
                &trigger.reason,
            )
            .await
        {
            Ok(_) => {
                enforcement_note = Some(format!(
                    "throttle applied: cpu={}%, duration={}s",
                    config.throttle_cpu_limit_percent, config.throttle_duration_seconds
                ));
            }
            Err(err) => {
                eprintln!("[antiabuse] throttle failed for {}: {err:#}", event.server_id);
                enforcement_note = Some("throttle request failed".to_string());
            }
        }
    } else {
        if enforcement_note.is_none() {
            enforcement_note = Some("alert-only action selected".to_string());
        }
    }

    let payload = json!({
        "serverId": event.server_id,
        "reason": trigger.reason,
        "nodeName": config.node_name,
        "sourceIp": event.src_ip,
        "targetIp": event.dest_ip,
        "targetPort": event.dest_port,
        "detectionType": trigger.detection_type,
        "enforcementAction": effective_action.as_str(),
        "strikeCount": strike_count,
        "suspendAttempted": suspend_attempted,
        "suspendSuccess": suspend_success,
        "detectorName": config.detector_name,
        "metrics": trigger.metrics,
        "recentEvents": trigger.recent_events,
        "enforcementNote": enforcement_note,
        "suspectedServerIds": event.suspected_server_ids,
        "suspectedServerNames": suspected_server_names,
    });

    let should_rollup_port_scan = trigger.detection_type.starts_with("port_scan_");
    let rollup_key = if should_rollup_port_scan {
        Some(format!(
            "{}:{}:{}",
            payload
                .get("serverId")
                .and_then(|v| v.as_str())
                .unwrap_or_default(),
            trigger.detection_type,
            payload
                .get("targetIp")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
        ))
    } else {
        None
    };

    let existing_incident_id = if let Some(key) = &rollup_key {
        let rollups = shared.incident_rollups.read().await;
        rollups.get(key).and_then(|entry| {
            if now.duration_since(entry.last_at) <= PORT_SCAN_REPORT_WINDOW {
                entry.last_submission_id
            } else {
                None
            }
        })
    } else {
        None
    };

    let report_payload = if let Some(incident_id) = existing_incident_id {
        match payload.clone() {
            serde_json::Value::Object(mut map) => {
                map.insert("incidentId".to_string(), json!(incident_id));
                serde_json::Value::Object(map)
            }
            other => other,
        }
    } else {
        payload.clone()
    };

    match backend.report_incident(report_payload).await {
        Ok(response) => {
            if let Some(key) = rollup_key {
                let mut rollups = shared.incident_rollups.write().await;
                let entry = rollups
                    .entry(key)
                    .or_insert(IncidentRollupState {
                        last_submission_id: None,
                        last_at: now,
                    });
                entry.last_at = now;
                entry.last_submission_id = response.submission_id.or(existing_incident_id);
            }
        }
        Err(err) => {
        eprintln!("[antiabuse] failed to report incident: {err:#}");
        }
    }
}