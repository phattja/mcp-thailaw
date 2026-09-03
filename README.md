# Thai Law MCP Server

**Semantic Thai law search for AI assistants — query สำนักงานคณะกรรมการกฤษฎีกา and คำพิพากษาศาลฎีกา through Qdrant.**

An [MCP server](https://modelcontextprotocol.io/introduction) that embeds a query and searches the `krisdika` and `deka` vector collections.

```
AI Assistant / Open WebUI
        │  MCP protocol
        ▼
  mcp-thailaw  (this project — Node.js)
        │  llama.cpp /embedding + /rerank
        ▼
  bge-m3-multi @ http://ai-tool:3003
        │  optional rerank (bge-reranker-v2-m3)
        │  Qdrant MaxSim on named vector `colbert`
        ▼
  Qdrant collections `krisdika` and `deka`
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
        "QDRANT_URL": "http://qdrant:6333",
        "QDRANT_COLLECTION": "krisdika",
        "EMBEDDING_URL": "http://ai-tool:3003",
        "EMBEDDING_MODEL": "bge-m3-multi",
        "COLBERT_URL": "http://ai-tool:3003",
        "THAILAW_VECTOR_MODE": "colbert",
        "RERANK_URL": "http://ai-tool:3003",
        "RERANK_MODEL": "bge-reranker-v2-m3"
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
  --qdrant-url http://qdrant:6333 \
  --qdrant-collection krisdika \
  --embedding-url http://ai-tool:3003 \
  --embedding-model bge-m3-multi \
  --colbert-url http://ai-tool:3003 \
  --vector-mode colbert \
  --rerank-url http://ai-tool:3003 \
  --rerank-model bge-reranker-v2-m3
```

CLI flags override the matching environment variables (`QDRANT_URL`, `EMBEDDING_URL`, `THAILAW_HTTP_PORT`, ...).

Connect the client to `http://localhost:8005/mcp`.

| Setting | Default |
| --- | --- |
| Qdrant | `http://qdrant:6333` / collection `krisdika` |
| Embeddings | `http://ai-tool:3003` / `bge-m3-multi` dense 1024-d + ColBERT 64×1024 (`pooling=none`) |
| Rerank | `http://ai-tool:3003` / `bge-reranker-v2-m3` |
| Top K | `5` |
| Score threshold | `0.30` |

MCP resources: `thailaw://server-config`, `thailaw://usage-guide`.

## Tools

* **search_krisdika** — semantic search over Thai statutes (กฤษฎีกา)
  * `query` (string, required)
  * `top_k` (integer, optional, 1–100, default 5)
  * `score_threshold` (number, optional, 0–64, default 0.30). Dense cosine is typically 0–1; ColBERT MaxSim can exceed 1
  * `law_code` (string, optional)
  * `category` (string, optional)
  * `is_latest` (boolean, optional, default `true`)
  * `group_by_law` (boolean, optional, default `true`) — reconstruct each มาตรา from its fragments and return official statute layout
  * `source` — `qdrant` (default), `online` (https://www.ocs.go.th/searchlaw-law), `both`, or `auto` (Qdrant first, website if empty)
  * `exclude` — comma-separated words to drop, for example `วิ่งราว,ชิงทรัพย์`
  * `include` — titles with `(ยกเลิก)` are dropped unless `include=(ยกเลิก)` or `include=cancel`
  * `response_format` (`text` or `json`, optional)
* **search_krisdika_online** — live catalog search on https://www.ocs.go.th/searchlaw-law
* **search_deka** — semantic search over Supreme Court judgments in Qdrant collection `deka`
  * `query` (string, required)
  * `year` — กรองปี พ.ศ. (Qdrant stores A.D.; the tool converts both ways)
  * `top_k`, `score_threshold`, `exclude`, `response_format`
* **search_deka_online** — search Supreme Court judgments on https://deka.supremecourt.or.th/
  * `year`, `year_from`, `year_to` — ช่วงปี พ.ศ.
* **krisdika_collection_info** / **deka_collection_info** — Qdrant collection status
* **krisdeka_connection_info** — reachability of https://www.ocs.go.th/searchlaw-law
* **deka_connection_info** — reachability of https://deka.supremecourt.or.th/

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

See **[CONFIGURATION.md](CONFIGURATION.md)** for every environment variable.

## Self-hosted Qdrant

This MCP server searches an existing Qdrant collection. To build that collection yourself:

1. Run [Qdrant](https://qdrant.tech/) (default `http://qdrant:6333`).
2. Run llama.cpp with `bge-m3-multi` (`pooling=none`) and `bge-reranker-v2-m3` at `http://ai-tool:3003`.
3. Ingest [open-law-data-thailand/ocs-krisdika](https://huggingface.co/datasets/open-law-data-thailand/ocs-krisdika):

```bash
pip install -r scripts/requirements-ingest.txt
python3 scripts/ingest_thai_law_qdrant.py
```

The script embeds each section as dense 1024-d plus named `colbert` multi-vectors (MaxSim 64×1024) and upserts into collection `krisdika`. Use the same `QDRANT_URL`, `QDRANT_COLLECTION`, and `EMBEDDING_URL` values you pass to `mcp-thailaw`.

Full steps: **[docs/self-hosted-qdrant.md](docs/self-hosted-qdrant.md)**.

## Dataset

Indexed documents come from [Open Law Data Thailand: OCS Krisdika](https://huggingface.co/datasets/open-law-data-thailand/ocs-krisdika) (CC-BY 4.0). The collection is for research and software use — verify citations against the official source at [searchlaw.ocs.go.th](https://www.ocs.go.th/) before relying on them legally.

## License

MIT — see [LICENSE](LICENSE).
