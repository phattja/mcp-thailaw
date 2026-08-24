# Self-hosted Qdrant vector database

`mcp-thailaw` does not ship the law index. For a self-hosted build you run **Qdrant**, **llama.cpp** (`bge-m3-multi` pooling=none), and the ingest script that loads [open-law-data-thailand/ocs-krisdika](https://huggingface.co/datasets/open-law-data-thailand/ocs-krisdika) from Hugging Face.

The ingest script in this repository is `scripts/ingest_thai_law_qdrant.py`. It prefers a local JSONL tree (`THAILAW_JSONL_ROOT`, default `/ai/jupyter/home/ocs-krisdika-data`). If that tree is missing it downloads raw JSONL from Hugging Face. Each JSONL **section** becomes one Qdrant point. Document fields stay at the payload root; section fields live under `section`.

```
Hugging Face  ocs-krisdika JSONL
        │  snapshot_download
        ▼
  ingest_thai_law_qdrant.py
        │  llama.cpp /embedding  (bge-m3-multi, 1024-dim)
        ▼
  ai-tool :3003
        │  Qdrant upsert  (named dense + colbert MaxSim)
        ▼
  Qdrant collection `krisdika`
        │  query_points
        ▼
  mcp-thailaw
```

## Prerequisites

1. **Qdrant** listening on HTTP, typically `http://qdrant:6333`.
2. **llama.cpp** at `http://ai-tool:3003` with alias `bge-m3-multi` (`pooling=none`) and `bge-reranker-v2-m3`.
3. Python 3.10+ and network access to Hugging Face for the first download.

Example Qdrant (Docker):

```bash
docker run -d --name qdrant -p 6333:6333 -v qdrant_storage:/qdrant/storage qdrant/qdrant
```

## Install ingest dependencies

```bash
pip install -r scripts/requirements-ingest.txt
```

## Run the ingest

A full ingest **deletes and recreates** the collection, then embeds every selected law. Start with a small test:

```bash
export QDRANT_URL=http://qdrant:6333
export QDRANT_COLLECTION=krisdika
export EMBEDDING_URL=http://ai-tool:3003
export EMBEDDING_MODEL=bge-m3-multi
export COLBERT_URL=http://ai-tool:3003
export THAILAW_VECTOR_SIZE=1024
export THAILAW_JSONL_ROOT=/home/jupyter/ocs-krisdika-data
export THAILAW_MAX_DOCS=50

python3 scripts/ingest_thai_law_qdrant.py
```

Then run again without `THAILAW_MAX_DOCS` for the full index. `THAILAW_ONLY_LATEST` defaults to `true` (same as search).

| Variable | Default | Meaning |
| --- | --- | --- |
| `QDRANT_URL` | `http://qdrant:6333` | Qdrant HTTP base URL |
| `QDRANT_COLLECTION` | `krisdika` | Collection name |
| `QDRANT_API_KEY` | _(unset)_ | Optional Qdrant API key |
| `EMBEDDING_URL` | `http://ai-tool:3003` | llama.cpp `/embedding` |
| `EMBEDDING_MODEL` | `bge-m3-multi` | Model alias sent to llama.cpp |
| `COLBERT_URL` | `http://ai-tool:3003` | Same llama.cpp `/embedding` endpoint |
| `EMBEDDING_API_KEY` | _(unset)_ | Optional bearer token |
| `THAILAW_JSONL_ROOT` | `/home/jupyter/ocs-krisdika-data` | Local dataset tree. Host path `/ai/jupyter/home/...` is remapped to `/home/jupyter/...` inside the Jupyter container |
| `THAILAW_JSONL_FILE` | _(unset)_ | Ingest only this one `.jsonl` file (same path remap) |
| `THAILAW_ONLY_LATEST` | `true` | Ingest only documents with `is_latest=true` |
| `THAILAW_MAX_DOCS` | _(unset)_ | Limit the number of laws (for a test run) |
| `THAILAW_VECTOR_SIZE` | `1024` | Must match bge-m3 (native 1024) |
| `THAILAW_BATCH_SIZE` | `4` | Embedding / upsert batch size |
| `THAILAW_COLBERT_MAX_TOKENS` | `64` | Token vectors stored per section |

These `QDRANT_*` and `EMBEDDING_*` names are the same ones `mcp-thailaw` uses at search time.

## What gets stored

Each Qdrant point is **one JSONL section** (one มาตรา/ข้อ), not a 1100-character slice of the whole law.

Document fields (payload root): `filename`, `law_code`, `timeline_code`, `category`, `title`, `is_latest`, `publish_date`, `year`, `month`, `reference_url`, `raw_enc_id`

Section object (`section`): `sectionId`, `sectionTypeId`, `sectionNo`, `sectionName`, `contentNo`, `content`

Also at root: `source` (`ocs-krisdika`), `chunk_index` (section order), `jsonl_file`

The embed string is sent to the embedding server only. It is **not** stored as `text`.

Vectors: named **`dense`** (1024-d) plus named **`colbert`** (64×1024 MaxSim, float16 on disk). Query-time MCP defaults to ColBERT. After ingest, `mcp-thailaw` searches with `is_latest=true` by default.

## Point mcp-thailaw at the collection

```bash
node dist/cli.js \
  --http-port 8005 \
  --qdrant-url http://qdrant:6333 \
  --qdrant-collection krisdika \
  --embedding-url http://ai-tool:3003 \
  --embedding-model bge-m3-multi \
  --colbert-url http://ai-tool:3003 \
  --vector-mode colbert \
  --rerank-url http://ai-tool:3003 \
  --rerank-model bge-reranker-v2-m3
```

Use `krisdika_collection_info` to confirm point count and vector size.

## Dataset license

Indexed documents come from [Open Law Data Thailand: OCS Krisdika](https://huggingface.co/datasets/open-law-data-thailand/ocs-krisdika) (CC-BY 4.0). Verify citations against the official source before relying on them legally.
