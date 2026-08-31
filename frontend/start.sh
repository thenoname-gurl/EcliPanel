#!/usr/bin/env bash
# start frontend (Astro production server)
if [ -f .env ]; then
  sed -i 's/\r$//' .env || true
  set -a
  source .env
  set +a
fi
export BACKEND_URL=${BACKEND_URL:-http://localhost:3432}
export NODE_ENV=production
export HOST=0.0.0.0

if [ ! -f ./dist/server/entry.mjs ]; then
  echo "No build found, building..."
  bun run build || exit 1
fi

echo "Starting server..."
exec bun ./dist/server/entry.mjs
