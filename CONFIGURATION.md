# Configuration

Qdrant and embedding settings are read in this order:

1. Startup flags (`mcp-thailaw --qdrant-url ...`)
2. Environment variables
3. Built-in defaults from the original `thai_law_mcp.py` stack

Startup flags always override environment variables.

```bash
mcp-thailaw \
  --http-port 8005 \
  --http-host 0.0.0.0 \
  --qdrant-url http://127.0.0.1:6333 \
  --qdrant-collection krisdika \
  --embedding-url http://127.0.0.1:57863/v1/embeddings \
  --embedding-model gpustack-bge-m3
```

## Search backend

| Flag | Environment variable | Default | Description |
| --- | --- | --- | --- |
| `--qdrant-url` | `QDRANT_URL` | `http://localhost:6333` | Qdrant base URL |
| `--qdrant-collection`, `--collection` | `QDRANT_COLLECTION` | `krisdika` | Collection name |
| `--qdrant-api-key` | `QDRANT_API_KEY` | _(unset)_ | Sent as the `api-key` header |
| `--embedding-url` | `EMBEDDING_URL` | `http://127.0.0.1:57863/v1/embeddings` | OpenAI-compatible embeddings endpoint |
| `--embedding-model` | `EMBEDDING_MODEL` | `gpustack-bge-m3` | Model name in the embeddings request |
| `--embedding-api-key` | `EMBEDDING_API_KEY` | _(unset)_ | Sent as `Authorization: Bearer ...` |
| `--top-k` | `THAILAW_TOP_K` | `5` | Default number of hits when the tool omits `top_k` |
| `--score-threshold` | `THAILAW_SCORE_THRESHOLD` | `0.30` | Default minimum cosine score |
| `--max-results` | `THAILAW_MAX_RESULTS` | `20` | Operator ceiling for `top_k` |
| `--fetch-timeout-ms` | `FETCH_TIMEOUT_MS` | `30000` | Timeout for embedding + Qdrant calls |

## Search cache

| Variable | Default | Description |
| --- | --- | --- |
| `SEARCH_CACHE_TTL_MS` | `86400000` | In-memory result TTL (24h) |
| `SEARCH_CACHE_MAX_ENTRIES` | `200` | LFU cache size |

## HTTP transport

| Variable | Default | Description |
| --- | --- | --- |
| `--http-port`, `--port` / `THAILAW_HTTP_PORT` | _(unset)_ | When set, serve Streamable HTTP instead of STDIO |
| `--http-host` / `THAILAW_HTTP_HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` in Docker / Open WebUI |
| `THAILAW_HTTP_STATELESS` | `false` | One-shot POST sessions for serverless hosts |
| `THAILAW_HTTP_HARDEN` | `false` | Require auth token + allowed origins |
| `THAILAW_HTTP_AUTH_TOKEN` | _(unset)_ | Bearer token when hardened |
| `THAILAW_HTTP_ALLOWED_ORIGINS` | _(unset)_ | Comma-separated origins when hardened |
| `THAILAW_HTTP_ALLOWED_HOSTS` | loopback + port | Host header allowlist when hardened |
| `THAILAW_HTTP_TRUST_PROXY` | `false` | Express trust-proxy setting |
| `THAILAW_HTTP_EXPOSE_FULL_CONFIG` | `false` | Include URLs in the config resource while hardened |
| `THAILAW_RATE_WINDOW_MS` | `60000` | Rate-limit window |
| `THAILAW_RATE_INIT_MAX` | `20` | Max unauthenticated / init requests per window |
| `THAILAW_RATE_SESSION_MAX` | `300` | Max in-session requests per window |

Open WebUI example:

```bash
node dist/cli.js \
  --http-port 8005 \
  --http-host 0.0.0.0 \
  --qdrant-url http://localhost:6333 \
  --embedding-url http://127.0.0.1:57863/v1/embeddings
```

Then add an MCP server of type **streamable-http** at `http://localhost:8005/mcp`.
