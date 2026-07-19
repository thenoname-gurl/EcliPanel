use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod get {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{ApiError, GetState},
    };
    use axum::http::StatusCode;
    use axum_extra::extract::Query;
    use compact_str::ToCompactString;
    use serde::{Deserialize, Serialize};
    use std::collections::HashMap;
    use utoipa::ToSchema;

    #[derive(ToSchema, Deserialize)]
    pub struct Params {
        #[serde(default)]
        #[schema(value_type = Vec<String>)]
        ip: Vec<std::net::IpAddr>,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        used: HashMap<compact_str::CompactString, Vec<crate::server::executor::UsedPort>>,
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = BAD_REQUEST, body = inline(ApiError)),
    ), params(
        (
            "ip" = Vec<String>, Query,
            description = "The allocation ips to check, repeated once per ip",
            example = "127.0.0.1",
        ),
    ))]
    pub async fn route(state: GetState, Query(params): Query<Params>) -> ApiResponseResult {
        if params.ip.is_empty() {
            return ApiResponse::error("at least one ip is required")
                .with_status(StatusCode::BAD_REQUEST)
                .ok();
        }

        ApiResponse::new_serialized(Response {
            used: state
                .executor
                .used_ports(&params.ip)
                .await?
                .into_iter()
                .map(|(ip, ports)| (ip.to_compact_string(), ports))
                .collect(),
        })
        .ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(get::route))
        .with_state(state.clone())
}
