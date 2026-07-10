use super::{WebsocketEvent, WebsocketMessage};
use crate::server::{
    activity::{Activity, ActivityEvent},
    collab::CollabError,
    permissions::Permission,
};
use compact_str::ToCompactString;
use futures::StreamExt;
use serde_json::json;
use std::{net::IpAddr, str::FromStr, sync::Arc};

pub async fn handle_message(
    state: &crate::routes::AppState,
    user_ip: IpAddr,
    server: &crate::server::Server,
    websocket_handler: &Arc<super::ServerWebsocketHandler>,
    message: super::WebsocketMessage,
) -> Result<(), anyhow::Error> {
    let user_ip = Some(user_ip);

    match message.event {
        WebsocketEvent::ConfigureSocket => {
            let Some(property_str) = message.args.first().map(|s| s.as_str()) else {
                return Ok(());
            };

            match property_str {
                "transmission mode" => {
                    let Some(mode_str) = message.args.get(1).map(|s| s.as_str()) else {
                        return Ok(());
                    };

                    match mode_str {
                        "binary" => {
                            websocket_handler.set_binary_mode(true);
                        }
                        "text" => {
                            websocket_handler.set_binary_mode(false);
                        }
                        _ => {
                            tracing::debug!(
                                server = %server.uuid,
                                "received unknown transmission mode: {}",
                                mode_str
                            );
                        }
                    }
                }
                _ => {
                    tracing::debug!(
                        server = %server.uuid,
                        "received unknown socket configuration property: {}",
                        property_str
                    );
                }
            }
        }
        WebsocketEvent::SendStats => {
            websocket_handler
                .send_message(
                    WebsocketMessage::builder(WebsocketEvent::ServerStats)
                        .structured_arg(server.resource_usage())
                        .build(),
                )
                .await;
            websocket_handler
                .send_message(
                    WebsocketMessage::builder(WebsocketEvent::ServerPendingRestart)
                        .arg(server.state.get_pending_restart().to_compact_string())
                        .build(),
                )
                .await;
        }
        WebsocketEvent::SendStatus => {
            websocket_handler
                .send_message(
                    WebsocketMessage::builder(WebsocketEvent::ServerStatus)
                        .arg(server.state.get_state().to_str())
                        .build(),
                )
                .await;
        }
        WebsocketEvent::SendServerLogs => {
            if server.state.get_state() != crate::server::state::ServerState::Offline
                || state.config.load().api.send_offline_server_logs
            {
                let socket_jwt = websocket_handler.get_jwt().await?;

                if !socket_jwt
                    .permissions
                    .has_calagopus_permission_or(Permission::ControlReadConsole, true)
                {
                    return Ok(());
                }
                drop(socket_jwt);

                let mut log_stream = server
                    .logs_lines(Some(state.config.load().system.websocket_log_count))
                    .await;

                while let Some(Ok(line)) = log_stream.next().await {
                    websocket_handler
                        .send_message(
                            WebsocketMessage::builder(WebsocketEvent::ServerConsoleOutput)
                                .arg(line.trim())
                                .build(),
                        )
                        .await;
                }
            }
        }
        WebsocketEvent::SetState => {
            let Some(action) = message.args.first().map(|s| s.as_str()) else {
                return Ok(());
            };
            let power_action = crate::models::ServerPowerAction::from_str(action)?;

            match power_action {
                crate::models::ServerPowerAction::Start => {
                    let socket_jwt = websocket_handler.get_jwt().await?;

                    if !socket_jwt
                        .permissions
                        .has_permission(Permission::ControlStart)
                    {
                        tracing::debug!(
                            server = %server.uuid,
                            "jwt does not have permission to start server: {:?}",
                            socket_jwt.permissions
                        );

                        return Ok(());
                    }
                    drop(socket_jwt);

                    if server.state.get_state() != crate::server::state::ServerState::Offline {
                        websocket_handler
                            .send_error("Server is already running or starting.")
                            .await;

                        return Ok(());
                    }

                    if let Err(err) = server.start(None, false).await {
                        match err.downcast::<&str>() {
                            Ok(message) => {
                                websocket_handler.send_error(message).await;
                            }
                            Err(err) => {
                                tracing::error!(
                                    server = %server.uuid,
                                    "failed to start server: {:#?}",
                                    err,
                                );

                                websocket_handler.send_admin_error(err).await;
                            }
                        }
                    } else {
                        server.activity.log_activity(Activity {
                            event: ActivityEvent::PowerStart,
                            user: Some(websocket_handler.get_jwt().await?.user_uuid),
                            ip: user_ip,
                            metadata: None,
                            schedule: None,
                            timestamp: chrono::Utc::now(),
                        });
                    }
                }
                crate::models::ServerPowerAction::Restart => {
                    let socket_jwt = websocket_handler.get_jwt().await?;

                    if !socket_jwt
                        .permissions
                        .has_permission(Permission::ControlRestart)
                    {
                        tracing::debug!(
                            server = %server.uuid,
                            "jwt does not have permission to start server: {:?}",
                            socket_jwt.permissions
                        );

                        return Ok(());
                    }
                    drop(socket_jwt);

                    if server.restarting.load(std::sync::atomic::Ordering::SeqCst) {
                        websocket_handler
                            .send_error("Server is already restarting.")
                            .await;

                        return Ok(());
                    }

                    let auto_kill = server.configuration.read().await.auto_kill;
                    if let Err(err) = if auto_kill.enabled && auto_kill.seconds > 0 {
                        server
                            .restart_with_kill_timeout(
                                None,
                                std::time::Duration::from_secs(auto_kill.seconds),
                            )
                            .await
                    } else {
                        server.restart(None).await
                    } {
                        match err.downcast::<&str>() {
                            Ok(message) => {
                                websocket_handler.send_error(message).await;
                            }
                            Err(err) => {
                                tracing::error!(
                                    server = %server.uuid,
                                    "failed to restart server: {:#?}",
                                    err
                                );

                                websocket_handler.send_admin_error(err).await;
                            }
                        }
                    } else {
                        server.activity.log_activity(Activity {
                            event: ActivityEvent::PowerRestart,
                            user: Some(websocket_handler.get_jwt().await?.user_uuid),
                            ip: user_ip,
                            metadata: None,
                            schedule: None,
                            timestamp: chrono::Utc::now(),
                        });
                    }
                }
                crate::models::ServerPowerAction::Stop => {
                    let socket_jwt = websocket_handler.get_jwt().await?;

                    if !socket_jwt
                        .permissions
                        .has_permission(Permission::ControlStop)
                    {
                        tracing::debug!(
                            server = %server.uuid,
                            "jwt does not have permission to start server: {:?}",
                            socket_jwt.permissions
                        );

                        return Ok(());
                    }
                    drop(socket_jwt);

                    if matches!(
                        server.state.get_state(),
                        crate::server::state::ServerState::Offline
                            | crate::server::state::ServerState::Stopping
                    ) {
                        websocket_handler
                            .send_error("Server is already offline or stopping.")
                            .await;

                        return Ok(());
                    }

                    let auto_kill = server.configuration.read().await.auto_kill;
                    if let Err(err) = if auto_kill.enabled && auto_kill.seconds > 0 {
                        server
                            .stop_with_kill_timeout(
                                std::time::Duration::from_secs(auto_kill.seconds),
                                false,
                            )
                            .await
                    } else {
                        server.stop(None, false).await
                    } {
                        match err.downcast::<&str>() {
                            Ok(message) => {
                                websocket_handler.send_error(message).await;
                            }
                            Err(err) => {
                                tracing::error!(
                                    server = %server.uuid,
                                    "failed to stop server: {:#?}",
                                    err
                                );

                                websocket_handler.send_admin_error(err).await;
                            }
                        }
                    } else {
                        server.activity.log_activity(Activity {
                            event: ActivityEvent::PowerStop,
                            user: Some(websocket_handler.get_jwt().await?.user_uuid),
                            ip: user_ip,
                            metadata: None,
                            schedule: None,
                            timestamp: chrono::Utc::now(),
                        });
                    }
                }
                crate::models::ServerPowerAction::Kill => {
                    let socket_jwt = websocket_handler.get_jwt().await?;

                    if !socket_jwt
                        .permissions
                        .has_permission(Permission::ControlStop)
                    {
                        tracing::debug!(
                            server = %server.uuid,
                            "jwt does not have permission to start server: {:?}",
                            socket_jwt.permissions,
                        );

                        return Ok(());
                    }
                    drop(socket_jwt);

                    if server.state.get_state() == crate::server::state::ServerState::Offline {
                        websocket_handler
                            .send_error("Server is already offline.")
                            .await;

                        return Ok(());
                    }

                    if let Err(err) = server.kill(false).await {
                        tracing::error!(
                            server = %server.uuid,
                            "failed to kill server: {:#?}",
                            err
                        );

                        websocket_handler.send_admin_error(err).await;
                    } else {
                        server.activity.log_activity(Activity {
                            event: ActivityEvent::PowerKill,
                            user: Some(websocket_handler.get_jwt().await?.user_uuid),
                            ip: user_ip,
                            metadata: None,
                            schedule: None,
                            timestamp: chrono::Utc::now(),
                        });
                    }
                }
            }
        }
        WebsocketEvent::SendCommand => {
            let socket_jwt = websocket_handler.get_jwt().await?;

            if !socket_jwt
                .permissions
                .has_permission(Permission::ControlConsole)
            {
                tracing::debug!(
                    server = %server.uuid,
                    "jwt does not have permission to send command to server: {:?}",
                    socket_jwt.permissions
                );

                return Ok(());
            }
            drop(socket_jwt);

            let Some(raw_command) = message.args.first() else {
                return Ok(());
            };

            let mut command = raw_command.to_compact_string();
            command.push('\n');

            if let Err(err) = server.send_stdin(command.into()).await {
                tracing::error!(
                    server = %server.uuid,
                    "failed to send command to server: {}",
                    err
                );
            } else {
                server.activity.log_activity(Activity {
                    event: ActivityEvent::ConsoleCommand,
                    user: Some(websocket_handler.get_jwt().await?.user_uuid),
                    ip: user_ip,
                    metadata: Some(json!({
                        "command": raw_command,
                    })),
                    schedule: None,
                    timestamp: chrono::Utc::now(),
                });
            }
        }
        WebsocketEvent::FileCollabSubscribe
        | WebsocketEvent::FileCollabUnsubscribe
        | WebsocketEvent::FileCollabUpdate
        | WebsocketEvent::FileCollabAwareness
        | WebsocketEvent::FileCollabSave => {
            let Some(path) = message.args.first().cloned() else {
                return Ok(());
            };

            let socket_jwt = websocket_handler.get_jwt().await?;
            let user_uuid = socket_jwt.user_uuid;
            let user_name = socket_jwt
                .user_name
                .clone()
                .unwrap_or_else(|| user_uuid.to_compact_string());
            let user_avatar = socket_jwt.user_avatar.clone();
            drop(socket_jwt);

            let required_permission = match message.event {
                WebsocketEvent::FileCollabUpdate | WebsocketEvent::FileCollabSave => {
                    Permission::FileUpdate
                }
                _ => Permission::FileReadContent,
            };
            if !websocket_handler
                .has_permission(required_permission)
                .await?
            {
                tracing::debug!(
                    server = %server.uuid,
                    "jwt does not have permission for collaborative editing: {:?}",
                    required_permission
                );

                websocket_handler
                    .send_message(
                        WebsocketMessage::builder(WebsocketEvent::FileCollabError)
                            .arg(path)
                            .arg("missing permission")
                            .build(),
                    )
                    .await;

                return Ok(());
            }

            let result = match message.event {
                WebsocketEvent::FileCollabSubscribe => {
                    server
                        .collab
                        .subscribe(
                            server,
                            websocket_handler,
                            user_uuid,
                            user_name,
                            user_avatar,
                            &path,
                        )
                        .await
                }
                WebsocketEvent::FileCollabUnsubscribe => {
                    server
                        .collab
                        .unsubscribe(server, websocket_handler.connection_id, &path)
                        .await
                }
                WebsocketEvent::FileCollabUpdate => {
                    let (Some(finished), Some(chunk)) = (
                        message.args.get(1).map(|s| s.as_str()),
                        message.args.get(2).map(|s| s.as_str()),
                    ) else {
                        return Ok(());
                    };

                    server
                        .collab
                        .apply_update(
                            server,
                            websocket_handler.connection_id,
                            &path,
                            finished == "1",
                            chunk,
                        )
                        .await
                }
                WebsocketEvent::FileCollabAwareness => {
                    let Some(payload) = message.args.get(1).map(|s| s.as_str()) else {
                        return Ok(());
                    };

                    server
                        .collab
                        .relay_awareness(server, websocket_handler.connection_id, &path, payload)
                        .await
                }
                WebsocketEvent::FileCollabSave => {
                    server
                        .collab
                        .save(
                            server,
                            websocket_handler.connection_id,
                            user_uuid,
                            user_ip,
                            &path,
                        )
                        .await
                }
                _ => return Ok(()),
            };

            match result {
                Ok(()) => {}
                Err(CollabError::User(err)) => {
                    websocket_handler
                        .send_message(
                            WebsocketMessage::builder(WebsocketEvent::FileCollabError)
                                .arg(path)
                                .arg(err)
                                .build(),
                        )
                        .await;
                }
                Err(CollabError::Internal(err)) => {
                    tracing::error!(
                        server = %server.uuid,
                        "error handling collaborative editing message: {:#}",
                        err
                    );

                    websocket_handler
                        .send_message(
                            WebsocketMessage::builder(WebsocketEvent::FileCollabError)
                                .arg(path)
                                .arg("an unexpected error occurred")
                                .build(),
                        )
                        .await;
                }
            }
        }
        WebsocketEvent::Ping => {
            websocket_handler
                .send_message(
                    WebsocketMessage::builder(WebsocketEvent::Pong)
                        .args(message.args.iter().cloned())
                        .build(),
                )
                .await;
        }
        _ => {
            tracing::debug!(
                "received websocket message that will not be handled: {:?}",
                message
            );
        }
    }

    Ok(())
}
