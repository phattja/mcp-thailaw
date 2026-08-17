#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import {
  SEARCH_THAI_LAW_TOOL,
  COLLECTION_INFO_TOOL,
  isSearchThaiLawArgs,
  isCollectionInfoArgs,
} from "../../src/types.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();

async function runTests() {
  console.log("🧪 Testing: types.ts\n");

  await testFunction("isSearchThaiLawArgs accepts valid cases", () => {
    assert.equal(isSearchThaiLawArgs({ query: "ลักทรัพย์" }), true);
    assert.equal(isSearchThaiLawArgs({ query: "มาตรา 420", top_k: 3 }), true);
    assert.equal(isSearchThaiLawArgs({ query: "สัญญา", score_threshold: 0.3 }), true);
    assert.equal(isSearchThaiLawArgs({ query: "test", law_code: "1B", category: "1B" }), true);
    assert.equal(isSearchThaiLawArgs({ query: "test", is_latest: true, response_format: "json" }), true);
  }, results);

  await testFunction("isSearchThaiLawArgs rejects invalid cases", () => {
    assert.equal(isSearchThaiLawArgs(null), false);
    assert.equal(isSearchThaiLawArgs({}), false);
    assert.equal(isSearchThaiLawArgs({ query: "" }), false);
    assert.equal(isSearchThaiLawArgs({ query: "   " }), false);
    assert.equal(isSearchThaiLawArgs({ query: "test", top_k: 0 }), false);
    assert.equal(isSearchThaiLawArgs({ query: "test", top_k: 21 }), false);
    assert.equal(isSearchThaiLawArgs({ query: "test", score_threshold: -0.1 }), false);
    assert.equal(isSearchThaiLawArgs({ query: "test", score_threshold: 1.1 }), false);
    assert.equal(isSearchThaiLawArgs({ query: "test", is_latest: "yes" }), false);
    assert.equal(isSearchThaiLawArgs({ query: "test", response_format: "xml" }), false);
  }, results);

  await testFunction("isCollectionInfoArgs accepts empty or refresh", () => {
    assert.equal(isCollectionInfoArgs(undefined), true);
    assert.equal(isCollectionInfoArgs(null), true);
    assert.equal(isCollectionInfoArgs({}), true);
    assert.equal(isCollectionInfoArgs({ refresh: true }), true);
    assert.equal(isCollectionInfoArgs({ refresh: "yes" }), false);
    assert.equal(isCollectionInfoArgs("x"), false);
  }, results);

  await testFunction("tools expose expected names", () => {
    assert.equal(SEARCH_THAI_LAW_TOOL.name, "search_thai_law");
    assert.equal(COLLECTION_INFO_TOOL.name, "thailaw_collection_info");
    assert.ok(SEARCH_THAI_LAW_TOOL.inputSchema);
    assert.ok(COLLECTION_INFO_TOOL.inputSchema);
  }, results);

  printTestSummary(results, "Types");
  return results;
}

export { runTests };
