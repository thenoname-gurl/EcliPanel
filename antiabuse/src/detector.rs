use crate::backend::BackendClient;
use crate::config::Config;
use crate::state::{ConnectionEvent, DetectionTrigger, EnforcementAction, ServerState, SharedState, StrikeState};
use chrono::Utc;
use serde_json::json;
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Instant;

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
    if trigger.detection_type != "port_scan_unique_ports" {
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

pub async fn process_connection(
    event: ConnectionEvent,
    config: &Config,
    shared: Arc<SharedState>,
    backend: &BackendClient,
) {
    let now = Instant::now();

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

        let remote_ip = if event.server_is_source {
            event.dest_ip.clone()
        } else {
            event.src_ip.clone()
        };

        let is_inbound = !event.server_is_source;
        let is_public_remote = !is_private_or_local_ip(&remote_ip);
        let ddos_eligible = is_inbound && is_public_remote;

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

        if is_big_hit {
            state
                .ports_per_dest
                .entry(event.dest_ip.clone())
                .or_default()
                .insert(event.dest_port);
        }

        let seq_ports = state
            .recent_ports_per_dest
            .entry(event.dest_ip.clone())
            .or_insert_with(VecDeque::new);
        seq_ports.push_back(event.dest_port);
        let max_recent = config.sequential_port_trigger + 1;
        while seq_ports.len() > max_recent {
            seq_ports.pop_front();
        }

        state.recent_events.push_back(json!({
            "ts": Utc::now().to_rfc3339(),
            "sourceIp": event.src_ip,
            "targetIp": event.dest_ip,
            "targetPort": event.dest_port,
        }));
        while state.recent_events.len() > 30 {
            state.recent_events.pop_front();
        }

        let unique_ports_on_dest = state
            .ports_per_dest
            .get(&event.dest_ip)
            .map(|s| s.len())
            .unwrap_or(0);

        let metrics = json!({
            "bigHits": state.big_hits,
            "uniqueIps": state.unique_ips.len(),
            "uniquePortsOnTarget": unique_ports_on_dest,
            "miningPortHits": state.mining_hits,
            "miningUniqueTargets": state.mining_unique_ips.len(),
            "ddosEligible": ddos_eligible,
            "isInbound": is_inbound,
            "windowMs": config.window.as_millis(),
        });

        let recent_events = state.recent_events.iter().cloned().collect();

        let candidate_trigger = if unique_ports_on_dest >= config.unique_ports_threshold {
            Some(DetectionTrigger {
                detection_type: "port_scan_unique_ports".to_string(),
                reason: format!(
                    "port scan on {}: {} unique ports",
                    event.dest_ip, unique_ports_on_dest
                ),
                metrics,
                recent_events,
            })
        } else if is_sequential(seq_ports, config.sequential_port_trigger) {
            Some(DetectionTrigger {
                detection_type: "port_scan_sequential".to_string(),
                reason: format!("sequential port scan detected (reached port {})", event.dest_port),
                metrics,
                recent_events,
            })
        } else if state.big_hits >= config.fast_big_hit_threshold
            && state.unique_ips.len() >= config.fast_ip_threshold
        {
            Some(DetectionTrigger {
                detection_type: "ddos_fast_threshold".to_string(),
                reason: format!(
                    "fast threshold: {} big hits across {} IPs",
                    state.big_hits,
                    state.unique_ips.len()
                ),
                metrics,
                recent_events,
            })
        } else if state.big_hits >= config.slow_big_hit_threshold
            && state.unique_ips.len() >= config.slow_ip_threshold
        {
            Some(DetectionTrigger {
                detection_type: "ddos_slow_threshold".to_string(),
                reason: format!(
                    "slow threshold: {} big hits across {} IPs",
                    state.big_hits,
                    state.unique_ips.len()
                ),
                metrics,
                recent_events,
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
            let dedupe_key = format!("{}:{}", trigger.detection_type, event.dest_ip);
            let is_force_suspend_port_scan = trigger.detection_type == "port_scan_unique_ports"
                && unique_ports_on_target(&trigger) >= config.port_scan_auto_suspend_unique_ports;

            let should_emit = if is_force_suspend_port_scan {
                true
            } else {
                match state.last_detection_at.get(&dedupe_key) {
                    Some(last) => now.duration_since(*last) >= config.detection_cooldown,
                    None => true,
                }
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

    let action = if is_node_fallback_id(&event.server_id) {
        EnforcementAction::Alert
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

    if action == EnforcementAction::Suspend {
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
        enforcement_note = Some("alert-only action selected".to_string());
    }

    let payload = json!({
        "serverId": event.server_id,
        "reason": trigger.reason,
        "nodeName": config.node_name,
        "sourceIp": event.src_ip,
        "targetIp": event.dest_ip,
        "targetPort": event.dest_port,
        "detectionType": trigger.detection_type,
        "enforcementAction": action.as_str(),
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

    if let Err(err) = backend.report_incident(payload).await {
        eprintln!("[antiabuse] failed to report incident: {err:#}");
    }
}