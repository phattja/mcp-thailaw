import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  SetLevelRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  SEARCH_THAI_LAW_TOOL,
  COLLECTION_INFO_TOOL,
  isSearchThaiLawArgs,
  isCollectionInfoArgs,
} from "./types.js";
import { logMessage, setLogLevel, getCurrentLogLevel } from "./logging.js";
import { performThaiLawSearch, performCollectionInfo } from "./search.js";
import { createConfigResource, createHelpResource } from "./resources.js";
import { createHttpServer, resolveBindHost } from "./http-server.js";
import {
  initializeDiagnosticSanitizer,
  sanitizeErrorForTransport,
} from "./diagnostic-sanitizer.js";
import { writeDiagnostic } from "./diagnostic-output.js";
import { getThaiLawConfig, resolveHttpListen, SERVER_NAME, validateThaiLawConfig } from "./config.js";
import { packageVersion } from "./version.js";

/**
 * Creates and configures a new McpServer with all handlers registered.
 * Called once per HTTP session, or once for STDIO mode.
 */
export function createMcpServer(): McpServer {
  const mcpServer = new McpServer(
    {
      name: SERVER_NAME,
      version: packageVersion,
    },
    {
      capabilities: {
        logging: {},
        resources: {},
        tools: {},
      },
    },
  );

  const server = mcpServer.server;

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logMessage(mcpServer, "debug", "Handling list_tools request");
    return {
      tools: [SEARCH_THAI_LAW_TOOL, COLLECTION_INFO_TOOL],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    logMessage(mcpServer, "debug", `Handling call_tool request: ${name}`);

    try {
      if (name === "search_thai_law") {
        if (!isSearchThaiLawArgs(args)) {
          throw new Error("Invalid arguments for Thai law search");
        }

        const result = await performThaiLawSearch(mcpServer, args, extra.signal);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      if (name === "thailaw_collection_info") {
        if (!isCollectionInfoArgs(args)) {
          throw new Error("Invalid arguments for collection info");
        }

        const result = await performCollectionInfo(
          mcpServer,
          args?.refresh ?? false,
          extra.signal,
        );
        return {
          content: [{ type: "text", text: result }],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      const safeError = sanitizeErrorForTransport(error);
      logMessage(mcpServer, "error", `Tool execution error: ${safeError.message}`, {
        tool: name,
        args,
        error: safeError.stack,
      });
      throw safeError;
    }
  });

  server.setRequestHandler(SetLevelRequestSchema, async (request) => {
    const { level } = request.params;
    logMessage(mcpServer, "info", `Setting log level to: ${level}`);
    setLogLevel(mcpServer, level);
    return {};
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    logMessage(mcpServer, "debug", "Handling list_resources request");
    return {
      resources: [
        {
          uri: "config://server-config",
          mimeType: "application/json",
          name: "Server Configuration",
          description: "Current server configuration and environment variables",
        },
        {
          uri: "help://usage-guide",
          mimeType: "text/markdown",
          name: "Usage Guide",
          description: "How to use the Thai Law MCP server",
        },
      ],
    };
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    logMessage(mcpServer, "debug", "Handling list_resource_templates request");
    return { resourceTemplates: [] };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    logMessage(mcpServer, "debug", `Handling read_resource request for: ${uri}`);

    switch (uri) {
      case "config://server-config":
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: createConfigResource(mcpServer),
            },
          ],
        };
      case "help://usage-guide":
        return {
          contents: [
            {
              uri,
              mimeType: "text/markdown",
              text: createHelpResource(),
            },
          ],
        };
      default:
        throw sanitizeErrorForTransport(new Error(`Unknown resource: ${uri}`));
    }
  });

  return mcpServer;
}

export async function main() {
  initializeDiagnosticSanitizer();

  const configIssue = validateThaiLawConfig();
  if (configIssue) {
    writeDiagnostic("error", configIssue);
    process.exit(1);
  }

  const listen = resolveHttpListen();
  if (listen.portError) {
    writeDiagnostic("error", listen.portError);
    process.exit(1);
  }
  if (listen.port !== undefined) {
    const port = listen.port;
    const host = resolveBindHost(listen.host);
    writeDiagnostic("log", `Starting HTTP transport on ${host}:${port}`);
    const app = await createHttpServer(createMcpServer, port);

    const httpServer = app.listen(port, host, () => {
      writeDiagnostic("log", `HTTP server listening on ${host}:${port}`);
      writeDiagnostic("log", `Health check: http://localhost:${port}/health`);
      writeDiagnostic("log", `MCP endpoint: http://localhost:${port}/mcp`);
    });

    const shutdown = (signal: string) => {
      writeDiagnostic("log", `Received ${signal}. Shutting down HTTP server...`);
      httpServer.close(() => {
        writeDiagnostic("log", "HTTP server closed");
        process.exit(0);
      });
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } else {
    const mcpServer = createMcpServer();
    const config = getThaiLawConfig();

    if (process.stdin.isTTY) {
      writeDiagnostic("error", `Thai Law MCP Server v${packageVersion} - Ready`);
      writeDiagnostic("error", `Qdrant: ${config.qdrantUrl}  collection=${config.collectionName}`);
      writeDiagnostic("error", `Embeddings: ${config.embeddingUrl}  model=${config.embeddingModel}`);
      writeDiagnostic("error", "Waiting for MCP client connection via STDIO...\n");
    }

    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);

    logMessage(mcpServer, "info", `Thai Law MCP Server v${packageVersion} connected via STDIO`);
    logMessage(mcpServer, "info", `Log level: ${getCurrentLogLevel(mcpServer)}`);
    logMessage(mcpServer, "info", `Qdrant: ${config.qdrantUrl} collection=${config.collectionName}`);
    logMessage(mcpServer, "info", `Embeddings: ${config.embeddingModel}`);
  }
}
