use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use clap::{Parser, Subcommand};
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io,
    net::SocketAddr,
    path::{Path, PathBuf},
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader, ReadBuf},
    net::{TcpListener, TcpStream},
    sync::{oneshot, Mutex},
};
use tokio_tungstenite::{
    connect_async,
    tungstenite::client::IntoClientRequest,
    tungstenite::protocol::Message,
    MaybeTlsStream,
    WebSocketStream,
};
use anyhow::Result;
use tracing::{error, info, warn};
use uuid::Uuid;

const MAX_FRAME_SIZE: usize = 65536;
const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, Copy, PartialEq)]
enum SessionEndReason {
    CleanClose,
    FatalError,
}

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------

type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;
type WsSink = futures_util::stream::SplitSink<WsStream, Message>;
type SharedConnections =
    Arc<Mutex<HashMap<String, Arc<Mutex<Box<dyn AsyncWrite + Unpin + Send>>>>>>;
type ListenerControl = Arc<Mutex<HashMap<u64, oneshot::Sender<()>>>>;
type ConnectionAllocationMap = Arc<Mutex<HashMap<String, u64>>>;

// ---------------------------------------------------------------------------
// TLS helper structs
// ---------------------------------------------------------------------------

struct PrependReader<R> {
    prefix: Option<Vec<u8>>,
    inner: R,
}

impl<R: AsyncRead + Unpin> AsyncRead for PrependReader<R> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        if let Some(prefix) = &mut self.prefix {
            if !prefix.is_empty() {
                let to_copy = std::cmp::min(buf.remaining(), prefix.len());
                buf.put_slice(&prefix[..to_copy]);
                prefix.drain(..to_copy);
                return Poll::Ready(Ok(()));
            }
            self.prefix = None;
        }
        Pin::new(&mut self.inner).poll_read(cx, buf)
    }
}

struct CombinedStream<R, W> {
    reader: R,
    writer: W,
}

impl<R: AsyncRead + Unpin, W: Unpin> AsyncRead for CombinedStream<R, W> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        Pin::new(&mut self.reader).poll_read(cx, buf)
    }
}

impl<R: Unpin, W: AsyncWrite + Unpin> AsyncWrite for CombinedStream<R, W> {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        Pin::new(&mut self.writer).poll_write(cx, buf)
    }

    fn poll_flush(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<io::Result<()>> {
        Pin::new(&mut self.writer).poll_flush(cx)
    }

    fn poll_shutdown(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<io::Result<()>> {
        Pin::new(&mut self.writer).poll_shutdown(cx)
    }
}

// ---------------------------------------------------------------------------
// TLS config
// ---------------------------------------------------------------------------

pub fn build_acceptor_from_pem(cert_pem: &str, key_pem: &str) -> Option<tokio_rustls::TlsAcceptor> {
    let certs: Vec<rustls::pki_types::CertificateDer<'static>> =
        match rustls_pemfile::certs(&mut cert_pem.as_bytes())
            .collect::<std::result::Result<Vec<_>, _>>()
        {
            Ok(c) => c,
            Err(err) => {
                warn!(%err, "failed to parse PEM cert");
                return None;
            }
        };
    let key = match rustls_pemfile::private_key(&mut key_pem.as_bytes()) {
        Ok(Some(k)) => k,
        Ok(None) => {
            warn!("no private key found in PEM");
            return None;
        }
        Err(err) => {
            warn!(%err, "failed to parse PEM key");
            return None;
        }
    };
    let config = match rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)
    {
        Ok(c) => Arc::new(c),
        Err(err) => {
            warn!(%err, "failed to build TLS config");
            return None;
        }
    };
    Some(tokio_rustls::TlsAcceptor::from(config))
}

fn build_self_signed_acceptor(hostname: &str) -> tokio_rustls::TlsAcceptor {
    use rcgen::{CertificateParams, DistinguishedName, DnType, KeyPair, IsCa};
    let key_pair = KeyPair::generate_for(&rcgen::PKCS_ECDSA_P256_SHA256)
        .expect("failed to generate key pair");
    let mut params = CertificateParams::new(vec![hostname.to_string()])
        .expect("invalid cert params");
    params.distinguished_name = DistinguishedName::new();
    params.distinguished_name.push(DnType::CommonName, hostname);
    params.distinguished_name.push(DnType::OrganizationName, "EclipseSystems");
    params.distinguished_name.push(DnType::OrganizationalUnitName, "Misiu LLC");
    params.is_ca = IsCa::ExplicitNoCa;
    let cert = params.self_signed(&key_pair)
        .expect("failed to self-sign cert");
    let (cert_pem, key_pem) = (cert.pem(), key_pair.serialize_pem());

    let certs: Vec<rustls::pki_types::CertificateDer<'static>> =
        rustls_pemfile::certs(&mut cert_pem.as_bytes())
            .collect::<std::result::Result<Vec<_>, _>>()
            .expect("failed to parse generated cert");
    let key = rustls_pemfile::private_key(&mut key_pem.as_bytes())
        .expect("failed to parse generated key")
        .expect("no key in generated pem");
    let config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .expect("failed to build TLS config");
    tokio_rustls::TlsAcceptor::from(Arc::new(config))
}

// ---------------------------------------------------------------------------
// Systemd helpers
// ---------------------------------------------------------------------------

fn build_systemd_service(exe: &PathBuf, backend: &str, token: &str, fqdn: Option<&str>) -> String {
    let exec = exe.display();
    let workdir = exe
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .display();
    let fqdn_flag = fqdn
        .filter(|s| !s.is_empty())
        .map(|s| format!(" --fqdn {s}"))
        .unwrap_or_default();
    format!(
        r#"[Unit]
Description=EcliPanel Tunnel Server
After=network.target

[Service]
Type=simple
ExecStart={exec} run --backend {backend} --token {token}{fqdn_flag}
Restart=on-failure
RestartSec=5s
WorkingDirectory={workdir}

[Install]
WantedBy=default.target
"#
    )
}

fn write_systemd_service(exe: &PathBuf, backend: &str, token: &str, fqdn: Option<&str>) -> io::Result<PathBuf> {
    let mut path = PathBuf::from("/etc/systemd/system");
    fs::create_dir_all(&path)?;
    path.push("eclipanel-tunnel.service");
    fs::write(&path, build_systemd_service(exe, backend, token, fqdn))?;
    Ok(path)
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

#[derive(Parser)]
#[command(
  name = "ecli-tunnel-server",
  version = VERSION,
  about = "EcliPanel Tunnel Server — accepts inbound traffic on allocated ports and relays to tunnel clients"
)]
struct Args {
  #[command(subcommand)]
  command: Command,
  #[arg(long, global = true, help = "Enable verbose logging")]
  verbose: bool,
}

#[derive(Subcommand)]
enum Command {
    Enroll {
        #[arg(long, default_value = "server-agent")]
        name: String,
        #[arg(long, default_value = "https://backend.ecli.app")]
        backend: String,
    },
    Run {
        #[arg(long)]
        token: String,
        #[arg(long, default_value = "https://backend.ecli.app")]
        backend: String,
        #[arg(long, default_value_t = 1)]
        reconnect_delay: u64,
        #[arg(long, help = "FQDN of this tunnel server (used for self-signed TLS cert CN)")]
        fqdn: Option<String>,
        #[arg(long, help = "Path to TLS certificate (PEM) — auto-loads ~/.ecli/tunnel/cert.pem if omitted")]
        cert: Option<String>,
        #[arg(long, help = "Path to TLS private key (PEM)")]
        key: Option<String>,
    },
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// WebSocket message types
// ---------------------------------------------------------------------------

#[derive(Deserialize, Debug)]
struct ErrorMessage {
    error: String,
    #[serde(default)]
    message: Option<String>,
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

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() {
    let args = Args::parse();

    let env_filter = std::env::var("RUST_LOG").ok();
    let filter = env_filter.unwrap_or_else(|| {
        if args.verbose {
            "info".to_string()
        } else {
            "info".to_string()
        }
    });
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_new(&filter).unwrap_or_default(),
        )
        .init();

    match args.command {
        Command::Enroll { name, backend } => enroll(name, backend).await,
        Command::Run {
            token,
            backend,
            reconnect_delay,
            fqdn,
            cert,
            key,
        } => run(token, backend, reconnect_delay, fqdn, cert, key).await,
    }
}

// ---------------------------------------------------------------------------
// Enroll
// ---------------------------------------------------------------------------

async fn enroll(name: String, backend: String) {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("failed to build HTTP client");
    let backend = backend.trim_end_matches('/');

    let start = match client
        .post(format!("{backend}/api/tunnel/device/start"))
        .json(&serde_json::json!({ "name": name, "kind": "server" }))
        .send()
        .await
    {
        Ok(resp) => match resp.error_for_status() {
            Ok(r) => match r.json::<StartResponse>().await {
                Ok(s) => s,
                Err(err) => {
                    error!(%err, "invalid start response");
                    return;
                }
            },
            Err(err) => {
                error!(%err, "server returned error on start");
                return;
            }
        },
        Err(err) => {
            error!(%err, "failed to start enrollment");
            return;
        }
    };

    println!(
        "Open {} and enter code: {}",
        start.verification_uri, start.user_code
    );
    println!("Waiting for approval…");

    loop {
        tokio::time::sleep(Duration::from_secs(3)).await;

        let resp = client
            .post(format!("{backend}/api/tunnel/device/poll"))
            .json(&serde_json::json!({ "device_code": start.device_code }))
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => {
                let payload: PollResponse = match r.json().await {
                    Ok(p) => p,
                    Err(err) => {
                        error!(%err, "invalid poll response");
                        return;
                    }
                };

                println!();
                println!("  Approved! Token stored below.");
                println!();
                println!("  Token: {}", payload.access_token);
                println!();
                println!("  Run the server agent:");
                println!("    ecli-tunnel-server run --token {} \\", payload.access_token);
                println!("      --backend {}", backend);
                println!();

                match std::env::current_exe() {
                    Ok(exe) => {
                        match write_systemd_service(&exe, backend, &payload.access_token, None) {
                            Ok(path) => {
                                println!(
                                    "\nGenerated systemd service file: {}",
                                    path.display()
                                );
                                println!(
                                    "Enable it with: systemctl daemon-reload && \
                                     systemctl enable --now eclipanel-tunnel"
                                );
                            }
                            Err(err) => {
                                warn!(%err, "failed to write systemd service file");
                            }
                        }
                    }
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

// ---------------------------------------------------------------------------
// Run / reconnect loop
// ---------------------------------------------------------------------------

fn tunnel_cache_dir() -> PathBuf {
    let mut p = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    p.push(".ecli/tunnel");
    p
}

async fn run(
    token: String,
    backend: String,
    reconnect_delay: u64,
    fqdn: Option<String>,
    cert_path: Option<String>,
    key_path: Option<String>,
) {
    let backend = backend.trim_end_matches('/');
    let ws_url = backend
        .replace("https://", "wss://")
        .replace("http://", "ws://")
        + &format!("/api/tunnel/ws?version={VERSION}");

    // Priority: --cert/--key > ~/.ecli/tunnel/{cert,key}.pem > self-signed
    let cache = tunnel_cache_dir();
    let tls_acceptor = cert_path
        .zip(key_path)
        .and_then(|(cp, kp)| {
            match (fs::read_to_string(&cp), fs::read_to_string(&kp)) {
                (Ok(c), Ok(k)) => build_acceptor_from_pem(&c, &k),
                _ => { warn!("failed to read --cert/--key"); None }
            }
        })
        .or_else(|| {
            let cert = cache.join("cert.pem");
            let key = cache.join("key.pem");
            match (fs::read_to_string(&cert), fs::read_to_string(&key)) {
                (Ok(c), Ok(k)) => {
                    info!("loaded cert from {cert:?}");
                    build_acceptor_from_pem(&c, &k)
                }
                _ => None
            }
        })
        .or_else(|| {
            let hostname = fqdn.clone().unwrap_or_else(|| {
                gethostname::gethostname()
                    .into_string()
                    .unwrap_or_else(|_| "localhost".to_string())
            });
            info!(%hostname, "no cert found, using self-signed");
            Some(build_self_signed_acceptor(&hostname))
        });

    if tls_acceptor.is_some() {
        info!("opportunistic TLS enabled");
    } else {
        info!("running without TLS");
    }

    loop {
        info!(%ws_url, "connecting to backend");

        match try_connect_and_serve(&token, &ws_url, backend, &tls_acceptor).await {
            Ok(SessionEndReason::CleanClose) => info!("WebSocket session ended cleanly"),
            Ok(SessionEndReason::FatalError) => {
                error!("session ended due to fatal error — stopping reconnect loop");
                return;
            }
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

// ---------------------------------------------------------------------------
// Single WebSocket session
// ---------------------------------------------------------------------------

async fn try_connect_and_serve(
    token: &str,
    ws_url: &str,
    backend: &str,
    tls_acceptor: &Option<tokio_rustls::TlsAcceptor>,
) -> Result<SessionEndReason> {
    let mut request = ws_url.into_client_request()?;
    request
        .headers_mut()
        .insert("authorization", format!("Bearer {token}").parse()?);

    info!("establishing WebSocket connection...");
    let connect_start = std::time::Instant::now();
    let (ws_stream, _response) = connect_async(request).await?;
    let connect_duration = connect_start.elapsed();
    info!(elapsed_ms = connect_duration.as_millis(), "server agent connected to backend");

    let (write, mut read) = ws_stream.split();
    let write: Arc<Mutex<WsSink>> = Arc::new(Mutex::new(write));
    let tunnels: SharedConnections = Arc::new(Mutex::new(HashMap::new()));
    let listeners: ListenerControl = Arc::new(Mutex::new(HashMap::new()));
    let connection_allocations: ConnectionAllocationMap =
        Arc::new(Mutex::new(HashMap::new()));
    let fatal_error = Arc::new(Mutex::new(false));
    let update_triggered = Arc::new(Mutex::new(false));
    while let Some(msg) = read.next().await {
        match msg? {
            Message::Text(txt) => {
                handle_text_message(
                    &txt,
                    write.clone(),
                    tunnels.clone(),
                    listeners.clone(),
                    connection_allocations.clone(),
                    tls_acceptor,
                    fatal_error.clone(),
                    update_triggered.clone(),
                    backend,
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

    if *fatal_error.lock().await {
        Ok(SessionEndReason::FatalError)
    } else if *update_triggered.lock().await {
        info!("update triggered, exiting for restart");
        Ok(SessionEndReason::CleanClose)
    } else {
        Ok(SessionEndReason::CleanClose)
    }
}

// ---------------------------------------------------------------------------
// Text-frame dispatcher
// ---------------------------------------------------------------------------

async fn handle_text_message(
    txt: &str,
    write: Arc<Mutex<WsSink>>,
    tunnels: SharedConnections,
    listeners: ListenerControl,
    connection_allocations: ConnectionAllocationMap,
    tls_acceptor: &Option<tokio_rustls::TlsAcceptor>,
    fatal_error: Arc<Mutex<bool>>,
    update_triggered: Arc<Mutex<bool>>,
    backend: &str,
) {
    let msg: serde_json::Value = match serde_json::from_str(txt) {
        Ok(v) => v,
        Err(err) => {
            warn!(%err, raw = %txt, "received non-JSON text frame");
            return;
        }
    };

    match msg.get("type").and_then(|v| v.as_str()) {
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
                    tls_acceptor.clone(),
                ));
            }
            Err(err) => error!(%err, "failed to parse bind message"),
        },

        Some("unbind") => {
            if let Some(allocation_id) =
                msg.get("allocationId").and_then(|v| v.as_u64())
            {
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
            let connection_id = match msg
                .get("connectionId")
                .and_then(|v| v.as_str())
            {
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

            info!(%connection_id, size = bytes.len(), "received connection.data from backend, writing to tunnel TCP");

            let conn = {
                let tunnels = tunnels.lock().await;
                tunnels.get(&connection_id).cloned()
            };

            if let Some(conn) = conn {
                if let Err(err) = conn.lock().await.write_all(&bytes).await {
                    error!(%err, %connection_id, "write to local connection failed");
                }
                info!(%connection_id, size = bytes.len(), "wrote data to tunnel TCP");
            } else {
                warn!(%connection_id, "no tunnel found for connection.data");
            }
        }

        Some("connection.close") => {
            if let Some(connection_id) =
                msg.get("connectionId").and_then(|v| v.as_str())
            {
                if tunnels.lock().await.remove(connection_id).is_some() {
                    connection_allocations
                        .lock()
                        .await
                        .remove(connection_id);
                    info!(%connection_id, "connection closed by remote");
                }
            }
        }

        Some("connected") => {
            let device_code = msg.get("deviceCode").and_then(|v| v.as_str()).unwrap_or("unknown");
            info!(%device_code, "backend confirmed websocket connection");

            if let Some(update_available) = msg.get("updateAvailable").and_then(|v| v.as_bool()) {
                let latest = msg.get("latestVersion").and_then(|v| v.as_str()).unwrap_or("unknown");
                let current = msg.get("currentVersion").and_then(|v| v.as_str()).unwrap_or("unknown");
                if update_available {
                    warn!(%current, %latest, "update available — downloading and applying update");
                    match apply_update(backend).await {
                        Ok(()) => {
                            info!("update applied successfully — restarting");
                            *update_triggered.lock().await = true;
                            restart_service();
                        }
                        Err(err) => {
                            error!(%err, "update failed — will retry on next reconnect");
                        }
                    }
                } else {
                    info!(%current, "tunnel server is up to date");
                }
            }
        }

        Some("error") => {
            if let Ok(err_msg) = serde_json::from_value::<ErrorMessage>(msg) {
                let is_fatal = matches!(err_msg.error.as_str(), "invalid_token" | "missing_token" | "unauthorized" | "forbidden");
                if is_fatal {
                    error!(error = %err_msg.error, message = ?err_msg.message, "fatal backend error — will not reconnect");
                    *fatal_error.lock().await = true;
                } else {
                    error!(error = %err_msg.error, message = ?err_msg.message, "backend error");
                }
            } else {
                error!("received error message but failed to parse");
            }
        }

        Some("pong") => {}

        other => warn!(type_ = ?other, "unknown message type"),
    }
}

// ---------------------------------------------------------------------------
// TCP listener for a single allocation
// ---------------------------------------------------------------------------

async fn bind_listener(
    bind: BindMessage,
    write: Arc<Mutex<WsSink>>,
    tunnels: SharedConnections,
    listeners: ListenerControl,
    connection_allocations: ConnectionAllocationMap,
    tls_acceptor: Option<tokio_rustls::TlsAcceptor>,
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
                        let (mut read_half, write_half) = stream.into_split();

                        // Read first 5 bytes to detect TLS ClientHello (0x16 0x03 ...)
                        let mut peek_buf = vec![0u8; 5];
                        let n = (&mut read_half).read(&mut peek_buf).await
                            .unwrap_or(0);
                        peek_buf.truncate(n);

                        let is_tls = n >= 2 && peek_buf[0] == 0x16 && peek_buf[1] == 0x03;
                        let connection_id = Uuid::new_v4().to_string();

                        if is_tls {
                            if let Some(ref acceptor) = tls_acceptor {
                                let prepended = PrependReader {
                                    prefix: Some(peek_buf),
                                    inner: read_half,
                                };
                                let combined = CombinedStream {
                                    reader: prepended,
                                    writer: write_half,
                                };
                                match acceptor.accept(combined).await {
                                    Ok(tls_stream) => {
                                        info!(%connection_id, %peer, "accepted TLS connection");
                                        let (tls_read, tls_write) = tokio::io::split(tls_stream);
                                        tunnels.lock().await.insert(
                                            connection_id.clone(),
                                            Arc::new(Mutex::new(Box::new(tls_write))),
                                        );
                                        tokio::spawn(handle_incoming_connection(
                                            bind.allocation_id,
                                            connection_id,
                                            BufReader::new(tls_read),
                                            peer,
                                            write.clone(),
                                            tunnels.clone(),
                                            connection_allocations.clone(),
                                        ));
                                    }
                                    Err(err) => {
                                        error!(%err, %connection_id, "TLS handshake failed");
                                    }
                                }
                            } else {
                                // TLS detected but no acceptor — treat as plain
                                info!(%connection_id, %peer, "TLS data but TLS not configured, forwarding as plain");
                                let prepended = PrependReader {
                                    prefix: Some(peek_buf),
                                    inner: read_half,
                                };
                                tunnels.lock().await.insert(
                                    connection_id.clone(),
                                    Arc::new(Mutex::new(Box::new(write_half))),
                                );
                                tokio::spawn(handle_incoming_connection(
                                    bind.allocation_id,
                                    connection_id,
                                    BufReader::new(prepended),
                                    peer,
                                    write.clone(),
                                    tunnels.clone(),
                                    connection_allocations.clone(),
                                ));
                            }
                        } else {
                            let prepended = PrependReader {
                                prefix: Some(peek_buf),
                                inner: read_half,
                            };
                            tunnels.lock().await.insert(
                                connection_id.clone(),
                                Arc::new(Mutex::new(Box::new(write_half))),
                            );
                            info!(%connection_id, %peer, "accepted plain connection");
                            tokio::spawn(handle_incoming_connection(
                                bind.allocation_id,
                                connection_id,
                                BufReader::new(prepended),
                                peer,
                                write.clone(),
                                tunnels.clone(),
                                connection_allocations.clone(),
                            ));
                        }
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

// ---------------------------------------------------------------------------
// Unbind handler
// ---------------------------------------------------------------------------

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
        if let Err(err) = send_ws(
            &write,
            OutgoingMessage::connection_close(connection_id),
        )
        .await
        {
            error!(%err, %connection_id, "failed to send connection.close during unbind");
        }
    }
}

// ---------------------------------------------------------------------------
// Per-connection handler (for internet user connections)
// ---------------------------------------------------------------------------

async fn handle_incoming_connection<R>(
    allocation_id: u64,
    connection_id: String,
    mut reader: tokio::io::BufReader<R>,
    peer: SocketAddr,
    write: Arc<Mutex<WsSink>>,
    tunnels: SharedConnections,
    connection_allocations: ConnectionAllocationMap,
) where
    R: AsyncRead + Unpin + Send + 'static,
{
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

    info!(%connection_id, %peer, "WebSocket relay started");

    // Forward TCP → WebSocket.  Read data from the incoming connection
    // and send it to the client via the backend's WebSocket channel.
    let mut buf = vec![0u8; MAX_FRAME_SIZE];
    loop {
        let n = match reader.read(&mut buf).await {
            Ok(0) => {
                info!(%connection_id, "TCP connection closed by peer");
                break;
            }
            Ok(n) => n,
            Err(err) => {
                error!(%err, %connection_id, "read error");
                break;
            }
        };

        // If the tunnel was removed (connection.close from client) while we
        // were blocked on read, discard the data and stop reading.
        if tunnels.lock().await.get(&connection_id).is_none() {
            info!(%connection_id, size = n, "tunnel gone, discarding data");
            break;
        }

        info!(%connection_id, size = n, "read from TCP, forwarding as connection.data");
        let data_b64 = BASE64.encode(&buf[..n]);
        if let Err(err) = send_ws(
            &write,
            OutgoingMessage::connection_data(&connection_id, data_b64),
        )
        .await
        {
            error!(%err, %connection_id, "failed to forward data");
            break;
        }
        info!(%connection_id, size = n, "forwarded connection.data to backend");
    }

    if tunnels.lock().await.get(&connection_id).is_some() {
        cleanup(&connection_id, &write, &tunnels, &connection_allocations).await;
    }
}

// ---------------------------------------------------------------------------
// Auto-update
// ---------------------------------------------------------------------------

async fn apply_update(backend: &str) -> Result<()> {
    let download_url = format!("{}/api/tunnel/server/download", backend.trim_end_matches('/'));
    info!(%download_url, "downloading updated binary");

    let client = Client::builder()
        .timeout(Duration::from_secs(300))
        .build()?;

    let resp = client.get(&download_url).send().await?;
    if !resp.status().is_success() {
        return Err(anyhow::anyhow!("download failed: HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await?;
    info!(size = bytes.len(), "binary downloaded");

    let current_exe = std::env::current_exe()?;
    let backup_path = current_exe.with_extension("bak");

    // Backup current binary
    if let Err(err) = fs::copy(&current_exe, &backup_path) {
        warn!(%err, "failed to backup current binary");
    }

    // Write new binary
    let tmp_path = current_exe.with_extension("tmp");
    fs::write(&tmp_path, &bytes)?;

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&tmp_path)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&tmp_path, perms)?;
    }

    // Replace current binary
    fs::rename(&tmp_path, &current_exe)?;
    info!(path = ?current_exe, "binary updated");

    Ok(())
}

fn restart_service() {
    use std::os::unix::process::CommandExt;
    use std::process::Command;

    // Try systemctl restart first (systemd-managed)
    let status = Command::new("systemctl")
        .args(["restart", "eclipanel-tunnel"])
        .status();

    match status {
        Ok(s) if s.success() => {
            info!("systemctl restart succeeded");
        }
        _ => {
            warn!("systemctl restart failed, attempting exec replacement");
            // Fallback: exec the new binary with same args
            let args: Vec<String> = std::env::args().collect();
            let current_exe = std::env::current_exe()
                .unwrap_or_else(|_| PathBuf::from("ecli-tunnel-server"));
            let _ = Command::new(&current_exe)
                .args(&args[1..])
                .exec();
            error!("exec failed, exiting — please restart manually");
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async fn cleanup(
    connection_id: &str,
    write: &Arc<Mutex<WsSink>>,
    tunnels: &SharedConnections,
    connection_allocations: &ConnectionAllocationMap,
) {
    tunnels.lock().await.remove(connection_id);
    connection_allocations.lock().await.remove(connection_id);
    if let Err(err) =
        send_ws(write, OutgoingMessage::connection_close(connection_id)).await
    {
        error!(%err, %connection_id, "failed to send connection.close");
    }
}

async fn send_ws(
    write: &Arc<Mutex<WsSink>>,
    msg: OutgoingMessage,
) -> Result<()> {
    let ws_msg = msg.into_ws_message()?;
    write.lock().await.send(ws_msg).await?;
    Ok(())
}
