use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod post {
    use std::path::Path;

    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{ApiError, api::servers::_server_::GetServer},
    };
    use axum::{
        body::Body,
        extract::Query,
        http::{HeaderMap, StatusCode},
    };
    use futures_util::StreamExt;
    use serde::{Deserialize, Serialize};
    use tokio::io::AsyncWriteExt;
    use utoipa::ToSchema;

    #[derive(ToSchema, Deserialize)]
    pub struct Params {
        file: compact_str::CompactString,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {}

    #[utoipa::path(post, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = NOT_FOUND, body = ApiError),
        (status = EXPECTATION_FAILED, body = ApiError),
    ), params(
        (
            "server" = uuid::Uuid,
            description = "The server uuid",
            example = "123e4567-e89b-12d3-a456-426614174000",
        ),
        (
            "file" = String, Query,
            description = "The file to view contents of",
        ),
    ), request_body = String)]
    pub async fn route(
        server: GetServer,
        headers: HeaderMap,
        Query(data): Query<Params>,
        body: Body,
    ) -> ApiResponseResult {
        let parent = match Path::new(&data.file).parent() {
            Some(parent) => parent,
            None => {
                return ApiResponse::error("file has no parent")
                    .with_status(StatusCode::EXPECTATION_FAILED)
                    .ok();
            }
        };

        let file_name = match Path::new(&data.file).file_name() {
            Some(name) => name,
            None => {
                return ApiResponse::error("invalid file name")
                    .with_status(StatusCode::EXPECTATION_FAILED)
                    .ok();
            }
        };

        let (root, filesystem) = server
            .filesystem
            .resolve_writable_fs(&server, &parent)
            .await;
        let path = root.join(file_name);

        let content_size: i64 = headers
            .get("Content-Length")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        let metadata = filesystem.async_metadata(&path).await;

        if filesystem.is_primary_server_fs()
            && server
                .filesystem
                .is_ignored(&path, metadata.as_ref().is_ok_and(|m| m.file_type.is_dir()))
                .await
        {
            return ApiResponse::error("file not found")
                .with_status(StatusCode::NOT_FOUND)
                .ok();
        }

        let old_content_size = if let Ok(metadata) = metadata {
            if !metadata.file_type.is_file() {
                return ApiResponse::error("file is not a file")
                    .with_status(StatusCode::EXPECTATION_FAILED)
                    .ok();
            }

            metadata.size as i64
        } else {
            0
        };

        if filesystem.is_primary_server_fs() && server.filesystem.is_ignored(parent, true).await {
            return ApiResponse::error("parent directory not found")
                .with_status(StatusCode::EXPECTATION_FAILED)
                .ok();
        }

        filesystem.async_create_dir_all(&parent).await?;

        if filesystem.is_primary_server_fs()
            && !server
                .filesystem
                .async_allocate_in_path(parent, content_size - old_content_size, false)
                .await
        {
            return ApiResponse::error("failed to allocate space")
                .with_status(StatusCode::EXPECTATION_FAILED)
                .ok();
        }

        let mut file = filesystem.async_create_file(&path).await?;
        let mut stream = body.into_data_stream();

        while let Some(Ok(chunk)) = stream.next().await {
            file.write_all(&chunk).await?;
        }

        file.shutdown().await?;
        filesystem.async_chown(&path).await?;

        ApiResponse::new_serialized(Response {}).ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(post::route))
        .with_state(state.clone())
}
