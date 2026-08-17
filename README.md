# Thai Law MCP Server

**Semantic Thai law search for AI assistants — query OCS Krisdika (สำนักงานคณะกรรมการกฤษฎีกา) through Qdrant.**

An [MCP server](https://modelcontextprotocol.io/introduction) that embeds a query and searches the `krisdika` vector collection. It is a fork of [mcp-searxng](https://github.com/ihor-sokoliuk/mcp-searxng), keeping the STDIO / Streamable HTTP transport, Docker, and client wiring, and replacing web search with the Thai-law flow from `thai_law_mcp.py`.

```
AI Assistant / Open WebUI
        │  MCP protocol
        ▼
  mcp-thailaw  (this project — Node.js)
        │  OpenAI-compatible /v1/embeddings
        ▼
  Embedding server (bge-m3)
        │  Qdrant query_points
        ▼
  Qdrant collection `krisdika`
```

## Quick Start

### STDIO (Claude, Cursor, Codex)

```json
{
  "mcpServers": {
    "thailaw": {
      "command": "npx",
      "args": ["-y", "mcp-thailaw"],
      "env": {
        "QDRANT_URL": "http://localhost:6333",
        "QDRANT_COLLECTION": "krisdika",
        "EMBEDDING_URL": "http://127.0.0.1:57863/v1/embeddings",
        "EMBEDDING_MODEL": "gpustack-bge-m3"
      }
    }
  }
}
```

### HTTP (Open WebUI)

```bash
MCP_HTTP_PORT=8005 MCP_HTTP_HOST=0.0.0.0 npm start
# or after build:
MCP_HTTP_PORT=8005 MCP_HTTP_HOST=0.0.0.0 node dist/cli.js
```

Connect the client to `http://localhost:8005/mcp`.

The local defaults match the prototype in `thai_law_mcp.py`:

| Setting | Default |
| --- | --- |
| Qdrant | `http://localhost:6333` / collection `krisdika` |
| Embeddings | `http://127.0.0.1:57863/v1/embeddings` / `gpustack-bge-m3` |
| Top K | `5` |
| Score threshold | `0.30` |

## Tools

* **search_thai_law** — semantic search over Thai statutes
  * `query` (string, required)
  * `top_k` (integer, optional, 1–20, default 5)
  * `score_threshold` (number, optional, 0.0–1.0, default 0.30)
  * `law_code` (string, optional)
  * `category` (string, optional)
  * `is_latest` (boolean, optional)
  * `response_format` (`text` or `json`, optional)
* **thailaw_collection_info** — Qdrant collection status, point count, vector size
  * `refresh` (boolean, optional)

## Installation

Requires Node.js 20 or later.

```bash
git clone https://github.com/phattja/mcp-thailaw.git
cd mcp-thailaw
npm install
npm run build
```

Run STDIO:

```bash
node dist/cli.js
```

Run Streamable HTTP (Open WebUI):

```bash
MCP_HTTP_PORT=8005 MCP_HTTP_HOST=0.0.0.0 node dist/cli.js
```

### Docker

Base image is `node:latest`.

```bash
docker compose up -d --build
```

Or:

```bash
docker build -t mcp-thailaw:latest -f Dockerfile .
docker run --rm -p 8005:8005 \
  --add-host=host.docker.internal:host-gateway \
  -e MCP_HTTP_PORT=8005 \
  -e MCP_HTTP_HOST=0.0.0.0 \
  -e QDRANT_URL=http://host.docker.internal:6333 \
  -e EMBEDDING_URL=http://host.docker.internal:57863/v1/embeddings \
  mcp-thailaw:latest
```

See **[CONFIGURATION.md](CONFIGURATION.md)** for every environment variable.

## Dataset

Indexed documents come from [Open Law Data Thailand: OCS Krisdika](https://huggingface.co/datasets/open-law-data-thailand/ocs-krisdika) (CC-BY 4.0). The collection is for research and software use — verify citations against the official source at [searchlaw.ocs.go.th](https://www.ocs.go.th/) before relying on them legally.

## License

MIT — see [LICENSE](LICENSE).
