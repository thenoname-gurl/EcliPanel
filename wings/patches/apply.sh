#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WINGS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[UwU] => Applying Wings security patches..."
exec "$WINGS_DIR/manage.sh" patch