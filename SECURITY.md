# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.0 (latest) | ✅ |

Security fixes are released as patch versions on the `main` branch. Only the latest published version receives security updates.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/phattja/mcp-thailaw/security/advisories/new).

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Affected version(s) and configuration
- Any suggested mitigations

You can expect an acknowledgement within **72 hours** and a status update within **7 days**. If a fix is warranted, a patch will be released as soon as practical and a CVE requested if applicable.

## Threat Model

`mcp-thailaw` is a **Node.js MCP server** that runs as a local process (STDIO) or network service (HTTP transport). It brokers requests between an AI assistant and Qdrant, llama.cpp embeddings/rerank, and optional official Thai-law websites (OCS Krisdika and ศาลฎีกา).

The primary security surface areas are:

| Area | Risk |
|------|------|
| HTTP transport | Unauthorized access, DNS rebinding, CORS misconfiguration, resource exhaustion |
| API keys | `QDRANT_API_KEY`, `EMBEDDING_API_KEY`, `RERANK_API_KEY` in environment or flags |
| Query forwarding | Search queries are forwarded to Qdrant, llama.cpp, and official websites |
| Website tools | `search_krisdika_online` and `search_deka_online` fetch public HTTPS pages |

## Security Features

### HTTP transport

Use STDIO when the client is local. When Streamable HTTP is enabled:

- Bind to loopback unless the operator sets `--http-host`.
- Set `THAILAW_HTTP_HARDEN=true` with `THAILAW_HTTP_AUTH_TOKEN` and `THAILAW_HTTP_ALLOWED_ORIGINS` before exposing the server on a network.
- Rate limits apply separately to session init and established sessions.

`/health` reports server name, version, and transport. It does not return Qdrant or embedding URLs.

### Credential handling

API keys and URL userinfo are stripped from logs, MCP notifications, and client-visible errors. The `thailaw://server-config` resource redacts secrets.

Restart the process after rotating keys so both the live config and the diagnostic snapshot stay consistent.

### Website fetches

Online tools only request the official OCS and Supreme Court hosts. They do not accept an arbitrary URL from the model.

## Out of Scope

- Vulnerabilities in Qdrant, llama.cpp, or the official law websites
- Misconfiguration of operator-controlled network access to `qdrant` or `ai-tool`
