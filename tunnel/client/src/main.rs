use clap::{Parser, Subcommand};
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::TcpStream, sync::Mutex};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message, WebSocketStream, MaybeTlsStream};
use tracing::{error, info};

type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;
type WsSink = futures_util::stream::SplitSink<WsStream, Message>;
type SharedConnections = Arc<Mutex<HashMap<String, Arc<Mutex<TcpStream>>>>>;

#[derive(Parser)]
#[command(name = "ecli-tunnel-client")]
struct Args {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Enroll {
        #[arg(long, default_value_t = String::from("client-agent"))]
        name: String,
        #[arg(long, default_value_t = String::from("https://ecli.app"))]
        backend: String,
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
        #[arg(long, default_value = String::from("tcp"))]
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
    expires_in: u64,
}

#[derive(Deserialize)]
struct PollResponse {
    access_token: String,
    token_type: String,
    expires_in: u64,
}

#[derive(Deserialize)]
struct ConnectionOpenMessage {
    #[serde(rename = "allocationId")]
    allocation_id: u64,
    #[serde(rename = "connectionId")]
    connection_id: String,
    #[serde(rename = "localHost")]
    local_host: String,
    #[serde(rename = "localPort")]
    local_port: u16,
}

#[derive(Serialize)]
struct OutgoingMessage<'a> {
    #[serde(rename = "type")]
    type_name: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    allocationId: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    connectionId: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>,
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
    tracing_subscriber::fmt::init();
    let args = Args::parse();
    match args.command {
        Command::Enroll { name, backend } => enroll(name, backend).await,
        Command::Run { backend, token, local_host, local_port, protocol } => {
            run(backend, token, local_host, local_port, protocol).await
        }
        Command::Open { local_host, local_port, protocol, backend, token } => open_tunnel(local_host, local_port, protocol, backend, token).await,
    }
}

async fn enroll(name: String, backend: String) {
    let client = Client::new();
    let start = client
        .post(format!("{}/api/tunnel/device/start", backend))
        .json(&serde_json::json!({ "name": name, "kind": "client" }))
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
                if r.status().as_u16() != 428 {
                    let body = r.text().await.unwrap_or_default();
                    error!(status = %r.status(), body = %body, "enroll failed");
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

    let body = response.text().await.expect("failed to read response");
    println!("Allocation response: {}", body);
}

async fn run(
    backend: String,
    token_arg: Option<String>,
    local_host: Option<String>,
    local_port: Option<u16>,
    protocol: String,
) {
    let mut config = if let Some(token) = token_arg {
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

        let body = response.text().await.expect("failed to read response");
        println!("Allocation response: {}", body);
    }

    let url = config.backend.replace("http://", "ws://").replace("https://", "wss://") + "/api/tunnel/ws";
    info!(%url, "connecting to backend");

    let request = http::Request::builder()
        .uri(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .body(())
        .expect("failed to build request");

    let (ws_stream, _) = connect_async(request).await.expect("failed to connect websocket");
    info!("connected");

    let (write, mut read) = ws_stream.split();
    let write = Arc::new(Mutex::new(write));
    let tunnels: SharedConnections = Arc::new(Mutex::new(HashMap::new()));
    let write_clone = write.clone();
    let tunnels_clone = tunnels.clone();

    tokio::spawn(async move {
        while let Some(message) = read.next().await {
            match message {
                Ok(Message::Text(txt)) => {
                    if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&txt) {
                        match msg.get("type").and_then(|v| v.as_str()) {
                            Some("connection.open") => {
                                if let Ok(open) = serde_json::from_value::<ConnectionOpenMessage>(msg) {
                                    let write = write_clone.clone();
                                    let tunnels = tunnels_clone.clone();
                                    tokio::spawn(async move {
                                        handle_client_connection(open, write, tunnels).await;
                                    });
                                }
                            }
                            Some("connection.data") => {
                                if let Some(connection_id) = msg.get("connectionId").and_then(|v| v.as_str()) {
                                    if let Some(data_b64) = msg.get("data").and_then(|v| v.as_str()) {
                                        if let Ok(bytes) = base64::decode(data_b64) {
                                            let mut tunnels = tunnels_clone.lock().await;
                                            if let Some(connection) = tunnels.get_mut(connection_id) {
                                                let mut local = connection.lock().await;
                                                let _ = local.write_all(&bytes).await;
                                            }
                                        }
                                    }
                                }
                            }
                            Some("connection.close") => {
                                if let Some(connection_id) = msg.get("connectionId").and_then(|v| v.as_str()) {
                                    tunnels_clone.lock().await.remove(connection_id);
                                }
                            }
                            Some("pong") => {}
                            _ => {}
                        }
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

async fn handle_client_connection(open: ConnectionOpenMessage, write: Arc<Mutex<WsSink>>, tunnels: SharedConnections) {
    let addr: SocketAddr = format!("{}:{}", open.local_host, open.local_port)
        .parse()
        .expect("invalid local target address");

    let stream = TcpStream::connect(addr).await.expect("failed to connect local target");
    let stream = Arc::new(Mutex::new(stream));
    tunnels.lock().await.insert(open.connection_id.clone(), stream.clone());

    let mut buf = vec![0u8; 8192];
    loop {
        let mut locked = stream.lock().await;
        match locked.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                let encoded = base64::encode(&buf[..n]);
                let data = OutgoingMessage {
                    type_name: "connection.data",
                    allocationId: None,
                    connectionId: Some(open.connection_id.clone()),
                    data: Some(encoded),
                };
                let payload = serde_json::to_string(&data).expect("failed to serialize data");
                write.lock().await.send(Message::Text(payload)).await.ok();
            }
            Err(err) => {
                error!(%err, "local read failed");
                break;
            }
        }
    }

    tunnels.lock().await.remove(&open.connection_id);
    let close = OutgoingMessage {
        type_name: "connection.close",
        allocationId: None,
        connectionId: Some(open.connection_id),
        data: None,
    };
    let payload = serde_json::to_string(&close).expect("failed to serialize close message");
    write.lock().await.send(Message::Text(payload)).await.ok();
}
