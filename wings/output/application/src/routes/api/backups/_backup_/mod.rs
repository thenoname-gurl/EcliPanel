use super::State;
use utoipa_axum::{router::OpenApiRouter, routes};

mod export;
mod query;

mod delete {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{ApiError, GetState},
        server::backup::adapters::BackupAdapter,
    };
    use axum::{extract::Path, http::StatusCode};
    use compact_str::ToCompactString;
    use serde::{Deserialize, Serialize};
    use utoipa::ToSchema;

    #[derive(ToSchema, Deserialize)]
    pub struct Payload {
        adapter: BackupAdapter,
        #[serde(default)]
        foreground: bool,
        #[serde(default)]
        server: Option<uuid::Uuid>,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {}

    #[utoipa::path(delete, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = ACCEPTED, body = inline(Response)),
        (status = NOT_FOUND, body = ApiError),
    ), params(
        (
            "backup" = uuid::Uuid,
            description = "The backup uuid",
            example = "123e4567-e89b-12d3-a456-426614174000",
        ),
    ), request_body = inline(Payload))]
    pub async fn route(
        state: GetState,
        Path(backup_id): Path<uuid::Uuid>,
        crate::Payload(data): crate::Payload<Payload>,
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

        if data.foreground {
            backup.delete(&state).await?;

            return ApiResponse::new_serialized(Response {}).ok();
        }

        tokio::spawn(async move {
            let successful = match backup.delete(&state).await {
                Ok(()) => true,
                Err(err) => {
                    tracing::error!(
                        backup = %backup.uuid(),
                        adapter = ?backup.adapter(),
                        "failed to delete backup: {:#?}",
                        err
                    );

                    false
                }
            };

            if let Err(err) = state
                .config
                .client
                .set_backup_deletion_status(backup.uuid(), successful)
                .await
            {
                tracing::error!(
                    backup = %backup.uuid(),
                    "failed to set backup deletion status: {:#?}",
                    err
                );
            }

            if let Some(server) = data.server
                && let Some(server) = state.server_manager.get_server(server).await
            {
                server
                    .websocket
                    .send(
                        crate::server::websocket::WebsocketMessage::builder(
                            crate::server::websocket::WebsocketEvent::ServerBackupDeleted,
                        )
                        .arg(backup.uuid().to_compact_string())
                        .structured_arg(serde_json::json!({
                            "successful": successful,
                        }))
                        .build(),
                    )
                    .ok();
            }
        });

        ApiResponse::new_serialized(Response {})
            .with_status(StatusCode::ACCEPTED)
            .ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .nest("/export", export::router(state))
        .nest("/query", query::router(state))
        .routes(routes!(delete::route))
        .with_state(state.clone())
}
