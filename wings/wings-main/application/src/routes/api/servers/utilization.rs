use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod get {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{ApiError, GetState},
    };
    use std::collections::HashMap;

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = HashMap<uuid::Uuid, crate::server::resources::ResourceUsage>),
        (status = NOT_FOUND, body = ApiError),
    ))]
    pub async fn route(state: GetState) -> ApiResponseResult {
        let mut utilization = HashMap::new();

        for server in state.server_manager.get_servers().await.iter() {
            utilization.insert(server.uuid, server.resource_usage().await);
        }

        ApiResponse::new_serialized(utilization).ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(get::route))
        .with_state(state.clone())
}
