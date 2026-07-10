use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod post {
    use crate::{
        config::InnerConfig,
        response::{ApiResponse, ApiResponseResult},
        routes::GetState,
    };
    use serde::Serialize;
    use utoipa::ToSchema;

    #[derive(ToSchema, Serialize)]
    struct Response {
        applied: bool,
    }

    #[utoipa::path(post, path = "/", responses(
        (status = OK, body = inline(Response)),
    ), request_body = serde_json::Value)]
    pub async fn route(
        state: GetState,
        crate::Payload(mut patch): crate::Payload<serde_json::Value>,
    ) -> ApiResponseResult {
        if state.config.load().ignore_panel_config_updates {
            return ApiResponse::new_serialized(Response { applied: false }).ok();
        }

        if !patch.is_object() {
            return ApiResponse::error("config patch must be a JSON object")
                .with_status(axum::http::StatusCode::BAD_REQUEST)
                .ok();
        }

        crate::utils::strip_paths(&mut patch, crate::config::FORBIDDEN_PATHS);

        let mut doc = match serde_json::to_value(&**state.config.load()) {
            Ok(doc) => doc,
            Err(err) => {
                tracing::error!("failed to serialize current config: {err}");
                return ApiResponse::error("failed to read current config")
                    .with_status(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
                    .ok();
            }
        };

        json_patch::merge(&mut doc, &patch);

        let new_config: InnerConfig = match serde_json::from_value(doc) {
            Ok(c) => c,
            Err(err) => {
                return ApiResponse::error(&format!("invalid config patch: {err}"))
                    .with_status(axum::http::StatusCode::BAD_REQUEST)
                    .ok();
            }
        };

        if let Err(err) = state.config.replace(new_config) {
            return ApiResponse::error(&format!("failed to apply config patch: {err}"))
                .with_status(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
                .ok();
        }

        ApiResponse::new_serialized(Response { applied: true }).ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(post::route))
        .with_state(state.clone())
}
