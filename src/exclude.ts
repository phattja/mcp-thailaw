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
