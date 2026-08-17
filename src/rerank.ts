import { getThaiLawConfig } from "./config.js";
import { createNetworkError, createServerError, MCPThaiLawError } from "./error-handler.js";
import { getFetch } from "./http-client.js";

interface RerankHit {
  index?: number;
  relevance_score?: number;
  relevanceScore?: number;
}

interface RerankResponse {
  results?: RerankHit[];
  data?: RerankHit[];
}

function relevance(hit: RerankHit): number | undefined {
  const value = hit.relevance_score ?? hit.relevanceScore;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function rerankDocuments(
  query: string,
  documents: string[],
  signal?: AbortSignal,
): Promise<number[]> {
  if (documents.length === 0) {
    return [];
  }

  const config = getThaiLawConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.rerankApiKey) {
    headers.Authorization = `Bearer ${config.rerankApiKey}`;
  }

  let response: Response;
  try {
    response = await getFetch()(config.rerankUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.rerankModel,
        query,
        documents,
      }),
      signal,
    });
  } catch (error) {
    throw createNetworkError(error, {
      url: config.rerankUrl,
      target: "rerank server",
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw createServerError(response.status, response.statusText, body, {
      url: config.rerankUrl,
      target: "rerank server",
    });
  }

  let payload: RerankResponse;
  try {
    payload = await response.json() as RerankResponse;
  } catch {
    throw new MCPThaiLawError("Rerank server returned a non-JSON response.");
  }

  const hits = payload.results ?? payload.data ?? [];
  const scores = documents.map(() => Number.NEGATIVE_INFINITY);
  for (const hit of hits) {
    if (typeof hit.index !== "number" || hit.index < 0 || hit.index >= documents.length) {
      continue;
    }
    const score = relevance(hit);
    if (score !== undefined) {
      scores[hit.index] = score;
    }
  }
  return scores;
}

export async function rerankResults<T extends { text: string; score: number }>(
  query: string,
  results: T[],
  signal?: AbortSignal,
): Promise<T[]> {
  if (results.length < 2) {
    return results;
  }
  const scores = await rerankDocuments(
    query,
    results.map((item) => item.text),
    signal,
  );
  return results
    .map((item, index) => ({
      ...item,
      score: scores[index] === Number.NEGATIVE_INFINITY ? item.score : scores[index],
    }))
    .sort((left, right) => right.score - left.score);
}
