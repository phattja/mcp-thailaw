import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DEFAULT_MAX_RESULTS, DEFAULT_SCORE_THRESHOLD, DEFAULT_TOP_K } from "./config.js";

export type ResponseFormat = "text" | "json";

export interface SearchThaiLawArgs {
  query: string;
  top_k?: number;
  score_threshold?: number;
  law_code?: string;
  category?: string;
  is_latest?: boolean;
  group_by_law?: boolean;
  response_format?: ResponseFormat;
}

export interface CollectionInfoArgs {
  refresh?: boolean;
}

const VALID_RESPONSE_FORMATS: readonly ResponseFormat[] = ["text", "json"];

export function isSearchThaiLawArgs(args: unknown): args is SearchThaiLawArgs {
  if (
    typeof args !== "object"
    || args === null
    || !("query" in args)
    || typeof (args as { query: unknown }).query !== "string"
    || (args as { query: string }).query.trim() === ""
  ) {
    return false;
  }

  const searchArgs = args as Record<string, unknown>;

  if (
    searchArgs.top_k !== undefined
    && (
      typeof searchArgs.top_k !== "number"
      || !Number.isInteger(searchArgs.top_k)
      || searchArgs.top_k < 1
      || searchArgs.top_k > DEFAULT_MAX_RESULTS
    )
  ) {
    return false;
  }

  if (
    searchArgs.score_threshold !== undefined
    && (
      typeof searchArgs.score_threshold !== "number"
      || Number.isNaN(searchArgs.score_threshold)
      || searchArgs.score_threshold < 0
      || searchArgs.score_threshold > 1
    )
  ) {
    return false;
  }

  if (searchArgs.law_code !== undefined && typeof searchArgs.law_code !== "string") {
    return false;
  }

  if (searchArgs.category !== undefined && typeof searchArgs.category !== "string") {
    return false;
  }

  if (searchArgs.is_latest !== undefined && typeof searchArgs.is_latest !== "boolean") {
    return false;
  }

  if (searchArgs.group_by_law !== undefined && typeof searchArgs.group_by_law !== "boolean") {
    return false;
  }

  if (
    searchArgs.response_format !== undefined
    && (
      typeof searchArgs.response_format !== "string"
      || !VALID_RESPONSE_FORMATS.includes(searchArgs.response_format as ResponseFormat)
    )
  ) {
    return false;
  }

  return true;
}

export function isCollectionInfoArgs(args: unknown): args is CollectionInfoArgs {
  if (args === undefined || args === null) {
    return true;
  }
  if (typeof args !== "object") {
    return false;
  }
  const infoArgs = args as Record<string, unknown>;
  if (infoArgs.refresh !== undefined && typeof infoArgs.refresh !== "boolean") {
    return false;
  }
  return true;
}

export const SEARCH_THAI_LAW_TOOL: Tool = {
  name: "search_thai_law",
  description:
    "ค้นหากฎหมายไทยจากฐานข้อมูล OCS Krisdika (สำนักงานคณะกรรมการกฤษฎีกา) ด้วย semantic search. "
    + "ค่าเริ่มต้นคืนเฉพาะฉบับล่าสุดที่มีผลบังคับใช้ (is_latest=true) "
    + "และรวมชิ้นส่วนของมาตราเดียวกันแล้วจัดรูปแบบเหมือนราชกิจจานุเบกษา (group_by_law=true). "
    + "ใช้สำหรับค้นหาบทบัญญัติ มาตรา หรือเนื้อหาที่เกี่ยวข้องกับกฎหมายไทย.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "คำค้นหา เช่น ลักทรัพย์, สัญญาจ้าง, มาตรา ๓๓๕. ถ้าใส่เลขมาตราเป็น 335 ระบบแปลงเป็นตัวไทย ๓๓๕ และคืนเฉพาะมาตรานั้น",
      },
      top_k: {
        type: "integer",
        minimum: 1,
        maximum: DEFAULT_MAX_RESULTS,
        description: `จำนวนชิ้นส่วนสูงสุดก่อนรวมเป็นมาตรา (ค่าเริ่มต้น ${DEFAULT_TOP_K})`,
      },
      score_threshold: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: `คะแนนความเกี่ยวข้องขั้นต่ำ 0.0-1.0 (ค่าเริ่มต้น ${DEFAULT_SCORE_THRESHOLD})`,
      },
      law_code: {
        type: "string",
        description: "กรองด้วยรหัสกลุ่มกฎหมาย",
      },
      category: {
        type: "string",
        description: "กรองด้วยประเภทกฎหมาย เช่น 1B",
      },
      is_latest: {
        type: "boolean",
        description: "กรองเฉพาะฉบับล่าสุดที่มีผลบังคับใช้ (ค่าเริ่มต้น true)",
        default: true,
      },
      group_by_law: {
        type: "boolean",
        description: "รวมชิ้นส่วนของมาตราเดียวกันและคืนข้อความในรูปแบบทางการ (ค่าเริ่มต้น true)",
        default: true,
      },
      response_format: {
        type: "string",
        enum: ["text", "json"],
        description: "รูปแบบผลลัพธ์: text (อ่านง่าย) หรือ json",
      },
    },
    required: ["query"],
  },
};

export const COLLECTION_INFO_TOOL: Tool = {
  name: "thailaw_collection_info",
  description:
    "แสดงสถานะคอลเลกชัน Qdrant ของฐานกฎหมายไทย รวมจำนวนเอกสารและขนาดเวกเตอร์",
  inputSchema: {
    type: "object",
    properties: {
      refresh: {
        type: "boolean",
        description: "ข้ามแคชและดึงข้อมูลล่าสุดจาก Qdrant",
      },
    },
  },
};
