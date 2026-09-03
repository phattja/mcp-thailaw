#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import {
  buildOcsSearchBody,
  combineKrisdikaSources,
  formatOcsText,
  ocsTopK,
  applyOcsExclude,
  parseOcsLawDoc,
  parseOcsSearchPayload,
  queryLooksLikeLawTitle,
  resolveKrisdikaSource,
  resolveOcsCategory,
  resolveOcsDetail,
  resolveOcsState,
  selectOcsSections,
  stripOcsSnippet,
} from "../../src/ocs.js";
import { createNoResultsMessage } from "../../src/error-handler.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();

const FIXTURE = {
  meta: { page: "1", perpage: "2", total: 3, pages: 2 },
  data: [
    {
      lawCode: "ป0006-1D-0003",
      lawNameTh: "ประมวลกฎหมายอาญา",
      contentlaw: "ความผิดฐาน<mark>ลัก</mark><mark>ทรัพย์</mark>และวิ่งราวทรัพย์",
      encTimelineID: "abc123",
      publishDate: "13/11/2499",
      year: 1956,
      state: "01",
      fileUUID: "https://www.ocs.go.th/searchlaw/indexs/download/x",
    },
    {
      lawCode: "ก0182-1B-0001",
      lawNameTh: "พระราชบัญญัติการไกล่เกลี่ยข้อพิพาท พ.ศ. 2562",
      contentlaw: "ความผิดฐาน<mark>ลัก</mark>ทรัพย์",
      encTimelineID: "def456",
      publishDate: "22/5/2562",
      year: 2019,
      state: "01",
    },
  ],
};

async function runTests() {
  console.log("🧪 Testing: ocs.ts\n");

  await testFunction("parseOcsSearchPayload extracts laws and total", () => {
    const parsed = parseOcsSearchPayload(FIXTURE);
    assert.equal(parsed.total, 3);
    assert.equal(parsed.laws.length, 2);
    assert.equal(parsed.laws[0]?.law_code, "ป0006-1D-0003");
    assert.equal(parsed.laws[0]?.title, "ประมวลกฎหมายอาญา");
    assert.ok(parsed.laws[0]?.snippet.includes("ลักทรัพย์"));
    assert.ok(!parsed.laws[0]?.snippet.includes("<mark>"));
    assert.ok(parsed.laws[0]?.url.includes("abc123"));
    assert.equal(parsed.laws[0]?.timeline_id, "abc123");
    assert.equal(parsed.laws[1]?.title, "พระราชบัญญัติการไกล่เกลี่ยข้อพิพาท พ.ศ. 2562");
  }, results);

  await testFunction("stripOcsSnippet removes mark tags", () => {
    assert.equal(stripOcsSnippet("ฐาน<mark>ลัก</mark><mark>ทรัพย์</mark>"), "ฐานลักทรัพย์");
  }, results);

  await testFunction("buildOcsSearchBody posts KTDatatable query fields", () => {
    const body = buildOcsSearchBody({ query: "ลักทรัพย์", category: "ประมวลกฎหมาย", top_k: 2 });
    assert.equal(body.get("query[q]"), "ลักทรัพย์");
    assert.equal(body.get("query[tab_type]"), "law");
    assert.equal(body.get("query[topic]"), "1");
    assert.equal(body.get("query[content]"), "1");
    assert.equal(body.get("query[sublaw]"), "0");
    const fallback = buildOcsSearchBody({ query: "ลักทรัพย์", topic: false, content: false });
    assert.equal(fallback.get("query[topic]"), "1");
    assert.equal(fallback.get("query[content]"), "1");
    assert.equal(body.get("query[lawCategoryName]"), "1D");
    assert.equal(body.get("query[stateName]"), "01,02");
    assert.equal(body.get("pagination[page]"), "1");
    assert.equal(body.get("pagination[perpage]"), "2");
  }, results);

  await testFunction("resolve helpers map categories, state, and source", () => {
    assert.equal(resolveOcsCategory("1B,ประมวลกฎหมาย"), "1B,1D");
    assert.equal(resolveOcsState(undefined, true), "01,02");
    assert.equal(resolveOcsState("repealed"), "00");
    assert.equal(resolveKrisdikaSource(), "qdrant");
    assert.equal(resolveKrisdikaSource("ออนไลน์"), "online");
    assert.equal(resolveKrisdikaSource("both"), "both");
    assert.equal(resolveKrisdikaSource("auto"), "auto");
    assert.equal(ocsTopK(99), 20);
    assert.equal(queryLooksLikeLawTitle("ประมวลกฎหมายอาญา"), true);
    assert.equal(queryLooksLikeLawTitle("พระราชบัญญัติคอมพิวเตอร์ พ.ศ. 2560"), true);
    assert.equal(queryLooksLikeLawTitle("ลักทรัพย์"), false);
    assert.equal(queryLooksLikeLawTitle("มาตรา 334"), false);
  }, results);

  await testFunction("formatOcsText returns empty message", () => {
    assert.equal(formatOcsText("ไม่มี", []), createNoResultsMessage("ไม่มี"));
  }, results);

  await testFunction("selectOcsSections returns matching latest มาตรา", () => {
    assert.equal(resolveOcsDetail(), "sections");
    assert.equal(resolveOcsDetail("list"), "list");
    const parsed = parseOcsLawDoc({
      respHeader: { errorCode: "SUCCESS" },
      respBody: {
        lawInfo: { timelineLawCode: "ป0006-1D-0003-65", lawNameTh: "ประมวลกฎหมายอาญา" },
        lawSections: [
          { sectionId: 1, sectionTypeId: "16", sectionLabel: "สารบาญ", sectionContent: "<p>ลักทรัพย์ในสารบาญ</p>" },
          {
            sectionId: 2,
            sectionTypeId: "4",
            sectionNo: "334",
            sectionLabel: "มาตรา 334",
            sectionContent: "<p>ผู้ใดเอาทรัพย์ของผู้อื่นไปโดยทุจริต กระทำความผิดฐานลักทรัพย์</p>",
          },
          {
            sectionId: 3,
            sectionTypeId: "4",
            sectionNo: "10",
            sectionLabel: "มาตรา 10",
            sectionContent: "<p>บทนิยาม</p>",
          },
        ],
      },
    });
    assert.equal(parsed.timeline_code, "ป0006-1D-0003-65");
    const selected = selectOcsSections(parsed.sections, "ลักทรัพย์", 3);
    assert.equal(selected.length, 1);
    assert.equal(selected[0]?.section_no, "334");
    assert.ok(selected[0]?.text.includes("ลักทรัพย์"));
    const byMatra = selectOcsSections(parsed.sections, "มาตรา 334", 3);
    assert.equal(byMatra[0]?.section_no, "334");
    const byTitle = selectOcsSections(parsed.sections, "ประมวลกฎหมายอาญา", 3, "ประมวลกฎหมายอาญา");
    assert.equal(byTitle.length, 2);
    assert.equal(byTitle[0]?.section_no, "334");
    const unmatchedTitle = selectOcsSections(parsed.sections, "ประมวลกฎหมายอาญา", 3);
    assert.equal(unmatchedTitle.length, 0);
  }, results);

  await testFunction("formatOcsText includes latest มาตรา when present", () => {
    const text = formatOcsText("ลักทรัพย์", [{
      law_code: "ป0006-1D-0003",
      title: "ประมวลกฎหมายอาญา",
      snippet: "ลักทรัพย์",
      publish_date: "13/11/2499",
      state: "01",
      url: "https://searchlaw.ocs.go.th/council-of-state/#/public/doc/x",
      timeline_code: "ป0006-1D-0003-65",
      sections: [{
        section_no: "334",
        label: "มาตรา 334",
        text: "ผู้ใดเอาทรัพย์ของผู้อื่นไปโดยทุจริต",
      }],
    }]);
    assert.ok(text.includes("มาตราล่าสุด"));
    assert.ok(text.includes("ผู้ใดเอาทรัพย์ของผู้อื่นไปโดยทุจริต"));
    assert.ok(!text.includes("ข้อความที่พบ:"));
  }, results);

  await testFunction("applyOcsExclude drops sections and laws with excluded wording", () => {
    const laws = applyOcsExclude([
      {
        law_code: "A",
        title: "ประมวลกฎหมายอาญา",
        snippet: "ลักทรัพย์",
        publish_date: "",
        state: "01",
        url: "https://example.com",
        sections: [
          { section_no: "334", label: "มาตรา 334", text: "ความผิดฐานลักทรัพย์" },
          { section_no: "336", label: "มาตรา 336", text: "ความผิดฐานวิ่งราวทรัพย์" },
        ],
      },
    ], ["วิ่งราว"], "sections");
    assert.equal(laws.length, 1);
    assert.equal(laws[0]?.sections?.length, 1);
    assert.equal(laws[0]?.sections?.[0]?.section_no, "334");
  }, results);

  await testFunction("combineKrisdikaSources wraps both text blocks", () => {
    const text = combineKrisdikaSources("ลักทรัพย์", "QDRANT", "ONLINE", "text");
    assert.ok(text.includes("Qdrant"));
    assert.ok(text.includes("ออนไลน์"));
    assert.ok(text.includes("QDRANT"));
    assert.ok(text.includes("ONLINE"));
  }, results);

  printTestSummary(results, "OCS");
  return results;
}

export { runTests };
