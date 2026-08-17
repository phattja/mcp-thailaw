import { parseStrictInteger } from "./env-int.js";
import type { CliOverrides } from "./cli-args.js";

export const SERVER_NAME = "phattja/mcp-thailaw";

export const DEFAULT_QDRANT_URL = "http://localhost:6333";
export const DEFAULT_COLLECTION_NAME = "krisdika";
export const DEFAULT_EMBEDDING_URL = "http://127.0.0.1:57863/v1/embeddings";
export const DEFAULT_EMBEDDING_MODEL = "gpustack-bge-m3";
export const DEFAULT_TOP_K = 40;
export const DEFAULT_SCORE_THRESHOLD = 0.3;
export const DEFAULT_MAX_RESULTS = 100;
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

export interface HttpListenConfig {
  port?: number;
  host: string;
  portError?: string;
}

let cliOverrides: CliOverrides = {};

export function setCliOverrides(overrides: CliOverrides): void {
  cliOverrides = { ...overrides };
}

export function resetCliOverrides(): void {
  cliOverrides = {};
}

export function getCliOverrides(): CliOverrides {
  return { ...cliOverrides };
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function firstString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = trimOrUndefined(value);
    if (trimmed !== undefined) {
      return trimmed;
    }
  }
  return undefined;
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

function firstNumber(cliValue: number | undefined, envRaw: string | undefined, fallback: number, parse: (raw: string | undefined, fallback: number) => number): number {
  return cliValue !== undefined ? cliValue : parse(envRaw, fallback);
}

export function getThaiLawConfig(env: NodeJS.ProcessEnv = process.env): ThaiLawConfig {
  const cli = cliOverrides;
  const maxResults = firstNumber(
    cli.maxResults,
    env.THAILAW_MAX_RESULTS,
    DEFAULT_MAX_RESULTS,
    (raw, fallback) => parseBoundedInteger(raw, fallback, 1, 100),
  );

  return {
    qdrantUrl: (firstString(cli.qdrantUrl, env.QDRANT_URL) ?? DEFAULT_QDRANT_URL).replace(/\/+$/, ""),
    collectionName: firstString(cli.collectionName, env.QDRANT_COLLECTION) ?? DEFAULT_COLLECTION_NAME,
    qdrantApiKey: firstString(cli.qdrantApiKey, env.QDRANT_API_KEY),
    embeddingUrl: firstString(cli.embeddingUrl, env.EMBEDDING_URL) ?? DEFAULT_EMBEDDING_URL,
    embeddingModel: firstString(cli.embeddingModel, env.EMBEDDING_MODEL) ?? DEFAULT_EMBEDDING_MODEL,
    embeddingApiKey: firstString(cli.embeddingApiKey, env.EMBEDDING_API_KEY),
    defaultTopK: firstNumber(
      cli.defaultTopK,
      env.THAILAW_TOP_K,
      DEFAULT_TOP_K,
      (raw, fallback) => parseBoundedInteger(raw, fallback, 1, maxResults),
    ),
    defaultScoreThreshold: firstNumber(
      cli.defaultScoreThreshold,
      env.THAILAW_SCORE_THRESHOLD,
      DEFAULT_SCORE_THRESHOLD,
      parseScoreThreshold,
    ),
    maxResults,
    fetchTimeoutMs: firstNumber(
      cli.fetchTimeoutMs,
      env.FETCH_TIMEOUT_MS,
      DEFAULT_FETCH_TIMEOUT_MS,
      (raw, fallback) => parseBoundedInteger(raw, fallback, 1000, 300000),
    ),
  };
}

export function resolveHttpListen(env: NodeJS.ProcessEnv = process.env): HttpListenConfig {
  const cli = cliOverrides;
  const rawPort = cli.httpPort !== undefined ? String(cli.httpPort) : env.THAILAW_HTTP_PORT;
  const host = firstString(cli.httpHost, env.THAILAW_HTTP_HOST) ?? "127.0.0.1";
  if (rawPort === undefined || rawPort.trim() === "") {
    return { host };
  }

  const parsed = parseStrictInteger(rawPort);
  if (parsed === undefined || parsed < 1 || parsed > 65535) {
    return {
      host,
      portError: `Invalid HTTP port: ${rawPort}. Must be between 1-65535.`,
    };
  }

  return { port: parsed, host };
}

export function envWithCliOverrides(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const cli = cliOverrides;
  const merged: NodeJS.ProcessEnv = { ...env };
  if (cli.qdrantUrl) merged.QDRANT_URL = cli.qdrantUrl;
  if (cli.collectionName) merged.QDRANT_COLLECTION = cli.collectionName;
  if (cli.qdrantApiKey) merged.QDRANT_API_KEY = cli.qdrantApiKey;
  if (cli.embeddingUrl) merged.EMBEDDING_URL = cli.embeddingUrl;
  if (cli.embeddingModel) merged.EMBEDDING_MODEL = cli.embeddingModel;
  if (cli.embeddingApiKey) merged.EMBEDDING_API_KEY = cli.embeddingApiKey;
  if (cli.httpPort !== undefined) merged.THAILAW_HTTP_PORT = String(cli.httpPort);
  if (cli.httpHost) merged.THAILAW_HTTP_HOST = cli.httpHost;
  return merged;
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
