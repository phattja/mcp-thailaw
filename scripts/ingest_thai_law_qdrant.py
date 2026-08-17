#!/usr/bin/env python3
"""
Ingest open-law-data-thailand/ocs-krisdika into a self-hosted Qdrant collection.

Downloads raw JSONL files from Hugging Face (avoids datasets schema errors),
chunks each law, embeds with an OpenAI-compatible /v1/embeddings endpoint
(bge-m3, 1024-dim), and upserts into Qdrant.

Environment (same names as mcp-thailaw):
  QDRANT_URL              default http://localhost:6333
  QDRANT_COLLECTION       default krisdika
  QDRANT_API_KEY          optional
  EMBEDDING_URL           default http://127.0.0.1:3003/v1
  EMBEDDING_MODEL         default gpustack-bge-m3
  EMBEDDING_API_KEY       optional bearer token
  THAILAW_ONLY_LATEST     default true  (ingest only is_latest documents)
  THAILAW_MAX_DOCS        optional int  (limit for a test run)
  THAILAW_VECTOR_SIZE     default 1024
  THAILAW_BATCH_SIZE      default 32
"""

from huggingface_hub import snapshot_download
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from langchain_text_splitters import RecursiveCharacterTextSplitter
from tqdm import tqdm
import uuid
import re
import os
import requests
import json
import glob

QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333").rstrip("/")
COLLECTION_NAME = os.environ.get("QDRANT_COLLECTION", "krisdika")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY") or None

EMBEDDING_URL = os.environ.get("EMBEDDING_URL", "http://127.0.0.1:3003/v1").rstrip("/")
if not EMBEDDING_URL.endswith("/embeddings"):
    EMBEDDING_URL = f"{EMBEDDING_URL}/embeddings"
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "gpustack-bge-m3")
EMBEDDING_API_KEY = os.environ.get("EMBEDDING_API_KEY") or None

VECTOR_SIZE = int(os.environ.get("THAILAW_VECTOR_SIZE", "1024"))
BATCH_SIZE = int(os.environ.get("THAILAW_BATCH_SIZE", "32"))
ONLY_LATEST = os.environ.get("THAILAW_ONLY_LATEST", "true").strip().lower() not in {"0", "false", "no"}
MAX_DOCS_RAW = os.environ.get("THAILAW_MAX_DOCS", "").strip()
MAX_DOCS = int(MAX_DOCS_RAW) if MAX_DOCS_RAW else None


def get_embeddings(texts: list[str]) -> list[list[float]]:
    headers = {"Content-Type": "application/json"}
    if EMBEDDING_API_KEY:
        headers["Authorization"] = f"Bearer {EMBEDDING_API_KEY}"
    payload = {"model": EMBEDDING_MODEL, "input": texts}
    response = requests.post(EMBEDDING_URL, json=payload, headers=headers, timeout=120)
    response.raise_for_status()
    data = response.json()
    embeddings = sorted(data["data"], key=lambda item: item["index"])
    return [item["embedding"] for item in embeddings]


def clean_text(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def main() -> None:
    print("1. Connecting to Qdrant...")
    client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

    print("2. Testing embedding server...")
    try:
        test_emb = get_embeddings(["ทดสอบ"])
        print(f"   → Embedding server OK (dim={len(test_emb[0])})")
        if len(test_emb[0]) != VECTOR_SIZE:
            print(f"   ⚠ Warning: expected VECTOR_SIZE={VECTOR_SIZE}, got {len(test_emb[0])}")
    except Exception as exc:
        print(f"❌ Cannot connect to embedding server: {exc}")
        return

    if client.collection_exists(COLLECTION_NAME):
        print(f"3. Collection '{COLLECTION_NAME}' exists → deleting...")
        client.delete_collection(COLLECTION_NAME)

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
    )
    print(f"   → Collection '{COLLECTION_NAME}' created")

    print("4. Downloading dataset files from Hugging Face...")
    local_dir = snapshot_download(
        repo_id="open-law-data-thailand/ocs-krisdika",
        repo_type="dataset",
        local_dir="./ocs-krisdika-data",
        local_dir_use_symlinks=False,
    )
    print(f"   → Downloaded to: {local_dir}")

    jsonl_files = sorted(glob.glob(f"{local_dir}/data/**/*.jsonl", recursive=True))
    print(f"   → Found {len(jsonl_files)} JSONL files")

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1100,
        chunk_overlap=180,
        separators=["\n\n", "\n", " ", ""],
    )

    points = []
    total_chunks = 0
    doc_count = 0

    print("5. Processing documents...")
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

                    title = item.get("title", "ไม่มีชื่อ")
                    law_code = item.get("law_code", "")
                    publish_date = str(item.get("publish_date", ""))
                    ref_url = item.get("reference_url", "")
                    category = item.get("category", "")

                    full_text = f"# {title}\n\n"
                    full_text += f"รหัสกฎหมาย: {law_code}\n"
                    full_text += f"วันที่ประกาศ: {publish_date}\n"
                    full_text += f"ประเภท: {category}\n"
                    full_text += f"แหล่งอ้างอิง: {ref_url}\n\n"

                    sections = item.get("sections") or []
                    for section in sections:
                        if not isinstance(section, dict):
                            continue
                        content = clean_text(section.get("content", ""))
                        if content:
                            sec_id = (
                                section.get("sectionId")
                                or section.get("sectionNo")
                                or section.get("sectionName")
                                or ""
                            )
                            full_text += f"### มาตรา/ส่วน {sec_id}\n{content}\n\n"

                    chunks = text_splitter.split_text(full_text)
                    for index, chunk in enumerate(chunks):
                        if not chunk.strip():
                            continue
                        points.append({
                            "id": str(uuid.uuid4()),
                            "text": chunk,
                            "payload": {
                                "text": chunk,
                                "title": title,
                                "law_code": law_code,
                                "publish_date": publish_date,
                                "reference_url": ref_url,
                                "category": str(category) if category else "",
                                "chunk_index": index,
                                "source": "ocs-krisdika",
                                "is_latest": bool(item.get("is_latest", False)),
                            },
                        })
                        total_chunks += 1

                    doc_count += 1
                    if MAX_DOCS and doc_count >= MAX_DOCS:
                        break
        except Exception as exc:
            print(f"\n⚠ Error reading {file_path}: {exc}")
            continue

        if MAX_DOCS and doc_count >= MAX_DOCS:
            break

    print(f"\n   → {doc_count} laws → {total_chunks} chunks")
    if total_chunks == 0:
        print("❌ No data to ingest. Exiting.")
        return

    print("6. Embedding + uploading to Qdrant...")
    for index in tqdm(range(0, len(points), BATCH_SIZE), desc="Upload"):
        batch = points[index : index + BATCH_SIZE]
        texts = [point["text"] for point in batch]
        try:
            embeddings = get_embeddings(texts)
        except Exception as exc:
            print(f"\n❌ Embedding error at batch {index}: {exc}")
            continue

        qdrant_points = [
            PointStruct(id=point["id"], vector=embedding, payload=point["payload"])
            for point, embedding in zip(batch, embeddings)
        ]
        client.upsert(collection_name=COLLECTION_NAME, points=qdrant_points)

    info = client.get_collection(COLLECTION_NAME)
    print("\n" + "=" * 55)
    print("✅ Ingestion completed!")
    print(f"Collection   : {COLLECTION_NAME}")
    print(f"Total points : {info.points_count}")
    print("=" * 55)


if __name__ == "__main__":
    main()
