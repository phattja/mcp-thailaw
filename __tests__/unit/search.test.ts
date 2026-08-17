#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import {
  formatCollectionInfo,
  formatSearchJson,
  formatSearchText,
  hitToResult,
} from "../../src/search.js";
import { createNoResultsMessage } from "../../src/error-handler.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();

async function runTests() {
  console.log("🧪 Testing: search.ts\n");

  await testFunction("hitToResult maps payload fields", () => {
    const result = hitToResult({
      id: "abc",
      score: 0.81234,
      payload: {
        title: "ประมวลกฎหมายอาญา",
        law_code: "A01",
        category: "1B",
        publish_date: "1956-01-01",
        reference_url: "https://example.com/law",
        text: "มาตรา 334 ผู้ใดลักทรัพย์",
        chunk_index: 2,
        is_latest: true,
      },
    });
    assert.equal(result.title, "ประมวลกฎหมายอาญา");
    assert.equal(result.law_code, "A01");
    assert.equal(result.chunk_index, 2);
    assert.equal(result.is_latest, true);
    assert.equal(result.score, 0.81234);
  }, results);

  await testFunction("formatSearchText matches the prototype layout", () => {
    const text = formatSearchText("ลักทรัพย์", [{
      score: 0.8123,
      title: "ประมวลกฎหมายอาญา",
      law_code: "A01",
      category: "1B",
      publish_date: "1956-01-01",
      reference_url: "https://example.com/law",
      text: "มาตรา 334 ผู้ใดลักทรัพย์",
    }]);
    assert.ok(text.includes("[1] คะแนนความเกี่ยวข้อง: 0.8123"));
    assert.ok(text.includes("ชื่อกฎหมาย: ประมวลกฎหมายอาญา"));
    assert.ok(text.includes("รหัส: A01"));
    assert.ok(text.includes("ลิงก์: https://example.com/law"));
    assert.ok(text.includes("มาตรา 334 ผู้ใดลักทรัพย์"));
  }, results);

  await testFunction("formatSearchText returns the Thai empty message", () => {
    assert.equal(formatSearchText("ไม่มี", []), createNoResultsMessage("ไม่มี"));
  }, results);

  await testFunction("formatSearchJson includes query and collection", () => {
    const parsed = JSON.parse(formatSearchJson("ลักทรัพย์", "krisdika", []));
    assert.equal(parsed.query, "ลักทรัพย์");
    assert.equal(parsed.collection, "krisdika");
    assert.deepEqual(parsed.results, []);
  }, results);

  await testFunction("formatCollectionInfo is JSON", () => {
    const parsed = JSON.parse(formatCollectionInfo({
      name: "krisdika",
      status: "green",
      pointsCount: 10,
      vectorSize: 1024,
      distance: "Cosine",
    }, "gpustack-bge-m3", "http://127.0.0.1:57863/v1/embeddings"));
    assert.equal(parsed.collection, "krisdika");
    assert.equal(parsed.vector_size, 1024);
    assert.equal(parsed.embedding_model, "gpustack-bge-m3");
  }, results);

  printTestSummary(results, "Search");
  return results;
}

export { runTests };
