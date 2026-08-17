import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const defaultMapPath = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "timeline-map.json");

let cached: Map<string, string> | undefined;

export function resetTimelineMap(): void {
  cached = undefined;
}

export function loadTimelineMap(path = process.env.THAILAW_TIMELINE_MAP?.trim() || defaultMapPath): Map<string, string> {
  if (cached) {
    return cached;
  }
  cached = new Map();
  if (!existsSync(path)) {
    return cached;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
    for (const [url, code] of Object.entries(raw)) {
      if (url && code) {
        cached.set(url, code);
      }
    }
  } catch {
    cached = new Map();
  }
  return cached;
}

export function timelineCodeForUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) {
    return undefined;
  }
  return loadTimelineMap().get(trimmed);
}
