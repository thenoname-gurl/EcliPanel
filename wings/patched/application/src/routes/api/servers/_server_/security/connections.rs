pub mod get {
    use crate::{
        response::{ApiResponse, ApiResponseResult},
        routes::{GetState, api::servers::_server_::GetServer},
    };
    use serde::Serialize;
    use std::collections::HashMap;
    use utoipa::ToSchema;

    #[derive(ToSchema, Serialize)]
    struct PortBinding {
        host_ip: String,
        host_port: String,
    }

    #[derive(ToSchema, Serialize)]
    struct AllocationInfo {
        default: bool,
        ip: String,
        port: u16,
        alias: Option<String>,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        ports: HashMap<String, Option<Vec<PortBinding>>>,
        ip_address: Option<String>,
        gateway: Option<String>,
        mac_address: Option<String>,
        allocations: Vec<AllocationInfo>,
        container_id: Option<String>,
    }

    #[utoipa::path(get, path = "/connections", responses(
        (status = OK, body = inline(Response)),
    ), params(
        (
            "server" = uuid::Uuid,
            description = "The server uuid",
            example = "123e4567-e89b-12d3-a456-426614174000",
        ),
    ))]
    pub async fn route(state: GetState, server: GetServer) -> ApiResponseResult {
        let config = server.configuration.read().await;

        // Build allocations list from config
        let mut allocations: Vec<AllocationInfo> = Vec::new();
        for (ip, ports) in &config.allocations.mappings {
            for &port in ports {
                allocations.push(AllocationInfo {
                    default: config
                        .allocations
                        .default
                        .as_ref()
                        .is_some_and(|d| d.ip == *ip && d.port == port),
                    ip: ip.to_string(),
                    port,
                    alias: None,
                });
            }
        }

        let server_uuid = server.uuid.to_string();
        let mut container_id: Option<String> = None;
        let mut ports: HashMap<String, Option<Vec<PortBinding>>> = HashMap::new();
        let mut ip_address: Option<String> = None;
        let mut gateway: Option<String> = None;
        let mut mac_address: Option<String> = None;

        // Find container by name (server UUID)
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

        // Get Docker network info
        if let Some(ref cid) = container_id {
            if let Ok(inspect) = state.docker.inspect_container(cid, None).await {
                if let Some(network_settings) = inspect.network_settings {
                    if let Some(docker_ports) = network_settings.ports {
                        ports = docker_ports
                            .into_iter()
                            .map(|(container_port, bindings)| {
                                let mapped: Option<Vec<PortBinding>> = bindings.map(|b| {
                                    b.into_iter()
                                        .map(|pb| PortBinding {
                                            host_ip: pb.host_ip.unwrap_or_else(|| "0.0.0.0".to_string()),
                                            host_port: pb.host_port.unwrap_or_default(),
                                        })
                                        .collect()
                                });
                                (container_port, mapped)
                            })
                            .collect();
                    }

                    if let Some(networks) = network_settings.networks {
                        for (_name, net) in networks.iter() {
                            ip_address = net.ip_address.clone();
                            gateway = net.gateway.clone();
                            mac_address = net.mac_address.clone();
                            break;
                        }
                    }
                }
            }
        }

        ApiResponse::new_serialized(Response {
            ports,
            ip_address,
            gateway,
            mac_address,
            allocations,
            container_id,
        })
        .ok()
    }
}
