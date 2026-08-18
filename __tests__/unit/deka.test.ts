#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import { buildSearchBody, extractDekaLaws, extractDekaResultInfo, formatDekaJson, formatDekaText, parseDekaCatalogCount, parseDekaSearchHtml, resolveDekaMode } from "../../src/deka.js";
import { createNoResultsMessage } from "../../src/error-handler.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();

const FIXTURE = `
<div id="deka_result_info" class="container">
พบ <span class="color-master">3,981</span> รายการ จากทั้งหมด 133,162 รายการ
<li class="clear result"><ul>
<li class="item_deka_no content-title">
<input type="checkbox" id="1_2569" class="css-checkbox med deka-result" value="724864">
<label>1. คำพิพากษาศาลฎีกาที่ 664/2569</label>
</li>
<li id="short_text_docid_724864" class="item_short_text content-detail">
<p class="content-detail">การที่จำเลยลักบัตร เป็นความผิดตามประมวลกฎหมายอาญา มาตรา 334 และ มาตรา 335 (1)</p>
</li>
</ul></li>
<li class="clear result"><ul>
<li class="item_deka_no content-title">
<input type="checkbox" class="deka-result" value="723658">
<label>2. คำพิพากษาศาลฎีกาที่ 8829/2568</label>
</li>
<li id="short_text_docid_723658" class="item_short_text">
<p>โจทก์ฟ้องตาม ป.อ. ม. 334</p>
</li>
</ul></li>
</div>
`;

async function runTests() {
  console.log("🧪 Testing: deka.ts\n");

  await testFunction("parseDekaSearchHtml extracts cases and total", () => {
    const parsed = parseDekaSearchHtml(FIXTURE);
    assert.equal(parsed.total, 3981);
    assert.equal(parsed.cases.length, 2);
    assert.equal(parsed.cases[0]?.case_no, "664/2569");
    assert.equal(parsed.cases[0]?.docid, "724864");
    assert.ok(parsed.cases[0]?.summary.includes("ลักบัตร"));
    assert.equal(parsed.cases[1]?.case_no, "8829/2568");
    assert.equal(parsed.cases[0]?.url, "https://deka.supremecourt.or.th/");
  }, results);

  await testFunction("extractDekaLaws finds statute citations", () => {
    const laws = extractDekaLaws("ประมวลกฎหมายอาญา มาตรา 334 และ มาตรา 335 (1)");
    assert.ok(laws.some((item) => item.includes("334")));
    assert.ok(laws.some((item) => item.includes("335")));
  }, results);

  await testFunction("formatDekaText returns the empty message", () => {
    assert.equal(formatDekaText("ไม่มี", ""), createNoResultsMessage("ไม่มี"));
  }, results);

  await testFunction("default basic search uses all documents and full text", () => {
    const body = buildSearchBody({ query: "ลักทรัพย์" });
    assert.equal(body.get("search_doctype"), "");
    assert.equal(body.get("search_type"), "2");
  }, results);

  await testFunction("buildSearchBody maps basic ฉบับเต็ม, case number, and year range", () => {
    const body = buildSearchBody({
      query: "ลักทรัพย์",
      text_scope: "full",
      doc_type: "judgment",
      case_no: "664/2569",
      year_from: "2560",
      year_to: "2568",
    });
    assert.equal(body.get("search_form_type"), "basic");
    assert.equal(body.get("search_type"), "2");
    assert.equal(body.get("search_doctype"), "1");
    assert.equal(body.get("search_word"), "ลักทรัพย์");
    assert.equal(body.get("search_deka_no"), "664");
    assert.equal(body.get("search_deka_start_year"), "2560");
    assert.equal(body.get("search_deka_end_year"), "2568");
  }, results);

  await testFunction("buildSearchBody uses advanced fields", () => {
    assert.equal(resolveDekaMode({ litigant: "นาย ส." }), "advanced");
    const body = buildSearchBody({
      query: "มาตรา 334",
      litigant: "นาย ส.",
      law_name: "ประมวลกฎหมายอาญา",
      law_section: "334",
    });
    assert.equal(body.get("search_form_type"), "adv");
    assert.equal(body.get("adv_search_word_stext_and_ltext"), "มาตรา 334");
    assert.equal(body.get("adv_search_litigant"), "นาย ส.");
    assert.equal(body.get("adv_search_law_section"), "334");
  }, results);

  await testFunction("parseDekaCatalogCount reads the full catalog size", () => {
    const html = "พบรายการ 20 รายการ จากทั้งหมด 133,162 รายการ (0.4400 วินาที)";
    assert.equal(parseDekaCatalogCount(html), 133162);
  }, results);

  await testFunction("formatDekaText returns the deka_result_info block as text", () => {
    const block = extractDekaResultInfo(FIXTURE);
    const text = formatDekaText("ลักทรัพย์", block);
    assert.ok(block.includes('id="deka_result_info"'));
    assert.ok(text.includes("คำพิพากษาศาลฎีกาที่ 664/2569"));
    assert.ok(text.includes("การที่จำเลยลักบัตร"));
    const parsed = JSON.parse(formatDekaJson("ลักทรัพย์", block));
    assert.equal(parsed.query, "ลักทรัพย์");
    assert.ok(parsed.html.includes("deka_result_info"));
    assert.ok(parsed.text.includes("ลักบัตร"));
  }, results);

  printTestSummary(results, "Deka");
  return results;
}

export { runTests };
