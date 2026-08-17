# Self-hosted Qdrant vector database

`mcp-thailaw` does not ship the law index. For a self-hosted build you run **Qdrant**, an **OpenAI-compatible embedding server**, and the ingest script that loads [open-law-data-thailand/ocs-krisdika](https://huggingface.co/datasets/open-law-data-thailand/ocs-krisdika) from Hugging Face.

The ingest script in this repository is `scripts/ingest_thai_law_qdrant.py`. It is the same flow as `/ai/jupyter/home/ingest_thai_law_qdrant.py`: download raw JSONL (avoids Hugging Face `datasets` schema errors), chunk each law, embed with bge-m3, upsert into Qdrant.

```
Hugging Face  ocs-krisdika JSONL
        │  snapshot_download
        ▼
  ingest_thai_law_qdrant.py
        │  POST /v1/embeddings  (bge-m3, 1024-dim)
        ▼
  Embedding server
        │  Qdrant upsert  (cosine)
        ▼
  Qdrant collection `krisdika`
        │  query_points
        ▼
  mcp-thailaw
```

## Prerequisites

1. **Qdrant** listening on HTTP, typically `http://localhost:6333`.
2. **Embedding server** with an OpenAI-compatible `POST /v1/embeddings` API. The index was built with **bge-m3** at **1024 dimensions**, cosine distance. Query-time embeddings must use the same model and size.
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
export QDRANT_URL=http://localhost:6333
export QDRANT_COLLECTION=krisdika
export EMBEDDING_URL=http://127.0.0.1:3003/v1
export EMBEDDING_MODEL=gpustack-bge-m3
export THAILAW_MAX_DOCS=50

python3 scripts/ingest_thai_law_qdrant.py
```

Then run again without `THAILAW_MAX_DOCS` for the full index. `THAILAW_ONLY_LATEST` defaults to `true` (same as search).

| Variable | Default | Meaning |
| --- | --- | --- |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant HTTP base URL |
| `QDRANT_COLLECTION` | `krisdika` | Collection name |
| `QDRANT_API_KEY` | _(unset)_ | Optional Qdrant API key |
| `EMBEDDING_URL` | `http://127.0.0.1:3003/v1` | OpenAI-compatible embeddings endpoint |
| `EMBEDDING_MODEL` | `gpustack-bge-m3` | Model name sent to the embedding server |
| `EMBEDDING_API_KEY` | _(unset)_ | Optional bearer token |
| `THAILAW_ONLY_LATEST` | `true` | Ingest only documents with `is_latest=true` |
| `THAILAW_MAX_DOCS` | _(unset)_ | Limit the number of laws (for a test run) |
| `THAILAW_VECTOR_SIZE` | `1024` | Must match the embedding model |
| `THAILAW_BATCH_SIZE` | `32` | Embedding / upsert batch size |

These `QDRANT_*` and `EMBEDDING_*` names are the same ones `mcp-thailaw` uses at search time.

## What gets stored

Each Qdrant point is one text chunk (about 1100 characters, 180 overlap) with payload:

- `text`, `title`, `law_code`, `publish_date`, `reference_url`, `category`
- `chunk_index`, `source` (`ocs-krisdika`), `is_latest`

Vectors: **1024-dim**, **cosine**. After ingest, `mcp-thailaw` searches with `is_latest=true` by default.

## Point mcp-thailaw at the collection

```bash
node dist/cli.js \
  --http-port 8005 \
  --qdrant-url http://127.0.0.1:6333 \
  --qdrant-collection krisdika \
  --embedding-url http://127.0.0.1:3003/v1 \
  --embedding-model gpustack-bge-m3
```

Use `thailaw_collection_info` to confirm point count and vector size.

## Dataset license

Source: [Open Law Data Thailand: OCS Krisdika](https://huggingface.co/datasets/open-law-data-thailand/ocs-krisdika) (CC-BY 4.0). Official text remains at [สำนักงานคณะกรรมการกฤษฎีกา](https://www.ocs.go.th/).
