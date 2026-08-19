import { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  DEFAULT_DEKA_MAX_RESULTS,
  DEFAULT_DEKA_TOP_K,
  DEFAULT_MAX_RESULTS,
  DEFAULT_OCS_MAX_RESULTS,
  DEFAULT_OCS_TOP_K,
  DEFAULT_SCORE_THRESHOLD,
  DEFAULT_TOP_K,
} from "./config.js";

export type ResponseFormat = "text" | "json";

export type KrisdikaSourceArg = "qdrant" | "online" | "both" | "auto";

export interface SearchKrisdikaArgs {
  query: string;
  top_k?: number;
  score_threshold?: number;
  law_code?: string;
  category?: string;
  is_latest?: boolean;
  group_by_law?: boolean;
  source?: KrisdikaSourceArg | string;
  exclude?: string;
  response_format?: ResponseFormat;
}

export interface SearchOcsArgs {
  query: string;
  top_k?: number;
  topic?: boolean;
  content?: boolean;
  sublaw?: boolean;
  category?: string;
  state?: string;
  year?: string | number;
  acting?: string;
  subject?: string;
  letter?: string;
  detail?: "list" | "sections" | string;
  exclude?: string;
  response_format?: ResponseFormat;
}

export interface CollectionInfoArgs {
  refresh?: boolean;
}

export type DekaSearchMode = "basic" | "advanced";
export type DekaTextScope = "short" | "full";
export type DekaDocType = "all" | "judgment" | "order" | "decision" | "sc_order" | "decision_order";

export interface SearchDekaArgs {
  query?: string;
  top_k?: number;
  mode?: DekaSearchMode;
  doc_type?: DekaDocType | string;
  text_scope?: DekaTextScope | string;
  case_no?: string;
  case_prefix?: string;
  year?: string | number;
  year_from?: string | number;
  year_to?: string | number;
  litigant?: string;
  judge?: string;
  panel_judge?: string;
  law_name?: string;
  law_section?: string;
  law_paragraph?: string;
  law_subsection?: string;
  law_other?: string;
  law_condition?: "AND" | "OR" | string;
  black_no?: string;
  department?: string;
  remark?: string;
  detail?: "summary" | "full" | string;
  exclude?: string;
  response_format?: ResponseFormat;
}

const VALID_RESPONSE_FORMATS: readonly ResponseFormat[] = ["text", "json"];

export function isSearchKrisdikaArgs(args: unknown): args is SearchKrisdikaArgs {
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

  if (searchArgs.source !== undefined && typeof searchArgs.source !== "string") {
    return false;
  }

  if (searchArgs.exclude !== undefined && typeof searchArgs.exclude !== "string") {
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

export function isSearchOcsArgs(args: unknown): args is SearchOcsArgs {
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
      || searchArgs.top_k > DEFAULT_OCS_MAX_RESULTS
    )
  ) {
    return false;
  }

  for (const key of ["topic", "content", "sublaw"] as const) {
    if (searchArgs[key] !== undefined && typeof searchArgs[key] !== "boolean") {
      return false;
    }
  }

  for (const key of ["category", "state", "acting", "subject", "letter", "detail", "exclude"] as const) {
    if (searchArgs[key] !== undefined && typeof searchArgs[key] !== "string") {
      return false;
    }
  }

  if (
    searchArgs.year !== undefined
    && typeof searchArgs.year !== "string"
    && typeof searchArgs.year !== "number"
  ) {
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

const DEKA_OPTIONAL_STRINGS = [
  "query",
  "mode",
  "doc_type",
  "text_scope",
  "case_no",
  "case_prefix",
  "litigant",
  "judge",
  "panel_judge",
  "law_name",
  "law_section",
  "law_paragraph",
  "law_subsection",
  "law_other",
  "law_condition",
  "black_no",
  "department",
  "remark",
  "detail",
  "exclude",
] as const;

const DEKA_OPTIONAL_YEARS = ["year", "year_from", "year_to"] as const;

const DEKA_CRITERIA = [
  "query",
  "case_no",
  "year",
  "year_from",
  "year_to",
  "litigant",
  "judge",
  "panel_judge",
  "law_name",
  "law_section",
  "black_no",
  "department",
  "remark",
] as const;

export function isSearchDekaArgs(args: unknown): args is SearchDekaArgs {
  if (typeof args !== "object" || args === null) {
    return false;
  }

  const searchArgs = args as Record<string, unknown>;
  const hasCriterion = DEKA_CRITERIA.some((key) => {
    const value = searchArgs[key];
    return value !== undefined && String(value).trim() !== "";
  });
  if (!hasCriterion) {
    return false;
  }

  if (
    searchArgs.top_k !== undefined
    && (
      typeof searchArgs.top_k !== "number"
      || !Number.isInteger(searchArgs.top_k)
      || searchArgs.top_k < 1
      || searchArgs.top_k > DEFAULT_DEKA_MAX_RESULTS
    )
  ) {
    return false;
  }

  for (const key of DEKA_OPTIONAL_STRINGS) {
    if (searchArgs[key] !== undefined && typeof searchArgs[key] !== "string") {
      return false;
    }
  }

  for (const key of DEKA_OPTIONAL_YEARS) {
    if (
      searchArgs[key] !== undefined
      && typeof searchArgs[key] !== "string"
      && typeof searchArgs[key] !== "number"
    ) {
      return false;
    }
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

export const SEARCH_KRISDIKA_TOOL: Tool = {
  name: "search_krisdika",
  description:
    "ค้นหากฎหมายไทยจากฐานข้อมูลสำนักงานคณะกรรมการกฤษฎีกา ด้วย semantic search บน Qdrant. "
    + "ค่าเริ่มต้นคืนเฉพาะฉบับล่าสุดที่มีผลบังคับใช้ (is_latest=true) "
    + "และรวมชิ้นส่วนของมาตราเดียวกันแล้วจัดรูปแบบเหมือนราชกิจจานุเบกษา (group_by_law=true). "
    + "source=qdrant (ค่าเริ่มต้น) / online (เว็บ https://www.ocs.go.th/searchlaw-law) / both / auto "
    + "(ถ้าไม่พบใน Qdrant จะค้นเว็บต่อ). ใช้ search_krisdika_online เมื่อต้องการเว็บอย่างเดียว.",
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
      source: {
        type: "string",
        enum: ["qdrant", "online", "both", "auto"],
        description:
          "qdrant = ฐานเวกเตอร์ (ค่าเริ่มต้น), online = เว็บกฤษฎีกา, both = ทั้งสอง, "
          + "auto = Qdrant ก่อน ถ้าไม่พบจึงค้นเว็บ",
      },
      exclude: {
        type: "string",
        description: "คำที่ต้องตัดออก คั่นด้วยจุลภาค เช่น วิ่งราว,ชิงทรัพย์",
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

export const SEARCH_KRISDIKA_ONLINE_TOOL: Tool = {
  name: "search_krisdika_online",
  description:
    "ค้นหากฎหมายไทยจากเว็บสำนักงานคณะกรรมการกฤษฎีกา https://www.ocs.go.th/searchlaw-law "
    + "เมื่อต้องการผลสดจากเว็บ หรือเมื่อ search_krisdika (Qdrant) ไม่พบ. "
    + "ค่าเริ่มต้นค้นจากชื่อและค้นจากเนื้อหา แล้วเปิดฉบับล่าสุดของแต่ละฉบับเพื่อคืนมาตราที่ตรงคำค้น.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "คำค้นหา เช่น ลักทรัพย์, สัญญาจ้าง, มาตรา ๓๓๕",
      },
      top_k: {
        type: "integer",
        minimum: 1,
        maximum: DEFAULT_OCS_MAX_RESULTS,
        description: `จำนวนฉบับสูงสุดต่อครั้ง (ค่าเริ่มต้น ${DEFAULT_OCS_TOP_K}, สูงสุด ${DEFAULT_OCS_MAX_RESULTS})`,
      },
      topic: {
        type: "boolean",
        description: "ค้นจากชื่อ (ค่าเริ่มต้น true)",
        default: true,
      },
      content: {
        type: "boolean",
        description: "ค้นจากเนื้อหา (ค่าเริ่มต้น true)",
        default: true,
      },
      sublaw: {
        type: "boolean",
        description: "รวมกฎหมายลำดับรองที่เกี่ยวข้อง (ค่าเริ่มต้น false)",
        default: false,
      },
      category: {
        type: "string",
        description:
          "ประเภทกฎหมาย เช่น 1D / ประมวลกฎหมาย, 1B / พระราชบัญญัติ. เว้นว่าง = ทั้งหมด",
      },
      state: {
        type: "string",
        description:
          "สถานะ: current/01 ฉบับปัจจุบัน, pending/02 รอมีผล, repealed/00 เลิกใช้. ค่าเริ่มต้น 01,02",
      },
      year: {
        type: "string",
        description: "ปี พ.ศ. ที่ประกาศ เช่น 2568",
      },
      acting: {
        type: "string",
        description: "ผู้รักษาการ เช่น รัฐมนตรีว่าการกระทรวงยุติธรรม",
      },
      subject: {
        type: "string",
        description: "หมวดเรื่อง เช่น ศาล และกระบวนการยุติธรรม",
      },
      letter: {
        type: "string",
        description: "ตัวอักษรขึ้นต้นชื่อกฎหมาย เช่น ก",
      },
      detail: {
        type: "string",
        enum: ["sections", "list"],
        description:
          "sections (ค่าเริ่มต้น) = เปิดฉบับล่าสุดแล้วคืนมาตราที่ตรงคำค้น. list = รายชื่อฉบับและข้อความที่พบเท่านั้น",
      },
      exclude: {
        type: "string",
        description: "คำที่ต้องตัดออก คั่นด้วยจุลภาค เช่น วิ่งราว,ชิงทรัพย์",
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

export const SEARCH_DEKA_ONLINE_TOOL: Tool = {
  name: "search_deka_online",
  description:
    "ค้นหาคำพิพากษา คำสั่งคำร้อง และคำวินิจฉัยศาลฎีกาจาก https://deka.supremecourt.or.th/ "
    + "ค่าเริ่มต้นค้นจากข้อมูลทั้งหมดและฉบับเต็ม. ผลลัพธ์ค่าเริ่มต้นมีเฉพาะเลขที่คำพิพากษา ชื่อคู่ความ ชื่อกฎหมาย และย่อสั้น. "
    + "รองรับค้นหาปกติและขั้นสูง. ไม่ใช่ตัวบทกฎหมาย — ใช้คู่กับ search_krisdika เมื่อต้องการมาตรา.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "คำค้น เช่น ลักทรัพย์ หรือ มาตรา ๓๓๕. เว้นว่างได้ถ้าใส่ case_no หรือช่วงปี",
      },
      top_k: {
        type: "integer",
        minimum: 1,
        maximum: DEFAULT_DEKA_MAX_RESULTS,
        description: `จำนวนคดีสูงสุดต่อครั้ง (ค่าเริ่มต้น ${DEFAULT_DEKA_TOP_K}, สูงสุด ${DEFAULT_DEKA_MAX_RESULTS})`,
      },
      mode: {
        type: "string",
        enum: ["basic", "advanced"],
        description: "basic = ค้นหาปกติ, advanced = ค้นหาขั้นสูง (ค่าเริ่มต้น basic และเลื่อนเป็น advanced เองถ้ามีฟิลด์ขั้นสูง)",
      },
      doc_type: {
        type: "string",
        description: "ประเภทเอกสาร: all (ทั้งหมด, ค่าเริ่มต้น), judgment, order, decision, sc_order, decision_order",
      },
      text_scope: {
        type: "string",
        enum: ["short", "full"],
        description: "ค้นหาจากฉบับย่อ (short) หรือฉบับเต็ม (full). ค่าเริ่มต้น full",
      },
      case_no: {
        type: "string",
        description: "หมายเลขคำพิพากษา / คำสั่งคำร้อง เช่น 664/2569",
      },
      case_prefix: {
        type: "string",
        description: "คำนำหน้าเลขคดี เช่น ท. ยช. อม. หรือรหัสคำสั่ง ครพ.",
      },
      year: {
        type: "string",
        description: "ปี พ.ศ. ปีเดียว เช่น 2568 (เท่ากับ year_from=year_to)",
      },
      year_from: {
        type: "string",
        description: "ปี พ.ศ. เริ่มต้นของช่วงเวลา",
      },
      year_to: {
        type: "string",
        description: "ปี พ.ศ. สิ้นสุดของช่วงเวลา",
      },
      litigant: {
        type: "string",
        description: "ชื่อคู่ความ (ค้นหาขั้นสูง)",
      },
      judge: {
        type: "string",
        description: "เจ้าของสำนวน (ค้นหาขั้นสูง)",
      },
      panel_judge: {
        type: "string",
        description: "ผู้พิพากษาในองค์คณะ (ค้นหาขั้นสูง)",
      },
      law_name: {
        type: "string",
        description: "ชื่อกฎหมาย (ค้นหาขั้นสูง)",
      },
      law_section: {
        type: "string",
        description: "มาตรา (ค้นหาขั้นสูง)",
      },
      law_paragraph: {
        type: "string",
        description: "วรรค (ค้นหาขั้นสูง)",
      },
      law_subsection: {
        type: "string",
        description: "อนุมาตรา (ค้นหาขั้นสูง)",
      },
      law_other: {
        type: "string",
        description: "ข้อความอื่นของบทบัญญัติ (ค้นหาขั้นสูง)",
      },
      law_condition: {
        type: "string",
        enum: ["AND", "OR"],
        description: "เงื่อนไขรวมกฎหมายหลายรายการ AND หรือ OR (ค้นหาขั้นสูง)",
      },
      black_no: {
        type: "string",
        description: "หมายเลขคดีดำของศาลฎีกา (ค้นหาขั้นสูง)",
      },
      department: {
        type: "string",
        description: "แผนก (ค้นหาขั้นสูง)",
      },
      remark: {
        type: "string",
        description: "หมายเหตุ (ค้นหาขั้นสูง)",
      },
      detail: {
        type: "string",
        enum: ["summary", "full"],
        description: "summary (ค่าเริ่มต้น) = เลขฎีกา ชื่อคู่ความ ชื่อกฎหมาย ย่อสั้น. full = รายละเอียดทั้งหมดใน #deka_result_info",
      },
      exclude: {
        type: "string",
        description: "คำที่ต้องตัดออก คั่นด้วยจุลภาค เช่น วิ่งราว,ชิงทรัพย์",
      },
      response_format: {
        type: "string",
        enum: ["text", "json"],
        description: "รูปแบบผลลัพธ์: text (อ่านง่าย) หรือ json",
      },
    },
  },
};

export const KRISDIKA_COLLECTION_INFO_TOOL: Tool = {
  name: "krisdika_collection_info",
  description:
    "แสดงสถานะคอลเลกชัน Qdrant ของฐานข้อมูลกฤษฎีกา รวมจำนวนเอกสารและขนาดเวกเตอร์",
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

export const KRISDEKA_CONNECTION_INFO_TOOL: Tool = {
  name: "krisdeka_connection_info",
  description:
    "ตรวจการเชื่อมต่อไปยังเว็บค้นหากฎหมายกฤษฎีกา https://www.ocs.go.th/searchlaw-law "
    + "คืนสถานะ HTTP, เวลาตอบ, และจำนวนฉบับในฐานถ้าอ่านได้",
  inputSchema: {
    type: "object",
    properties: {
      refresh: {
        type: "boolean",
        description: "ข้ามแคชและตรวจการเชื่อมต่อใหม่",
      },
    },
  },
};

export const DEKA_CONNECTION_INFO_TOOL: Tool = {
  name: "deka_connection_info",
  description:
    "ตรวจการเชื่อมต่อไปยังเว็บค้นคำพิพากษาศาลฎีกา https://deka.supremecourt.or.th/ "
    + "คืนสถานะ HTTP, เวลาตอบ, และจำนวนคดีในฐานถ้าอ่านได้",
  inputSchema: {
    type: "object",
    properties: {
      refresh: {
        type: "boolean",
        description: "ข้ามแคชและตรวจการเชื่อมต่อใหม่",
      },
    },
  },
};
