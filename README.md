# Thai Law MCP Server

**Semantic Thai law search for AI assistants — query OCS Krisdika (สำนักงานคณะกรรมการกฤษฎีกา) through Qdrant.**

An [MCP server](https://modelcontextprotocol.io/introduction) that embeds a query and searches the `krisdika` vector collection. The search backend is the Thai-law flow from `thai_law_mcp.py`. The server shape — STDIO and Streamable HTTP, Docker, and client wiring — comes from [mcp-searxng](https://github.com/ihor-sokoliuk/mcp-searxng).

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
        "EMBEDDING_URL": "http://127.0.0.1:3003/v1",
        "EMBEDDING_MODEL": "gpustack-bge-m3"
      }
    }
  }
}
```

### HTTP (Open WebUI)

```bash
node dist/cli.js \
  --http-port 8005 \
  --http-host 0.0.0.0 \
  --qdrant-url http://127.0.0.1:6333 \
  --qdrant-collection krisdika \
  --embedding-url http://127.0.0.1:3003/v1 \
  --embedding-model gpustack-bge-m3
```

CLI flags override the matching environment variables (`QDRANT_URL`, `EMBEDDING_URL`, `THAILAW_HTTP_PORT`, ...).

Connect the client to `http://localhost:8005/mcp`.

The local defaults match the prototype in `thai_law_mcp.py`:

| Setting | Default |
| --- | --- |
| Qdrant | `http://localhost:6333` / collection `krisdika` |
| Embeddings | `http://127.0.0.1:3003/v1` / `gpustack-bge-m3` |
| Top K | `40` |
| Score threshold | `0.30` |

## Tools

* **search_thai_law** — semantic search over Thai statutes
  * `query` (string, required)
  * `top_k` (integer, optional, 1–100, default 40)
  * `score_threshold` (number, optional, 0.0–1.0, default 0.30)
  * `law_code` (string, optional)
  * `category` (string, optional)
  * `is_latest` (boolean, optional, default `true`)
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
node dist/cli.js --http-port 8005 --http-host 0.0.0.0
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
  -e THAILAW_HTTP_PORT=8005 \
  -e THAILAW_HTTP_HOST=0.0.0.0 \
  -e QDRANT_URL=http://host.docker.internal:6333 \
  -e EMBEDDING_URL=http://host.docker.internal:3003/v1 \
  mcp-thailaw:latest
```

See **[CONFIGURATION.md](CONFIGURATION.md)** for every environment variable.

## Self-hosted Qdrant

This MCP server searches an existing Qdrant collection. To build that collection yourself:

1. Run [Qdrant](https://qdrant.tech/) (default `http://localhost:6333`).
2. Run an OpenAI-compatible embedding server with **bge-m3** (1024-dim).
3. Ingest [open-law-data-thailand/ocs-krisdika](https://huggingface.co/datasets/open-law-data-thailand/ocs-krisdika) from Hugging Face:

```bash
pip install -r scripts/requirements-ingest.txt
python3 scripts/ingest_thai_law_qdrant.py
```

The script downloads raw JSONL, chunks each law, embeds it, and upserts into collection `krisdika`. Use the same `QDRANT_URL`, `QDRANT_COLLECTION`, `EMBEDDING_URL`, and `EMBEDDING_MODEL` values you pass to `mcp-thailaw`.

Full steps, payload fields, and test-run limits: **[docs/self-hosted-qdrant.md](docs/self-hosted-qdrant.md)**.

## Dataset

Indexed documents come from [Open Law Data Thailand: OCS Krisdika](https://huggingface.co/datasets/open-law-data-thailand/ocs-krisdika) (CC-BY 4.0). The collection is for research and software use — verify citations against the official source at [searchlaw.ocs.go.th](https://www.ocs.go.th/) before relying on them legally.

## Acknowledgements

This project is a fork of **[mcp-searxng](https://github.com/ihor-sokoliuk/mcp-searxng)** by [Ihor Sokoliuk](https://github.com/ihor-sokoliuk).

Thank you for the MCP server design, transport and Docker layout, and the working pattern for connecting AI clients to a search backend. `mcp-thailaw` reuses that foundation and replaces web search with Thai law retrieval. Any remaining SearXNG-specific history in this repository is kept for provenance.

## License

MIT — see [LICENSE](LICENSE). The original `mcp-searxng` work is also MIT-licensed.
