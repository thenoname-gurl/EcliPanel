use clap::{Parser, Subcommand};
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{fs, net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};
use tokio::{io::{copy_bidirectional, AsyncWriteExt}, net::TcpStream, sync::Mutex};
use tokio_tungstenite::{connect_async, tungstenite::{client::IntoClientRequest, protocol::Message}, WebSocketStream, MaybeTlsStream};
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;
type WsSink = futures_util::stream::SplitSink<WsStream, Message>;
#[derive(Parser)]
#[command(name = "ecli-tunnel-client")]
struct Args {
    #[command(subcommand)]
    command: Command,
    #[arg(long, global = true)]
    verbose: bool,
}

#[derive(Subcommand)]
enum Command {
    Enroll {
        #[arg(long, default_value_t = String::from("client-agent"))]
        name: String,
        #[arg(long, default_value_t = String::from("https://ecli.app"))]
        backend: String,
        #[arg(long)]
        admin_token: Option<String>,
    },
    Run {
        #[arg(long, default_value_t = String::from("https://ecli.app"))]
        backend: String,
        #[arg(long)]
        token: Option<String>,
        #[arg(long)]
        local_host: Option<String>,
        #[arg(long)]
        local_port: Option<u16>,
        #[arg(long, default_value_t = String::from("tcp"))]
        protocol: String,
    },
    Open {
        #[arg(long, default_value_t = String::from("127.0.0.1"))]
        local_host: String,
        #[arg(long, default_value_t = 8080)]
        local_port: u16,
        #[arg(long, default_value_t = String::from("tcp"))]
        protocol: String,
        #[arg(long, default_value_t = String::from("https://ecli.app"))]
        backend: String,
        #[arg(long)]
        token: Option<String>,
    },
}

#[derive(Deserialize)]
struct StartResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    #[allow(dead_code)]
    expires_in: u64,
}

#[derive(Deserialize)]
struct PollResponse {
    access_token: String,
    #[allow(dead_code)]
    token_type: String,
    #[allow(dead_code)]
    expires_in: u64,
}

#[derive(Deserialize)]
struct ConnectionOpenMessage {
    #[serde(rename = "allocationId")]
    #[allow(dead_code)]
    allocation_id: u64,
    #[serde(rename = "connectionId")]
    connection_id: String,
    #[serde(rename = "localHost")]
    local_host: String,
    #[serde(rename = "localPort")]
    local_port: u16,
    #[serde(rename = "publicHost")]
    public_host: String,
    #[serde(rename = "publicPort")]
    public_port: u16,
    #[serde(rename = "directToken")]
    direct_token: String,
}

#[derive(Serialize)]
struct OutgoingMessage<'a> {
    #[serde(rename = "type")]
    type_name: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "allocationId")]
    allocation_id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "connectionId")]
    connection_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>,
}

#[derive(Deserialize)]
struct AllocationEnvelope {
    allocation: AllocationResponse,
}

#[derive(Deserialize)]
struct AllocationResponse {
    host: String,
    port: u16,
    #[serde(rename = "localHost")]
    local_host: String,
    #[serde(rename = "localPort")]
    local_port: u16,
}

#[derive(Serialize, Deserialize)]
struct ClientConfig {
    backend: String,
    token: String,
}

fn config_path() -> PathBuf {
    let mut path = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push(".ecli-tunnel-client.json");
    path
}

fn save_config(config: &ClientConfig) -> anyhow::Result<()> {
    let contents = serde_json::to_string_pretty(config)?;
    fs::write(config_path(), contents)?;
    Ok(())
}

fn load_config() -> anyhow::Result<ClientConfig> {
    let data = fs::read_to_string(config_path())?;
    let config = serde_json::from_str(&data)?;
    Ok(config)
}

#[tokio::main]
async fn main() {
    let args = Args::parse();
    let env_filter = std::env::var("RUST_LOG").ok();
    let filter = env_filter.unwrap_or_else(|| {
        if args.verbose {
            "info".to_string()
        } else {
            "warn".to_string()
        }
    });
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::new(filter))
        .init();
    match args.command {
        Command::Enroll { name, backend, admin_token } => enroll(name, backend, admin_token).await,
        Command::Run { backend, token, local_host, local_port, protocol } => {
            run(backend, token, local_host, local_port, protocol).await
        }
        Command::Open { local_host, local_port, protocol, backend, token } => open_tunnel(local_host, local_port, protocol, backend, token).await,
    }
}

async fn enroll(name: String, backend: String, admin_token: Option<String>) {
    let client = Client::new();
    let mut request = client
        .post(format!("{}/api/tunnel/device/start", backend))
        .json(&serde_json::json!({ "name": name, "kind": "client" }));

    if let Some(token) = admin_token {
        request = request.header("Authorization", format!("Bearer {}", token));
    }

    let start = request
        .send()
        .await
        .expect("failed to start enrollment")
        .json::<StartResponse>()
        .await
        .expect("invalid response");

    println!("Open {} and enter code: {}", start.verification_uri, start.user_code);
    println!("Waiting for approval...");

    loop {
        let resp = client
            .post(format!("{}/api/tunnel/device/poll", backend))
            .json(&serde_json::json!({ "device_code": start.device_code }))
            .send()
            .await;

        match resp {
            Ok(r) => {
                if r.status().is_success() {
                    let payload = r.json::<PollResponse>().await.expect("invalid poll response");
                    let config = ClientConfig { backend: backend.clone(), token: payload.access_token };
                    save_config(&config).expect("failed to save config");
                    println!("Approved! Token stored in {}", config_path().display());
                    return;
                }
                let status = r.status();
                if status.as_u16() != 428 {
                    let body = r.text().await.unwrap_or_default();
                    error!(status = %status, body = %body, "enroll failed");
                    return;
                }
            }
            Err(err) => {
                error!(%err, "poll error");
            }
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}

async fn open_tunnel(local_host: String, local_port: u16, protocol: String, backend: String, token: Option<String>) {
    let config = if let Some(token) = token {
        ClientConfig { backend: backend.clone(), token }
    } else {
        load_config().expect("failed to load client config; run enroll first or set --token")
    };

    let client = Client::new();
    let response = client
        .post(format!("{}/api/tunnel/allocations", config.backend))
        .header("Authorization", format!("Bearer {}", config.token))
        .json(&serde_json::json!({
            "local_host": local_host,
            "local_port": local_port,
            "protocol": protocol,
        }))
        .send()
        .await
        .expect("failed to request allocation");

    let payload = response
        .json::<AllocationEnvelope>()
        .await
        .expect("failed to parse allocation response");
    println!(
        "Tunnel ready: {}:{} -> {}:{}",
        payload.allocation.host,
        payload.allocation.port,
        payload.allocation.local_host,
        payload.allocation.local_port
    );
}

async fn run(
    backend: String,
    token_arg: Option<String>,
    local_host: Option<String>,
    local_port: Option<u16>,
    protocol: String,
) {
    let config = if let Some(token) = token_arg {
        ClientConfig { backend: backend.clone(), token }
    } else {
        load_config().expect("failed to load client config; run enroll first or set --token")
    };

    if let Some(port) = local_port {
        let host = local_host.unwrap_or_else(|| String::from("127.0.0.1"));
        let client = Client::new();
        let response = client
            .post(format!("{}/api/tunnel/allocations", config.backend))
            .header("Authorization", format!("Bearer {}", config.token))
            .json(&serde_json::json!({
                "local_host": host,
                "local_port": port,
                "protocol": protocol,
            }))
            .send()
            .await
            .expect("failed to request allocation");

        let payload = response
            .json::<AllocationEnvelope>()
            .await
            .expect("failed to parse allocation response");
        println!(
            "Tunnel ready: {}:{} -> {}:{}",
            payload.allocation.host,
            payload.allocation.port,
            payload.allocation.local_host,
            payload.allocation.local_port
        );
    }

    let url = config.backend.replace("http://", "ws://").replace("https://", "wss://") + "/api/tunnel/ws";
    info!(%url, "connecting to backend");

    let mut request = url
        .into_client_request()
        .expect("failed to build websocket request");
    request
        .headers_mut()
        .insert("authorization", format!("Bearer {}", config.token).parse().expect("invalid token"));

    let (ws_stream, _) = connect_async(request).await.expect("failed to connect websocket");
    info!("connected");

    let (write, mut read) = ws_stream.split();
    let write = Arc::new(Mutex::new(write));
    let write_clone = write.clone();

    tokio::spawn(async move {
        while let Some(message) = read.next().await {
            match message {
                Ok(Message::Text(txt)) => {
                    let msg: serde_json::Value = match serde_json::from_str(&txt) {
                        Ok(value) => value,
                        Err(err) => {
                            error!(%err, "invalid JSON from backend");
                            continue;
                        }
                    };

                    match msg.get("type").and_then(|v| v.as_str()) {
                        Some("connection.open") => {
                            match serde_json::from_value::<ConnectionOpenMessage>(msg) {
                                Ok(open) => {
                                    let write = write_clone.clone();
                                    tokio::spawn(async move {
                                        handle_client_connection(open, write).await;
                                    });
                                }
                                Err(err) => {
                                    error!(%err, "failed to parse connection.open");
                                }
                            }
                        }
                        Some("pong") => {}
                        _ => {}
                    }
                }
                Ok(Message::Ping(data)) => {
                    let mut writer = write_clone.lock().await;
                    let _ = writer.send(Message::Pong(data)).await;
                }
                _ => {}
            }
        }
    });

    tokio::signal::ctrl_c().await.expect("failed to install CTRL+C handler");
    info!("shutting down");
}

async fn handle_client_connection(open: ConnectionOpenMessage, write: Arc<Mutex<WsSink>>) {
    let local_addr: SocketAddr = format!("{}:{}", open.local_host, open.local_port)
        .parse()
        .expect("invalid local target address");

    let server_addr = format!("{}:{}", open.public_host, open.public_port);
    let mut server_stream = match TcpStream::connect(&server_addr).await {
        Ok(stream) => stream,
        Err(err) => {
            error!(%err, "failed to connect server tunnel");
            return;
        }
    };

    let handshake = format!("ECLI-DIRECT {} {}\n", open.connection_id, open.direct_token);
    if let Err(err) = server_stream.write_all(handshake.as_bytes()).await {
        error!(%err, "failed to send direct handshake");
        return;
    }

    let mut local_stream = match TcpStream::connect(local_addr).await {
        Ok(stream) => stream,
        Err(err) => {
            error!(%err, "failed to connect local target");
            return;
        }
    };

    let _ = copy_bidirectional(&mut server_stream, &mut local_stream).await;

    let close = OutgoingMessage {
        type_name: "connection.close",
        allocation_id: None,
        connection_id: Some(open.connection_id),
        data: None,
    };
    let payload = serde_json::to_string(&close).expect("failed to serialize close message");
    write.lock().await.send(Message::Text(payload)).await.ok();
}
