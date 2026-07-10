use compact_str::ToCompactString;
use serde::Serialize;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, atomic::AtomicU64},
};
use tokio::sync::{RwLock, RwLockReadGuard};
use utoipa::ToSchema;

fn serialize_arc<S>(value: &Arc<AtomicU64>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_u64(value.load(std::sync::atomic::Ordering::Relaxed))
}

#[derive(Clone, ToSchema, Serialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum FilesystemOperation {
    Compress {
        #[schema(value_type = String)]
        path: PathBuf,
        #[schema(value_type = Vec<String>)]
        files: Vec<PathBuf>,
        #[schema(value_type = String)]
        destination_path: PathBuf,

        start_time: chrono::DateTime<chrono::Utc>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        bytes_processed: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        bytes_total: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        files_processed: Arc<AtomicU64>,
    },
    Decompress {
        #[schema(value_type = String)]
        path: PathBuf,
        #[schema(value_type = String)]
        destination_path: PathBuf,

        start_time: chrono::DateTime<chrono::Utc>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        bytes_processed: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        bytes_total: Arc<AtomicU64>,
    },
    Pull {
        #[schema(value_type = String)]
        destination_path: PathBuf,

        start_time: chrono::DateTime<chrono::Utc>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        bytes_processed: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        bytes_total: Arc<AtomicU64>,
    },
    Copy {
        #[schema(value_type = String)]
        path: PathBuf,
        #[schema(value_type = String)]
        destination_path: PathBuf,

        start_time: chrono::DateTime<chrono::Utc>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        bytes_processed: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        bytes_total: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        files_processed: Arc<AtomicU64>,
    },
    CopyMany {
        #[schema(value_type = String)]
        path: PathBuf,
        files: Vec<crate::models::CopyFile>,

        start_time: chrono::DateTime<chrono::Utc>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        bytes_processed: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        bytes_total: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        files_processed: Arc<AtomicU64>,
    },
    CopyRemote {
        server: uuid::Uuid,
        #[schema(value_type = String)]
        path: PathBuf,
        #[schema(value_type = Vec<String>)]
        files: Vec<PathBuf>,
        destination_server: uuid::Uuid,
        #[schema(value_type = String)]
        destination_path: PathBuf,

        start_time: chrono::DateTime<chrono::Utc>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        bytes_processed: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        bytes_total: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        files_processed: Arc<AtomicU64>,
    },
    ExportBackup {
        backup: uuid::Uuid,
        #[schema(value_type = String)]
        destination_path: PathBuf,

        start_time: chrono::DateTime<chrono::Utc>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        bytes_processed: Arc<AtomicU64>,
        #[serde(serialize_with = "serialize_arc")]
        #[schema(value_type = u64)]
        bytes_total: Arc<AtomicU64>,
    },
}

pub struct Operation {
    pub filesystem_operation: FilesystemOperation,
    abort_sender: tokio::sync::oneshot::Sender<()>,
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

        let handle = tokio::spawn({
            let operation = operation.clone();
            let operations = self.operations.clone();
            let sender = self.sender.clone();

            async move {
                let progress_task = async {
                    loop {
                        sender
                            .send(
                                crate::server::websocket::WebsocketMessage::builder(
                                    crate::server::websocket::WebsocketEvent::ServerOperationProgress,
                                )
                                .arg(operation_uuid.to_compact_string())
                                .structured_arg(&operation)
                                .build(),
                            )
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
                        .send(
                            crate::server::websocket::WebsocketMessage::builder(
                                crate::server::websocket::WebsocketEvent::ServerOperationError,
                            )
                            .arg(operation_uuid.to_compact_string())
                            .arg(message)
                            .build(),
                        )
                        .ok();
                } else {
                    sender
                        .send(
                            crate::server::websocket::WebsocketMessage::builder(
                                crate::server::websocket::WebsocketEvent::ServerOperationCompleted,
                            )
                            .arg(operation_uuid.to_compact_string())
                            .build(),
                        )
                        .ok();
                }

                result
            }
        });

        self.operations.write().await.insert(
            operation_uuid,
            Operation {
                filesystem_operation: operation,
                abort_sender,
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
}
