#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { getColbertEmbedding, getDualEmbedding, getEmbedding } from "../../src/embedding.js";
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

  await testFunction("parses TEI /embed dense rows", async () => {
    fetchMocker.mock(createMockFetch({
      json: [[0.4, 0.5, 0.6]],
    }));
    const vector = await getEmbedding("ทดสอบ");
    assert.deepEqual(vector, [0.4, 0.5, 0.6]);
    fetchMocker.restore();
  }, results);

  await testFunction("parses ColBERT token vectors", async () => {
    fetchMocker.mock(createMockFetch({
      json: [[1, 0], [0, 1]],
    }));
    const tokens = await getColbertEmbedding("ทดสอบ");
    assert.equal(tokens.length, 2);
    assert.equal(tokens[0]?.length, 2);
    assert.ok(Math.abs((tokens[0]?.[0] ?? 0) - 1) < 1e-6);
    fetchMocker.restore();
  }, results);

  await testFunction("derives dense+ColBERT from llama.cpp pooling=none rows", async () => {
    fetchMocker.mock(createMockFetch({
      json: [{ index: 0, embedding: [[3, 0], [0, 4]] }],
    }));
    const dual = await getDualEmbedding("ทดสอบ");
    assert.equal(dual.colbert.length, 2);
    assert.ok(Math.abs(dual.colbert[0][0] - 1) < 1e-6);
    assert.ok(Math.abs(dual.dense[0] - 0.6) < 1e-6);
    assert.ok(Math.abs(dual.dense[1] - 0.8) < 1e-6);
    fetchMocker.restore();
  }, results);

  printTestSummary(results, "Embedding");
  return results;
}

export { runTests };
