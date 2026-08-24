#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import {
  DEFAULT_COLLECTION_NAME,
  DEFAULT_DEKA_COLBERT_MAX_TOKENS,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_QDRANT_URL,
  getThaiLawConfig,
  resetCliOverrides,
  resolveHttpListen,
  setCliOverrides,
  validateThaiLawConfig,
} from "../../src/config.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";
import { EnvManager } from "../helpers/env-utils.js";

const results = createTestResults();
const env = new EnvManager();

async function runTests() {
  console.log("🧪 Testing: config.ts\n");

  await testFunction("defaults match the Python prototype", () => {
    resetCliOverrides();
    env.delete("QDRANT_URL");
    env.delete("QDRANT_COLLECTION");
    env.delete("EMBEDDING_URL");
    env.delete("EMBEDDING_MODEL");
    env.delete("THAILAW_TOP_K");
    env.delete("THAILAW_SCORE_THRESHOLD");
    env.delete("THAILAW_COLBERT_MAX_TOKENS");
    env.delete("THAILAW_DEKA_COLBERT_MAX_TOKENS");
    const config = getThaiLawConfig();
    assert.equal(config.qdrantUrl, DEFAULT_QDRANT_URL);
    assert.equal(config.collectionName, DEFAULT_COLLECTION_NAME);
    assert.equal(config.embeddingModel, DEFAULT_EMBEDDING_MODEL);
    assert.equal(config.embeddingUrl, "http://ai-tool:3003/embedding");
    assert.equal(config.embeddingDimensions, 1024);
    assert.equal(config.colbertUrl, "http://ai-tool:3003/embedding");
    assert.equal(config.vectorMode, "colbert");
    assert.equal(config.colbertMaxTokens, 64);
    assert.equal(config.dekaColbertMaxTokens, DEFAULT_DEKA_COLBERT_MAX_TOKENS);
    assert.equal(config.dekaColbertMaxTokens, 2);
    assert.equal(config.rerankModel, "bge-reranker-v2-m3");
    assert.equal(config.rerankUrl, "http://ai-tool:3003/rerank");
    assert.equal(config.rerankEnabled, true);
    assert.equal(config.defaultTopK, 5);
    assert.equal(config.defaultScoreThreshold, 0.3);
    env.restore();
  }, results);

  await testFunction("appends /embeddings to an EMBEDDING_URL that ends at /v1", () => {
    resetCliOverrides();
    env.set("EMBEDDING_URL", "http://127.0.0.1:3003/v1");
    assert.equal(getThaiLawConfig().embeddingUrl, "http://127.0.0.1:3003/v1/embeddings");
    env.set("EMBEDDING_URL", "http://127.0.0.1:3003/v1/embeddings");
    assert.equal(getThaiLawConfig().embeddingUrl, "http://127.0.0.1:3003/v1/embeddings");
    env.restore();
  }, results);

  await testFunction("strips trailing slashes from QDRANT_URL", () => {
    resetCliOverrides();
    env.set("QDRANT_URL", "http://qdrant.example:6333/");
    assert.equal(getThaiLawConfig().qdrantUrl, "http://qdrant.example:6333");
    env.restore();
  }, results);

  await testFunction("rejects invalid URLs", () => {
    const issue = validateThaiLawConfig({
      ...getThaiLawConfig(),
      qdrantUrl: "ftp://bad.example",
    });
    assert.ok(issue);
    assert.ok(issue.includes("QDRANT_URL"));
  }, results);

  await testFunction("CLI overrides environment variables", () => {
    resetCliOverrides();
    env.set("QDRANT_URL", "http://env-qdrant:6333");
    env.set("QDRANT_COLLECTION", "env-collection");
    env.set("EMBEDDING_URL", "http://env-embed/v1/embeddings");
    env.set("EMBEDDING_MODEL", "env-model");
    env.set("THAILAW_TOP_K", "8");
    env.set("THAILAW_HTTP_PORT", "9000");
    env.set("THAILAW_HTTP_HOST", "127.0.0.1");
    setCliOverrides({
      qdrantUrl: "http://cli-qdrant:6333/",
      collectionName: "cli-collection",
      embeddingUrl: "http://cli-embed/v1/embeddings",
      embeddingModel: "cli-model",
      defaultTopK: 3,
      httpPort: 8005,
      httpHost: "0.0.0.0",
    });
    const config = getThaiLawConfig();
    assert.equal(config.qdrantUrl, "http://cli-qdrant:6333");
    assert.equal(config.collectionName, "cli-collection");
    assert.equal(config.embeddingUrl, "http://cli-embed/v1/embeddings");
    assert.equal(config.embeddingModel, "cli-model");
    assert.equal(config.defaultTopK, 3);
    const listen = resolveHttpListen();
    assert.equal(listen.port, 8005);
    assert.equal(listen.host, "0.0.0.0");
    resetCliOverrides();
    env.restore();
  }, results);

  printTestSummary(results, "Config");
  return results;
}

export { runTests };
