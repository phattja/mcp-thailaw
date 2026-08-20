#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import {
  formatCollectionInfo,
  formatSearchJson,
  formatSearchText,
  groupResultsByArticle,
  groupResultsByLaw,
  hitToResult,
  mergeArticleText,
  mergeOverlappingText,
  preferQueryMatra,
  sectionNoMatchValues,
  timelineRank,
} from "../../src/search.js";
import { createNoResultsMessage } from "../../src/error-handler.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();

async function runTests() {
  console.log("🧪 Testing: search.ts\n");

  await testFunction("hitToResult maps payload fields", () => {
    const result = hitToResult({
      id: "abc",
      score: 0.81234,
      payload: {
        title: "ประมวลกฎหมายอาญา",
        law_code: "A01",
        category: "1B",
        publish_date: "1956-01-01",
        reference_url: "https://example.com/law",
        text: "มาตรา 334 ผู้ใดลักทรัพย์",
        chunk_index: 2,
        is_latest: true,
      },
    });
    assert.equal(result.title, "ประมวลกฎหมายอาญา");
    assert.equal(result.law_code, "A01");
    assert.equal(result.chunk_index, 2);
    assert.equal(result.is_latest, true);
    assert.equal(result.score, 0.81234);
    assert.equal(result.text, "มาตรา 334 ผู้ใดลักทรัพย์");
  }, results);

  await testFunction("hitToResult reads nested section and ignores embed text", () => {
    const result = hitToResult({
      id: "nested",
      score: 0.91,
      payload: {
        title: "ประมวลกฎหมายอาญา",
        law_code: "ป0006-1D-0003",
        timeline_code: "ป0006-1D-0003-63",
        section: {
          sectionId: 1590017,
          sectionNo: "335",
          content: "มาตรา ๓๓๕ ผู้ใดลักทรัพย์",
        },
        text: "this embed string must not be stored or returned",
      },
    });
    assert.equal(result.text, "มาตรา ๓๓๕ ผู้ใดลักทรัพย์");
    assert.equal(result.section_id, "1590017");
    assert.equal(result.matra, "๓๓๕");
    assert.equal(result.timeline_code, "ป0006-1D-0003-63");
  }, results);

  await testFunction("sectionNoMatchValues includes Thai and Arabic digits", () => {
    assert.deepEqual(sectionNoMatchValues("๓๓๕"), ["๓๓๕", "335"]);
  }, results);

  await testFunction("formatSearchText matches the prototype layout", () => {
    const text = formatSearchText("ลักทรัพย์", [{
      score: 0.8123,
      title: "ประมวลกฎหมายอาญา",
      law_code: "A01",
      category: "1B",
      publish_date: "1956-01-01",
      reference_url: "https://example.com/law",
      text: "มาตรา 334 ผู้ใดลักทรัพย์",
    }]);
    assert.ok(text.includes("[1] คะแนนความเกี่ยวข้อง: 0.8123"));
    assert.ok(text.includes("ชื่อกฎหมาย: ประมวลกฎหมายอาญา"));
    assert.ok(text.includes("รหัส: A01"));
    assert.ok(text.includes("ลิงก์: https://example.com/law"));
    assert.ok(text.includes("มาตรา 334 ผู้ใดลักทรัพย์"));
  }, results);

  await testFunction("formatSearchText returns the Thai empty message", () => {
    assert.equal(formatSearchText("ไม่มี", []), createNoResultsMessage("ไม่มี"));
  }, results);

  await testFunction("formatSearchJson includes query and collection", () => {
    const parsed = JSON.parse(formatSearchJson("ลักทรัพย์", "krisdika", []));
    assert.equal(parsed.query, "ลักทรัพย์");
    assert.equal(parsed.collection, "krisdika");
    assert.deepEqual(parsed.results, []);
  }, results);

  await testFunction("mergeOverlappingText stitches splitter overlap", () => {
    const overlap = "ผู้ใดลักทรัพย์ของผู้อื่นไปโดยทุจริตและต้องระวางโทษตามกฎหมาย";
    const left = `มาตรา 334 ${overlap}`;
    const right = `${overlap} จำคุกไม่เกินสามปี`;
    assert.equal(mergeOverlappingText(left, right), `มาตรา 334 ${overlap} จำคุกไม่เกินสามปี`);
  }, results);

  await testFunction("groupResultsByLaw merges the same law_code", () => {
    const grouped = groupResultsByLaw([
      {
        score: 0.71,
        title: "ประมวลกฎหมายอาญา",
        law_code: "ป0006-1D-0003",
        category: "1D",
        publish_date: "1956-11-15",
        reference_url: "https://example.com/a",
        text: "มาตรา 334 ผู้ใดลักทรัพย์",
        chunk_index: 1,
      },
      {
        score: 0.88,
        title: "ประมวลกฎหมายอาญา",
        law_code: "ป0006-1D-0003",
        category: "1D",
        publish_date: "1956-11-15",
        reference_url: "https://example.com/b",
        text: "ผู้ใดลักทรัพย์ ต้องระวางโทษ",
        chunk_index: 2,
      },
      {
        score: 0.6,
        title: "ประมวลกฎหมายแพ่ง",
        law_code: "C02",
        category: "1B",
        publish_date: "1925-01-01",
        reference_url: "https://example.com/c",
        text: "สัญญา",
        chunk_index: 0,
      },
    ]);
    assert.equal(grouped.length, 2);
    assert.equal(grouped[0].law_code, "ป0006-1D-0003");
    assert.equal(grouped[0].score, 0.88);
    assert.equal(grouped[0].chunk_count, 2);
    assert.ok(grouped[0].text.includes("มาตรา 334"));
    assert.ok(grouped[0].text.includes("ต้องระวางโทษ"));
    assert.equal(grouped[1].law_code, "C02");
  }, results);

  await testFunction("groupResultsByArticle reconstructs one มาตรา", () => {
    const grouped = groupResultsByArticle([
      {
        score: 0.91,
        title: "ประมวลกฎหมายอาญา",
        law_code: "ป0006-1D-0003",
        category: "1D",
        publish_date: "1956-11-15",
        reference_url: "https://example.com/a",
        text: "### มาตรา/ส่วน 1590017\nมาตรา ๓๓๕ ผู้ใดลักทรัพย์ (๑) ในเวลากลางคืน (๙)",
        chunk_index: 154,
      },
      {
        score: 0.7,
        title: "ประมวลกฎหมายอาญา",
        law_code: "ป0006-1D-0003",
        category: "1D",
        publish_date: "1956-11-15",
        reference_url: "https://example.com/a",
        text: "### มาตรา/ส่วน 1590017\nในสถานที่บูชา (๑๐) ที่ใช้หรือมีไว้เพื่อสาธารณประโยชน์ ต้องระวางโทษจำคุกตั้งแต่หนึ่งปีถึงห้าปี\n\n### มาตรา/ส่วน 1590018\nมาตรา ๓๓๖ ผู้ใดลักทรัพย์โดยฉกฉวยเอาซึ่งหน้า",
        chunk_index: 155,
      },
    ]);
    const article = grouped.find((item) => item.matra === "๓๓๕");
    assert.ok(article);
    assert.equal(article?.law_code, "ป0006-1D-0003");
    assert.ok(article?.text.startsWith("มาตรา ๓๓๕ ผู้ใดลักทรัพย์"));
    assert.ok(article?.text.includes("    (๑) ในเวลากลางคืน"));
    assert.ok(article?.text.includes("ต้องระวางโทษ"));
    assert.equal(article?.text.includes("มาตรา ๓๓๖"), false);
    assert.ok(grouped.some((item) => item.matra === "๓๓๖"));
  }, results);

  await testFunction("mergeArticleText keeps the longer copy of the same มาตรา", () => {
    const shortText = "มาตรา ๓๓๕ ผู้ใดลักทรัพย์ (๑) ในเวลากลางคืน (๙)";
    const fullText = "มาตรา ๓๓๕ ผู้ใดลักทรัพย์ (๑) ในเวลากลางคืน (๙) ในสถานที่บูชา (๑๐) ที่ใช้หรือมีไว้เพื่อสาธารณประโยชน์ ต้องระวางโทษจำคุกตั้งแต่หนึ่งปีถึงห้าปี";
    const merged = mergeArticleText(shortText, fullText);
    assert.equal(merged, fullText);
    assert.equal(merged.split("มาตรา ๓๓๕").length - 1, 1);
  }, results);

  await testFunction("preferQueryMatra keeps only the asked Thai มาตรา", () => {
    const filtered = preferQueryMatra([
      {
        score: 0.8,
        title: "ประมวลกฎหมายอาญา",
        law_code: "ป0006-1D-0003",
        category: "1D",
        publish_date: "1956-11-15",
        reference_url: "https://example.com/a",
        text: "มาตรา ๓๓๕ ผู้ใดลักทรัพย์",
        matra: "๓๓๕",
      },
      {
        score: 0.9,
        title: "กฎหมายอื่น",
        law_code: "X",
        category: "1B",
        publish_date: "1990-01-01",
        reference_url: "https://example.com/b",
        text: "มาตรา ๓๕",
        matra: "๓๕",
      },
    ], "มาตรา 335 อาญา");
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].matra, "๓๓๕");
  }, results);

  await testFunction("timelineRank reads the snapshot suffix", () => {
    assert.equal(timelineRank("ป0006-1D-0003-63"), 63);
    assert.equal(timelineRank("ป0006-1D-0003-18"), 18);
    assert.equal(timelineRank(undefined), -1);
  }, results);

  await testFunction("groupResultsByArticle prefers the later timeline snapshot", () => {
    const grouped = groupResultsByArticle([
      {
        score: 0.9,
        title: "ประมวลกฎหมายอาญา",
        law_code: "ป0006-1D-0003",
        category: "1D",
        publish_date: "1956-11-15",
        reference_url: "https://example.com/old",
        text: "### มาตรา/ส่วน 1\nมาตรา ๓๓๕ ผู้ใดลักทรัพย์ ต้องระวางโทษปรับตั้งแต่สองพันบาทถึงหนึ่งหมื่นบาท",
        chunk_index: 1,
        timeline_code: "ป0006-1D-0003-18",
      },
      {
        score: 0.7,
        title: "ประมวลกฎหมายอาญา",
        law_code: "ป0006-1D-0003",
        category: "1D",
        publish_date: "1956-11-15",
        reference_url: "https://example.com/new",
        text: "### มาตรา/ส่วน 2\nมาตรา ๓๓๕ ผู้ใดลักทรัพย์ ต้องระวางโทษปรับตั้งแต่สองหมื่นบาทถึงหนึ่งแสนบาท",
        chunk_index: 1,
        timeline_code: "ป0006-1D-0003-63",
      },
    ]);
    assert.equal(grouped.length, 1);
    assert.ok(grouped[0].text.includes("สองหมื่นบาทถึงหนึ่งแสนบาท"));
    assert.equal(grouped[0].timeline_code, "ป0006-1D-0003-63");
  }, results);

  await testFunction("formatCollectionInfo is JSON", () => {
    const parsed = JSON.parse(formatCollectionInfo({
      name: "krisdika",
      status: "green",
      pointsCount: 10,
      vectorSize: 1024,
      distance: "Cosine",
    }, "bge-m3", "http://127.0.0.1:3003/v1"));
    assert.equal(parsed.collection, "krisdika");
    assert.equal(parsed.vector_size, 1024);
    assert.equal(parsed.embedding_model, "bge-m3");
  }, results);

  printTestSummary(results, "Search");
  return results;
}

export { runTests };
