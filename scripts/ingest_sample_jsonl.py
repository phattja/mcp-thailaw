#!/usr/bin/env python3
"""Ingest one local Krisdika JSONL file into a NEW Qdrant collection.

Does not download from Hugging Face.
Refuses to write to the master collection name `krisdika`.
Stores document fields at the payload root and section fields under payload["section"].
The embed string is not stored as payload["text"].
Uses Qdrant HTTP + the embedding server only (no qdrant_client).
"""

from __future__ import annotations

import json
import os
import sys
import uuid

import requests

MASTER_COLLECTION = "krisdika"

QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333").rstrip("/")
COLLECTION_NAME = os.environ.get("QDRANT_COLLECTION", "krisdika_2022_04")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY") or None
JSONL_FILE = os.environ.get(
    "THAILAW_JSONL_FILE",
    "/ai/jupyter/home/ocs-krisdika-data/data/2022/2022-04.jsonl",
)

EMBEDDING_URL = os.environ.get("EMBEDDING_URL", "http://127.0.0.1:3003/v1").rstrip("/")
if not EMBEDDING_URL.endswith("/embeddings"):
    EMBEDDING_URL = f"{EMBEDDING_URL}/embeddings"
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "Qwen3-VL-Embedding-2B")
EMBEDDING_API_KEY = os.environ.get("EMBEDDING_API_KEY") or None

VECTOR_SIZE = int(os.environ.get("THAILAW_VECTOR_SIZE", "2048"))
BATCH_SIZE = int(os.environ.get("THAILAW_BATCH_SIZE", "32"))
ONLY_LATEST = os.environ.get("THAILAW_ONLY_LATEST", "true").strip().lower() not in {"0", "false", "no"}

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


def qdrant_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if QDRANT_API_KEY:
        headers["api-key"] = QDRANT_API_KEY
    return headers


def qdrant(method: str, path: str, body=None, timeout: int = 120):
    response = requests.request(
        method,
        f"{QDRANT_URL}{path}",
        headers=qdrant_headers(),
        json=body,
        timeout=timeout,
    )
    if not response.ok:
        raise RuntimeError(f"Qdrant {method} {path} {response.status_code}: {response.text[:400]}")
    if response.content:
        return response.json()
    return {}


def get_embeddings(texts: list[str]) -> list[list[float]]:
    headers = {"Content-Type": "application/json"}
    if EMBEDDING_API_KEY:
        headers["Authorization"] = f"Bearer {EMBEDDING_API_KEY}"
    response = requests.post(
        EMBEDDING_URL,
        json={"model": EMBEDDING_MODEL, "input": texts},
        headers=headers,
        timeout=120,
    )
    response.raise_for_status()
    data = response.json()
    embeddings = sorted(data["data"], key=lambda item: item["index"])
    return [item["embedding"] for item in embeddings]


def search_text(item: dict, section: dict) -> str:
    """Temporary embed input only. Never written to Qdrant payload."""
    title = item.get("title") or "ไม่มีชื่อ"
    content = (section.get("content") or "").strip()
    return "\n".join([
        f"# {title}",
        f"รหัสกฎหมาย: {item.get('law_code') or ''}",
        f"timeline_code: {item.get('timeline_code') or ''}",
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


def collection_exists(name: str) -> bool:
    response = requests.get(
        f"{QDRANT_URL}/collections/{name}",
        headers=qdrant_headers(),
        timeout=30,
    )
    return response.ok


def points_count(name: str) -> int | None:
    data = qdrant("GET", f"/collections/{name}")
    return (data.get("result") or {}).get("points_count")


def main() -> int:
    if COLLECTION_NAME.strip() == MASTER_COLLECTION:
        print(f"❌ Refusing to write to master collection '{MASTER_COLLECTION}'.", file=sys.stderr)
        print("   Set QDRANT_COLLECTION to a new test name.", file=sys.stderr)
        return 2
    if not os.path.isfile(JSONL_FILE):
        print(f"❌ JSONL not found: {JSONL_FILE}", file=sys.stderr)
        return 2

    print("1. Checking Qdrant...")
    if collection_exists(MASTER_COLLECTION):
        print(f"   master '{MASTER_COLLECTION}' points={points_count(MASTER_COLLECTION)} — will not modify it")

    print("2. Testing embedding server...")
    test_emb = get_embeddings(["ทดสอบ"])
    print(f"   → dim={len(test_emb[0])}")

    if collection_exists(COLLECTION_NAME):
        print(f"3. Test collection '{COLLECTION_NAME}' exists → deleting that test collection only")
        qdrant("DELETE", f"/collections/{COLLECTION_NAME}")

    qdrant("PUT", f"/collections/{COLLECTION_NAME}", {
        "vectors": {"size": VECTOR_SIZE, "distance": "Cosine"},
    })
    print(f"   → created '{COLLECTION_NAME}'")

    points: list[dict] = []
    doc_count = 0
    print(f"4. Reading {JSONL_FILE}")
    with open(JSONL_FILE, encoding="utf-8") as handle:
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
            doc_count += 1
            section_index = 0
            for section in item.get("sections") or []:
                if not isinstance(section, dict):
                    continue
                if not (section.get("content") or "").strip():
                    continue
                payload: dict = {}
                for key in DOC_FIELDS:
                    value = payload_value(item.get(key))
                    if value is not None:
                        payload[key] = value
                nested = section_payload(section)
                if not nested:
                    continue
                payload["section"] = nested
                payload["source"] = "ocs-krisdika"
                payload["chunk_index"] = section_index
                payload["jsonl_file"] = os.path.basename(JSONL_FILE)
                points.append({
                    "id": str(uuid.uuid4()),
                    "payload": payload,
                    "embed_text": search_text(item, section),
                })
                section_index += 1

    print(f"   → {doc_count} documents → {len(points)} section points")
    if not points:
        print("❌ No sections to ingest.")
        return 1

    print("5. Embedding + upsert (test collection only)...")
    for index in range(0, len(points), BATCH_SIZE):
        batch = points[index : index + BATCH_SIZE]
        print(f"   batch {index // BATCH_SIZE + 1}/{(len(points) + BATCH_SIZE - 1) // BATCH_SIZE} ({len(batch)} pts)")
        embeddings = get_embeddings([point["embed_text"] for point in batch])
        qdrant("PUT", f"/collections/{COLLECTION_NAME}/points?wait=true", {
            "points": [
                {"id": point["id"], "vector": embedding, "payload": point["payload"]}
                for point, embedding in zip(batch, embeddings)
            ],
        })

    for field, schema in {
        "law_code": "keyword",
        "timeline_code": "keyword",
        "is_latest": "bool",
        "reference_url": "keyword",
        "section.sectionId": "integer",
        "section.sectionNo": "keyword",
        "publish_date": "keyword",
    }.items():
        try:
            qdrant("PUT", f"/collections/{COLLECTION_NAME}/index", {
                "field_name": field,
                "field_schema": schema,
            })
        except Exception as exc:
            print(f"   index {field}: {exc}")

    test_count = points_count(COLLECTION_NAME)
    master_count = points_count(MASTER_COLLECTION) if collection_exists(MASTER_COLLECTION) else None
    print("=" * 55)
    print("Test ingest completed")
    print(f"Test collection : {COLLECTION_NAME}  points={test_count}")
    print(f"Master          : {MASTER_COLLECTION}  points={master_count} (unchanged)")
    print("=" * 55)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
