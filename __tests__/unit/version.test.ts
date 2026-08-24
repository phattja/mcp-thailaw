#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { packageVersion } from "../../src/version.js";
import { testFunction, createTestResults, printTestSummary, TestResult } from "../helpers/test-utils.js";

const results = createTestResults();

export async function runTests(): Promise<TestResult> {
  console.log("🧪 Testing: version.ts\n");

  await testFunction("packageVersion is a non-empty string", () => {
    assert.equal(typeof packageVersion, "string");
    assert.ok(packageVersion.length > 0);
  }, results);

  await testFunction("packageVersion matches package.json", () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is a compile-time constant
    const pkgJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf-8"));
    assert.equal(packageVersion, pkgJson.version);
  }, results);

  await testFunction("packageVersion matches semver format", () => {
    assert.match(packageVersion, /^\d+\.\d+\.\d+/);
  }, results);

  await testFunction("MCP registry marks API keys as secret", () => {
    const manifest = JSON.parse(
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is a compile-time constant
      readFileSync(new URL("../../.mcp/server.json", import.meta.url), "utf-8"),
    );
    const variables = manifest.packages
      .flatMap((entry: { environmentVariables?: unknown[] }) => entry.environmentVariables ?? []);
    for (const name of ["QDRANT_API_KEY", "EMBEDDING_API_KEY"]) {
      const variable = variables.find((entry: { name?: string }) => entry.name === name);
      assert.ok(variable, `${name} must be declared in the MCP registry manifest`);
      assert.equal(variable.isSecret, true, `${name} must be marked secret`);
    }
  }, results);

  printTestSummary(results, "Version Module");
  return results;
}
