#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import {
  SEARCH_KRISDIKA_TOOL,
  SEARCH_KRISDIKA_ONLINE_TOOL,
  SEARCH_DEKA_ONLINE_TOOL,
  KRISDIKA_COLLECTION_INFO_TOOL,
  KRISDEKA_CONNECTION_INFO_TOOL,
  DEKA_CONNECTION_INFO_TOOL,
  isSearchKrisdikaArgs,
  isSearchOcsArgs,
  isSearchDekaArgs,
  isCollectionInfoArgs,
} from "../../src/types.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();

async function runTests() {
  console.log("🧪 Testing: types.ts\n");

  await testFunction("isSearchKrisdikaArgs accepts valid cases", () => {
    assert.equal(isSearchKrisdikaArgs({ query: "ลักทรัพย์" }), true);
    assert.equal(isSearchKrisdikaArgs({ query: "มาตรา 420", top_k: 3 }), true);
    assert.equal(isSearchKrisdikaArgs({ query: "สัญญา", score_threshold: 0.3 }), true);
    assert.equal(isSearchKrisdikaArgs({ query: "test", law_code: "1B", category: "1B" }), true);
    assert.equal(isSearchKrisdikaArgs({ query: "test", is_latest: true, response_format: "json" }), true);
    assert.equal(isSearchKrisdikaArgs({ query: "test", is_latest: false }), true);
    assert.equal(isSearchKrisdikaArgs({ query: "test", group_by_law: false }), true);
    assert.equal(isSearchKrisdikaArgs({ query: "test", source: "auto" }), true);
    assert.equal(isSearchKrisdikaArgs({ query: "test", exclude: "วิ่งราว,ชิงทรัพย์" }), true);
  }, results);

  await testFunction("isSearchKrisdikaArgs rejects invalid cases", () => {
    assert.equal(isSearchKrisdikaArgs(null), false);
    assert.equal(isSearchKrisdikaArgs({}), false);
    assert.equal(isSearchKrisdikaArgs({ query: "" }), false);
    assert.equal(isSearchKrisdikaArgs({ query: "   " }), false);
    assert.equal(isSearchKrisdikaArgs({ query: "test", top_k: 0 }), false);
    assert.equal(isSearchKrisdikaArgs({ query: "test", top_k: 101 }), false);
    assert.equal(isSearchKrisdikaArgs({ query: "test", top_k: 40 }), true);
    assert.equal(isSearchKrisdikaArgs({ query: "test", score_threshold: -0.1 }), false);
    assert.equal(isSearchKrisdikaArgs({ query: "test", score_threshold: 1.1 }), false);
    assert.equal(isSearchKrisdikaArgs({ query: "test", is_latest: "yes" }), false);
    assert.equal(isSearchKrisdikaArgs({ query: "test", response_format: "xml" }), false);
  }, results);

  await testFunction("isSearchOcsArgs accepts valid cases", () => {
    assert.equal(isSearchOcsArgs({ query: "ลักทรัพย์" }), true);
    assert.equal(isSearchOcsArgs({ query: "มาตรา 335", top_k: 3, category: "1D" }), true);
    assert.equal(isSearchOcsArgs({ query: "test", topic: true, content: false }), true);
    assert.equal(isSearchOcsArgs({ query: "test", exclude: "วิ่งราว" }), true);
    assert.equal(isSearchOcsArgs({ query: "" }), false);
    assert.equal(isSearchOcsArgs({ query: "test", top_k: 21 }), false);
    assert.equal(isSearchOcsArgs({ query: "test", topic: "yes" }), false);
  }, results);

  await testFunction("isSearchDekaArgs accepts valid cases", () => {
    assert.equal(isSearchDekaArgs({ query: "ลักทรัพย์" }), true);
    assert.equal(isSearchDekaArgs({ query: "มาตรา 335", top_k: 3, year: "2568" }), true);
    assert.equal(isSearchDekaArgs({ case_no: "664/2569" }), true);
    assert.equal(isSearchDekaArgs({ year_from: "2560", year_to: "2568" }), true);
    assert.equal(isSearchDekaArgs({ query: "test", response_format: "json" }), true);
    assert.equal(isSearchDekaArgs({ query: "ลักทรัพย์", detail: "full" }), true);
    assert.equal(isSearchDekaArgs({ query: "ลักทรัพย์", exclude: "วิ่งราว,ชิงทรัพย์" }), true);
  }, results);

  await testFunction("isSearchDekaArgs rejects invalid cases", () => {
    assert.equal(isSearchDekaArgs(null), false);
    assert.equal(isSearchDekaArgs({}), false);
    assert.equal(isSearchDekaArgs({ query: "" }), false);
    assert.equal(isSearchDekaArgs({ query: "test", top_k: 0 }), false);
    assert.equal(isSearchDekaArgs({ query: "test", top_k: 21 }), false);
    assert.equal(isSearchDekaArgs({ query: "test", response_format: "xml" }), false);
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
    assert.equal(SEARCH_KRISDIKA_TOOL.name, "search_krisdika");
    assert.equal(SEARCH_KRISDIKA_ONLINE_TOOL.name, "search_krisdika_online");
    assert.equal(SEARCH_DEKA_ONLINE_TOOL.name, "search_deka_online");
    assert.equal(KRISDIKA_COLLECTION_INFO_TOOL.name, "krisdika_collection_info");
    assert.equal(KRISDEKA_CONNECTION_INFO_TOOL.name, "krisdeka_connection_info");
    assert.equal(DEKA_CONNECTION_INFO_TOOL.name, "deka_connection_info");
    assert.ok(SEARCH_KRISDIKA_TOOL.inputSchema);
    assert.ok(KRISDIKA_COLLECTION_INFO_TOOL.inputSchema);
    assert.ok(DEKA_CONNECTION_INFO_TOOL.inputSchema);
  }, results);

  printTestSummary(results, "Types");
  return results;
}

export { runTests };
