use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use clap::{Parser, Subcommand};
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};
use tokio::{
  io::{AsyncReadExt, AsyncWriteExt},
  net::{TcpStream, UdpSocket},
  sync::Mutex,
};
use tokio_tungstenite::{
  connect_async,
  tungstenite::{client::IntoClientRequest, protocol::Message},
  MaybeTlsStream, WebSocketStream,
};
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;
type WsSink = futures_util::stream::SplitSink<WsStream, Message>;
type LocalConnections = Arc<Mutex<HashMap<String, tokio::sync::mpsc::UnboundedSender<Vec<u8>>>>>;

const RECONNECT_DELAY_SECS: u64 = 5;
const MAX_FRAME_SIZE: usize = 65536;
const HTTP_TIMEOUT_SECS: u64 = 30;
const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Parser)]
#[command(
  name = "ecli-tunnel-client",
  version = VERSION,
  about = "EcliPanel Tunnel Client — exposes local services via public tunnel endpoints",
  long_about = "Connect a local service (HTTP, TCP, or UDP) to a public tunnel endpoint managed by EcliPanel.\n\
    \n\
    First, enroll the agent to obtain a token:\n\
      ecli-tunnel-client enroll --backend https://backend.ecli.app\n\
    \n\
    Then run the persistent agent that forwards traffic:\n\
      ecli-tunnel-client run --local-port 8080\n\
    \n\
    Or open a one-shot allocation without the persistent agent:\n\
      ecli-tunnel-client open --local-port 8080 --backend https://backend.ecli.app"
)]
struct Args {
  #[command(subcommand)]
  command: Command,
  #[arg(long, global = true, help = "Enable verbose logging")]
  verbose: bool,
}

#[derive(Subcommand)]
enum Command {
  #[command(
    about = "Enroll this agent with the backend and obtain a token",
    long_about = "Starts the device enrollment flow. You will be given a code to enter in the EcliPanel admin interface. Once approved, the token is saved to ~/.ecli-tunnel-client.json for use with `run`, `open`, or `allocations`.\n\nExample:\n  ecli-tunnel-client enroll --backend https://backend.ecli.app"
  )]
  Enroll {
    #[arg(long, default_value_t = String::from("client-agent"), help = "Device name shown in the panel")]
    name: String,
    #[arg(long, default_value_t = String::from("https://backend.ecli.app"), help = "Backend base URL")]
    backend: String,
    #[arg(long, help = "Admin JWT for automatic approval (if available)")]
    admin_token: Option<String>,
  },
  #[command(
    about = "Run the persistent tunnel agent",
    long_about = "Connects to the backend WebSocket and forwards incoming tunnel traffic to the local service. Optionally creates the initial allocation inline. Keeps running and reconnects automatically on disconnect.\n\nExamples:\n  ecli-tunnel-client run --local-port 8080\n  ecli-tunnel-client run --local-host 10.0.0.5 --local-port 3000 --protocol tcp\n  ecli-tunnel-client run --token <token>"
  )]
  Run {
    #[arg(long, default_value_t = String::from("https://backend.ecli.app"), help = "Backend base URL")]
    backend: String,
    #[arg(long, help = "Access token (omit to use saved config from ~/.ecli-tunnel-client.json)")]
    token: Option<String>,
    #[arg(long, help = "Local host to forward traffic to (default: 127.0.0.1)")]
    local_host: Option<String>,
    #[arg(long, help = "Local port to forward traffic to")]
    local_port: Option<u16>,
    #[arg(long, default_value_t = String::from("tcp"), help = "Protocol: tcp or udp")]
    protocol: String,
  },
  #[command(
    about = "Open a one-shot tunnel allocation and exit",
    long_about = "Creates a single public tunnel pointing to your local service and prints the public endpoint. Does not run the persistent WebSocket agent — use the `run` subcommand for that.\n\nExample:\n  ecli-tunnel-client open --local-port 8080 --backend https://backend.ecli.app"
  )]
  Open {
    #[arg(long, default_value_t = String::from("127.0.0.1"), help = "Local service host")]
    local_host: String,
    #[arg(long, default_value_t = 8080, help = "Local service port")]
    local_port: u16,
    #[arg(long, default_value_t = String::from("tcp"), help = "Protocol: tcp or udp")]
    protocol: String,
    #[arg(long, default_value_t = String::from("https://backend.ecli.app"), help = "Backend base URL")]
    backend: String,
    #[arg(long, help = "Access token (omit to use saved config)")]
    token: Option<String>,
  },
  #[command(
    about = "List and manage tunnel allocations interactively",
    long_about = "Displays all allocations with their public and local endpoints. Supports closing, deleting, and editing (local port) allocations interactively.\n\nExample:\n  ecli-tunnel-client allocations --backend https://backend.ecli.app"
  )]
  Allocations {
    #[arg(long, default_value_t = String::from("https://backend.ecli.app"), help = "Backend base URL")]
    backend: String,
    #[arg(long, help = "Access token (omit to use saved config)")]
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

fn http_client() -> reqwest::Client {
  Client::builder()
    .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
    .build()
    .expect("failed to build HTTP client")
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

fn resolve_config(token_arg: Option<String>, backend: String) -> ClientConfig {
  if let Some(token) = token_arg {
    ClientConfig { backend, token }
  } else {
    load_config().unwrap_or_else(|_| {
      eprintln!("error: no token provided and no config file found at {}", config_path().display());
      eprintln!("  Run `ecli-tunnel-client enroll --backend <url>` first, or pass --token.");
      std::process::exit(1);
    })
  }
}

#[tokio::main]
async fn main() {
  let args = Args::parse();
  let env_filter = std::env::var("RUST_LOG").ok();
  let filter = env_filter.unwrap_or_else(|| {
    if args.verbose {
      "debug".to_string()
    } else {
      "info".to_string()
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
    Command::Open { local_host, local_port, protocol, backend, token } => {
      open_tunnel(local_host, local_port, protocol, backend, token).await
    }
    Command::Allocations { backend, token } => manage_allocations(backend, token).await,
  }
}

async fn enroll(name: String, backend: String, admin_token: Option<String>) {
  let client = http_client();
  let mut request = client
    .post(format!("{}/api/tunnel/device/start", backend))
    .json(&serde_json::json!({ "name": name, "kind": "client" }));

  if let Some(token) = admin_token {
    request = request.header("Authorization", format!("Bearer {}", token));
  }

  let start = match request.send().await {
    Ok(resp) => match resp.json::<StartResponse>().await {
      Ok(s) => s,
      Err(err) => {
        error!(%err, "invalid enrollment start response");
        return;
      }
    },
    Err(err) => {
      error!(%err, "failed to start enrollment");
      return;
    }
  };

  println!("Open {} and enter code: {}", start.verification_uri, start.user_code);
  println!("Waiting for approval...");

  let max_polls = 120;
  for _ in 0..max_polls {
    let resp = client
      .post(format!("{}/api/tunnel/device/poll", backend))
      .json(&serde_json::json!({ "device_code": start.device_code }))
      .send()
      .await;

    match resp {
      Ok(r) => {
        if r.status().is_success() {
          let payload = match r.json::<PollResponse>().await {
            Ok(p) => p,
            Err(err) => {
              error!(%err, "invalid poll response");
              return;
            }
          };
          let config = ClientConfig { backend: backend.clone(), token: payload.access_token };
          if let Err(err) = save_config(&config) {
            error!(%err, "failed to save config");
            return;
          }
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

  error!("enrollment timed out after {} polls", max_polls);
}

async fn create_allocation(config: &ClientConfig, host: &str, port: u16, protocol: &str) -> anyhow::Result<AllocationResponse> {
  let client = http_client();
  let response = client
    .post(format!("{}/api/tunnel/allocations", config.backend))
    .header("Authorization", format!("Bearer {}", config.token))
    .json(&serde_json::json!({
      "local_host": host,
      "local_port": port,
      "protocol": protocol,
    }))
    .send()
    .await?
    .error_for_status()?;

  let payload = response.json::<AllocationEnvelope>().await?;
  Ok(payload.allocation)
}

async fn open_tunnel(local_host: String, local_port: u16, protocol: String, backend: String, token: Option<String>) {
  let config = resolve_config(token, backend);

  match create_allocation(&config, &local_host, local_port, &protocol).await {
    Ok(allocation) => {
      let scheme = if protocol == "udp" { "udp" } else { &protocol };
      println!();
      println!("  Tunnel active  ──────────────────────────────────────");
      println!("    Public   {scheme}://{}:{}", allocation.host, allocation.port);
      println!("    Local    {scheme}://{}:{}", allocation.local_host, allocation.local_port);
      println!("  ─────────────────────────────────────────────────────");
      println!();
    }
    Err(err) => {
      error!(%err, "failed to create allocation");
    }
  }
}

async fn manage_allocations(backend: String, token: Option<String>) {
  let config = resolve_config(token, backend);

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

    println!("  Allocations  ({})", allocations.len());
    println!();

    for (idx, item) in allocations.iter().enumerate() {
      let status_icon = match item.status.as_str() {
        "active" | "open" => "●",
        "closed" => "○",
        _ => "·",
      };
      let scheme = if item.protocol == "udp" { "udp" } else { &item.protocol };
      let public_url = format!("{}://{}:{}", scheme, item.host, item.port);
      let local_url = format!("{}://{}:{}", scheme, item.local_host, item.local_port);
      println!(
        "  {:<2} {}  {:<38} ->  {}",
        idx + 1,
        status_icon,
        public_url,
        local_url,
      );
    }
    println!();

    let choice = prompt("Select allocation (number, comma-separated, 'all', or q)");
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
  let client = http_client();
  let response = client
    .get(format!("{}/api/tunnel/allocations", config.backend))
    .header("Authorization", format!("Bearer {}", config.token))
    .send()
    .await?;
  let payload = response.json::<AllocationsEnvelope>().await?;
  Ok(payload.allocations)
}

async fn close_allocation(config: &ClientConfig, allocation_id: u64) -> anyhow::Result<()> {
  let client = http_client();
  client
    .post(format!("{}/api/tunnel/allocations/{}/close", config.backend, allocation_id))
    .header("Authorization", format!("Bearer {}", config.token))
    .send()
    .await?
    .error_for_status()?;
  Ok(())
}

async fn edit_allocation(config: &ClientConfig, allocation_id: u64, local_port: u16) -> anyhow::Result<()> {
  let client = http_client();
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
  let client = http_client();
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
  let config = resolve_config(token_arg, backend);
  info!("starting tunnel agent — backend: {}", config.backend);

  if let Some(port) = local_port {
    let host = local_host.unwrap_or_else(|| String::from("127.0.0.1"));
    match create_allocation(&config, &host, port, &protocol).await {
      Ok(allocation) => {
        let scheme = if protocol == "udp" { "udp" } else { &protocol };
        println!();
        println!("  Tunnel active  ──────────────────────────────────────");
        println!("    Public   {}://{}:{}", scheme, allocation.host, allocation.port);
        println!("    Local    {}://{}:{}", scheme, allocation.local_host, allocation.local_port);
        println!("  ─────────────────────────────────────────────────────");
        println!();
        info!("allocation created: public {}://{}:{} -> local {}://{}:{}",
          scheme, allocation.host, allocation.port,
          scheme, allocation.local_host, allocation.local_port);
      }
      Err(err) => {
        error!(%err, "failed to create initial allocation");
      }
    }
  }

  let ws_url = config.backend.replace("http://", "ws://").replace("https://", "wss://")
    + &format!("/api/tunnel/ws?version={VERSION}");
  info!("connecting to backend at {}", ws_url);

  loop {
    info!("connecting to tunnel backend...");
    match try_connect_and_serve(&config, &ws_url).await {
      Ok(()) => info!("tunnel session ended cleanly"),
      Err(err) => error!(%err, "tunnel session error"),
    }

    tokio::select! {
      _ = tokio::signal::ctrl_c() => {
        info!("shutting down tunnel agent");
        return;
      }
      _ = tokio::time::sleep(Duration::from_secs(RECONNECT_DELAY_SECS)) => {
        warn!("reconnecting in {}s...", RECONNECT_DELAY_SECS);
      }
    }
  }
}

async fn try_connect_and_serve(config: &ClientConfig, ws_url: &str) -> anyhow::Result<()> {
  let mut request = ws_url.into_client_request()?;
  request.headers_mut().insert(
    "Authorization",
    format!("Bearer {}", config.token).parse()?,
  );

  info!("establishing WebSocket connection...");
  let connect_start = std::time::Instant::now();
  let (ws_stream, _) = connect_async(request).await?;
  let connect_duration = connect_start.elapsed();
  info!(elapsed_ms = connect_duration.as_millis(), "tunnel agent connected to backend");

  let (write, mut read) = ws_stream.split();
  let write = Arc::new(Mutex::new(write));
  let write_clone = write.clone();
  let local_connections: LocalConnections = Arc::new(Mutex::new(HashMap::new()));
  let (update_tx, mut update_rx) = tokio::sync::oneshot::channel::<()>();
  let update_tx = Arc::new(Mutex::new(Some(update_tx)));

  let mut ws_task = {
    let local_connections = local_connections.clone();
    let backend = config.backend.clone();
    let update_tx = update_tx.clone();
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
                      protocol = open.protocol.as_deref().unwrap_or("tcp"),
                      public_host = %open.public_host,
                      public_port = open.public_port,
                      "incoming connection from server agent {}:{} -> local {}:{}",
                      open.public_host, open.public_port, open.local_host, open.local_port
                    );

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
                      let write = write_clone.clone();
                      tokio::spawn(async move {
                        handle_client_udp(open, write).await;
                      });
                      continue;
                    }

                    let local_target = (open.local_host.as_str(), open.local_port);

                    let local_stream = match TcpStream::connect(local_target).await {
                      Ok(stream) => stream,
                      Err(err) => {
                        error!(%err, connection_id = %open.connection_id, local_host = %open.local_host, local_port = open.local_port, "failed to connect local target");
                        let close = OutgoingMessage {
                          type_name: "connection.close",
                          allocation_id: None,
                          connection_id: Some(open.connection_id.clone()),
                          data: None,
                        };
                        if let Ok(payload) = serde_json::to_string(&close) {
                          write_clone.lock().await.send(Message::Text(payload)).await.ok();
                        }
                        continue;
                      }
                    };

                    let (mut read_half, mut write_half) = local_stream.into_split();
                    let (data_tx, mut data_rx) =
                      tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();

                    local_connections
                      .lock()
                      .await
                      .insert(open.connection_id.clone(), data_tx);
                    info!(connection_id = %open.connection_id, "WebSocket relay started");

                    let write = write_clone.clone();
                    let local_connections = local_connections.clone();
                    let conn_id = open.connection_id.clone();
                      tokio::spawn(async move {
                      let mut buf = vec![0u8; MAX_FRAME_SIZE];
                      loop {
                        tokio::select! {
                          biased;
                          Some(data) = data_rx.recv() => {
                            info!(connection_id = %conn_id, size = data.len(), "writing data to local target from backend");
                            if let Err(err) = write_half.write_all(&data).await {
                              error!(%err, %conn_id, "write to local target failed");
                              break;
                            }
                            info!(connection_id = %conn_id, size = data.len(), "wrote data to local target");
                          }
                          result = read_half.read(&mut buf) => {
                            match result {
                              Ok(0) => break,
                              Ok(n) => {
                                info!(connection_id = %conn_id, size = n, "read from local target");
                                let data_b64 = BASE64.encode(&buf[..n]);
                                let msg = OutgoingMessage {
                                  type_name: "connection.data",
                                  allocation_id: None,
                                  connection_id: Some(conn_id.clone()),
                                  data: Some(data_b64),
                                };
                                if let Ok(payload) = serde_json::to_string(&msg) {
                                  if write.lock().await.send(Message::Text(payload)).await.is_err() {
                                    break;
                                  }
                                  info!(connection_id = %conn_id, size = n, "forwarded local data to backend");
                                }
                              }
                              Err(err) => {
                                error!(%err, connection_id = %conn_id, "local read error");
                                break;
                              }
                            }
                          }
                        }
                      }

                      local_connections.lock().await.remove(&conn_id);
                      let close = OutgoingMessage {
                        type_name: "connection.close",
                        allocation_id: None,
                        connection_id: Some(conn_id),
                        data: None,
                      };
                      if let Ok(payload) = serde_json::to_string(&close) {
                        write.lock().await.send(Message::Text(payload)).await.ok();
                      }
                    });
                  }
                  Err(err) => {
                    error!(%err, "failed to parse connection.open");
                  }
                }
              }
              Some("connection.data") => {
                let connection_id = match msg.get("connectionId").and_then(|v| v.as_str()) {
                  Some(id) => id.to_owned(),
                  None => continue,
                };
                let data_b64 = match msg.get("data").and_then(|v| v.as_str()) {
                  Some(d) => d,
                  None => continue,
                };
                let bytes = match BASE64.decode(data_b64) {
                  Ok(b) => b,
                  Err(err) => {
                    error!(%err, "base64 decode failed");
                    continue;
                  }
                };
                info!(%connection_id, size = bytes.len(), "received connection.data from backend");
                let conns = local_connections.lock().await;
                if let Some(tx) = conns.get(&connection_id) {
                  if tx.send(bytes).is_err() {
                    warn!(%connection_id, "local target task ended");
                  }
                } else {
                  warn!(%connection_id, "no local connection found for connection.data");
                }
              }
              Some("connection.close") => {
                if let Some(connection_id) = msg.get("connectionId").and_then(|v| v.as_str()) {
                  local_connections.lock().await.remove(connection_id);
                  info!(%connection_id, "connection closed by remote");
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
                    match apply_client_update(&backend).await {
                      Ok(()) => {
                        info!("update applied successfully — signaling restart");
                        if let Some(tx) = update_tx.lock().await.take() {
                          let _ = tx.send(());
                        }
                      }
                      Err(err) => {
                        error!(%err, "update failed — will retry on next reconnect");
                      }
                    }
                  } else {
                    info!(%current, "tunnel client is up to date");
                  }
                }
              }
              Some("error") => {
                let error_str = msg.get("error").and_then(|v| v.as_str()).unwrap_or("unknown");
                let message_str = msg.get("message").and_then(|v| v.as_str());
                error!(error = %error_str, message = ?message_str, "backend error");
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
    })
  };

  tokio::select! {
    _ = tokio::signal::ctrl_c() => {
      info!("shutting down");
      ws_task.abort();
    }
    _ = &mut update_rx => {
      info!("update triggered, restarting service");
      ws_task.abort();
      restart_client_service();
    }
    _ = &mut ws_task => {
      info!("websocket connection closed");
    }
  }
  Ok(())
}

async fn handle_client_udp(open: ConnectionOpenMessage, write: Arc<Mutex<WsSink>>) {
  let local_addr: SocketAddr = match format!("{}:{}", open.local_host, open.local_port).parse() {
    Ok(addr) => addr,
    Err(err) => {
      error!(%err, "invalid local target address");
      return;
    }
  };

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
  if let Ok(payload) = serde_json::to_string(&close) {
    write_clone.lock().await.send(Message::Text(payload)).await.ok();
  }
}

// ---------------------------------------------------------------------------
// Auto-update
// ---------------------------------------------------------------------------

async fn apply_client_update(backend: &str) -> anyhow::Result<()> {
  let download_url = format!("{}/api/tunnel/client/download", backend.trim_end_matches('/'));
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
  let tmp_path = current_exe.with_extension("tmp");
  fs::write(&tmp_path, &bytes)?;

  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(&tmp_path)?.permissions();
    perms.set_mode(0o755);
    fs::set_permissions(&tmp_path, perms)?;
  }

  fs::rename(&tmp_path, &current_exe)?;
  info!(path = ?current_exe, "binary updated");

  Ok(())
}

fn restart_client_service() {
  use std::os::unix::process::CommandExt;
  use std::process::Command;

  let status = Command::new("systemctl")
    .args(["restart", "eclipanel-tunnel-client"])
    .status();

  match status {
    Ok(s) if s.success() => {
      info!("systemctl restart succeeded");
    }
    _ => {
      warn!("systemctl restart failed, attempting exec replacement");
      let args: Vec<String> = std::env::args().collect();
      let current_exe = std::env::current_exe()
        .unwrap_or_else(|_| PathBuf::from("ecli-tunnel-client"));
      let _ = Command::new(&current_exe)
        .args(&args[1..])
        .exec();
      error!("exec failed, exiting — please restart manually");
    }
  }
}

// ---------------------------------------------------------------------------
// Frame helpers
// ---------------------------------------------------------------------------

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
  if len > MAX_FRAME_SIZE {
    return Err(anyhow::anyhow!("frame too large: {} > {}", len, MAX_FRAME_SIZE));
  }
  let mut data = vec![0u8; len];
  reader.read_exact(&mut data).await?;
  Ok(Some(data))
}
