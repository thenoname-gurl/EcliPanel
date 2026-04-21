use clap::{Parser, Subcommand};
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{fs, net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};
use tokio::{io::{copy_bidirectional, AsyncReadExt, AsyncWriteExt}, net::{TcpStream, UdpSocket}, sync::Mutex};
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
    Allocations {
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
    #[serde(default)]
    protocol: Option<String>,
    #[serde(rename = "directPort")]
    direct_port: Option<u16>,
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
struct AllocationsEnvelope {
    allocations: Vec<AllocationItem>,
}

#[derive(Deserialize)]
struct AllocationItem {
    id: u64,
    host: String,
    port: u16,
    protocol: String,
    status: String,
    #[serde(rename = "localHost")]
    local_host: String,
    #[serde(rename = "localPort")]
    local_port: u16,
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
        Command::Allocations { backend, token } => manage_allocations(backend, token).await,
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

async fn manage_allocations(backend: String, token: Option<String>) {
    let config = if let Some(token) = token {
        ClientConfig { backend: backend.clone(), token }
    } else {
        load_config().expect("failed to load client config; run enroll first or set --token")
    };

    loop {
        let allocations = match list_allocations(&config).await {
            Ok(items) => items,
            Err(err) => {
                error!(%err, "failed to list allocations");
                return;
            }
        };

        if allocations.is_empty() {
            println!("No allocations found.");
            return;
        }

        println!("Allocations ({})", allocations.len());
        let public_header = "Public";
        let local_header = "Local";
        let proto_header = "Proto";
        let status_header = "Status";

        let mut public_width = public_header.len();
        let mut local_width = local_header.len();
        let mut proto_width = proto_header.len();
        let mut status_width = status_header.len();

        for item in &allocations {
            public_width = public_width.max(format!("{}:{}", item.host, item.port).len());
            local_width = local_width.max(format!("{}:{}", item.local_host, item.local_port).len());
            proto_width = proto_width.max(item.protocol.len());
            status_width = status_width.max(item.status.len());
        }

        println!(
            " #  {:<public_width$} {:<local_width$} {:<proto_width$} {:<status_width$}",
            public_header,
            local_header,
            proto_header,
            status_header,
            public_width = public_width,
            local_width = local_width,
            proto_width = proto_width,
            status_width = status_width
        );
        println!(
            "--- {:<public_width$} {:<local_width$} {:<proto_width$} {:<status_width$}",
            "-".repeat(public_width),
            "-".repeat(local_width),
            "-".repeat(proto_width),
            "-".repeat(status_width),
            public_width = public_width,
            local_width = local_width,
            proto_width = proto_width,
            status_width = status_width
        );

        for (idx, item) in allocations.iter().enumerate() {
            let public_value = format!("{}:{}", item.host, item.port);
            let local_value = format!("{}:{}", item.local_host, item.local_port);
            println!(
                "{:>2}  {:<public_width$} {:<local_width$} {:<proto_width$} {:<status_width$}",
                idx + 1,
                public_value,
                local_value,
                item.protocol,
                item.status,
                public_width = public_width,
                local_width = local_width,
                proto_width = proto_width,
                status_width = status_width
            );
        }

        let choice = prompt("Select allocation number(s), 'all', or q to quit");
        if choice.eq_ignore_ascii_case("q") {
            return;
        }
        let selections = match parse_selection(&choice, allocations.len()) {
            Ok(values) => values,
            Err(message) => {
                println!("{}", message);
                continue;
            }
        };

        let action = prompt("Action: [c]lose, [d]elete, [e]dit, [q]uit");
        if action.eq_ignore_ascii_case("q") {
            return;
        }

        if action.eq_ignore_ascii_case("c") {
            let mut ok_count = 0;
            for index in &selections {
                let selected = &allocations[*index];
                if selected.status == "closed" {
                    continue;
                }
                match close_allocation(&config, selected.id).await {
                    Ok(()) => ok_count += 1,
                    Err(err) => error!(%err, "failed to close allocation"),
                }
            }
            println!("Closed {} allocation(s).", ok_count);
            return;
        } else if action.eq_ignore_ascii_case("d") {
            let mut ok_count = 0;
            for index in &selections {
                let selected = &allocations[*index];
                match delete_allocation(&config, selected.id).await {
                    Ok(()) => ok_count += 1,
                    Err(err) => error!(%err, "failed to delete allocation"),
                }
            }
            println!("Deleted {} allocation(s).", ok_count);
            return;
        } else if action.eq_ignore_ascii_case("e") {
            let mut ok_count = 0;
            for index in &selections {
                let selected = &allocations[*index];
                let new_port = prompt(&format!(
                    "New local port for allocation {} ({}:{})",
                    selected.id, selected.local_host, selected.local_port
                ));
                if new_port.eq_ignore_ascii_case("q") || new_port.eq_ignore_ascii_case("exit") {
                    println!("Edit cancelled.");
                    return;
                }
                let port: u16 = match new_port.parse::<u16>() {
                    Ok(value) => value,
                    Err(_) => {
                        println!("Invalid port.");
                        continue;
                    }
                };
                match edit_allocation(&config, selected.id, port).await {
                    Ok(()) => ok_count += 1,
                    Err(err) => error!(%err, "failed to edit allocation"),
                }
            }
            println!("Updated {} allocation(s).", ok_count);
            return;
        } else {
            println!("Unknown action.");
        }
    }
}

async fn list_allocations(config: &ClientConfig) -> anyhow::Result<Vec<AllocationItem>> {
    let client = Client::new();
    let response = client
        .get(format!("{}/api/tunnel/allocations", config.backend))
        .header("Authorization", format!("Bearer {}", config.token))
        .send()
        .await?;
    let payload = response.json::<AllocationsEnvelope>().await?;
    Ok(payload.allocations)
}

async fn close_allocation(config: &ClientConfig, allocation_id: u64) -> anyhow::Result<()> {
    let client = Client::new();
    client
        .post(format!("{}/api/tunnel/allocations/{}/close", config.backend, allocation_id))
        .header("Authorization", format!("Bearer {}", config.token))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

async fn edit_allocation(config: &ClientConfig, allocation_id: u64, local_port: u16) -> anyhow::Result<()> {
    let client = Client::new();
    client
        .post(format!("{}/api/tunnel/allocations/{}/edit", config.backend, allocation_id))
        .header("Authorization", format!("Bearer {}", config.token))
        .json(&serde_json::json!({ "local_port": local_port }))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

async fn delete_allocation(config: &ClientConfig, allocation_id: u64) -> anyhow::Result<()> {
    let client = Client::new();
    client
        .post(format!("{}/api/tunnel/allocations/{}/delete", config.backend, allocation_id))
        .header("Authorization", format!("Bearer {}", config.token))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

fn prompt(message: &str) -> String {
    use std::io::{self, Write};
    print!("{}: ", message);
    let _ = io::stdout().flush();
    let mut input = String::new();
    let _ = io::stdin().read_line(&mut input);
    input.trim().to_string()
}

fn parse_selection(input: &str, max: usize) -> Result<Vec<usize>, String> {
    let trimmed = input.trim();
    if trimmed.eq_ignore_ascii_case("all") {
        return Ok((0..max).collect());
    }

    let mut selections = Vec::new();
    for part in trimmed.split(',') {
        let value = part.trim();
        if value.is_empty() {
            continue;
        }
        let number: usize = value
            .parse::<usize>()
            .map_err(|_| "Invalid selection.".to_string())?;
        if number == 0 || number > max {
            return Err("Invalid selection.".to_string());
        }
        let index = number - 1;
        if !selections.contains(&index) {
            selections.push(index);
        }
    }

    if selections.is_empty() {
        return Err("Invalid selection.".to_string());
    }

    selections.sort_unstable();
    Ok(selections)
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
                                    info!(
                                        connection_id = %open.connection_id,
                                        protocol = ?open.protocol,
                                        public_host = %open.public_host,
                                        public_port = open.public_port,
                                        direct_port = ?open.direct_port,
                                        "received connection.open"
                                    );
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
    let inferred_protocol = match open.protocol.as_deref() {
        Some(value) => value,
        None => {
            if open.direct_port.is_some() && open.direct_port != Some(open.public_port) {
                "udp"
            } else {
                "tcp"
            }
        }
    };

    if inferred_protocol == "udp" {
        handle_client_udp(open, write).await;
        return;
    }

    let local_addr: SocketAddr = format!("{}:{}", open.local_host, open.local_port)
        .parse()
        .expect("invalid local target address");

    let direct_port = open.direct_port.unwrap_or(open.public_port);
    let server_addr = format!("{}:{}", open.public_host, direct_port);
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

async fn handle_client_udp(open: ConnectionOpenMessage, write: Arc<Mutex<WsSink>>) {
    let local_addr: SocketAddr = format!("{}:{}", open.local_host, open.local_port)
        .parse()
        .expect("invalid local target address");

    let direct_port = open.direct_port.unwrap_or(open.public_port);
    let server_addr = format!("{}:{}", open.public_host, direct_port);
    let server_stream = match TcpStream::connect(&server_addr).await {
        Ok(stream) => stream,
        Err(err) => {
            error!(%err, "failed to connect server UDP tunnel");
            return;
        }
    };

    let handshake = format!("ECLI-DIRECT {} {}\n", open.connection_id, open.direct_token);
    let mut server_stream = server_stream;
    if let Err(err) = server_stream.write_all(handshake.as_bytes()).await {
        error!(%err, "failed to send UDP handshake");
        return;
    }

    let udp_socket = match UdpSocket::bind("0.0.0.0:0").await {
        Ok(socket) => socket,
        Err(err) => {
            error!(%err, "failed to bind local UDP socket");
            return;
        }
    };

    if let Err(err) = udp_socket.connect(local_addr).await {
        error!(%err, "failed to connect local UDP target");
        return;
    }

    let (mut reader, mut writer) = server_stream.into_split();
    let udp_socket = Arc::new(udp_socket);
    let udp_in = udp_socket.clone();
    let udp_out = udp_socket.clone();

    let connection_id = open.connection_id.clone();
    let write_clone = write.clone();

    let uplink = tokio::spawn(async move {
        let mut buf = vec![0u8; 65535];
        loop {
            let n = match udp_in.recv(&mut buf).await {
                Ok(n) => n,
                Err(err) => {
                    error!(%err, "udp recv failed");
                    break;
                }
            };
            if let Err(err) = write_frame(&mut writer, &buf[..n]).await {
                error!(%err, "udp uplink write failed");
                break;
            }
        }
    });

    let downlink = tokio::spawn(async move {
        loop {
            let data = match read_frame(&mut reader).await {
                Ok(Some(frame)) => frame,
                Ok(None) => break,
                Err(err) => {
                    error!(%err, "udp downlink read failed");
                    break;
                }
            };
            if let Err(err) = udp_out.send(&data).await {
                error!(%err, "udp send failed");
                break;
            }
        }
    });

    let _ = tokio::join!(uplink, downlink);

    let close = OutgoingMessage {
        type_name: "connection.close",
        allocation_id: None,
        connection_id: Some(connection_id),
        data: None,
    };
    let payload = serde_json::to_string(&close).expect("failed to serialize close message");
    write_clone.lock().await.send(Message::Text(payload)).await.ok();
}

async fn write_frame(writer: &mut tokio::net::tcp::OwnedWriteHalf, data: &[u8]) -> anyhow::Result<()> {
    let len = data.len() as u32;
    writer.write_all(&len.to_be_bytes()).await?;
    writer.write_all(data).await?;
    Ok(())
}

async fn read_frame(reader: &mut tokio::net::tcp::OwnedReadHalf) -> anyhow::Result<Option<Vec<u8>>> {
    let mut len_buf = [0u8; 4];
    if let Err(err) = reader.read_exact(&mut len_buf).await {
        if err.kind() == std::io::ErrorKind::UnexpectedEof {
            return Ok(None);
        }
        return Err(err.into());
    }
    let len = u32::from_be_bytes(len_buf) as usize;
    let mut data = vec![0u8; len];
    reader.read_exact(&mut data).await?;
    Ok(Some(data))
}
