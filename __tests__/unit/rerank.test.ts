#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { rerankDocuments, rerankResults } from "../../src/rerank.js";
import { FetchMocker, createMockFetch } from "../helpers/mock-fetch.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";
const results = createTestResults();
const fetchMocker = new FetchMocker();

function sample(text: string, score: number): { text: string; score: number } {
  return {
    score,
    text,
  };
}

async function runTests() {
  console.log("🧪 Testing: rerank.ts\n");

  await testFunction("rerankDocuments maps llama-server scores by index", async () => {
    fetchMocker.mock(createMockFetch({
      json: {
        results: [
          { index: 1, relevance_score: 0.91 },
          { index: 0, relevance_score: 0.12 },
        ],
      },
    }));
    const scores = await rerankDocuments("query", ["a", "b"]);
    assert.equal(scores[0], 0.12);
    assert.equal(scores[1], 0.91);
    fetchMocker.restore();
  }, results);

  await testFunction("rerankResults sorts by relevance_score", async () => {
    fetchMocker.mock(createMockFetch({
      json: {
        results: [
          { index: 0, relevance_score: 0.2 },
          { index: 1, relevance_score: 0.8 },
        ],
      },
    }));
    const ranked = await rerankResults("query", [
      sample("old", 0.9),
      sample("new", 0.1),
    ]);
    assert.equal(ranked[0].text, "new");
    assert.equal(ranked[0].score, 0.8);
    fetchMocker.restore();
  }, results);

  printTestSummary(results, "Rerank");
  return results;
}

export { runTests };
