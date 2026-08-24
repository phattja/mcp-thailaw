#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { adToBe, beToAd } from "../../src/calendar.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();

async function runTests() {
  console.log("🧪 Testing: calendar.ts\n");

  await testFunction("adToBe converts Gregorian years", () => {
    assert.equal(adToBe(2001), 2544);
    assert.equal(adToBe(2026), 2569);
  }, results);

  await testFunction("adToBe leaves Buddhist Era years unchanged", () => {
    assert.equal(adToBe(2544), 2544);
    assert.equal(adToBe(2568), 2568);
  }, results);

  await testFunction("beToAd converts Buddhist Era years for Qdrant filters", () => {
    assert.equal(beToAd(2544), 2001);
    assert.equal(beToAd(2568), 2025);
  }, results);

  await testFunction("beToAd leaves Gregorian years unchanged", () => {
    assert.equal(beToAd(2001), 2001);
    assert.equal(beToAd(2026), 2026);
  }, results);

  printTestSummary(results, "Calendar");
  return results;
}

export { runTests };
