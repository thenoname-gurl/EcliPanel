use compact_str::ToCompactString;
use serde::{Deserialize, Serialize};
use serde_default::DefaultFromSerde;
use std::{collections::HashMap, path::PathBuf};
use utoipa::ToSchema;

pub mod process;
pub mod seccomp;

#[derive(ToSchema, Deserialize, Serialize, Clone, PartialEq, Eq)]
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
    pub condition: super::schedule::conditions::ScheduleCondition,
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
        pub allocations: #[derive(ToSchema, Deserialize, Serialize, PartialEq, Eq)] pub struct ServerConfigurationAllocations {
            pub force_outgoing_ip: bool,

            #[schema(inline)]
            pub default: Option<#[derive(ToSchema, Deserialize, Serialize, PartialEq, Eq)] pub struct ServerConfigurationAllocationsDefault {
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
        pub container: #[derive(ToSchema, Deserialize, Serialize, PartialEq, Eq)] pub struct ServerConfigurationContainer {
            pub image: compact_str::CompactString,
            pub timezone: Option<compact_str::CompactString>,

            #[serde(default)]
            pub hugepages_passthrough_enabled: bool,
            #[serde(default)]
            pub kvm_passthrough_enabled: bool,

            #[serde(default)]
            #[schema(inline)]
            pub seccomp: #[derive(ToSchema, Deserialize, Serialize, DefaultFromSerde, PartialEq, Eq)] pub struct ServerConfigurationContainerSeccomp {
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

impl ServerConfigurationBuild {
    pub fn has_pending_restart(&self, other: &Self) -> bool {
        self.memory_limit != other.memory_limit
            || self.overhead_memory != other.overhead_memory
            || self.swap != other.swap
            || self.io_weight != other.io_weight
            || self.threads != other.threads
            || self.oom_disabled != other.oom_disabled
    }
}

impl ServerConfiguration {
    #[cfg(test)]
    pub fn mock(uuid: uuid::Uuid) -> Self {
        Self {
            uuid,
            start_on_completion: None,
            meta: ServerConfigurationMeta {
                name: "Example Server".into(),
                description: "This is an example server configuration.".into(),
            },
            suspended: false,
            invocation: "java -Xmx{{SERVER_MEMORY}}M -jar server.jar".into(),
            skip_egg_scripts: false,
            entrypoint: None,
            environment: HashMap::new(),
            labels: HashMap::new(),
            backups: Vec::new(),
            schedules: Vec::new(),
            allocations: ServerConfigurationAllocations {
                force_outgoing_ip: false,
                default: None,
                mappings: HashMap::new(),
            },
            build: ServerConfigurationBuild {
                memory_limit: 2048,
                overhead_memory: 256,
                swap: 1024,
                io_weight: Some(500),
                cpu_limit: 2,
                disk_space: 10240,
                threads: None,
                oom_disabled: false,
            },
            mounts: Vec::new(),
            egg: ServerConfigurationEgg {
                id: uuid::Uuid::new_v4(),
                file_denylist: Vec::new(),
            },
            container: ServerConfigurationContainer {
                image: "example/image:latest".into(),
                timezone: None,
                hugepages_passthrough_enabled: false,
                kvm_passthrough_enabled: false,
                seccomp: ServerConfigurationContainerSeccomp {
                    remove_allowed: Vec::new(),
                },
            },
            auto_kill: ServerConfigurationAutoKill {
                enabled: false,
                seconds: 0,
            },
            auto_start_behavior: crate::models::ServerAutoStartBehavior::default(),
        }
    }

    fn machine_id_path(&self, config: &crate::config::Config) -> PathBuf {
        config.vmount_path(self.uuid).join("machine-id")
    }

    fn machine_uuid_path(&self, config: &crate::config::Config) -> PathBuf {
        config.vmount_path(self.uuid).join("machine-uuid")
    }

    async fn vmounts(&self, config: &crate::config::Config) -> Vec<Mount> {
        let mut mounts = Vec::new();

        #[cfg(unix)]
        if config.load().system.machine_id.enabled {
            mounts.push(Mount {
                default: false,
                target: "/etc/machine-id".into(),
                source: self
                    .machine_id_path(config)
                    .to_string_lossy()
                    .to_compact_string(),
                read_only: true,
            });
            if !config.load().system.user.rootless.enabled
                && tokio::fs::metadata("/sys/class/dmi/id/product_uuid")
                    .await
                    .is_ok()
            {
                mounts.push(Mount {
                    default: false,
                    target: "/sys/class/dmi/id/product_uuid".into(),
                    source: self
                        .machine_uuid_path(config)
                        .to_string_lossy()
                        .to_compact_string(),
                    read_only: true,
                });
            }
        }

        mounts
    }

    pub async fn mounts(
        &self,
        config: &crate::config::Config,
        filesystem: &super::filesystem::Filesystem,
    ) -> Vec<Mount> {
        let mut mounts = self.vmounts(config).await;

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
        if config.load().system.passwd.enabled {
            mounts.push(Mount {
                default: false,
                target: "/etc/group".into(),
                source: PathBuf::from(&config.load().system.passwd.directory)
                    .join("group")
                    .to_string_lossy()
                    .to_compact_string(),
                read_only: true,
            });
            mounts.push(Mount {
                default: false,
                target: "/etc/passwd".into(),
                source: PathBuf::from(&config.load().system.passwd.directory)
                    .join("passwd")
                    .to_string_lossy()
                    .to_compact_string(),
                read_only: true,
            });
        }

        for mount in &self.mounts {
            if config
                .load()
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
                limit => Some(
                    config
                        .load()
                        .docker
                        .overhead
                        .get_memory(limit.into())
                        .as_bytes() as i64,
                ),
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
                            .load()
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
            pids_limit: match config.load().docker.container_pid_limit {
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
        } else {
            resources.cpu_quota = Some(-1);
        }

        resources
    }

    pub fn environment(&self, config: &crate::config::Config) -> Vec<String> {
        let mut environment = self.environment.clone();
        environment.reserve(5);

        environment.insert(
            "TZ".into(),
            serde_json::Value::String(self.container.timezone.as_ref().map_or_else(
                || config.load().system.timezone.to_string(),
                |tz| tz.to_string(),
            )),
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
}
