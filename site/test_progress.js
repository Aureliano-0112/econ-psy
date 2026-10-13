#!/usr/bin/env node
/* test_progress.js — 进度存储与 schemaVersion 迁移（门禁第 6 条，AGENTS.md 第 9 节）
 *
 * progress.js 是 Node/浏览器共用的纯逻辑模块：不碰 localStorage 的部分可在此直接测。
 * 覆盖：空状态结构、旧版本迁移、畸形输入、状态机、测验写入与 reviewQueue、导出/导入往返。
 */
"use strict";

const path = require("path");
const P = require("./progress.js");

let failed = 0;
function ok(cond, name) {
  console.log((cond ? "  ✓ " : "  ✗ ") + name);
  if (!cond) failed++;
}

console.log("progress.js 测试");

// 1. 键名与版本
ok(P.KEY === "econpsych.progress.v1", "存储键为 econpsych.progress.v1");
ok(P.SCHEMA_VERSION === 1, "当前 schemaVersion = 1");

// 2. 空状态结构
const empty = P.emptyState();
ok(empty.schemaVersion === 1 && typeof empty.lessons === "object" && Array.isArray(empty.reviewQueue),
  "emptyState 结构正确");

// 3. 迁移：旧版本（无 schemaVersion）+ 保留已有数据
const legacy = { lessons: { "00-01": { status: "done", quizScore: 0.9 } }, reviewQueue: ["01-02"] };
const migrated = P.migrate(legacy);
ok(migrated.schemaVersion === 1, "旧数据被迁移到 schemaVersion 1");
ok(migrated.lessons["00-01"].status === "done", "迁移保留既有的 status");
ok(migrated.lessons["00-01"].quizScore === 0.9, "迁移保留既有的 quizScore");
ok(typeof migrated.lessons["00-01"].updatedAt === "string", "迁移补齐 updatedAt");
ok(migrated.reviewQueue.length === 1, "迁移保留 reviewQueue");

// 4. 迁移：畸形输入一律降级为空状态，不抛异常
ok(P.migrate(null).schemaVersion === 1, "null 输入 → 空状态");
ok(P.migrate("not json").schemaVersion === 1, "坏字符串 → 空状态");
ok(P.migrate(42).schemaVersion === 1, "非对象 → 空状态");
const dirty = P.migrate({ lessons: { x: { status: "bogus" } } });
ok(dirty.lessons.x.status === "not-started", "非法状态被归一为 not-started");

// 5. 状态机
let s = P.emptyState();
s = P.setStatus(s, "00-01", "reading");
ok(s.lessons["00-01"].status === "reading", "not-started → reading");
s = P.setStatus(s, "00-01", "quizzed");
ok(s.lessons["00-01"].status === "quizzed", "reading → quizzed");

// 6. 测验写入：≥70% 记 done；<70% 记 quizzed 并进 reviewQueue
let a = P.emptyState();
a = P.recordQuiz(a, "00-01", 0.9);
ok(a.lessons["00-01"].status === "done", "得分 90% → done");
ok(a.reviewQueue.indexOf("00-01") < 0, "达标的讲不进 reviewQueue");
let b = P.emptyState();
b = P.recordQuiz(b, "01-01", 0.5);
ok(b.lessons["01-01"].status === "quizzed", "得分 50% → quizzed");
ok(b.reviewQueue.indexOf("01-01") >= 0, "低于 70% 进 reviewQueue");
b = P.recordQuiz(b, "01-01", 0.8);
ok(b.reviewQueue.indexOf("01-01") < 0, "重考达标后移出 reviewQueue");

// 7. 导出/导入往返
const round = P.importJson(P.exportJson(b));
ok(JSON.stringify(round) === JSON.stringify(P.migrate(b)), "导出后导入可无损往返");
ok(P.importJson("{").schemaVersion === 1, "导入坏 JSON → 空状态（不抛异常）");

// 8. summary
const sum = P.summary(b);
ok(sum.done + sum.quizzed + sum.reading === 1, "summary 统计只计已开始的讲");

console.log(failed ? `\n✗ progress.js 测试失败 ${failed} 项。` : "\n✓ progress.js 测试全部通过。");
process.exit(failed ? 1 : 0);