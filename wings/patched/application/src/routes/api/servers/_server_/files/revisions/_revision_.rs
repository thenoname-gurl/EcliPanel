use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod get {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{ApiError, api::servers::_server_::GetServer},
    };
    use axum::{extract::Path, http::StatusCode};

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = String),
        (status = NOT_FOUND, body = ApiError),
    ), params(
        (
            "server" = uuid::Uuid,
            description = "The server uuid",
            example = "123e4567-e89b-12d3-a456-426614174000",
        ),
        (
            "revision" = i64,
            description = "The revision id",
            example = "1",
        ),
    ))]
    pub async fn route(
        server: GetServer,
        Path((_server, revision_id)): Path<(uuid::Uuid, i64)>,
    ) -> ApiResponseResult {
        let Some(contents) = server.diff.get_content(revision_id).await? else {
            return ApiResponse::error("revision not found")
                .with_status(StatusCode::NOT_FOUND)
                .ok();
        };

        ApiResponse::new(axum::body::Body::from(contents)).ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(get::route))
        .with_state(state.clone())
}
