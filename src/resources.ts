import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCurrentLogLevel } from "./logging.js";
import { packageVersion } from "./version.js";
import { getHttpSecurityConfig } from "./http-security.js";
import { getThaiLawConfig, SERVER_NAME } from "./config.js";

export const REQUIRED_CONFIGURATION_GUIDANCE =
  "QDRANT_URL and EMBEDDING_URL default to the local Krisdika stack if unset.";
export const OPTIONAL_CONFIGURATION_GUIDANCE =
  "All other environment variables are optional; see CONFIGURATION.md for the complete reference.";

export function createCliHelpText(): string {
  return `Usage: mcp-thailaw [options]

Options:
  --help, -h       Show this help and exit
  --version, -v    Print the package version and exit

Configuration:
  ${REQUIRED_CONFIGURATION_GUIDANCE}
  ${OPTIONAL_CONFIGURATION_GUIDANCE}

Transport:
  STDIO is the default transport.
  MCP_HTTP_PORT enables HTTP transport.
`.trimEnd();
}

export function createConfigResource(mcpServer?: McpServer) {
  const security = getHttpSecurityConfig();
  const showFullConfig = !security.harden || security.exposeFullConfig;
  const config = getThaiLawConfig();

  const payload = {
    serverInfo: {
      name: SERVER_NAME,
      version: packageVersion,
      description: "MCP server for Thai law search over OCS Krisdika in Qdrant",
    },
    environment: {
      ...(showFullConfig
        ? {
            qdrantUrl: config.qdrantUrl,
            collectionName: config.collectionName,
            embeddingUrl: config.embeddingUrl,
            embeddingModel: config.embeddingModel,
          }
        : {
            qdrantConfigured: Boolean(process.env.QDRANT_URL),
            embeddingConfigured: Boolean(process.env.EMBEDDING_URL),
          }),
      hasQdrantApiKey: Boolean(config.qdrantApiKey),
      hasEmbeddingApiKey: Boolean(config.embeddingApiKey),
      defaultTopK: config.defaultTopK,
      defaultScoreThreshold: config.defaultScoreThreshold,
      nodeVersion: process.version,
      currentLogLevel: getCurrentLogLevel(mcpServer),
    },
    capabilities: {
      tools: ["search_thai_law", "thailaw_collection_info"],
      logging: true,
      resources: true,
      transports: process.env.MCP_HTTP_PORT ? ["stdio", "http"] : ["stdio"],
    },
  };

  return JSON.stringify(payload, null, 2);
}

export function createHelpResource() {
  return `# Thai Law MCP Server Help

## Overview
This is a Model Context Protocol (MCP) server that searches Thai law from the OCS Krisdika dataset stored in Qdrant. Queries are embedded with an OpenAI-compatible embedding endpoint (typically bge-m3) and matched by cosine similarity.

## Available Tools

### 1. search_thai_law
Semantic search over Thai statutes, sections, and related legal text.

**Parameters:**
- \`query\` (required): Search text, for example "ลักทรัพย์" or "มาตรา 420"
- \`top_k\` (optional): Maximum number of hits (default 5)
- \`score_threshold\` (optional): Minimum relevance score from 0.0 to 1.0 (default 0.30)
- \`law_code\` (optional): Filter by law group code
- \`category\` (optional): Filter by law category such as "1B"
- \`is_latest\` (optional): Keep only the latest in-force version
- \`response_format\` (optional): \`text\` (default) or \`json\`

### 2. thailaw_collection_info
Inspect the configured Qdrant collection: point count, vector size, and embedding settings.

**Parameters:**
- \`refresh\` (optional): Bypass the process cache

## Configuration

${REQUIRED_CONFIGURATION_GUIDANCE}
${OPTIONAL_CONFIGURATION_GUIDANCE}

Common variables:
- \`QDRANT_URL\`: Qdrant base URL (default http://localhost:6333)
- \`QDRANT_COLLECTION\`: Collection name (default krisdika)
- \`QDRANT_API_KEY\`: Optional Qdrant API key
- \`EMBEDDING_URL\`: OpenAI-compatible embeddings endpoint
- \`EMBEDDING_MODEL\`: Embedding model name (default gpustack-bge-m3)
- \`EMBEDDING_API_KEY\`: Optional bearer token for the embedding server
- \`THAILAW_TOP_K\`, \`THAILAW_SCORE_THRESHOLD\`, \`THAILAW_MAX_RESULTS\`
- \`MCP_HTTP_PORT\`: Enable HTTP transport on the specified port

## Transport Modes

### STDIO (Default)
Standard input/output transport for desktop clients.

### HTTP (Optional)
MCP Streamable HTTP transport for remote clients such as Open WebUI. Set \`MCP_HTTP_PORT\` to enable.

### Hardened HTTP Mode (Optional)
Set \`MCP_HTTP_HARDEN=true\` with \`MCP_HTTP_AUTH_TOKEN\` and \`MCP_HTTP_ALLOWED_ORIGINS\` before exposing the server on a network.
`;
}
