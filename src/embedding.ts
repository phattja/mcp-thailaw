import { getThaiLawConfig } from "./config.js";
import { createNetworkError, createServerError, MCPThaiLawError } from "./error-handler.js";
import { getFetch } from "./http-client.js";

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: unknown; index?: number }>;
}

interface LlamaEmbeddingItem {
  index?: number;
  embedding?: unknown;
}

export type DenseVector = number[];
export type MultiVector = number[][];

export interface DualEmbedding {
  dense: DenseVector;
  colbert: MultiVector;
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function isMultiVector(value: unknown): value is number[][] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => isFiniteNumberArray(item));
}

function isTeiEmbedUrl(url: string): boolean {
  return url.endsWith("/embed") || url.endsWith("/embed_all") || url.endsWith("/colbert");
}

function isLlamaEmbeddingUrl(url: string): boolean {
  return url.endsWith("/embedding") && !url.endsWith("/v1/embeddings");
}

export function l2Normalize(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) {
    sum += value * value;
  }
  const scale = Math.max(Math.sqrt(sum), 1e-12);
  return vector.map((value) => value / scale);
}

export function l2NormalizeRows(rows: number[][]): number[][] {
  return rows
    .map(l2Normalize)
    .filter((row) => row.some((value) => Math.abs(value) > 1e-6));
}

export function meanPoolDense(rows: number[][]): number[] {
  const width = rows[0]?.length ?? 0;
  if (width === 0) {
    throw new MCPThaiLawError("Cannot mean-pool an empty token matrix.");
  }
  const acc = new Array<number>(width).fill(0);
  for (const row of rows) {
    for (let index = 0; index < width; index += 1) {
      acc[index] += row[index] ?? 0;
    }
  }
  const count = rows.length;
  return l2Normalize(acc.map((value) => value / count));
}

function parseLlamaTokenMatrix(payload: unknown): number[][] {
  if (!Array.isArray(payload) || payload.length === 0 || typeof payload[0] !== "object" || payload[0] === null) {
    throw new MCPThaiLawError(
      "llama.cpp /embedding response is missing token rows. Check pooling=none and EMBEDDING_MODEL.",
    );
  }
  if (!("embedding" in (payload[0] as object))) {
    throw new MCPThaiLawError(
      "llama.cpp /embedding response is missing token rows. Check pooling=none and EMBEDDING_MODEL.",
    );
  }
  const items = [...payload] as LlamaEmbeddingItem[];
  items.sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
  const first = items[0]?.embedding;
  if (isMultiVector(first)) {
    return first;
  }
  throw new MCPThaiLawError(
    "llama.cpp /embedding response is missing token rows. Check pooling=none and EMBEDDING_MODEL.",
  );
}

async function postEmbedding(
  url: string,
  body: unknown,
  target: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const config = getThaiLawConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.embeddingApiKey) {
    headers.Authorization = `Bearer ${config.embeddingApiKey}`;
  }

  let response: Response;
  try {
    response = await getFetch()(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw createNetworkError(error, { url, target });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw createServerError(response.status, response.statusText, text, { url, target });
  }

  try {
    return await response.json();
  } catch {
    throw new MCPThaiLawError(
      "Embedding server returned a non-JSON response. Check EMBEDDING_URL / COLBERT_URL.",
    );
  }
}

function parseDenseEmbedding(payload: unknown): number[] {
  if (isFiniteNumberArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload) && isFiniteNumberArray(payload[0])) {
    return payload[0];
  }
  const openai = payload as OpenAIEmbeddingResponse;
  const vectors = [...(openai.data ?? [])].sort((left, right) => {
    const leftIndex = typeof left.index === "number" ? left.index : 0;
    const rightIndex = typeof right.index === "number" ? right.index : 0;
    return leftIndex - rightIndex;
  });
  const embedding = vectors[0]?.embedding;
  if (isFiniteNumberArray(embedding)) {
    return embedding;
  }
  throw new MCPThaiLawError(
    "Embedding server response is missing a numeric vector. Check EMBEDDING_MODEL and the embeddings payload.",
  );
}

function parseColbertEmbedding(payload: unknown, maxTokens: number): number[][] {
  let tokens: number[][] | undefined;
  if (isMultiVector(payload)) {
    const first = payload[0];
    if (Array.isArray(first) && typeof first[0] === "number") {
      tokens = payload;
    }
  }
  if (!tokens && Array.isArray(payload) && isMultiVector(payload[0])) {
    tokens = payload[0];
  }
  const openai = payload as OpenAIEmbeddingResponse;
  if (!tokens && isMultiVector(openai.data?.[0]?.embedding)) {
    tokens = openai.data[0].embedding as number[][];
  }
  if (!tokens || tokens.length === 0) {
    throw new MCPThaiLawError(
      "ColBERT server response is missing token vectors. Check COLBERT_URL.",
    );
  }
  return tokens.slice(0, Math.max(1, maxTokens));
}

export function dualFromTokenRows(rows: number[][], maxTokens: number): DualEmbedding {
  if (!rows.length) {
    throw new MCPThaiLawError("Empty token matrix from embedding server.");
  }
  const colbert = l2NormalizeRows(rows).slice(0, Math.max(1, maxTokens));
  if (colbert.length === 0) {
    throw new MCPThaiLawError("All token rows were empty after L2 normalize.");
  }
  return {
    dense: meanPoolDense(rows),
    colbert,
  };
}

async function fetchEmbeddingPayload(
  text: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const config = getThaiLawConfig();
  if (isLlamaEmbeddingUrl(config.embeddingUrl) || isLlamaEmbeddingUrl(config.colbertUrl)) {
    const url = isLlamaEmbeddingUrl(config.colbertUrl) ? config.colbertUrl : config.embeddingUrl;
    return postEmbedding(
      url,
      { model: config.embeddingModel, content: text },
      "embedding server",
      signal,
    );
  }
  if (isTeiEmbedUrl(config.embeddingUrl)) {
    return postEmbedding(
      config.embeddingUrl,
      { inputs: text, normalize: true },
      "embedding server",
      signal,
    );
  }
  return postEmbedding(
    config.embeddingUrl,
    {
      model: config.embeddingModel,
      input: text,
      dimensions: config.embeddingDimensions,
    },
    "embedding server",
    signal,
  );
}

export async function getDualEmbedding(
  text: string,
  signal?: AbortSignal,
  maxTokens?: number,
): Promise<DualEmbedding> {
  const config = getThaiLawConfig();
  const tokenCap = maxTokens ?? config.colbertMaxTokens;
  const payload = await fetchEmbeddingPayload(text, signal);
  try {
    const rows = parseLlamaTokenMatrix(payload);
    return dualFromTokenRows(rows, tokenCap);
  } catch {
    if (isMultiVector(payload) && payload.length > 1) {
      const tokens = parseColbertEmbedding(payload, tokenCap);
      return {
        dense: meanPoolDense(tokens),
        colbert: l2NormalizeRows(tokens).slice(0, tokenCap),
      };
    }
    return {
      dense: parseDenseEmbedding(payload),
      colbert: [parseDenseEmbedding(payload)],
    };
  }
}

export async function getEmbedding(
  text: string,
  signal?: AbortSignal,
): Promise<DenseVector> {
  const dual = await getDualEmbedding(text, signal);
  return dual.dense;
}

export async function getColbertEmbedding(
  text: string,
  signal?: AbortSignal,
): Promise<MultiVector> {
  const dual = await getDualEmbedding(text, signal);
  return dual.colbert;
}
