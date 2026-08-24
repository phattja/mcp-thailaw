#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { fetchCollectionInfo, queryPoints, scrollPoints } from "../../src/qdrant.js";
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
    const hits = await queryPoints([[0.1, 0.2], [0.3, 0.4]], {
      limit: 5,
      scoreThreshold: 0.3,
      using: "colbert",
    });
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

  await testFunction("scrollPoints uses textContains and maps points", async () => {
    const capturing = createCapturingMockFetch();
    fetchMocker.mock(async (url, options) => {
      await capturing.mockFetch(url, options);
      return createMockFetch({
        json: {
          result: {
            points: [{ id: "sec-1", payload: { text: "มาตรา ๓๓๕", law_code: "A01" } }],
          },
        },
      })(url, options);
    });
    const hits = await scrollPoints({
      filter: { lawCode: "A01", textContains: "มาตรา/ส่วน 1590017" },
    });
    const body = JSON.parse(String(capturing.getCapturedOptions()?.body));
    assert.equal(capturing.getCapturedUrl().includes("/points/scroll"), true);
    assert.deepEqual(body.filter.must[2], {
      key: "text",
      match: { text: "มาตรา/ส่วน 1590017" },
    });
    fetchMocker.restore();
  }, results);

  await testFunction("scrollPoints matches payload title", async () => {
    const capturing = createCapturingMockFetch();
    fetchMocker.mock(async (url, options) => {
      await capturing.mockFetch(url, options);
      return createMockFetch({
        json: {
          result: {
            points: [{ id: "t-1", payload: { title: "ประมวลกฎหมายอาญา" } }],
          },
        },
      })(url, options);
    });
    const hits = await scrollPoints({
      filter: { titleContains: "ประมวลกฎหมายอาญา" },
    });
    const body = JSON.parse(String(capturing.getCapturedOptions()?.body));
    assert.deepEqual(body.filter.must[1], {
      key: "title",
      match: { text: "ประมวลกฎหมายอาญา" },
    });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].payload.title, "ประมวลกฎหมายอาญา");
    fetchMocker.restore();
  }, results);

  await testFunction("scrollPoints filters nested section.sectionId", async () => {
    const capturing = createCapturingMockFetch();
    fetchMocker.mock(async (url, options) => {
      await capturing.mockFetch(url, options);
      return createMockFetch({ json: { result: { points: [] } } })(url, options);
    });
    await scrollPoints({
      filter: { lawCode: "A01", sectionId: "1590017" },
    });
    const body = JSON.parse(String(capturing.getCapturedOptions()?.body));
    assert.deepEqual(body.filter.must[2], {
      should: [
        { key: "section.sectionId", match: { value: 1590017 } },
        { key: "sectionId", match: { value: 1590017 } },
      ],
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

  await testFunction("fetchCollectionInfo maps named ColBERT vectors", async () => {
    fetchMocker.mock(createMockFetch({
      json: {
        result: {
          status: "green",
          points_count: 4,
          config: {
            params: {
              vectors: {
                dense: { size: 1024, distance: "Cosine" },
                colbert: {
                  size: 1024,
                  distance: "Cosine",
                  multivector_config: { comparator: "max_sim" },
                },
              },
            },
          },
        },
      },
    }));
    const info = await fetchCollectionInfo();
    assert.equal(info.namedVectors?.length, 2);
    assert.equal(info.namedVectors?.find((item) => item.name === "colbert")?.multivector, true);
    fetchMocker.restore();
  }, results);

  printTestSummary(results, "Qdrant");
  return results;
}

export { runTests };
