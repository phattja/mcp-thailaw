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
    assert.ok(parsed.capabilities.tools.includes("search_krisdika"));
    assert.ok(parsed.capabilities.tools.includes("search_krisdika_online"));
    assert.ok(parsed.capabilities.tools.includes("search_deka"));
    assert.ok(parsed.capabilities.tools.includes("search_deka_online"));
    assert.ok(parsed.capabilities.tools.includes("krisdika_collection_info"));
    assert.ok(parsed.capabilities.tools.includes("deka_collection_info"));
    assert.ok(parsed.capabilities.tools.includes("krisdeka_connection_info"));
    assert.ok(parsed.capabilities.tools.includes("deka_connection_info"));
  }, results);

  await testFunction("createHelpResource describes Thai law tools", () => {
    const help = createHelpResource();
    assert.ok(help.includes("search_krisdika"));
    assert.ok(help.includes("search_krisdika_online"));
    assert.ok(help.includes("https://www.ocs.go.th/searchlaw-law"));
    assert.ok(help.includes("search_deka"));
    assert.ok(help.includes("search_deka_online"));
    assert.ok(help.includes("krisdika_collection_info"));
    assert.ok(help.includes("deka_collection_info"));
    assert.ok(help.includes("krisdeka_connection_info"));
    assert.ok(help.includes("deka_connection_info"));
    assert.ok(help.includes("กฤษฎีกา"));
    assert.ok(help.includes("https://deka.supremecourt.or.th/"));
    assert.ok(help.includes("ฉบับย่อ"));
    assert.ok(!help.includes("Krisdika"));
    assert.ok(help.includes("MCP Streamable HTTP transport"));
  }, results);

  await testFunction("createCliHelpText lists flags", () => {
    const help = createCliHelpText();
    assert.ok(help.includes("--help, -h"));
    assert.ok(help.includes("--version, -v"));
    assert.ok(help.includes("STDIO is the default transport"));
    assert.ok(help.includes("--http-port or THAILAW_HTTP_PORT enables HTTP transport"));
    assert.ok(help.includes("--qdrant-url"));
    assert.ok(help.includes("--embedding-url"));
    assert.ok(help.includes("CONFIGURATION.md"));
  }, results);

  printTestSummary(results, "Resources");
  return results;
}

export { runTests };
