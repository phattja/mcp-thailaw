#!/usr/bin/env python3
"""Build a local URL → timeline_code map from Krisdika JSONL. Does not write to Qdrant."""

from __future__ import annotations

import glob
import json
import os
import re
import sys

JSONL_ROOT = os.environ.get("THAILAW_JSONL_ROOT", "/ai/jupyter/home/ocs-krisdika-data")
OUT_PATH = os.environ.get(
    "THAILAW_TIMELINE_MAP",
    os.path.join(os.path.dirname(__file__), "..", "data", "timeline-map.json"),
)

URL_RE = re.compile(r'"reference_url"\s*:\s*"([^"]+)"')
TL_RE = re.compile(r'"timeline_code"\s*:\s*"([^"]+)"')


def main() -> int:
    mapping: dict[str, str] = {}
    files = glob.glob(f"{JSONL_ROOT}/data/**/*.jsonl", recursive=True)
    for path in files:
        with open(path, encoding="utf-8") as handle:
            while True:
                start = handle.read(8)
                if not start:
                    break
                prefix = start + handle.read(4000)
                handle.readline()
                url_match = URL_RE.search(prefix)
                timeline_match = TL_RE.search(prefix)
                if url_match and timeline_match:
                    url = url_match.group(1).replace("\\/", "/")
                    mapping[url] = timeline_match.group(1)

    out = os.path.abspath(OUT_PATH)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(mapping, handle, ensure_ascii=False, indent=0)
        handle.write("\n")
    print(f"wrote {len(mapping)} entries to {out}")
    return 0 if mapping else 1


if __name__ == "__main__":
    raise SystemExit(main())
