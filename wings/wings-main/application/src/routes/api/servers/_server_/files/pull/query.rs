use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod post {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{ApiError, GetState},
        server::filesystem::pull::PullQueryResponse,
    };
    use axum::http::StatusCode;
    use serde::Deserialize;
    use utoipa::ToSchema;

    #[derive(ToSchema, Deserialize)]
    pub struct Payload {
        url: compact_str::CompactString,
    }

    #[utoipa::path(post, path = "/", responses(
        (status = OK, body = inline(PullQueryResponse)),
        (status = EXPECTATION_FAILED, body = ApiError),
    ), params(
        (
            "server" = uuid::Uuid,
            description = "The server uuid",
            example = "123e4567-e89b-12d3-a456-426614174000",
        ),
    ), request_body = inline(Payload))]
    pub async fn route(
        state: GetState,
        crate::Payload(data): crate::Payload<Payload>,
    ) -> ApiResponseResult {
        let query_result = match PullQueryResponse::query(&state.config, &data.url).await {
            Ok(query_result) => query_result,
            Err(err) => {
                tracing::warn!("failed to query pull URL: {:?}", err);

                return ApiResponse::error(&format!("failed to query pull URL: {}", err))
                    .with_status(StatusCode::EXPECTATION_FAILED)
                    .ok();
            }
        };

        ApiResponse::new_serialized(query_result).ok()
    }
}

#[allow(deprecated)]
pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(post::route))
        .with_state(state.clone())
}
