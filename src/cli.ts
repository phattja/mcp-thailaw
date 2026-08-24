#!/usr/bin/env node

import { handleUncaughtException, handleUnhandledRejection } from "./error-handler.js";
import {
  initializeDiagnosticSanitizer,
  sanitizeErrorForTransport,
} from "./diagnostic-sanitizer.js";
import { writeDiagnostic } from "./diagnostic-output.js";
import { packageVersion } from "./version.js";
import { CliParseError, parseCliArgs } from "./cli-args.js";
import { envWithCliOverrides, setCliOverrides } from "./config.js";

process.on("uncaughtException", handleUncaughtException);
process.on("unhandledRejection", handleUnhandledRejection);

let parsed;
try {
  parsed = parseCliArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof CliParseError ? error.message : String(error);
  writeDiagnostic("error", message);
  writeDiagnostic("error", "Use --help for usage.");
  process.exit(1);
}

if (parsed.help) {
  const { createCliHelpText } = await import("./resources.js");
  writeDiagnostic("log", createCliHelpText());
  process.exit(0);
}

if (parsed.version) {
  writeDiagnostic("log", packageVersion);
  process.exit(0);
}

setCliOverrides(parsed.overrides);
initializeDiagnosticSanitizer(envWithCliOverrides());

void import("./index.js")
  .then(({ main }) => main())
  .catch((error) => {
    writeDiagnostic("error", "Failed to start server:", sanitizeErrorForTransport(error));
    process.exit(1);
  });
