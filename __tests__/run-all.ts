#!/usr/bin/env tsx

import { TestResult } from "./helpers/test-utils.js";

import { runTests as runLoggingTests } from "./unit/logging.test.js";
import { runTests as runTestUtilsTests } from "./unit/test-utils.test.js";
import { runTests as runDiagnosticSanitizerTests } from "./unit/diagnostic-sanitizer.test.js";
import { runTests as runDiagnosticOutputTests } from "./unit/diagnostic-output.test.js";
import { runTests as runTypesTests } from "./unit/types.test.js";
import { runTests as runConfigTests } from "./unit/config.test.js";
import { runTests as runCliArgsTests } from "./unit/cli-args.test.js";
import { runTests as runCacheTests } from "./unit/cache.test.js";
import { runTests as runSearchCacheTests } from "./unit/search-cache.test.js";
import { runTests as runErrorHandlerTests } from "./unit/error-handler.test.js";
import { runTests as runResourcesTests } from "./unit/resources.test.js";
import { runTests as runSearchTests } from "./unit/search.test.js";
import { runTests as runStatuteTests } from "./unit/statute.test.js";
import { runTests as runTimelineTests } from "./unit/timeline.test.js";
import { runTests as runEmbeddingTests } from "./unit/embedding.test.js";
import { runTests as runRerankTests } from "./unit/rerank.test.js";
import { runTests as runQdrantTests } from "./unit/qdrant.test.js";
import { runTests as runDekaTests } from "./unit/deka.test.js";
import { runTests as runHttpServerUnitTests } from "./unit/http-server.test.js";
import { runTests as runVersionTests } from "./unit/version.test.js";
import { runTests as runHttpSecurityTests } from "./unit/http-security.test.js";
import { runTests as runHttpServerTests } from "./integration/http-server.test.js";
import { runTests as runIndexTests } from "./integration/index.test.js";
import { runTests as runMcpHandlersTests } from "./integration/mcp-handlers.test.js";
import { runTests as runCliTests } from "./integration/cli.test.js";

interface TestSuite {
  name: string;
  category: "unit" | "integration";
  run: () => Promise<TestResult>;
}

const testSuites: TestSuite[] = [
  { name: "Logging", category: "unit", run: runLoggingTests },
  { name: "Test Utilities", category: "unit", run: runTestUtilsTests },
  { name: "Diagnostic Sanitizer", category: "unit", run: runDiagnosticSanitizerTests },
  { name: "Diagnostic Output", category: "unit", run: runDiagnosticOutputTests },
  { name: "Types", category: "unit", run: runTypesTests },
  { name: "Config", category: "unit", run: runConfigTests },
  { name: "CLI Args", category: "unit", run: runCliArgsTests },
  { name: "Cache", category: "unit", run: runCacheTests },
  { name: "Search Cache", category: "unit", run: runSearchCacheTests },
  { name: "Error Handler", category: "unit", run: runErrorHandlerTests },
  { name: "Resources", category: "unit", run: runResourcesTests },
  { name: "Search", category: "unit", run: runSearchTests },
  { name: "Statute", category: "unit", run: runStatuteTests },
  { name: "Timeline", category: "unit", run: runTimelineTests },
  { name: "Embedding", category: "unit", run: runEmbeddingTests },
  { name: "Rerank", category: "unit", run: runRerankTests },
  { name: "Qdrant", category: "unit", run: runQdrantTests },
  { name: "Deka", category: "unit", run: runDekaTests },
  { name: "HTTP Server", category: "unit", run: runHttpServerUnitTests },
  { name: "Version", category: "unit", run: runVersionTests },
  { name: "HTTP Security", category: "unit", run: runHttpSecurityTests },
  { name: "HTTP Server", category: "integration", run: runHttpServerTests },
  { name: "Main Index", category: "integration", run: runIndexTests },
  { name: "MCP Handlers", category: "integration", run: runMcpHandlersTests },
  { name: "CLI", category: "integration", run: runCliTests },
];

async function runAllTests() {
  console.log("Thai Law MCP Server - Test Suite\n");
  console.log("===============================================\n");

  const allResults: Array<{ suite: string; category: string; result: TestResult }> = [];
  let totalPassed = 0;
  let totalFailed = 0;

  console.log("UNIT TESTS\n");
  for (const suite of testSuites.filter((item) => item.category === "unit")) {
    try {
      const result = await suite.run();
      allResults.push({ suite: suite.name, category: suite.category, result });
      totalPassed += result.passed;
      totalFailed += result.failed;
      console.log("");
    } catch (error) {
      console.error(`Error running ${suite.name} tests:`, error);
      totalFailed++;
    }
  }

  console.log("\nINTEGRATION TESTS\n");
  for (const suite of testSuites.filter((item) => item.category === "integration")) {
    try {
      const result = await suite.run();
      allResults.push({ suite: suite.name, category: suite.category, result });
      totalPassed += result.passed;
      totalFailed += result.failed;
      console.log("");
    } catch (error) {
      console.error(`Error running ${suite.name} tests:`, error);
      totalFailed++;
    }
  }

  console.log("\n===============================================");
  console.log("FINAL TEST SUMMARY\n");
  console.log(`Total Tests: ${totalPassed + totalFailed}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);

  for (const { suite, category, result } of allResults) {
    const icon = result.failed === 0 ? "ok" : "FAIL";
    console.log(`  ${icon} ${suite} (${category}): ${result.passed}/${result.passed + result.failed}`);
  }

  if (totalFailed > 0) {
    console.log("\nFailed Tests:");
    for (const { suite, result } of allResults) {
      if (result.errors.length > 0) {
        console.log(`\n   ${suite}:`);
        result.errors.forEach((error) => console.log(`     ${error}`));
      }
    }
    process.exit(1);
  }

  console.log("\nAll tests passed.");
  process.exit(0);
}

runAllTests().catch((error) => {
  console.error("Fatal error running tests:", error);
  process.exit(1);
});
