#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { CliParseError, parseCliArgs } from "../../src/cli-args.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();

async function runTests() {
  console.log("🧪 Testing: cli-args.ts\n");

  await testFunction("parses long flags and equals form", () => {
    const parsed = parseCliArgs([
      "--qdrant-url=http://qdrant:6333",
      "--embedding-url",
      "http://embed/v1/embeddings",
      "--embedding-model",
      "bge-m3-multi",
      "--rerank-model",
      "Qwen3-VL-Reranker-2B",
      "--http-port",
      "8005",
    ]);
    assert.equal(parsed.help, false);
    assert.equal(parsed.overrides.qdrantUrl, "http://qdrant:6333");
    assert.equal(parsed.overrides.embeddingUrl, "http://embed/v1/embeddings");
    assert.equal(parsed.overrides.embeddingModel, "bge-m3-multi");
    assert.equal(parsed.overrides.rerankModel, "Qwen3-VL-Reranker-2B");
    assert.equal(parsed.overrides.httpPort, 8005);
  }, results);

  await testFunction("parses --no-rerank", () => {
    assert.equal(parseCliArgs(["--no-rerank"]).overrides.rerankEnabled, false);
  }, results);

  await testFunction("parses --vector-mode and --colbert-url", () => {
    const parsed = parseCliArgs([
      "--vector-mode",
      "colbert",
      "--colbert-url",
      "http://127.0.0.1:3005",
      "--colbert-max-tokens",
      "32",
    ]);
    assert.equal(parsed.overrides.vectorMode, "colbert");
    assert.equal(parsed.overrides.colbertUrl, "http://127.0.0.1:3005");
    assert.equal(parsed.overrides.colbertMaxTokens, 32);
  }, results);

  await testFunction("accepts help and version flags", () => {
    assert.equal(parseCliArgs(["-h"]).help, true);
    assert.equal(parseCliArgs(["--version"]).version, true);
  }, results);

  await testFunction("rejects unknown flags", () => {
    assert.throws(() => parseCliArgs(["--nope"]), CliParseError);
  }, results);

  await testFunction("rejects missing values", () => {
    assert.throws(() => parseCliArgs(["--qdrant-url"]), CliParseError);
    assert.throws(() => parseCliArgs(["--http-port", "--help"]), CliParseError);
  }, results);

  printTestSummary(results, "CLI Args");
  return results;
}

export { runTests };
