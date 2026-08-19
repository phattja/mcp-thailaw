#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import {
  filterCancelledTitles,
  filterExcluded,
  includeCancelledTitles,
  parseExcludeWords,
  textHasExcludedWord,
  titleLooksCancelled,
} from "../../src/exclude.js";
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

  await testFunction("cancelled titles drop unless include=(ยกเลิก) or cancel", () => {
    assert.equal(titleLooksCancelled("พระราชบัญญัติตัวอย่าง (ยกเลิก)"), true);
    assert.equal(titleLooksCancelled("ประมวลกฎหมายอาญา"), false);
    assert.equal(includeCancelledTitles(), false);
    assert.equal(includeCancelledTitles("(ยกเลิก)"), true);
    assert.equal(includeCancelledTitles("cancel"), true);
    const items = [
      { title: "ประมวลกฎหมายอาญา" },
      { title: "พระราชบัญญัติตัวอย่าง (ยกเลิก)" },
    ];
    assert.deepEqual(filterCancelledTitles(items, undefined, (item) => item.title), [
      { title: "ประมวลกฎหมายอาญา" },
    ]);
    assert.equal(filterCancelledTitles(items, "cancel", (item) => item.title).length, 2);
    assert.equal(filterCancelledTitles(items, "(ยกเลิก)", (item) => item.title).length, 2);
  }, results);

  printTestSummary(results, "Exclude");
  return results;
}

export { runTests };
