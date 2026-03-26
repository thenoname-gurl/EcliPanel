use compact_str::ToCompactString;
use serde::Serialize;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, atomic::AtomicU64},
};
use tokio::sync::{RwLock, RwLockReadGuard};

fn serialize_arc<S>(value: &Arc<AtomicU64>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_u64(value.load(std::sync::atomic::Ordering::Relaxed))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum FilesystemOperation {
    Compress {
        path: PathBuf,
        files: Vec<PathBuf>,
        destination_path: PathBuf,

        start_time: chrono::DateTime<chrono::Utc>,
        #[serde(serialize_with = "serialize_arc")]
        progress: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        total: Arc<AtomicU64>,
    },
    Decompress {
        path: PathBuf,
        destination_path: PathBuf,

        start_time: chrono::DateTime<chrono::Utc>,
        #[serde(serialize_with = "serialize_arc")]
        progress: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        total: Arc<AtomicU64>,
    },
    Pull {
        destination_path: PathBuf,

        start_time: chrono::DateTime<chrono::Utc>,
        #[serde(serialize_with = "serialize_arc")]
        progress: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        total: Arc<AtomicU64>,
    },
    Copy {
        path: PathBuf,
        destination_path: PathBuf,

        start_time: chrono::DateTime<chrono::Utc>,
        #[serde(serialize_with = "serialize_arc")]
        progress: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        total: Arc<AtomicU64>,
    },
    CopyMany {
        path: PathBuf,
        files: Vec<crate::models::CopyFile>,

        start_time: chrono::DateTime<chrono::Utc>,
        #[serde(serialize_with = "serialize_arc")]
        progress: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        total: Arc<AtomicU64>,
    },
    CopyRemote {
        server: uuid::Uuid,
        path: PathBuf,
        files: Vec<PathBuf>,
        destination_server: uuid::Uuid,
        destination_path: PathBuf,

        start_time: chrono::DateTime<chrono::Utc>,
        #[serde(serialize_with = "serialize_arc")]
        progress: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        total: Arc<AtomicU64>,
    },
}

pub struct Operation {
    pub filesystem_operation: FilesystemOperation,
    abort_sender: tokio::sync::oneshot::Sender<()>,
    finish_notifier: Arc<tokio::sync::Notify>,
}

pub struct OperationManager {
    operations: Arc<RwLock<HashMap<uuid::Uuid, Operation>>>,
    sender: tokio::sync::broadcast::Sender<crate::server::websocket::WebsocketMessage>,
}

impl OperationManager {
    pub fn new(
        sender: tokio::sync::broadcast::Sender<crate::server::websocket::WebsocketMessage>,
    ) -> Self {
        Self {
            operations: Arc::new(RwLock::new(HashMap::new())),
            sender,
        }
    }

    #[inline]
    pub async fn operations(&self) -> RwLockReadGuard<'_, HashMap<uuid::Uuid, Operation>> {
        self.operations.read().await
    }

    pub async fn add_operation<
        T: Send + 'static,
        F: Future<Output = Result<T, anyhow::Error>> + Send + 'static,
    >(
        &self,
        operation: FilesystemOperation,
        f: F,
    ) -> (
        uuid::Uuid,
        tokio::task::JoinHandle<Option<Result<T, anyhow::Error>>>,
    ) {
        let operation_uuid = uuid::Uuid::new_v4();
        let (abort_sender, abort_receiver) = tokio::sync::oneshot::channel();
        let finish_notifier = Arc::new(tokio::sync::Notify::new());

        let handle = tokio::spawn({
            let operation = operation.clone();
            let operations = self.operations.clone();
            let sender = self.sender.clone();
            let finish_notifier = Arc::clone(&finish_notifier);

            async move {
                let progress_task = async {
                    loop {
                        sender
                            .send(crate::server::websocket::WebsocketMessage::new(
                                crate::server::websocket::WebsocketEvent::ServerOperationProgress,
                                [
                                    operation_uuid.to_compact_string(),
                                    serde_json::to_string(&operation).unwrap().into(),
                                ]
                                .into(),
                            ))
                            .ok();

                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    }
                };

                let result = tokio::select! {
                    result = f => Some(result),
                    _ = progress_task => None,
                    _ = abort_receiver => None,
                };

                operations.write().await.remove(&operation_uuid);
                if let Some(Err(err)) = result.as_ref() {
                    let message = if let Some(err) = err.downcast_ref::<&str>() {
                        err.to_string()
                    } else if let Some(err) = err.downcast_ref::<String>() {
                        err.to_string()
                    } else if let Some(err) = err.downcast_ref::<std::io::Error>() {
                        err.to_string()
                    } else if let Some(err) = err.downcast_ref::<zip::result::ZipError>() {
                        match err {
                            zip::result::ZipError::Io(err) => err.to_string(),
                            _ => err.to_string(),
                        }
                    } else if let Some(err) = err.downcast_ref::<sevenz_rust2::Error>() {
                        match err {
                            sevenz_rust2::Error::Io(err, _) => err.to_string(),
                            _ => err.to_string(),
                        }
                    } else {
                        tracing::error!(
                            operation = ?operation_uuid,
                            "unknown operation error: {:#?}",
                            err
                        );

                        String::from("unknown error")
                    };

                    sender
                        .send(crate::server::websocket::WebsocketMessage::new(
                            crate::server::websocket::WebsocketEvent::ServerOperationError,
                            [operation_uuid.to_compact_string(), message.into()].into(),
                        ))
                        .ok();
                } else {
                    sender
                        .send(crate::server::websocket::WebsocketMessage::new(
                            crate::server::websocket::WebsocketEvent::ServerOperationCompleted,
                            [operation_uuid.to_compact_string()].into(),
                        ))
                        .ok();
                }

                finish_notifier.notify_waiters();

                result
            }
        });

        self.operations.write().await.insert(
            operation_uuid,
            Operation {
                filesystem_operation: operation,
                abort_sender,
                finish_notifier,
            },
        );

        (operation_uuid, handle)
    }

    pub async fn abort_operation(&self, operation_uuid: uuid::Uuid) -> bool {
        if let Some(operation) = self.operations.write().await.remove(&operation_uuid) {
            operation.abort_sender.send(()).ok();
            return true;
        }

        false
    }

    pub async fn wait_for_operation_completion(&self, operation_uuid: uuid::Uuid) -> Option<()> {
        let finish_notifier = {
            let operations = self.operations.read().await;
            let operation = operations.get(&operation_uuid)?;

            Arc::clone(&operation.finish_notifier)
        };

        finish_notifier.notified().await;
        Some(())
    }
}
