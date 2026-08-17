#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { getEmbedding } from "../../src/embedding.js";
import { FetchMocker, createMockFetch } from "../helpers/mock-fetch.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();
const fetchMocker = new FetchMocker();

async function runTests() {
  console.log("🧪 Testing: embedding.ts\n");

  await testFunction("parses an OpenAI-compatible embedding response", async () => {
    fetchMocker.mock(createMockFetch({
      json: { data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }] },
    }));
    const vector = await getEmbedding("ทดสอบ");
    assert.deepEqual(vector, [0.1, 0.2, 0.3]);
    fetchMocker.restore();
  }, results);

  await testFunction("rejects a missing vector", async () => {
    fetchMocker.mock(createMockFetch({ json: { data: [] } }));
    await assert.rejects(() => getEmbedding("ทดสอบ"), /missing a numeric vector/);
    fetchMocker.restore();
  }, results);

  printTestSummary(results, "Embedding");
  return results;
}

export { runTests };
