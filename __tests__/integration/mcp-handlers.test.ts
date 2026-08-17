#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/index.js";
import { searchCache } from "../../src/search-cache.js";
import { FetchMocker, createMockFetch } from "../helpers/mock-fetch.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();
const fetchMocker = new FetchMocker();

async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpServer = createMcpServer();
  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} },
  );
  await mcpServer.connect(serverTransport);
  await client.connect(clientTransport);
  return { client };
}

function mockSearchStack() {
  fetchMocker.mock(async (url) => {
    const target = url.toString();
    if (target.includes("/v1/embeddings") || target.includes("3003")) {
      return createMockFetch({
        json: { data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }] },
      })(url);
    }
    if (target.includes("/points/scroll")) {
      return createMockFetch({
        json: { result: { points: [] } },
      })(url);
    }
    if (target.includes("/points/query")) {
      return createMockFetch({
        json: {
          result: {
            points: [{
              id: "1",
              score: 0.88,
              payload: {
                title: "ประมวลกฎหมายอาญา",
                law_code: "A01",
                reference_url: "https://example.com/law",
                text: "มาตรา 334 ผู้ใดลักทรัพย์",
              },
            }],
          },
        },
      })(url);
    }
    if (target.includes("/collections/")) {
      return createMockFetch({
        json: {
          result: {
            status: "green",
            points_count: 12,
            indexed_vectors_count: 10,
            config: { params: { vectors: { size: 1024, distance: "Cosine" } } },
          },
        },
      })(url);
    }
    return createMockFetch({ status: 404, ok: false, statusText: "Not Found" })(url);
  });
}

async function runTests() {
  console.log("🧪 Integration Testing: MCP handlers\n");

  await testFunction("tools/list returns Thai law tools", async () => {
    const { client } = await connect();
    const result = await client.listTools();
    assert.ok(result.tools.find((tool) => tool.name === "search_thai_law"));
    assert.ok(result.tools.find((tool) => tool.name === "thailaw_collection_info"));
    await client.close();
  }, results);

  await testFunction("tools/call search_thai_law returns formatted text", async () => {
    mockSearchStack();
    searchCache.clear();
    const { client } = await connect();
    const result = await client.callTool({
      name: "search_thai_law",
      arguments: { query: "ลักทรัพย์" },
    });
    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    assert.ok(text.includes("ประมวลกฎหมายอาญา"));
    assert.ok(text.includes("มาตรา 334"));
    await client.close();
    fetchMocker.restore();
  }, results);

  await testFunction("tools/call search_thai_law supports json format", async () => {
    mockSearchStack();
    searchCache.clear();
    const { client } = await connect();
    const result = await client.callTool({
      name: "search_thai_law",
      arguments: { query: "ลักทรัพย์", response_format: "json" },
    });
    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    const parsed = JSON.parse(text);
    assert.equal(parsed.query, "ลักทรัพย์");
    assert.equal(parsed.results[0].law_code, "A01");
    await client.close();
    fetchMocker.restore();
  }, results);

  await testFunction("tools/call thailaw_collection_info returns stats", async () => {
    mockSearchStack();
    searchCache.clear();
    const { client } = await connect();
    const result = await client.callTool({
      name: "thailaw_collection_info",
      arguments: { refresh: true },
    });
    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    const parsed = JSON.parse(text);
    assert.equal(parsed.status, "green");
    assert.equal(parsed.vector_size, 1024);
    await client.close();
    fetchMocker.restore();
  }, results);

  await testFunction("unknown tool throws", async () => {
    const { client } = await connect();
    await assert.rejects(
      () => client.callTool({ name: "missing_tool", arguments: {} }),
      /Unknown tool/,
    );
    await client.close();
  }, results);

  await testFunction("invalid search args throw", async () => {
    const { client } = await connect();
    await assert.rejects(
      () => client.callTool({ name: "search_thai_law", arguments: { query: "" } }),
      /Invalid arguments/,
    );
    await client.close();
  }, results);

  await testFunction("resources/list and read work", async () => {
    const { client } = await connect();
    const listed = await client.listResources();
    assert.ok(listed.resources.find((resource) => resource.uri === "config://server-config"));
    const config = await client.readResource({ uri: "config://server-config" });
    const parsed = JSON.parse(config.contents[0].text as string);
    assert.equal(parsed.serverInfo.name, "phattja/mcp-thailaw");
    const help = await client.readResource({ uri: "help://usage-guide" });
    assert.ok((help.contents[0].text as string).includes("search_thai_law"));
    await client.close();
  }, results);

  printTestSummary(results, "MCP Handlers");
  return results;
}

export { runTests };
