export function parseExcludeWords(raw?: string): string[] {
  if (!raw) {
    return [];
  }
  return [...new Set(
    raw.split(/[,|]/).map((part) => part.trim()).filter((part) => part.length > 0),
  )];
}

export function textHasExcludedWord(text: string, words: string[]): boolean {
  if (words.length === 0 || !text) {
    return false;
  }
  const haystack = text.toLocaleLowerCase();
  return words.some((word) => haystack.includes(word.toLocaleLowerCase()));
}

export function filterExcluded<T>(
  items: T[],
  words: string[],
  textOf: (item: T) => string,
): T[] {
  if (words.length === 0) {
    return items;
  }
  return items.filter((item) => !textHasExcludedWord(textOf(item), words));
}

const CANCELLED_TITLE_MARKERS = ["(ยกเลิก)", "（ยกเลิก）"];

const INCLUDE_CANCELLED_TOKENS = new Set([
  "(ยกเลิก)",
  "（ยกเลิก）",
  "ยกเลิก",
  "cancel",
  "cancelled",
  "canceled",
]);

export function parseIncludeWords(raw?: string): string[] {
  return parseExcludeWords(raw);
}

export function titleLooksCancelled(title: string): boolean {
  const normalized = title.replace(/\s+/g, "");
  return CANCELLED_TITLE_MARKERS.some((marker) => normalized.includes(marker));
}

export function includeCancelledTitles(raw?: string): boolean {
  return parseIncludeWords(raw).some((word) => {
    const key = word.trim().toLocaleLowerCase();
    return INCLUDE_CANCELLED_TOKENS.has(key) || INCLUDE_CANCELLED_TOKENS.has(word.trim());
  });
}

export function filterCancelledTitles<T>(
  items: T[],
  include: string | undefined,
  titleOf: (item: T) => string,
): T[] {
  if (includeCancelledTitles(include)) {
    return items;
  }
  return items.filter((item) => !titleLooksCancelled(titleOf(item)));
}
