#!/usr/bin/env bash
if [ -f .env ]; then
  sed -i 's/\r$//' .env || true
  set -a
  source .env
  set +a
fi

export PORT=${PORT:-4000}
export DB_TYPE=${DB_TYPE:-mariadb}
export DB_HOST=${DB_HOST:-localhost}
export DB_PORT=${DB_PORT:-3306}
export DB_USER=${DB_USER:-root}
export DB_PASS=${DB_PASS:-}
export DB_NAME=${DB_NAME:-panel}
export DATABASE_URL=${DATABASE_URL:-}

export JWT_SECRET=${JWT_SECRET:-super-secret-string}
export WINGS_URL=${WINGS_URL:-http://localhost:8080}
export WINGS_TOKEN=${WINGS_TOKEN:-wingstoken123}
export PDNS_BASE_URL=${PDNS_BASE_URL:-http://127.0.0.1:8081/api/v1/servers/localhost}
export PDNS_API_KEY=${PDNS_API_KEY:-abcd1234-powerdns-key}
export REDIS_URL=${REDIS_URL:-redis://localhost:6379}

export ORIGIN=${ORIGIN:-https://ecli.app}
export RP_ID=${RP_ID:-ecli.app}

export GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID:-grrr}
export GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET:-grrr}

export EU_ID_DISABLED=${EU_ID_DISABLED:-true}

export CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:-""}
export CLOUDFLARE_BASE_ZONE=${CLOUDFLARE_BASE_ZONE:-""}
export CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:-""}

export HACKCLUB_CLIENT_ID=${HACKCLUB_CLIENT_ID:-""}
export HACKCLUB_CLIENT_SECRET=${HACKCLUB_CLIENT_SECRET:-""}
export HACKCLUB_REDIRECT_URI=${HACKCLUB_REDIRECT_URI:-""}

echo "--- environment loaded ---"

if command -v bun >/dev/null 2>&1; then
  bun src/index.ts
fi
