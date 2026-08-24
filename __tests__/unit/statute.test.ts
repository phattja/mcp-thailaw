#!/usr/bin/env tsx

import { strict as assert } from "node:assert";
import {
  extractPrimaryMatra,
  arabicDigitsToThai,
  extractQueryMatra,
  extractSectionBody,
  extractSectionIds,
  formatMatraThai,
  formatOfficialThaiStatute,
  normalizeMatraKey,
  rewriteQueryMatraToThai,
  splitStatuteSections,
  thaiDigitsToArabic,
} from "../../src/statute.js";
import { testFunction, createTestResults, printTestSummary } from "../helpers/test-utils.js";

const results = createTestResults();

const FRAGMENT_A = `### มาตรา/ส่วน 1590017
มาตรา ๓๓๕ ผู้ใดลักทรัพย์ (๑) ในเวลากลางคืน (๒)ในที่หรือบริเวณที่มีเหตุเพลิงไหม้ (๙)`;

const FRAGMENT_B = `### มาตรา/ส่วน 1590017
ในสถานที่บูชา (๑๐)ที่ใช้หรือมีไว้เพื่อสาธารณประโยชน์ (๑๒)ที่เป็นของผู้มีอาชีพกสิกรรม ต้องระวางโทษ จำคุกตั้งแต่หนึ่งปีถึงห้าปี และปรับตั้งแต่สองหมื่นบาทถึงหนึ่งแสนบาท ถ้าความผิดตามวรรคแรกเป็นการกระทำต่อทรัพย์ที่เป็นโค ผู้กระทำต้องระวางโทษจำคุกตั้งแต่สามปีถึงสิบปี`;

const FRAGMENT_C = `### มาตรา/ส่วน 1590017
และทรัพย์นั้นมีราคาเล็กน้อยศาลจะลงโทษผู้กระทำความผิดดังที่บัญญัติไว้ในมาตรา ๓๓๔ ก็ได้

### มาตรา/ส่วน 1590018
มาตรา ๓๓๖ ผู้ใดลักทรัพย์โดยฉกฉวยเอาซึ่งหน้า`;

async function runTests() {
  console.log("🧪 Testing: statute.ts\n");

  await testFunction("thaiDigitsToArabic converts มาตรา numbers", () => {
    assert.equal(thaiDigitsToArabic("๓๓๕"), "335");
    assert.equal(thaiDigitsToArabic("10"), "10");
  }, results);

  await testFunction("normalizeMatraKey treats Thai and Arabic as the same article", () => {
    assert.equal(normalizeMatraKey("๓๓๕"), normalizeMatraKey("335"));
    assert.equal(normalizeMatraKey("๓๓๕ ทวิ"), "335:ทวิ");
  }, results);

  await testFunction("extractSectionIds and extractSectionBody keep one มาตรา", () => {
    assert.deepEqual(extractSectionIds(FRAGMENT_C), ["1590017", "1590018"]);
    const body = extractSectionBody(FRAGMENT_C, "1590017");
    assert.ok(body.includes("มาตรา ๓๓๔"));
    assert.equal(body.includes("มาตรา ๓๓๖"), false);
  }, results);

  await testFunction("splitStatuteSections separates ingest headers", () => {
    const sections = splitStatuteSections(FRAGMENT_C);
    assert.equal(sections.length, 2);
    assert.equal(sections[0].sectionId, "1590017");
    assert.equal(sections[1].sectionId, "1590018");
    assert.ok(sections[1].body.startsWith("มาตรา ๓๓๖"));
  }, results);

  await testFunction("extractPrimaryMatra ignores ตามมาตรา references", () => {
    assert.equal(extractPrimaryMatra(FRAGMENT_A), "๓๓๕");
    assert.equal(extractPrimaryMatra("ความผิดตามมาตรา ๓๓๔ เป็นความผิดอันยอมความได้"), undefined);
    assert.equal(extractPrimaryMatra("มาตรา ๓๓๕ ทวิ ผู้ใดลักทรัพย์"), "๓๓๕ ทวิ");
  }, results);

  await testFunction("extractQueryMatra reads the asked มาตรา", () => {
    assert.equal(extractQueryMatra("มาตรา ๓๓๕ ผู้ใดลักทรัพย์"), "๓๓๕");
    assert.equal(extractQueryMatra("มาตรา 335 อาญา"), "๓๓๕");
    assert.equal(extractQueryMatra("ลักทรัพย์"), undefined);
  }, results);

  await testFunction("rewriteQueryMatraToThai converts Arabic article numbers", () => {
    assert.equal(rewriteQueryMatraToThai("มาตรา 335 อาญา"), "มาตรา ๓๓๕ อาญา");
    assert.equal(rewriteQueryMatraToThai("มาตรา ๓๓๕ ทวิ"), "มาตรา ๓๓๕ ทวิ");
    assert.equal(arabicDigitsToThai("335"), "๓๓๕");
    assert.equal(formatMatraThai("335 ทวิ"), "๓๓๕ ทวิ");
  }, results);

  await testFunction("formatOfficialThaiStatute uses official มาตรา layout", () => {
    const merged = [
      extractSectionBody(FRAGMENT_A, "1590017"),
      extractSectionBody(FRAGMENT_B, "1590017"),
      extractSectionBody(FRAGMENT_C, "1590017"),
    ].join(" ");
    const official = formatOfficialThaiStatute(merged);
    assert.ok(official.startsWith("มาตรา ๓๓๕ ผู้ใดลักทรัพย์"));
    assert.ok(official.includes("\n    (๑) ในเวลากลางคืน"));
    assert.ok(official.includes("\n    (๑๐) ที่ใช้หรือมีไว้เพื่อสาธารณประโยชน์"));
    assert.ok(official.includes("\nต้องระวางโทษ จำคุกตั้งแต่หนึ่งปีถึงห้าปี"));
    assert.ok(official.includes("\nถ้าความผิดตามวรรคแรก"));
    assert.equal(official.includes("### มาตรา/ส่วน"), false);
    assert.equal(official.includes("มาตรา ๓๓๖"), false);
  }, results);

  printTestSummary(results, "Statute");
  return results;
}

export { runTests };
