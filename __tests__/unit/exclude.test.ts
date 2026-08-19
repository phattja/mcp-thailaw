#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { filterExcluded, parseExcludeWords, textHasExcludedWord } from "../../src/exclude.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();

async function runTests() {
  console.log("🧪 Testing: exclude.ts\n");

  await testFunction("parseExcludeWords splits comma lists", () => {
    assert.deepEqual(parseExcludeWords("วิ่งราว, ชิงทรัพย์,ปล้น"), ["วิ่งราว", "ชิงทรัพย์", "ปล้น"]);
    assert.deepEqual(parseExcludeWords(""), []);
    assert.deepEqual(parseExcludeWords(undefined), []);
  }, results);

  await testFunction("textHasExcludedWord matches any word", () => {
    assert.equal(textHasExcludedWord("ความผิดฐานวิ่งราวทรัพย์", ["วิ่งราว", "ชิงทรัพย์"]), true);
    assert.equal(textHasExcludedWord("ความผิดฐานลักทรัพย์", ["วิ่งราว", "ชิงทรัพย์"]), false);
  }, results);

  await testFunction("filterExcluded drops matching items", () => {
    const kept = filterExcluded(
      [{ text: "ลักทรัพย์" }, { text: "วิ่งราวทรัพย์" }],
      ["วิ่งราว"],
      (item) => item.text,
    );
    assert.deepEqual(kept, [{ text: "ลักทรัพย์" }]);
  }, results);

  printTestSummary(results, "Exclude");
  return results;
}

export { runTests };
