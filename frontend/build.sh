#!/usr/bin/env bash
# build frontend
export NODE_ENV=production
bun install
bun run build