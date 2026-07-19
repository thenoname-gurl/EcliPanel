pub mod get {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{GetState, api::servers::_server_::GetServer},
    };
    use serde::Serialize;
    use utoipa::ToSchema;

    #[derive(ToSchema, Serialize)]
    struct ProcessInfo {
        pid: String,
        user: String,
        cpu_percent: String,
        mem_percent: String,
        command: String,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        processes: Vec<ProcessInfo>,
        total: usize,
    }

    #[utoipa::path(get, path = "/processes", responses(
        (status = OK, body = inline(Response)),
    ), params(
        (
            "server" = uuid::Uuid,
            description = "The server uuid",
            example = "123e4567-e89b-12d3-a456-426614174000",
        ),
    ))]
    pub async fn route(state: GetState, server: GetServer) -> ApiResponseResult {
        let server_uuid = server.uuid.to_string();

        // Find container by searching for the server UUID in container names
        let mut container_id: Option<String> = None;
        if let Ok(containers) = state
            .docker
            .list_containers(None)
            .await
        {
            for c in &containers {
                if let Some(names) = &c.names {
                    for name in names {
                        if name.contains(&server_uuid) || name.contains(&server_uuid.replace('-', "")) {
                            container_id = c.id.clone();
                            break;
                        }
                    }
                }
                if container_id.is_some() {
                    break;
                }
            }
        }

        let container_id = match container_id {
            Some(id) => id,
            None => {
                return ApiResponse::new_serialized(Response {
                    processes: vec![],
                    total: 0,
                })
                .ok();
            }
        };

        // Call bollard's top_processes
        let top = match state
            .docker
            .top_processes(&container_id, None)
            .await
        {
            Ok(top) => top,
            Err(e) => {
                return ApiResponse::error(&format!("failed to list processes: {}", e))
                    .with_status(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
                    .ok();
            }
        };

        let processes: Vec<ProcessInfo> = top
            .processes
            .unwrap_or_default()
            .into_iter()
            .map(|p| ProcessInfo {
                pid: p.get(0).cloned().unwrap_or_default(),
                user: p.get(1).cloned().unwrap_or_default(),
                cpu_percent: p.get(2).cloned().unwrap_or_default(),
                mem_percent: p.get(3).cloned().unwrap_or_default(),
                command: p.get(4).unwrap_or(&p.get(3).cloned().unwrap_or_default()).clone(),
            })
            .collect();

        let total = processes.len();

        ApiResponse::new_serialized(Response { processes, total }).ok()
    }
}
