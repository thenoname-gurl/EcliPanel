use compact_str::ToCompactString;
use serde::{Deserialize, Serialize};
use serde_default::DefaultFromSerde;
use std::{collections::HashMap, path::PathBuf};
use utoipa::ToSchema;

pub mod process;
pub mod seccomp;

#[inline]
pub fn string_to_option(s: &str) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s.to_string())
    }
}

#[derive(ToSchema, Deserialize, Serialize, Clone)]
pub struct Mount {
    #[serde(skip_deserializing, default)]
    pub default: bool,

    pub target: compact_str::CompactString,
    pub source: compact_str::CompactString,
    pub read_only: bool,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct ScheduleAction {
    pub uuid: uuid::Uuid,

    #[serde(flatten)]
    pub action: super::schedule::actions::ScheduleAction,
}

#[derive(ToSchema, Clone, Deserialize, Serialize)]
pub struct Schedule {
    pub uuid: uuid::Uuid,
    #[schema(value_type = serde_json::Value)]
    pub triggers: Vec<super::schedule::ScheduleTrigger>,
    #[schema(value_type = serde_json::Value)]
    pub condition: super::schedule::conditions::SchedulePreCondition,
    #[schema(value_type = Vec<serde_json::Value>)]
    pub actions: Vec<ScheduleAction>,
}

nestify::nest! {
    #[derive(ToSchema, Deserialize, Serialize)]
    pub struct ServerConfiguration {
        pub uuid: uuid::Uuid,
        pub start_on_completion: Option<bool>,

        #[schema(inline)]
        pub meta: #[derive(ToSchema, Deserialize, Serialize)] pub struct ServerConfigurationMeta {
            pub name: compact_str::CompactString,
            pub description: compact_str::CompactString,
        },

        pub suspended: bool,
        pub invocation: compact_str::CompactString,
        pub skip_egg_scripts: bool,

        pub entrypoint: Option<Vec<String>>,
        pub environment: HashMap<compact_str::CompactString, serde_json::Value>,
        #[serde(default)]
        pub labels: HashMap<String, String>,
        #[serde(default)]
        pub backups: Vec<uuid::Uuid>,
        #[serde(default)]
        pub schedules: Vec<Schedule>,

        #[schema(inline)]
        pub allocations: #[derive(ToSchema, Deserialize, Serialize)] pub struct ServerConfigurationAllocations {
            pub force_outgoing_ip: bool,

            #[schema(inline)]
            pub default: Option<#[derive(ToSchema, Deserialize, Serialize)] pub struct ServerConfigurationAllocationsDefault {
                pub ip: compact_str::CompactString,
                pub port: u16,
            }>,

            #[serde(default, deserialize_with = "crate::deserialize::deserialize_defaultable")]
            pub mappings: HashMap<compact_str::CompactString, Vec<u16>>,
        },
        #[schema(inline)]
        pub build: #[derive(ToSchema, Deserialize, Serialize)] pub struct ServerConfigurationBuild {
            pub memory_limit: i64,
            #[serde(default, deserialize_with = "crate::deserialize::deserialize_defaultable")]
            pub overhead_memory: i64,
            pub swap: i64,
            pub io_weight: Option<u16>,
            pub cpu_limit: i64,
            pub disk_space: u64,
            pub threads: Option<compact_str::CompactString>,
            pub oom_disabled: bool,
        },
        pub mounts: Vec<Mount>,
        #[schema(inline)]
        pub egg: #[derive(ToSchema, Deserialize, Serialize)] pub struct ServerConfigurationEgg {
            pub id: uuid::Uuid,
            #[serde(default, deserialize_with = "crate::deserialize::deserialize_defaultable")]
            pub file_denylist: Vec<compact_str::CompactString>,
        },

        #[schema(inline)]
        pub container: #[derive(ToSchema, Deserialize, Serialize)] pub struct ServerConfigurationContainer {
            pub image: compact_str::CompactString,
            pub timezone: Option<compact_str::CompactString>,

            #[serde(default)]
            pub hugepages_passthrough_enabled: bool,
            #[serde(default)]
            pub kvm_passthrough_enabled: bool,

            #[serde(default)]
            #[schema(inline)]
            pub seccomp: #[derive(ToSchema, Deserialize, Serialize, DefaultFromSerde)] pub struct ServerConfigurationContainerSeccomp {
                #[serde(default)]
                pub remove_allowed: Vec<compact_str::CompactString>,
            },
        },

        #[serde(default)]
        #[schema(inline)]
        pub auto_kill: #[derive(ToSchema, Deserialize, Serialize, DefaultFromSerde, Clone, Copy)] pub struct ServerConfigurationAutoKill {
            #[serde(default)]
            pub enabled: bool,
            #[serde(default)]
            pub seconds: u64,
        },

        #[serde(default)]
        pub auto_start_behavior: crate::models::ServerAutoStartBehavior,
    }
}

impl ServerConfiguration {
    fn machine_id_path(&self, config: &crate::config::Config) -> PathBuf {
        config.vmount_path(self.uuid).join("machine-id")
    }

    fn machine_uuid_path(&self, config: &crate::config::Config) -> PathBuf {
        config.vmount_path(self.uuid).join("machine-uuid")
    }

    fn vmounts(&self, config: &crate::config::Config) -> Vec<Mount> {
        vec![
            Mount {
                default: false,
                target: "/etc/machine-id".into(),
                source: self
                    .machine_id_path(config)
                    .to_string_lossy()
                    .to_compact_string(),
                read_only: true,
            },
            Mount {
                default: false,
                target: "/sys/class/dmi/id/product_uuid".into(),
                source: self
                    .machine_uuid_path(config)
                    .to_string_lossy()
                    .to_compact_string(),
                read_only: true,
            },
        ]
    }

    async fn mounts(
        &self,
        config: &crate::config::Config,
        filesystem: &super::filesystem::Filesystem,
    ) -> Vec<Mount> {
        let mut mounts = self.vmounts(config);

        mounts.push(Mount {
            default: true,
            target: "/home/container".into(),
            source: filesystem
                .get_base_fs_mount_path()
                .await
                .to_string_lossy()
                .into(),
            read_only: false,
        });

        #[cfg(unix)]
        if self.container.hugepages_passthrough_enabled {
            mounts.push(Mount {
                default: false,
                target: "/dev/hugepages".into(),
                source: "/dev/hugepages".into(),
                read_only: false,
            });
        }

        #[cfg(unix)]
        if config.system.passwd.enabled {
            mounts.push(Mount {
                default: false,
                target: "/etc/group".into(),
                source: PathBuf::from(&config.system.passwd.directory)
                    .join("group")
                    .to_string_lossy()
                    .to_compact_string(),
                read_only: true,
            });
            mounts.push(Mount {
                default: false,
                target: "/etc/passwd".into(),
                source: PathBuf::from(&config.system.passwd.directory)
                    .join("passwd")
                    .to_string_lossy()
                    .to_compact_string(),
                read_only: true,
            });
        }

        for mount in &self.mounts {
            if config
                .allowed_mounts
                .iter()
                .all(|m| !mount.source.starts_with(&**m))
            {
                continue;
            }

            mounts.push(mount.clone());
        }

        mounts
    }

    async fn convert_mounts(
        &self,
        config: &crate::config::Config,
        filesystem: &super::filesystem::Filesystem,
    ) -> Vec<bollard::models::Mount> {
        self.mounts(config, filesystem)
            .await
            .into_iter()
            .map(|mount| bollard::models::Mount {
                typ: Some(bollard::secret::MountTypeEnum::BIND),
                target: Some(mount.target.into()),
                source: Some(mount.source.into()),
                read_only: Some(mount.read_only),
                ..Default::default()
            })
            .collect()
    }

    fn convert_devices(&self) -> Vec<bollard::models::DeviceMapping> {
        let mut devices = Vec::new();

        #[cfg(unix)]
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
        let iface = &config.docker.network.interface;
        let mut map = self.convert_allocations_bindings();

        for (_port, binds_option) in map.iter_mut() {
            if let Some(binds) = binds_option {
                let mut i = 0;
                while i < binds.len() {
                    if config.docker.network.disable_interface_binding {
                        binds[i].host_ip = None;
                    }

                    if binds[i].host_ip.as_deref() == Some("127.0.0.1") {
                        if config.docker.network.ispn {
                            binds.remove(i);

                            continue;
                        } else {
                            binds[i].host_ip = Some(iface.clone());
                        }
                    }

                    i += 1;
                }
            }
        }

        map
    }

    fn convert_allocations_exposed(&self) -> std::collections::HashMap<String, HashMap<(), ()>> {
        let mut map = HashMap::new();

        for ports in self.allocations.mappings.values() {
            for port in ports {
                map.entry(format!("{port}/tcp"))
                    .or_insert_with(HashMap::new);
                map.entry(format!("{port}/udp"))
                    .or_insert_with(HashMap::new);
            }
        }

        map
    }

    pub async fn ensure_vmounts(
        &self,
        config: &crate::config::Config,
    ) -> Result<(), std::io::Error> {
        let machine_id_path = self.machine_id_path(config);
        if let Some(parent) = machine_id_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&machine_id_path, self.uuid.simple().to_string()).await?;

        let machine_uuid_path = self.machine_uuid_path(config);
        if let Some(parent) = machine_uuid_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&machine_uuid_path, self.uuid.to_string()).await?;

        Ok(())
    }

    pub async fn remove_vmounts(&self, config: &crate::config::Config) {
        let vmount_path = config.vmount_path(self.uuid);
        if let Err(err) = tokio::fs::remove_dir_all(&vmount_path).await {
            tracing::error!(
                server = %self.uuid,
                "failed to remove vmounts at {}: {:?}",
                vmount_path.to_string_lossy(),
                err
            );
        }
    }

    pub fn convert_container_resources(
        &self,
        config: &crate::config::Config,
    ) -> bollard::models::Resources {
        let real_memory = if self.build.memory_limit > 0 {
            self.build.memory_limit + self.build.overhead_memory
        } else {
            0
        };

        let mut resources = bollard::models::Resources {
            memory: match real_memory {
                0 => None,
                limit => Some(config.docker.overhead.get_memory(limit.into()).as_bytes() as i64),
            },
            memory_reservation: match real_memory {
                0 => None,
                limit => Some(limit * 1024 * 1024),
            },
            memory_swap: match self.build.swap {
                0 => None,
                -1 => Some(-1),
                limit => match real_memory {
                    0 => Some(limit * 1024 * 1024),
                    memory_limit => Some(
                        config
                            .docker
                            .overhead
                            .get_memory(memory_limit.into())
                            .as_bytes() as i64
                            + limit * 1024 * 1024,
                    ),
                },
            },
            blkio_weight: self.build.io_weight,
            oom_kill_disable: Some(self.build.oom_disabled),
            pids_limit: match config.docker.container_pid_limit {
                0 => None,
                limit => Some(limit as i64),
            },
            cpuset_cpus: self.build.threads.clone().map(|t| t.into()),
            ..Default::default()
        };

        if self.build.cpu_limit > 0 {
            resources.cpu_quota = Some(self.build.cpu_limit * 1000);
            resources.cpu_period = Some(100000);
            resources.cpu_shares = Some(1024);
        }

        resources
    }

    pub fn environment(&self, config: &crate::config::Config) -> Vec<String> {
        let mut environment = self.environment.clone();
        environment.reserve(5);

        environment.insert(
            "TZ".into(),
            serde_json::Value::String(
                self.container
                    .timezone
                    .as_ref()
                    .map_or_else(|| config.system.timezone.to_string(), |tz| tz.to_string()),
            ),
        );
        environment.insert(
            "STARTUP".into(),
            serde_json::Value::String(self.invocation.to_string()),
        );
        environment.insert(
            "SERVER_MEMORY".into(),
            serde_json::Value::from(self.build.memory_limit),
        );
        if let Some(default) = &self.allocations.default {
            environment.insert(
                "SERVER_IP".into(),
                serde_json::Value::String(default.ip.to_string()),
            );
            environment.insert("SERVER_PORT".into(), serde_json::Value::from(default.port));
        }

        environment
            .into_iter()
            .map(|(k, v)| {
                format!(
                    "{k}={}",
                    match v {
                        serde_json::Value::String(s) => s,
                        _ => v.to_string(),
                    }
                )
            })
            .collect()
    }

    pub async fn container_config(
        &self,
        config: &crate::config::Config,
        client: &bollard::Docker,
        filesystem: &super::filesystem::Filesystem,
    ) -> bollard::container::Config<String> {
        let mut labels = self.labels.clone();
        labels.insert("Service".into(), config.app_name.clone());
        labels.insert("ContainerType".into(), "server_process".into());

        let network_mode = if self.allocations.force_outgoing_ip
            && let Some(default) = &self.allocations.default
        {
            let network_name = format!("ip-{}", default.ip.replace('.', "-").replace(':', "--"));

            if client
                .inspect_network::<String>(&network_name, None)
                .await
                .is_err()
                && let Err(err) = client
                    .create_network(bollard::network::CreateNetworkOptions {
                        name: network_name.as_str(),
                        driver: "bridge",
                        enable_ipv6: false,
                        internal: false,
                        attachable: false,
                        ingress: false,
                        options: HashMap::from([
                            ("encryption", "false"),
                            ("com.docker.network.bridge.default_bridge", "false"),
                            ("com.docker.network.host_ipv4", &default.ip),
                        ]),
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
            config.docker.network.mode.clone()
        };

        let resources = self.convert_container_resources(config);

        bollard::container::Config {
            exposed_ports: Some(self.convert_allocations_exposed()),
            host_config: Some(bollard::secret::HostConfig {
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
                mounts: Some(self.convert_mounts(config, filesystem).await),
                devices: Some(self.convert_devices()),
                network_mode: Some(network_mode),
                dns: Some(config.docker.network.dns.clone()),
                tmpfs: Some(HashMap::from([(
                    "/tmp".to_string(),
                    format!("rw,exec,nosuid,size={}M", config.docker.tmpfs_size),
                )])),
                log_config: Some(bollard::secret::HostConfigLogConfig {
                    typ: Some(config.docker.log_config.r#type.clone()),
                    config: Some(
                        config
                            .docker
                            .log_config
                            .config
                            .iter()
                            .map(|(k, v)| (k.clone(), v.clone()))
                            .collect(),
                    ),
                }),
                security_opt: Some(vec![
                    "no-new-privileges".to_string(),
                    seccomp::Seccomp::default()
                        .remove_names(
                            &self.container.seccomp.remove_allowed,
                            seccomp::Action::Allow,
                        )
                        .to_string()
                        .unwrap(),
                ]),
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
                userns_mode: string_to_option(&config.docker.userns_mode),
                readonly_rootfs: Some(true),
                ..Default::default()
            }),
            hostname: Some(self.uuid.to_string()),
            domainname: string_to_option(&config.docker.domainname),
            entrypoint: self.entrypoint.clone(),
            image: Some(self.container.image.trim_end_matches('~').to_string()),
            env: Some(self.environment(config)),
            user: Some(if config.system.user.rootless.enabled {
                format!(
                    "{}:{}",
                    config.system.user.rootless.container_uid,
                    config.system.user.rootless.container_gid
                )
            } else {
                format!("{}:{}", config.system.user.uid, config.system.user.gid)
            }),
            labels: Some(labels),
            attach_stdin: Some(true),
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            open_stdin: Some(true),
            tty: Some(true),
            ..Default::default()
        }
    }

    pub fn container_update_config(
        &self,
        config: &crate::config::Config,
    ) -> bollard::container::UpdateContainerOptions<String> {
        let resources = self.convert_container_resources(config);

        bollard::container::UpdateContainerOptions {
            memory: resources.memory,
            memory_reservation: resources.memory_reservation,
            memory_swap: resources.memory_swap,
            cpu_quota: resources.cpu_quota,
            cpu_period: resources.cpu_period,
            cpu_shares: resources.cpu_shares.map(|s| s as isize),
            cpuset_cpus: resources.cpuset_cpus,
            pids_limit: resources.pids_limit,
            blkio_weight: resources.blkio_weight,
            oom_kill_disable: resources.oom_kill_disable,
            ..Default::default()
        }
    }
}
