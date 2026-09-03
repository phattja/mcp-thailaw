# Changelog

All notable changes to mcp-thailaw are documented here.
Versions follow [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-09-03

### Added

- `search_krisdika` also matches Qdrant payload `title` when the query looks like a law name. Alias `search_krisdeka`.
- `search_krisdika_online` returns มาตรา for a title query even when section text does not contain the law name.

### Changed

- `score_threshold` range is `0–64` (ColBERT MaxSim can exceed 1). Default remains `0.30`.
- HTTP JSON body limit is 10 MiB. Title full-collection scans no longer run on every query.

### Fixed

- `search_krisdika` Streamable HTTP `-32603` from Qdrant timeout and oversized JSON POSTs.

## [0.1.0] - 2026-08-20

### Added

- Thai-law MCP server for Qdrant collections `krisdika` (statutes) and `deka` (Supreme Court judgments).
- Tools: `search_krisdika`, `search_krisdika_online`, `search_deka`, `search_deka_online`, collection and connection info tools.
- STDIO and Streamable HTTP transports.
- Dense 1024-d + ColBERT 64×1024 from llama.cpp `bge-m3-multi` (`pooling=none`), rerank with `bge-reranker-v2-m3`.

### Changed

- MCP resources use the `thailaw://` scheme: `thailaw://server-config`, `thailaw://usage-guide`.
- Default Qdrant URL is `http://qdrant:6333`.
- Default embedding, ColBERT, and rerank URL is `http://ai-tool:3003`.
- `search_deka` converts Qdrant Gregorian years to Buddhist Era on return, and Buddhist Era filter input back to Gregorian before the Qdrant match.
