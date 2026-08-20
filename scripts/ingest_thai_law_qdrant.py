#!/usr/bin/env python3
"""
Ingest open-law-data-thailand/ocs-krisdika into a self-hosted Qdrant collection.

One Qdrant point per JSONL section. Document fields stay at the payload root.
Section fields live under payload["section"]. The embed string is sent to the
embedding server only — it is not stored as payload["text"].

Uses a local JSONL tree when present (no Hugging Face download). Otherwise
downloads raw JSONL from Hugging Face (avoids datasets schema errors).

Environment (same names as mcp-thailaw):
  QDRANT_URL              default http://localhost:6333
  QDRANT_COLLECTION       default krisdika
  QDRANT_API_KEY          optional
  EMBEDDING_URL           default http://127.0.0.1:3003
  EMBEDDING_MODEL         default bge-m3-multi
  COLBERT_URL             default same as EMBEDDING_URL (llama.cpp /embedding)
  EMBEDDING_API_KEY       optional bearer token
  THAILAW_COLBERT_MAX_TOKENS  default 64
  THAILAW_JSONL_ROOT      default /home/jupyter/ocs-krisdika-data
                          (/ai/jupyter/home/... is remapped to /home/jupyter/...)
  THAILAW_JSONL_FILE      optional single .jsonl (overrides ROOT)
  THAILAW_ONLY_LATEST     default true  (ingest only is_latest documents)
  THAILAW_MAX_DOCS        optional int  (limit for a test run)
  THAILAW_VECTOR_SIZE     default 1024  (bge-m3 native)
  THAILAW_BATCH_SIZE      default 4
"""

from huggingface_hub import snapshot_download
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
from tqdm import tqdm
import uuid
import os
import requests
import json
import glob

QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333").rstrip("/")
COLLECTION_NAME = os.environ.get("QDRANT_COLLECTION", "krisdika")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY") or None

EMBEDDING_URL = os.environ.get(
    "EMBEDDING_URL",
    os.environ.get("COLBERT_URL", "http://127.0.0.1:3003"),
).rstrip("/")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "bge-m3-multi")
COLBERT_URL = os.environ.get("COLBERT_URL", EMBEDDING_URL).rstrip("/")
EMBEDDING_API_KEY = os.environ.get("EMBEDDING_API_KEY") or None
COLBERT_MAX_TOKENS = int(os.environ.get("THAILAW_COLBERT_MAX_TOKENS", "64"))

VECTOR_SIZE = int(os.environ.get("THAILAW_VECTOR_SIZE", "1024"))
BATCH_SIZE = int(os.environ.get("THAILAW_BATCH_SIZE", "4"))
ONLY_LATEST = os.environ.get("THAILAW_ONLY_LATEST", "true").strip().lower() not in {"0", "false", "no"}
MAX_DOCS_RAW = os.environ.get("THAILAW_MAX_DOCS", "").strip()
MAX_DOCS = int(MAX_DOCS_RAW) if MAX_DOCS_RAW else None

HOST_JUPYTER_PREFIX = "/ai/jupyter/home"
CONTAINER_JUPYTER_PREFIX = "/home/jupyter"


def map_jupyter_path(path: str) -> str:
    """Prefer the real path. Inside the Jupyter container, /ai/jupyter/home → /home/jupyter."""
    if not path:
        return path
    if os.path.exists(path):
        return path
    if path == HOST_JUPYTER_PREFIX or path.startswith(HOST_JUPYTER_PREFIX + "/"):
        mapped = CONTAINER_JUPYTER_PREFIX + path[len(HOST_JUPYTER_PREFIX):]
        return mapped
    if path == CONTAINER_JUPYTER_PREFIX or path.startswith(CONTAINER_JUPYTER_PREFIX + "/"):
        mapped = HOST_JUPYTER_PREFIX + path[len(CONTAINER_JUPYTER_PREFIX):]
        if os.path.exists(mapped):
            return mapped
    return path


JSONL_ROOT = map_jupyter_path(
    os.environ.get("THAILAW_JSONL_ROOT", "/home/jupyter/ocs-krisdika-data").rstrip("/"),
)
JSONL_FILE = map_jupyter_path(os.environ.get("THAILAW_JSONL_FILE", "").strip())

DOC_FIELDS = (
    "filename",
    "law_code",
    "timeline_code",
    "category",
    "title",
    "is_latest",
    "publish_date",
    "year",
    "month",
    "reference_url",
    "raw_enc_id",
)
SECTION_FIELDS = (
    "sectionId",
    "sectionTypeId",
    "sectionNo",
    "sectionName",
    "contentNo",
    "content",
)


def payload_value(value):
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value
    return str(value)


def _headers() -> dict:
    headers = {"Content-Type": "application/json"}
    if EMBEDDING_API_KEY:
        headers["Authorization"] = f"Bearer {EMBEDDING_API_KEY}"
    return headers


def _join(url: str, suffix: str) -> str:
    if url.endswith(("/embed", "/embed_all", "/embeddings", "/colbert", "/embedding")):
        return url
    if url.endswith("/v1"):
        return f"{url}/embeddings" if suffix == "/embed" else f"{url}{suffix}"
    return f"{url}{suffix}"


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


def _parse_llama_rows(payload, expected: int) -> list[list[list[float]]]:
    if not isinstance(payload, list) or not payload:
        raise RuntimeError(f"Unexpected embedding payload from {LLAMA_ENDPOINT}")
    if isinstance(payload[0], dict) and "embedding" in payload[0]:
        items = sorted(payload, key=lambda item: item.get("index", 0))
        matrices = [item["embedding"] for item in items]
    elif payload and isinstance(payload[0], list) and payload[0] and isinstance(payload[0][0], (int, float)):
        matrices = [payload]
    else:
        matrices = payload
    if len(matrices) != expected:
        raise RuntimeError(f"Embedding batch size {len(matrices)} != {expected}")
    return matrices


def get_dual_embeddings(texts: list[str]) -> tuple[list[list[float]], list[list[list[float]]]]:
    payload = _post_json(
        LLAMA_ENDPOINT,
        {"model": EMBEDDING_MODEL, "content": texts if len(texts) > 1 else texts[0]},
    )
    matrices = _parse_llama_rows(payload, len(texts))
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


def _post_json(url: str, payload: dict, timeout: int = 180):
    response = requests.post(url, json=payload, headers=_headers(), timeout=timeout)
    if not response.ok:
        detail = response.text[:800]
        raise requests.HTTPError(
            f"{response.status_code} {response.reason} for url: {response.url}\n{detail}",
            response=response,
        )
    return response.json()


def search_text(item: dict, section: dict) -> str:
    """Temporary embed input only. Never written to Qdrant payload."""
    title = item.get("title") or "ไม่มีชื่อ"
    content = str(section.get("content") or "").strip()
    return "\n".join([
        f"# {title}",
        f"รหัสกฎหมาย: {item.get('law_code') or ''}",
        f"timeline_code: {item.get('timeline_code') or ''}",
        f"วันที่ประกาศ: {item.get('publish_date') or ''}",
        f"sectionId: {section.get('sectionId') or ''}",
        f"sectionNo: {section.get('sectionNo') or ''}",
        f"sectionName: {section.get('sectionName') or ''}",
        f"sectionTypeId: {section.get('sectionTypeId') or ''}",
        "",
        content,
    ])


def section_payload(section: dict) -> dict:
    nested = {}
    for key in SECTION_FIELDS:
        value = payload_value(section.get(key))
        if value is not None:
            nested[key] = value
    return nested


def resolve_jsonl_files() -> list[str]:
    if JSONL_FILE:
        if not os.path.isfile(JSONL_FILE):
            raise FileNotFoundError(f"THAILAW_JSONL_FILE not found: {JSONL_FILE}")
        print(f"   → using single JSONL file: {JSONL_FILE}")
        return [JSONL_FILE]

    data_dir = os.path.join(JSONL_ROOT, "data")
    if os.path.isdir(data_dir):
        files = sorted(glob.glob(os.path.join(data_dir, "**", "*.jsonl"), recursive=True))
        if files:
            print(f"   → using local JSONL root: {JSONL_ROOT}")
            return files
    print(f"   → local JSONL root not found: {JSONL_ROOT}")

    print("   → local JSONL not found, downloading from Hugging Face...")
    local_dir = snapshot_download(
        repo_id="open-law-data-thailand/ocs-krisdika",
        repo_type="dataset",
        local_dir=JSONL_ROOT or "./ocs-krisdika-data",
        local_dir_use_symlinks=False,
    )
    return sorted(glob.glob(os.path.join(local_dir, "data", "**", "*.jsonl"), recursive=True))


def main() -> None:
    print("1. Connecting to Qdrant...")
    client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

    print("2. Testing ColBERT server...")
    try:
        test_dense, test_colbert = get_dual_embeddings(["ทดสอบ"])
        print(
            f"   → llama.cpp OK ({LLAMA_ENDPOINT} model={EMBEDDING_MODEL} "
            f"dense={len(test_dense[0])} tokens={len(test_colbert[0])} "
            f"dim={len(test_colbert[0][0])} max_tokens={COLBERT_MAX_TOKENS})",
        )
        if test_colbert[0] and len(test_colbert[0][0]) != VECTOR_SIZE:
            print(f"❌ ColBERT dim {len(test_colbert[0][0])} != {VECTOR_SIZE}")
            return
        if len(test_dense[0]) != VECTOR_SIZE:
            print(f"❌ dense dim {len(test_dense[0])} != {VECTOR_SIZE}")
            return
    except Exception as exc:
        print(f"❌ Cannot connect to embedding server: {exc}")
        return

    if client.collection_exists(COLLECTION_NAME):
        print(f"3. Collection '{COLLECTION_NAME}' exists → deleting...")
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
    print(f"   → Collection '{COLLECTION_NAME}' created (dense 1024 + colbert {COLBERT_MAX_TOKENS}x{VECTOR_SIZE})")

    print("4. Resolving JSONL files...")
    try:
        jsonl_files = resolve_jsonl_files()
    except Exception as exc:
        print(f"❌ {exc}")
        return
    print(f"   → Found {len(jsonl_files)} JSONL file(s)")

    points = []
    total_chunks = 0
    doc_count = 0

    print("5. Processing documents (one point per section; section.* nested, no stored text)...")
    for file_path in tqdm(jsonl_files, desc="Files"):
        try:
            with open(file_path, "r", encoding="utf-8") as handle:
                for line in handle:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    if ONLY_LATEST and not item.get("is_latest", False):
                        continue

                    section_index = 0
                    for section in item.get("sections") or []:
                        if not isinstance(section, dict):
                            continue
                        content = str(section.get("content") or "").strip()
                        if not content:
                            continue

                        payload = {}
                        for key in DOC_FIELDS:
                            value = payload_value(item.get(key))
                            if value is not None:
                                payload[key] = value
                        nested = section_payload(section)
                        if not nested:
                            continue
                        payload["section"] = nested
                        if "title" not in payload:
                            payload["title"] = "ไม่มีชื่อ"
                        payload["source"] = "ocs-krisdika"
                        payload["chunk_index"] = section_index
                        payload["jsonl_file"] = os.path.basename(file_path)

                        points.append({
                            "id": str(uuid.uuid4()),
                            "payload": payload,
                            "embed_text": search_text(item, section),
                        })
                        total_chunks += 1
                        section_index += 1

                    doc_count += 1
                    if MAX_DOCS and doc_count >= MAX_DOCS:
                        break
        except Exception as exc:
            print(f"\n⚠ Error reading {file_path}: {exc}")
            continue

        if MAX_DOCS and doc_count >= MAX_DOCS:
            break

    print(f"\n   → {doc_count} laws → {total_chunks} section points")
    if total_chunks == 0:
        print("❌ No data to ingest. Exiting.")
        return

    print("6. Embedding + uploading to Qdrant...")
    for index in tqdm(range(0, len(points), BATCH_SIZE), desc="Upload"):
        batch = points[index : index + BATCH_SIZE]
        texts = [point["embed_text"] for point in batch]
        try:
            dense_vecs, colbert_vecs = get_dual_embeddings(texts)
        except Exception as exc:
            print(f"\n❌ Embedding error at batch {index}: {exc}")
            continue

        qdrant_points = [
            PointStruct(
                id=point["id"],
                vector={"dense": dense, "colbert": colbert},
                payload=point["payload"],
            )
            for point, dense, colbert in zip(batch, dense_vecs, colbert_vecs)
        ]
        client.upsert(collection_name=COLLECTION_NAME, points=qdrant_points)

    print("7. Creating payload indexes...")
    for field, schema in {
        "law_code": PayloadSchemaType.KEYWORD,
        "timeline_code": PayloadSchemaType.KEYWORD,
        "is_latest": PayloadSchemaType.BOOL,
        "reference_url": PayloadSchemaType.KEYWORD,
        "section.sectionId": PayloadSchemaType.INTEGER,
        "section.sectionNo": PayloadSchemaType.KEYWORD,
        "publish_date": PayloadSchemaType.KEYWORD,
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
    print("\n" + "=" * 55)
    print("✅ Ingestion completed!")
    print(f"Collection   : {COLLECTION_NAME}")
    print(f"Total points : {info.points_count}")
    print("=" * 55)


if __name__ == "__main__":
    main()
