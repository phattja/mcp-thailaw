import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  DEFAULT_DEKA_MAX_RESULTS,
  DEFAULT_DEKA_TOP_K,
  getThaiLawConfig,
  validateThaiLawConfig,
} from "./config.js";
import { createConfigurationError, createNetworkError, createNoResultsMessage, createServerError } from "./error-handler.js";
import { getFetch } from "./http-client.js";
import { logMessage } from "./logging.js";
import { searchCache } from "./search-cache.js";
import type { ResponseFormat, SearchDekaArgs } from "./types.js";
import { packageVersion } from "./version.js";

export const DEFAULT_DEKA_URL = "https://deka.supremecourt.or.th";
const SUMMARY_LIMIT = 700;

export interface DekaCase {
  case_no: string;
  docid: string;
  title: string;
  summary: string;
  laws: string[];
  url: string;
}

function dekaBaseUrl(): string {
  const raw = process.env.DEKA_URL?.trim() || DEFAULT_DEKA_URL;
  return raw.replace(/\/+$/, "");
}

export function dekaHomeUrl(): string {
  return `${dekaBaseUrl()}/`;
}

const DOC_TYPE_VALUES: Record<string, string> = {
  all: "",
  "": "",
  ทั้งหมด: "",
  judgment: "1",
  "1": "1",
  คำพิพากษา: "1",
  คำพิพากษาศาลฎีกา: "1",
  order: "2",
  "2": "2",
  คำสั่งคำร้อง: "2",
  decision: "3",
  "3": "3",
  คำวินิจฉัย: "3",
  sc_order: "6",
  "6": "6",
  คำสั่งศาลฎีกา: "6",
  decision_order: "7",
  "7": "7",
  "คำวินิจฉัย(คำสั่ง)": "7",
};

function resolveDocType(raw?: string): string {
  if (raw === undefined) {
    return "";
  }
  const key = raw.trim();
  if (key in DOC_TYPE_VALUES) {
    return DOC_TYPE_VALUES[key];
  }
  return key;
}

function resolveTextScope(raw?: string): "1" | "2" {
  const key = (raw ?? "short").trim().toLowerCase();
  if (key === "2" || key === "full" || key === "ฉบับเต็ม" || key === "long") {
    return "2";
  }
  return "1";
}

const ADVANCED_FIELDS: Array<keyof SearchDekaArgs> = [
  "litigant",
  "judge",
  "panel_judge",
  "law_name",
  "law_section",
  "law_paragraph",
  "law_subsection",
  "law_other",
  "black_no",
  "department",
  "remark",
];

export function resolveDekaMode(args: SearchDekaArgs): "basic" | "advanced" {
  if (args.mode === "advanced") {
    return "advanced";
  }
  if (args.mode === "basic") {
    return "basic";
  }
  return ADVANCED_FIELDS.some((key) => String(args[key] ?? "").trim() !== "")
    ? "advanced"
    : "basic";
}

function yearPair(args: SearchDekaArgs): { from: string; to: string } {
  const single = args.year !== undefined ? String(args.year).trim() : "";
  const from = args.year_from !== undefined ? String(args.year_from).trim() : single;
  const to = args.year_to !== undefined ? String(args.year_to).trim() : (args.year_from !== undefined ? "" : single);
  return { from, to: to || from };
}

function setIf(body: URLSearchParams, key: string, value?: string): void {
  const trimmed = value?.trim();
  if (trimmed) {
    body.set(key, trimmed);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit).trimEnd()}…`;
}

export function extractDekaLaws(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /ป\.[ก-๙A-Za-z.]+(?:\s*ม(?:าตรา|\.)\s*[๐-๙0-9]+(?:\s*\([^)]+\))?)?/g,
    /ประมวลกฎหมาย[^\s,;]+(?:\s*มาตรา\s*[๐-๙0-9]+(?:\s*\([^)]+\))?)?/g,
    /มาตรา\s*[๐-๙0-9]+(?:\s*\([^)]+\))?/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].replace(/\s+/g, " ").trim();
      if (!value || seen.has(value)) {
        continue;
      }
      seen.add(value);
      found.push(value);
      if (found.length >= 8) {
        return found;
      }
    }
  }
  return found;
}

export function parseDekaSearchHtml(html: string, baseUrl = DEFAULT_DEKA_URL): {
  total?: number;
  cases: DekaCase[];
} {
  const totalMatch = /พบ\s*(?:<span[^>]*>)?\s*([\d,]+)/.exec(html);
  const total = totalMatch ? Number(totalMatch[1].replace(/,/g, "")) : undefined;
  const cases: DekaCase[] = [];
  const blocks = html.split(/<li class="clear result">/i).slice(1);

  for (const block of blocks) {
    const caseMatch = /คำพิพากษาศาลฎีกาที่\s+([0-9]+\/[0-9]+)/.exec(block);
    if (!caseMatch) {
      continue;
    }
    const caseNo = caseMatch[1];
    const idMatch = /short_text_docid_(\d+)/.exec(block)
      ?? /id="(?:btn_print_|text_bookmark_name_)(\d+)"/.exec(block)
      ?? /class="[^"]*deka-result[^"]*"[^>]*value="(\d+)"/.exec(block);
    const docid = idMatch?.[1] ?? "";
    const shortMatch = new RegExp(
      `<li[^>]*id="short_text_docid_${docid || "\\d+"}"[^>]*>([\\s\\S]*?)</li>`,
      "i",
    ).exec(block);
    const summary = truncate(stripHtml(shortMatch?.[1] ?? ""), SUMMARY_LIMIT);
    const title = `คำพิพากษาศาลฎีกาที่ ${caseNo}`;
    cases.push({
      case_no: caseNo,
      docid,
      title,
      summary,
      laws: extractDekaLaws(summary),
      url: `${baseUrl.replace(/\/+$/, "")}/`,
    });
  }

  return { total: Number.isFinite(total) ? total : undefined, cases };
}

export function buildSearchBody(args: SearchDekaArgs): URLSearchParams {
  const mode = resolveDekaMode(args);
  const query = args.query?.trim() ?? "";
  const years = yearPair(args);
  const caseNoRaw = args.case_no?.trim() ?? "";
  const caseParts = caseNoRaw.split("/");
  const caseNumber = caseParts[0] ?? "";
  const caseYear = caseParts[1] ?? "";
  const body = new URLSearchParams();
  body.set("start", "true");

  if (mode === "advanced") {
    body.set("search_form_type", "adv");
    body.set("adv_search_doctype", resolveDocType(args.doc_type));
    setIf(body, "adv_search_word_stext_and_ltext", query);
    setIf(body, "adv_search_deka_start_year", years.from || caseYear);
    setIf(body, "adv_search_deka_end_year", years.to || caseYear);
    setIf(body, "adv_search_litigant", args.litigant);
    setIf(body, "adv_search_judge", args.judge);
    setIf(body, "adv_search_in_judge", args.panel_judge);
    setIf(body, "adv_search_law_name", args.law_name);
    setIf(body, "adv_search_law_section", args.law_section);
    setIf(body, "adv_search_law_paragraph", args.law_paragraph);
    setIf(body, "adv_search_law_subsection", args.law_subsection);
    setIf(body, "adv_search_law_other", args.law_other);
    body.set("law_condition", (args.law_condition ?? "AND").toString().toUpperCase() === "OR" ? "OR" : "AND");
    setIf(body, "adv_search_black_no_of_scourt", args.black_no);
    setIf(body, "adv_search_deka_key", args.case_prefix);
    setIf(body, "adv_search_deka_no", caseNumber || caseNoRaw);
    setIf(body, "adv_search_department", args.department);
    setIf(body, "adv_search_remark", args.remark);
    return body;
  }

  body.set("search_form_type", "basic");
  body.set("search_doctype", resolveDocType(args.doc_type));
  body.set("search_type", resolveTextScope(args.text_scope));
  setIf(body, "search_word", query);
  setIf(body, "search_deka_no_ref", args.case_prefix);
  setIf(body, "search_deka_no", caseNumber || caseNoRaw);
  const startYear = years.from || (!args.year_from && !args.year && !args.year_to ? caseYear : "");
  const endYear = years.to || startYear;
  setIf(body, "search_deka_start_year", startYear);
  setIf(body, "search_deka_end_year", endYear);
  return body;
}

export function formatDekaText(query: string, total: number | undefined, cases: DekaCase[]): string {
  if (cases.length === 0) {
    return createNoResultsMessage(query);
  }

  const header = total !== undefined
    ? `พบ ${total.toLocaleString("en-US")} คดีจากศาลฎีกา แสดง ${cases.length} รายการแรกสำหรับ "${query}"`
    : `ผลค้นหาศาลฎีกาสำหรับ "${query}" (${cases.length} รายการ)`;

  const blocks = cases.map((item, index) => {
    const lines = [
      `[${index + 1}] ${item.title}`,
      `ลิงก์: ${item.url}`,
    ];
    if (item.laws.length > 0) {
      lines.push(`กฎหมายที่อ้าง: ${item.laws.join(", ")}`);
    }
    lines.push("", "ย่อสั้น:", item.summary || "(ไม่มีย่อสั้น)", "-".repeat(60));
    return lines.join("\n");
  });

  return [header, "", ...blocks].join("\n");
}

export function formatDekaJson(query: string, total: number | undefined, cases: DekaCase[]): string {
  return JSON.stringify({
    query,
    source: "deka.supremecourt.or.th",
    total,
    results: cases,
  }, null, 2);
}

export async function searchDekaCases(
  args: SearchDekaArgs,
  signal?: AbortSignal,
): Promise<{ total?: number; cases: DekaCase[] }> {
  const baseUrl = dekaBaseUrl();
  const url = `${baseUrl}/search`;
  const body = buildSearchBody(args);

  let response: Response;
  try {
    response = await getFetch()(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "text/html",
        Origin: baseUrl,
        Referer: dekaHomeUrl(),
        "User-Agent": `mcp-thailaw/${packageVersion} (+https://github.com/phattja/mcp-thailaw)`,
      },
      body,
      signal,
    });
  } catch (error) {
    throw createNetworkError(error, { url, target: "Supreme Court Deka search" });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw createServerError(response.status, response.statusText, text, {
      url,
      target: "Supreme Court Deka search",
    });
  }

  const html = await response.text();
  return parseDekaSearchHtml(html, baseUrl);
}

export function parseDekaCatalogCount(html: string): number | undefined {
  const allMatch = /ทั้งหมด\s*([\d,]+)\s*รายการ/.exec(html);
  if (allMatch) {
    const value = Number(allMatch[1].replace(/,/g, ""));
    return Number.isFinite(value) ? value : undefined;
  }
  const foundMatch = /พบ\s*(?:<span[^>]*>)?\s*([\d,]+)/.exec(html);
  if (!foundMatch) {
    return undefined;
  }
  const value = Number(foundMatch[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

export async function performDekaConnectionInfo(
  mcpServer: McpServer,
  refresh = false,
  signal?: AbortSignal,
): Promise<string> {
  const cacheArgs = { source: "deka" };
  if (!refresh) {
    const cached = searchCache.get("deka_connection_info", cacheArgs);
    if (cached) {
      return cached;
    }
  }

  const config = getThaiLawConfig();
  const homeUrl = dekaHomeUrl();
  logMessage(mcpServer, "info", `Checking Deka connection: ${homeUrl}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.fetchTimeoutMs);
  timer.unref();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const started = Date.now();

  try {
    const response = await getFetch()(homeUrl, {
      method: "GET",
      headers: {
        Accept: "text/html",
        "User-Agent": `mcp-thailaw/${packageVersion} (+https://github.com/phattja/mcp-thailaw)`,
      },
      signal: controller.signal,
    });
    const html = await response.text().catch(() => "");
    const output = JSON.stringify({
      source: "deka.supremecourt.or.th",
      search_url: homeUrl,
      reachable: response.ok,
      http_status: response.status,
      latency_ms: Date.now() - started,
      catalog_count: parseDekaCatalogCount(html) ?? null,
    }, null, 2);
    searchCache.set("deka_connection_info", cacheArgs, output);
    return output;
  } catch (error) {
    const network = createNetworkError(error, {
      url: homeUrl,
      target: "Supreme Court Deka search",
    });
    const output = JSON.stringify({
      source: "deka.supremecourt.or.th",
      search_url: homeUrl,
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

export async function performDekaSearch(
  mcpServer: McpServer,
  args: SearchDekaArgs,
  signal?: AbortSignal,
): Promise<string> {
  const configIssue = validateThaiLawConfig();
  if (configIssue) {
    throw createConfigurationError(configIssue);
  }

  const config = getThaiLawConfig();
  const topK = Math.min(args.top_k ?? DEFAULT_DEKA_TOP_K, DEFAULT_DEKA_MAX_RESULTS);
  const responseFormat: ResponseFormat = args.response_format ?? "text";
  const cacheArgs = {
    query: args.query ?? "",
    top_k: topK,
    mode: resolveDekaMode(args),
    doc_type: args.doc_type ?? "",
    text_scope: args.text_scope ?? "short",
    year: args.year ?? "",
    year_from: args.year_from ?? "",
    year_to: args.year_to ?? "",
    case_no: args.case_no ?? "",
    case_prefix: args.case_prefix ?? "",
    litigant: args.litigant ?? "",
    judge: args.judge ?? "",
    panel_judge: args.panel_judge ?? "",
    law_name: args.law_name ?? "",
    law_section: args.law_section ?? "",
    black_no: args.black_no ?? "",
    response_format: responseFormat,
  };

  const cached = searchCache.get("search_deka", cacheArgs);
  if (cached) {
    logMessage(mcpServer, "debug", "Returning cached Deka search result");
    return cached;
  }

  const label = args.query?.trim() || args.case_no?.trim() || "ฎีกา";
  logMessage(mcpServer, "info", `Searching Supreme Court Deka: ${label}`, {
    topK,
    year: args.year,
    case_no: args.case_no,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.fetchTimeoutMs);
  timer.unref();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const { total, cases } = await searchDekaCases(args, controller.signal);
    const limited = cases.slice(0, topK);
    const output = responseFormat === "json"
      ? formatDekaJson(label, total, limited)
      : formatDekaText(label, total, limited);
    searchCache.set("search_deka", cacheArgs, output);
    return output;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
