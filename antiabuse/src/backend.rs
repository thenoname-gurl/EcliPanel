use crate::config::Config;
use anyhow::{Context, Result};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde_json::Value;

#[derive(Clone)]
pub struct BackendClient {
    client: reqwest::Client,
    backend_url: String,
}

impl BackendClient {
    pub fn new(config: &Config) -> Result<Self> {
        let mut headers = HeaderMap::new();
        let auth = format!("ApiKey {}", config.api_key);
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&auth).context("invalid API key header")?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .context("failed to build reqwest client")?;

        Ok(Self {
            client,
            backend_url: config.backend_url.clone(),
        })
    }

    pub async fn fetch_servers(&self) -> Result<Vec<Value>> {
        let url = format!("{}/servers", self.backend_url);
        let res = self
            .client
            .get(url)
            .send()
            .await
            .context("request /servers failed")?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            anyhow::bail!("/servers failed: {} {}", status, body);
        }

        let data = res.json::<Vec<Value>>().await.context("invalid /servers JSON")?;
        Ok(data)
    }

    pub async fn fetch_server_network(&self, server_id: &str) -> Result<Value> {
        let url = format!("{}/servers/{}/network", self.backend_url, server_id);
        let res = self
            .client
            .get(url)
            .send()
            .await
            .with_context(|| format!("request /servers/{}/network failed", server_id))?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            anyhow::bail!("/servers/{}/network failed: {} {}", server_id, status, body);
        }

        let data = res
            .json::<Value>()
            .await
            .with_context(|| format!("invalid /servers/{}/network JSON", server_id))?;
        Ok(data)
    }

    pub async fn suspend_server(&self, server_id: &str, reason: &str) -> Result<()> {
        let url = format!("{}/servers/{}/suspend", self.backend_url, server_id);
        let res = self
            .client
            .post(url)
            .json(&serde_json::json!({
                "source": "anti abuse system",
                "reason": reason,
            }))
            .send()
            .await
            .with_context(|| format!("request suspend failed for {}", server_id))?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            anyhow::bail!("suspend failed for {}: {} {}", server_id, status, body);
        }

        Ok(())
    }

    pub async fn throttle_server(
        &self,
        server_id: &str,
        cpu_limit_percent: u16,
        duration_seconds: u64,
        reason: &str,
    ) -> Result<()> {
        let url = format!("{}/admin/servers/{}/throttle", self.backend_url, server_id);
        let res = self
            .client
            .post(url)
            .json(&serde_json::json!({
                "cpuLimitPercent": cpu_limit_percent,
                "durationSeconds": duration_seconds,
                "reason": reason,
                "source": "antiabuse-daemon",
            }))
            .send()
            .await
            .with_context(|| format!("request throttle failed for {}", server_id))?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            anyhow::bail!("throttle failed for {}: {} {}", server_id, status, body);
        }

        Ok(())
    }

    pub async fn report_incident(&self, payload: Value) -> Result<()> {
        let url = format!("{}/admin/antiabuse/events", self.backend_url);
        let res = self
            .client
            .post(url)
            .json(&payload)
            .send()
            .await
            .context("request antiabuse event failed")?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            anyhow::bail!("antiabuse event failed: {} {}", status, body);
        }

        Ok(())
    }

    pub async fn send_heartbeat(&self, payload: Value) -> Result<()> {
        let url = format!("{}/admin/antiabuse/heartbeat", self.backend_url);
        let res = self
            .client
            .post(url)
            .json(&payload)
            .send()
            .await
            .context("request antiabuse heartbeat failed")?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            anyhow::bail!("antiabuse heartbeat failed: {} {}", status, body);
        }

        Ok(())
    }
}