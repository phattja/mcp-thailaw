#!/bin/bash
set -euo pipefail

APP_DIR="${THAILAW_APP_DIR:-/ai/opencode/mcp-thailaw}"

cd "$APP_DIR"

if [ ! -d node_modules ]; then
  echo "Installing mcp-thailaw dependencies..."
  npm ci
fi

if [ ! -f dist/cli.js ]; then
  echo "Building mcp-thailaw..."
  npm run build
fi

echo "Starting Thai Law MCP (CLI flags override environment variables)"
exec node dist/cli.js "$@"
