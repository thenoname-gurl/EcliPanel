use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod _file_;

mod get {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::GetState,
        server::filesystem::archive::ArchiveFormat,
    };
    use serde::Serialize;
    use std::str::FromStr;
    use utoipa::ToSchema;

    #[derive(ToSchema, Serialize)]
    struct ResponseLogFile {
        name: compact_str::CompactString,
        compression_type: crate::io::compression::CompressionType,
        size: u64,
        last_modified: chrono::DateTime<chrono::Utc>,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        #[schema(inline)]
        log_files: Vec<ResponseLogFile>,
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
    ))]
    pub async fn route(state: GetState) -> ApiResponseResult {
        let mut log_files = Vec::new();

        let mut directory = tokio::fs::read_dir(&state.config.load().system.log_directory).await?;
        while let Ok(Some(entry)) = directory.next_entry().await {
            let metadata = match entry.metadata().await {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };

            if !metadata.is_file() {
                continue;
            }

            log_files.push(ResponseLogFile {
                name: entry.file_name().to_string_lossy().into(),
                compression_type: ArchiveFormat::from_str(&entry.file_name().to_string_lossy())
                    .map(|format| format.compression_format())
                    .unwrap_or_default(),
                size: metadata.len(),
                last_modified: chrono::DateTime::from_timestamp(
                    metadata
                        .modified()
                        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default())
                        .unwrap_or_default()
                        .as_secs() as i64,
                    0,
                )
                .unwrap_or_default(),
            });
        }

        log_files.sort_by_key(|l1| l1.last_modified);

        ApiResponse::new_serialized(Response { log_files }).ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(get::route))
        .nest("/{file}", _file_::router(state))
        .with_state(state.clone())
}
