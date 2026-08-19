import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getThaiLawConfig, validateThaiLawConfig } from "./config.js";
import { getEmbedding } from "./embedding.js";
import { rerankResults } from "./rerank.js";
import { createConfigurationError, createNoResultsMessage } from "./error-handler.js";
import { logMessage } from "./logging.js";
import { fetchCollectionInfo, queryPoints, scrollPoints, type QdrantCollectionInfo, type QdrantHit } from "./qdrant.js";
import { searchCache } from "./search-cache.js";
import {
  extractPrimaryMatra,
  extractQueryMatra,
  extractSectionBody,
  extractSectionIds,
  formatMatraThai,
  formatOfficialThaiStatute,
  normalizeMatraKey,
  rewriteQueryMatraToThai,
  splitStatuteSections,
  thaiDigitsToArabic,
} from "./statute.js";
import { timelineCodeForUrl } from "./timeline.js";
import {
  combineKrisdikaSources,
  isNoResultsText,
  krisdikaToOcsArgs,
  performOcsSearch,
  resolveKrisdikaSource,
} from "./ocs.js";
import { filterExcluded, parseExcludeWords } from "./exclude.js";
import type { ResponseFormat, SearchKrisdikaArgs } from "./types.js";

export interface ThaiLawResult {
  score: number;
  title: string;
  law_code: string;
  category: string;
  publish_date: string;
  reference_url: string;
  text: string;
  chunk_index?: number;
  chunk_count?: number;
  is_latest?: boolean;
  matra?: string;
  section_id?: string;
  timeline_code?: string;
}

export function timelineRank(code?: string): number {
  if (!code) {
    return -1;
  }
  const match = /-(\d+)$/.exec(code.trim());
  if (!match) {
    return -1;
  }
  return Number(match[1]);
}

const MAX_SECTION_FETCHES = 8;

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

function payloadObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function payloadSection(payload: Record<string, unknown>): Record<string, unknown> {
  return payloadObject(payload.section) ?? {};
}

function scalarToString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function sectionField(payload: Record<string, unknown>, key: string): string {
  return scalarToString(payloadSection(payload)[key]) || scalarToString(payload[key]);
}

export function sectionNoMatchValues(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  const thai = formatMatraThai(trimmed);
  const arabic = thaiDigitsToArabic(thai);
  return [...new Set([trimmed, thai, arabic].filter((item) => item.length > 0))];
}

export function hitToResult(hit: QdrantHit): ThaiLawResult {
  const payload = hit.payload;
  const content = sectionField(payload, "content") || payloadString(payload, "text");
  const sectionId = sectionField(payload, "sectionId");
  const sectionNo = sectionField(payload, "sectionNo");
  return {
    score: hit.score,
    title: payloadString(payload, "title", "ไม่มีชื่อ"),
    law_code: payloadString(payload, "law_code"),
    category: payloadString(payload, "category"),
    publish_date: payloadString(payload, "publish_date"),
    reference_url: payloadString(payload, "reference_url"),
    text: content,
    chunk_index: payloadNumber(payload, "chunk_index"),
    is_latest: payloadBoolean(payload, "is_latest"),
    section_id: sectionId || undefined,
    matra: extractPrimaryMatra(content) ?? (sectionNo ? formatMatraThai(sectionNo) : undefined),
    timeline_code: payloadString(payload, "timeline_code")
      || timelineCodeForUrl(payloadString(payload, "reference_url"))
      || undefined,
  };
}

const MIN_CHUNK_OVERLAP = 40;

export function mergeOverlappingText(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  if (left.includes(right)) return left;
  if (right.includes(left)) return right;

  const maxOverlap = Math.min(left.length, right.length);
  for (let size = maxOverlap; size >= MIN_CHUNK_OVERLAP; size -= 1) {
    if (left.endsWith(right.slice(0, size))) {
      return left + right.slice(size);
    }
  }
  return `${left}\n\n${right}`;
}

function lawGroupKey(result: ThaiLawResult): string {
  const code = result.law_code.trim();
  if (code) {
    return `code:${code}`;
  }
  return `title:${result.title}::${result.reference_url}`;
}

export function groupResultsByLaw(results: ThaiLawResult[]): ThaiLawResult[] {
  const groups = new Map<string, ThaiLawResult[]>();
  for (const result of results) {
    const key = lawGroupKey(result);
    const existing = groups.get(key);
    if (existing) {
      existing.push(result);
    } else {
      groups.set(key, [result]);
    }
  }

  const merged: ThaiLawResult[] = [];
  for (const members of groups.values()) {
    members.sort((left, right) => {
      const leftIndex = left.chunk_index ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = right.chunk_index ?? Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      return right.score - left.score;
    });

    const best = members.reduce((winner, item) => (item.score > winner.score ? item : winner));
    const text = members.map((item) => item.text).reduce((left, right) => mergeOverlappingText(left, right), "");
    merged.push({
      ...best,
      score: best.score,
      text,
      chunk_count: members.length,
      chunk_index: members[0]?.chunk_index,
    });
  }

  merged.sort((left, right) => right.score - left.score);
  return merged;
}

export function splitResultsBySection(results: ThaiLawResult[]): ThaiLawResult[] {
  const split: ThaiLawResult[] = [];
  for (const result of results) {
    const sections = splitStatuteSections(result.text);
    if (sections.length === 0) {
      split.push(result);
      continue;
    }
    for (const section of sections) {
      split.push({
        ...result,
        text: section.body,
        section_id: section.sectionId ?? result.section_id,
        matra: extractPrimaryMatra(section.body) ?? result.matra,
      });
    }
  }
  return split;
}

export function mergeArticleText(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  if (left.includes(right)) return left;
  if (right.includes(left)) return right;

  const leftMatra = extractPrimaryMatra(left);
  const rightMatra = extractPrimaryMatra(right);
  if (
    leftMatra
    && rightMatra
    && normalizeMatraKey(leftMatra) === normalizeMatraKey(rightMatra)
    && left.includes("มาตรา")
    && right.includes("มาตรา")
    && left.trimStart().startsWith("มาตรา")
    && right.trimStart().startsWith("มาตรา")
  ) {
    return left.length >= right.length ? left : right;
  }
  return mergeOverlappingText(left, right);
}

function articleGroupKey(result: ThaiLawResult): string {
  const code = result.law_code.trim();
  if (result.section_id) {
    return `sec:${code}:${result.section_id}`;
  }
  if (result.matra) {
    return `matra:${code}:${normalizeMatraKey(result.matra)}`;
  }
  return lawGroupKey(result);
}

export function groupResultsByArticle(results: ThaiLawResult[]): ThaiLawResult[] {
  const pieces = splitResultsBySection(results);
  const groups = new Map<string, ThaiLawResult[]>();
  for (const result of pieces) {
    const key = articleGroupKey(result);
    const existing = groups.get(key);
    if (existing) {
      existing.push(result);
    } else {
      groups.set(key, [result]);
    }
  }

  const merged: ThaiLawResult[] = [];
  for (const members of groups.values()) {
    members.sort((left, right) => {
      const leftIndex = left.chunk_index ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = right.chunk_index ?? Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      return right.score - left.score;
    });

    const best = members.reduce((winner, item) => (item.score > winner.score ? item : winner));
    const sectionId = members.find((item) => item.section_id)?.section_id;
    const rawText = members
      .map((item) => (sectionId ? extractSectionBody(item.text, sectionId) || item.text : item.text))
      .reduce((left, right) => mergeArticleText(left, right), "");
    const matraRaw = extractPrimaryMatra(rawText) ?? best.matra;
    merged.push({
      ...best,
      score: best.score,
      text: formatOfficialThaiStatute(rawText),
      chunk_count: members.length,
      chunk_index: members[0]?.chunk_index,
      section_id: sectionId,
      matra: matraRaw ? formatMatraThai(matraRaw) : undefined,
    });
  }

  const deduped = new Map<string, ThaiLawResult>();
  for (const result of merged) {
    const key = result.matra
      ? `matra:${result.law_code}:${normalizeMatraKey(result.matra)}`
      : articleGroupKey(result);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, result);
      continue;
    }
    const resultRank = timelineRank(result.timeline_code);
    const existingRank = timelineRank(existing.timeline_code);
    const keepCurrent = resultRank > existingRank
      || (resultRank === existingRank && (
        result.text.length > existing.text.length
        || (result.text.length === existing.text.length && result.score > existing.score)
      ));
    if (keepCurrent) {
      deduped.set(key, { ...result, score: Math.max(result.score, existing.score) });
    } else {
      existing.score = Math.max(existing.score, result.score);
    }
  }

  return [...deduped.values()].sort((left, right) => right.score - left.score);
}

export async function completeSectionFragments(
  results: ThaiLawResult[],
  options: {
    isLatest: boolean;
    signal?: AbortSignal;
    maxFetches?: number;
    preferMatra?: string;
  },
): Promise<ThaiLawResult[]> {
  const pieces = splitResultsBySection(results);
  if (options.preferMatra) {
    const wantedKey = normalizeMatraKey(options.preferMatra);
    const lawCode = pieces.find((item) => item.matra && normalizeMatraKey(item.matra) === wantedKey)?.law_code.trim();
    try {
      const located = await scrollPoints({
        filter: {
          lawCode: lawCode || undefined,
          isLatest: options.isLatest,
          sectionNo: sectionNoMatchValues(options.preferMatra),
        },
        maxPoints: 80,
        signal: options.signal,
      });
      pieces.push(...splitResultsBySection(located.map(hitToResult)));
    } catch {
      // Vector hits are enough if the locator scroll fails.
    }
  }

  const ranked = new Map<string, {
    lawCode: string;
    sectionId: string;
    score: number;
    matra?: string;
    timeline_code?: string;
  }>();
  for (const result of pieces) {
    const sectionId = result.section_id ?? extractSectionIds(result.text)[0];
    const lawCode = result.law_code.trim();
    if (!sectionId || !lawCode) {
      continue;
    }
    const key = `${lawCode}::${sectionId}`;
    const existing = ranked.get(key);
    if (!existing || result.score > existing.score) {
      ranked.set(key, {
        lawCode,
        sectionId,
        score: result.score,
        matra: result.matra,
        timeline_code: result.timeline_code,
      });
    }
  }

  const wanted = options.preferMatra ? normalizeMatraKey(options.preferMatra) : undefined;
  const rankedList = [...ranked.values()];
  const matching = wanted
    ? rankedList.filter((item) => item.matra && normalizeMatraKey(item.matra) === wanted)
    : rankedList;
  const pool = matching.length > 0 ? matching : rankedList;
  const maxTimeline = Math.max(-1, ...pool.map((item) => timelineRank(item.timeline_code)));
  const latest = maxTimeline >= 0
    ? pool.filter((item) => timelineRank(item.timeline_code) === maxTimeline)
    : pool;
  const toFetch = (latest.length > 0 ? latest : pool)
    .sort((left, right) => right.score - left.score)
    .slice(0, options.maxFetches ?? MAX_SECTION_FETCHES);

  if (toFetch.length === 0) {
    return pieces;
  }

  const extras = await Promise.all(toFetch.map(async (target) => {
    try {
      const hits = await scrollPoints({
        filter: {
          lawCode: target.lawCode,
          isLatest: options.isLatest,
          sectionId: target.sectionId,
        },
        signal: options.signal,
      });
      return hits.flatMap((hit) => {
        const raw = hitToResult(hit);
        const extractedIds = extractSectionIds(raw.text);
        if (extractedIds.length > 0 && !extractedIds.includes(target.sectionId)) {
          return [];
        }
        if (raw.section_id && raw.section_id !== String(target.sectionId)) {
          return [];
        }
        const body = extractSectionBody(raw.text, target.sectionId);
        raw.score = target.score;
        raw.section_id = target.sectionId;
        raw.text = body || raw.text;
        raw.matra = extractPrimaryMatra(raw.text) ?? raw.matra;
        return [raw];
      });
    } catch {
      return [];
    }
  }));

  return [...pieces, ...extras.flat()];
}

export function preferQueryMatra(results: ThaiLawResult[], query: string): ThaiLawResult[] {
  const wanted = extractQueryMatra(query);
  if (!wanted) {
    return results;
  }
  const wantedKey = normalizeMatraKey(wanted);
  const matched = results.filter((result) => result.matra && normalizeMatraKey(result.matra) === wantedKey);
  if (matched.length === 0) {
    return results;
  }
  const scoredLaws = new Set(
    matched.filter((result) => result.score > 0).map((result) => result.law_code),
  );
  const focused = scoredLaws.size > 0
    ? matched.filter((result) => scoredLaws.has(result.law_code))
    : matched;
  return focused.sort((left, right) => {
    const timelineDelta = timelineRank(right.timeline_code) - timelineRank(left.timeline_code);
    if (timelineDelta !== 0) {
      return timelineDelta;
    }
    return right.score - left.score;
  });
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
    if (result.matra) {
      lines.push(`มาตรา: ${result.matra}`);
    }
    if (result.chunk_count && result.chunk_count > 1) {
      lines.push(`จำนวนส่วนที่รวม: ${result.chunk_count}`);
    }
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

async function performQdrantKrisdikaSearch(
  mcpServer: McpServer,
  args: SearchKrisdikaArgs,
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
  const isLatest = args.is_latest ?? true;
  const groupByLaw = args.group_by_law ?? true;
  const cacheArgs = {
    query: args.query,
    top_k: topK,
    score_threshold: scoreThreshold,
    law_code: args.law_code ?? "",
    category: args.category ?? "",
    is_latest: isLatest,
    group_by_law: groupByLaw,
    rerank: config.rerankEnabled,
    response_format: responseFormat,
    collection: config.collectionName,
    source: "qdrant",
    exclude: args.exclude ?? "",
  };

  const cached = searchCache.get("search_krisdika", cacheArgs);
  if (cached) {
    logMessage(mcpServer, "debug", "Returning cached Thai law search result");
    return cached;
  }

  const timeout = withTimeout(config.fetchTimeoutMs, signal);
  try {
    const searchQuery = rewriteQueryMatraToThai(args.query);
    const wantedMatra = extractQueryMatra(searchQuery);
    logMessage(mcpServer, "info", `Searching Thai law: ${searchQuery}`, {
      topK,
      scoreThreshold,
      collection: config.collectionName,
      matra: wantedMatra,
    });

    const excluded = parseExcludeWords(args.exclude);
    const fetchLimit = excluded.length > 0
      ? Math.min(config.maxResults, Math.max(topK * 4, 20))
      : topK;
    const vector = await getEmbedding(searchQuery, timeout.signal);
    const hits = await queryPoints(vector, {
      limit: fetchLimit,
      scoreThreshold,
      filter: {
        lawCode: args.law_code?.trim() || undefined,
        category: args.category?.trim() || undefined,
        isLatest,
      },
      signal: timeout.signal,
    });

    const chunks = hits.map(hitToResult);
    let results: ThaiLawResult[];
    if (groupByLaw) {
      const completed = await completeSectionFragments(chunks, {
        isLatest,
        signal: timeout.signal,
        preferMatra: wantedMatra,
      });
      results = preferQueryMatra(groupResultsByArticle(completed), searchQuery);
    } else {
      results = chunks;
    }
    if (config.rerankEnabled && results.length > 1) {
      try {
        results = await rerankResults(searchQuery, results, timeout.signal);
      } catch (error) {
        logMessage(mcpServer, "warning", "Rerank failed; using vector ranking", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (excluded.length > 0) {
      results = filterExcluded(
        results,
        excluded,
        (item) => [item.title, item.text, item.matra ?? "", item.law_code].join("\n"),
      ).slice(0, topK);
    }
    const output = responseFormat === "json"
      ? formatSearchJson(args.query, config.collectionName, results)
      : formatSearchText(args.query, results);

    searchCache.set("search_krisdika", cacheArgs, output);
    return output;
  } finally {
    timeout.cleanup();
  }
}

export async function performKrisdikaSearch(
  mcpServer: McpServer,
  args: SearchKrisdikaArgs,
  signal?: AbortSignal,
): Promise<string> {
  const source = resolveKrisdikaSource(args.source);
  const ocsArgs = krisdikaToOcsArgs(args);
  const responseFormat: ResponseFormat = args.response_format ?? "text";

  if (source === "online") {
    return performOcsSearch(mcpServer, ocsArgs, signal);
  }

  if (source === "both") {
    let qdrant: string;
    try {
      qdrant = await performQdrantKrisdikaSearch(mcpServer, args, signal);
    } catch (error) {
      qdrant = error instanceof Error ? error.message : String(error);
    }
    let online: string;
    try {
      online = await performOcsSearch(mcpServer, ocsArgs, signal);
    } catch (error) {
      online = error instanceof Error ? error.message : String(error);
    }
    return combineKrisdikaSources(args.query, qdrant, online, responseFormat);
  }

  const qdrant = await performQdrantKrisdikaSearch(mcpServer, args, signal);
  if (source !== "auto" || !isNoResultsText(qdrant, args.query)) {
    return qdrant;
  }

  try {
    const online = await performOcsSearch(mcpServer, ocsArgs, signal);
    if (isNoResultsText(online, args.query)) {
      return qdrant;
    }
    if (responseFormat === "json") {
      return combineKrisdikaSources(args.query, qdrant, online, responseFormat);
    }
    return [
      "ไม่พบในฐาน Qdrant จึงค้นจากเว็บกฤษฎีกา",
      "แหล่งออนไลน์: https://www.ocs.go.th/searchlaw-law",
      "",
      online,
    ].join("\n");
  } catch (error) {
    logMessage(mcpServer, "warning", "OCS fallback failed; returning Qdrant empty result", {
      error: error instanceof Error ? error.message : String(error),
    });
    return qdrant;
  }
}

export async function performKrisdikaCollectionInfo(
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
    const cached = searchCache.get("krisdika_collection_info", cacheArgs);
    if (cached) {
      return cached;
    }
  }

  const timeout = withTimeout(config.fetchTimeoutMs, signal);
  try {
    logMessage(mcpServer, "info", `Fetching collection info: ${config.collectionName}`);
    const info = await fetchCollectionInfo(timeout.signal);
    const output = formatCollectionInfo(info, config.embeddingModel, config.embeddingUrl, {
      rerankModel: config.rerankModel,
      rerankUrl: config.rerankUrl,
      rerankEnabled: config.rerankEnabled,
      embeddingDimensions: config.embeddingDimensions,
    });
    searchCache.set("krisdika_collection_info", cacheArgs, output);
    return output;
  } finally {
    timeout.cleanup();
  }
}

export function formatCollectionInfo(
  info: QdrantCollectionInfo,
  embeddingModel: string,
  embeddingUrl: string,
  extras?: {
    rerankModel?: string;
    rerankUrl?: string;
    rerankEnabled?: boolean;
    embeddingDimensions?: number;
  },
): string {
  return JSON.stringify({
    collection: info.name,
    status: info.status ?? "unknown",
    points_count: info.pointsCount ?? null,
    indexed_vectors_count: info.indexedVectorsCount ?? null,
    vector_size: info.vectorSize ?? extras?.embeddingDimensions ?? null,
    distance: info.distance ?? null,
    embedding_model: embeddingModel,
    embedding_url: embeddingUrl,
    embedding_dimensions: extras?.embeddingDimensions ?? null,
    rerank_model: extras?.rerankModel ?? null,
    rerank_url: extras?.rerankUrl ?? null,
    rerank_enabled: extras?.rerankEnabled ?? null,
  }, null, 2);
}
