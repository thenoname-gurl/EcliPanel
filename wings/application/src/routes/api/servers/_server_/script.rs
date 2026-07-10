use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod post {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{GetState, api::servers::_server_::GetServer},
        server::installation::InstallationScript,
    };
    use axum::http::StatusCode;

    #[utoipa::path(post, path = "/", responses(
        (status = OK, body = String),
    ), params(
        (
            "server" = uuid::Uuid,
            description = "The server uuid",
            example = "123e4567-e89b-12d3-a456-426614174000",
        ),
    ), request_body = InstallationScript)]
    pub async fn route(
        state: GetState,
        server: GetServer,
        crate::Payload(data): crate::Payload<InstallationScript>,
    ) -> ApiResponseResult {
        match crate::server::script::script_server(&server, &state.executor, data).await {
            Ok(stdout_stream) => ApiResponse::new_stream(stdout_stream)
                .with_header("Content-Type", "text/plain")
                .ok(),
            Err(err) => {
                tracing::error!(
                    server = %server.uuid,
                    "failed to run server script: {:#?}",
                    err
                );

                ApiResponse::error("failed to run server script")
                    .with_status(StatusCode::INTERNAL_SERVER_ERROR)
                    .ok()
            }
        }
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(post::route))
        .with_state(state.clone())
}
