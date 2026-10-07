#!/usr/bin/env node
// Builds English_Speaking_Sentence_Bank.html from data/sentence-bank.json.
//
//   node scripts/build.mjs                  validate, build, verify, report counts
//   node scripts/build.mjs --check          validate and compare only (no write)
//   node scripts/build.mjs --allow-changes  permit edits/removals of existing entries
//                                           (only when the user explicitly asks for it)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = join(root, "data", "sentence-bank.json");
const TEMPLATE_PATH = join(root, "template", "sentence-bank.template.html");
const OUTPUT_PATH = join(root, "English_Speaking_Sentence_Bank.html");

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has("--check");
const ALLOW_CHANGES = args.has("--allow-changes");

const errors = [];
const warnings = [];
const fail = message => errors.push(message);

// ---------- load ----------
let bank;
try {
  bank = JSON.parse(readFileSync(DATA_PATH, "utf8"));
} catch (error) {
  console.error(`✗ ${relative(root, DATA_PATH)} を読み込めません: ${error.message}`);
  process.exit(1);
}
const template = readFileSync(TEMPLATE_PATH, "utf8");

// ---------- validate data ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const JAPANESE_RE = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;

if (!Array.isArray(bank)) fail("ルートは配列である必要があります");
else {
  let previousDate = "";
  bank.forEach((day, dayIndex) => {
    const where = `sessions[${dayIndex}]`;
    if (!day || typeof day !== "object") return fail(`${where}: オブジェクトではありません`);
    const extraKeys = Object.keys(day).filter(key => !["date", "topics"].includes(key));
    if (extraKeys.length) fail(`${where}: 不明なキー ${extraKeys.join(", ")}`);
    const { date, topics } = day;
    if (typeof date !== "string" || !DATE_RE.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z")) ||
        new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) {
      fail(`${where}: 日付が不正です (${JSON.stringify(date)})`);
    } else {
      if (date === previousDate) fail(`${date}: 同じ日付のセッションが重複しています（既存の日付へ統合してください）`);
      else if (date < previousDate) fail(`${date}: 日付が昇順ではありません（${previousDate} の後にあります）`);
      previousDate = date;
    }
    if (!Array.isArray(topics) || topics.length === 0) return fail(`${date ?? where}: topics が空です`);

    const titles = new Set();
    topics.forEach((topic, topicIndex) => {
      const tWhere = `${date} / topic ${topicIndex + 1}`;
      if (!topic || typeof topic !== "object") return fail(`${tWhere}: オブジェクトではありません`);
      const extraTopicKeys = Object.keys(topic).filter(key => !["title", "sentences"].includes(key));
      if (extraTopicKeys.length) fail(`${tWhere}: 不明なキー ${extraTopicKeys.join(", ")}`);
      const { title, sentences } = topic;
      if (typeof title !== "string" || !title.trim()) fail(`${tWhere}: トピック名が空です`);
      else if (titles.has(title)) warnings.push(`${date}: 同名トピック「${title}」が複数あります`);
      titles.add(title);
      if (!Array.isArray(sentences) || sentences.length === 0) return fail(`${tWhere}: sentences が空です`);

      const texts = new Set();
      const numbers = new Set();
      sentences.forEach((entry, sentenceIndex) => {
        const sWhere = `${date} / ${title} / #${sentenceIndex + 1}`;
        if (!Array.isArray(entry) || entry.length !== 2) return fail(`${sWhere}: [番号, "英文"] の形式ではありません`);
        const [number, text] = entry;
        if (!Number.isInteger(number) || number < 1) fail(`${sWhere}: 番号が不正です (${JSON.stringify(number)})`);
        else if (numbers.has(number)) fail(`${sWhere}: 番号 ${number} が同一トピック内で重複しています`);
        numbers.add(number);
        if (typeof text !== "string" || !text.trim()) return fail(`${sWhere}: 英文が空です`);
        if (text !== text.trim()) warnings.push(`${sWhere}: 前後に空白があります`);
        if (JAPANESE_RE.test(text)) fail(`${sWhere}: 日本語が含まれています（英文のみ登録できます）: ${text}`);
        if (texts.has(text)) fail(`${sWhere}: 同一日・同一トピック内で完全重複しています: ${text}`);
        texts.add(text);
      });
    });
  });
}

if (errors.length) {
  console.error("✗ data/sentence-bank.json の検証に失敗しました:");
  errors.forEach(message => console.error("  - " + message));
  process.exit(1);
}

// ---------- helpers ----------
function extractBank(html) {
  const start = html.indexOf("const bank = ");
  const end = html.indexOf("\n  const state =", start);
  if (start < 0 || end < 0) throw new Error("bank データが見つかりません");
  const literal = html.slice(start + "const bank = ".length, end).trim().replace(/;$/, "");
  // JSON round-trip drops the vm realm's prototypes so deepEqual compares plain data.
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${literal})`)));
}

function countsOf(data) {
  return {
    sessions: data.length,
    topics: data.reduce((sum, day) => sum + day.topics.length, 0),
    sentences: data.reduce((sum, day) => sum + day.topics.reduce((s, topic) => s + topic.sentences.length, 0), 0),
  };
}

// ---------- guard: existing entries must be preserved ----------
// Checked-state IDs in localStorage are `${date}-${topicIndex+1}-${sentenceIndex+1}`,
// so existing topics/sentences must keep their position within a date.
let before = null;
if (existsSync(OUTPUT_PATH)) {
  let previous;
  try {
    previous = extractBank(readFileSync(OUTPUT_PATH, "utf8"));
  } catch (error) {
    console.error(`✗ 既存HTMLからデータを読み取れません: ${error.message}`);
    process.exit(1);
  }
  before = countsOf(previous);
  const nextByDate = new Map(bank.map(day => [day.date, day]));
  const changes = [];
  for (const day of previous) {
    const next = nextByDate.get(day.date);
    if (!next) { changes.push(`${day.date}: セッションが消えています`); continue; }
    day.topics.forEach((topic, topicIndex) => {
      const nextTopic = next.topics[topicIndex];
      if (!nextTopic) return changes.push(`${day.date} / topic ${topicIndex + 1}「${topic.title}」が消えています`);
      if (nextTopic.title !== topic.title) changes.push(`${day.date} / topic ${topicIndex + 1}: 「${topic.title}」→「${nextTopic.title}」`);
      topic.sentences.forEach(([number, text], sentenceIndex) => {
        const entry = nextTopic.sentences[sentenceIndex];
        if (!entry) return changes.push(`${day.date} / ${topic.title} / ${number}. が消えています: ${text}`);
        if (entry[0] !== number || entry[1] !== text) {
          changes.push(`${day.date} / ${topic.title} / ${number}. が変更されています:\n      旧: ${number}. ${text}\n      新: ${entry[0]}. ${entry[1]}`);
        }
      });
    });
  }
  if (changes.length && !ALLOW_CHANGES) {
    console.error("✗ 既存データの削除・変更・並び替えが検出されました（既存エントリは変更できません）:");
    changes.forEach(message => console.error("  - " + message));
    console.error("  新しいトピックは各日付の末尾、新しい英文は各トピックの末尾に追加してください。");
    console.error("  ユーザーが明示的に修正を依頼した場合のみ --allow-changes を付けて再実行してください。");
    process.exit(1);
  }
  if (changes.length) {
    warnings.push(`--allow-changes により既存データの変更 ${changes.length} 件を許可しました`);
    changes.forEach(message => warnings.push("  " + message));
  }
}

// ---------- render ----------
const after = countsOf(bank);
const latestDate = bank.at(-1).date;
const updatedLabel = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", timeZone: "UTC" })
  .format(new Date(latestDate + "T00:00:00Z"));

// Indent to match the surrounding <script> and escape sequences that could end the script block.
const dataLiteral = JSON.stringify(bank, null, 2)
  .replace(/</g, "\\u003c")
  .replace(/[\u2028\u2029]/g, char => "\\u" + char.charCodeAt(0).toString(16))
  .split("\n").join("\n  ");

for (const placeholder of ["__SENTENCE_BANK_DATA__", "__UPDATED_LABEL__"]) {
  if (template.split(placeholder).length !== 2) {
    console.error(`✗ テンプレートにプレースホルダー ${placeholder} がちょうど1つ必要です`);
    process.exit(1);
  }
}
const html = template
  .replace("__SENTENCE_BANK_DATA__", () => dataLiteral)
  .replace("__UPDATED_LABEL__", () => updatedLabel);

// ---------- verify generated HTML ----------
const generated = extractBank(html);
assert.deepEqual(generated, bank, "生成HTMLのデータが JSON と一致しません");
const generatedCounts = countsOf(generated);
assert.deepEqual(generatedCounts, after, "生成HTMLの件数が JSON と一致しません");
if (/__[A-Z_]+__/.test(html)) throw new Error("未置換のプレースホルダーが残っています");

const requiredFeatures = {
  "英文検索": 'id="search"',
  "日付絞り込み": 'id="filters"',
  "ランダム表示": 'id="randomBtn"',
  "印刷・PDF": "window.print()",
  "読み上げ": "SpeechSynthesisUtterance",
  "自然な英語音声の優先": "naturalEnglishVoice",
  "習得済みチェック": "data-check",
  "LocalStorage保存": "localStorage.setItem",
  "習得済みの非表示": 'id="hideDone"',
  "件数表示": 'id="stats"',
};
const missing = Object.entries(requiredFeatures).filter(([, marker]) => !html.includes(marker)).map(([name]) => name);
if (missing.length) {
  console.error(`✗ 生成HTMLに必要な機能が見つかりません: ${missing.join(", ")}`);
  process.exit(1);
}
if (/<(script|link)[^>]+(src|href)=["']https?:/i.test(html)) {
  console.error("✗ 生成HTMLが外部リソースを参照しています（自己完結型である必要があります）");
  process.exit(1);
}

// ---------- write & report ----------
if (!CHECK_ONLY) writeFileSync(OUTPUT_PATH, html);

const diff = (key) => {
  if (!before) return `${after[key]}`;
  const delta = after[key] - before[key];
  return `${before[key]} → ${after[key]} (${delta >= 0 ? "+" : ""}${delta})`;
};
warnings.forEach(message => console.warn("⚠ " + message));
console.log(CHECK_ONLY ? "✓ 検証OK（--check: HTMLは書き込んでいません）" : `✓ ${relative(root, OUTPUT_PATH)} を生成しました`);
console.log(`  セッション: ${diff("sessions")}`);
console.log(`  トピック:   ${diff("topics")}`);
console.log(`  英文:       ${diff("sentences")}`);
console.log(`  JSON と HTML の文数一致: ${generatedCounts.sentences} = ${after.sentences}`);
