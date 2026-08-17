#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import {
  DEFAULT_COLLECTION_NAME,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_QDRANT_URL,
  getThaiLawConfig,
  validateThaiLawConfig,
} from "../../src/config.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";
import { EnvManager } from "../helpers/env-utils.js";

const results = createTestResults();
const env = new EnvManager();

async function runTests() {
  console.log("🧪 Testing: config.ts\n");

  await testFunction("defaults match the Python prototype", () => {
    env.delete("QDRANT_URL");
    env.delete("QDRANT_COLLECTION");
    env.delete("EMBEDDING_URL");
    env.delete("EMBEDDING_MODEL");
    env.delete("THAILAW_TOP_K");
    env.delete("THAILAW_SCORE_THRESHOLD");
    const config = getThaiLawConfig();
    assert.equal(config.qdrantUrl, DEFAULT_QDRANT_URL);
    assert.equal(config.collectionName, DEFAULT_COLLECTION_NAME);
    assert.equal(config.embeddingModel, DEFAULT_EMBEDDING_MODEL);
    assert.equal(config.defaultTopK, 5);
    assert.equal(config.defaultScoreThreshold, 0.3);
    env.restore();
  }, results);

  await testFunction("strips trailing slashes from QDRANT_URL", () => {
    env.set("QDRANT_URL", "http://qdrant.example:6333/");
    assert.equal(getThaiLawConfig().qdrantUrl, "http://qdrant.example:6333");
    env.restore();
  }, results);

  await testFunction("rejects invalid URLs", () => {
    const issue = validateThaiLawConfig({
      ...getThaiLawConfig(),
      qdrantUrl: "ftp://bad.example",
    });
    assert.ok(issue);
    assert.ok(issue.includes("QDRANT_URL"));
  }, results);

  printTestSummary(results, "Config");
  return results;
}

export { runTests };
