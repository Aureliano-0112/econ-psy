#!/usr/bin/env node
/* test_seo_routes.js — 预渲染页面可直达（门禁第 7 条，AGENTS.md 规则 10）
 *
 * 静态路由必须能刷新/直链访问，且正文不依赖 JS 才能读到：
 *   1. 目录页 / 术语表 / 学习路径 / 每个讲次页都存在，且是完整 HTML（含 <title> 与 <h1>）；
 *   2. 每个讲次页含该讲标题与主旨（正文预渲染，非由 JS 注入）；
 *   3. sitemap.xml 覆盖全部讲次；llms.txt 存在且列出讲次；
 *   4. app.js 的软导航必须同步「页面之外／页面之上」的状态：① #main 的 class（版式策略：
 *      课程页通铺全屏 / 其余页 68rem 版心）随目标页切换；② 顶栏的 aria-current（当前栏目）
 *      随目标页重算；③ 右栏段落导航的锚点点击由脚本接管（原生 fragment 跳转可能不滚动）。
 *      这是纯静态校验能覆盖到的部分；运行时真实效果仍须人工在浏览器里跨页点击核对（§12.4）。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SITE = __dirname;
const data = require("./data.js");

const fails = [];
function need(rel, label) {
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) { fails.push(`缺少 ${label}：site/${rel}`); return null; }
  const html = fs.readFileSync(p, "utf8");
  if (!/<title>[^<]+<\/title>/.test(html)) fails.push(`${label} 缺少 <title>`);
  if (!/<h1[ >]/.test(html)) fails.push(`${label} 缺少预渲染的 <h1>`);
  return html;
}

need("index.html", "目录页");
need("glossary/index.html", "术语表");
need("paths/index.html", "学习路径");

for (const l of data.lessons) {
  const rel = `lessons/${l.moduleDir}/${l.slug}/index.html`;
  const html = need(rel, `讲次页 ${l.id}`);
  if (!html) continue;
  if (!html.includes(escapeHtml(l.title))) fails.push(`${l.id}: 讲次页未包含标题文本`);
  if (!html.includes(escapeHtml(l.summary))) fails.push(`${l.id}: 讲次页未包含一句话主旨`);
  if (!html.includes(`data-lesson="${l.id}"`)) fails.push(`${l.id}: 讲次页缺少 data-lesson 锚点`);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const sitemapPath = path.join(SITE, "sitemap.xml");
if (!fs.existsSync(sitemapPath)) fails.push("缺少 site/sitemap.xml");
else {
  const sm = fs.readFileSync(sitemapPath, "utf8");
  for (const l of data.lessons) {
    if (!sm.includes(`/lessons/${l.moduleDir}/${l.slug}/`)) fails.push(`sitemap.xml 缺少 ${l.id}`);
  }
  if (!/^<\?xml/.test(sm)) fails.push("sitemap.xml 缺少 XML 声明");
}

const llmsPath = path.join(SITE, "llms.txt");
if (!fs.existsSync(llmsPath)) fails.push("缺少 site/llms.txt");
else {
  const ll = fs.readFileSync(llmsPath, "utf8");
  for (const l of data.lessons) if (!ll.includes(l.id)) fails.push(`llms.txt 缺少 ${l.id}`);
}

// 4. 软导航必须同步 #main 的 class（见文件头第 4 条）
const appPath = path.join(SITE, "app.js");
if (!fs.existsSync(appPath)) fails.push("缺少 site/app.js");
else {
  const app = fs.readFileSync(appPath, "utf8");
  const fn = app.match(/function swapFrom\([\s\S]*?\n  \}/);
  if (!fn) fails.push("app.js 未找到 swapFrom()");
  else if (!/MAIN\.className\s*=\s*newMain\.className/.test(fn[0]))
    fails.push("app.js 的 swapFrom() 未同步 #main 的 className：软导航会沿用上一页的版式策略");
  if (!/function syncNavCurrent\(/.test(app) || !/syncNavCurrent\(doc\)/.test(fn ? fn[0] : ""))
    fails.push("app.js 未在软导航后重算顶栏的 aria-current：高亮会停在落地页的栏目上");
  if (!/function goToSection\(/.test(app) || !/goToSection\(href\.slice\(1\)\)/.test(app))
    fails.push("app.js 未接管右栏段落导航的锚点点击：原生 fragment 跳转可能不滚动（见 §12.3）");
}

if (fails.length) {
  console.error("✗ 预渲染路由检查失败：");
  fails.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`✓ 路由检查通过：3 个功能页 + ${data.lessons.length} 个讲次页可直达，sitemap/llms 覆盖完整。`);