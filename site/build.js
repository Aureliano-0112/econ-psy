#!/usr/bin/env node
/* build.js — 构建（派生层）
 *
 * 职责（见 plan.md §5.1、ROADMAP.md §3）：
 *   1. 扫描 phases/** 得到课程清单，解析每讲 docs/zh.md 头部与正文；
 *   2. 用 md-render.js 预渲染各页面（目录 / 课程 / 术语表 / 学习路径），正文不依赖 JS 即可读；
 *   3. 生成 site/data.js、sitemap.xml、llms.txt；
 *   4. 回写 README.md 的计数文案。
 *   --check：只校验不写盘（计数对账，见 ROADMAP §3）。
 *
 * 本文件与 site/** 一律是派生层：不得写入任何课程内容（AGENTS.md 规则 1）。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const md = require("./md-render.js");

const ROOT = path.resolve(__dirname, "..");
const SITE = __dirname;
const CHECK = process.argv.includes("--check");
const PLACEHOLDER_NOTE = "SITE_URL 已指向真实 GitHub Pages 站点；换域名时改这里（或用环境变量 SITE_URL 覆盖）。";
// 站点根地址：sitemap / llms.txt 用绝对链接。可用环境变量 SITE_URL 覆盖。
const SITE_URL = (process.env.SITE_URL || "https://aureliano-0112.github.io/econ-psy").replace(/\/+$/, "");

const esc = md.escapeHtml;

// ---------------------------------------------------------------- 基础工具

function readText(p) {
  return fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
}
function exists(p) {
  try { fs.accessSync(p); return true; } catch (e) { return false; }
}
function linesBetween(text, startRe, endRe) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => startRe.test(l));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (endRe && endRe.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}
function tableRows(lines) {
  const rows = [];
  for (const line of lines) {
    const s = line.trim();
    if (!s.startsWith("|")) continue;
    const cells = s.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // 分隔行
    rows.push(cells);
  }
  return rows.slice(1); // 去掉表头
}
function digits(s) { const m = String(s || "").match(/\d+/); return m ? Number(m[0]) : null; }
function stripMd(s) { return String(s || "").replace(/[*`]/g, "").trim(); }

// ---------------------------------------------------------------- 契约/总表解析

function parseRoadmap() {
  const text = readText(path.join(ROOT, "ROADMAP.md"));
  const modules = [];
  let total = null;
  for (const c of tableRows(linesBetween(text, /^## 1\./, /^## /))) {
    const dirM = c[0].match(/`([^`]+)`/);
    if (!dirM) {
      if (c[0].includes("合计")) total = digits(c[2]);
      continue;
    }
    modules.push({ dir: dirM[1], name: c[1], planned: digits(c[2]) });
  }
  if (total === null && modules.length) total = modules.reduce((a, m) => a + m.planned, 0);

  const registry = [];
  for (const c of tableRows(linesBetween(text, /^## 2\./, /^## /))) {
    const idM = c[0].match(/`(\d{2}-\d{2})`/);
    const slugM = c[1].match(/`([^`]+)`/);
    if (!idM || !slugM) continue;
    registry.push({ id: idM[1], slug: slugM[1], title: c[2], type: c[3], status: c[4] });
  }
  return { modules, registry, total };
}

function parsePlanAllocation() {
  const text = readText(path.join(ROOT, "plan.md"));
  const alloc = new Map();
  for (const c of tableRows(linesBetween(text, /^###\s*1\.1/, /^#{2,3}\s/))) {
    const dirM = c[0].match(/`([^`]+)`/);
    if (!dirM) continue;
    const n = digits(c[2]);
    if (n !== null) alloc.set(dirM[1], n);
  }
  return alloc;
}

function parseGlossary() {
  const text = readText(path.join(ROOT, "glossary", "terms.md"));
  const terms = [];
  for (const c of tableRows(linesBetween(text, /^## 2\./, /^## /))) {
    if (c.length < 4) continue;
    const term = stripMd(c[0]);
    if (!term) continue;
    terms.push({
      term,
      discipline: stripMd(c[1]),
      definition: c[2].replace(/\s+/g, " ").trim(),
      firstLesson: stripMd(c[3]),
    });
  }
  return terms;
}

function parsePaths() {
  const dir = path.join(ROOT, "learning-paths");
  if (!exists(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
    try { return JSON.parse(readText(path.join(dir, f))); }
    catch (e) { return { id: f.replace(/\.json$/, ""), name: f, error: String(e.message) }; }
  });
}

// ---------------------------------------------------------------- 讲次扫描

function scanLessonDirs(modules) {
  const out = [];
  for (const m of modules) {
    const mdir = path.join(ROOT, "phases", m.dir);
    if (!exists(mdir)) continue;
    for (const entry of fs.readdirSync(mdir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const num = entry.name.match(/^(\d{2})-/);
      if (!num) continue;
      out.push({ id: `${m.dir.slice(0, 2)}-${num[1]}`, moduleDir: m.dir, slug: entry.name, dir: path.join(mdir, entry.name) });
    }
  }
  return out;
}

function parseHeader(text) {
  const idx = text.search(/^##\s/m);
  const header = idx >= 0 ? text.slice(0, idx) : text;
  const titleM = header.match(/^#\s+(.*)$/m);
  const summaryM = header.match(/^>\s?(.*)$/m);
  const fields = {};
  const markerRe = /\*\*([^*：\n]{1,12})：\*\*/g;
  const marks = [];
  let m;
  while ((m = markerRe.exec(header)) !== null) marks.push({ name: m[1], end: markerRe.lastIndex });
  marks.forEach((mk, i) => {
    const stop = i + 1 < marks.length ? marks[i + 1].end - (`**${marks[i + 1].name}：**`).length : header.length;
    fields[mk.name] = header.slice(mk.end, stop).trim();
  });
  return { title: titleM ? titleM[1].trim() : "", summary: summaryM ? summaryM[1].trim() : "", fields, header };
}

function parseOutputs(dir) {
  const odir = path.join(dir, "outputs");
  if (!exists(odir)) return [];
  return fs.readdirSync(odir).filter((f) => f.endsWith(".md")).sort().map((f) => {
    const raw = readText(path.join(odir, f));
    let fm = {};
    let body = raw;
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fmMatch) {
      body = raw.slice(fmMatch[0].length);
      for (const line of fmMatch[1].split(/\r?\n/)) {
        const kv = line.match(/^([A-Za-z_]+)\s*:\s*(.*)$/);
        if (kv) fm[kv[1]] = kv[2].trim();
      }
    }
    return { file: f, title: fm.title || f.replace(/\.md$/, ""), type: fm.type || "", html: md.render(body) };
  });
}

function parseLesson(info, module) {
  const zh = readText(path.join(info.dir, "docs", "zh.md"));
  const { title, summary, fields } = parseHeader(zh);
  const bodyIdx = zh.search(/^##\s/m);
  const bodyMd = bodyIdx >= 0 ? zh.slice(bodyIdx) : zh;
  let quiz = null;
  const quizPath = path.join(info.dir, "quiz.json");
  if (exists(quizPath)) {
    try { quiz = JSON.parse(readText(quizPath)); } catch (e) { quiz = null; }
  }
  return Object.assign({}, info, {
    module: info.moduleDir.slice(0, 2),
    moduleName: module.name,
    num: info.id.slice(3),
    title,
    summary,
    type: fields["类型"] || "",
    prereq: fields["前置"] || "",
    minutes: fields["预计时间"] || "",
    html: md.render(bodyMd),
    quiz,
    outputs: parseOutputs(info.dir),
  });
}

// ---------------------------------------------------------------- 页面渲染

// opts: { mainClass, nav, footStats, footLog }
//   nav 取值 home|glossary|paths，对应栏目加 aria-current="page"（顶栏只标当前栏目，不加图标）
function renderShell(rel, title, description, content, opts) {
  opts = opts || {};
  const tpl = readText(path.join(SITE, "template.html"));
  const parts = rel.split("/");
  const root = parts.length > 1 ? "../".repeat(parts.length - 1) : "";
  const cur = (key) => (opts.nav === key ? ' aria-current="page"' : "");
  return tpl
    .replace(/\{\{TITLE\}\}/g, esc(title))
    .replace(/\{\{DESCRIPTION\}\}/g, esc(description))
    .replace(/\{\{ROOT\}\}/g, root)
    .replace(/\{\{MAIN_CLASS\}\}/g, opts.mainClass || "wrap")
    .replace(/\{\{NAV_HOME\}\}/g, cur("home"))
    .replace(/\{\{NAV_GLOSSARY\}\}/g, cur("glossary"))
    .replace(/\{\{NAV_PATHS\}\}/g, cur("paths"))
    .replace(/\{\{FOOT_STATS\}\}/g, opts.footStats || "")
    .replace(/\{\{FOOT_LOG\}\}/g, esc(opts.footLog || ""))
    .replace(/\{\{CONTENT\}\}/g, content);
}

// 目录页：刊头（栏目眉标 + 本期读数 + 数据条 + 检索行），下面是按模块铺开的登记册。
// 登记册每行是一份样品记录：编号｜标题与主旨｜类型｜时长。
function catalogHtml(lessons, modules, root, counts) {
  const pad2 = (n) => String(n).padStart(2, "0");
  let h = `<article class="sheet sheet-catalog">
<header class="masthead">
<div class="masthead-top"><span class="kicker">课程目录</span><span class="masthead-code">已建 ${lessons.length} / 计划 ${counts.total} 讲</span></div>
<h1>经济学 × 心理学</h1>
<p class="standfirst">心理学给偏好的形状，经济学给聚合的机器。内容真相在 <code>phases/**</code>，本页由构建脚本预渲染。</p>
<dl class="data-strip readout-strip">
<div><dt>模块</dt><dd>${pad2(modules.length)}</dd></div>
<div><dt>计划讲次</dt><dd>${counts.total}</dd></div>
<div><dt>已建讲次</dt><dd>${lessons.length}</dd></div>
<div><dt>术语</dt><dd>${counts.terms}</dd></div>
<div><dt>学习路线</dt><dd>${pad2(counts.paths)}</dd></div>
</dl>
<div class="find"><label for="lessonSearch">筛选</label><input class="search" id="lessonSearch" type="search" placeholder="按 / 聚焦，输入关键词筛选讲次" aria-label="搜索讲次"></div>
</header>`;
  for (const m of modules) {
    const list = lessons.filter((l) => l.moduleDir === m.dir);
    h += `<section class="module" data-module="${esc(m.dir.slice(0, 2))}">
<header class="module-head"><span class="module-num">${esc(m.dir.slice(0, 2))}</span><h2>${esc(m.name)}</h2><span class="module-count">${pad2(list.length)} / ${pad2(m.planned)} 讲</span></header>`;
    if (!list.length) {
      h += `<p class="empty">本模块尚未开始。</p>`;
    } else {
      h += `<ul class="register">`;
      for (const l of list) {
        h += `<li data-search="${esc((l.id + " " + l.title + " " + l.summary + " " + l.type).toLowerCase())}">` +
          `<a class="lesson-card" href="${root}lessons/${m.dir}/${l.slug}/">` +
          `<span class="c-id" data-lesson="${esc(l.id)}">${esc(l.id)}</span>` +
          `<span class="c-title">${esc(l.title)}</span>` +
          `<span class="c-type">${esc(l.type || "—")}</span>` +
          `<span class="c-min">${esc(l.minutes || "—")}</span>` +
          `<span class="c-sum">${esc(l.summary)}</span></a></li>`;
      }
      h += `</ul>`;
    }
    h += `</section>`;
  }
  return h + `</article>`;
}

// 测验区（规则 5：作答前的 DOM 里不得出现 correct / explanation 的任何内容）。
// 注意：门禁 5 只扫描从 `<section class="quiz"` 到其后第一个 `</section>` 之间的片段，
//      因此本区域内不得再嵌套 <section>，也不得出现 correct 字样。
function quizHtml(l) {
  const q = l.quiz;
  if (!q || !Array.isArray(q.questions)) return "";
  const cnt = (stage) => q.questions.filter((x) => x.stage === stage).length;
  const meta = `${q.questions.length} 题 · 前测 ${cnt("pre")} / 检核 ${cnt("check")} / 后测 ${cnt("post")}`;
  let h = `<section class="quiz" data-lesson="${esc(l.id)}" aria-labelledby="quiz-h">
<h2 id="quiz-h">自测<span class="h2-meta">${esc(meta)}</span></h2>
<p class="notice">答案可见于页面数据，本站不做防作弊，请当作自测。</p>
<form class="quiz-form" novalidate>`;
  q.questions.forEach((item, i) => {
    h += `<fieldset class="quiz-q" data-index="${i}"><legend>${i + 1}. ${esc(item.question)}</legend>`;
    item.options.forEach((opt, oi) => {
      h += `<label><input type="radio" name="q${i}" value="${oi}"> ${esc(opt)}</label>`;
    });
    h += `</fieldset>`;
  });
  h += `<button type="submit">提交并查看解析</button></form><div class="quiz-result" hidden></div></section>`;
  return h;
}

function outputsHtml(l) {
  if (!l.outputs.length) return "";
  let h = `<section class="outputs"><h2>带走的东西<span class="h2-meta">${l.outputs.length} 件</span></h2>`;
  for (const o of l.outputs) {
    h += `<div class="output"><h3>${esc(o.title)}${o.type ? ` <span class="badge">${esc(o.type)}</span>` : ""}</h3>${o.html}</div>`;
  }
  return h + `</section>`;
}

function prereqHtml(prereq, all, root) {
  if (!prereq || prereq === "无") return "无";
  return String(prereq).split(/[、,，\s]+/).filter(Boolean).map((id) => {
    const t = all.find((x) => x.id === id);
    return t ? `<a href="${root}lessons/${t.moduleDir}/${t.slug}/">${esc(id)}</a>` : esc(id);
  }).join("、");
}

// 给正文的每个 H2 加锚点（sec-01…），同时抽右侧段落导航的条目。
// 编号与 styles.css 里的 CSS 计数器同源：都按 H2 出现顺序。
function withSectionIds(html) {
  const toc = [];
  const out = String(html).replace(/<h2>([\s\S]*?)<\/h2>/g, (m, inner) => {
    const id = "sec-" + String(toc.length + 1).padStart(2, "0");
    toc.push({ id, text: inner.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim() });
    return `<h2 id="${id}">${inner}</h2>`;
  });
  return { html: out, toc };
}

// 左栏：本模块（当前阶段）的讲次清单，当前讲标记 aria-current。
function moduleRailHtml(l, all, root) {
  const list = all.filter((x) => x.moduleDir === l.moduleDir);
  if (!list.length) return "";
  let h = `<nav class="rail rail-module" aria-label="本模块讲次">
<p class="rail-title"><span>模块 ${esc(l.module)}</span><span>${esc(l.moduleName)}</span></p>
<ol class="rail-list">`;
  for (const x of list) {
    const cur = x.id === l.id;
    h += `<li><a href="${root}lessons/${x.moduleDir}/${x.slug}/"${cur ? ' class="is-current" aria-current="page"' : ""}>` +
      `<span class="r-num">${esc(x.num)}</span><span class="r-text">${esc(x.title)}</span></a></li>`;
  }
  h += `</ol>
<p class="rail-foot"><a href="${root}index.html">全部讲次目录</a></p>
</nav>`;
  return h;
}

// 右栏：本讲段落导航（H2），编号与正文里的 § NN 一致。
function tocHtml(toc) {
  if (!toc.length) return "";
  let h = `<nav class="rail rail-toc" aria-label="本讲段落">
<p class="rail-title"><span>本讲段落</span><span>${toc.length} 节</span></p>
<ol class="toc-list">`;
  toc.forEach((s, i) => {
    h += `<li><a href="#${s.id}"><span class="t-num">§ ${String(i + 1).padStart(2, "0")}</span><span class="t-text">${esc(s.text)}</span></a></li>`;
  });
  return h + `</ol>
</nav>`;
}

// 讲次页：刊头＝眉标行 + 标本签（大号等宽讲次编号）+ 标题 + 导语 + 数据条。
// 数据条里的字段都是真实派生值；标本签是纯呈现（aria-hidden），讲次信息在数据条里另有一份。
function lessonHtml(l, all, root, planned) {
  const i = all.indexOf(l);
  const prev = i > 0 ? all[i - 1] : null;
  const next = i < all.length - 1 ? all[i + 1] : null;
  const body = withSectionIds(l.html);

  let main = `<div class="lesson-main">
<header class="masthead">
<div class="masthead-top"><span class="kicker">模块 ${esc(l.module)} · ${esc(l.moduleName)}</span><span class="masthead-code">第 ${esc(l.num)} 讲${planned ? ` / 共 ${planned} 讲` : ""}</span></div>
<p class="catalog-no" aria-hidden="true">${esc(l.module)}–${esc(l.num)}</p>
<h1>${esc(l.title)}</h1>
<p class="standfirst">${esc(l.summary)}</p>
<dl class="data-strip specimen">
<div><dt>讲次</dt><dd>${esc(l.id)}</dd></div>
<div><dt>前置</dt><dd>${prereqHtml(l.prereq, all, root)}</dd></div>
<div><dt>预计</dt><dd>${esc(l.minutes || "—")}</dd></div>
<div><dt>类型</dt><dd>${esc(l.type || "—")}</dd></div>
</dl>
<p class="lesson-status" id="lessonStatus" aria-live="polite"></p>
</header>
<section class="lesson-body">${body.html}</section>`;
  main += quizHtml(l);
  main += outputsHtml(l);
  main += `<nav class="lesson-nav" aria-label="讲次导航">`;
  main += prev
    ? `<a class="nav-prev" href="${root}lessons/${prev.moduleDir}/${prev.slug}/"><span class="nav-dir">上一讲</span><span class="nav-ttl">${esc(prev.id)} ${esc(prev.title)}</span></a>`
    : `<span class="nav-none"></span>`;
  main += next
    ? `<a class="nav-next" href="${root}lessons/${next.moduleDir}/${next.slug}/"><span class="nav-dir">下一讲</span><span class="nav-ttl">${esc(next.id)} ${esc(next.title)}</span></a>`
    : `<span class="nav-none"></span>`;
  main += `</nav></div>`;

  return `<article class="lesson" data-lesson="${esc(l.id)}">
<div class="lesson-layout">
${moduleRailHtml(l, all, root)}
${main}
${tocHtml(body.toc)}
</div>
</article>`;
}

function glossaryHtml(terms, byId, root) {
  if (!terms.length) return `<h1>术语表</h1><p class="empty">术语表为空。</p>`;
  let h = `<header class="masthead">
<div class="masthead-top"><span class="kicker">术语表</span><span class="masthead-code" id="glossaryCount">${terms.length} 条</span></div>
<h1>术语表</h1>
<p class="standfirst">术语的唯一来源是仓库里的 <code>glossary/terms.md</code>；本页由构建脚本派生。每条给出的一句话定义与首见讲次都可核查。</p>
<div class="find"><label for="glossarySearch">筛选</label><input class="search" id="glossarySearch" type="search" placeholder="输入术语、学科或讲次编号" aria-label="筛选术语"></div>
</header>
<table class="term-table"><thead><tr><th>术语</th><th>学科</th><th>一句话定义</th><th>首见</th></tr></thead><tbody>`;
  for (const t of terms) {
    const l = byId.get(t.firstLesson);
    const link = l ? `<a href="${root}lessons/${l.moduleDir}/${l.slug}/">${esc(t.firstLesson)}</a>` : esc(t.firstLesson);
    const hay = esc((t.term + " " + t.discipline + " " + t.definition + " " + t.firstLesson).toLowerCase());
    h += `<tr data-search="${hay}"><td>${esc(t.term)}</td><td>${esc(t.discipline)}</td><td>${esc(t.definition)}</td><td>${link}</td></tr>`;
  }
  return h + `</tbody></table>`;
}

function pathsHtml(paths, byId, root) {
  let h = `<header class="masthead">
<div class="masthead-top"><span class="kicker">学习路径</span><span class="masthead-code">${paths.length} 条路线</span></div>
<h1>学习路径</h1>
<p class="standfirst">路线顺序的唯一来源是 <code>learning-paths/*.json</code>；站点只渲染，不手写顺序。</p>
</header>`;
  if (!paths.length) return h + `<p class="empty">尚未建立学习路径。</p>`;
  for (const p of paths) {
    const req = (p.required || []);
    const opt = (p.optional || []);
    const weeks = p.weeks ? `${p.weeks} 周` : "—";
    const per = p.lessonsPerWeek ? `每周 ${p.lessonsPerWeek} 讲` : "";
    h += `<section class="route">
<span class="route-id">${esc(p.id)}</span>
<h2>${esc(p.name || p.id)}</h2>
<p class="route-stats">${esc(weeks)}${per ? " · " + esc(per) : ""} · 必修 ${req.length} 讲 · 选修 ${opt.length} 讲</p>
<ol>`;
    for (const id of req) h += `<li>${linkTo(id, byId, root)}</li>`;
    h += `</ol>`;
    if (opt.length) {
      h += `<p class="route-optional"><span class="opt-tag">可选</span>${opt.map((id) => linkTo(id, byId, root)).join("、")}</p>`;
    }
    if (Array.isArray(p.gates) && p.gates.length) {
      h += `<p class="gates">门禁：${p.gates.map((g) => `学习完 ${esc(g.after)} 后做 ${esc(g.check)}`).join("；")}</p>`;
    }
    h += `</section>`;
  }
  return h;
}

function linkTo(id, byId, root) {
  const l = byId.get(id);
  return l ? `<a href="${root}lessons/${l.moduleDir}/${l.slug}/">${esc(id)} ${esc(l.title)}</a>` : esc(id);
}

// ---------------------------------------------------------------- 计数对账

function runChecks(ctx) {
  const { modules, registry, total, alloc, lessonDirs, lessons, paths } = ctx;
  const errs = [];

  // 1. ROADMAP §1 ↔ plan.md §1.1
  if (!alloc.size) errs.push("plan.md §1.1 未解析出任何分配行");
  for (const m of modules) {
    if (!alloc.has(m.dir)) errs.push(`plan.md §1.1 缺少模块 ${m.dir}`);
    else if (alloc.get(m.dir) !== m.planned) errs.push(`${m.dir}：ROADMAP 计划 ${m.planned} ≠ plan.md §1.1 ${alloc.get(m.dir)}`);
  }
  const sum = modules.reduce((a, m) => a + m.planned, 0);
  if (sum !== total) errs.push(`ROADMAP §1 合计 ${total} ≠ 各模块之和 ${sum}`);
  if (total !== 72) errs.push(`ROADMAP §1 合计应为 72，实际 ${total}`);

  // 2. 模块目录存在
  for (const m of modules) {
    if (!exists(path.join(ROOT, "phases", m.dir))) errs.push(`phases/${m.dir} 不存在（ROADMAP §3 检查 2）`);
  }

  // 3. 登记表 ↔ 磁盘 双向一一对应
  const diskIds = lessonDirs.map((d) => d.id);
  const regIds = registry.map((r) => r.id);
  for (const r of regIds) if (!diskIds.includes(r)) errs.push(`登记 ${r} 在磁盘上没有对应讲目录`);
  for (const d of diskIds) if (!regIds.includes(d)) errs.push(`磁盘讲目录 ${d} 未在 ROADMAP §2 登记`);

  // 4. ID 落在模块范围内，且模块内连续
  for (const m of modules) {
    const mod = m.dir.slice(0, 2);
    const nums = registry.filter((r) => r.id.startsWith(mod + "-")).map((r) => Number(r.id.slice(3))).sort((a, b) => a - b);
    nums.forEach((n, idx) => {
      if (n < 1 || n > m.planned) errs.push(`${mod}-${String(n).padStart(2, "0")} 越界（模块 ${m.dir} 计划 ${m.planned} 讲）`);
      if (n !== idx + 1) errs.push(`模块 ${m.dir} 讲次不连续：第 ${idx + 1} 个应为 ${mod}-${String(idx + 1).padStart(2, "0")}，实际 ${mod}-${String(n).padStart(2, "0")}`);
    });
  }

  // 5. slug 与磁盘目录名一致
  for (const r of registry) {
    const d = lessonDirs.find((x) => x.id === r.id);
    if (d && d.slug !== r.slug) errs.push(`${r.id}：ROADMAP slug「${r.slug}」≠ 磁盘目录「${d.slug}」`);
  }

  // 6. README 计数文案：仅 --check 时校验（普通构建会在写盘阶段重写它，旧值必然过期）
  if (ctx.isCheck) {
    const readmePath = path.join(ROOT, "README.md");
    if (!exists(readmePath)) {
      errs.push("README.md 不存在（应由 build.js 生成后重试 --check）");
    } else {
      const rm = readText(readmePath);
      const reg = rm.match(/已登记讲次：\*\*(\d+)\*\*/);
      if (!reg) errs.push("README.md 缺少「已登记讲次：**N**」计数文案");
      else if (Number(reg[1]) !== registry.length) errs.push(`README.md 已登记讲次 ${reg[1]} ≠ ROADMAP §2 行数 ${registry.length}`);
      const plan = rm.match(/计划讲次：\*\*(\d+)\*\*/);
      if (!plan || Number(plan[1]) !== total) errs.push(`README.md 计划讲次数 ≠ ${total}`);
    }
  }

  // 7. 学习路径引用的讲次必须存在（AGENTS.md §4.5）
  for (const p of paths) {
    for (const id of [].concat(p.required || [], p.optional || [])) {
      if (!diskIds.includes(id)) errs.push(`learning-paths/${p.id}.json 引用了不存在的讲次 ${id}`);
    }
  }

  // 8. 已建讲的 quiz 与 ROADMAP 登记号一致（形状问题交给 audit_lessons.py）
  for (const l of lessons) {
    if (l.quiz && l.quiz.lesson !== l.id) errs.push(`${l.id}：quiz.json 的 lesson 字段「${l.quiz.lesson}」≠ 目录推导值`);
  }
  return errs;
}

// ---------------------------------------------------------------- README / sitemap / llms

function readmeText(ctx) {
  const { modules, registry, lessons, total } = ctx;
  const rows = modules.map((m) => {
    const built = lessons.filter((l) => l.moduleDir === m.dir).length;
    return `| ${m.dir.slice(0, 2)} | ${m.name} | \`${m.dir}\` | ${m.planned} | ${built} |`;
  }).join("\n");
  return `# 经济学 × 心理学 · 学习网站

> 纯静态学习站：无后端、无账号。内容真相在 \`phases/**\`，其余文件（本 README、ROADMAP 计数、\`site/**\`）都是由 \`site/build.js\` 生成的**派生视图**，禁止手改。

## 当前进度

- 计划讲次：**${total}** 讲
- 已登记讲次：**${registry.length}** 讲
- 已建讲目录：**${lessons.length}** 个

## 模块总表

| 模块号 | 模块 | 目录 | 计划讲数 | 已建 |
| --- | --- | --- | --- | --- |
${rows}

> 本表由 \`node site/build.js\` 回写；计数唯一来源是 \`ROADMAP.md\`，讲数分配的唯一来源是 \`plan.md\` §1.1。

## 门禁（提交前必须全绿）

\`\`\`bash
node site/build.js
node site/build.js --check
python3 scripts/audit_lessons.py --strict
python3 scripts/audit_lessons.py --report > coverage.md
node site/test_quiz_debias.js
node site/test_progress.js
node site/test_seo_routes.js
\`\`\`

## 目录结构

- \`phases/NN-module/NN-lesson/\`：每讲四件套（\`docs/zh.md\` + \`quiz.json\` + \`gen-prompt.md\` + \`outputs/\`）
- \`LESSON_TEMPLATE.md\` / \`QUIZ_CONTRACT.md\`：正文骨架与测验形状的唯一来源
- \`ROADMAP.md\`：讲次数量的唯一来源
- \`scripts/\`：脚手架与审计（门禁）
- \`site/\`：构建脚本与派生站点
- \`glossary/\`：术语表与常见误区
- \`learning-paths/\`：学习路径顺序的唯一来源

约定：CI 用 \`python3\`，本地 Windows 用 \`python\`；路径一律用 \`/\`。

> ${PLACEHOLDER_NOTE}
`;
}

function sitemapText(lessons, date) {
  const urls = [
    `${SITE_URL}/index.html`,
    `${SITE_URL}/glossary/index.html`,
    `${SITE_URL}/paths/index.html`,
    ...lessons.map((l) => `${SITE_URL}/lessons/${l.moduleDir}/${l.slug}/`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${date}</lastmod></url>`).join("\n")}
</urlset>
`;
}

function llmsText(ctx) {
  const { lessons, modules, total, registry } = ctx;
  let h = `# 经济学 × 心理学 · 学习网站

> 交叉学科自学站：每讲四件套（讲义 / 测验 / 生成提示词 / 产物）。
> 计划 ${total} 讲，已登记 ${registry.length} 讲，已建 ${lessons.length} 讲。

## 讲次
`;
  for (const l of lessons) {
    h += `- ${l.id} ${l.title}：${l.summary}（${SITE_URL}/lessons/${l.moduleDir}/${l.slug}/）\n`;
  }
  h += `\n## 模块\n`;
  for (const m of modules) h += `- ${m.dir.slice(0, 2)} ${m.name}：计划 ${m.planned} 讲\n`;
  return h;
}

// ---------------------------------------------------------------- main

function main() {
  const { modules, registry, total } = parseRoadmap();
  const alloc = parsePlanAllocation();
  const terms = parseGlossary();
  const paths = parsePaths();
  const lessonDirs = scanLessonDirs(modules);

  const lessons = [];
  for (const info of lessonDirs) {
    const module = modules.find((m) => m.dir === info.moduleDir);
    if (!module || !exists(path.join(info.dir, "docs", "zh.md"))) continue;
    lessons.push(parseLesson(info, module));
  }
  lessons.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const ctx = { modules, registry, total, alloc, lessonDirs, lessons, paths, terms, isCheck: CHECK };
  const errs = runChecks(ctx);

  if (errs.length) {
    console.error(CHECK ? "计数对账失败：" : "构建前校验失败：");
    for (const e of errs) console.error("  ✗ " + e);
    process.exit(1);
  }

  if (CHECK) {
    console.log(`✓ 计数对账通过：模块 ${modules.length} 个，计划 ${total} 讲，登记 ${registry.length} 讲，已建 ${lessons.length} 讲。`);
    return;
  }

  const byId = new Map(lessons.map((l) => [l.id, l]));
  const date = new Date().toISOString().slice(0, 10);
  const writes = [];
  const write = (rel, content) => {
    const p = path.join(SITE, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, "utf8");
    writes.push(rel);
  };

  // 1. data.js
  const data = {
    generatedAt: new Date().toISOString(),
    siteUrl: SITE_URL,
    counts: { planned: total, registered: registry.length, built: lessons.length },
    modules: modules.map((m) => Object.assign({}, m, { lessons: lessons.filter((l) => l.moduleDir === m.dir).map((l) => l.id) })),
    lessons: lessons.map((l) => ({
      id: l.id, module: l.module, moduleDir: l.moduleDir, num: l.num, slug: l.slug,
      title: l.title, summary: l.summary, type: l.type, prereq: l.prereq, minutes: l.minutes,
      url: `lessons/${l.moduleDir}/${l.slug}/`,
    })),
    quizzes: Object.fromEntries(lessons.filter((l) => l.quiz).map((l) => [l.id, l.quiz])),
    glossary: terms,
    paths,
  };
  write("data.js", `/* 自动生成，请勿手改（AGENTS.md 规则 1）。由 site/build.js 生成。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ECONPSY = factory();
})(typeof self !== "undefined" ? self : this, function () {
  return ${JSON.stringify(data, null, 2)};
});
`);

  // 2. 页面（页脚校勘栏的读数与构建日志由同一份上下文派生，不在模板里写死）
  const plannedByDir = new Map(modules.map((m) => [m.dir, m.planned]));
  const footStats = [
    ["模块", modules.length],
    ["计划讲次", total],
    ["已建讲次", lessons.length],
    ["术语", terms.length],
    ["学习路线", paths.length],
  ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("");
  const footLog = `派生自 phases/** · 由 site/build.js 生成 · 构建于 ${date}`;
  const shell = (nav) => ({ nav, footStats, footLog });

  write("index.html", renderShell("index.html", "经济学 × 心理学 · 学习目录", "交叉学科自学站的学习目录，按模块列出全部讲次。",
    catalogHtml(lessons, modules, "", { total, terms: terms.length, paths: paths.length }), shell("home")));
  write("glossary/index.html", renderShell("glossary/index.html", "术语表 · 经济学 × 心理学", "全课术语表，每条含一句话定义与首见讲次。",
    glossaryHtml(terms, byId, "../"), shell("glossary")));
  write("paths/index.html", renderShell("paths/index.html", "学习路径 · 经济学 × 心理学", "三条学习路线的讲次顺序。",
    pathsHtml(paths, byId, "../"), shell("paths")));
  for (const l of lessons) {
    const rel = `lessons/${l.moduleDir}/${l.slug}/index.html`;
    write(rel, renderShell(rel, `${l.title} · 经济学 × 心理学`, l.summary,
      lessonHtml(l, lessons, "../../../", plannedByDir.get(l.moduleDir)),
      Object.assign({ mainClass: "wrap wrap-lesson" }, shell(null))));
  }

  // 3. sitemap / llms
  write("sitemap.xml", sitemapText(lessons, date));
  write("llms.txt", llmsText(ctx));

  // 4. README（派生视图）
  fs.writeFileSync(path.join(ROOT, "README.md"), readmeText(ctx), "utf8");

  console.log(`✓ 构建完成：${writes.length} 个站点文件 + README.md`);
  console.log(`  讲次 ${lessons.length}/${total} · 术语 ${terms.length} 条 · 路径 ${paths.length} 条`);
  for (const w of writes) console.log("  · site/" + w);
}

main();