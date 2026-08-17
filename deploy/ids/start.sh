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

echo "Starting Thai Law MCP on ${MCP_HTTP_HOST:-0.0.0.0}:${MCP_HTTP_PORT:-8005}"
echo "Qdrant: ${QDRANT_URL:-http://127.0.0.1:6333} collection=${QDRANT_COLLECTION:-krisdika}"
echo "Embeddings: ${EMBEDDING_URL:-http://127.0.0.1:57863/v1/embeddings} model=${EMBEDDING_MODEL:-gpustack-bge-m3}"

exec node dist/cli.js
