#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { packageVersion } from "../../src/version.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();

async function runTests() {
  console.log("🧪 Integration Testing: cli.ts\n");

  await testFunction("source CLI version flags print the package version", () => {
    for (const flag of ["--version", "-v"]) {
      const env = { ...process.env };
      delete env.THAILAW_HTTP_PORT;
      const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", flag], {
        cwd: process.cwd(),
        env,
        encoding: "utf8",
        timeout: 8000,
      });
      assert.equal(result.status, 0, `${flag} failed: ${result.stderr}`);
      assert.equal(result.stdout, `${packageVersion}\n`);
    }
  }, results);

  await testFunction("source CLI help flags print configuration guidance", () => {
    for (const flag of ["--help", "-h"]) {
      const env = { ...process.env };
      delete env.THAILAW_HTTP_PORT;
      const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", flag], {
        cwd: process.cwd(),
        env,
        encoding: "utf8",
        timeout: 8000,
      });
      assert.equal(result.status, 0, `${flag} failed: ${result.stderr}`);
      assert.ok(result.stdout.includes("--help, -h"));
      assert.ok(result.stdout.includes("--version, -v"));
      assert.ok(result.stdout.includes("STDIO is the default transport"));
      assert.ok(result.stdout.includes("--http-port or THAILAW_HTTP_PORT enables HTTP transport"));
      assert.ok(result.stdout.includes("--qdrant-url"));
      assert.ok(result.stdout.includes("--embedding-url"));
      assert.ok(result.stdout.includes("CONFIGURATION.md"));
    }
  }, results);

  await testFunction("unknown startup flag exits with an error", () => {
    const env = { ...process.env };
    delete env.THAILAW_HTTP_PORT;
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "--nope"], {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
      timeout: 8000,
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("Unknown option: --nope"));
  }, results);

  printTestSummary(results, "CLI");
  return results;
}

export { runTests };
