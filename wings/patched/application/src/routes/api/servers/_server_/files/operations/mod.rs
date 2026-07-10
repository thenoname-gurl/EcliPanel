use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod _operation_;

mod get {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::api::servers::_server_::GetServer,
    };
    use serde::Serialize;
    use utoipa::ToSchema;

    #[derive(ToSchema, Serialize)]
    struct Response<'a> {
        operations: Vec<&'a crate::server::filesystem::operations::FilesystemOperation>,
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
    ), params(
        (
            "server" = uuid::Uuid,
            description = "The server uuid",
            example = "123e4567-e89b-12d3-a456-426614174000",
        ),
    ))]
    pub async fn route(server: GetServer) -> ApiResponseResult {
        let values = server.filesystem.operations.operations().await;
        let mut operations = Vec::new();
        operations.reserve_exact(values.len());

        for operation in values.values() {
            operations.push(&operation.filesystem_operation);
        }

        ApiResponse::new_serialized(Response { operations }).ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .nest("/{operation}", _operation_::router(state))
        .routes(routes!(get::route))
        .with_state(state.clone())
}
