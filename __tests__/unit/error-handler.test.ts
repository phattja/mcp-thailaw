#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import {
  MCPThaiLawError,
  createConfigurationError,
  createNetworkError,
  createNoResultsMessage,
  createServerError,
  validateEnvironment,
} from "../../src/error-handler.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";
import { EnvManager } from "../helpers/env-utils.js";

const results = createTestResults();
const env = new EnvManager();

async function runTests() {
  console.log("🧪 Testing: error-handler.ts\n");

  await testFunction("MCPThaiLawError is an Error", () => {
    const error = new MCPThaiLawError("test");
    assert.ok(error instanceof Error);
    assert.equal(error.name, "MCPThaiLawError");
  }, results);

  await testFunction("createConfigurationError", () => {
    const error = createConfigurationError("bad url");
    assert.ok(error.message.includes("Configuration Error"));
    assert.ok(error.message.includes("bad url"));
  }, results);

  await testFunction("createNetworkError maps common codes", () => {
    const refused = createNetworkError({ code: "ECONNREFUSED" }, {
      url: "http://localhost:6333",
      target: "Qdrant",
    });
    assert.ok(refused.message.includes("Connection Error"));

    const dns = createNetworkError({ code: "ENOTFOUND" }, {
      url: "http://missing.example",
      target: "Qdrant",
    });
    assert.ok(dns.message.includes("DNS Error"));
    assert.ok(dns.message.includes("missing.example"));
  }, results);

  await testFunction("createServerError maps HTTP statuses", () => {
    assert.ok(createServerError(404, "Not Found", "", { target: "Qdrant" }).message.includes("404"));
    assert.ok(createServerError(429, "Too Many", "", { target: "embedding server" }).message.includes("rate limit"));
    assert.ok(createServerError(500, "Err", "", { target: "Qdrant" }).message.includes("internal server error"));
  }, results);

  await testFunction("createNoResultsMessage is Thai", () => {
    assert.equal(createNoResultsMessage("ลักทรัพย์"), 'ไม่พบข้อมูลที่เกี่ยวข้องกับ "ลักทรัพย์"');
  }, results);

  await testFunction("validateEnvironment accepts defaults", () => {
    env.delete("QDRANT_URL");
    env.delete("EMBEDDING_URL");
    assert.equal(validateEnvironment(), null);
    env.restore();
  }, results);

  printTestSummary(results, "Error Handler");
  return results;
}

export { runTests };
