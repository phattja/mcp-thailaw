export interface CliOverrides {
  qdrantUrl?: string;
  collectionName?: string;
  qdrantApiKey?: string;
  embeddingUrl?: string;
  embeddingModel?: string;
  embeddingApiKey?: string;
  embeddingDimensions?: number;
  colbertUrl?: string;
  vectorMode?: "colbert" | "dense";
  vectorName?: string;
  colbertMaxTokens?: number;
  rerankUrl?: string;
  rerankModel?: string;
  rerankApiKey?: string;
  rerankEnabled?: boolean;
  defaultTopK?: number;
  defaultScoreThreshold?: number;
  maxResults?: number;
  fetchTimeoutMs?: number;
  httpPort?: number;
  httpHost?: string;
}

export interface ParsedCli {
  help: boolean;
  version: boolean;
  overrides: CliOverrides;
}

export class CliParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliParseError";
  }
}

type StringFlag =
  | "qdrantUrl"
  | "collectionName"
  | "qdrantApiKey"
  | "embeddingUrl"
  | "embeddingModel"
  | "embeddingApiKey"
  | "colbertUrl"
  | "vectorName"
  | "rerankUrl"
  | "rerankModel"
  | "rerankApiKey"
  | "httpHost";

const STRING_FLAGS: Record<string, StringFlag> = {
  "--qdrant-url": "qdrantUrl",
  "--qdrant-collection": "collectionName",
  "--collection": "collectionName",
  "--qdrant-api-key": "qdrantApiKey",
  "--embedding-url": "embeddingUrl",
  "--embedding-model": "embeddingModel",
  "--embedding-api-key": "embeddingApiKey",
  "--colbert-url": "colbertUrl",
  "--vector-name": "vectorName",
  "--rerank-url": "rerankUrl",
  "--rerank-model": "rerankModel",
  "--rerank-api-key": "rerankApiKey",
  "--http-host": "httpHost",
};

type NumberFlag =
  | "defaultTopK"
  | "defaultScoreThreshold"
  | "maxResults"
  | "fetchTimeoutMs"
  | "httpPort"
  | "embeddingDimensions"
  | "colbertMaxTokens";

const NUMBER_FLAGS: Record<string, { key: NumberFlag; min: number; max: number; integer: boolean }> = {
  "--vector-size": { key: "embeddingDimensions", min: 32, max: 8192, integer: true },
  "--colbert-max-tokens": { key: "colbertMaxTokens", min: 4, max: 512, integer: true },
  "--top-k": { key: "defaultTopK", min: 1, max: 100, integer: true },
  "--score-threshold": { key: "defaultScoreThreshold", min: 0, max: 64, integer: false },
  "--max-results": { key: "maxResults", min: 1, max: 100, integer: true },
  "--fetch-timeout-ms": { key: "fetchTimeoutMs", min: 1000, max: 300000, integer: true },
  "--http-port": { key: "httpPort", min: 1, max: 65535, integer: true },
  "--port": { key: "httpPort", min: 1, max: 65535, integer: true },
};

function splitToken(token: string): { flag: string; inline?: string } {
  const eq = token.indexOf("=");
  if (eq === -1) {
    return { flag: token };
  }
  return { flag: token.slice(0, eq), inline: token.slice(eq + 1) };
}

function takeValue(flag: string, inline: string | undefined, rest: string[]): string {
  if (inline !== undefined) {
    if (inline.trim() === "") {
      throw new CliParseError(`Missing value for ${flag}`);
    }
    return inline;
  }
  const next = rest.shift();
  if (next === undefined || next.startsWith("-")) {
    throw new CliParseError(`Missing value for ${flag}`);
  }
  return next;
}

function parseNumber(flag: string, raw: string, spec: { min: number; max: number; integer: boolean }): number {
  const parsed = spec.integer ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(parsed) || (spec.integer && !Number.isInteger(parsed))) {
    throw new CliParseError(`Invalid number for ${flag}: ${raw}`);
  }
  if (parsed < spec.min || parsed > spec.max) {
    throw new CliParseError(`${flag} must be between ${spec.min} and ${spec.max}`);
  }
  return parsed;
}

export function parseCliArgs(argv: string[]): ParsedCli {
  const rest = [...argv];
  const parsed: ParsedCli = {
    help: false,
    version: false,
    overrides: {},
  };

  while (rest.length > 0) {
    const token = rest.shift() as string;
    const { flag, inline } = splitToken(token);

    if (flag === "--help" || flag === "-h") {
      parsed.help = true;
      continue;
    }
    if (flag === "--version" || flag === "-v") {
      parsed.version = true;
      continue;
    }
    if (flag === "--rerank") {
      const raw = takeValue(flag, inline, rest).trim().toLowerCase();
      parsed.overrides.rerankEnabled = !["0", "false", "no", "off"].includes(raw);
      continue;
    }
    if (flag === "--no-rerank") {
      parsed.overrides.rerankEnabled = false;
      continue;
    }
    if (flag === "--vector-mode") {
      const raw = takeValue(flag, inline, rest).trim().toLowerCase();
      if (["colbert", "multi", "multi-vector", "multivector", "late"].includes(raw)) {
        parsed.overrides.vectorMode = "colbert";
      } else if (["dense", "single", "cls"].includes(raw)) {
        parsed.overrides.vectorMode = "dense";
      } else {
        throw new CliParseError(`Invalid value for ${flag}: ${raw}`);
      }
      continue;
    }

    const stringKey = STRING_FLAGS[flag];
    if (stringKey) {
      parsed.overrides[stringKey] = takeValue(flag, inline, rest).trim();
      continue;
    }

    const numberSpec = NUMBER_FLAGS[flag];
    if (numberSpec) {
      const raw = takeValue(flag, inline, rest);
      const value = parseNumber(flag, raw, numberSpec);
      if (numberSpec.key === "httpPort") {
        parsed.overrides.httpPort = value;
      } else if (numberSpec.key === "defaultTopK") {
        parsed.overrides.defaultTopK = value;
      } else if (numberSpec.key === "defaultScoreThreshold") {
        parsed.overrides.defaultScoreThreshold = value;
      } else if (numberSpec.key === "maxResults") {
        parsed.overrides.maxResults = value;
      } else if (numberSpec.key === "embeddingDimensions") {
        parsed.overrides.embeddingDimensions = value;
      } else if (numberSpec.key === "colbertMaxTokens") {
        parsed.overrides.colbertMaxTokens = value;
      } else {
        parsed.overrides.fetchTimeoutMs = value;
      }
      continue;
    }

    throw new CliParseError(`Unknown option: ${flag}`);
  }

  return parsed;
}
