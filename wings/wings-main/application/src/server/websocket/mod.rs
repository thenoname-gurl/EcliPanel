use super::permissions::{Permission, Permissions};
use axum::extract::ws::{CloseFrame, Message, WebSocket};
use compact_str::ToCompactString;
use futures::{SinkExt, stream::SplitSink};
use serde::{
    Deserialize, Deserializer, Serialize,
    de::{SeqAccess, Visitor},
    ser::SerializeSeq,
};
use std::{
    borrow::Cow,
    collections::HashSet,
    error::Error,
    marker::PhantomData,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
use tokio::sync::{Mutex, RwLock};
use utoipa::ToSchema;

pub mod handler;
mod jwt;
mod message_handler;

#[derive(Deserialize)]
pub struct WebsocketJwtPayload {
    #[serde(flatten)]
    pub base: crate::remote::jwt::BasePayload,

    pub user_uuid: uuid::Uuid,
    pub server_uuid: uuid::Uuid,
    pub permissions: Permissions,
    pub ignored_files: Option<Vec<compact_str::CompactString>>,
}

#[derive(Debug, Clone, Copy, ToSchema, Deserialize, Serialize)]
pub enum WebsocketEvent {
    #[serde(rename = "auth success")]
    AuthenticationSuccess,
    #[serde(rename = "token expiring")]
    TokenExpiring,
    #[serde(rename = "token expired")]
    TokenExpired,
    #[serde(rename = "auth")]
    Authentication,

    #[serde(rename = "configure socket")]
    ConfigureSocket,
    #[serde(rename = "set state")]
    SetState,
    #[serde(rename = "send logs")]
    SendServerLogs,
    #[serde(rename = "send command")]
    SendCommand,
    #[serde(rename = "send stats")]
    SendStats,
    #[serde(rename = "send status")]
    SendStatus,
    #[serde(rename = "daemon error")]
    Error,
    #[serde(rename = "jwt error")]
    JwtError,

    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "pong")]
    Pong,

    #[serde(rename = "stats")]
    ServerStats,
    #[serde(rename = "status")]
    ServerStatus,
    #[serde(rename = "custom event")]
    ServerCustomEvent,
    #[serde(rename = "console output")]
    ServerConsoleOutput,
    #[serde(rename = "install output")]
    ServerInstallOutput,
    #[serde(rename = "image pull progress")]
    ServerImagePullProgress,
    #[serde(rename = "image pull completed")]
    ServerImagePullCompleted,
    #[serde(rename = "install started")]
    ServerInstallStarted,
    #[serde(rename = "install completed")]
    ServerInstallCompleted,
    #[serde(rename = "daemon message")]
    ServerDaemonMessage,
    #[serde(rename = "backup started")]
    ServerBackupStarted,
    #[serde(rename = "backup progress")]
    ServerBackupProgress,
    #[serde(rename = "backup completed")]
    ServerBackupCompleted,
    #[serde(rename = "backup restore started")]
    ServerBackupRestoreStarted,
    #[serde(rename = "backup restore progress")]
    ServerBackupRestoreProgress,
    #[serde(rename = "backup restore completed")]
    ServerBackupRestoreCompleted,
    #[serde(rename = "transfer logs")]
    ServerTransferLogs,
    #[serde(rename = "transfer status")]
    ServerTransferStatus,
    #[serde(rename = "transfer progress")]
    ServerTransferProgress,
    #[serde(rename = "schedule started")]
    ServerScheduleStarted,
    #[serde(rename = "schedule step status")]
    ServerScheduleStepStatus,
    #[serde(rename = "schedule step error")]
    ServerScheduleStepError,
    #[serde(rename = "schedule completed")]
    ServerScheduleCompleted,
    #[serde(rename = "operation progress")]
    ServerOperationProgress,
    #[serde(rename = "operation error")]
    ServerOperationError,
    #[serde(rename = "operation completed")]
    ServerOperationCompleted,
}

#[derive(Debug, Clone)]
pub struct TargetedWebsocketMessage {
    user_uuids: Arc<HashSet<uuid::Uuid>>,
    permissions: Arc<Permissions>,
    message: WebsocketMessage,
}

impl TargetedWebsocketMessage {
    pub fn new(
        user_uuids: HashSet<uuid::Uuid>,
        permissions: Permissions,
        message: WebsocketMessage,
    ) -> Self {
        Self {
            user_uuids: Arc::new(user_uuids),
            permissions: Arc::new(permissions),
            message,
        }
    }

    pub fn matches(&self, user_uuid: &uuid::Uuid, permissions: &Permissions) -> bool {
        (self.user_uuids.is_empty() || self.user_uuids.contains(user_uuid))
            && self
                .permissions
                .iter()
                .all(|perm| permissions.has_permission(*perm))
    }

    #[inline]
    pub fn into_message(self) -> WebsocketMessage {
        self.message
    }
}

#[derive(Debug, Clone, ToSchema, Deserialize, Serialize)]
pub struct WebsocketMessage {
    pub event: WebsocketEvent,

    #[serde(deserialize_with = "string_vec_or_empty")]
    #[serde(serialize_with = "arc_vec")]
    #[schema(value_type = Vec<String>)]
    pub args: Arc<[compact_str::CompactString]>,
}

fn string_vec_or_empty<'de, D>(
    deserializer: D,
) -> Result<Arc<[compact_str::CompactString]>, D::Error>
where
    D: Deserializer<'de>,
{
    struct StringVecVisitor(PhantomData<[compact_str::CompactString]>);

    impl<'de> Visitor<'de> for StringVecVisitor {
        type Value = Arc<[compact_str::CompactString]>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a string array or null")
        }

        fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
        where
            A: SeqAccess<'de>,
        {
            let mut vec = Vec::new();
            while let Some(element) = seq.next_element::<Option<compact_str::CompactString>>()? {
                if let Some(value) = element {
                    vec.push(value);
                }
            }
            Ok(Arc::from(vec))
        }

        fn visit_unit<E>(self) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            Ok(Arc::new([]))
        }
    }

    deserializer.deserialize_any(StringVecVisitor(PhantomData))
}

fn arc_vec<S>(vec: &Arc<[compact_str::CompactString]>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    let mut seq = serializer.serialize_seq(Some(vec.len()))?;
    for item in vec.iter() {
        seq.serialize_element(item)?;
    }

    seq.end()
}

impl WebsocketMessage {
    #[inline]
    pub fn new(event: WebsocketEvent, args: Arc<[compact_str::CompactString]>) -> Self {
        Self { event, args }
    }
}

pub type SocketJwt = Arc<RwLock<Option<Arc<WebsocketJwtPayload>>>>;

pub struct ServerWebsocketHandler {
    sender: Arc<Mutex<SplitSink<WebSocket, Message>>>,
    state: crate::routes::State,
    socket_jwt: SocketJwt,
    closed: AtomicBool,
    binary_mode: AtomicBool,
}

impl ServerWebsocketHandler {
    fn new(
        sender: Arc<Mutex<SplitSink<WebSocket, Message>>>,
        state: crate::routes::State,
        socket_jwt: SocketJwt,
    ) -> Self {
        Self {
            sender,
            state,
            socket_jwt,
            closed: AtomicBool::new(false),
            binary_mode: AtomicBool::new(false),
        }
    }

    fn set_binary_mode(&self, enabled: bool) {
        self.binary_mode.store(enabled, Ordering::Relaxed);
    }

    async fn get_jwt(&self) -> Result<Arc<WebsocketJwtPayload>, anyhow::Error> {
        if let Some(socket_jwt) = &*self.socket_jwt.read().await {
            Ok(Arc::clone(socket_jwt))
        } else {
            Err(anyhow::anyhow!("unable to acquire socket jwt"))
        }
    }

    async fn has_permission(&self, permission: Permission) -> Result<bool, anyhow::Error> {
        let jwt = self.get_jwt().await?;

        if let Err(err) = jwt.base.validate(&self.state.config.jwt).await {
            return Err(anyhow::anyhow!("invalid token: {err}"));
        }

        Ok(jwt.permissions.has_permission(permission))
    }

    async fn has_calagopus_permission_or(
        &self,
        permission: Permission,
        default: bool,
    ) -> Result<bool, anyhow::Error> {
        let jwt = self.get_jwt().await?;

        if let Err(err) = jwt.base.validate(&self.state.config.jwt).await {
            return Err(anyhow::anyhow!("invalid token: {err}"));
        }

        Ok(jwt
            .permissions
            .has_calagopus_permission_or(permission, default))
    }

    async fn close(&self, reason: &str) {
        if self.closed.load(Ordering::Relaxed) {
            return;
        }
        self.closed.store(true, Ordering::Relaxed);

        if let Err(err) = self
            .sender
            .lock()
            .await
            .send(Message::Close(Some(CloseFrame {
                code: axum::extract::ws::close_code::NORMAL,
                reason: reason.into(),
            })))
            .await
            && err.source().is_none_or(|e| {
                e.downcast_ref::<std::io::Error>()
                    .is_none_or(|i| i.kind() != std::io::ErrorKind::BrokenPipe)
            })
        {
            tracing::error!("failed to close websocket: {:?}", err);
        }
    }

    async fn send_message(&self, message: WebsocketMessage) {
        if self.closed.load(Ordering::Relaxed) {
            return;
        }

        let message = if self.binary_mode.load(Ordering::Relaxed) {
            let message = match rmp_serde::to_vec(&message) {
                Ok(message) => message,
                Err(err) => {
                    tracing::error!("failed to serialize websocket message: {:?}", err);
                    return;
                }
            };
            Message::Binary(message.into())
        } else {
            let message = match serde_json::to_string(&message) {
                Ok(message) => message,
                Err(err) => {
                    tracing::error!("failed to serialize websocket message: {:?}", err);
                    return;
                }
            };
            Message::Text(message.into())
        };

        if let Err(err) = self.sender.lock().await.send(message).await
            && err.source().is_none_or(|e| {
                e.downcast_ref::<std::io::Error>()
                    .is_none_or(|i| i.kind() != std::io::ErrorKind::BrokenPipe)
            })
        {
            tracing::error!("failed to send websocket message: {:?}", err);
        }
    }

    async fn send_error(&self, message: impl Into<Cow<'_, str>>) {
        let message = WebsocketMessage::new(
            WebsocketEvent::ServerDaemonMessage,
            [ansi_term::Style::new()
                .bold()
                .on(ansi_term::Color::Red)
                .paint(message.into())
                .to_compact_string()]
            .into(),
        );

        let message = if self.binary_mode.load(Ordering::Relaxed) {
            let message = match rmp_serde::to_vec(&message) {
                Ok(message) => message,
                Err(err) => {
                    tracing::error!("failed to serialize websocket message: {:?}", err);
                    return;
                }
            };
            Message::Binary(message.into())
        } else {
            let message = match serde_json::to_string(&message) {
                Ok(message) => message,
                Err(err) => {
                    tracing::error!("failed to serialize websocket message: {:?}", err);
                    return;
                }
            };
            Message::Text(message.into())
        };

        if let Err(err) = self.sender.lock().await.send(message).await
            && err.source().is_none_or(|e| {
                e.downcast_ref::<std::io::Error>()
                    .is_none_or(|i| i.kind() != std::io::ErrorKind::BrokenPipe)
            })
        {
            tracing::error!("failed to send websocket message: {:?}", err);
        }
    }

    async fn send_admin_error(&self, message: impl Into<anyhow::Error>) {
        let message = if self.socket_jwt.read().await.as_ref().is_some_and(|j| {
            j.permissions
                .has_permission(super::permissions::Permission::AdminWebsocketErrors)
        }) {
            format!("{}", message.into())
        } else {
            "An unexpected error occurred. Please contact an Administrator.".into()
        };

        let message = WebsocketMessage::new(
            WebsocketEvent::ServerDaemonMessage,
            [ansi_term::Style::new()
                .bold()
                .on(ansi_term::Color::Red)
                .paint(message)
                .to_compact_string()]
            .into(),
        );
        let message = if self.binary_mode.load(Ordering::Relaxed) {
            let message = match rmp_serde::to_vec(&message) {
                Ok(message) => message,
                Err(err) => {
                    tracing::error!("failed to serialize websocket message: {:?}", err);
                    return;
                }
            };
            Message::Binary(message.into())
        } else {
            let message = match serde_json::to_string(&message) {
                Ok(message) => message,
                Err(err) => {
                    tracing::error!("failed to serialize websocket message: {:?}", err);
                    return;
                }
            };
            Message::Text(message.into())
        };

        if let Err(err) = self.sender.lock().await.send(message).await
            && err.source().is_none_or(|e| {
                e.downcast_ref::<std::io::Error>()
                    .is_none_or(|i| i.kind() != std::io::ErrorKind::BrokenPipe)
            })
        {
            tracing::error!("failed to send websocket message: {:?}", err);
        }
    }
}
