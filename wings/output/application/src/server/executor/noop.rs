use super::{ProcessHandle, ServerExecutor, StatusReceiver};
use std::sync::Arc;

pub struct NoopExecutor;

impl NoopExecutor {
    fn unsupported<T>() -> Result<T, anyhow::Error> {
        Err(anyhow::anyhow!(
            "container operations are not supported by the no-op executor"
        ))
    }
}

#[async_trait::async_trait]
impl ServerExecutor for NoopExecutor {
    async fn boot(&self) -> Result<(), anyhow::Error> {
        Ok(())
    }

    async fn setup_server_process(
        &self,
        _server: &crate::server::Server,
    ) -> Result<(Arc<dyn ProcessHandle>, StatusReceiver), anyhow::Error> {
        Self::unsupported()
    }

    async fn attach_server_process(
        &self,
        _server: &crate::server::Server,
    ) -> Result<(Arc<dyn ProcessHandle>, StatusReceiver), anyhow::Error> {
        Self::unsupported()
    }

    async fn cleanup_server_process(
        &self,
        _server: &crate::server::Server,
    ) -> Result<(), anyhow::Error> {
        Self::unsupported()
    }

    async fn setup_installation_process(
        &self,
        _server: &crate::server::Server,
        _script: &crate::server::installation::InstallationScript,
    ) -> Result<(Arc<dyn ProcessHandle>, StatusReceiver), anyhow::Error> {
        Self::unsupported()
    }

    async fn attach_installation_process(
        &self,
        _server: &crate::server::Server,
    ) -> Result<(Arc<dyn ProcessHandle>, StatusReceiver), anyhow::Error> {
        Self::unsupported()
    }

    async fn cleanup_installation_process(
        &self,
        _server: &crate::server::Server,
    ) -> Result<(), anyhow::Error> {
        Self::unsupported()
    }

    async fn setup_script_process(
        &self,
        _server: &crate::server::Server,
        _script: &crate::server::installation::InstallationScript,
    ) -> Result<(Arc<dyn ProcessHandle>, StatusReceiver), anyhow::Error> {
        Self::unsupported()
    }

    async fn resolve_internal_target(
        &self,
        _server: &crate::server::Server,
    ) -> Result<Option<std::net::IpAddr>, anyhow::Error> {
        Self::unsupported()
    }
}
