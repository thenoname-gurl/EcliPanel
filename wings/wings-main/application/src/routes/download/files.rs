use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod get {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::GetState,
        server::filesystem::archive::StreamableArchiveFormat,
    };
    use axum::{
        extract::Query,
        http::{HeaderMap, StatusCode},
    };
    use serde::Deserialize;
    use std::path::{Path, PathBuf};
    use utoipa::ToSchema;

    #[derive(ToSchema, Deserialize)]
    pub struct Params {
        token: String,

        #[serde(default)]
        archive_format: StreamableArchiveFormat,
    }

    #[derive(Deserialize)]
    pub struct FilesJwtPayload {
        #[serde(flatten)]
        pub base: crate::remote::jwt::BasePayload,

        pub file_path: compact_str::CompactString,
        pub file_paths: Vec<compact_str::CompactString>,
        pub server_uuid: uuid::Uuid,
        pub unique_id: compact_str::CompactString,
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = String),
        (status = UNAUTHORIZED, body = String),
        (status = NOT_FOUND, body = String),
        (status = EXPECTATION_FAILED, body = String),
    ), params(
        (
            "token" = String, Query,
            description = "The JWT token to use for authentication",
        ),
    ))]
    pub async fn route(state: GetState, Query(data): Query<Params>) -> ApiResponseResult {
        let payload: FilesJwtPayload = match state.config.jwt.verify(&data.token) {
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

        let (path, filesystem) = server
            .filesystem
            .resolve_readable_fs(&server, Path::new(&payload.file_path))
            .await;

        let mut folder_ascii = String::new();
        for (i, file_path) in payload.file_paths.iter().enumerate() {
            let file_name = Path::new(file_path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            for c in file_name.chars() {
                if c.is_ascii() {
                    folder_ascii.push(c);
                } else {
                    folder_ascii.push('_');
                }
            }

            if i < payload.file_paths.len() - 1 {
                folder_ascii.push('_');
            }
        }

        folder_ascii.push('.');
        folder_ascii.push_str(data.archive_format.extension());

        let mut headers = HeaderMap::new();
        headers.insert(
            "Content-Disposition",
            format!(
                "attachment; filename={}",
                serde_json::Value::String(folder_ascii)
            )
            .parse()?,
        );
        headers.insert("Content-Type", data.archive_format.mime_type().parse()?);

        let metadata = filesystem.async_symlink_metadata(&path).await;
        if let Ok(metadata) = metadata {
            if !metadata.file_type.is_dir()
                || (filesystem.is_primary_server_fs()
                    && server.filesystem.is_ignored(&path, true).await)
            {
                return ApiResponse::error("directory not found")
                    .with_status(StatusCode::NOT_FOUND)
                    .ok();
            }
        } else {
            return ApiResponse::error("directory not found")
                .with_status(StatusCode::NOT_FOUND)
                .ok();
        }

        let ignore = if filesystem.is_primary_server_fs() {
            server.filesystem.get_ignored().await.into()
        } else {
            Default::default()
        };
        let reader = filesystem
            .async_read_dir_files_archive(
                &path,
                payload.file_paths.into_iter().map(PathBuf::from).collect(),
                data.archive_format,
                state.config.system.backups.compression_level,
                None,
                ignore,
            )
            .await?;

        ApiResponse::new_stream(reader).with_headers(headers).ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(get::route))
        .with_state(state.clone())
}
