use crate::{
    io::{SafeSliceExt, line_buffer::LineBuffer},
    server::resources::ResourceUsageWatchExt,
};
use bollard::errors::Error::DockerResponseServerError;
use futures::StreamExt;
use rand::distr::SampleString;
use std::{
    collections::HashMap,
    path::Path,
    pin::Pin,
    sync::{Arc, Weak},
    task::{Context, Poll},
};
use tokio::io::{AsyncWriteExt, ReadBuf};

pub mod host_mounts;

#[inline]
pub fn string_to_option(s: &str) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s.to_string())
    }
}

enum HostBinding {
    Wildcard,
    Address(std::net::IpAddr),
    Unbound,
}

impl HostBinding {
    fn resolve(network: &crate::config::DockerNetwork, ip: std::net::IpAddr) -> Self {
        if network.disable_interface_binding {
            return Self::Wildcard;
        }

        if ip == std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST) {
            if network.ispn {
                return Self::Unbound;
            }

            return match network.interface.parse::<std::net::IpAddr>() {
                Ok(interface) if interface.is_unspecified() => Self::Wildcard,
                Ok(interface) => Self::Address(interface),
                Err(_) => Self::Wildcard,
            };
        }

        if ip.is_unspecified() {
            return Self::Wildcard;
        }

        Self::Address(ip)
    }

    fn collides_with(&self, host_ip: Option<&str>) -> bool {
        let address = match self {
            Self::Unbound => return false,
            Self::Wildcard => return true,
            Self::Address(address) => address,
        };

        match host_ip.and_then(|host_ip| host_ip.parse::<std::net::IpAddr>().ok()) {
            Some(host_ip) => host_ip.is_unspecified() || host_ip == *address,
            None => true,
        }
    }
}

fn container_server(names: Option<&[String]>) -> Option<uuid::Uuid> {
    for name in names.unwrap_or_default() {
        let name = name.trim_start_matches('/');

        if let Ok(uuid) = name.parse::<uuid::Uuid>() {
            return Some(uuid);
        }

        if let Some((_, uuid)) = name.rsplit_once('.')
            && let Ok(uuid) = uuid.parse::<uuid::Uuid>()
        {
            return Some(uuid);
        }
    }

    None
}

#[async_trait::async_trait]
trait DockerServerConfigurationExt {
    async fn convert_mounts(
        &self,
        config: &crate::config::Config,
        filesystem: &crate::server::filesystem::Filesystem,
        host_mounts: Option<&host_mounts::HostMountTable>,
    ) -> Vec<bollard::plugin::Mount>;

    #[cfg(unix)]
    fn convert_devices(&self) -> Vec<bollard::models::DeviceMapping>;

    fn convert_allocations_bindings(&self) -> bollard::models::PortMap;
    fn convert_allocations_docker_bindings(
        &self,
        config: &crate::config::Config,
    ) -> bollard::models::PortMap;
    fn convert_allocations_exposed(&self) -> Vec<String>;

    async fn container_config(
        &self,
        config: &crate::config::Config,
        client: &bollard::Docker,
        filesystem: &crate::server::filesystem::Filesystem,
        host_mounts: Option<&host_mounts::HostMountTable>,
    ) -> Result<bollard::plugin::ContainerCreateBody, anyhow::Error>;
    fn container_update_config(
        &self,
        config: &crate::config::Config,
    ) -> bollard::plugin::ContainerUpdateBody;

    fn installer_resources(&self, config: &crate::config::Config) -> bollard::models::Resources;
}

#[async_trait::async_trait]
impl DockerServerConfigurationExt for crate::server::configuration::ServerConfiguration {
    async fn convert_mounts(
        &self,
        config: &crate::config::Config,
        filesystem: &crate::server::filesystem::Filesystem,
        host_mounts: Option<&host_mounts::HostMountTable>,
    ) -> Vec<bollard::models::Mount> {
        self.mounts(config, filesystem)
            .await
            .into_iter()
            .map(|mount| bollard::models::Mount {
                typ: Some(bollard::plugin::MountType::BIND),
                target: Some(mount.target.into()),
                source: Some(host_mounts::translate_source(host_mounts, &mount.source)),
                read_only: Some(mount.read_only),
                ..Default::default()
            })
            .collect()
    }

    #[cfg(unix)]
    fn convert_devices(&self) -> Vec<bollard::models::DeviceMapping> {
        let mut devices = Vec::new();

        if self.container.kvm_passthrough_enabled {
            devices.push(bollard::models::DeviceMapping {
                path_on_host: Some("/dev/kvm".into()),
                path_in_container: Some("/dev/kvm".into()),
                cgroup_permissions: Some("rwm".into()),
            });
        }

        devices
    }

    fn convert_allocations_bindings(&self) -> bollard::models::PortMap {
        let mut map = HashMap::new();

        for (ip, ports) in &self.allocations.mappings {
            for port in ports {
                let binding = bollard::models::PortBinding {
                    host_ip: Some(ip.to_string()),
                    host_port: Some(port.to_string()),
                };

                if let Some(tcp_bindings) = map
                    .entry(format!("{port}/tcp"))
                    .or_insert_with(|| Some(Vec::new()))
                {
                    tcp_bindings.push(binding.clone());
                }

                if let Some(udp_bindings) = map
                    .entry(format!("{port}/udp"))
                    .or_insert_with(|| Some(Vec::new()))
                {
                    udp_bindings.push(binding);
                }
            }
        }

        map
    }

    fn convert_allocations_docker_bindings(
        &self,
        config: &crate::config::Config,
    ) -> bollard::models::PortMap {
        let config = config.load();
        let iface = &config.docker.network.interface;
        let mut map = self.convert_allocations_bindings();

        for binds in map.values_mut().flatten() {
            let mut i = 0;
            while i < binds.len() {
                let Some(binding) = binds.get_mut(i) else {
                    break;
                };
                if config.docker.network.disable_interface_binding {
                    binding.host_ip = None;
                }

                if binding.host_ip.as_deref() == Some("127.0.0.1") {
                    if config.docker.network.ispn {
                        binds.remove(i);

                        continue;
                    } else {
                        binding.host_ip = Some(iface.clone());
                    }
                }

                i += 1;
            }
        }

        map
    }

    fn convert_allocations_exposed(&self) -> Vec<String> {
        let mut exposed = Vec::new();

        for ports in self.allocations.mappings.values() {
            for port in ports {
                exposed.push(format!("{port}/tcp"));
                exposed.push(format!("{port}/udp"));
            }
        }

        exposed
    }

    async fn container_config(
        &self,
        config: &crate::config::Config,
        client: &bollard::Docker,
        filesystem: &crate::server::filesystem::Filesystem,
        host_mounts: Option<&host_mounts::HostMountTable>,
    ) -> Result<bollard::plugin::ContainerCreateBody, anyhow::Error> {
        let mut labels = self.labels.clone();
        labels.insert("Service".into(), config.load().app_name.clone());
        labels.insert("ContainerType".into(), "server_process".into());

        let network_mode = if self.allocations.force_outgoing_ip
            && let Some(default) = &self.allocations.default
        {
            let network_name = format!("ip-{}", default.ip.replace('.', "-").replace(':', "--"));

            if client.inspect_network(&network_name, None).await.is_err()
                && let Err(err) = client
                    .create_network(bollard::plugin::NetworkCreateRequest {
                        name: network_name.to_string(),
                        driver: Some("bridge".to_string()),
                        enable_ipv6: Some(false),
                        internal: Some(false),
                        attachable: Some(false),
                        ingress: Some(false),
                        options: Some(HashMap::from([
                            ("encryption".to_string(), "false".to_string()),
                            (
                                "com.docker.network.bridge.default_bridge".to_string(),
                                "false".to_string(),
                            ),
                            (
                                "com.docker.network.host_ipv4".to_string(),
                                default.ip.to_string(),
                            ),
                        ])),
                        ..Default::default()
                    })
                    .await
            {
                tracing::error!(
                    server = %self.uuid,
                    "failed to create container network {}: {}",
                    network_name,
                    err
                );
            }

            network_name
        } else {
            config.load().docker.network.mode.clone()
        };

        let resources = self.convert_container_resources(config);

        let mut security_opt = vec!["no-new-privileges".to_string()];
        if config.load().docker.container_apply_seccomp {
            security_opt.push(
                crate::server::configuration::seccomp::Seccomp::default()
                    .remove_names(
                        &self.container.seccomp.remove_allowed,
                        crate::server::configuration::seccomp::Action::Allow,
                    )
                    .to_string()?,
            );
        }

        Ok(bollard::plugin::ContainerCreateBody {
            exposed_ports: Some(self.convert_allocations_exposed()),
            host_config: Some(bollard::plugin::HostConfig {
                memory: resources.memory,
                memory_reservation: resources.memory_reservation,
                memory_swap: resources.memory_swap,
                cpu_quota: resources.cpu_quota,
                cpu_period: resources.cpu_period,
                cpu_shares: resources.cpu_shares,
                cpuset_cpus: resources.cpuset_cpus,
                pids_limit: resources.pids_limit,
                blkio_weight: resources.blkio_weight,
                oom_kill_disable: resources.oom_kill_disable,

                port_bindings: Some(self.convert_allocations_docker_bindings(config)),
                mounts: Some(self.convert_mounts(config, filesystem, host_mounts).await),
                #[cfg(unix)]
                devices: Some(self.convert_devices()),
                network_mode: Some(network_mode),
                dns: Some(config.load().docker.network.dns.clone()),
                dns_options: Some(config.load().docker.network.dns_options.clone()),
                tmpfs: Some(HashMap::from([(
                    "/tmp".to_string(),
                    format!("rw,exec,nosuid,size={}M", config.load().docker.tmpfs_size),
                )])),
                log_config: Some(bollard::plugin::HostConfigLogConfig {
                    typ: Some(config.load().docker.log_config.r#type.clone()),
                    config: Some(
                        config
                            .load()
                            .docker
                            .log_config
                            .config
                            .iter()
                            .map(|(k, v)| (k.clone(), v.clone()))
                            .collect(),
                    ),
                }),
                security_opt: Some(security_opt),
                cap_drop: Some(vec![
                    "setpcap".to_string(),
                    "mknod".to_string(),
                    "audit_write".to_string(),
                    "net_raw".to_string(),
                    "dac_override".to_string(),
                    "fowner".to_string(),
                    "fsetid".to_string(),
                    "net_bind_service".to_string(),
                    "sys_chroot".to_string(),
                    "setfcap".to_string(),
                    "sys_ptrace".to_string(),
                ]),
                userns_mode: string_to_option(&config.load().docker.userns_mode),
                readonly_rootfs: Some(true),
                ..Default::default()
            }),
            hostname: Some(self.uuid.to_string()),
            domainname: string_to_option(&config.load().docker.domainname),
            entrypoint: self.entrypoint.clone(),
            image: Some(self.container.image.trim_end_matches('~').to_string()),
            env: Some(self.environment(config)),
            user: Some(if config.load().system.user.rootless.enabled {
                let config = config.load();

                format!(
                    "{}:{}",
                    config.system.user.rootless.container_uid,
                    config.system.user.rootless.container_gid
                )
            } else {
                let config = config.load();

                format!("{}:{}", config.system.user.uid, config.system.user.gid)
            }),
            labels: Some(labels),
            attach_stdin: Some(true),
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            open_stdin: Some(true),
            tty: Some(true),
            ..Default::default()
        })
    }

    fn container_update_config(
        &self,
        config: &crate::config::Config,
    ) -> bollard::plugin::ContainerUpdateBody {
        let resources = self.convert_container_resources(config);

        bollard::plugin::ContainerUpdateBody {
            memory: resources.memory,
            memory_reservation: resources.memory_reservation,
            memory_swap: resources.memory_swap,
            cpu_quota: resources.cpu_quota,
            cpu_period: resources.cpu_period,
            cpu_shares: resources.cpu_shares,
            cpuset_cpus: resources.cpuset_cpus,
            pids_limit: resources.pids_limit,
            blkio_weight: resources.blkio_weight,
            oom_kill_disable: resources.oom_kill_disable,
            ..Default::default()
        }
    }

    fn installer_resources(&self, config: &crate::config::Config) -> bollard::models::Resources {
        let mut resources = self.convert_container_resources(config);

        let config = config.load();
        let installer_limits = &config.docker.installer_limits;

        if resources
            .memory_reservation
            .is_some_and(|m| m > 0 && m < installer_limits.memory.as_bytes() as i64)
        {
            resources.memory = None;
            resources.memory_reservation = Some(installer_limits.memory.as_bytes() as i64);
            resources.memory_swap = None;
        }

        if resources
            .cpu_quota
            .is_some_and(|c| c > 0 && c < installer_limits.cpu as i64 * 1000)
        {
            resources.cpu_quota = Some(installer_limits.cpu as i64 * 1000);
        }

        resources
    }
}

pub struct DockerExecutor {
    docker: Arc<bollard::Docker>,
    app_config: Arc<crate::config::Config>,
    host_mounts: std::sync::OnceLock<Option<host_mounts::HostMountTable>>,
    host_gateway: std::sync::OnceLock<Option<std::net::IpAddr>>,
}

impl DockerExecutor {
    pub fn new(docker: Arc<bollard::Docker>, app_config: Arc<crate::config::Config>) -> Self {
        Self {
            docker,
            app_config,
            host_mounts: std::sync::OnceLock::new(),
            host_gateway: std::sync::OnceLock::new(),
        }
    }

    #[inline]
    fn host_mounts(&self) -> Option<&host_mounts::HostMountTable> {
        self.host_mounts.get().and_then(Option::as_ref)
    }

    /// Returns the host gateway address to route through when wings itself is
    /// running inside a container. `None` means wings is running on the host (or
    /// the gateway could not be determined), in which case the game server's
    /// internal docker network IP is reachable directly.
    #[inline]
    fn host_gateway(&self) -> Option<std::net::IpAddr> {
        *self.host_gateway.get_or_init(Self::detect_host_gateway)
    }

    #[cfg(target_os = "linux")]
    fn detect_host_gateway() -> Option<std::net::IpAddr> {
        // Only reroute when wings is running inside a container. On the host the
        // default route points at the LAN router, which must never receive game
        // server traffic.
        if !Path::new("/.dockerenv").exists() {
            return None;
        }

        let routes = std::fs::read_to_string("/proc/net/route").ok()?;
        for line in routes.lines().skip(1) {
            let mut fields = line.split_whitespace();
            let _iface = fields.next()?;
            let destination = fields.next()?;
            let gateway = fields.next()?;

            // The default route has a zero destination and a non-zero gateway.
            // Both fields are little-endian hex of the raw IPv4 address.
            if destination == "00000000" && gateway != "00000000" {
                let raw = u32::from_str_radix(gateway, 16).ok()?;
                return Some(std::net::IpAddr::V4(std::net::Ipv4Addr::from(
                    raw.to_le_bytes(),
                )));
            }
        }

        None
    }

    #[cfg(not(target_os = "linux"))]
    fn detect_host_gateway() -> Option<std::net::IpAddr> {
        None
    }

    async fn image_exists(&self, image_name: &str) -> bool {
        self.docker
            .list_images(Some(bollard::query_parameters::ListImagesOptions {
                all: true,
                filters: Some(HashMap::from([(
                    "reference".to_string(),
                    vec![image_name.to_string()],
                )])),
                ..Default::default()
            }))
            .await
            .is_ok_and(|images| !images.is_empty())
    }

    async fn pull_image(
        &self,
        image: &str,
        server: &super::super::Server,
        quiet: bool,
    ) -> Result<(), anyhow::Error> {
        if image.ends_with('~') {
            return Ok(());
        }

        let (image_name, tag) = match image.rsplit_once(':') {
            Some((name, tag)) if !tag.is_empty() => {
                let colon_is_tag_sep = image.rfind('/').is_none_or(|slash| slash < name.len());
                if colon_is_tag_sep {
                    (name, tag)
                } else {
                    (image, "latest")
                }
            }
            _ => (image, "latest"),
        };

        let pull_cache = {
            type InnerMap = HashMap<
                compact_str::CompactString,
                Arc<tokio::sync::Mutex<Option<std::time::Instant>>>,
            >;
            static IMAGE_PULL_CACHE: std::sync::OnceLock<Arc<parking_lot::Mutex<InnerMap>>> =
                std::sync::OnceLock::new();

            IMAGE_PULL_CACHE.get_or_init(|| {
                let cache = Arc::new(parking_lot::Mutex::new(HashMap::new()));

                tokio::spawn({
                    let cache = Arc::clone(&cache);
                    let config = Arc::clone(&self.app_config);

                    async move {
                        loop {
                            tokio::time::sleep(std::time::Duration::from_secs(60)).await;

                            let mut cache = cache.lock();
                            let now = std::time::Instant::now();
                            let duration = config.load().docker.registry_image_fetch_cache.duration;
                            cache.retain(
                                |_,
                                 timestamp: &mut Arc<
                                    tokio::sync::Mutex<Option<std::time::Instant>>,
                                >| {
                                    timestamp.try_lock().is_ok_and(|t| {
                                        now.duration_since(t.unwrap_or(std::time::Instant::now()))
                                            .as_secs()
                                            < duration
                                    })
                                },
                            );
                        }
                    }
                });

                cache
            })
        };

        let cache_config = self.app_config.load().docker.registry_image_fetch_cache;

        let mut last_pull = if cache_config.enabled {
            let entry = {
                let mut cache = pull_cache.lock();
                Arc::clone(cache.entry(image.into()).or_default())
            };

            Some(entry.lock_owned().await)
        } else {
            None
        };

        if let Some(guard) = &last_pull
            && let Some(pulled_at) = **guard
            && pulled_at.elapsed().as_secs() < cache_config.duration
            && self.image_exists(image_name).await
        {
            tracing::debug!(
                server = %server.uuid,
                image = %image_name,
                "image pull skipped, cached as recently pulled"
            );

            return Ok(());
        }

        if !quiet {
            server.log_daemon_with_prelude(
                "Pulling Docker container image, this could take a few minutes to complete...",
            );
        }

        let mut registry_auth = None;
        for (registry, config) in self.app_config.load().docker.registries.iter() {
            if image.starts_with(registry.as_str()) {
                registry_auth = Some(bollard::auth::DockerCredentials {
                    username: Some(config.username.clone()),
                    password: Some(config.password.clone()),
                    serveraddress: Some(registry.clone()),
                    ..Default::default()
                });
                break;
            }
        }

        let mut stream = self.docker.create_image(
            Some(bollard::query_parameters::CreateImageOptions {
                from_image: Some(image_name.to_string()),
                tag: Some(tag.to_string()),
                ..Default::default()
            }),
            None,
            registry_auth,
        );

        while let Some(status) = stream.next().await {
            match status {
                Ok(info) => {
                    if let Some(id) = &info.id {
                        match info.status.as_deref().map(str::to_lowercase).as_deref() {
                            Some("downloading") => {
                                if let Some(ref detail) = info.progress_detail {
                                    server
                                        .websocket
                                        .send(
                                            super::super::websocket::WebsocketMessage::builder(
                                                super::super::websocket::WebsocketEvent::ServerImagePullProgress,
                                            )
                                            .arg(id.clone())
                                            .structured_arg(crate::models::PullProgress {
                                                status: crate::models::PullProgressStatus::Pulling,
                                                bytes_processed: detail.current.unwrap_or_default(),
                                                bytes_total: detail.total.unwrap_or_default(),
                                            })
                                            .build(),
                                        )
                                        .ok();
                                }
                            }
                            Some("extracting") => {
                                if let Some(ref detail) = info.progress_detail {
                                    server
                                        .websocket
                                        .send(
                                            super::super::websocket::WebsocketMessage::builder(
                                                super::super::websocket::WebsocketEvent::ServerImagePullProgress,
                                            )
                                            .arg(id.clone())
                                            .structured_arg(crate::models::PullProgress {
                                                status: crate::models::PullProgressStatus::Extracting,
                                                bytes_processed: detail.current.unwrap_or_default(),
                                                bytes_total: detail.total.unwrap_or_default(),
                                            })
                                            .build(),
                                        )
                                        .ok();
                                }
                            }
                            Some("download complete") | Some("pull complete") => {
                                server
                                    .websocket
                                    .send(
                                        super::super::websocket::WebsocketMessage::builder(
                                            super::super::websocket::WebsocketEvent::ServerImagePullCompleted,
                                        )
                                        .arg(id.clone())
                                        .build(),
                                    )
                                    .ok();
                            }
                            _ => {}
                        }
                    }

                    if !quiet && let Some(status_str) = info.status {
                        if let Some(ref detail) = info.progress_detail {
                            server.log_daemon_install(
                                format!(
                                    "{status_str} {} of {}",
                                    crate::utils::draw_progress_bar(
                                        50usize.saturating_sub(status_str.len()),
                                        detail.current.unwrap_or_default() as f64,
                                        detail.total.unwrap_or_default() as f64,
                                    ),
                                    human_bytes::human_bytes(
                                        detail.total.unwrap_or_default() as f64
                                    ),
                                )
                                .into(),
                            );
                        } else {
                            server.log_daemon_install(status_str.into());
                        }
                    }
                }
                Err(err) => {
                    tracing::error!(
                        server = %server.uuid,
                        image = %image_name,
                        "failed to pull image: {:?}",
                        err
                    );

                    if !quiet {
                        server.log_daemon_error(&format!("failed to pull image: {err}"));
                    }

                    if !self.image_exists(image_name).await {
                        return Err(err.into());
                    }

                    tracing::warn!(
                        server = %server.uuid,
                        image = %image_name,
                        "image already exists locally, ignoring pull error"
                    );
                }
            }
        }

        if let Some(guard) = &mut last_pull {
            **guard = Some(std::time::Instant::now());
        }

        if !quiet {
            server.log_daemon_with_prelude("Finished pulling Docker container image");
        }

        Ok(())
    }
}

struct LogsReader {
    stream: futures::stream::BoxStream<'static, Result<Vec<u8>, std::io::Error>>,
    buffer: Vec<u8>,
    pos: usize,
}

impl tokio::io::AsyncRead for LogsReader {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        loop {
            if self.pos < self.buffer.len() {
                let n = buf.remaining().min(self.buffer.len() - self.pos);
                let buffer_slice = match self.buffer.get_slice(self.pos..self.pos + n) {
                    Ok(slice) => slice,
                    Err(err) => return Poll::Ready(Err(err)),
                };
                buf.put_slice(buffer_slice);
                self.pos += n;

                return Poll::Ready(Ok(()));
            }

            self.buffer.clear();
            self.pos = 0;

            match self.stream.as_mut().poll_next(cx) {
                Poll::Ready(Some(Ok(chunk))) => self.buffer = chunk,
                Poll::Ready(Some(Err(e))) => return Poll::Ready(Err(e)),
                Poll::Ready(None) => return Poll::Ready(Ok(())),
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}

struct DockerProcessHandle {
    container_id: String,
    docker: Arc<bollard::Docker>,
    server: Weak<super::super::InnerServer>,
    app_config: Arc<crate::config::Config>,

    resource_usage: tokio::sync::watch::Sender<super::super::resources::ResourceUsage>,
    publish_resource_usage: bool,
    stdin_tx: tokio::sync::mpsc::Sender<Vec<u8>>,
    stdout_ratelimited_rx: tokio::sync::broadcast::Receiver<Arc<compact_str::CompactString>>,
    stdout_rx: tokio::sync::broadcast::Receiver<Arc<compact_str::CompactString>>,

    state_task: tokio::task::JoinHandle<()>,
    stats_task: tokio::task::JoinHandle<()>,
    stdin_task: tokio::task::JoinHandle<()>,
}

impl DockerProcessHandle {
    async fn new(
        container_id: String,
        docker: Arc<bollard::Docker>,
        server: &super::super::Server,
        app_config: Arc<crate::config::Config>,
        status_tx: tokio::sync::mpsc::Sender<super::ProcessStatus>,
        publish_resource_usage: bool,
    ) -> Result<Self, anyhow::Error> {
        let (stdin_tx, mut stdin_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(150);
        let (stdout_ratelimited_tx, stdout_ratelimited_rx) =
            tokio::sync::broadcast::channel::<Arc<compact_str::CompactString>>(
                app_config.load().system.websocket_log_count,
            );
        let (stdout_tx, stdout_rx) = tokio::sync::broadcast::channel::<
            Arc<compact_str::CompactString>,
        >(app_config.load().system.websocket_log_count * 2);

        let resource_usage = server.resource_usage.clone();
        if publish_resource_usage {
            let disk_bytes = server.filesystem.limiter_usage().await;
            resource_usage.send_modify(|usage| {
                usage.wipe(server.state.get_state());
                usage.disk_bytes = disk_bytes;
            });
        }

        let mut attach = docker
            .attach_container(
                &container_id,
                Some(bollard::query_parameters::AttachContainerOptions {
                    stdin: true,
                    stdout: true,
                    stderr: true,
                    stream: true,
                    ..Default::default()
                }),
            )
            .await?;

        let stdin_task = tokio::spawn(async move {
            while let Some(data) = stdin_rx.recv().await {
                if let Err(err) = attach.input.write_all(&data).await {
                    tracing::error!(error = %err, "failed to write to container stdin");
                }
            }
        });

        // intentionally not aborted on drop so that it can finish writing any remaining logs to the channel
        tokio::spawn({
            let server = server.clone();
            let app_config = Arc::clone(&app_config);

            async move {
                let mut line_buffer = LineBuffer::new();

                let mut ratelimit_counter = 0;
                let mut ratelimit_start = std::time::Instant::now();

                let mut allow_ratelimit = || {
                    ratelimit_counter += 1;

                    let config = app_config.load();

                    if config.throttles.enabled
                        && config.throttles.line_reset_interval > 0
                        && ratelimit_counter >= config.throttles.lines
                    {
                        if ratelimit_start.elapsed()
                            < std::time::Duration::from_millis(config.throttles.line_reset_interval)
                        {
                            if ratelimit_counter == config.throttles.lines {
                                tracing::debug!(
                                    server = %server.uuid,
                                    lines = config.throttles.lines,
                                    reset_interval = config.throttles.line_reset_interval,
                                    "ratelimit reached for server output"
                                );

                                server.log_daemon_with_prelude(
                                    "Server is outputting console data too quickly -- throttling...",
                                );
                            }

                            return false;
                        } else {
                            ratelimit_counter = 0;
                            ratelimit_start = std::time::Instant::now();
                        }
                    }

                    true
                };

                let mut emit = |slice: &[u8]| {
                    let line = Arc::new(compact_str::CompactString::from_utf8_lossy(slice));

                    if allow_ratelimit() {
                        stdout_ratelimited_tx.send(Arc::clone(&line)).ok();
                    }
                    stdout_tx.send(line).ok();
                };

                while let Some(Ok(data)) = attach.output.next().await {
                    line_buffer.extend(&data.into_bytes());

                    while let Some(line) = line_buffer.next_line() {
                        emit(line);
                    }

                    line_buffer.compact();
                }

                if let Some(line) = line_buffer.flush() {
                    emit(line);
                }

                tracing::debug!(server = %server.uuid, "stdout task ended");
            }
        });

        let stats_docker = Arc::clone(&docker);
        let stats_id = container_id.clone();
        let stats_usage = resource_usage.clone();
        let stats_server = server.clone();

        let stats_task = tokio::spawn(async move {
            if !publish_resource_usage {
                return;
            }

            let mut prev_cpu_total = 0;
            let mut prev_instant = None;

            let get_stats = async || {
                let mut stream = stats_docker.stats(
                    &stats_id,
                    Some(bollard::query_parameters::StatsOptions {
                        stream: false,
                        one_shot: true,
                    }),
                );

                let (r1, r2, _) = tokio::join!(
                    stream.next(),
                    stats_server.filesystem.limiter_usage(),
                    tokio::time::sleep(std::time::Duration::from_secs(1))
                );

                (r1, r2)
            };

            while let (Some(stats), disk_bytes) = get_stats().await {
                let stats = match stats {
                    Ok(stats) => stats,
                    Err(err) => {
                        tracing::warn!(
                            server = %stats_server.uuid,
                            "failed to get container stats: {:?}",
                            err
                        );
                        continue;
                    }
                };

                stats_usage.send_modify(|usage| {
                    if let Some(memory_stats) = &stats.memory_stats {
                        let mut memory_bytes = memory_stats.usage.unwrap_or(0);

                        if let Some(stats) = &memory_stats.stats {
                            if let Some(&inactive_file) = stats.get("total_inactive_file")
                                && inactive_file < memory_bytes
                            {
                                memory_bytes -= inactive_file;
                            } else if let Some(&inactive_file) = stats.get("inactive_file")
                                && inactive_file < memory_bytes
                            {
                                memory_bytes -= inactive_file;
                            }
                        }

                        usage.memory_bytes = memory_bytes;
                        usage.memory_limit_bytes = memory_stats.limit.unwrap_or(0);
                    }

                    usage.disk_bytes = disk_bytes;
                    usage.state = stats_server.state.get_state();

                    if let Some(networks) = &stats.networks
                        && let Some(net) = networks.values().next()
                    {
                        usage.network.rx_bytes = net.rx_bytes.unwrap_or(0);
                        usage.network.rx_packets = net.rx_packets.unwrap_or(0);
                        usage.network.tx_bytes = net.tx_bytes.unwrap_or(0);
                        usage.network.tx_packets = net.tx_packets.unwrap_or(0);
                    }

                    if let Some(cpu_stats) = &stats.cpu_stats
                        && let Some(cpu_usage) = &cpu_stats.cpu_usage
                    {
                        let total_usage = cpu_usage.total_usage.unwrap_or(0);
                        let now = std::time::Instant::now();

                        usage.cpu_absolute = if let Some(prev) = prev_instant {
                            let cpu_delta_ns = total_usage.saturating_sub(prev_cpu_total) as f64;
                            let wall_delta_ns = now.duration_since(prev).as_nanos() as f64;

                            if wall_delta_ns > 0.0 && cpu_delta_ns > 0.0 {
                                ((cpu_delta_ns / wall_delta_ns) * 100.0 * 1000.0).round() / 1000.0
                            } else {
                                0.0
                            }
                        } else {
                            0.0
                        };

                        prev_cpu_total = total_usage;
                        prev_instant = Some(now);
                    }
                });
            }
        });

        let state_docker = Arc::clone(&docker);
        let state_id = container_id.clone();
        let state_usage = resource_usage.clone();

        let state_task = tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;

                let inspect = match state_docker.inspect_container(&state_id, None).await {
                    Ok(inspect) => inspect,
                    Err(DockerResponseServerError {
                        status_code: 404, ..
                    }) => Default::default(),
                    Err(err) => {
                        tracing::warn!(
                            server = %state_id,
                            "failed to inspect container for state: {:?}",
                            err
                        );
                        continue;
                    }
                };
                let state = inspect.state.unwrap_or_default();

                let process_status = match state.status {
                    Some(bollard::plugin::ContainerStateStatusEnum::RUNNING) => {
                        if let Some(ref started_at) = state.started_at
                            && let Ok(started_at) = chrono::DateTime::parse_from_rfc3339(started_at)
                        {
                            let uptime = chrono::Utc::now()
                                .signed_duration_since(started_at.with_timezone(&chrono::Utc))
                                .num_milliseconds()
                                .max(0) as u64;
                            if publish_resource_usage {
                                state_usage.send_modify(|usage| {
                                    usage.uptime = uptime;
                                    if let Some(host_config) = inspect.host_config
                                        && let Some(cpu_quota) = host_config.cpu_quota
                                        && cpu_quota > 0
                                    {
                                        usage.cpu_limit_absolute = (cpu_quota / 1000) as u32;
                                    } else {
                                        usage.cpu_limit_absolute =
                                            rayon::current_num_threads() as u32 * 100;
                                    }
                                });
                            }
                        }
                        super::ProcessStatus::Running
                    }
                    Some(bollard::plugin::ContainerStateStatusEnum::PAUSED) => {
                        super::ProcessStatus::Paused
                    }
                    _ => {
                        if publish_resource_usage {
                            state_usage.send_modify(|usage| usage.uptime = 0);
                        }
                        super::ProcessStatus::Stopped {
                            exit_code: state.exit_code.unwrap_or(-1) as i32,
                            oom_killed: state.oom_killed.unwrap_or(false),
                        }
                    }
                };

                if status_tx.send(process_status).await.is_err() {
                    break;
                }
            }
        });

        Ok(Self {
            container_id,
            docker,
            server: Arc::downgrade(&**server),
            app_config,
            resource_usage,
            publish_resource_usage,
            stdin_tx,
            stdout_ratelimited_rx,
            stdout_rx,
            state_task,
            stats_task,
            stdin_task,
        })
    }

    #[inline]
    fn get_server(&self) -> Result<Arc<super::super::InnerServer>, anyhow::Error> {
        self.server
            .upgrade()
            .ok_or_else(|| anyhow::anyhow!("server has been dropped"))
    }
}

impl Drop for DockerProcessHandle {
    fn drop(&mut self) {
        self.state_task.abort();
        self.stats_task.abort();
        self.stdin_task.abort();

        if self.publish_resource_usage
            && let Some(server) = self.server.upgrade()
        {
            self.resource_usage.wipe(server.state.get_state());
        }
    }
}

#[async_trait::async_trait]
impl super::ProcessHandle for DockerProcessHandle {
    async fn logs(
        &self,
        lines: Option<usize>,
    ) -> Result<Box<dyn tokio::io::AsyncRead + Send + Unpin>, anyhow::Error> {
        let docker = Arc::clone(&self.docker);
        let container_id = self.container_id.clone();
        let tail = lines.map_or_else(|| "all".to_string(), |n| n.to_string());

        let stream = docker
            .logs(
                &container_id,
                Some(bollard::query_parameters::LogsOptions {
                    follow: false,
                    stdout: true,
                    stderr: true,
                    timestamps: false,
                    tail,
                    ..Default::default()
                }),
            )
            .map(|result| {
                result
                    .map(|log| log.into_bytes().to_vec())
                    .map_err(std::io::Error::other)
            });

        Ok(Box::new(LogsReader {
            stream: Box::pin(stream),
            buffer: Vec::new(),
            pos: 0,
        }))
    }

    async fn send_stdin(&self, data: Vec<u8>) -> Result<(), anyhow::Error> {
        self.stdin_tx.send(data).await.map_err(Into::into)
    }

    async fn subscribe_stdout_lines_ratelimited(
        &self,
    ) -> Result<tokio::sync::broadcast::Receiver<Arc<compact_str::CompactString>>, anyhow::Error>
    {
        Ok(self.stdout_ratelimited_rx.resubscribe())
    }
    async fn subscribe_stdout_lines(
        &self,
    ) -> Result<tokio::sync::broadcast::Receiver<Arc<compact_str::CompactString>>, anyhow::Error>
    {
        Ok(self.stdout_rx.resubscribe())
    }

    async fn sync_configuration(&self) -> Result<(), anyhow::Error> {
        let server = self.get_server()?;

        let update_config = server
            .configuration
            .read()
            .await
            .container_update_config(&self.app_config);

        self.docker
            .update_container(&self.container_id, update_config)
            .await
            .map_err(Into::into)
    }

    async fn start(&self) -> Result<(), anyhow::Error> {
        self.docker
            .start_container(&self.container_id, None)
            .await
            .map_err(Into::into)
    }

    async fn stop(&self) -> Result<(), anyhow::Error> {
        let server = self.get_server()?;

        let process_config = server.process_configuration.read().await;
        let stop_type = process_config.stop.r#type.clone();
        let stop_value = process_config.stop.value.clone();
        drop(process_config);

        match stop_type.as_str() {
            "signal" => {
                let signal = match stop_value.as_deref().map(str::to_uppercase).as_deref() {
                    Some("SIGABRT") => "SIGABRT",
                    Some("SIGINT") | Some("C") => "SIGINT",
                    Some("SIGTERM") => "SIGTERM",
                    Some("SIGQUIT") => "SIGQUIT",
                    _ => "SIGKILL",
                };
                self.docker
                    .kill_container(
                        &self.container_id,
                        Some(bollard::query_parameters::KillContainerOptions {
                            signal: signal.to_string(),
                        }),
                    )
                    .await
                    .map_err(Into::into)
            }
            "command" => {
                let mut command = stop_value
                    .map(|s| s.as_bytes().to_vec())
                    .unwrap_or_default();
                command.push(b'\n');
                self.stdin_tx
                    .send(command)
                    .await
                    .map_err(|e| anyhow::anyhow!(e))
            }
            _ => self
                .docker
                .stop_container(
                    &self.container_id,
                    Some(bollard::query_parameters::StopContainerOptions {
                        t: Some(-1),
                        ..Default::default()
                    }),
                )
                .await
                .map_err(Into::into),
        }
    }

    async fn kill(&self) -> Result<(), anyhow::Error> {
        self.docker
            .kill_container(
                &self.container_id,
                Some(bollard::query_parameters::KillContainerOptions {
                    signal: "SIGKILL".to_string(),
                }),
            )
            .await
            .map_err(Into::into)
    }
}

type StatusReceiver = tokio::sync::mpsc::Receiver<super::ProcessStatus>;

async fn find_running_container(
    docker: &bollard::Docker,
    name_filter: &str,
    container_type: Option<&str>,
) -> Option<String> {
    let mut filters = HashMap::from([("name".to_string(), vec![name_filter.to_string()])]);
    if let Some(container_type) = container_type {
        filters.insert(
            "label".to_string(),
            vec![format!("ContainerType={container_type}")],
        );
    }

    let containers = docker
        .list_containers(Some(bollard::query_parameters::ListContainersOptions {
            all: true,
            filters: Some(filters),
            ..Default::default()
        }))
        .await
        .unwrap_or_default();

    for c in containers {
        if c.state != Some(bollard::plugin::ContainerSummaryStateEnum::RUNNING) {
            continue;
        }

        if let Some(id) = c.id {
            return Some(id);
        }
    }

    None
}

#[async_trait::async_trait]
impl super::ServerExecutor for DockerExecutor {
    async fn boot(&self) -> Result<(), anyhow::Error> {
        self.app_config.ensure_docker_network(&self.docker).await?;

        if std::env::var("OCI_CONTAINER").is_ok() {
            match host_mounts::HostMountTable::discover(&self.docker).await {
                Ok(table) => {
                    table.validate_directories(&self.app_config.load())?;

                    tracing::info!(
                        "running in container {}, translating bind mount sources to host paths",
                        table.container_id().get(..12).unwrap_or_default()
                    );
                    for (destination, source) in table.mounts() {
                        if destination != source {
                            tracing::info!(
                                "translating bind mount sources under {} to {}",
                                destination.display(),
                                source.display()
                            );
                        }
                    }

                    let _ = self.host_mounts.set(Some(table));
                }
                Err(err) => {
                    tracing::warn!(
                        "running in a container, but failed to inspect own container: {err:#}"
                    );
                    tracing::warn!(
                        "bind mount sources will be passed to the container engine untranslated, host paths must match the wings container's paths exactly"
                    );
                    let _ = self.host_mounts.set(None);
                }
            }
        }

        Ok(())
    }

    async fn setup_server_process(
        &self,
        server: &super::super::Server,
    ) -> Result<(Arc<dyn super::ProcessHandle>, StatusReceiver), anyhow::Error> {
        let image = server.configuration.read().await.container.image.clone();

        self.pull_image(&image, server, false).await?;

        let container_name = {
            let cfg = server.configuration.read().await;
            if self.app_config.load().docker.server_name_in_container_name {
                let mut filtered = String::new();
                for c in cfg.meta.name.chars() {
                    if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                        filtered.push(c);
                    }
                }
                filtered.truncate(63 - 1 - 36);
                format!("{}.{}", filtered, cfg.uuid)
            } else {
                cfg.uuid.to_string()
            }
        };

        let bollard_config = server
            .configuration
            .read()
            .await
            .container_config(
                &self.app_config,
                &self.docker,
                &server.filesystem,
                self.host_mounts(),
            )
            .await?;
        server
            .configuration
            .read()
            .await
            .ensure_vmounts(&self.app_config)
            .await?;

        let container = self
            .docker
            .create_container(
                Some(bollard::query_parameters::CreateContainerOptions {
                    name: Some(container_name),
                    ..Default::default()
                }),
                bollard_config,
            )
            .await?;

        let (status_tx, status_rx) = tokio::sync::mpsc::channel(1);
        let handle = Arc::new(
            DockerProcessHandle::new(
                container.id,
                Arc::clone(&self.docker),
                server,
                Arc::clone(&self.app_config),
                status_tx,
                true,
            )
            .await?,
        );

        Ok((handle, status_rx))
    }

    async fn attach_server_process(
        &self,
        server: &super::super::Server,
    ) -> Result<(Arc<dyn super::ProcessHandle>, StatusReceiver), anyhow::Error> {
        let container_id = find_running_container(
            &self.docker,
            &server.uuid.to_string(),
            Some("server_process"),
        )
        .await
        .ok_or_else(|| anyhow::anyhow!("no running server container found"))?;

        let (status_tx, status_rx) = tokio::sync::mpsc::channel(1);
        let handle = Arc::new(
            DockerProcessHandle::new(
                container_id,
                Arc::clone(&self.docker),
                server,
                Arc::clone(&self.app_config),
                status_tx,
                true,
            )
            .await?,
        );

        Ok((handle, status_rx))
    }

    async fn cleanup_server_process(
        &self,
        server: &super::super::Server,
    ) -> Result<(), anyhow::Error> {
        let containers = self
            .docker
            .list_containers(Some(bollard::query_parameters::ListContainersOptions {
                all: true,
                filters: Some(HashMap::from([(
                    "name".to_string(),
                    vec![server.uuid.to_string()],
                )])),
                ..Default::default()
            }))
            .await?;

        for c in containers {
            let Some(id) = c.id else { continue };
            if let Err(err) = self
                .docker
                .remove_container(
                    &id,
                    Some(bollard::query_parameters::RemoveContainerOptions {
                        force: true,
                        ..Default::default()
                    }),
                )
                .await
            {
                tracing::error!(
                    server = %server.uuid,
                    container = %id,
                    "failed to remove container: {}",
                    err
                );
            }
        }

        Ok(())
    }

    async fn setup_installation_process(
        &self,
        server: &super::super::Server,
        script: &super::super::installation::InstallationScript,
    ) -> Result<(Arc<dyn super::ProcessHandle>, StatusReceiver), anyhow::Error> {
        self.pull_image(&script.container_image, server, false)
            .await?;

        let server_config = server.configuration.read().await;
        let resources = server_config.installer_resources(&self.app_config);

        let mut env = server_config.environment(&self.app_config);
        for (k, v) in &script.environment {
            env.push(format!(
                "{k}={}",
                match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                }
            ));
        }

        drop(server_config);

        let tmp_dir =
            Path::new(&self.app_config.load().system.tmp_directory).join(server.uuid.to_string());
        tokio::fs::create_dir_all(&tmp_dir).await?;
        tokio::fs::write(
            tmp_dir.join("install.sh"),
            script.script.replace("\r\n", "\n"),
        )
        .await?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            tokio::fs::set_permissions(&tmp_dir, std::fs::Permissions::from_mode(0o755)).await?;
        }

        let bollard_config = bollard::plugin::ContainerCreateBody {
            host_config: Some(bollard::plugin::HostConfig {
                memory: resources.memory,
                memory_reservation: resources.memory_reservation,
                memory_swap: resources.memory_swap,
                cpu_quota: resources.cpu_quota,
                cpu_period: resources.cpu_period,
                cpu_shares: resources.cpu_shares,
                cpuset_cpus: resources.cpuset_cpus,
                pids_limit: resources.pids_limit,
                blkio_weight: resources.blkio_weight,
                oom_kill_disable: resources.oom_kill_disable,
                mounts: Some(vec![
                    bollard::plugin::Mount {
                        typ: Some(bollard::plugin::MountType::BIND),
                        source: Some(host_mounts::translate_source(
                            self.host_mounts(),
                            &server.filesystem.base(),
                        )),
                        target: Some("/mnt/server".to_string()),
                        ..Default::default()
                    },
                    bollard::plugin::Mount {
                        typ: Some(bollard::plugin::MountType::BIND),
                        source: Some(host_mounts::translate_source(
                            self.host_mounts(),
                            &tmp_dir.to_string_lossy(),
                        )),
                        target: Some("/mnt/install".to_string()),
                        ..Default::default()
                    },
                ]),
                network_mode: Some(self.app_config.load().docker.network.mode.clone()),
                dns: Some(self.app_config.load().docker.network.dns.clone()),
                dns_options: Some(self.app_config.load().docker.network.dns_options.clone()),
                tmpfs: Some(HashMap::from([(
                    "/tmp".to_string(),
                    format!(
                        "rw,exec,nosuid,size={}M",
                        self.app_config.load().docker.tmpfs_size
                    ),
                )])),
                log_config: Some(bollard::plugin::HostConfigLogConfig {
                    typ: Some(self.app_config.load().docker.log_config.r#type.clone()),
                    config: Some(
                        self.app_config
                            .load()
                            .docker
                            .log_config
                            .config
                            .iter()
                            .map(|(k, v)| (k.clone(), v.clone()))
                            .collect(),
                    ),
                }),
                userns_mode: string_to_option(&self.app_config.load().docker.userns_mode),
                ..Default::default()
            }),
            cmd: Some(vec![
                script.entrypoint.to_string(),
                "/mnt/install/install.sh".to_string(),
            ]),
            hostname: Some("installer".to_string()),
            image: Some(script.container_image.trim_end_matches('~').to_string()),
            env: Some(env),
            labels: Some(HashMap::from([
                (
                    "Service".to_string(),
                    self.app_config.load().app_name.clone(),
                ),
                ("ContainerType".to_string(), "server_installer".to_string()),
            ])),
            attach_stdin: Some(true),
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            open_stdin: Some(true),
            tty: Some(true),
            ..Default::default()
        };

        let container = self
            .docker
            .create_container(
                Some(bollard::query_parameters::CreateContainerOptions {
                    name: Some(format!("{}_installer", server.uuid)),
                    ..Default::default()
                }),
                bollard_config,
            )
            .await?;

        let (status_tx, status_rx) = tokio::sync::mpsc::channel(1);
        let handle = Arc::new(
            DockerProcessHandle::new(
                container.id,
                Arc::clone(&self.docker),
                server,
                Arc::clone(&self.app_config),
                status_tx,
                true,
            )
            .await?,
        );

        Ok((handle, status_rx))
    }

    async fn attach_installation_process(
        &self,
        server: &super::super::Server,
    ) -> Result<(Arc<dyn super::ProcessHandle>, StatusReceiver), anyhow::Error> {
        let container_id = find_running_container(
            &self.docker,
            &format!("{}_installer", server.uuid),
            Some("server_installer"),
        )
        .await
        .ok_or_else(|| anyhow::anyhow!("no running installer container found"))?;

        let (status_tx, status_rx) = tokio::sync::mpsc::channel(1);
        let handle = Arc::new(
            DockerProcessHandle::new(
                container_id,
                Arc::clone(&self.docker),
                server,
                Arc::clone(&self.app_config),
                status_tx,
                true,
            )
            .await?,
        );

        Ok((handle, status_rx))
    }

    async fn cleanup_installation_process(
        &self,
        server: &super::super::Server,
    ) -> Result<(), anyhow::Error> {
        let containers = self
            .docker
            .list_containers(Some(bollard::query_parameters::ListContainersOptions {
                all: true,
                filters: Some(HashMap::from([(
                    "name".to_string(),
                    vec![format!("{}_installer", server.uuid)],
                )])),
                ..Default::default()
            }))
            .await?;

        for c in containers {
            let Some(id) = c.id else { continue };
            if let Err(err) = self
                .docker
                .remove_container(
                    &id,
                    Some(bollard::query_parameters::RemoveContainerOptions {
                        force: true,
                        ..Default::default()
                    }),
                )
                .await
            {
                tracing::error!(
                    server = %server.uuid,
                    container = %id,
                    "failed to remove installation container: {}",
                    err
                );
            }
        }

        Ok(())
    }

    async fn setup_script_process(
        &self,
        server: &super::super::Server,
        script: &super::super::installation::InstallationScript,
    ) -> Result<(Arc<dyn super::ProcessHandle>, StatusReceiver), anyhow::Error> {
        self.pull_image(&script.container_image, server, true)
            .await?;

        let server_config = server.configuration.read().await;
        let resources = server_config.installer_resources(&self.app_config);

        let mut env = server_config.environment(&self.app_config);
        for (k, v) in &script.environment {
            env.push(format!(
                "{k}={}",
                match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                }
            ));
        }

        drop(server_config);

        let tmp_dir =
            Path::new(&self.app_config.load().system.tmp_directory).join(server.uuid.to_string());
        tokio::fs::create_dir_all(&tmp_dir).await?;
        tokio::fs::write(
            tmp_dir.join("script.sh"),
            script.script.replace("\r\n", "\n"),
        )
        .await?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            tokio::fs::set_permissions(&tmp_dir, std::fs::Permissions::from_mode(0o755)).await?;
        }

        let bollard_config = bollard::plugin::ContainerCreateBody {
            host_config: Some(bollard::plugin::HostConfig {
                memory: resources.memory,
                memory_reservation: resources.memory_reservation,
                memory_swap: resources.memory_swap,
                cpu_quota: resources.cpu_quota,
                cpu_period: resources.cpu_period,
                cpu_shares: resources.cpu_shares,
                cpuset_cpus: resources.cpuset_cpus,
                pids_limit: resources.pids_limit,
                blkio_weight: resources.blkio_weight,
                oom_kill_disable: resources.oom_kill_disable,
                mounts: Some(vec![
                    bollard::plugin::Mount {
                        typ: Some(bollard::plugin::MountType::BIND),
                        source: Some(host_mounts::translate_source(
                            self.host_mounts(),
                            &server.filesystem.base(),
                        )),
                        target: Some("/mnt/server".to_string()),
                        ..Default::default()
                    },
                    bollard::plugin::Mount {
                        typ: Some(bollard::plugin::MountType::BIND),
                        source: Some(host_mounts::translate_source(
                            self.host_mounts(),
                            &tmp_dir.to_string_lossy(),
                        )),
                        target: Some("/mnt/script".to_string()),
                        ..Default::default()
                    },
                ]),
                network_mode: Some(self.app_config.load().docker.network.mode.clone()),
                dns: Some(self.app_config.load().docker.network.dns.clone()),
                dns_options: Some(self.app_config.load().docker.network.dns_options.clone()),
                tmpfs: Some(HashMap::from([(
                    "/tmp".to_string(),
                    format!(
                        "rw,exec,nosuid,size={}M",
                        self.app_config.load().docker.tmpfs_size
                    ),
                )])),
                log_config: Some(bollard::plugin::HostConfigLogConfig {
                    typ: Some(self.app_config.load().docker.log_config.r#type.clone()),
                    config: Some(
                        self.app_config
                            .load()
                            .docker
                            .log_config
                            .config
                            .iter()
                            .map(|(k, v)| (k.clone(), v.clone()))
                            .collect(),
                    ),
                }),
                userns_mode: string_to_option(&self.app_config.load().docker.userns_mode),
                auto_remove: Some(true),
                ..Default::default()
            }),
            cmd: Some(vec![
                script.entrypoint.to_string(),
                "/mnt/script/script.sh".to_string(),
            ]),
            hostname: Some("script".to_string()),
            image: Some(script.container_image.trim_end_matches('~').to_string()),
            env: Some(env),
            labels: Some(HashMap::from([
                (
                    "Service".to_string(),
                    self.app_config.load().app_name.clone(),
                ),
                ("ContainerType".to_string(), "script_runner".to_string()),
            ])),
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            tty: Some(false),
            ..Default::default()
        };

        let name = format!(
            "{}_script_runner_{}",
            server.uuid,
            rand::distr::Alphanumeric.sample_string(&mut rand::rng(), 8)
        );

        let container = self
            .docker
            .create_container(
                Some(bollard::query_parameters::CreateContainerOptions {
                    name: Some(name),
                    ..Default::default()
                }),
                bollard_config,
            )
            .await?;

        let (status_tx, status_rx) = tokio::sync::mpsc::channel(1);
        let handle = Arc::new(
            DockerProcessHandle::new(
                container.id,
                Arc::clone(&self.docker),
                server,
                Arc::clone(&self.app_config),
                status_tx,
                false,
            )
            .await?,
        );

        Ok((handle, status_rx))
    }

    async fn resolve_internal_target(
        &self,
        server: &super::super::Server,
        port: u16,
    ) -> Result<Option<std::net::SocketAddr>, anyhow::Error> {
        let container_id = match find_running_container(
            &self.docker,
            &server.uuid.to_string(),
            Some("server_process"),
        )
        .await
        {
            Some(id) => id,
            None => return Ok(None),
        };

        if let Some(gateway) = self.host_gateway() {
            let binding = {
                let configuration = server.configuration.read().await;
                configuration
                    .allocations
                    .mappings
                    .iter()
                    .find(|(_, ports)| ports.contains(&port))
                    .and_then(|(ip, _)| ip.parse::<std::net::IpAddr>().ok())
            };

            if let Some(binding_ip) = binding {
                let target_ip = if binding_ip.is_unspecified() || binding_ip.is_loopback() {
                    gateway
                } else {
                    binding_ip
                };

                return Ok(Some(std::net::SocketAddr::new(target_ip, port)));
            }
        }

        let inspect = self.docker.inspect_container(&container_id, None).await?;

        let network_name = self.app_config.load().docker.network.name.clone();
        match inspect
            .network_settings
            .and_then(|settings| settings.networks)
            .and_then(|mut networks| networks.remove(&network_name))
            .and_then(|endpoint| endpoint.ip_address)
            .filter(|ip| !ip.is_empty())
        {
            Some(ip) => Ok(Some(std::net::SocketAddr::new(ip.parse()?, port))),
            None => Ok(None),
        }
    }

    async fn used_ports(
        &self,
        ips: &[std::net::IpAddr],
    ) -> Result<HashMap<std::net::IpAddr, Vec<super::UsedPort>>, anyhow::Error> {
        if ips.is_empty() {
            return Ok(HashMap::new());
        }

        let config = self.app_config.load();
        let bindings: Vec<(std::net::IpAddr, HostBinding)> = ips
            .iter()
            .map(|ip| (*ip, HostBinding::resolve(&config.docker.network, *ip)))
            .collect();
        let mut used: HashMap<std::net::IpAddr, HashMap<u16, Option<uuid::Uuid>>> =
            ips.iter().map(|ip| (*ip, HashMap::new())).collect();

        let containers = self
            .docker
            .list_containers(Some(bollard::query_parameters::ListContainersOptions {
                all: false,
                ..Default::default()
            }))
            .await?;

        for container in containers {
            let server = container_server(container.names.as_deref());

            for port in container.ports.unwrap_or_default() {
                let Some(public_port) = port.public_port else {
                    continue;
                };

                for (ip, binding) in &bindings {
                    if binding.collides_with(port.ip.as_deref())
                        && let Some(ports) = used.get_mut(ip)
                    {
                        ports.entry(public_port).or_insert(server);
                    }
                }
            }
        }

        Ok(used
            .into_iter()
            .map(|(ip, ports)| {
                let mut ports: Vec<super::UsedPort> = ports
                    .into_iter()
                    .map(|(port, server)| super::UsedPort { port, server })
                    .collect();
                ports.sort_unstable_by_key(|port| port.port);

                (ip, ports)
            })
            .collect())
    }
}
