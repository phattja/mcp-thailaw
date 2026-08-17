#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { createMcpServer } from "../../src/index.js";
import { packageVersion } from "../../src/version.js";
import { isSearchThaiLawArgs } from "../../src/types.js";
import { createConfigResource, createHelpResource } from "../../src/resources.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();

async function runTests() {
  console.log("🧪 Integration Testing: index.ts\n");

  await testFunction("Package version is exported", () => {
    assert.ok(packageVersion);
    assert.match(packageVersion, /^\d+\.\d+\.\d+/);
  }, results);

  await testFunction("createMcpServer returns a server", () => {
    const server = createMcpServer();
    assert.ok(server);
  }, results);

  await testFunction("search type guard integration", () => {
    assert.ok(isSearchThaiLawArgs({ query: "ลักทรัพย์", top_k: 3 }));
    assert.ok(!isSearchThaiLawArgs({ query: "" }));
    assert.ok(!isSearchThaiLawArgs(null));
  }, results);

  await testFunction("config and help resources are available", () => {
    const config = JSON.parse(createConfigResource());
    assert.equal(config.serverInfo.name, "phattja/mcp-thailaw");
    assert.ok(createHelpResource().includes("QDRANT_URL"));
  }, results);

  printTestSummary(results, "Main Index");
  return results;
}

export { runTests };
