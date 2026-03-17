use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod post {
    use std::{
        path::{Path, PathBuf},
        sync::{Arc, atomic::AtomicU64},
    };

    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{ApiError, api::servers::_server_::GetServer},
    };
    use axum::http::StatusCode;
    use serde::{Deserialize, Serialize};
    use utoipa::ToSchema;

    fn foreground() -> bool {
        true
    }

    #[derive(ToSchema, Deserialize)]
    pub struct Payload {
        #[serde(default)]
        root: compact_str::CompactString,

        #[schema(inline)]
        files: Vec<crate::models::CopyFile>,

        #[serde(default = "foreground")]
        foreground: bool,
    }

    #[derive(ToSchema, Serialize)]
    pub struct Response {
        copied: usize,
    }

    #[derive(ToSchema, Serialize)]
    struct ResponseAccepted {
        identifier: uuid::Uuid,
    }

    #[utoipa::path(post, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = ACCEPTED, body = inline(ResponseAccepted)),
        (status = NOT_FOUND, body = ApiError),
        (status = EXPECTATION_FAILED, body = ApiError),
    ), params(
        (
            "server" = uuid::Uuid,
            description = "The server uuid",
            example = "123e4567-e89b-12d3-a456-426614174000",
        ),
    ), request_body = inline(Payload))]
    pub async fn route(
        server: GetServer,
        crate::Payload(data): crate::Payload<Payload>,
    ) -> ApiResponseResult {
        let progress = Arc::new(AtomicU64::new(0));
        let total = Arc::new(AtomicU64::new(0));

        let (identifier, task) = server
            .filesystem
            .operations
            .add_operation(
                crate::server::filesystem::operations::FilesystemOperation::CopyMany {
                    path: PathBuf::from(&data.root),
                    files: data.files.clone(),
                    start_time: chrono::Utc::now(),
                    progress: progress.clone(),
                    total: total.clone(),
                },
                {
                    let server = server.clone();

                    async move {
                        let mut total_size = 0;
                        for file in &data.files {
                            let path = Path::new(&data.root).join(&file.from);
                            let parent = match path.parent() {
                                Some(parent) => parent,
                                None => continue,
                            };
                            let file_name = match path.file_name() {
                                Some(name) => name,
                                None => continue,
                            };

                            let (root, filesystem) =
                                server.filesystem.resolve_readable_fs(&server, parent).await;

                            let directory_entry = match filesystem
                                .async_directory_entry_buffer(&root.join(file_name), &[])
                                .await
                            {
                                Ok(entry) => entry,
                                Err(_) => continue,
                            };

                            total_size += directory_entry.size;
                        }

                        total.store(total_size, std::sync::atomic::Ordering::Relaxed);

                        let mut copied_count = 0;
                        for file in data.files {
                            let path = Path::new(&data.root).join(&file.from);
                            let parent = match path.parent() {
                                Some(parent) => parent,
                                None => continue,
                            };
                            let file_name = match path.file_name() {
                                Some(name) => name,
                                None => continue,
                            };

                            let (root, filesystem) =
                                server.filesystem.resolve_readable_fs(&server, parent).await;

                            let from = root.join(file_name);
                            if from == root {
                                continue;
                            }

                            let to = Path::new(&data.root).join(file.to);
                            if to == root {
                                continue;
                            }

                            if from == to {
                                continue;
                            }

                            let metadata = match filesystem.async_metadata(&from).await {
                                Ok(metadata) => metadata,
                                Err(_) => continue,
                            };

                            if filesystem.async_metadata(&to).await.is_ok()
                                || (filesystem.is_primary_server_fs()
                                    && server
                                        .filesystem
                                        .is_ignored(&from, metadata.file_type.is_dir())
                                        .await)
                            {
                                continue;
                            }

                            let to_parent = match to.parent() {
                                Some(parent) => parent,
                                None => continue,
                            };
                            let to_file_name = match to.file_name() {
                                Some(name) => name,
                                None => continue,
                            };

                            let (destination_root, destination_filesystem) = server
                                .filesystem
                                .resolve_writable_fs(&server, to_parent)
                                .await;

                            if destination_filesystem.is_primary_server_fs()
                                && server
                                    .filesystem
                                    .is_ignored(&to, metadata.file_type.is_dir())
                                    .await
                            {
                                continue;
                            }

                            if server
                                .filesystem
                                .copy_path(
                                    progress.clone(),
                                    &server,
                                    metadata,
                                    from,
                                    filesystem.clone(),
                                    destination_root.join(to_file_name),
                                    destination_filesystem,
                                )
                                .await
                                .is_ok()
                            {
                                copied_count += 1;
                            }
                        }

                        Ok(copied_count)
                    }
                },
            )
            .await;

        if data.foreground {
            let copied = match task.await {
                Ok(Some(Ok(copied))) => copied,
                Ok(Some(Err(err))) => {
                    return Err(ApiResponse::error(&format!(
                        "file copy operation failed: {}",
                        err
                    ))
                    .with_status(StatusCode::EXPECTATION_FAILED));
                }
                Ok(None) => {
                    return Err(ApiResponse::error("file copy operation was aborted")
                        .with_status(StatusCode::EXPECTATION_FAILED));
                }
                Err(err) => {
                    tracing::error!("copy many operation task error: {:#?}", err);
                    return Err(ApiResponse::error("file copy operation failed")
                        .with_status(StatusCode::EXPECTATION_FAILED));
                }
            };

            ApiResponse::new_serialized(Response { copied }).ok()
        } else {
            ApiResponse::new_serialized(ResponseAccepted { identifier })
                .with_status(StatusCode::ACCEPTED)
                .ok()
        }
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(post::route))
        .with_state(state.clone())
}
