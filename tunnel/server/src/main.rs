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
    io::{copy_bidirectional, AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::{tcp::OwnedReadHalf, tcp::OwnedWriteHalf, TcpListener, TcpStream, UdpSocket},
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
type ListenerControl = Arc<Mutex<HashMap<u64, oneshot::Sender<()>>>>;
type ConnectionAllocationMap = Arc<Mutex<HashMap<String, u64>>>;
type DirectWaiters = Arc<Mutex<HashMap<String, oneshot::Sender<TcpStream>>>>;
type DirectTokens = Arc<Mutex<HashMap<String, String>>>;
type ConnectionShutdowns = Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>;
type UdpSessions = Arc<Mutex<HashMap<String, UdpSession>>>;
type UdpRemotes = Arc<Mutex<HashMap<SocketAddr, String>>>;
type UdpPending = Arc<Mutex<HashMap<String, Vec<Vec<u8>>>>>;

struct UdpSession {
    writer: Arc<Mutex<OwnedWriteHalf>>,
}

enum DirectClassification {
    Direct {
        stream: TcpStream,
        connection_id: String,
        token: String,
    },
    Public(TcpStream),
}

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
        #[arg(long)]
        jwt_token: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    protocol: Option<String>,
    #[serde(rename = "directPort", skip_serializing_if = "Option::is_none")]
    direct_port: Option<u16>,
    #[serde(rename = "remoteAddr", skip_serializing_if = "Option::is_none")]
    remote_addr: Option<String>,
    #[serde(rename = "remotePort", skip_serializing_if = "Option::is_none")]
    remote_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>,
}

impl OutgoingMessage {
    fn connection_open(
        allocation_id: u64,
        connection_id: &str,
        peer: SocketAddr,
        protocol: &str,
        direct_port: u16,
    ) -> Self {
        Self {
            type_name: "connection.open".into(),
            allocation_id: Some(allocation_id),
            connection_id: Some(connection_id.to_owned()),
            protocol: Some(protocol.to_owned()),
            direct_port: Some(direct_port),
            remote_addr: Some(peer.ip().to_string()),
            remote_port: Some(peer.port()),
            data: None,
        }
    }

    fn connection_close(connection_id: &str) -> Self {
        Self {
            type_name: "connection.close".into(),
            allocation_id: None,
            connection_id: Some(connection_id.to_owned()),
            protocol: None,
            direct_port: None,
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
        Command::Enroll { name, backend, jwt_token } => enroll(name, backend, jwt_token).await,
        Command::Run {
            token,
            backend,
            reconnect_delay,
        } => run(token, backend, reconnect_delay).await,
    }
}

async fn enroll(name: String, backend: String, jwt_token: Option<String>) {
    let client = Client::new();
    let backend = backend.trim_end_matches('/');

    let mut request = client
        .post(format!("{backend}/api/tunnel/device/start"))
        .json(&serde_json::json!({ "name": name, "kind": "server" }));

    if let Some(token) = jwt_token {
        request = request.header("Authorization", format!("Bearer {}", token));
    }

    let start: StartResponse = request
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
                        Err(err) if err.kind() == io::ErrorKind::PermissionDenied => {
                            info!("skipping systemd service creation (permission denied)");
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
    let listeners: ListenerControl = Arc::new(Mutex::new(HashMap::new()));
    let connection_allocations: ConnectionAllocationMap = Arc::new(Mutex::new(HashMap::new()));
    let direct_waiters: DirectWaiters = Arc::new(Mutex::new(HashMap::new()));
    let direct_tokens: DirectTokens = Arc::new(Mutex::new(HashMap::new()));
    let shutdowns: ConnectionShutdowns = Arc::new(Mutex::new(HashMap::new()));
    let udp_sessions: UdpSessions = Arc::new(Mutex::new(HashMap::new()));
    let udp_remotes: UdpRemotes = Arc::new(Mutex::new(HashMap::new()));
    let udp_pending: UdpPending = Arc::new(Mutex::new(HashMap::new()));

    while let Some(msg) = read.next().await {
        match msg? {
            Message::Text(txt) => {
                handle_text_message(
                    &txt,
                    write.clone(),
                    listeners.clone(),
                    direct_waiters.clone(),
                    direct_tokens.clone(),
                    connection_allocations.clone(),
                    shutdowns.clone(),
                    udp_sessions.clone(),
                    udp_remotes.clone(),
                    udp_pending.clone(),
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
    listeners: ListenerControl,
    direct_waiters: DirectWaiters,
    direct_tokens: DirectTokens,
    connection_allocations: ConnectionAllocationMap,
    shutdowns: ConnectionShutdowns,
    udp_sessions: UdpSessions,
    udp_remotes: UdpRemotes,
    udp_pending: UdpPending,
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
                    listeners,
                    direct_waiters,
                    direct_tokens,
                    connection_allocations,
                    shutdowns,
                    udp_sessions,
                    udp_remotes,
                    udp_pending,
                ));
            }
            Err(err) => error!(%err, "failed to parse bind message"),
        },

        Some("unbind") => {
            if let Some(allocation_id) = msg.get("allocationId").and_then(|v| v.as_u64()) {
                handle_unbind(
                    allocation_id,
                    write,
                    listeners,
                    direct_waiters,
                    direct_tokens,
                    connection_allocations,
                    shutdowns,
                    udp_sessions,
                    udp_remotes,
                    udp_pending,
                )
                .await;
            }
        }

        Some("connection.close") => {
            if let Some(connection_id) = msg.get("connectionId").and_then(|v| v.as_str()) {
                if let Some(tx) = shutdowns.lock().await.remove(connection_id) {
                    let _ = tx.send(());
                }
                connection_allocations.lock().await.remove(connection_id);
                direct_waiters.lock().await.remove(connection_id);
                direct_tokens.lock().await.remove(connection_id);
                udp_sessions.lock().await.remove(connection_id);
                udp_remotes.lock().await.retain(|_, id| id != connection_id);
                info!(%connection_id, "connection closed by remote");
            }
        }

        Some("error") => {
            let err_text = msg
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown_error");
            warn!(%err_text, raw = %txt, "received error message from backend");
        }

        Some("direct.token") => {
            if let (Some(connection_id), Some(token)) = (
                msg.get("connectionId").and_then(|v| v.as_str()),
                msg.get("directToken").and_then(|v| v.as_str()),
            ) {
                direct_tokens
                    .lock()
                    .await
                    .insert(connection_id.to_owned(), token.to_owned());
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
    listeners: ListenerControl,
    direct_waiters: DirectWaiters,
    direct_tokens: DirectTokens,
    connection_allocations: ConnectionAllocationMap,
    shutdowns: ConnectionShutdowns,
    udp_sessions: UdpSessions,
    udp_remotes: UdpRemotes,
    udp_pending: UdpPending,
) {
    if bind.protocol == "udp" {
        bind_udp_listener(
            bind,
            write,
            listeners,
            direct_waiters,
            direct_tokens,
            connection_allocations,
            shutdowns,
            udp_sessions,
            udp_remotes,
            udp_pending,
        )
        .await;
        return;
    }

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
                        tokio::spawn(handle_incoming_socket(
                            bind.allocation_id,
                            bind.port,
                            bind.protocol.clone(),
                            stream,
                            peer,
                            write.clone(),
                            direct_waiters.clone(),
                            direct_tokens.clone(),
                            connection_allocations.clone(),
                            shutdowns.clone(),
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
    listeners: ListenerControl,
    direct_waiters: DirectWaiters,
    direct_tokens: DirectTokens,
    connection_allocations: ConnectionAllocationMap,
    shutdowns: ConnectionShutdowns,
    udp_sessions: UdpSessions,
    udp_remotes: UdpRemotes,
    udp_pending: UdpPending,
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
        direct_waiters.lock().await.remove(connection_id);
        direct_tokens.lock().await.remove(connection_id);
        udp_sessions.lock().await.remove(connection_id);
        udp_remotes.lock().await.retain(|_, id| id != connection_id);
        udp_pending.lock().await.remove(connection_id);
        if let Some(tx) = shutdowns.lock().await.remove(connection_id) {
            let _ = tx.send(());
        }
        if let Err(err) = send_ws(&write, OutgoingMessage::connection_close(connection_id)).await {
            error!(%err, %connection_id, "failed to send connection.close during unbind");
        }
    }
}

async fn handle_incoming_socket(
    allocation_id: u64,
    direct_port: u16,
    protocol: String,
    stream: TcpStream,
    peer: SocketAddr,
    write: Arc<Mutex<WsSink>>,
    direct_waiters: DirectWaiters,
    direct_tokens: DirectTokens,
    connection_allocations: ConnectionAllocationMap,
    shutdowns: ConnectionShutdowns,
) {
    match classify_direct_handshake(stream).await {
        Ok(DirectClassification::Direct { stream, connection_id, token }) => {
            handle_direct_connection(stream, connection_id, token, direct_waiters, direct_tokens)
                .await;
        }
        Ok(DirectClassification::Public(stream)) => {
            let connection_id = Uuid::new_v4().to_string();
            info!(%connection_id, %peer, "accepted public connection");
            handle_public_connection(
                allocation_id,
                connection_id,
                direct_port,
                protocol,
                stream,
                peer,
                write,
                direct_waiters,
                connection_allocations,
                shutdowns,
            )
            .await;
        }
        Err(err) => error!(%err, "failed to classify connection"),
    }
}

async fn classify_direct_handshake(
    stream: TcpStream,
) -> Result<DirectClassification, io::Error> {
    let mut preview = vec![0u8; 128];
    let peek = tokio::time::timeout(Duration::from_millis(200), stream.peek(&mut preview)).await;
    let Ok(Ok(n)) = peek else {
        return Ok(DirectClassification::Public(stream));
    };

    if n == 0 {
        return Ok(DirectClassification::Public(stream));
    }

    let snippet = std::str::from_utf8(&preview[..n]).unwrap_or("");
    if !snippet.starts_with("ECLI-DIRECT ") {
        return Ok(DirectClassification::Public(stream));
    }

    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    let _ = reader.read_line(&mut line).await?;
    let stream = reader.into_inner();

    let Some((connection_id, token)) = parse_direct_handshake(&line) else {
        return Ok(DirectClassification::Public(stream));
    };

    Ok(DirectClassification::Direct {
        stream,
        connection_id,
        token,
    })
}

fn parse_direct_handshake(line: &str) -> Option<(String, String)> {
    let trimmed = line.trim();
    let mut parts = trimmed.split_whitespace();
    if parts.next()? != "ECLI-DIRECT" {
        return None;
    }
    let connection_id = parts.next()?.to_owned();
    let token = parts.next()?.to_owned();
    Some((connection_id, token))
}

async fn handle_direct_connection(
    stream: TcpStream,
    connection_id: String,
    token: String,
    direct_waiters: DirectWaiters,
    direct_tokens: DirectTokens,
) {
    let expected = wait_for_token(&direct_tokens, &connection_id, Duration::from_secs(5)).await;
    if expected.as_deref() != Some(token.as_str()) {
        warn!(%connection_id, "direct token mismatch or timeout");
        return;
    }

    direct_tokens.lock().await.remove(&connection_id);

    if let Some(tx) = direct_waiters.lock().await.remove(&connection_id) {
        let _ = tx.send(stream);
    } else {
        warn!(%connection_id, "no pending public connection for direct link");
    }
}

async fn wait_for_token(
    direct_tokens: &DirectTokens,
    connection_id: &str,
    timeout: Duration,
) -> Option<String> {
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        if let Some(token) = direct_tokens.lock().await.get(connection_id).cloned() {
            return Some(token);
        }
        if tokio::time::Instant::now() >= deadline {
            return None;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

async fn handle_public_connection(
    allocation_id: u64,
    connection_id: String,
    direct_port: u16,
    protocol: String,
    mut public_stream: TcpStream,
    peer: SocketAddr,
    write: Arc<Mutex<WsSink>>,
    direct_waiters: DirectWaiters,
    connection_allocations: ConnectionAllocationMap,
    shutdowns: ConnectionShutdowns,
) {
    connection_allocations
        .lock()
        .await
        .insert(connection_id.clone(), allocation_id);

    let (tx, rx) = oneshot::channel();
    direct_waiters.lock().await.insert(connection_id.clone(), tx);

    if let Err(err) = send_ws(
        &write,
        OutgoingMessage::connection_open(
            allocation_id,
            &connection_id,
            peer,
            &protocol,
            direct_port,
        ),
    )
    .await
    {
        error!(%err, %connection_id, "failed to send connection.open");
        direct_waiters.lock().await.remove(&connection_id);
        connection_allocations.lock().await.remove(&connection_id);
        return;
    }

    let client_stream = match tokio::time::timeout(Duration::from_secs(15), rx).await {
        Ok(Ok(stream)) => stream,
        _ => {
            warn!(%connection_id, "direct client did not connect in time");
            direct_waiters.lock().await.remove(&connection_id);
            connection_allocations.lock().await.remove(&connection_id);
            let _ = send_ws(&write, OutgoingMessage::connection_close(&connection_id)).await;
            return;
        }
    };

    let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
    shutdowns.lock().await.insert(connection_id.clone(), shutdown_tx);

    let mut client_stream = client_stream;
    tokio::select! {
        _ = copy_bidirectional(&mut public_stream, &mut client_stream) => {}
        _ = &mut shutdown_rx => {}
    }

    shutdowns.lock().await.remove(&connection_id);
    connection_allocations.lock().await.remove(&connection_id);
    let _ = send_ws(&write, OutgoingMessage::connection_close(&connection_id)).await;
}

async fn bind_udp_listener(
    bind: BindMessage,
    write: Arc<Mutex<WsSink>>,
    listeners: ListenerControl,
    direct_waiters: DirectWaiters,
    direct_tokens: DirectTokens,
    connection_allocations: ConnectionAllocationMap,
    shutdowns: ConnectionShutdowns,
    udp_sessions: UdpSessions,
    udp_remotes: UdpRemotes,
    udp_pending: UdpPending,
) {
    let addr: SocketAddr = format!("0.0.0.0:{}", bind.port)
        .parse()
        .expect("invalid bind address");

    let udp_socket = match UdpSocket::bind(addr).await {
        Ok(socket) => socket,
        Err(err) => {
            error!(%err, port = bind.port, "failed to bind UDP listener");
            return;
        }
    };

    let direct_port = match compute_direct_port(bind.port) {
        Some(port) => port,
        None => {
            error!(port = bind.port, "unable to compute UDP direct port");
            return;
        }
    };

    let tcp_listener = match TcpListener::bind(("0.0.0.0", direct_port)).await {
        Ok(listener) => listener,
        Err(err) => {
            error!(%err, port = direct_port, "failed to bind UDP direct TCP listener");
            return;
        }
    };

    info!(port = bind.port, direct_port, "listening for inbound UDP connections");

    let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
    listeners
        .lock()
        .await
        .insert(bind.allocation_id, shutdown_tx);

    let udp_socket = Arc::new(udp_socket);

    loop {
        let mut buf = vec![0u8; 65535];
        tokio::select! {
            result = udp_socket.recv_from(&mut buf) => {
                match result {
                    Ok((n, peer)) => {
                        info!(%peer, size = n, "received UDP datagram");
                        handle_udp_datagram(
                            bind.allocation_id,
                            &bind.protocol,
                            direct_port,
                            peer,
                            &buf[..n],
                            udp_socket.clone(),
                            write.clone(),
                            direct_waiters.clone(),
                            connection_allocations.clone(),
                            shutdowns.clone(),
                            udp_sessions.clone(),
                            udp_remotes.clone(),
                            udp_pending.clone(),
                        ).await;
                    }
                    Err(err) => {
                        error!(%err, "udp recv error");
                        break;
                    }
                }
            }
            result = tcp_listener.accept() => {
                match result {
                    Ok((stream, peer)) => {
                        info!(%peer, "accepted UDP direct TCP connection");
                        match classify_direct_handshake(stream).await {
                            Ok(DirectClassification::Direct { stream, connection_id, token }) => {
                                handle_direct_connection(stream, connection_id, token, direct_waiters.clone(), direct_tokens.clone()).await;
                            }
                            Ok(DirectClassification::Public(_)) => {}
                            Err(err) => error!(%err, "failed to classify UDP direct connection"),
                        }
                    }
                    Err(err) => {
                        error!(%err, "udp direct accept error");
                        break;
                    }
                }
            }
            _ = &mut shutdown_rx => {
                info!(allocation_id = bind.allocation_id, "unbind received, stopping UDP listener");
                break;
            }
        }
    }

    listeners.lock().await.remove(&bind.allocation_id);
}

async fn handle_udp_datagram(
    allocation_id: u64,
    protocol: &str,
    direct_port: u16,
    peer: SocketAddr,
    data: &[u8],
    udp_socket: Arc<UdpSocket>,
    write: Arc<Mutex<WsSink>>,
    direct_waiters: DirectWaiters,
    connection_allocations: ConnectionAllocationMap,
    shutdowns: ConnectionShutdowns,
    udp_sessions: UdpSessions,
    udp_remotes: UdpRemotes,
    udp_pending: UdpPending,
) {
    let connection_id = {
        let mut remotes = udp_remotes.lock().await;
        if let Some(id) = remotes.get(&peer) {
            id.clone()
        } else {
            let id = Uuid::new_v4().to_string();
            remotes.insert(peer, id.clone());
            id
        }
    };

    if !udp_sessions.lock().await.contains_key(&connection_id) {
        udp_pending
            .lock()
            .await
            .entry(connection_id.clone())
            .or_default()
            .push(data.to_vec());
        let (tx, rx) = oneshot::channel();
        direct_waiters.lock().await.insert(connection_id.clone(), tx);
        connection_allocations
            .lock()
            .await
            .insert(connection_id.clone(), allocation_id);

        if let Err(err) = send_ws(
            &write,
            OutgoingMessage::connection_open(
                allocation_id,
                &connection_id,
                peer,
                protocol,
                direct_port,
            ),
        )
        .await
        {
            error!(%err, %connection_id, "failed to send udp connection.open");
            direct_waiters.lock().await.remove(&connection_id);
            connection_allocations.lock().await.remove(&connection_id);
            return;
        }
        info!(%connection_id, %peer, "sent udp connection.open");

        let udp_socket = udp_socket.clone();
        let udp_sessions = udp_sessions.clone();
        let shutdowns = shutdowns.clone();
        let udp_pending = udp_pending.clone();
        tokio::spawn(async move {
            if let Ok(stream) = rx.await {
                let (reader, writer) = stream.into_split();
                let writer = Arc::new(Mutex::new(writer));
                udp_sessions.lock().await.insert(
                    connection_id.clone(),
                    UdpSession { writer: writer.clone() },
                );
                let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
                shutdowns.lock().await.insert(connection_id.clone(), shutdown_tx);
                if let Some(pending) = udp_pending.lock().await.remove(&connection_id) {
                    for frame in pending {
                        let _ = write_udp_frame(&writer, &frame).await;
                    }
                }
                tokio::select! {
                    _ = udp_downlink(reader, udp_socket.clone(), peer, connection_id.clone()) => {}
                    _ = &mut shutdown_rx => {}
                }
                shutdowns.lock().await.remove(&connection_id);
            }
        });
        return;
    }

    if let Some(session) = udp_sessions.lock().await.get(&connection_id) {
        if let Err(err) = write_udp_frame(&session.writer, data).await {
            error!(%err, %connection_id, "failed to send udp frame");
        }
    }
}

async fn udp_downlink(
    mut reader: OwnedReadHalf,
    udp_socket: Arc<UdpSocket>,
    peer: SocketAddr,
    connection_id: String,
) -> io::Result<()> {
    loop {
        match read_udp_frame(&mut reader).await? {
            Some(frame) => {
                udp_socket.send_to(&frame, peer).await?;
            }
            None => break,
        }
    }
    info!(%connection_id, "udp direct connection closed");
    Ok(())
}

async fn write_udp_frame(writer: &Arc<Mutex<OwnedWriteHalf>>, data: &[u8]) -> io::Result<()> {
    let len = data.len() as u32;
    let mut writer = writer.lock().await;
    writer.write_all(&len.to_be_bytes()).await?;
    writer.write_all(data).await?;
    Ok(())
}

async fn read_udp_frame(reader: &mut OwnedReadHalf) -> io::Result<Option<Vec<u8>>> {
    let mut len_buf = [0u8; 4];
    if let Err(err) = reader.read_exact(&mut len_buf).await {
        if err.kind() == std::io::ErrorKind::UnexpectedEof {
            return Ok(None);
        }
        return Err(err);
    }
    let len = u32::from_be_bytes(len_buf) as usize;
    let mut data = vec![0u8; len];
    reader.read_exact(&mut data).await?;
    Ok(Some(data))
}

fn compute_direct_port(port: u16) -> Option<u16> {
    if port < u16::MAX {
        return Some(port + 1);
    }
    if port > 1 {
        return Some(port - 1);
    }
    None
}

async fn send_ws(
    write: &Arc<Mutex<WsSink>>,
    msg: OutgoingMessage,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ws_msg = msg.into_ws_message()?;
    write.lock().await.send(ws_msg).await?;
    Ok(())
}