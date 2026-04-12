# EcliTunnel

This folder includes two Rust tunnel agents for EcliPanel:

- `tunnel/client` this is the client side agent that requests a public tunnel allocation and forwards local service traffic!
- `tunnel/server` this is the server side relay agent that accepts inbound traffic on allocated public ports and forwards it to clients..

## Prerequisites

- Rust and Cargo installed
- Backend available over HTTPS (Or HTTP) and reachable from the tunnel agents!
- A public hostname for tunnel endpoints when self-hosting

## Backend configuration for server deployments

The server agent receives bind instructions from the backend and listens locally on the allocated port. That means:

- The backend should publish a public hostname for tunnels via `TUNNEL_PUBLIC_HOST` if you are self-hosting.
- The server host must allow inbound TCP traffic on the tunnel allocation port range (default `20000-29999`).
- The public endpoint will be shown as `<TUNNEL_PUBLIC_HOST>:<port>`.

## Client usage

```bash
cd tunnel/client
cargo run --release -- enroll --backend https://your-backend.example
```

After approval, run a persistent client agent and optionally request a public tunnel allocation in the same command:

```bash
cargo run --release -- run --backend https://your-backend.example --local-host 127.0.0.1 --local-port 8080 --protocol tcp
```

If you already created an allocation separately, you can also run the client without flags:

```bash
cargo run --release -- run --backend https://your-backend.example
```

### What the client does

- Calls `/api/tunnel/device/start` to begin enrollment.
- Polls `/api/tunnel/device/poll` for approval.
- Connects to `/api/tunnel/ws` with the approved bearer token.
- Receives `connection.open` requests from the backend when the server receives inbound traffic.
- Opens a local TCP connection to the configured service and forwards data.

## Server usage

```bash
cd tunnel/server
cargo run --release -- enroll --backend https://your-backend.example
```

After approval, run the server agent:

```bash
cargo run --release -- run --token <access_token> --backend https://your-backend.example
```

### What the server does

- Enrolls as a `server` tunnel device.
- Connects to `/api/tunnel/ws` with bearer authentication.
- Receives `bind` events from the backend for each active allocation.
- Listens on `0.0.0.0:<allocated_port>` for inbound tunnel traffic.
- Forwards inbound data to the client agent over the WebSocket.
- Stops listening when the allocation is closed from the panel.

## Proper server configuration

1. Use `--backend https://your-backend.example` to point the agent at your backend.
2. Approve the server device from the backend as a `server` kind agent.
3. Make sure the server host can access the backend over HTTPS and WSS.
4. Open the tunnel port range on the server host, because the agent binds allocated ports dynamically.
5. Set `TUNNEL_PUBLIC_HOST` in backend environment if your public endpoint hostname is custom.
6. Run the server agent as a long-lived process (systemd, container, or supervisor).

### Example server run command

```bash
cd tunnel/server
cargo run --release -- --backend https://your-backend.example run --token <access_token>
```

### Notes

- The server agent does not require additional local service configuration; it binds ports assigned by the backend.
- The actual public endpoint is determined by the backend public host plus the allocated port.
- If using your own domain, ensure DNS for `TUNNEL_PUBLIC_HOST` resolves to the server host.