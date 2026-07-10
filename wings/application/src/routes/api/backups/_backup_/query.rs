use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod get {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{ApiError, GetState},
        server::backup::{BackupDownloadInfo, adapters::BackupAdapter},
    };
    use axum::{
        extract::{Path, Query},
        http::StatusCode,
    };
    use serde::Deserialize;
    use utoipa::ToSchema;

    #[derive(ToSchema, Deserialize)]
    pub struct Params {
        adapter: BackupAdapter,
    }

    #[utoipa::path(get, path = "/", params(
        (
            "backup" = uuid::Uuid,
            description = "The backup uuid",
            example = "123e4567-e89b-12d3-a456-426614174000",
        ),
        (
            "adapter" = BackupAdapter, Query,
            description = "The backup adapter to use",
        ),
    ), responses(
        (status = OK, body = inline(BackupDownloadInfo)),
        (status = NOT_FOUND, body = ApiError),
    ))]
    pub async fn route(
        state: GetState,
        Path(backup_id): Path<uuid::Uuid>,
        Query(data): Query<Params>,
    ) -> ApiResponseResult {
        let backup = match state
            .backup_manager
            .find_adapter(&state, data.adapter, backup_id)
            .await?
        {
            Some(backup) => backup,
            None => {
                return ApiResponse::error("backup not found")
                    .with_status(StatusCode::NOT_FOUND)
                    .ok();
            }
        };

        ApiResponse::new_serialized(backup.download_info().await?).ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(get::route))
        .with_state(state.clone())
}
