use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod post {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{ApiError, api::servers::_server_::GetServer},
        utils::PortableModeExt,
    };
    use cap_std::fs::Permissions;
    use serde::{Deserialize, Serialize};
    use std::path::Path;
    use utoipa::ToSchema;

    #[derive(ToSchema, Deserialize)]
    pub struct ChmodFile {
        file: compact_str::CompactString,
        mode: compact_str::CompactString,
    }

    #[derive(ToSchema, Deserialize)]
    pub struct Payload {
        #[serde(default)]
        root: compact_str::CompactString,

        #[schema(inline)]
        files: Vec<ChmodFile>,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        updated: usize,
    }

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
    ), request_body = inline(Payload))]
    pub async fn route(
        server: GetServer,
        crate::Payload(data): crate::Payload<Payload>,
    ) -> ApiResponseResult {
        let mut updated_count = 0;
        for file in data.files {
            let (source, filesystem) = server
                .filesystem
                .resolve_writable_fs(&server, Path::new(&data.root).join(&file.file))
                .await;
            if source == Path::new(&data.root) {
                continue;
            }

            let metadata = match filesystem.async_symlink_metadata(&source).await {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };

            if filesystem.is_primary_server_fs()
                && server
                    .filesystem
                    .is_ignored(&source, metadata.file_type.is_dir())
                    .await
            {
                continue;
            }

            let mode = match u32::from_str_radix(&file.mode, 8) {
                Ok(mode) => mode,
                Err(_) => continue,
            };

            if filesystem
                .async_set_permissions(&source, Permissions::from_portable_mode(mode))
                .await
                .is_ok()
            {
                updated_count += 1;
            }
        }

        ApiResponse::new_serialized(Response {
            updated: updated_count,
        })
        .ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(post::route))
        .with_state(state.clone())
}
