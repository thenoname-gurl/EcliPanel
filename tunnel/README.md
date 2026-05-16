<p align="center">
  <img src="./tunnel.png" alt="EcliPanel" width="640" />
</p>

# EcliTunnel

Expose local services via public tunnel endpoints managed by EcliPanel.
Data travels directly between agents.

## Quick start

Expose a local service with a single command (auto-installs the client):

```bash
curl -fsSL https://ecli.app/api/tunnel/deploy.sh | bash -s -- open --port 8080
```

Run a persistent agent that forwards tunnel traffic automatically:

```bash
curl -fsSL https://ecli.app/api/tunnel/deploy.sh | bash -s -- run --port 8080
```

## Client vs Server

| Agent | Role | Runs on |
|-------|------|---------|
| **Client** | Forwards traffic from public endpoints to your local service | Your development machine, application server, or any host with a local service |
| **Server** | Accepts inbound internet traffic on allocated ports and relays to clients | A publicly-reachable host with open ports (`20000-29999`) |

## Client usage

### 1. Enroll the agent

```bash
ecli-tunnel-client enroll --backend https://backend.ecli.app
```

You'll get a code — enter it in the EcliPanel admin interface to approve the device. The token is saved to `~/.ecli-tunnel-client.json`.

### 2. Open a tunnel

One-shot allocation (creates tunnel and exits):

```bash
ecli-tunnel-client open --local-port 8080 --backend https://backend.ecli.app
```

Output:

```
  Tunnel active  ──────────────────────────────────────
    Public   tcp://tun-1.example.com:21345
    Local    tcp://127.0.0.1:8080
  ─────────────────────────────────────────────────────
```

### 3. Run persistent agent

Stays connected and forwards traffic for all active allocations:

```bash
ecli-tunnel-client run --local-port 8080 --backend https://backend.ecli.app
```

Or run without creating an initial allocation (allocation created from the panel):

```bash
ecli-tunnel-client run --backend https://backend.ecli.app
```

### 4. Manage allocations

```bash
ecli-tunnel-client allocations --backend https://backend.ecli.app
```

Shows an interactive list. Supports `c` (close), `d` (delete), `e` (edit local port).

### Options

| Flag | Description |
|------|-------------|
| `--backend` | Backend base URL (default: `https://backend.ecli.app`) |
| `--token` | Access token (omit to use saved config) |
| `--local-host` | Local service host (default: `127.0.0.1`) |
| `--local-port` | Local service port |
| `--protocol` | `tcp` or `udp` (default: `tcp`) |
| `--verbose` | Enable verbose logging (use as first arg: `--verbose run ...`) |

## Server usage

### 1. Enroll the server agent

```bash
ecli-tunnel-server enroll --backend https://backend.ecli.app
```

### 2. Run the server agent

```bash
ecli-tunnel-server run --token <token> --backend https://backend.ecli.app
```

The server agent:
- Connects to the backend WebSocket
- Listens for `bind` events (backend instructing it to listen on an allocated port)
- Binds `0.0.0.0:<port>` for each active allocation
- Relays TCP connections to the client agent via a direct data path

### Server prerequisites

- The server host must allow inbound TCP traffic on the tunnel port range (`20000-29999` by default)
- The backend should publish a public hostname via `TUNNEL_PUBLIC_HOST` env var
- Set `TUNNEL_PUBLIC_HOST` in your backend environment if the public hostname differs from the server host

## Data path

```
internet → server agent (port 20000-29999) → client agent → local service
```

The control plane runs over the backend WebSocket (`/api/tunnel/ws`). Data flows directly between agents using a one-time direct token — no traffic passes through the backend.

## Building from source

```bash
# Build client
cd tunnel/client && cargo build --release

# Build server  
cd tunnel/server && cargo build --release
```

The deploy script at `tunnel/deploy.sh` also handles building automatically.

## Architecture

1. **Client enrollment**: Agent calls `/api/tunnel/device/start`, polls `/api/tunnel/device/poll` for approval.
2. **WebSocket connection**: Agent connects to `/api/tunnel/ws` with bearer token.
3. **Allocation**: Backend assigns a public port and sends `bind` to server, `connection.open` to client.
4. **Direct bridge**: Client connects to server's allocated port with a one-time direct token.
5. **Traffic relay**: bytes flow directly between server and client agents.
