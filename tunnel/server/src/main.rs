use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use clap::{Parser, Subcommand};
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs, io,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::{oneshot, Mutex},
};
use tokio_tungstenite::{
    connect_async, tungstenite::client::IntoClientRequest, tungstenite::protocol::Message,
    MaybeTlsStream, WebSocketStream,
};
use tracing::{error, info, warn};
use uuid::Uuid;

type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;
type WsSink = futures_util::stream::SplitSink<WsStream, Message>;
type SharedConnections = Arc<Mutex<HashMap<String, Arc<Mutex<TcpStream>>>>>;
type ListenerControl = Arc<Mutex<HashMap<u64, oneshot::Sender<()>>>>;
type ConnectionAllocationMap = Arc<Mutex<HashMap<String, u64>>>;

fn build_systemd_service(exe: &PathBuf, backend: &str, token: &str) -> String {
    let exec = exe.display();
    let workdir = exe.parent().unwrap_or_else(|| Path::new(".")).display();
    format!(
        r#"[Unit]
Description=EcliPanel Tunnel Server
After=network.target

[Service]
Type=simple
ExecStart={exec} run --backend {backend} --token {token}
Restart=on-failure
RestartSec=5s
WorkingDirectory={workdir}

[Install]
WantedBy=default.target
"#
    )
}

fn write_systemd_service(exe: &PathBuf, backend: &str, token: &str) -> io::Result<PathBuf> {
    let mut path = PathBuf::from("/etc/systemd/system");
    fs::create_dir_all(&path)?;
    path.push("eclipanel-tunnel.service");
    fs::write(&path, build_systemd_service(exe, backend, token))?;
    Ok(path)
}

#[derive(Parser)]
#[command(name = "ecli-tunnel-server", about = "Reverse tunnel client")]
struct Args {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Enroll {
        #[arg(long, default_value = "server-agent")]
        name: String,
        #[arg(long, default_value = "https://ecli.app")]
        backend: String,
    },
    Run {
        #[arg(long)]
        token: String,
        #[arg(long, default_value = "https://ecli.app")]
        backend: String,
        #[arg(long, default_value_t = 5)]
        reconnect_delay: u64,
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

#[derive(Deserialize, Debug)]
struct BindMessage {
    #[serde(rename = "allocationId")]
    allocation_id: u64,
    host: String,
    port: u16,
    protocol: String,
}

#[derive(Serialize)]
struct OutgoingMessage {
    #[serde(rename = "type")]
    type_name: String,
    #[serde(rename = "allocationId", skip_serializing_if = "Option::is_none")]
    allocation_id: Option<u64>,
    #[serde(rename = "connectionId", skip_serializing_if = "Option::is_none")]
    connection_id: Option<String>,
    #[serde(rename = "remoteAddr", skip_serializing_if = "Option::is_none")]
    remote_addr: Option<String>,
    #[serde(rename = "remotePort", skip_serializing_if = "Option::is_none")]
    remote_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>,
}

impl OutgoingMessage {
    fn connection_open(allocation_id: u64, connection_id: &str, peer: SocketAddr) -> Self {
        Self {
            type_name: "connection.open".into(),
            allocation_id: Some(allocation_id),
            connection_id: Some(connection_id.to_owned()),
            remote_addr: Some(peer.ip().to_string()),
            remote_port: Some(peer.port()),
            data: None,
        }
    }

    fn connection_data(connection_id: &str, data: String) -> Self {
        Self {
            type_name: "connection.data".into(),
            allocation_id: None,
            connection_id: Some(connection_id.to_owned()),
            remote_addr: None,
            remote_port: None,
            data: Some(data),
        }
    }

    fn connection_close(connection_id: &str) -> Self {
        Self {
            type_name: "connection.close".into(),
            allocation_id: None,
            connection_id: Some(connection_id.to_owned()),
            remote_addr: None,
            remote_port: None,
            data: None,
        }
    }

    fn into_ws_message(self) -> Result<Message, serde_json::Error> {
        Ok(Message::Text(serde_json::to_string(&self)?))
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let args = Args::parse();

    match args.command {
        Command::Enroll { name, backend } => enroll(name, backend).await,
        Command::Run {
            token,
            backend,
            reconnect_delay,
        } => run(token, backend, reconnect_delay).await,
    }
}

async fn enroll(name: String, backend: String) {
    let client = Client::new();
    let backend = backend.trim_end_matches('/');

    let start: StartResponse = client
        .post(format!("{backend}/api/tunnel/device/start"))
        .json(&serde_json::json!({ "name": name, "kind": "server" }))
        .send()
        .await
        .expect("failed to start enrollment")
        .error_for_status()
        .expect("server returned error on start")
        .json()
        .await
        .expect("invalid start response");

    println!(
        "Open {} and enter code: {}",
        start.verification_uri, start.user_code
    );
    println!("Waiting for approval…");

    loop {
        tokio::time::sleep(Duration::from_secs(3)).await;

        let mut poll_url = reqwest::Url::parse(&format!("{backend}/api/tunnel/device/poll"))
            .expect("invalid backend URL");
        poll_url
            .query_pairs_mut()
            .append_pair("device_code", &start.device_code);

        let resp = client
            .post(poll_url)
            .json(&serde_json::json!({ "device_code": start.device_code }))
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => {
                let payload: PollResponse = r.json().await.expect("invalid poll response");

                println!("\nApproved!");
                println!("Token: {}", payload.access_token);
                println!("\nRun with:");
                println!(
                    "  ecli-tunnel-server run --token {} --backend {}",
                    payload.access_token, backend
                );

                match std::env::current_exe() {
                    Ok(exe) => match write_systemd_service(&exe, backend, &payload.access_token) {
                        Ok(path) => {
                            println!("\nGenerated systemd service file: {}", path.display());
                            println!(
                                "Enable it with: systemctl daemon-reload && \
                                     systemctl enable --now eclipanel-tunnel"
                            );
                        }
                        Err(err) => {
                            warn!(%err, "failed to write systemd service file");
                        }
                    },
                    Err(err) => {
                        warn!(%err, "failed to determine current executable path");
                    }
                }
                return;
            }

            Ok(r) if r.status().as_u16() == 428 => {
                print!(".");
            }

            Ok(r) => {
                let status = r.status();
                let body = r.text().await.unwrap_or_default();
                error!(%status, %body, "enrollment failed");
                return;
            }

            Err(err) => {
                error!(%err, "poll request failed");
            }
        }
    }
}

async fn run(token: String, backend: String, reconnect_delay: u64) {
    let backend = backend.trim_end_matches('/');
    let ws_url = backend
        .replace("https://", "wss://")
        .replace("http://", "ws://")
        + "/api/tunnel/ws";

    loop {
        info!(%ws_url, "connecting to backend");

        match try_connect_and_serve(&token, &ws_url).await {
            Ok(()) => info!("WebSocket session ended cleanly"),
            Err(err) => error!(%err, "WebSocket session error"),
        }

        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                info!("shutting down");
                return;
            }
            _ = tokio::time::sleep(Duration::from_secs(reconnect_delay)) => {
                warn!("reconnecting in {}s…", reconnect_delay);
            }
        }
    }
}

async fn try_connect_and_serve(
    token: &str,
    ws_url: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut request = ws_url.into_client_request()?;
    request
        .headers_mut()
        .insert("authorization", format!("Bearer {token}").parse()?);

    let (ws_stream, _response) = connect_async(request).await?;
    info!("WebSocket connected");

    let (write, mut read) = ws_stream.split();
    let write: Arc<Mutex<WsSink>> = Arc::new(Mutex::new(write));
    let tunnels: SharedConnections = Arc::new(Mutex::new(HashMap::new()));
    let listeners: ListenerControl = Arc::new(Mutex::new(HashMap::new()));
    let connection_allocations: ConnectionAllocationMap = Arc::new(Mutex::new(HashMap::new()));

    while let Some(msg) = read.next().await {
        match msg? {
            Message::Text(txt) => {
                handle_text_message(
                    &txt,
                    write.clone(),
                    tunnels.clone(),
                    listeners.clone(),
                    connection_allocations.clone(),
                )
                .await;
            }
            Message::Ping(data) => {
                write.lock().await.send(Message::Pong(data)).await?;
            }
            Message::Close(_) => {
                info!("server closed the connection");
                break;
            }
            _ => {}
        }
    }

    Ok(())
}

async fn handle_text_message(
    txt: &str,
    write: Arc<Mutex<WsSink>>,
    tunnels: SharedConnections,
    listeners: ListenerControl,
    connection_allocations: ConnectionAllocationMap,
) {
    let msg: serde_json::Value = match serde_json::from_str(txt) {
        Ok(v) => v,
        Err(err) => {
            warn!(%err, raw = %txt, "received non-JSON text frame");
            return;
        }
    };

    let msg_type = msg.get("type").and_then(|v| v.as_str()).map(str::trim);

    match msg_type {
        Some("bind") => match serde_json::from_value::<BindMessage>(msg) {
            Ok(bind) => {
                info!(
                    allocation_id = bind.allocation_id,
                    host = %bind.host,
                    port = bind.port,
                    protocol = %bind.protocol,
                    "received bind"
                );
                tokio::spawn(bind_listener(
                    bind,
                    write,
                    tunnels,
                    listeners,
                    connection_allocations,
                ));
            }
            Err(err) => error!(%err, "failed to parse bind message"),
        },

        Some("unbind") => {
            if let Some(allocation_id) = msg.get("allocationId").and_then(|v| v.as_u64()) {
                handle_unbind(
                    allocation_id,
                    write,
                    tunnels,
                    listeners,
                    connection_allocations,
                )
                .await;
            }
        }

        Some("connection.data") => {
            let connection_id = match msg.get("connectionId").and_then(|v| v.as_str()) {
                Some(id) => id.to_owned(),
                None => return,
            };

            let data_b64 = match msg.get("data").and_then(|v| v.as_str()) {
                Some(d) => d,
                None => return,
            };

            let bytes = match BASE64.decode(data_b64) {
                Ok(b) => b,
                Err(err) => {
                    error!(%err, "base64 decode failed");
                    return;
                }
            };

            let conn = {
                let tunnels = tunnels.lock().await;
                tunnels.get(&connection_id).cloned()
            };

            if let Some(conn) = conn {
                if let Err(err) = conn.lock().await.write_all(&bytes).await {
                    error!(%err, %connection_id, "write to local connection failed");
                }
            }
        }

        Some("connection.close") => {
            if let Some(connection_id) = msg.get("connectionId").and_then(|v| v.as_str()) {
                if tunnels.lock().await.remove(connection_id).is_some() {
                    connection_allocations.lock().await.remove(connection_id);
                    info!(%connection_id, "connection closed by remote");
                }
            }
        }

        Some("connected") => {
            info!("backend confirmed websocket connection");
        }

        Some("pong") => {}

        other => warn!(type_ = ?other, "unknown message type"),
    }
}

async fn bind_listener(
    bind: BindMessage,
    write: Arc<Mutex<WsSink>>,
    tunnels: SharedConnections,
    listeners: ListenerControl,
    connection_allocations: ConnectionAllocationMap,
) {
    let addr: SocketAddr = format!("0.0.0.0:{}", bind.port)
        .parse()
        .expect("invalid bind address");

    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(err) => {
            error!(%err, port = bind.port, "failed to bind listener");
            return;
        }
    };

    info!(port = bind.port, "listening for inbound tunnel connections");

    let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
    listeners
        .lock()
        .await
        .insert(bind.allocation_id, shutdown_tx);

    loop {
        tokio::select! {
            result = listener.accept() => {
                match result {
                    Ok((stream, peer)) => {
                        let connection_id = Uuid::new_v4().to_string();
                        info!(%connection_id, %peer, "accepted connection");
                        tokio::spawn(handle_incoming_connection(
                            bind.allocation_id,
                            connection_id,
                            stream,
                            peer,
                            write.clone(),
                            tunnels.clone(),
                            connection_allocations.clone(),
                        ));
                    }
                    Err(err) => {
                        error!(%err, "accept error");
                        break;
                    }
                }
            }
            _ = &mut shutdown_rx => {
                info!(allocation_id = bind.allocation_id, "unbind received, stopping listener");
                break;
            }
        }
    }

    listeners.lock().await.remove(&bind.allocation_id);
}

async fn handle_unbind(
    allocation_id: u64,
    write: Arc<Mutex<WsSink>>,
    tunnels: SharedConnections,
    listeners: ListenerControl,
    connection_allocations: ConnectionAllocationMap,
) {
    if let Some(tx) = listeners.lock().await.remove(&allocation_id) {
        let _ = tx.send(());
    }

    let removed: Vec<String> = {
        let mut allocs = connection_allocations.lock().await;
        let ids: Vec<String> = allocs
            .iter()
            .filter_map(|(cid, &aid)| (aid == allocation_id).then(|| cid.clone()))
            .collect();
        for id in &ids {
            allocs.remove(id);
        }
        ids
    };

    for connection_id in &removed {
        tunnels.lock().await.remove(connection_id);
        if let Err(err) = send_ws(&write, OutgoingMessage::connection_close(connection_id)).await {
            error!(%err, %connection_id, "failed to send connection.close during unbind");
        }
    }
}

async fn handle_incoming_connection(
    allocation_id: u64,
    connection_id: String,
    stream: TcpStream,
    peer: SocketAddr,
    write: Arc<Mutex<WsSink>>,
    tunnels: SharedConnections,
    connection_allocations: ConnectionAllocationMap,
) {
    let stream = Arc::new(Mutex::new(stream));
    tunnels
        .lock()
        .await
        .insert(connection_id.clone(), stream.clone());
    connection_allocations
        .lock()
        .await
        .insert(connection_id.clone(), allocation_id);

    if let Err(err) = send_ws(
        &write,
        OutgoingMessage::connection_open(allocation_id, &connection_id, peer),
    )
    .await
    {
        error!(%err, %connection_id, "failed to send connection.open");
        cleanup(&connection_id, &write, &tunnels, &connection_allocations).await;
        return;
    }

    let mut buf = vec![0u8; 8192];
    loop {
        let n = {
            let mut locked = stream.lock().await;
            match locked.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => n,
                Err(err) => {
                    error!(%err, %connection_id, "read error");
                    break;
                }
            }
        };

        let encoded = BASE64.encode(&buf[..n]);
        if let Err(err) = send_ws(
            &write,
            OutgoingMessage::connection_data(&connection_id, encoded),
        )
        .await
        {
            error!(%err, %connection_id, "failed to send connection.data");
            break;
        }
    }

    cleanup(&connection_id, &write, &tunnels, &connection_allocations).await;
}

async fn cleanup(
    connection_id: &str,
    write: &Arc<Mutex<WsSink>>,
    tunnels: &SharedConnections,
    connection_allocations: &ConnectionAllocationMap,
) {
    tunnels.lock().await.remove(connection_id);
    connection_allocations.lock().await.remove(connection_id);
    if let Err(err) = send_ws(write, OutgoingMessage::connection_close(connection_id)).await {
        error!(%err, %connection_id, "failed to send connection.close");
    }
}

async fn send_ws(
    write: &Arc<Mutex<WsSink>>,
    msg: OutgoingMessage,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ws_msg = msg.into_ws_message()?;
    write.lock().await.send(ws_msg).await?;
    Ok(())
}