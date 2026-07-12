use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod get {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{ApiError, api::servers::_server_::GetServer},
    };
    use axum::{extract::Query, http::StatusCode};
    use serde::Deserialize;
    use utoipa::ToSchema;

    #[derive(ToSchema, Deserialize)]
    pub struct Params {
        lines: Option<usize>,
    }

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
            "lines" = Option<usize>, Query,
            description = "The number of lines to tail from the log",
            example = "100",
        ),
    ))]
    pub async fn route(server: GetServer, Query(params): Query<Params>) -> ApiResponseResult {
        let mut log_file =
            match crate::server::installation::ServerInstaller::get_install_logs(&server).await {
                Ok(file) => file,
                Err(_) => {
                    return ApiResponse::error("unable to find installation log file")
                        .with_status(StatusCode::NOT_FOUND)
                        .ok();
                }
            };

        if let Some(lines) = params.lines {
            log_file = crate::io::tail::async_tail(log_file, lines).await?;
        }

        ApiResponse::new_stream(log_file)
            .with_header("Content-Type", "text/plain")
            .ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(get::route))
        .with_state(state.clone())
}
