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
    if (target.includes("/embed_all") || target.includes("3005")) {
      return createMockFetch({
        json: [[0.1, 0.2, 0.3], [0.2, 0.1, 0.0]],
      })(url);
    }
    if (target.includes("/embedding") && !target.includes("/embeddings")) {
      return createMockFetch({
        json: [{ index: 0, embedding: [[1, 0, 0], [0, 1, 0]] }],
      })(url);
    }
    if (
      target.includes("/embed")
      || target.includes("/embeddings")
      || target.includes("3004")
      || target.includes("3003")
    ) {
      return createMockFetch({
        json: { data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }] },
      })(url);
    }
    if (target.includes("/rerank")) {
      return createMockFetch({
        json: [{ index: 0, score: 0.88 }],
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
    assert.ok(result.tools.find((tool) => tool.name === "search_krisdika"));
    assert.ok(result.tools.find((tool) => tool.name === "search_krisdika_online"));
    assert.ok(result.tools.find((tool) => tool.name === "search_deka"));
    assert.ok(result.tools.find((tool) => tool.name === "search_deka_online"));
    assert.ok(result.tools.find((tool) => tool.name === "krisdika_collection_info"));
    assert.ok(result.tools.find((tool) => tool.name === "deka_collection_info"));
    assert.ok(result.tools.find((tool) => tool.name === "krisdeka_connection_info"));
    assert.ok(result.tools.find((tool) => tool.name === "deka_connection_info"));
    await client.close();
  }, results);

  await testFunction("tools/call search_deka_online returns a short digest", async () => {
    fetchMocker.mock(async (url) => {
      const target = url.toString();
      if (target.includes("deka.supremecourt.or.th")) {
        return createMockFetch({
          body: `
            <div id="deka_result_info" class="container">
            พบ <span class="color-master">12</span> รายการ
            <li class="clear result"><ul>
            <li class="item_deka_no"><input class="deka-result" value="724864" />
            <label>1. คำพิพากษาศาลฎีกาที่ 664/2569</label></li>
            <li id="short_text_docid_724864"><p>การที่จำเลยลักบัตรตามประมวลกฎหมายอาญา มาตรา 334</p></li>
            </ul></li>
            </div>
          `,
        })(url);
      }
      return createMockFetch({ status: 404, ok: false, statusText: "Not Found" })(url);
    });
    searchCache.clear();
    const { client } = await connect();
    const result = await client.callTool({
      name: "search_deka_online",
      arguments: { query: "ลักทรัพย์" },
    });
    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    assert.ok(text.includes("เลขที่คำพิพากษาศาลฎีกา: 664/2569"));
    assert.ok(text.includes("ย่อสั้น:"));
    assert.ok(text.includes("ลักบัตร"));
    await client.close();
    fetchMocker.restore();
  }, results);

  await testFunction("tools/call search_krisdika_online returns OCS hits", async () => {
    fetchMocker.mock(async (url) => {
      if (url.toString().includes("list_table_search")) {
        return createMockFetch({
          json: {
            meta: { total: 3, page: "1", perpage: "2" },
            data: [{
              lawCode: "ป0006-1D-0003",
              lawNameTh: "ประมวลกฎหมายอาญา",
              contentlaw: "ความผิดฐาน<mark>ลัก</mark><mark>ทรัพย์</mark>",
              encTimelineID: "abc123",
              publishDate: "13/11/2499",
              year: 1956,
              state: "01",
            }],
          },
        })(url);
      }
      if (url.toString().includes("getLawDoc")) {
        return createMockFetch({
          json: {
            respHeader: { errorCode: "SUCCESS" },
            respBody: {
              lawInfo: { timelineLawCode: "ป0006-1D-0003-65" },
              lawSections: [{
                sectionId: 334,
                sectionTypeId: "4",
                sectionNo: "334",
                sectionLabel: "มาตรา 334",
                sectionContent: "<p>ผู้ใดเอาทรัพย์ของผู้อื่นไปโดยทุจริต กระทำความผิดฐานลักทรัพย์</p>",
              }],
            },
          },
        })(url);
      }
      return createMockFetch({ status: 404, ok: false, statusText: "Not Found" })(url);
    });
    searchCache.clear();
    const { client } = await connect();
    const result = await client.callTool({
      name: "search_krisdika_online",
      arguments: { query: "ลักทรัพย์", top_k: 2 },
    });
    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    assert.ok(text.includes("ประมวลกฎหมายอาญา"));
    assert.ok(text.includes("ลักทรัพย์"));
    assert.ok(text.includes("มาตราล่าสุด"));
    assert.ok(text.includes("มาตรา 334"));
    assert.ok(text.includes("ocs.go.th"));
    await client.close();
    fetchMocker.restore();
  }, results);

  await testFunction("tools/call search_krisdika returns formatted text", async () => {
    mockSearchStack();
    searchCache.clear();
    const { client } = await connect();
    const result = await client.callTool({
      name: "search_krisdika",
      arguments: { query: "ลักทรัพย์" },
    });
    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    assert.ok(text.includes("ประมวลกฎหมายอาญา"));
    assert.ok(text.includes("มาตรา 334"));
    await client.close();
    fetchMocker.restore();
  }, results);

  await testFunction("tools/call search_krisdika supports json format", async () => {
    mockSearchStack();
    searchCache.clear();
    const { client } = await connect();
    const result = await client.callTool({
      name: "search_krisdika",
      arguments: { query: "ลักทรัพย์", response_format: "json" },
    });
    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    const parsed = JSON.parse(text);
    assert.equal(parsed.query, "ลักทรัพย์");
    assert.equal(parsed.results[0].law_code, "A01");
    await client.close();
    fetchMocker.restore();
  }, results);

  await testFunction("tools/call krisdika_collection_info returns stats", async () => {
    mockSearchStack();
    searchCache.clear();
    const { client } = await connect();
    const result = await client.callTool({
      name: "krisdika_collection_info",
      arguments: { refresh: true },
    });
    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    const parsed = JSON.parse(text);
    assert.equal(parsed.status, "green");
    assert.equal(parsed.vector_size, 1024);
    await client.close();
    fetchMocker.restore();
  }, results);

  await testFunction("tools/call deka_collection_info returns stats", async () => {
    mockSearchStack();
    searchCache.clear();
    const { client } = await connect();
    const result = await client.callTool({
      name: "deka_collection_info",
      arguments: { refresh: true },
    });
    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    const parsed = JSON.parse(text);
    assert.equal(parsed.status, "green");
    assert.equal(parsed.vector_size, 1024);
    await client.close();
    fetchMocker.restore();
  }, results);

  await testFunction("tools/call krisdeka_connection_info reports reachability", async () => {
    fetchMocker.mock(async (url) => {
      const target = url.toString();
      if (target.includes("list_table_search")) {
        return createMockFetch({
          json: { meta: { total: 18432, page: "1", perpage: "1" }, data: [] },
        })(url);
      }
      if (target.includes("ocs.go.th")) {
        return createMockFetch({
          body: "<html><title>ค้นหากฎหมาย</title></html>",
        })(url);
      }
      return createMockFetch({ status: 404, ok: false, statusText: "Not Found" })(url);
    });
    searchCache.clear();
    const { client } = await connect();
    const result = await client.callTool({
      name: "krisdeka_connection_info",
      arguments: { refresh: true },
    });
    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    const parsed = JSON.parse(text);
    assert.equal(parsed.reachable, true);
    assert.equal(parsed.catalog_count, 18432);
    assert.ok(String(parsed.search_url).includes("ocs.go.th"));
    await client.close();
    fetchMocker.restore();
  }, results);

  await testFunction("tools/call deka_connection_info reports reachability", async () => {
    fetchMocker.mock(async (url) => {
      if (url.toString().includes("deka.supremecourt.or.th")) {
        return createMockFetch({
          body: "พบ 20 รายการ จากทั้งหมด 133,162 รายการ",
        })(url);
      }
      return createMockFetch({ status: 404, ok: false, statusText: "Not Found" })(url);
    });
    searchCache.clear();
    const { client } = await connect();
    const result = await client.callTool({
      name: "deka_connection_info",
      arguments: { refresh: true },
    });
    const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    const parsed = JSON.parse(text);
    assert.equal(parsed.reachable, true);
    assert.equal(parsed.catalog_count, 133162);
    assert.ok(String(parsed.search_url).includes("deka.supremecourt.or.th"));
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
      () => client.callTool({ name: "search_krisdika", arguments: { query: "" } }),
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
    assert.ok((help.contents[0].text as string).includes("search_krisdika"));
    await client.close();
  }, results);

  printTestSummary(results, "MCP Handlers");
  return results;
}

export { runTests };
