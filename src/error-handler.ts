/**
 * Concise error handling for the Thai Law MCP server.
 */

import { sanitizeErrorForTransport } from "./diagnostic-sanitizer.js";
import { writeDiagnostic } from "./diagnostic-output.js";
import { getThaiLawConfig, validateThaiLawConfig } from "./config.js";

export interface ErrorContext {
  url?: string;
  target?: string;
  query?: string;
}

export class MCPThaiLawError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MCPThaiLawError";
  }
}

export function createConfigurationError(message: string): MCPThaiLawError {
  return new MCPThaiLawError(`Configuration Error: ${message}`);
}

export function createNetworkError(error: unknown, context: ErrorContext): MCPThaiLawError {
  const target = context.target ?? "upstream service";
  const err = error as { code?: string; name?: string; message?: string; cause?: { code?: string } };

  if (err?.code === "ECONNREFUSED" || err?.cause?.code === "ECONNREFUSED") {
    return new MCPThaiLawError(
      `Connection Error: ${target} is not responding (${context.url ?? "unknown URL"})`,
    );
  }

  if (err?.code === "ENOTFOUND" || err?.code === "EAI_NONAME") {
    let hostname = "unknown";
    try {
      hostname = context.url ? new URL(context.url).hostname : "unknown";
    } catch {
      hostname = "unknown";
    }
    return new MCPThaiLawError(`DNS Error: Cannot resolve hostname "${hostname}"`);
  }

  if (err?.code === "ETIMEDOUT" || err?.name === "AbortError" || err?.code === "ABORT_ERR") {
    return new MCPThaiLawError(`Timeout Error: ${target} is too slow to respond`);
  }

  const errorMsg = err?.message || err?.code || "Connection failed";
  return new MCPThaiLawError(`Network Error: ${errorMsg}. Check ${target} at ${context.url ?? "the configured URL"}.`);
}

export function createServerError(
  status: number,
  statusText: string,
  _responseBody: string,
  context: ErrorContext,
): MCPThaiLawError {
  const target = context.target ?? "Upstream service";

  if (status === 401 || status === 403) {
    return new MCPThaiLawError(`${target} Error (${status}): authentication failed or access denied`);
  }
  if (status === 404) {
    return new MCPThaiLawError(`${target} Error (${status}): collection or endpoint not found`);
  }
  if (status === 429) {
    return new MCPThaiLawError(`${target} Error (${status}): rate limit exceeded`);
  }
  if (status >= 500) {
    return new MCPThaiLawError(`${target} Error (${status}): internal server error`);
  }
  return new MCPThaiLawError(`${target} Error (${status}): ${statusText}`);
}

export function createNoResultsMessage(query: string): string {
  return `ไม่พบข้อมูลที่เกี่ยวข้องกับ "${query}"`;
}

export function handleUncaughtException(error: unknown): void {
  writeDiagnostic("error", "Uncaught Exception:", sanitizeErrorForTransport(error));
  process.exit(1);
}

export function handleUnhandledRejection(reason: unknown, promise: Promise<unknown>): void {
  void promise;
  writeDiagnostic("error", "Unhandled Rejection:", sanitizeErrorForTransport(reason));
  process.exit(1);
}

export function validateEnvironment(): string | null {
  return validateThaiLawConfig(getThaiLawConfig());
}
