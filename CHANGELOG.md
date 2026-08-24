# Changelog

All notable changes to mcp-thailaw are documented here.
Versions follow [Semantic Versioning](https://semver.org/).

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
