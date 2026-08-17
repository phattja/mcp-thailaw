#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { fetchCollectionInfo, queryPoints } from "../../src/qdrant.js";
import { FetchMocker, createCapturingMockFetch, createMockFetch } from "../helpers/mock-fetch.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();
const fetchMocker = new FetchMocker();

async function runTests() {
  console.log("🧪 Testing: qdrant.ts\n");

  await testFunction("queryPoints maps hits", async () => {
    fetchMocker.mock(createMockFetch({
      json: {
        result: {
          points: [
            { id: "1", score: 0.9, payload: { title: "ก", text: "ข" } },
          ],
        },
      },
    }));
    const hits = await queryPoints([0.1, 0.2], { limit: 5, scoreThreshold: 0.3 });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].score, 0.9);
    assert.equal(hits[0].payload.title, "ก");
    fetchMocker.restore();
  }, results);

  await testFunction("queryPoints defaults to is_latest=true", async () => {
    const capturing = createCapturingMockFetch();
    fetchMocker.mock(async (url, options) => {
      await capturing.mockFetch(url, options);
      return createMockFetch({ json: { result: { points: [] } } })(url, options);
    });
    await queryPoints([0.1], { limit: 3, scoreThreshold: 0.2 });
    const body = JSON.parse(String(capturing.getCapturedOptions()?.body));
    assert.deepEqual(body.filter, {
      must: [{ key: "is_latest", match: { value: true } }],
    });
    fetchMocker.restore();
  }, results);

  await testFunction("queryPoints sends extra filters with is_latest=true", async () => {
    const capturing = createCapturingMockFetch();
    fetchMocker.mock(async (url, options) => {
      await capturing.mockFetch(url, options);
      return createMockFetch({ json: { result: { points: [] } } })(url, options);
    });
    await queryPoints([0.1], {
      limit: 3,
      scoreThreshold: 0.2,
      filter: { lawCode: "A01" },
    });
    const body = JSON.parse(String(capturing.getCapturedOptions()?.body));
    assert.equal(body.limit, 3);
    assert.deepEqual(body.filter, {
      must: [
        { key: "is_latest", match: { value: true } },
        { key: "law_code", match: { value: "A01" } },
      ],
    });
    fetchMocker.restore();
  }, results);

  await testFunction("queryPoints honors isLatest=false", async () => {
    const capturing = createCapturingMockFetch();
    fetchMocker.mock(async (url, options) => {
      await capturing.mockFetch(url, options);
      return createMockFetch({ json: { result: { points: [] } } })(url, options);
    });
    await queryPoints([0.1], {
      limit: 3,
      scoreThreshold: 0.2,
      filter: { isLatest: false },
    });
    const body = JSON.parse(String(capturing.getCapturedOptions()?.body));
    assert.deepEqual(body.filter, {
      must: [{ key: "is_latest", match: { value: false } }],
    });
    fetchMocker.restore();
  }, results);

  await testFunction("fetchCollectionInfo maps collection stats", async () => {
    fetchMocker.mock(createMockFetch({
      json: {
        result: {
          status: "green",
          points_count: 12,
          indexed_vectors_count: 10,
          config: { params: { vectors: { size: 1024, distance: "Cosine" } } },
        },
      },
    }));
    const info = await fetchCollectionInfo();
    assert.equal(info.status, "green");
    assert.equal(info.pointsCount, 12);
    assert.equal(info.vectorSize, 1024);
    fetchMocker.restore();
  }, results);

  printTestSummary(results, "Qdrant");
  return results;
}

export { runTests };
