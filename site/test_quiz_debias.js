#!/usr/bin/env node
/* test_quiz_debias.js — 测验去偏与作答前防泄漏（门禁第 5 条）
 *
 * 职责边界（QUIZ_CONTRACT.md §9）：只查「生成后的 data.js 载荷」与「预渲染 DOM」，
 * 不重新统计槽位分布（那是 audit_lessons.py L005 的事）。
 * 检查：
 *   A. data.js 里的 quiz 与各讲 quiz.json 完全一致 —— 选项顺序未被渲染器重排、correct 未错位；
 *   B. 预渲染课程页作答前不含任何 explanation 文本、不标记正确项、不含 data-correct 之类字样；
 *   C. 预渲染课程页里 4 个选项的呈现顺序与 quiz.json 一致；
 *   D. quiz 区域带有「不防作弊」常驻声明。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SITE = __dirname;

const data = require("./data.js");
const lessonById = new Map(data.lessons.map((l) => [l.id, l]));
const fails = [];
const notes = [];

function check(cond, msg) {
  if (!cond) fails.push(msg);
}

if (!Object.keys(data.quizzes).length) {
  notes.push("暂无已完成的 quiz，跳过载荷比对（结构性问题由 audit_lessons.py 报告）。");
}

for (const [id, quiz] of Object.entries(data.quizzes)) {
  const l = lessonById.get(id);
  if (!l) { fails.push(`${id}: data.js 有 quiz 但没有对应讲次`); continue; }
  const quizPath = path.join(ROOT, "phases", l.moduleDir, l.slug, "quiz.json");
  const disk = JSON.parse(fs.readFileSync(quizPath, "utf8"));

  check(JSON.stringify(quiz) === JSON.stringify(disk), `${id}: data.js 的 quiz 与 quiz.json 不一致（载荷被改写）`);

  const htmlPath = path.join(SITE, "lessons", l.moduleDir, l.slug, "index.html");
  check(fs.existsSync(htmlPath), `${id}: 缺少预渲染页面 ${path.relative(ROOT, htmlPath)}`);
  if (!fs.existsSync(htmlPath)) continue;
  const html = fs.readFileSync(htmlPath, "utf8");

  const start = html.indexOf('<section class="quiz"');
  const end = html.indexOf("</section>", start);
  check(start >= 0 && end > start, `${id}: 预渲染页面缺少 quiz 区域`);
  const quizHtml = start >= 0 && end > start ? html.slice(start, end) : "";

  // B. 作答前不得泄漏答案
  quiz.questions.forEach((q, i) => {
    check(!quizHtml.includes(q.explanation), `${id}: 第 ${i + 1} 题 explanation 出现在作答前的 DOM 中`);
  });
  check(!/data-correct|opt-correct|aria-checked="true"/.test(quizHtml), `${id}: 作答前 DOM 里出现了正确项标记`);
  check(!/\bcorrect\b/.test(quizHtml), `${id}: 作答前 DOM 里出现了 correct 字样`);

  // D. 常驻声明
  check(quizHtml.includes("答案可见于页面数据，本站不做防作弊，请当作自测。"), `${id}: 缺少「不防作弊」常驻声明`);

  // C. 选项顺序未被重排
  quiz.questions.forEach((q, i) => {
    let last = -1;
    let ordered = true;
    q.options.forEach((opt) => {
      const pos = quizHtml.indexOf(opt);
      if (pos < 0 || pos < last) ordered = false;
      last = pos;
    });
    check(ordered, `${id}: 第 ${i + 1} 题选项在 DOM 中的顺序与 quiz.json 不一致（渲染器重排会让 correct 失效）`);
  });
}

if (notes.length) notes.forEach((n) => console.log("· " + n));
if (fails.length) {
  console.error("✗ 测验去偏检查失败：");
  fails.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`✓ 去偏检查通过：${Object.keys(data.quizzes).length} 讲 quiz，作答前 DOM 无答案泄漏，选项顺序未被重排。`);