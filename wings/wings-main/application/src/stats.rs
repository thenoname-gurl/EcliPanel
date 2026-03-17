use serde::Serialize;
use std::{path::Path, sync::Arc};
use sysinfo::{Disks, Networks, System};
use tokio::sync::RwLockReadGuard;
use utoipa::ToSchema;

#[derive(ToSchema, Serialize, Default)]
struct SystemCpuStats {
    used: f32,
    threads: usize,
    model: String,
}

#[derive(ToSchema, Serialize, Default)]
struct SystemNetworkStats {
    received: u64,
    receiving_rate: f64,
    sent: u64,
    sending_rate: f64,
}

#[derive(ToSchema, Serialize, Default)]
struct SystemMemoryStats {
    used: u64,
    used_process: u64,
    total: u64,
}

#[derive(ToSchema, Serialize, Default)]
struct SystemDiskStats {
    used: u64,
    total: u64,
    read: u64,
    reading_rate: f64,
    written: u64,
    writing_rate: f64,
}

#[derive(ToSchema, Serialize, Default)]
pub struct SystemStats {
    #[schema(inline)]
    cpu: SystemCpuStats,
    #[schema(inline)]
    network: SystemNetworkStats,
    #[schema(inline)]
    memory: SystemMemoryStats,
    #[schema(inline)]
    disk: SystemDiskStats,
}

pub struct StatsManager {
    stats: Arc<tokio::sync::RwLock<SystemStats>>,
}

impl StatsManager {
    #[inline]
    pub async fn get_stats(&self) -> RwLockReadGuard<'_, SystemStats> {
        self.stats.read().await
    }
}

impl Default for StatsManager {
    fn default() -> Self {
        let stats = Arc::new(tokio::sync::RwLock::new(SystemStats::default()));

        std::thread::spawn({
            let stats = Arc::clone(&stats);

            move || {
                let mut sys = System::new_all();
                let mut disks = Disks::new_with_refreshed_list();
                let mut networks = Networks::new_with_refreshed_list();

                loop {
                    std::thread::sleep(std::time::Duration::from_millis(500));

                    sys.refresh_all();
                    networks.refresh(true);
                    for disk in disks.list_mut() {
                        if disk.mount_point() == Path::new("/") {
                            disk.refresh();
                        }
                    }

                    let mut used_memory_process = 0;
                    if let Ok(current_pid) = sysinfo::get_current_pid() {
                        sys.refresh_processes_specifics(
                            sysinfo::ProcessesToUpdate::Some(&[current_pid]),
                            false,
                            sysinfo::ProcessRefreshKind::nothing().with_memory(),
                        );

                        if let Some(process) = sys.process(current_pid) {
                            used_memory_process = process.memory();
                        }
                    }

                    let total_memory = sys.total_memory();
                    let used_memory = sys.used_memory();

                    let disk = disks
                        .iter()
                        .find(|d| d.mount_point() == Path::new("/"))
                        .unwrap_or(&disks[0]);
                    let total_disk_space = disk.total_space();
                    let used_disk_space = disk.total_space() - disk.available_space();
                    let total_disk_read = disk.usage().total_read_bytes;
                    let disk_read_rate = disk.usage().read_bytes as f64;
                    let total_disk_write = disk.usage().total_written_bytes;
                    let disk_write_rate = disk.usage().written_bytes as f64;

                    let mut total_received = 0;
                    let mut net_in_rate = 0.0;
                    let mut total_transmitted = 0;
                    let mut net_out_rate = 0.0;
                    for (_, network) in networks.iter() {
                        total_received += network.total_received();
                        net_in_rate += network.received() as f64;
                        total_transmitted += network.total_transmitted();
                        net_out_rate += network.transmitted() as f64;
                    }

                    let cpu_usage = sys.global_cpu_usage();
                    let cpu_threads = sys.cpus().len();
                    let cpu_model = sys
                        .cpus()
                        .first()
                        .map_or_else(|| "unknown".to_string(), |cpu| cpu.brand().to_string());

                    *stats.blocking_write() = SystemStats {
                        cpu: SystemCpuStats {
                            used: cpu_usage,
                            threads: cpu_threads,
                            model: cpu_model,
                        },
                        network: SystemNetworkStats {
                            received: total_received,
                            receiving_rate: net_in_rate,
                            sent: total_transmitted,
                            sending_rate: net_out_rate,
                        },
                        memory: SystemMemoryStats {
                            used: used_memory,
                            used_process: used_memory_process,
                            total: total_memory,
                        },
                        disk: SystemDiskStats {
                            used: used_disk_space,
                            total: total_disk_space,
                            read: total_disk_read,
                            reading_rate: disk_read_rate,
                            written: total_disk_write,
                            writing_rate: disk_write_rate,
                        },
                    };
                }
            }
        });

        Self { stats }
    }
}
