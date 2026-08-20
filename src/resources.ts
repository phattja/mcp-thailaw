import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCurrentLogLevel } from "./logging.js";
import { packageVersion } from "./version.js";
import { getHttpSecurityConfig } from "./http-security.js";
import { getThaiLawConfig, SERVER_NAME } from "./config.js";

export const REQUIRED_CONFIGURATION_GUIDANCE =
  "Qdrant and embedding settings come from CLI flags, then environment variables, then built-in defaults.";
export const OPTIONAL_CONFIGURATION_GUIDANCE =
  "Startup flags override environment variables. See CONFIGURATION.md for the complete reference.";

export function createCliHelpText(): string {
  return `Usage: mcp-thailaw [options]

Options:
  --help, -h                     Show this help and exit
  --version, -v                  Print the package version and exit
  --qdrant-url <url>             Qdrant base URL
  --qdrant-collection <name>     Qdrant collection name
  --collection <name>            Alias for --qdrant-collection
  --qdrant-api-key <key>         Qdrant API key
  --embedding-url <url>          TEI /embed or OpenAI /v1/embeddings endpoint
  --embedding-model <name>       Embedding model name
  --embedding-api-key <key>      Embedding server bearer token
  --colbert-url <url>            ColBERT /embed_all endpoint
  --vector-mode <colbert|dense>  Default retrieval vectors (colbert)
  --vector-name <name>           Qdrant named vector for ColBERT (colbert)
  --colbert-max-tokens <n>       Max ColBERT token vectors (default 64)
  --vector-size <n>              Embedding dimensions (default 1024)
  --rerank-url <url>             TEI /rerank or llama-server /v1/rerank
  --rerank-model <name>          Rerank model name
  --rerank-api-key <key>         Rerank server bearer token
  --rerank <true|false>          Enable rerank after retrieve
  --no-rerank                    Disable rerank
  --top-k <n>                    Default search hit count
  --score-threshold <n>          Default minimum score (0-1)
  --max-results <n>              Operator ceiling for top_k
  --fetch-timeout-ms <n>         Upstream timeout in milliseconds
  --http-port, --port <n>        Enable Streamable HTTP on this port
  --http-host <host>             HTTP bind address

Configuration:
  ${REQUIRED_CONFIGURATION_GUIDANCE}
  ${OPTIONAL_CONFIGURATION_GUIDANCE}

Transport:
  STDIO is the default transport.
  --http-port or THAILAW_HTTP_PORT enables HTTP transport.
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
      description: "MCP server for Thai law search over ฐานข้อมูลกฤษฎีกา in Qdrant",
    },
    environment: {
      ...(showFullConfig
        ? {
            qdrantUrl: config.qdrantUrl,
            collectionName: config.collectionName,
            embeddingUrl: config.embeddingUrl,
            embeddingModel: config.embeddingModel,
            colbertUrl: config.colbertUrl,
            vectorMode: config.vectorMode,
            rerankUrl: config.rerankUrl,
            rerankModel: config.rerankModel,
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
      tools: [
        "search_krisdika",
        "search_krisdika_online",
        "search_deka",
        "search_deka_online",
        "krisdika_collection_info",
        "deka_collection_info",
        "krisdeka_connection_info",
        "deka_connection_info",
      ],
      logging: true,
      resources: true,
      transports: process.env.THAILAW_HTTP_PORT ? ["stdio", "http"] : ["stdio"],
    },
  };

  return JSON.stringify(payload, null, 2);
}

export function createHelpResource() {
  return `# Thai Law MCP Server Help

## Overview
This is a Model Context Protocol (MCP) server that searches Thai law from the สำนักงานคณะกรรมการกฤษฎีกา dataset stored in Qdrant. Queries default to BGE-M3 ColBERT 64x1024 + dense 1024 from llama.cpp at :3003 (pooling=none), then rerank with bge-reranker-v2-m3 on the same port.

## Available Tools

### 1. search_krisdika
Semantic search over Thai statutes, sections, and related legal text.

**Parameters:**
- \`query\` (required): Search text, for example "ลักทรัพย์" or "มาตรา ๓๓๕". Arabic article numbers such as 335 are converted to Thai digits ๓๓๕.
- \`top_k\` (optional): Maximum number of vector hits before มาตรา merge (default 5)
- \`score_threshold\` (optional): Minimum relevance score from 0.0 to 1.0 (default 0.30)
- \`law_code\` (optional): Filter by law group code
- \`category\` (optional): Filter by law category such as "1B"
- \`is_latest\` (optional): Keep only the latest in-force version. Defaults to \`true\`. Set \`false\` to search historical versions.
- \`group_by_law\` (optional): Reconstruct each มาตรา from its fragments and return official statute layout. Defaults to \`true\`.
- \`source\` (optional): \`qdrant\` (default), \`online\` (เว็บ https://www.ocs.go.th/searchlaw-law), \`both\`, or \`auto\` (Qdrant first, then the website if nothing is found).
- \`exclude\` (optional): comma-separated words to drop, for example \`วิ่งราว,ชิงทรัพย์\`
- \`include\` (optional): titles containing \`(ยกเลิก)\` are dropped by default. Set \`include=(ยกเลิก)\` or \`include=cancel\` to keep them.
- \`response_format\` (optional): \`text\` (default) or \`json\`

### 2. search_krisdika_online
Search the live สำนักงานคณะกรรมการกฤษฎีกา catalog at https://www.ocs.go.th/searchlaw-law. Use this when the user wants the website, both sources, or when Qdrant has no hit.

**Parameters:**
- \`query\` (required): Search text
- \`top_k\` (optional): Maximum laws to return (default 5, max 20)
- \`topic\`, \`content\`: ค้นจากชื่อ and ค้นจากเนื้อหา (both default true)
- \`sublaw\`: related subordinate laws (default false)
- \`detail\`: \`sections\` (default) opens the latest version of each law and returns matching มาตรา. \`list\` returns titles and snippets only.
- \`category\`: law type such as \`1D\` / ประมวลกฎหมาย
- \`state\`: \`current\` / \`pending\` / \`repealed\` (default current + pending)
- \`year\`, \`acting\`, \`subject\`, \`letter\`, \`exclude\`, \`include\`, \`response_format\`

### 3. search_deka
Semantic search over Supreme Court judgments in Qdrant collection \`deka\` (dense 1024-d + ColBERT 64×1024).

**Parameters:**
- \`query\` (required)
- \`top_k\`, \`score_threshold\`, \`year\`, \`exclude\`, \`response_format\`

### 4. search_deka_online
Search Supreme Court judgments on https://deka.supremecourt.or.th/. Use this for case law (คำพิพากษาฎีกา), not the statute text.

**Parameters:**
- \`query\`: Search text, for example "ลักทรัพย์" or "มาตรา ๓๓๕"
- \`text_scope\`: \`short\` (ฉบับย่อ) or \`full\` (ฉบับเต็ม, default)
- Default document set is ทั้งหมด and ฉบับเต็ม. Default result is เลขที่คำพิพากษา, ชื่อคู่ความ, ชื่อกฎหมาย, ย่อสั้น. Use \`detail=full\` for the full \`#deka_result_info\` block.
- \`doc_type\`: all / judgment / order / decision
- \`case_no\`, \`case_prefix\`: หมายเลขคำพิพากษา / คำสั่งคำร้อง
- \`year\`, \`year_from\`, \`year_to\`: ช่วงเวลา ปี พ.ศ.
- \`mode\`: \`basic\` (ค้นหาปกติ) or \`advanced\` (ค้นหาขั้นสูง)
- Advanced: \`litigant\`, \`judge\`, \`panel_judge\`, \`law_name\`, \`law_section\`, \`black_no\`, \`department\`, \`remark\`
- \`top_k\`, \`exclude\`, \`response_format\`

### 5. krisdika_collection_info
Inspect the configured Qdrant กฤษฎีกา collection: point count, vector size, and embedding settings.

**Parameters:**
- \`refresh\` (optional): Bypass the process cache

### 6. deka_collection_info
Inspect the Qdrant ฎีกา collection (\`deka\`): point count, vector size, and embedding settings. Alias: \`dika_collection_info\`.

**Parameters:**
- \`refresh\` (optional): Bypass the process cache

### 5. krisdeka_connection_info
Check that https://www.ocs.go.th/searchlaw-law is reachable. Returns HTTP status, latency, and catalog size when the search table can be read.

**Parameters:**
- \`refresh\` (optional): Bypass the process cache

### 6. deka_connection_info
Check that https://deka.supremecourt.or.th/ is reachable. Returns HTTP status, latency, and catalog size when the page can be parsed.

**Parameters:**
- \`refresh\` (optional): Bypass the process cache

## Configuration

${REQUIRED_CONFIGURATION_GUIDANCE}
${OPTIONAL_CONFIGURATION_GUIDANCE}

Startup flags override environment variables.

Common settings:
- \`--qdrant-url\` / \`QDRANT_URL\`: Qdrant base URL (default http://localhost:6333)
- \`--qdrant-collection\` / \`QDRANT_COLLECTION\`: Collection name (default krisdika)
- \`--qdrant-api-key\` / \`QDRANT_API_KEY\`: Optional Qdrant API key
- \`--embedding-url\` / \`EMBEDDING_URL\`: TEI dense embeddings (default http://127.0.0.1:3004/embed)
- \`--embedding-model\` / \`EMBEDDING_MODEL\`: Embedding model name (default bge-m3-multi)
- \`--colbert-url\` / \`COLBERT_URL\`: ColBERT token vectors (default http://127.0.0.1:3004/embed_all)
- \`--vector-mode\` / \`THAILAW_VECTOR_MODE\`: \`colbert\` (default) or \`dense\`
- \`--embedding-api-key\` / \`EMBEDDING_API_KEY\`: Optional bearer token
- \`--rerank-url\` / \`RERANK_URL\`: TEI rerank (default http://127.0.0.1:3006/rerank)
- \`--rerank-model\` / \`RERANK_MODEL\`: Rerank model name (default BAAI/bge-reranker-v2-m3)
- \`--top-k\`, \`--score-threshold\`, \`--max-results\`
- \`--http-port\` / \`THAILAW_HTTP_PORT\`: Enable HTTP transport on the specified port

## Transport Modes

### STDIO (Default)
Standard input/output transport for desktop clients.

### HTTP (Optional)
MCP Streamable HTTP transport for remote clients such as Open WebUI. Set \`THAILAW_HTTP_PORT\` to enable.

### Hardened HTTP Mode (Optional)
Set \`THAILAW_HTTP_HARDEN=true\` with \`THAILAW_HTTP_AUTH_TOKEN\` and \`THAILAW_HTTP_ALLOWED_ORIGINS\` before exposing the server on a network.
`;
}
