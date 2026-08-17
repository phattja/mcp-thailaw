#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTimelineMap, resetTimelineMap, timelineCodeForUrl } from "../../src/timeline.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();

async function runTests() {
  console.log("🧪 Testing: timeline.ts\n");

  await testFunction("timelineCodeForUrl reads the local map file", () => {
    const dir = mkdtempSync(join(tmpdir(), "thailaw-timeline-"));
    const path = join(dir, "timeline-map.json");
    writeFileSync(path, JSON.stringify({
      "https://example.com/new": "ป0006-1D-0003-63",
    }));
    resetTimelineMap();
    process.env.THAILAW_TIMELINE_MAP = path;
    loadTimelineMap(path);
    assert.equal(timelineCodeForUrl("https://example.com/new"), "ป0006-1D-0003-63");
    assert.equal(timelineCodeForUrl("https://example.com/missing"), undefined);
    delete process.env.THAILAW_TIMELINE_MAP;
    resetTimelineMap();
  }, results);

  printTestSummary(results, "Timeline");
  return results;
}

export { runTests };
