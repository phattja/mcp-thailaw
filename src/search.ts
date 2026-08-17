import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getThaiLawConfig, validateThaiLawConfig } from "./config.js";
import { getEmbedding } from "./embedding.js";
import { createConfigurationError, createNoResultsMessage } from "./error-handler.js";
import { logMessage } from "./logging.js";
import { fetchCollectionInfo, queryPoints, type QdrantCollectionInfo, type QdrantHit } from "./qdrant.js";
import { searchCache } from "./search-cache.js";
import type { ResponseFormat, SearchThaiLawArgs } from "./types.js";

export interface ThaiLawResult {
  score: number;
  title: string;
  law_code: string;
  category: string;
  publish_date: string;
  reference_url: string;
  text: string;
  chunk_index?: number;
  is_latest?: boolean;
}

function payloadString(payload: Record<string, unknown>, key: string, fallback = ""): string {
  const value = payload[key];
  return typeof value === "string" ? value : fallback;
}

function payloadNumber(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function payloadBoolean(payload: Record<string, unknown>, key: string): boolean | undefined {
  const value = payload[key];
  return typeof value === "boolean" ? value : undefined;
}

export function hitToResult(hit: QdrantHit): ThaiLawResult {
  const payload = hit.payload;
  return {
    score: hit.score,
    title: payloadString(payload, "title", "ไม่มีชื่อ"),
    law_code: payloadString(payload, "law_code"),
    category: payloadString(payload, "category"),
    publish_date: payloadString(payload, "publish_date"),
    reference_url: payloadString(payload, "reference_url"),
    text: payloadString(payload, "text"),
    chunk_index: payloadNumber(payload, "chunk_index"),
    is_latest: payloadBoolean(payload, "is_latest"),
  };
}

export function formatSearchText(query: string, results: ThaiLawResult[]): string {
  if (results.length === 0) {
    return createNoResultsMessage(query);
  }

  return results.map((result, index) => {
    const lines = [
      `[${index + 1}] คะแนนความเกี่ยวข้อง: ${result.score.toFixed(4)}`,
      `ชื่อกฎหมาย: ${result.title}`,
      `รหัส: ${result.law_code}`,
      `ลิงก์: ${result.reference_url}`,
    ];
    if (result.category) {
      lines.push(`ประเภท: ${result.category}`);
    }
    if (result.publish_date) {
      lines.push(`วันที่ประกาศ: ${result.publish_date}`);
    }
    lines.push("", "เนื้อหา:", result.text, "-".repeat(60));
    return lines.join("\n");
  }).join("\n\n");
}

export function formatSearchJson(query: string, collection: string, results: ThaiLawResult[]): string {
  return JSON.stringify({ query, collection, results }, null, 2);
}

function withTimeout(timeoutMs: number, signal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref();

  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

export async function performThaiLawSearch(
  mcpServer: McpServer,
  args: SearchThaiLawArgs,
  signal?: AbortSignal,
): Promise<string> {
  const configIssue = validateThaiLawConfig();
  if (configIssue) {
    throw createConfigurationError(configIssue);
  }

  const config = getThaiLawConfig();
  const topK = Math.min(args.top_k ?? config.defaultTopK, config.maxResults);
  const scoreThreshold = args.score_threshold ?? config.defaultScoreThreshold;
  const responseFormat: ResponseFormat = args.response_format ?? "text";
  const cacheArgs = {
    query: args.query,
    top_k: topK,
    score_threshold: scoreThreshold,
    law_code: args.law_code ?? "",
    category: args.category ?? "",
    is_latest: args.is_latest ?? null,
    response_format: responseFormat,
    collection: config.collectionName,
  };

  const cached = searchCache.get("search_thai_law", cacheArgs);
  if (cached) {
    logMessage(mcpServer, "debug", "Returning cached Thai law search result");
    return cached;
  }

  const timeout = withTimeout(config.fetchTimeoutMs, signal);
  try {
    logMessage(mcpServer, "info", `Searching Thai law: ${args.query}`, {
      topK,
      scoreThreshold,
      collection: config.collectionName,
    });

    const vector = await getEmbedding(args.query, timeout.signal);
    const hits = await queryPoints(vector, {
      limit: topK,
      scoreThreshold,
      filter: {
        lawCode: args.law_code?.trim() || undefined,
        category: args.category?.trim() || undefined,
        isLatest: args.is_latest,
      },
      signal: timeout.signal,
    });

    const results = hits.map(hitToResult);
    const output = responseFormat === "json"
      ? formatSearchJson(args.query, config.collectionName, results)
      : formatSearchText(args.query, results);

    searchCache.set("search_thai_law", cacheArgs, output);
    return output;
  } finally {
    timeout.cleanup();
  }
}

export async function performCollectionInfo(
  mcpServer: McpServer,
  refresh = false,
  signal?: AbortSignal,
): Promise<string> {
  const configIssue = validateThaiLawConfig();
  if (configIssue) {
    throw createConfigurationError(configIssue);
  }

  const config = getThaiLawConfig();
  const cacheArgs = { collection: config.collectionName };
  if (!refresh) {
    const cached = searchCache.get("thailaw_collection_info", cacheArgs);
    if (cached) {
      return cached;
    }
  }

  const timeout = withTimeout(config.fetchTimeoutMs, signal);
  try {
    logMessage(mcpServer, "info", `Fetching collection info: ${config.collectionName}`);
    const info = await fetchCollectionInfo(timeout.signal);
    const output = formatCollectionInfo(info, config.embeddingModel, config.embeddingUrl);
    searchCache.set("thailaw_collection_info", cacheArgs, output);
    return output;
  } finally {
    timeout.cleanup();
  }
}

export function formatCollectionInfo(
  info: QdrantCollectionInfo,
  embeddingModel: string,
  embeddingUrl: string,
): string {
  return JSON.stringify({
    collection: info.name,
    status: info.status ?? "unknown",
    points_count: info.pointsCount ?? null,
    indexed_vectors_count: info.indexedVectorsCount ?? null,
    vector_size: info.vectorSize ?? null,
    distance: info.distance ?? null,
    embedding_model: embeddingModel,
    embedding_url: embeddingUrl,
  }, null, 2);
}
