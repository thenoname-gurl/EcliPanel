use super::{ResticBackupConfiguration, ResticTaskResult, State};
use tokio::sync::RwLock;
use utoipa_axum::{router::OpenApiRouter, routes};

static RESTIC_STATS_CACHE: RwLock<Option<ResticTaskResult>> = RwLock::const_new(None);
static RESTIC_STATS_RUNNING: RwLock<bool> = RwLock::const_new(false);

mod get {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::ApiError,
    };
    use axum::http::StatusCode;
    use serde::Serialize;
    use utoipa::ToSchema;

    #[derive(ToSchema, Serialize)]
    struct Response<'a> {
        result: &'a super::ResticTaskResult,
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = NOT_FOUND, body = ApiError),
    ))]
    pub async fn route() -> ApiResponseResult {
        let cache = super::RESTIC_STATS_CACHE.read().await;
        match &*cache {
            Some(result) => ApiResponse::new_serialized(Response { result }).ok(),
            None => ApiResponse::error("no restic stats result available yet")
                .with_status(StatusCode::NOT_FOUND)
                .ok(),
        }
    }
}

mod post {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{
            ApiError, GetState,
            api::system::restic::{
                build_restic_command, execute_restic_command, system_restic_configuration,
            },
        },
    };
    use axum::http::StatusCode;
    use serde::{Deserialize, Serialize};
    use std::sync::Arc;
    use utoipa::ToSchema;

    #[derive(ToSchema, Deserialize)]
    pub struct Payload {
        #[serde(default)]
        configuration: Option<super::ResticBackupConfiguration>,
        #[serde(default)]
        mode: Option<compact_str::CompactString>,
        #[serde(default)]
        foreground: bool,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        result: super::ResticTaskResult,
    }

    #[derive(ToSchema, Serialize)]
    struct ResponseAccepted {}

    #[utoipa::path(post, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = ACCEPTED, body = inline(ResponseAccepted)),
        (status = CONFLICT, body = ApiError),
    ), request_body = inline(Payload))]
    pub async fn route(
        state: GetState,
        crate::Payload(data): crate::Payload<Payload>,
    ) -> ApiResponseResult {
        {
            let mut running = super::RESTIC_STATS_RUNNING.write().await;
            if *running {
                return ApiResponse::error("restic stats task is already running")
                    .with_status(StatusCode::CONFLICT)
                    .ok();
            }

            *running = true;
        }

        let configuration = Arc::new(
            data.configuration
                .unwrap_or_else(|| (*system_restic_configuration(&state.config)).clone()),
        );

        let build = move || {
            let mut command = build_restic_command(&state.config, &configuration);
            command
                .arg("stats")
                .arg("--mode")
                .arg(data.mode.as_deref().unwrap_or("restore-size"));

            command
        };

        if data.foreground {
            let command = build();
            let result = execute_restic_command(command, "stats").await;

            *super::RESTIC_STATS_CACHE.write().await = Some(result.clone());
            *super::RESTIC_STATS_RUNNING.write().await = false;

            ApiResponse::new_serialized(Response { result }).ok()
        } else {
            tokio::spawn(async move {
                let command = build();
                let result = execute_restic_command(command, "stats").await;

                *super::RESTIC_STATS_CACHE.write().await = Some(result);
                *super::RESTIC_STATS_RUNNING.write().await = false;
            });

            ApiResponse::new_serialized(ResponseAccepted {})
                .with_status(StatusCode::ACCEPTED)
                .ok()
        }
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(get::route))
        .routes(routes!(post::route))
        .with_state(state.clone())
}
