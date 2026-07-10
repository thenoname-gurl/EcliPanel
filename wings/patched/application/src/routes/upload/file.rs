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
    use compact_str::ToCompactString;
    use serde::{Deserialize, Serialize};
    use serde_json::json;
    use std::{net::SocketAddr, path::PathBuf};
    use tokio::io::AsyncWriteExt;
    use utoipa::ToSchema;

    #[derive(ToSchema, Deserialize)]
    #[serde(untagged)]
    pub enum Params {
        Continue {
            continuation_token: String,
            wants_continue: Option<compact_str::CompactString>,
        },
        Upload {
            token: String,
            #[serde(default)]
            directory: compact_str::CompactString,
            wants_continue: Option<compact_str::CompactString>,
        },
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        continuation_token: Option<String>,
    }

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

    #[derive(Deserialize, Serialize)]
    pub struct FileContinueJwtPayload {
        #[serde(flatten)]
        pub base: crate::remote::jwt::BasePayload,

        pub server_uuid: uuid::Uuid,
        pub user_ip: Option<std::net::IpAddr>,
        pub unique_id: compact_str::CompactString,
        pub file_path: PathBuf,
        pub written_size: u64,
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
        (
            "continuation_token" = Option<String>, Query,
            description = "Continuation token from a previous slice; presence selects the continuation flow",
        ),
        (
            "wants_continue" = Option<String>, Query,
            description = "field index that indicates the client wants a continuation token for the next slice; presence selects the continuation flow",
        ),
    ), request_body = String)]
    pub async fn route(
        state: GetState,
        headers: HeaderMap,
        connect_info: ConnectInfo<SocketAddr>,
        Query(params): Query<Params>,
        mut multipart: Multipart,
    ) -> ApiResponseResult {
        match params {
            Params::Continue {
                continuation_token,
                wants_continue,
            } => {
                let payload: FileContinueJwtPayload =
                    match state.config.jwt.verify(&continuation_token) {
                        Ok(payload) => payload,
                        Err(_) => {
                            return ApiResponse::error("invalid token")
                                .with_status(StatusCode::UNAUTHORIZED)
                                .ok();
                        }
                    };

                if let Err(err) = payload
                    .base
                    .validate(&state.config.jwt, Some("file-upload"))
                {
                    return ApiResponse::error(&format!("invalid token: {err}"))
                        .with_status(StatusCode::UNAUTHORIZED)
                        .ok();
                }

                if !state.config.jwt.limited_jwt_id(&payload.unique_id) {
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

                let parent = match payload.file_path.parent() {
                    Some(parent) => parent,
                    None => {
                        return ApiResponse::error("file has no parent")
                            .with_status(StatusCode::EXPECTATION_FAILED)
                            .ok();
                    }
                };
                let file_name = match payload.file_path.file_name() {
                    Some(name) => name,
                    None => {
                        return ApiResponse::error("invalid file name")
                            .with_status(StatusCode::EXPECTATION_FAILED)
                            .ok();
                    }
                };

                let wants_continue = wants_continue.and_then(|s| s.parse::<usize>().ok());

                let (root, filesystem) = server
                    .filesystem
                    .resolve_writable_fs(&server, &parent)
                    .await;
                let path = root.join(file_name);

                if filesystem.is_primary_server_fs() && server.filesystem.is_ignored(&path, false) {
                    return ApiResponse::error("file not found")
                        .with_status(StatusCode::NOT_FOUND)
                        .ok();
                }

                let mut options = cap_std::fs::OpenOptions::new();
                options.write(true).append(true).create(true);
                let mut file = filesystem
                    .async_open_file_with_options(&path, options)
                    .await?;

                let user_ip = Some(state.config.find_ip(&headers, connect_info));
                if user_ip != payload.user_ip {
                    return ApiResponse::error("IP address mismatch")
                        .with_status(StatusCode::UNAUTHORIZED)
                        .ok();
                }

                let mut written_size = payload.written_size;
                let mut continuation_token = None;

                if let Some(mut field) = multipart.next_field().await? {
                    while let Some(chunk) = field.chunk().await? {
                        let config = state.config.load();
                        if crate::unlikely(
                            config.api.upload_limit.as_bytes() != 0
                                && written_size + chunk.len() as u64
                                    > config.api.upload_limit.as_bytes(),
                        ) {
                            return ApiResponse::error(&format!(
                                "file size is larger than {}MiB",
                                config.api.upload_limit.as_mib()
                            ))
                            .with_status(StatusCode::EXPECTATION_FAILED)
                            .ok();
                        }
                        drop(config);

                        file.write_all(&chunk).await?;
                        written_size += chunk.len() as u64;
                    }

                    file.shutdown().await?;

                    if wants_continue == Some(0) {
                        continuation_token =
                            Some(state.config.jwt.create(&FileContinueJwtPayload {
                                base: crate::remote::jwt::BasePayload {
                                    scope: "file-upload".into(),
                                    issuer: "wings".into(),
                                    subject: None,
                                    audience: Vec::new(),
                                    expiration_time: Some(chrono::Utc::now().timestamp() + 5),
                                    not_before: None,
                                    issued_at: Some(chrono::Utc::now().timestamp()),
                                    jwt_id: payload.base.jwt_id,
                                },
                                server_uuid: payload.server_uuid,
                                user_ip,
                                unique_id: uuid::Uuid::new_v4().to_compact_string(),
                                file_path: payload.file_path,
                                written_size,
                            })?);
                    }
                } else {
                    file.shutdown().await?;
                }

                ApiResponse::new_serialized(Response { continuation_token }).ok()
            }
            Params::Upload {
                token,
                directory,
                wants_continue,
            } => {
                let payload: FileJwtPayload = match state.config.jwt.verify(&token) {
                    Ok(payload) => payload,
                    Err(_) => {
                        return ApiResponse::error("invalid token")
                            .with_status(StatusCode::UNAUTHORIZED)
                            .ok();
                    }
                };

                if let Err(err) = payload
                    .base
                    .validate(&state.config.jwt, Some("file-upload"))
                {
                    return ApiResponse::error(&format!("invalid token: {err}"))
                        .with_status(StatusCode::UNAUTHORIZED)
                        .ok();
                }

                if !state.config.jwt.limited_jwt_id(&payload.unique_id) {
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

                let directory = PathBuf::from(directory);
                let wants_continue = wants_continue.and_then(|s| s.parse::<usize>().ok());

                let metadata = server.filesystem.async_metadata(&directory).await;
                if !metadata.map(|m| m.is_dir()).unwrap_or(true) {
                    return ApiResponse::error("directory is not a directory")
                        .with_status(StatusCode::EXPECTATION_FAILED)
                        .ok();
                }

                let user_ip = Some(state.config.find_ip(&headers, connect_info));
                let mut continuation_token = None;
                let mut field_index = 0;

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
                        || server.filesystem.is_ignored(parent, false)
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
                            || server.filesystem.is_ignored(&path, false))
                    {
                        return ApiResponse::error("file not found")
                            .with_status(StatusCode::NOT_FOUND)
                            .ok();
                    }

                    filesystem.async_create_dir_all(&root).await?;

                    let mut written_size = 0;
                    let mut writer = filesystem.async_create_file(&path).await?;

                    server.activity.log_activity(Activity {
                        event: ActivityEvent::FileUploaded,
                        user: Some(payload.user_uuid),
                        ip: user_ip,
                        metadata: Some(json!({
                            "files": [filename],
                            "directory": server.filesystem.relative_path(&directory),
                        })),
                        schedule: None,
                        timestamp: chrono::Utc::now(),
                    });

                    while let Some(chunk) = field.chunk().await? {
                        let config = state.config.load();
                        if crate::unlikely(
                            config.api.upload_limit.as_bytes() != 0
                                && written_size + chunk.len() as u64
                                    > config.api.upload_limit.as_bytes(),
                        ) {
                            return ApiResponse::error(&format!(
                                "file size is larger than {}MiB",
                                config.api.upload_limit.as_mib()
                            ))
                            .with_status(StatusCode::EXPECTATION_FAILED)
                            .ok();
                        }
                        drop(config);

                        writer.write_all(&chunk).await?;
                        written_size += chunk.len() as u64;
                    }

                    writer.shutdown().await?;

                    if wants_continue == Some(field_index) {
                        continuation_token =
                            Some(state.config.jwt.create(&FileContinueJwtPayload {
                                base: crate::remote::jwt::BasePayload {
                                    scope: "file-upload".into(),
                                    issuer: "wings".into(),
                                    subject: None,
                                    audience: Vec::new(),
                                    expiration_time: Some(chrono::Utc::now().timestamp() + 5),
                                    not_before: None,
                                    issued_at: Some(chrono::Utc::now().timestamp()),
                                    jwt_id: payload.user_uuid.to_compact_string(),
                                },
                                server_uuid: payload.server_uuid,
                                user_ip,
                                unique_id: uuid::Uuid::new_v4().to_compact_string(),
                                file_path: path.clone(),
                                written_size,
                            })?);
                    }

                    field_index += 1;
                }

                ApiResponse::new_serialized(Response { continuation_token }).ok()
            }
        }
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(post::route).layer(DefaultBodyLimit::disable()))
        .with_state(state.clone())
}
