#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { createCliHelpText, createConfigResource, createHelpResource } from "../../src/resources.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();

async function runTests() {
  console.log("🧪 Testing: resources.ts\n");

  await testFunction("createConfigResource is valid JSON", () => {
    const parsed = JSON.parse(createConfigResource());
    assert.equal(parsed.serverInfo.name, "phattja/mcp-thailaw");
    assert.ok(parsed.capabilities.tools.includes("search_thai_law"));
    assert.ok(parsed.capabilities.tools.includes("thailaw_collection_info"));
  }, results);

  await testFunction("createHelpResource describes Thai law tools", () => {
    const help = createHelpResource();
    assert.ok(help.includes("search_thai_law"));
    assert.ok(help.includes("thailaw_collection_info"));
    assert.ok(help.includes("MCP Streamable HTTP transport"));
  }, results);

  await testFunction("createCliHelpText lists flags", () => {
    const help = createCliHelpText();
    assert.ok(help.includes("--help, -h"));
    assert.ok(help.includes("--version, -v"));
    assert.ok(help.includes("STDIO is the default transport"));
    assert.ok(help.includes("MCP_HTTP_PORT enables HTTP transport"));
    assert.ok(help.includes("CONFIGURATION.md"));
  }, results);

  printTestSummary(results, "Resources");
  return results;
}

export { runTests };
