use super::State;
use axum::extract::DefaultBodyLimit;
use utoipa_axum::{
    router::{OpenApiRouter, UtoipaMethodRouterExt},
    routes,
};

mod post {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{ApiError, GetState},
        server::activity::{Activity, ActivityEvent},
    };
    use axum::{
        extract::{ConnectInfo, Multipart, Query},
        http::{HeaderMap, StatusCode},
    };
    use serde::{Deserialize, Serialize};
    use serde_json::json;
    use std::{net::SocketAddr, path::PathBuf};
    use tokio::io::AsyncWriteExt;
    use utoipa::ToSchema;

    #[derive(ToSchema, Deserialize)]
    pub struct Params {
        token: String,
        #[serde(default)]
        directory: compact_str::CompactString,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {}

    #[derive(Deserialize)]
    pub struct FileJwtPayload {
        #[serde(flatten)]
        pub base: crate::remote::jwt::BasePayload,

        pub server_uuid: uuid::Uuid,
        pub user_uuid: uuid::Uuid,
        pub unique_id: compact_str::CompactString,

        #[serde(default)]
        pub ignored_files: Vec<compact_str::CompactString>,
    }

    #[utoipa::path(post, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = UNAUTHORIZED, body = ApiError),
        (status = NOT_FOUND, body = ApiError),
        (status = EXPECTATION_FAILED, body = ApiError),
    ), params(
        (
            "token" = String, Query,
            description = "The JWT token to use for authentication",
        ),
        (
            "directory" = String, Query,
            description = "The directory to upload the file to",
        ),
    ), request_body = String)]
    pub async fn route(
        state: GetState,
        headers: HeaderMap,
        connect_info: ConnectInfo<SocketAddr>,
        Query(data): Query<Params>,
        mut multipart: Multipart,
    ) -> ApiResponseResult {
        let payload: FileJwtPayload = match state.config.jwt.verify(&data.token) {
            Ok(payload) => payload,
            Err(_) => {
                return ApiResponse::error("invalid token")
                    .with_status(StatusCode::UNAUTHORIZED)
                    .ok();
            }
        };

        if !payload.base.validate(&state.config.jwt).await {
            return ApiResponse::error("invalid token")
                .with_status(StatusCode::UNAUTHORIZED)
                .ok();
        }

        if !state.config.jwt.limited_jwt_id(&payload.unique_id).await {
            return ApiResponse::error("token has already been used")
                .with_status(StatusCode::UNAUTHORIZED)
                .ok();
        }

        let server = match state.server_manager.get_server(payload.server_uuid).await {
            Some(server) => server,
            None => {
                return ApiResponse::error("server not found")
                    .with_status(StatusCode::NOT_FOUND)
                    .ok();
            }
        };

        let ignored = if payload.ignored_files.is_empty() {
            None
        } else {
            let mut ignore_builder = ignore::gitignore::GitignoreBuilder::new("/");

            for file in payload.ignored_files {
                ignore_builder.add_line(None, &file).ok();
            }

            ignore_builder.build().ok()
        };

        let directory = PathBuf::from(data.directory);

        let metadata = server.filesystem.async_metadata(&directory).await;
        if !metadata.map(|m| m.is_dir()).unwrap_or(true) {
            return ApiResponse::error("directory is not a directory")
                .with_status(StatusCode::EXPECTATION_FAILED)
                .ok();
        }

        let user_ip = Some(state.config.find_ip(&headers, connect_info));

        while let Some(mut field) = multipart.next_field().await? {
            let filename = match field.file_name() {
                Some(name) => name,
                None => {
                    return ApiResponse::error("file name not found")
                        .with_status(StatusCode::EXPECTATION_FAILED)
                        .ok();
                }
            };
            let path = directory.join(filename);
            let parent = match path.parent() {
                Some(parent) => parent,
                None => {
                    return ApiResponse::error("file has no parent")
                        .with_status(StatusCode::EXPECTATION_FAILED)
                        .ok();
                }
            };

            if ignored
                .as_ref()
                .is_some_and(|o| o.matched(parent, false).is_ignore())
                || server.filesystem.is_ignored(parent, false).await
            {
                return ApiResponse::error("file not found")
                    .with_status(StatusCode::NOT_FOUND)
                    .ok();
            }

            let file_name = match path.file_name() {
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

            if filesystem.is_primary_server_fs()
                && (ignored
                    .as_ref()
                    .is_some_and(|o| o.matched(&path, false).is_ignore())
                    || server.filesystem.is_ignored(&path, false).await)
            {
                return ApiResponse::error("file not found")
                    .with_status(StatusCode::NOT_FOUND)
                    .ok();
            }

            filesystem.async_create_dir_all(&parent).await?;

            let mut written_size = 0;
            let mut writer = filesystem.async_create_file(&path).await?;

            server
                .activity
                .log_activity(Activity {
                    event: ActivityEvent::FileUploaded,
                    user: Some(payload.user_uuid),
                    ip: user_ip,
                    metadata: Some(json!({
                        "files": [filename],
                        "directory": server.filesystem.relative_path(&directory),
                    })),
                    schedule: None,
                    timestamp: chrono::Utc::now(),
                })
                .await;

            while let Some(chunk) = field.chunk().await? {
                if crate::unlikely(
                    written_size + chunk.len() as u64 > state.config.api.upload_limit.as_bytes(),
                ) {
                    return ApiResponse::error(&format!(
                        "file size is larger than {}MB",
                        state.config.api.upload_limit.as_mib()
                    ))
                    .with_status(StatusCode::EXPECTATION_FAILED)
                    .ok();
                }

                writer.write_all(&chunk).await?;
                written_size += chunk.len() as u64;
            }

            writer.shutdown().await?;
        }

        ApiResponse::new_serialized(Response {}).ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(post::route).layer(DefaultBodyLimit::disable()))
        .with_state(state.clone())
}
