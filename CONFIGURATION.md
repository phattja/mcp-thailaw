# Configuration

Environment variables for `mcp-thailaw`. None are required; unset values use the local Krisdika stack defaults from `thai_law_mcp.py`.

## Search backend

| Variable | Default | Description |
| --- | --- | --- |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant base URL |
| `QDRANT_COLLECTION` | `krisdika` | Collection name |
| `QDRANT_API_KEY` | _(unset)_ | Sent as the `api-key` header |
| `EMBEDDING_URL` | `http://127.0.0.1:57863/v1/embeddings` | OpenAI-compatible embeddings endpoint |
| `EMBEDDING_MODEL` | `gpustack-bge-m3` | Model name in the embeddings request |
| `EMBEDDING_API_KEY` | _(unset)_ | Sent as `Authorization: Bearer ...` |
| `THAILAW_TOP_K` | `5` | Default number of hits when the tool omits `top_k` |
| `THAILAW_SCORE_THRESHOLD` | `0.30` | Default minimum cosine score |
| `THAILAW_MAX_RESULTS` | `20` | Operator ceiling for `top_k` |
| `FETCH_TIMEOUT_MS` | `30000` | Timeout for embedding + Qdrant calls |

## Search cache

| Variable | Default | Description |
| --- | --- | --- |
| `SEARCH_CACHE_TTL_MS` | `86400000` | In-memory result TTL (24h) |
| `SEARCH_CACHE_MAX_ENTRIES` | `200` | LFU cache size |

## HTTP transport

| Variable | Default | Description |
| --- | --- | --- |
| `MCP_HTTP_PORT` | _(unset)_ | When set, serve Streamable HTTP instead of STDIO |
| `MCP_HTTP_HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` in Docker / Open WebUI |
| `MCP_HTTP_STATELESS` | `false` | One-shot POST sessions for serverless hosts |
| `MCP_HTTP_HARDEN` | `false` | Require auth token + allowed origins |
| `MCP_HTTP_AUTH_TOKEN` | _(unset)_ | Bearer token when hardened |
| `MCP_HTTP_ALLOWED_ORIGINS` | _(unset)_ | Comma-separated origins when hardened |
| `MCP_HTTP_ALLOWED_HOSTS` | loopback + port | Host header allowlist when hardened |
| `MCP_HTTP_TRUST_PROXY` | `false` | Express trust-proxy setting |
| `MCP_HTTP_EXPOSE_FULL_CONFIG` | `false` | Include URLs in the config resource while hardened |
| `MCP_RATE_WINDOW_MS` | `60000` | Rate-limit window |
| `MCP_RATE_INIT_MAX` | `20` | Max unauthenticated / init requests per window |
| `MCP_RATE_SESSION_MAX` | `300` | Max in-session requests per window |

Open WebUI example:

```bash
MCP_HTTP_PORT=8005 \
MCP_HTTP_HOST=0.0.0.0 \
QDRANT_URL=http://localhost:6333 \
EMBEDDING_URL=http://127.0.0.1:57863/v1/embeddings \
node dist/cli.js
```

Then add an MCP server of type **streamable-http** at `http://localhost:8005/mcp`.
