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
        "EMBEDDING_URL": "http://127.0.0.1:3004",
        "EMBEDDING_MODEL": "BAAI/bge-m3",
        "COLBERT_URL": "http://127.0.0.1:3004",
        "THAILAW_VECTOR_MODE": "colbert",
        "RERANK_URL": "http://127.0.0.1:3006",
        "RERANK_MODEL": "BAAI/bge-reranker-v2-m3"
      }
    }
  }
}
```

## HTTP health check

```bash
curl http://localhost:8005/health
```
