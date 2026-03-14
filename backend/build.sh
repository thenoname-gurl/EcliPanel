#!/usr/bin/env bash
if command -v bun >/dev/null 2>&1; then
  bun install
  bun tsc || true
else
  npm install
  npx tsc || true
fi

