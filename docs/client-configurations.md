# Client configurations

## Open WebUI (Streamable HTTP)

```bash
THAILAW_HTTP_PORT=8005 THAILAW_HTTP_HOST=0.0.0.0 node dist/cli.js
```

Add an MCP server:

- Type: `streamable-http`
- URL: `http://localhost:8005/mcp`

## Claude Desktop / Claude Code / Cursor

```json
{
  "mcpServers": {
    "thailaw": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-thailaw/dist/cli.js"],
      "env": {
        "QDRANT_URL": "http://localhost:6333",
        "EMBEDDING_URL": "http://127.0.0.1:3003/v1",
        "EMBEDDING_MODEL": "Qwen3-Embedding-4B",
        "RERANK_URL": "http://127.0.0.1:3004/v1",
        "RERANK_MODEL": "Qwen3-Reranker-4B"
      }
    }
  }
}
```

## HTTP health check

```bash
curl http://localhost:8005/health
```
