#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WINGS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$WINGS_DIR"

echo "[UwU] => Applying Wings security patches..."

for patch in patches/*.patch; do
    [ -f "$patch" ] || continue
    echo "  Applying $(basename "$patch")..."
    git am "$patch" || {
        echo "  ERROR: Patch $(basename "$patch") failed to apply."
        echo "  Resolve conflicts manually, then run: git am --continue"
        echo "  Or abort with: git am --abort"
        exit 1
    }
done

echo "[UwU] => All patches applied successfully."
echo ""
echo "To build: cargo build --release"
