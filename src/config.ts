import { parseStrictInteger } from "./env-int.js";

export const SERVER_NAME = "phattja/mcp-thailaw";

export const DEFAULT_QDRANT_URL = "http://localhost:6333";
export const DEFAULT_COLLECTION_NAME = "krisdika";
export const DEFAULT_EMBEDDING_URL = "http://127.0.0.1:57863/v1/embeddings";
export const DEFAULT_EMBEDDING_MODEL = "gpustack-bge-m3";
export const DEFAULT_TOP_K = 5;
export const DEFAULT_SCORE_THRESHOLD = 0.3;
export const DEFAULT_MAX_RESULTS = 20;
export const DEFAULT_FETCH_TIMEOUT_MS = 30000;

export interface ThaiLawConfig {
  qdrantUrl: string;
  collectionName: string;
  qdrantApiKey?: string;
  embeddingUrl: string;
  embeddingModel: string;
  embeddingApiKey?: string;
  defaultTopK: number;
  defaultScoreThreshold: number;
  maxResults: number;
  fetchTimeoutMs: number;
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseBoundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = parseStrictInteger(raw);
  if (parsed === undefined || parsed < minimum || parsed > maximum) {
    return fallback;
  }
  return parsed;
}

function parseScoreThreshold(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return fallback;
  }
  return parsed;
}

export function getThaiLawConfig(env: NodeJS.ProcessEnv = process.env): ThaiLawConfig {
  const maxResults = parseBoundedInteger(
    env.THAILAW_MAX_RESULTS,
    DEFAULT_MAX_RESULTS,
    1,
    100,
  );

  return {
    qdrantUrl: (trimOrUndefined(env.QDRANT_URL) ?? DEFAULT_QDRANT_URL).replace(/\/+$/, ""),
    collectionName: trimOrUndefined(env.QDRANT_COLLECTION) ?? DEFAULT_COLLECTION_NAME,
    qdrantApiKey: trimOrUndefined(env.QDRANT_API_KEY),
    embeddingUrl: trimOrUndefined(env.EMBEDDING_URL) ?? DEFAULT_EMBEDDING_URL,
    embeddingModel: trimOrUndefined(env.EMBEDDING_MODEL) ?? DEFAULT_EMBEDDING_MODEL,
    embeddingApiKey: trimOrUndefined(env.EMBEDDING_API_KEY),
    defaultTopK: parseBoundedInteger(env.THAILAW_TOP_K, DEFAULT_TOP_K, 1, maxResults),
    defaultScoreThreshold: parseScoreThreshold(
      env.THAILAW_SCORE_THRESHOLD,
      DEFAULT_SCORE_THRESHOLD,
    ),
    maxResults,
    fetchTimeoutMs: parseBoundedInteger(
      env.FETCH_TIMEOUT_MS,
      DEFAULT_FETCH_TIMEOUT_MS,
      1000,
      300000,
    ),
  };
}

export function validateHttpUrl(value: string, name: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return `${name} must use http or https (got ${url.protocol})`;
    }
    return undefined;
  } catch {
    return `${name} is not a valid URL: ${value}`;
  }
}

export function validateThaiLawConfig(config: ThaiLawConfig = getThaiLawConfig()): string | null {
  const issues: string[] = [];

  const qdrantIssue = validateHttpUrl(config.qdrantUrl, "QDRANT_URL");
  if (qdrantIssue) issues.push(qdrantIssue);

  const embeddingIssue = validateHttpUrl(config.embeddingUrl, "EMBEDDING_URL");
  if (embeddingIssue) issues.push(embeddingIssue);

  if (!config.collectionName) {
    issues.push("QDRANT_COLLECTION must not be empty");
  }

  if (!config.embeddingModel) {
    issues.push("EMBEDDING_MODEL must not be empty");
  }

  if (issues.length === 0) {
    return null;
  }

  return `Configuration issues: ${issues.join("; ")}`;
}
