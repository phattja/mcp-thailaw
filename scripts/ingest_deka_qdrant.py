#!/usr/bin/env python3
"""Stream-ingest ฎีกา JSONL shards into Qdrant collection `deka`.

Source files are required on the command line (one or more). Example:
  python3 ingest_deka_qdrant.py /home/jupyter/ai-data/deka.000 /home/jupyter/ai-data/deka.001
If no files are passed, or any listed path is missing, the script stops.
A mix of existing and missing files also stops (no partial ingest).

The script:
  - never loads a whole shard into memory
  - embeds and upserts in small batches
  - skips duplicate doc_id (keep first, across all listed files)
  - stores a short summary in payload, not the full judgment
  - uses llama.cpp dense 1024-d + ColBERT from one /embedding call

Do not point QDRANT_COLLECTION at krisdika.

Environment:
  QDRANT_URL              default http://qdrant:6333
  QDRANT_COLLECTION       default deka
  QDRANT_API_KEY          optional
  EMBEDDING_URL           default http://ai-tool:3003
  EMBEDDING_MODEL         default bge-m3-multi
  COLBERT_URL             default same as EMBEDDING_URL
  EMBEDDING_API_KEY       optional
  THAILAW_COLBERT_MAX_TOKENS  default 2
  THAILAW_VECTOR_SIZE     default 1024
  THAILAW_BATCH_SIZE      default 4
  THAILAW_MAX_DOCS        optional int (smoke test)
  THAILAW_DEKA_PAYLOAD_CHARS  default 4000  (payload summary length)
  THAILAW_DEKA_RECREATE   default true   (delete collection if it exists)
"""

from __future__ import annotations

import json
import os
import re
import sys
import uuid
from pathlib import Path

import requests
from tqdm import tqdm

QDRANT_URL = os.environ.get("QDRANT_URL", "http://qdrant:6333").rstrip("/")
COLLECTION_NAME = os.environ.get("QDRANT_COLLECTION", "deka")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY") or None
MASTER_KRISDIKA = "krisdika"

EMBEDDING_URL = os.environ.get(
    "EMBEDDING_URL",
    os.environ.get("COLBERT_URL", "http://ai-tool:3003"),
).rstrip("/")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "bge-m3-multi")
COLBERT_URL = os.environ.get("COLBERT_URL", EMBEDDING_URL).rstrip("/")
EMBEDDING_API_KEY = os.environ.get("EMBEDDING_API_KEY") or None
COLBERT_MAX_TOKENS = int(os.environ.get("THAILAW_COLBERT_MAX_TOKENS", "2"))
VECTOR_SIZE = int(os.environ.get("THAILAW_VECTOR_SIZE", "1024"))
BATCH_SIZE = int(os.environ.get("THAILAW_BATCH_SIZE", "4"))
MAX_DOCS_RAW = os.environ.get("THAILAW_MAX_DOCS", "").strip()
MAX_DOCS = int(MAX_DOCS_RAW) if MAX_DOCS_RAW else None
PAYLOAD_CHARS = int(os.environ.get("THAILAW_DEKA_PAYLOAD_CHARS", "4000"))
RECREATE = os.environ.get("THAILAW_DEKA_RECREATE", "true").strip().lower() not in {"0", "false", "no"}

HOST_JUPYTER_PREFIX = "/ai/jupyter/home"
CONTAINER_JUPYTER_PREFIX = "/home/jupyter"

CASE_NO_RE = re.compile(r"คำพิพากษาศาลฎีกาที่\s*([0-9]+/[0-9]+)")
UUID_NS = uuid.UUID("8f3d1b6e-6c2a-4f0d-9c5e-2a7b4d1e9c10")


def map_jupyter_path(path: str) -> str:
    if not path:
        return path
    if os.path.exists(path):
        return path
    if path == HOST_JUPYTER_PREFIX or path.startswith(HOST_JUPYTER_PREFIX + "/"):
        return CONTAINER_JUPYTER_PREFIX + path[len(HOST_JUPYTER_PREFIX):]
    if path == CONTAINER_JUPYTER_PREFIX or path.startswith(CONTAINER_JUPYTER_PREFIX + "/"):
        mapped = HOST_JUPYTER_PREFIX + path[len(CONTAINER_JUPYTER_PREFIX):]
        if os.path.exists(mapped):
            return mapped
    return path


def resolve_source_files(raw_paths: list[str]) -> list[Path] | None:
    if not raw_paths:
        print("❌ Stop: no source files on the command line.")
        print("   Usage: ingest_deka_qdrant.py deka.000 [deka.001 ...]")
        return None
    found: list[Path] = []
    missing: list[str] = []
    for raw in raw_paths:
        token = raw.strip()
        if not token:
            missing.append(raw)
            continue
        path = Path(map_jupyter_path(token))
        if path.is_file():
            found.append(path)
        else:
            missing.append(str(path))
    if missing:
        print("❌ Stop: every listed source file must exist (no partial set).")
        if found:
            print("   found:")
            for path in found:
                print(f"     {path}")
        print("   missing:")
        for item in missing:
            print(f"     {item}")
        return None
    return found


def _headers() -> dict:
    headers = {"Content-Type": "application/json"}
    if EMBEDDING_API_KEY:
        headers["Authorization"] = f"Bearer {EMBEDDING_API_KEY}"
    return headers


def _join(url: str, suffix: str) -> str:
    if url.endswith(("/embed", "/embed_all", "/embeddings", "/colbert", "/embedding")):
        return url
    return f"{url.rstrip('/')}{suffix}"


LLAMA_ENDPOINT = _join(EMBEDDING_URL, "/embedding")


def _l2_vec(vector: list[float]) -> list[float]:
    norm = sum(value * value for value in vector) ** 0.5
    scale = max(norm, 1e-12)
    return [value / scale for value in vector]


def _l2_rows(rows: list[list[float]]) -> list[list[float]]:
    out = []
    for row in rows:
        unit = _l2_vec(row)
        if any(abs(value) > 1e-6 for value in unit):
            out.append(unit)
    return out


def _mean_dense(rows: list[list[float]]) -> list[float]:
    width = len(rows[0])
    acc = [0.0] * width
    for row in rows:
        for index, value in enumerate(row):
            acc[index] += value
    count = float(len(rows))
    return _l2_vec([value / count for value in acc])


def get_dual_embeddings(texts: list[str]) -> tuple[list[list[float]], list[list[list[float]]]]:
    response = requests.post(
        LLAMA_ENDPOINT,
        json={"model": EMBEDDING_MODEL, "content": texts if len(texts) > 1 else texts[0]},
        headers=_headers(),
        timeout=180,
    )
    if not response.ok:
        raise requests.HTTPError(
            f"{response.status_code} {response.reason} for url: {response.url}\n{response.text[:800]}",
            response=response,
        )
    payload = response.json()
    if not isinstance(payload, list) or not payload:
        raise RuntimeError(f"Unexpected embedding payload from {LLAMA_ENDPOINT}")
    if isinstance(payload[0], dict) and "embedding" in payload[0]:
        items = sorted(payload, key=lambda item: item.get("index", 0))
        matrices = [item["embedding"] for item in items]
    elif payload and isinstance(payload[0], list) and payload[0] and isinstance(payload[0][0], (int, float)):
        matrices = [payload]
    else:
        matrices = payload
    if len(matrices) != len(texts):
        raise RuntimeError(f"Embedding batch size {len(matrices)} != {len(texts)}")
    dense = []
    colbert = []
    for matrix in matrices:
        dense.append(_mean_dense(matrix))
        tokens = _l2_rows(matrix)[:COLBERT_MAX_TOKENS]
        if not tokens:
            raise RuntimeError("empty ColBERT matrix")
        colbert.append(tokens)
    return dense, colbert


def get_colbert_embeddings(texts: list[str]) -> list[list[list[float]]]:
    _dense, colbert = get_dual_embeddings(texts)
    return colbert


def parse_case_no(text: str, doc_id: str) -> str:
    match = CASE_NO_RE.search(text[:400])
    if match:
        return match.group(1)
    raw = doc_id.replace("deka-", "").strip()
    return raw


def search_text(doc_id: str, year, case_no: str, text: str) -> str:
    """Embed input only. Truncated by the ColBERT server to COLBERT_MAX_TOKENS."""
    head = text[:2000].strip()
    return "\n".join([
        f"คำพิพากษาศาลฎีกาที่ {case_no}",
        f"doc_id: {doc_id}",
        f"year: {year or ''}",
        "",
        head,
    ])


def flush_batch(client, batch: list[dict]) -> int:
    from qdrant_client.models import PointStruct

    if not batch:
        return 0
    texts = [item["embed_text"] for item in batch]
    dense_vecs, colbert_vecs = get_dual_embeddings(texts)
    points = [
        PointStruct(
            id=item["id"],
            vector={"dense": dense, "colbert": colbert},
            payload=item["payload"],
        )
        for item, dense, colbert in zip(batch, dense_vecs, colbert_vecs)
    ]
    client.upsert(collection_name=COLLECTION_NAME, points=points)
    return len(points)


def main() -> int:
    sources = resolve_source_files(sys.argv[1:])
    if sources is None:
        return 2

    from qdrant_client import QdrantClient
    from qdrant_client.models import (
        Datatype,
        Distance,
        HnswConfigDiff,
        MultiVectorComparator,
        MultiVectorConfig,
        PayloadSchemaType,
        PointStruct,
        VectorParams,
    )

    if COLLECTION_NAME.strip() == MASTER_KRISDIKA:
        print(f"❌ Refusing to write Supreme Court cases into '{MASTER_KRISDIKA}'.")
        print("   Use QDRANT_COLLECTION=deka")
        return 2

    total_gb = sum(path.stat().st_size for path in sources) / (1024 ** 3)
    print(f"1. Source {len(sources)} file(s) ({total_gb:.2f} GiB) — streaming, no full load")
    for path in sources:
        print(f"   {path} ({path.stat().st_size / (1024 ** 3):.2f} GiB)")

    print("2. Testing llama.cpp embeddings...")
    test_dense, test = get_dual_embeddings(["คำพิพากษาศาลฎีกาที่ 1/2560 หลักกฎหมาย"])
    print(
        f"   → {LLAMA_ENDPOINT} dense={len(test_dense[0])} "
        f"tokens={len(test[0])} dim={len(test[0][0])}",
    )

    client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    if client.collection_exists(COLLECTION_NAME):
        if not RECREATE:
            print(f"❌ Collection '{COLLECTION_NAME}' exists. Set THAILAW_DEKA_RECREATE=true to replace it.")
            return 2
        print(f"3. Deleting existing '{COLLECTION_NAME}'...")
        client.delete_collection(COLLECTION_NAME)

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config={
            "dense": VectorParams(
                size=VECTOR_SIZE,
                distance=Distance.COSINE,
                on_disk=True,
                datatype=Datatype.FLOAT16,
            ),
            "colbert": VectorParams(
                size=VECTOR_SIZE,
                distance=Distance.COSINE,
                on_disk=True,
                datatype=Datatype.FLOAT16,
                hnsw_config=HnswConfigDiff(on_disk=True),
                multivector_config=MultiVectorConfig(
                    comparator=MultiVectorComparator.MAX_SIM,
                ),
            ),
        },
    )
    print(f"   → created '{COLLECTION_NAME}' (dense 1024 + colbert {COLBERT_MAX_TOKENS}x{VECTOR_SIZE})")

    seen: set[str] = set()
    batch: list[dict] = []
    kept = 0
    skipped_dup = 0
    scanned = 0
    errors = 0

    print("4. Streaming JSONL → ColBERT → Qdrant...")
    stop = False
    for jsonl in sources:
        if stop:
            break
        print(f"   file {jsonl.name}")
        with jsonl.open("r", encoding="utf-8") as handle:
            for line in tqdm(handle, desc=jsonl.name):
                line = line.strip()
                if not line:
                    continue
                scanned += 1
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    errors += 1
                    continue
                doc_id = str(item.get("doc_id") or "").strip()
                text = str(item.get("text") or "").strip()
                if not doc_id or not text:
                    continue
                if doc_id in seen:
                    skipped_dup += 1
                    continue
                seen.add(doc_id)
                case_no = parse_case_no(text, doc_id)
                year = item.get("year")
                payload = {
                    "doc_id": doc_id,
                    "source": str(item.get("source") or "supreme_court"),
                    "case_no": case_no,
                    "title": f"คำพิพากษาศาลฎีกาที่ {case_no}",
                    "summary": text[:PAYLOAD_CHARS],
                    "text_chars": len(text),
                }
                if isinstance(year, int):
                    payload["year"] = year
                batch.append({
                    "id": str(uuid.uuid5(UUID_NS, doc_id)),
                    "payload": payload,
                    "embed_text": search_text(doc_id, year, case_no, text),
                })
                if len(batch) >= BATCH_SIZE:
                    try:
                        kept += flush_batch(client, batch)
                    except Exception as exc:
                        print(f"\n❌ batch at row {scanned}: {exc}")
                        errors += 1
                    batch = []
                if MAX_DOCS and kept >= MAX_DOCS:
                    stop = True
                    break

    if batch and (not MAX_DOCS or kept < MAX_DOCS):
        try:
            kept += flush_batch(client, batch)
        except Exception as exc:
            print(f"\n❌ final batch: {exc}")
            errors += 1

    print("5. Payload indexes...")
    for field, schema in {
        "doc_id": PayloadSchemaType.KEYWORD,
        "case_no": PayloadSchemaType.KEYWORD,
        "year": PayloadSchemaType.INTEGER,
        "source": PayloadSchemaType.KEYWORD,
    }.items():
        try:
            client.create_payload_index(
                collection_name=COLLECTION_NAME,
                field_name=field,
                field_schema=schema,
            )
        except Exception as exc:
            print(f"   index {field}: {exc}")

    info = client.get_collection(COLLECTION_NAME)
    print("=" * 55)
    print("✅ Deka ingest finished")
    print(f"Collection   : {COLLECTION_NAME}")
    print(f"Scanned rows : {scanned}")
    print(f"Duplicates   : {skipped_dup}")
    print(f"Upserted     : {kept}")
    print(f"Errors       : {errors}")
    print(f"Qdrant points: {info.points_count}")
    print("=" * 55)
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
