import { getThaiLawConfig } from "./config.js";
import { createNetworkError, createServerError, MCPThaiLawError } from "./error-handler.js";
import { getFetch } from "./http-client.js";

export interface QdrantFilter {
  lawCode?: string;
  category?: string;
  isLatest?: boolean;
}

export interface QdrantHit {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
}

export interface QdrantCollectionInfo {
  name: string;
  status?: string;
  pointsCount?: number;
  indexedVectorsCount?: number;
  vectorSize?: number;
  distance?: string;
}

interface QueryResponse {
  result?: {
    points?: Array<{
      id?: string | number;
      score?: number;
      payload?: Record<string, unknown> | null;
    }>;
  };
}

interface CollectionResponse {
  result?: {
    status?: string;
    points_count?: number;
    indexed_vectors_count?: number;
    config?: {
      params?: {
        vectors?: {
          size?: number;
          distance?: string;
        };
      };
    };
  };
}

function qdrantHeaders(): Record<string, string> {
  const config = getThaiLawConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.qdrantApiKey) {
    headers["api-key"] = config.qdrantApiKey;
  }
  return headers;
}

function collectionUrl(suffix = ""): string {
  const config = getThaiLawConfig();
  return `${config.qdrantUrl}/collections/${encodeURIComponent(config.collectionName)}${suffix}`;
}

function buildFilter(filter?: QdrantFilter): Record<string, unknown> | undefined {
  if (!filter) {
    return undefined;
  }

  const must: Array<Record<string, unknown>> = [];
  if (filter.lawCode) {
    must.push({ key: "law_code", match: { value: filter.lawCode } });
  }
  if (filter.category) {
    must.push({ key: "category", match: { value: filter.category } });
  }
  if (filter.isLatest !== undefined) {
    must.push({ key: "is_latest", match: { value: filter.isLatest } });
  }

  return must.length > 0 ? { must } : undefined;
}

async function qdrantFetch(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    return await getFetch()(url, { ...init, signal });
  } catch (error) {
    throw createNetworkError(error, {
      url,
      target: "Qdrant",
    });
  }
}

export async function queryPoints(
  vector: number[],
  options: {
    limit: number;
    scoreThreshold: number;
    filter?: QdrantFilter;
    signal?: AbortSignal;
  },
): Promise<QdrantHit[]> {
  const body: Record<string, unknown> = {
    query: vector,
    limit: options.limit,
    score_threshold: options.scoreThreshold,
    with_payload: true,
  };
  const filter = buildFilter(options.filter);
  if (filter) {
    body.filter = filter;
  }

  const response = await qdrantFetch(
    collectionUrl("/points/query"),
    {
      method: "POST",
      headers: qdrantHeaders(),
      body: JSON.stringify(body),
    },
    options.signal,
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw createServerError(response.status, response.statusText, text, {
      url: collectionUrl("/points/query"),
      target: "Qdrant",
    });
  }

  let payload: QueryResponse;
  try {
    payload = await response.json() as QueryResponse;
  } catch {
    throw new MCPThaiLawError("Qdrant returned a non-JSON query response.");
  }

  return (payload.result?.points ?? [])
    .filter((point): point is { id: string | number; score: number; payload?: Record<string, unknown> | null } => (
      (typeof point.id === "string" || typeof point.id === "number")
      && typeof point.score === "number"
    ))
    .map((point) => ({
      id: point.id,
      score: point.score,
      payload: point.payload ?? {},
    }));
}

export async function fetchCollectionInfo(signal?: AbortSignal): Promise<QdrantCollectionInfo> {
  const config = getThaiLawConfig();
  const response = await qdrantFetch(
    collectionUrl(),
    {
      method: "GET",
      headers: qdrantHeaders(),
    },
    signal,
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw createServerError(response.status, response.statusText, text, {
      url: collectionUrl(),
      target: "Qdrant",
    });
  }

  let payload: CollectionResponse;
  try {
    payload = await response.json() as CollectionResponse;
  } catch {
    throw new MCPThaiLawError("Qdrant returned a non-JSON collection response.");
  }

  return {
    name: config.collectionName,
    status: payload.result?.status,
    pointsCount: payload.result?.points_count,
    indexedVectorsCount: payload.result?.indexed_vectors_count,
    vectorSize: payload.result?.config?.params?.vectors?.size,
    distance: payload.result?.config?.params?.vectors?.distance,
  };
}
