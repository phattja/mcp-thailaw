import { getThaiLawConfig } from "./config.js";
import { createNetworkError, createServerError, MCPThaiLawError } from "./error-handler.js";
import { getFetch } from "./http-client.js";

export interface QdrantFilter {
  lawCode?: string;
  category?: string;
  isLatest?: boolean;
  applyLatest?: boolean;
  year?: number;
  textContains?: string;
  titleContains?: string;
  sectionId?: string | number;
  sectionNo?: string | string[];
}

export interface QdrantHit {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
}

export interface QdrantNamedVector {
  name: string;
  size?: number;
  distance?: string;
  multivector?: boolean;
}

export interface QdrantCollectionInfo {
  name: string;
  status?: string;
  pointsCount?: number;
  indexedVectorsCount?: number;
  vectorSize?: number;
  distance?: string;
  namedVectors?: QdrantNamedVector[];
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

interface ScrollResponse {
  result?: {
    points?: Array<{
      id?: string | number;
      payload?: Record<string, unknown> | null;
    }>;
    next_page_offset?: string | number | Record<string, unknown> | null;
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
          multivector_config?: { comparator?: string };
          [name: string]: unknown;
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

function collectionUrl(suffix = "", collectionName?: string): string {
  const config = getThaiLawConfig();
  const name = collectionName ?? config.collectionName;
  return `${config.qdrantUrl}/collections/${encodeURIComponent(name)}${suffix}`;
}

function matchValue(key: string, value: string | number | boolean): Record<string, unknown> {
  return { key, match: { value } };
}

function matchAny(key: string, values: Array<string | number>): Record<string, unknown> {
  if (values.length === 1) {
    return matchValue(key, values[0]);
  }
  return { key, match: { any: values } };
}

function orMust(conditions: Array<Record<string, unknown>>): Record<string, unknown> | undefined {
  if (conditions.length === 0) {
    return undefined;
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return { should: conditions };
}

function numericIfPossible(value: string | number): string | number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const raw = String(value).trim();
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

function buildFilter(filter?: QdrantFilter): Record<string, unknown> {
  const must: Array<Record<string, unknown>> = [];
  if (filter?.applyLatest !== false) {
    must.push(matchValue("is_latest", filter?.isLatest ?? true));
  }
  if (typeof filter?.year === "number" && Number.isFinite(filter.year)) {
    must.push(matchValue("year", filter.year));
  }
  if (filter?.lawCode) {
    must.push(matchValue("law_code", filter.lawCode));
  }
  if (filter?.category) {
    must.push(matchValue("category", filter.category));
  }
  if (filter?.textContains) {
    must.push({ key: "text", match: { text: filter.textContains } });
  }
  if (filter?.titleContains) {
    must.push({ key: "title", match: { text: filter.titleContains } });
  }
  if (filter?.sectionId !== undefined && filter.sectionId !== "") {
    const sectionId = numericIfPossible(filter.sectionId);
    const sectionIdFilter = orMust([
      matchValue("section.sectionId", sectionId),
      matchValue("sectionId", sectionId),
    ]);
    if (sectionIdFilter) {
      must.push(sectionIdFilter);
    }
  }
  if (filter?.sectionNo !== undefined) {
    const values = (Array.isArray(filter.sectionNo) ? filter.sectionNo : [filter.sectionNo])
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
    if (values.length > 0) {
      const sectionNoFilter = orMust([
        matchAny("section.sectionNo", values),
        matchAny("sectionNo", values),
      ]);
      if (sectionNoFilter) {
        must.push(sectionNoFilter);
      }
    }
  }
  return { must };
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
  vector: number[] | number[][],
  options: {
    limit: number;
    scoreThreshold: number;
    filter?: QdrantFilter;
    using?: string;
    collection?: string;
    signal?: AbortSignal;
  },
): Promise<QdrantHit[]> {
  const queryUrl = collectionUrl("/points/query", options.collection);
  const body: Record<string, unknown> = {
    query: vector,
    limit: options.limit,
    score_threshold: options.scoreThreshold,
    with_payload: true,
  };
  if (options.using) {
    body.using = options.using;
  }
  const filter = buildFilter(options.filter);
  if (Object.keys(filter).length > 0 && Array.isArray((filter as { must?: unknown[] }).must)
    && ((filter as { must: unknown[] }).must.length > 0)) {
    body.filter = filter;
  }

  const response = await qdrantFetch(
    queryUrl,
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
      url: queryUrl,
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

export async function scrollPoints(
  options: {
    filter?: QdrantFilter;
    limit?: number;
    maxPoints?: number;
    signal?: AbortSignal;
  } = {},
): Promise<QdrantHit[]> {
  const pageSize = options.limit ?? 16;
  const maxPoints = options.maxPoints ?? 32;
  const hits: QdrantHit[] = [];
  let offset: string | number | Record<string, unknown> | null | undefined;

  while (hits.length < maxPoints) {
    const body: Record<string, unknown> = {
      limit: Math.min(pageSize, maxPoints - hits.length),
      with_payload: true,
      with_vector: false,
      filter: buildFilter(options.filter),
    };
    if (offset !== undefined && offset !== null) {
      body.offset = offset;
    }

    const response = await qdrantFetch(
      collectionUrl("/points/scroll"),
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
        url: collectionUrl("/points/scroll"),
        target: "Qdrant",
      });
    }

    let payload: ScrollResponse;
    try {
      payload = await response.json() as ScrollResponse;
    } catch {
      throw new MCPThaiLawError("Qdrant returned a non-JSON scroll response.");
    }

    const points = payload.result?.points ?? [];
    for (const point of points) {
      if (typeof point.id !== "string" && typeof point.id !== "number") {
        continue;
      }
      hits.push({
        id: point.id,
        score: 0,
        payload: point.payload ?? {},
      });
      if (hits.length >= maxPoints) {
        break;
      }
    }

    const next = payload.result?.next_page_offset;
    if (next === undefined || next === null || points.length === 0) {
      break;
    }
    offset = next;
  }

  return hits;
}

export async function fetchCollectionInfo(
  signal?: AbortSignal,
  collectionName?: string,
): Promise<QdrantCollectionInfo> {
  const config = getThaiLawConfig();
  const infoUrl = collectionUrl("", collectionName);
  const response = await qdrantFetch(
    infoUrl,
    {
      method: "GET",
      headers: qdrantHeaders(),
    },
    signal,
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw createServerError(response.status, response.statusText, text, {
      url: infoUrl,
      target: "Qdrant",
    });
  }

  let payload: CollectionResponse;
  try {
    payload = await response.json() as CollectionResponse;
  } catch {
    throw new MCPThaiLawError("Qdrant returned a non-JSON collection response.");
  }

  const vectors = payload.result?.config?.params?.vectors;
  const namedVectors = parseNamedVectors(vectors);
  const unnamedSize = typeof vectors?.size === "number" ? vectors.size : undefined;
  const unnamedDistance = typeof vectors?.distance === "string" ? vectors.distance : undefined;
  const colbert = namedVectors.find((item) => item.name === "colbert") ?? namedVectors[0];

  return {
    name: collectionName ?? config.collectionName,
    status: payload.result?.status,
    pointsCount: payload.result?.points_count,
    indexedVectorsCount: payload.result?.indexed_vectors_count,
    vectorSize: unnamedSize ?? colbert?.size,
    distance: unnamedDistance ?? colbert?.distance,
    namedVectors,
  };
}

function parseNamedVectors(vectors: unknown): QdrantNamedVector[] {
  if (!vectors || typeof vectors !== "object" || Array.isArray(vectors)) {
    return [];
  }
  const record = vectors as Record<string, unknown>;
  if (typeof record.size === "number") {
    return [];
  }
  const named: QdrantNamedVector[] = [];
  for (const [name, spec] of Object.entries(record)) {
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
      continue;
    }
    const item = spec as {
      size?: number;
      distance?: string;
      multivector_config?: unknown;
    };
    named.push({
      name,
      size: typeof item.size === "number" ? item.size : undefined,
      distance: typeof item.distance === "string" ? item.distance : undefined,
      multivector: item.multivector_config !== undefined,
    });
  }
  return named;
}
