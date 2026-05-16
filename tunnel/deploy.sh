#!/usr/bin/env bash
set -euo pipefail
# ---------------------------------------------------------------------------
# EcliPanel Tunnel — one-line deploy script
#
# Downloads pre-built server/client binaries from the panel backend.
# No Rust or cargo needed.
#
# Usage:
#   curl -fsSL https://ecli.app/api/tunnel/deploy.sh | bash -s -- --help
#   curl -fsSL https://ecli.app/api/tunnel/deploy.sh | bash -s -- server-run --token <token>
#   curl -fsSL https://ecli.app/api/tunnel/deploy.sh | bash -s -- server-service --token <token>
#   curl -fsSL https://ecli.app/api/tunnel/deploy.sh | bash -s -- open --port 8080
# ---------------------------------------------------------------------------

SCRIPT_VERSION="0.2.0"
BIN_DIR="${ECLI_TUNNEL_HOME:-$HOME/.ecli/tunnel}"

usage() {
  cat <<'HELP'
EcliPanel Tunnel — one-line deploy

Usage:  tunnel.sh [COMMAND] [OPTIONS]

Client commands:
  enroll          Enroll agent with backend and obtain a token
  run             Run persistent tunnel client agent (forwards traffic)
  open            Create one-shot tunnel allocation and print URL
  allocations     List and manage allocations interactively

Admin commands:
  admin-enroll    Enroll a device immediately (admin, no approval needed)
  server-run      Download and test-run server agent in foreground
  server-service  Install server agent as systemd service

Global options:
  --backend URL   Backend base URL (default: https://backend.ecli.app)
  --token TOKEN   Device token (passed to the binary)
  --verbose       Enable verbose logging
  --yes           Skip prompts
  --install       Force re-download binary
  --version       Print version

Client examples:
  tunnel.sh open --port 8080
  tunnel.sh run --port 8080
  tunnel.sh enroll

Admin examples:
  tunnel.sh server-run --token <device-token> --backend https://backend.ecli.app
  tunnel.sh server-service --token <device-token> --backend https://backend.ecli.app
  ADMIN_API_KEY=<key> tunnel.sh admin-enroll --name my-agent
HELP
  exit 0
}

log()  { printf "\033[36m•\033[0m %s\n" "$*" >&2; }
ok()   { printf "\033[32m✓\033[0m %s\n" "$*" >&2; }
warn() { printf "\033[33m!\033[0m %s\n" "$*" >&2; }
die()  { printf "\033[31m✗\033[0m %s\n" "$*" >&2; exit 1; }

download_binary() {
  local bin_name="$1"
  local bin_path="$BIN_DIR/$bin_name"
  local backend="${BACKEND:-https://backend.ecli.app}"

  mkdir -p "$BIN_DIR"

  if [[ -x "$bin_path" ]] && [[ "${INSTALL:-0}" != "1" ]]; then
    ok "found cached $bin_name at $bin_path"
    BIN_PATH="$bin_path"
    return 0
  fi

  local dl_path
  case "$bin_name" in
    ecli-tunnel-server) dl_path="server" ;;
    ecli-tunnel-client) dl_path="client" ;;
    *) die "unknown binary: $bin_name" ;;
  esac

  local download_url="$backend/api/tunnel/$dl_path/download"
  log "downloading $bin_name from $download_url ..."

  local http_code
  http_code=$(curl -fsSL "$download_url" -o "$bin_path.tmp" -w '%{http_code}' 2>&1) || {
    local exit_code=$?
    rm -f "$bin_path.tmp"
    if [[ "$exit_code" -eq 22 ]]; then
      die "download failed (HTTP $(curl -s -o /dev/null -w '%{http_code}' "$download_url" 2>/dev/null || echo "??"))"
    fi
    die "download failed with curl exit code $exit_code"
  }

  if [[ "$http_code" != "200" ]]; then
    rm -f "$bin_path.tmp"
    die "download returned HTTP $http_code"
  fi

  chmod +x "$bin_path.tmp"
  mv "$bin_path.tmp" "$bin_path"
  BIN_PATH="$bin_path"
  ok "downloaded $bin_name to $BIN_PATH"
}

parse_args() {
  BINARY_ARGS=()
  COMMAND=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --backend)      shift; BACKEND="$1" ;;
      --host)         shift; BINARY_ARGS+=(--local-host "$1") ;;
      --port)         shift; BINARY_ARGS+=(--local-port "$1") ;;
      --token)        shift; BINARY_ARGS+=(--token "$1") ;;
      --admin-token)  shift; BINARY_ARGS+=(--admin-token "$1") ;;
      --owner-user-id) shift; ADMIN_OWNER_USER_ID="$1" ;;
      --name)         shift; BINARY_ARGS+=(--name "$1") ;;
      --kind)         shift; BINARY_ARGS+=(--kind "$1") ;;
      --protocol)     shift; BINARY_ARGS+=(--protocol "$1") ;;
      --verbose)      BINARY_ARGS+=(--verbose) ;;
      --yes|-y)       YES=1 ;;
      --install|-i)   INSTALL=1 ;;
      --version)      echo "tunnel.sh $SCRIPT_VERSION"; exit 0 ;;
      help|--help|-h) usage ;;
      enroll|run|open|allocations|admin-enroll|server-run|server-service)
        COMMAND="$1"
        ;;
      *)
        BINARY_ARGS+=("$1")
        ;;
    esac
    shift
  done

  if [[ -z "$COMMAND" ]]; then
    echo "Usage: tunnel.sh <command> [options]"
    echo "  tunnel.sh help    for detailed usage"
    exit 1
  fi
}

admin_enroll() {
  local backend="${BACKEND:-https://backend.ecli.app}"

  local auth_header=""
  if [[ -n "${ADMIN_API_KEY:-}" ]]; then
    auth_header="ApiKey $ADMIN_API_KEY"
  elif [[ -n "${ADMIN_TOKEN:-}" ]]; then
    auth_header="Bearer $ADMIN_TOKEN"
  else
    die "Set ADMIN_API_KEY or ADMIN_TOKEN env var"
  fi

  local name="agent"
  local kind="client"
  local owner_user_id=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --backend) shift; backend="$1" ;;
      --name) shift; name="$1" ;;
      --kind) shift; kind="$1" ;;
      --owner-user-id) shift; owner_user_id="$1" ;;
    esac
    shift
  done

  local json_payload="{\"name\":\"$name\",\"kind\":\"$kind\"}"
  [[ -n "$owner_user_id" ]] && json_payload="{\"name\":\"$name\",\"kind\":\"$kind\",\"owner_user_id\":$owner_user_id}"

  log "creating $kind device \"$name\" on $backend ..."
  local response
  response=$(curl -fsSL "$backend/api/tunnel/devices" \
    -H "Authorization: $auth_header" \
    -H "Content-Type: application/json" \
    -d "$json_payload" 2>&1) || die "API call failed: $response"

  local device_code user_code access_token
  device_code=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['device_code'])")
  user_code=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['user_code'])")
  access_token=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

  ok "$kind device \"$name\" created and approved"
  echo ""
  echo "  Device code: $device_code"
  echo "  User code:   $user_code"
  echo "  Access token: $access_token"
  echo ""
  echo "  Run the agent:"
  echo "    ecli-tunnel-client run --token $access_token --backend $backend"
  echo ""
}

server_run() {
  download_binary ecli-tunnel-server
  log "running server agent: $BIN_PATH run ${BINARY_ARGS[*]}"
  exec "$BIN_PATH" run "${BINARY_ARGS[@]}"
}

server_service() {
  local backend="${BACKEND:-https://backend.ecli.app}"
  local token=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --backend) shift; backend="$1" ;;
      --token)   shift; token="$1" ;;
    esac
    shift
  done

  [[ -z "$token" ]] && die "--token is required"

  download_binary ecli-tunnel-server

  local service_file="/etc/systemd/system/eclipanel-tunnel.service"

  if [[ $EUID -eq 0 ]]; then
    local install_bin="/usr/local/bin/ecli-tunnel-server"
    log "installing binary to $install_bin ..."
    cp "$BIN_PATH" "$install_bin"
    chmod +x "$install_bin"

    log "installing systemd unit to $service_file ..."
    cat <<UNITEOF > "$service_file"
[Unit]
Description=EcliPanel Tunnel Server Agent
After=network.target

[Service]
Type=simple
ExecStart=${install_bin} run --token ${token} --backend ${backend}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNITEOF
    systemctl daemon-reload 2>/dev/null || true
    systemctl enable --now eclipanel-tunnel 2>/dev/null || true
    ok "eclipanel-tunnel service installed and started"
    echo ""
    echo "  Status: systemctl status eclipanel-tunnel"
    echo "  Logs:   journalctl -u eclipanel-tunnel -f"
    echo ""
  else
    echo ""
    echo "# --- /etc/systemd/system/eclipanel-tunnel.service ---"
    echo "[Unit]
Description=EcliPanel Tunnel Server Agent
After=network.target

[Service]
Type=simple
ExecStart=${BIN_PATH} run --token ${token} --backend ${backend}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target"
    echo "# --- end ---"
    echo ""
    echo "  Install with:"
    echo "    sudo tee $service_file <<'UNITEOF'"
    echo "    ... paste the unit from above ..."
    echo "    UNITEOF"
    echo "    sudo systemctl daemon-reload"
    echo "    sudo systemctl enable --now eclipanel-tunnel"
    echo ""
  fi
}

main() {
  YES=${YES:-0}
  INSTALL=${INSTALL:-0}
  BACKEND=""
  ADMIN_OWNER_USER_ID=""

  parse_args "$@"

  case "$COMMAND" in
    admin-enroll)
      admin_enroll "${BINARY_ARGS[@]}"
      exit $?
      ;;
    server-run)
      server_run
      exit $?
      ;;
    server-service)
      server_service "${BINARY_ARGS[@]}"
      exit $?
      ;;
  esac

  download_binary ecli-tunnel-client
  log "running: ecli-tunnel-client $COMMAND ${BINARY_ARGS[*]}"
  exec "$BIN_PATH" "$COMMAND" "${BINARY_ARGS[@]}"
}

main "$@"
