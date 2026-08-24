const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const MATRA_SUFFIX = "ทวิ|ตรี|จัตวา|เบญจ";
const MATRA_NUMBER = `[๐-๙0-9]+(?:\\/[๐-๙0-9]+)?`;
const MATRA_BODY = `(${MATRA_NUMBER})(?:\\s*(${MATRA_SUFFIX}))?`;
const MATRA_HEADING = new RegExp(`มาตรา\\s*${MATRA_BODY}`, "g");
const SECTION_HEADER = /### มาตรา\/ส่วน\s+(\S+)/g;
const REFERENCE_PREFIX = /(?:ตาม|ใน|และ|หรือ|ไว้ใน|ดังกล่าวใน|นอกจากความผิดตาม|ความผิดตาม)\s*$/;
const CLAUSE_MARKER = /\(\s*([๐-๙0-9]{1,3})\s*\)/g;
const NEW_PARAGRAPH = /\s+(ต้องระวางโทษ|ผู้กระทำต้องระวางโทษ|ถ้าความผิด|ถ้าการกระทำ|ถ้าการลักทรัพย์|ถ้าการวิ่งราว|ถ้าการชิงทรัพย์|ถ้าการปล้นทรัพย์|ถ้าทรัพย์)/g;

export interface StatuteSection {
  sectionId?: string;
  body: string;
}

export function thaiDigitsToArabic(value: string): string {
  return [...value].map((char) => {
    const index = THAI_DIGITS.indexOf(char);
    return index >= 0 ? String(index) : char;
  }).join("");
}

export function arabicDigitsToThai(value: string): string {
  return [...value].map((char) => {
    if (char >= "0" && char <= "9") {
      return THAI_DIGITS[Number(char)];
    }
    return char;
  }).join("");
}

export function formatMatraThai(raw: string): string {
  const match = new RegExp(`^\\s*${MATRA_BODY}\\s*$`).exec(raw.trim());
  if (!match) {
    return arabicDigitsToThai(raw.trim());
  }
  const number = arabicDigitsToThai(match[1]);
  return match[2] ? `${number} ${match[2]}` : number;
}

export function rewriteQueryMatraToThai(query: string): string {
  return query.replace(
    new RegExp(`(มาตรา\\s*)${MATRA_BODY}`),
    (_all, prefix: string, number: string, suffix?: string) => {
      const thai = arabicDigitsToThai(number);
      return suffix ? `${prefix}${thai} ${suffix}` : `${prefix}${thai}`;
    },
  );
}

export function normalizeMatraKey(raw: string): string {
  const match = new RegExp(`^\\s*${MATRA_BODY}\\s*$`).exec(raw.trim());
  const number = thaiDigitsToArabic((match?.[1] ?? raw).trim());
  const suffix = match?.[2] ?? "";
  return suffix ? `${number}:${suffix}` : number;
}

export function extractSectionIds(text: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(new RegExp(SECTION_HEADER.source, "g"))) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function splitStatuteSections(text: string): StatuteSection[] {
  const headers = [...text.matchAll(new RegExp(SECTION_HEADER.source, "g"))];
  if (headers.length === 0) {
    const body = stripIngestPreamble(text).trim();
    return body ? [{ body }] : [];
  }

  const sections: StatuteSection[] = [];
  const preamble = text.slice(0, headers[0].index ?? 0);
  const preambleBody = stripIngestPreamble(preamble).trim();
  if (preambleBody) {
    sections.push({ body: preambleBody });
  }

  for (let index = 0; index < headers.length; index += 1) {
    const start = (headers[index].index ?? 0) + headers[index][0].length;
    const end = index + 1 < headers.length ? (headers[index + 1].index ?? text.length) : text.length;
    const body = text.slice(start, end).trim();
    if (body) {
      sections.push({ sectionId: headers[index][1], body });
    }
  }
  return sections;
}

export function extractSectionBody(text: string, sectionId: string): string {
  return splitStatuteSections(text)
    .filter((section) => section.sectionId === sectionId)
    .map((section) => section.body)
    .join(" ")
    .trim();
}

export function extractPrimaryMatra(text: string): string | undefined {
  const cleaned = stripIngestPreamble(text);
  for (const match of cleaned.matchAll(new RegExp(MATRA_HEADING.source, "g"))) {
    const before = cleaned.slice(Math.max(0, match.index - 24), match.index);
    if (REFERENCE_PREFIX.test(before)) {
      continue;
    }
    const number = match[1];
    const suffix = match[2];
    return suffix ? `${number} ${suffix}` : number;
  }
  return undefined;
}

export function extractQueryMatra(query: string): string | undefined {
  const match = new RegExp(`มาตรา\\s*${MATRA_BODY}`).exec(query);
  if (!match) {
    return undefined;
  }
  return formatMatraThai(match[2] ? `${match[1]} ${match[2]}` : match[1]);
}

export function stripIngestPreamble(text: string): string {
  return text
    .replace(new RegExp(SECTION_HEADER.source, "g"), " ")
    .replace(/^#\s+.+$/gm, " ")
    .replace(/^(รหัสกฎหมาย|วันที่ประกาศ|ประเภท|แหล่งอ้างอิง)\s*:.+$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatOfficialThaiStatute(text: string): string {
  let body = stripIngestPreamble(text);
  if (!body) {
    return "";
  }

  body = body.replace(CLAUSE_MARKER, "\n($1) ");
  body = body.replace(NEW_PARAGRAPH, "\n$1");
  return body
    .split("\n")
    .map((line) => line.replace(/ +/g, " ").trim())
    .filter((line) => line.length > 0)
    .map((line) => (line.startsWith("(") ? `    ${line}` : line))
    .join("\n");
}
