import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Agent, fetch as undiciFetch } from "undici";
import {
  DEFAULT_OCS_MAX_RESULTS,
  DEFAULT_OCS_SECTIONS_PER_LAW,
  DEFAULT_OCS_TOP_K,
  getThaiLawConfig,
} from "./config.js";
import { htmlToReadableText } from "./deka.js";
import { filterExcluded, parseExcludeWords, textHasExcludedWord } from "./exclude.js";
import { createNetworkError, createNoResultsMessage, createServerError } from "./error-handler.js";
import { getFetch } from "./http-client.js";
import { logMessage } from "./logging.js";
import { searchCache } from "./search-cache.js";
import {
  extractQueryMatra,
  formatMatraThai,
  normalizeMatraKey,
  rewriteQueryMatraToThai,
} from "./statute.js";
import type { ResponseFormat, SearchKrisdikaArgs, SearchOcsArgs } from "./types.js";
import { packageVersion } from "./version.js";

export const DEFAULT_OCS_URL = "https://www.ocs.go.th";
export const DEFAULT_OCS_DOC_BASE = "https://searchlaw.ocs.go.th/council-of-state/#/public/doc";
export const DEFAULT_OCS_DOC_API = "https://searchlaw.ocs.go.th/ocs-api";

export interface OcsSection {
  section_id?: string;
  section_no?: string;
  label: string;
  text: string;
  type_id?: string;
}

export interface OcsLaw {
  law_code: string;
  title: string;
  snippet: string;
  publish_date: string;
  year?: number;
  state: string;
  url: string;
  pdf_url?: string;
  timeline_id?: string;
  timeline_code?: string;
  sections?: OcsSection[];
}

const CATEGORY_VALUES: Record<string, string> = {
  all: "",
  "": "",
  ทั้งหมด: "",
  constitution: "10",
  "10": "10",
  รัฐธรรมนูญ: "10",
  organic: "1A",
  "1a": "1A",
  "1A": "1A",
  พระราชบัญญัติประกอบรัฐธรรมนูญ: "1A",
  act: "1B",
  "1b": "1B",
  "1B": "1B",
  พระราชบัญญัติ: "1B",
  emergency: "1C",
  "1c": "1C",
  "1C": "1C",
  พระราชกำหนด: "1C",
  code: "1D",
  "1d": "1D",
  "1D": "1D",
  ประมวลกฎหมาย: "1D",
  decree: "2A",
  "2a": "2A",
  "2A": "2A",
  พระราชกฤษฎีกา: "2A",
  ministerial: "2B",
  "2b": "2B",
  "2B": "2B",
  กฎกระทรวง: "2B",
};

const STATE_VALUES: Record<string, string> = {
  current: "01",
  latest: "01",
  "01": "01",
  กฎหมายฉบับปัจจุบัน: "01",
  pending: "02",
  "02": "02",
  กฎหมายรอมีผลบังคับใช้: "02",
  repealed: "00",
  "00": "00",
  กฎหมายที่เลิกใช้บังคับ: "00",
};

const VALID_SOURCES = ["qdrant", "online", "both", "auto"] as const;

export type KrisdikaSource = (typeof VALID_SOURCES)[number];

export function resolveKrisdikaSource(raw?: string): KrisdikaSource {
  const key = (raw ?? "qdrant").trim().toLowerCase();
  if (key === "online" || key === "ocs" || key === "web" || key === "ออนไลน์") {
    return "online";
  }
  if (key === "both" || key === "all" || key === "ทั้งคู่" || key === "ทั้งสอง") {
    return "both";
  }
  if (key === "auto" || key === "fallback" || key === "อัตโนมัติ") {
    return "auto";
  }
  return "qdrant";
}

export function isNoResultsText(text: string, query: string): boolean {
  return text.trim() === createNoResultsMessage(query);
}

export function ocsTopK(requested?: number): number {
  return Math.min(requested ?? DEFAULT_OCS_TOP_K, DEFAULT_OCS_MAX_RESULTS);
}

export function ocsBaseUrl(): string {
  const raw = process.env.OCS_URL?.trim() || DEFAULT_OCS_URL;
  return raw.replace(/\/+$/, "");
}

export function ocsSearchPageUrl(): string {
  return `${ocsBaseUrl()}/searchlaw-law`;
}

export function ocsTableUrl(): string {
  return `${ocsBaseUrl()}/searchlaw/indexs/list_table_search`;
}

export function ocsDocumentUrl(encTimelineId: string): string {
  return `${DEFAULT_OCS_DOC_BASE}/${encTimelineId}`;
}

export function ocsDocApiUrl(): string {
  const raw = process.env.OCS_DOC_API?.trim() || DEFAULT_OCS_DOC_API;
  return raw.replace(/\/+$/, "");
}

export function resolveOcsDetail(raw?: string): "list" | "sections" {
  const key = (raw ?? "sections").trim().toLowerCase();
  if (key === "list" || key === "summary" || key === "รายการ" || key === "ชื่อ") {
    return "list";
  }
  return "sections";
}

function flag01(value: boolean | undefined, fallback: boolean): "0" | "1" {
  return (value ?? fallback) ? "1" : "0";
}

export function resolveOcsCategory(raw?: string): string {
  if (raw === undefined) {
    return "";
  }
  const parts = raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return "";
  }
  return parts.map((part) => CATEGORY_VALUES[part] ?? CATEGORY_VALUES[part.toLowerCase()] ?? part).join(",");
}

export function resolveOcsState(raw?: string, isLatest = true): string {
  if (raw !== undefined && raw.trim() !== "") {
    const parts = raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
    return parts.map((part) => STATE_VALUES[part] ?? STATE_VALUES[part.toLowerCase()] ?? part).join(",");
  }
  return isLatest ? "01,02" : "01,02,00";
}

export function krisdikaToOcsArgs(args: SearchKrisdikaArgs): SearchOcsArgs {
  return {
    query: args.query,
    top_k: args.top_k,
    topic: true,
    content: true,
    category: args.category ?? args.law_code,
    exclude: args.exclude,
    response_format: args.response_format,
  };
}

export function buildOcsSearchBody(args: SearchOcsArgs, topK = ocsTopK(args.top_k)): URLSearchParams {
  let topic = flag01(args.topic, true);
  let content = flag01(args.content, true);
  const sublaw = flag01(args.sublaw, false);
  if (topic === "0" && content === "0") {
    topic = "1";
    content = "1";
  }

  const body = new URLSearchParams();
  body.set("query[letter]", args.letter?.trim() ?? "");
  body.set("query[tab_type]", "law");
  body.set("query[type_view]", "law");
  body.set("query[q]", args.query.trim());
  body.set("query[sort]", "date-desc");
  body.set("query[topic]", topic);
  body.set("query[content]", content);
  body.set("query[sublaw]", sublaw);
  body.set("query[lawCategoryName]", resolveOcsCategory(args.category));
  body.set("query[stateName]", resolveOcsState(args.state));
  body.set("query[year]", args.year !== undefined ? String(args.year).trim() : "");
  body.set("query[acting]", args.acting?.trim() ?? "");
  body.set("query[fNumber]", "");
  body.set("query[param1]", args.subject?.trim() ?? "");
  body.set("pagination[page]", "1");
  body.set("pagination[perpage]", String(topK));
  return body;
}

export function stripOcsSnippet(html: string): string {
  return htmlToReadableText(html.replace(/<\/?mark>/gi, "")).replace(/\s+/g, " ").trim();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

export function parseOcsSearchPayload(payload: unknown): { total?: number; laws: OcsLaw[] } {
  const root = asRecord(payload);
  const meta = asRecord(root?.meta);
  const totalRaw = meta?.total;
  const total = typeof totalRaw === "number"
    ? totalRaw
    : typeof totalRaw === "string"
      ? Number(totalRaw.replace(/,/g, ""))
      : undefined;
  const rows = Array.isArray(root?.data) ? root.data : [];
  const laws: OcsLaw[] = [];

  for (const row of rows) {
    const item = asRecord(row);
    if (!item) {
      continue;
    }
    const title = asString(item.lawNameTh).trim();
    const lawCode = asString(item.lawCode).trim();
    if (!title && !lawCode) {
      continue;
    }
    const encTimelineId = asString(item.encTimelineID).trim();
    const yearRaw = item.year;
    const year = typeof yearRaw === "number" && Number.isFinite(yearRaw) ? yearRaw : undefined;
    const pdfUrl = asString(item.fileUUID).trim();
    laws.push({
      law_code: lawCode,
      title: title || lawCode,
      snippet: stripOcsSnippet(asString(item.contentlaw)),
      publish_date: asString(item.publishDate),
      year,
      state: asString(item.state),
      timeline_id: encTimelineId || undefined,
      url: encTimelineId ? ocsDocumentUrl(encTimelineId) : ocsSearchPageUrl(),
      pdf_url: pdfUrl || undefined,
    });
  }

  return {
    total: total !== undefined && Number.isFinite(total) ? total : undefined,
    laws,
  };
}

export function formatOcsText(query: string, laws: OcsLaw[], total?: number): string {
  if (laws.length === 0) {
    return createNoResultsMessage(query);
  }
  const header = total !== undefined
    ? `พบ ${total.toLocaleString("en-US")} ฉบับจากเว็บกฤษฎีกา แสดง ${laws.length} รายการ`
    : `ผลค้นหาเว็บกฤษฎีกา ${laws.length} รายการ`;
  const blocks = laws.map((item, index) => {
    const lines = [
      `[${index + 1}] ชื่อกฎหมาย: ${item.title}`,
      `รหัส: ${item.law_code || "-"}`,
      `วันที่ประกาศ: ${item.publish_date || "-"}`,
      `ลิงก์: ${item.url}`,
    ];
    if (item.timeline_code) {
      lines.push(`ฉบับ: ${item.timeline_code} (ล่าสุด)`);
    }
    if (item.sections && item.sections.length > 0) {
      lines.push("", "มาตราล่าสุด:");
      for (const section of item.sections) {
        lines.push("", section.label || "มาตรา", section.text);
      }
    } else {
      lines.push("", "ข้อความที่พบ:", item.snippet || "-");
    }
    lines.push("-".repeat(60));
    return lines.join("\n");
  });
  return [header, `แหล่ง: ${ocsSearchPageUrl()}`, "", ...blocks].join("\n");
}

export function formatOcsJson(query: string, laws: OcsLaw[], total?: number): string {
  return JSON.stringify({
    query,
    source: "ocs.go.th",
    url: ocsSearchPageUrl(),
    total: total ?? null,
    results: laws.map((item) => ({
      law_code: item.law_code,
      title: item.title,
      snippet: item.snippet,
      publish_date: item.publish_date,
      year: item.year ?? null,
      state: item.state,
      timeline_id: item.timeline_id ?? null,
      timeline_code: item.timeline_code ?? null,
      url: item.url,
      pdf_url: item.pdf_url ?? null,
      sections: item.sections ?? [],
    })),
  }, null, 2);
}

export function parseOcsLawDoc(payload: unknown): {
  timeline_code?: string;
  sections: OcsSection[];
} {
  const root = asRecord(payload);
  const header = asRecord(root?.respHeader);
  const errorCode = asString(header?.errorCode);
  if (errorCode && errorCode !== "SUCCESS") {
    return { sections: [] };
  }
  const body = asRecord(root?.respBody) ?? root;
  const info = asRecord(body?.lawInfo);
  const rows = Array.isArray(body?.lawSections) ? body.lawSections : [];
  const sections: OcsSection[] = [];
  for (const row of rows) {
    const item = asRecord(row);
    if (!item) {
      continue;
    }
    const text = stripOcsSnippet(asString(item.sectionContent));
    if (!text) {
      continue;
    }
    const sectionNo = asString(item.sectionNo).trim();
    const label = asString(item.sectionLabel).trim()
      || (sectionNo ? `มาตรา ${formatMatraThai(sectionNo)}` : asString(item.sectionName).trim());
    sections.push({
      section_id: asString(item.sectionId) || undefined,
      section_no: sectionNo || undefined,
      label: label || "มาตรา",
      text,
      type_id: asString(item.sectionTypeId) || undefined,
    });
  }
  return {
    timeline_code: asString(info?.timelineLawCode) || undefined,
    sections,
  };
}

export function selectOcsSections(
  sections: OcsSection[],
  query: string,
  limit = DEFAULT_OCS_SECTIONS_PER_LAW,
): OcsSection[] {
  const rewritten = rewriteQueryMatraToThai(query);
  const wanted = extractQueryMatra(rewritten);
  const wantedKey = wanted ? normalizeMatraKey(wanted) : "";
  const needle = rewritten.replace(/\s+/g, "");

  const ranked = sections.map((section, index) => {
    let score = 0;
    if (section.type_id === "4") {
      score += 8;
    }
    if (section.type_id === "16") {
      score -= 40;
    }
    const noKey = section.section_no ? normalizeMatraKey(section.section_no) : "";
    if (wantedKey && noKey && noKey === wantedKey) {
      score += 100;
    }
    const compact = section.text.replace(/\s+/g, "");
    if (needle && compact.includes(needle)) {
      score += 40;
    }
    return { section, score, index };
  }).filter((item) => item.score >= 40);

  ranked.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.index - right.index;
  });

  const seen = new Set<string>();
  const selected: OcsSection[] = [];
  for (const item of ranked) {
    const key = item.section.section_id || `${item.section.label}:${item.section.text.slice(0, 40)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    selected.push(item.section);
    if (selected.length >= limit) {
      break;
    }
  }
  return selected;
}

export function buildOcsApiRequest(serviceName: string, reqBody: Record<string, unknown>): string {
  const now = new Date();
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  const reqDtm = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
    + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
  return JSON.stringify({
    reqHeader: {
      reqId: String(now.getTime()),
      reqChannel: "WEB",
      reqDtm,
      reqBy: "unknow",
      serviceName,
      uuid: "mcp-thailaw",
      sessionId: "mcp-thailaw",
    },
    reqBody,
  });
}

export async function fetchOcsLawDoc(
  timelineId: string,
  signal?: AbortSignal,
): Promise<{ timeline_code?: string; sections: OcsSection[] }> {
  const url = `${ocsDocApiUrl()}/public/doc/getLawDoc`;
  const body = buildOcsApiRequest("getPublicLawDoc", { timelineId });
  let response: Response;
  try {
    response = await ocsFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        Accept: "application/json, text/plain, */*",
        Origin: "https://searchlaw.ocs.go.th",
        Referer: "https://searchlaw.ocs.go.th/council-of-state/",
        "User-Agent": `mcp-thailaw/${packageVersion} (+https://github.com/phattja/mcp-thailaw)`,
      },
      body,
      signal,
    });
  } catch (error) {
    throw createNetworkError(error, { url, target: "OCS กฤษฎีกา document" });
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw createServerError(response.status, response.statusText, text, {
      url,
      target: "OCS กฤษฎีกา document",
    });
  }
  const rawText = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawText);
  } catch {
    throw createServerError(response.status, "Invalid JSON", rawText, {
      url,
      target: "OCS กฤษฎีกา document",
    });
  }
  return parseOcsLawDoc(payload);
}

export function applyOcsExclude(
  laws: OcsLaw[],
  words: string[],
  detail: "list" | "sections",
): OcsLaw[] {
  if (words.length === 0) {
    return laws;
  }
  const kept: OcsLaw[] = [];
  for (const law of laws) {
    if (detail === "sections" && law.sections && law.sections.length > 0) {
      const sections = filterExcluded(
        law.sections,
        words,
        (section) => `${section.label}\n${section.text}`,
      );
      if (sections.length === 0) {
        continue;
      }
      kept.push({ ...law, sections });
      continue;
    }
    const haystack = [law.title, law.snippet, law.law_code].join("\n");
    if (!textHasExcludedWord(haystack, words)) {
      kept.push(law);
    }
  }
  return kept;
}

export async function enrichOcsLawsWithSections(
  laws: OcsLaw[],
  query: string,
  signal?: AbortSignal,
): Promise<OcsLaw[]> {
  return Promise.all(laws.map(async (law) => {
    if (!law.timeline_id) {
      return law;
    }
    try {
      const doc = await fetchOcsLawDoc(law.timeline_id, signal);
      return {
        ...law,
        timeline_code: doc.timeline_code,
        sections: selectOcsSections(doc.sections, query),
      };
    } catch {
      return law;
    }
  }));
}

function isTlsError(error: unknown): boolean {
  const codes: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current === "object" && current !== null) {
      const record = current as { code?: unknown; cause?: unknown; message?: unknown };
      if (typeof record.code === "string") {
        codes.push(record.code);
      }
      if (typeof record.message === "string" && /certificate|UNABLE_TO_VERIFY|CERT_/i.test(record.message)) {
        return true;
      }
      current = record.cause;
    } else {
      break;
    }
  }
  return codes.some((code) => /UNABLE_TO_VERIFY|CERT_|ERR_TLS/i.test(code));
}

let insecureAgent: Agent | undefined;

function getInsecureAgent(): Agent {
  insecureAgent ??= new Agent({ connect: { rejectUnauthorized: false } });
  return insecureAgent;
}

async function ocsFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await getFetch()(url, init);
  } catch (error) {
    if (!isTlsError(error)) {
      throw error;
    }
    return await undiciFetch(url, {
      method: init.method,
      headers: init.headers as Record<string, string> | undefined,
      body: init.body as string | URLSearchParams | undefined,
      signal: init.signal ?? undefined,
      dispatcher: getInsecureAgent(),
    }) as unknown as Response;
  }
}

export async function searchOcsLaws(
  args: SearchOcsArgs,
  signal?: AbortSignal,
): Promise<{ total?: number; laws: OcsLaw[] }> {
  const topK = ocsTopK(args.top_k);
  const url = ocsTableUrl();
  const body = buildOcsSearchBody(args, topK);
  const base = ocsBaseUrl();

  let response: Response;
  try {
    response = await ocsFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json, text/javascript, */*; q=0.01",
        Origin: base,
        Referer: ocsSearchPageUrl(),
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": `mcp-thailaw/${packageVersion} (+https://github.com/phattja/mcp-thailaw)`,
      },
      body,
      signal,
    });
  } catch (error) {
    throw createNetworkError(error, { url, target: "OCS กฤษฎีกา search" });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw createServerError(response.status, response.statusText, text, {
      url,
      target: "OCS กฤษฎีกา search",
    });
  }

  const rawText = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawText);
  } catch {
    throw createServerError(response.status, "Invalid JSON", rawText, {
      url,
      target: "OCS กฤษฎีกา search",
    });
  }

  const parsed = parseOcsSearchPayload(payload);
  return {
    total: parsed.total,
    laws: parsed.laws.slice(0, topK),
  };
}

function ocsHeaders(accept: string): Record<string, string> {
  return {
    Accept: accept,
    "User-Agent": `mcp-thailaw/${packageVersion} (+https://github.com/phattja/mcp-thailaw)`,
  };
}

export async function performOcsConnectionInfo(
  mcpServer: McpServer,
  refresh = false,
  signal?: AbortSignal,
): Promise<string> {
  const cacheArgs = { source: "ocs" };
  if (!refresh) {
    const cached = searchCache.get("krisdeka_connection_info", cacheArgs);
    if (cached) {
      return cached;
    }
  }

  const config = getThaiLawConfig();
  const searchUrl = ocsSearchPageUrl();
  logMessage(mcpServer, "info", `Checking OCS กฤษฎีกา connection: ${searchUrl}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.fetchTimeoutMs);
  timer.unref();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const started = Date.now();

  try {
    const response = await ocsFetch(searchUrl, {
      method: "GET",
      headers: ocsHeaders("text/html"),
      signal: controller.signal,
    });
    await response.text().catch(() => "");

    let catalogCount: number | null = null;
    try {
      const ping = await searchOcsLaws({ query: "", top_k: 1 }, controller.signal);
      catalogCount = ping.total ?? null;
    } catch {
      catalogCount = null;
    }

    const output = JSON.stringify({
      source: "ocs.go.th",
      search_url: searchUrl,
      table_url: ocsTableUrl(),
      reachable: response.ok,
      http_status: response.status,
      latency_ms: Date.now() - started,
      catalog_count: catalogCount,
    }, null, 2);
    searchCache.set("krisdeka_connection_info", cacheArgs, output);
    return output;
  } catch (error) {
    const network = createNetworkError(error, {
      url: searchUrl,
      target: "OCS กฤษฎีกา search",
    });
    const output = JSON.stringify({
      source: "ocs.go.th",
      search_url: searchUrl,
      table_url: ocsTableUrl(),
      reachable: false,
      http_status: null,
      latency_ms: Date.now() - started,
      catalog_count: null,
      error: network.message,
    }, null, 2);
    return output;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function performOcsSearch(
  mcpServer: McpServer,
  args: SearchOcsArgs,
  signal?: AbortSignal,
): Promise<string> {
  const config = getThaiLawConfig();
  const responseFormat: ResponseFormat = args.response_format ?? "text";
  const topK = ocsTopK(args.top_k);
  const detail = resolveOcsDetail(args.detail);
  const excluded = parseExcludeWords(args.exclude);
  const cacheArgs = {
    query: args.query,
    top_k: topK,
    topic: args.topic ?? true,
    content: args.content ?? true,
    sublaw: args.sublaw ?? false,
    category: args.category ?? "",
    state: args.state ?? "",
    year: args.year ?? "",
    acting: args.acting ?? "",
    subject: args.subject ?? "",
    letter: args.letter ?? "",
    detail,
    exclude: args.exclude ?? "",
    response_format: responseFormat,
  };

  const cached = searchCache.get("search_krisdika_online", cacheArgs);
  if (cached) {
    logMessage(mcpServer, "debug", "Returning cached OCS กฤษฎีกา search result");
    return cached;
  }

  logMessage(mcpServer, "info", `Searching OCS กฤษฎีกา: ${args.query}`, {
    topK,
    category: args.category,
    url: ocsSearchPageUrl(),
  });

  const controller = new AbortController();
  const timeoutMs = detail === "sections"
    ? Math.max(config.fetchTimeoutMs, 90000)
    : config.fetchTimeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const fetchArgs = excluded.length > 0
      ? { ...args, top_k: Math.min(DEFAULT_OCS_MAX_RESULTS, Math.max(topK * 4, 10)) }
      : args;
    let { total, laws } = await searchOcsLaws(fetchArgs, controller.signal);
    if (detail === "sections") {
      laws = await enrichOcsLawsWithSections(laws, args.query, controller.signal);
    }
    if (excluded.length > 0) {
      laws = applyOcsExclude(laws, excluded, detail).slice(0, topK);
    }
    const output = responseFormat === "json"
      ? formatOcsJson(args.query, laws, total)
      : formatOcsText(args.query, laws, total);
    searchCache.set("search_krisdika_online", cacheArgs, output);
    return output;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function combineKrisdikaSources(
  query: string,
  qdrant: string,
  online: string,
  responseFormat: ResponseFormat,
): string {
  if (responseFormat === "json") {
    let qdrantJson: unknown = qdrant;
    let onlineJson: unknown = online;
    try {
      qdrantJson = JSON.parse(qdrant);
    } catch {
      qdrantJson = { text: qdrant };
    }
    try {
      onlineJson = JSON.parse(online);
    } catch {
      onlineJson = { text: online };
    }
    return JSON.stringify({
      query,
      sources: {
        qdrant: qdrantJson,
        online: onlineJson,
      },
    }, null, 2);
  }

  return [
    "=== กฤษฎีกา (Qdrant) ===",
    qdrant,
    "",
    `=== กฤษฎีกา (ออนไลน์ ${ocsSearchPageUrl()}) ===`,
    online,
  ].join("\n");
}
