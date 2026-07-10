use super::State;
use crate::remote::backups::ResticBackupConfiguration;
use serde::Serialize;
use std::sync::Arc;
use tokio::process::Command;
use utoipa::ToSchema;
use utoipa_axum::router::OpenApiRouter;

mod prune;
mod stats;
mod unlock;

#[derive(ToSchema, Serialize, Clone)]
pub struct ResticTaskResult {
    started: chrono::DateTime<chrono::Utc>,
    finished: chrono::DateTime<chrono::Utc>,
    duration_ms: u128,
    successful: bool,
    data: serde_json::Value,
    stderr: compact_str::CompactString,
}

fn get_restic_cache_dir(config: &crate::config::Config) -> compact_str::CompactString {
    compact_str::format_compact!(
        "{}/.cache/restic",
        config.load().system.backup_directory.trim_end_matches('/')
    )
}

fn build_restic_command(
    config: &crate::config::Config,
    configuration: &ResticBackupConfiguration,
) -> Command {
    let mut command = Command::new("restic");
    command
        .envs(&configuration.environment)
        .arg("--json")
        .arg("--repo")
        .arg(&configuration.repository)
        .arg("--cache-dir")
        .arg(get_restic_cache_dir(config));

    if let Some(password_file) = &configuration.password_file {
        command.arg("--password-file").arg(password_file);
    }

    command
}

async fn execute_restic_command(mut command: Command, operation: &'static str) -> ResticTaskResult {
    let started = chrono::Utc::now();
    let output = command.output().await;
    let finished = chrono::Utc::now();
    let duration_ms = (finished - started).num_milliseconds().max(0) as u128;

    match output {
        Ok(output) => {
            let data =
                serde_json::from_slice::<serde_json::Value>(&output.stdout).unwrap_or_else(|_| {
                    serde_json::Value::String(String::from_utf8_lossy(&output.stdout).into_owned())
                });

            ResticTaskResult {
                started,
                finished,
                duration_ms,
                successful: output.status.success(),
                data,
                stderr: compact_str::CompactString::from_utf8_lossy(&output.stderr),
            }
        }
        Err(err) => {
            tracing::error!("failed to run restic {}: {:#?}", operation, err);

            ResticTaskResult {
                started,
                finished,
                duration_ms,
                successful: false,
                data: serde_json::Value::Null,
                stderr: compact_str::format_compact!("failed to spawn restic: {err}"),
            }
        }
    }
}

fn system_restic_configuration(config: &crate::config::Config) -> Arc<ResticBackupConfiguration> {
    let config_ref = config.load();

    Arc::new(ResticBackupConfiguration {
        repository: config_ref.system.backups.restic.repository.clone(),
        password_file: Some(config_ref.system.backups.restic.password_file.clone()),
        retry_lock_seconds: config_ref.system.backups.restic.retry_lock_seconds,
        environment: config_ref.system.backups.restic.environment.clone(),
    })
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .nest("/stats", stats::router(state))
        .nest("/prune", prune::router(state))
        .nest("/unlock", unlock::router(state))
        .with_state(state.clone())
}
