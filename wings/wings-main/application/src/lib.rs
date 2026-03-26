use std::fmt::Debug;

pub mod bins;
pub mod commands;
pub mod config;
pub mod deserialize;
pub mod io;
pub mod models;
pub mod payload;
pub mod remote;
pub mod response;
pub mod routes;
pub mod server;
pub mod ssh;
pub mod stats;
pub mod utils;

pub use payload::Payload;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const GIT_COMMIT: &str = option_env!("CARGO_GIT_COMMIT").unwrap_or("unknown");
pub const GIT_BRANCH: &str = option_env!("CARGO_GIT_BRANCH").unwrap_or("unknown");
pub const TARGET: &str = option_env!("CARGO_TARGET").unwrap_or("unknown");

pub const BUFFER_SIZE: usize = 32 * 1024;

pub fn full_version() -> String {
    if GIT_BRANCH == "unknown" {
        VERSION.to_string()
    } else {
        format!("{VERSION}:{GIT_COMMIT}@{GIT_BRANCH}")
    }
}

pub fn spawn_blocking_handled<
    F: FnOnce() -> Result<(), E> + Send + 'static,
    E: Debug + Send + 'static,
>(
    f: F,
) {
    tokio::spawn(async move {
        match tokio::task::spawn_blocking(f).await {
            Ok(Ok(_)) => {}
            Ok(Err(err)) => {
                tracing::error!("spawned blocking task failed: {:?}", err);
            }
            Err(err) => {
                tracing::error!("spawned blocking task panicked: {:?}", err);
            }
        }
    });
}

pub fn spawn_handled<
    F: std::future::Future<Output = Result<(), E>> + Send + 'static,
    E: Debug + Send + 'static,
>(
    f: F,
) {
    tokio::spawn(async move {
        match f.await {
            Ok(_) => {}
            Err(err) => {
                tracing::error!("spawned async task failed: {:?}", err);
            }
        }
    });
}

#[inline(always)]
#[cold]
fn cold_path() {}

#[inline(always)]
pub fn likely(b: bool) -> bool {
    if b {
        true
    } else {
        cold_path();
        false
    }
}

#[inline(always)]
pub fn unlikely(b: bool) -> bool {
    if b {
        cold_path();
        true
    } else {
        false
    }
}
