/* app.js — 交互层。
 *
 * 视图模型：页面由构建脚本预渲染（AGENTS.md 规则 10：刷新/直链/无 JS 均可读），
 * 本文件在此之上做「增强」：
 *   1. 站内导航改为客户端读取并渲染对应页面（不再整页刷新，阅读不中断）；
 *   2. 目录筛选与进度徽标、课程页测验判定与解析揭示、进度导入导出；
 *   3. 顶部阅读刻度尺、Mermaid 图表按需渲染。
 *
 * 答案（correct / explanation）只存在于 data.js，作答前绝不写进 DOM（规则 5）。
 */
(function () {
  "use strict";
  var P = window.Progress;
  var DATA = window.ECONPSY;
  if (!P) return;
  var state = P.load();
  var MAIN = document.getElementById("main");

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function statusOf(id) { return (state.lessons[id] && state.lessons[id].status) || "not-started"; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- 顶栏：进度摘要 + 进度工具（顶栏不随导航替换，只注入一次）----
  function renderMini() {
    var el = $("#progressMini");
    if (!el) return;
    var s = P.summary(state);
    var total = DATA && DATA.counts ? DATA.counts.built : 0;
    el.textContent = total
      ? "进度 " + s.done + " 完成 / " + s.quizzed + " 已测 / " + s.reading + " 在读 · 共 " + total + " 讲"
      : "";
  }

  function injectTools() {
    var bar = $(".topbar");
    if (!bar || $("#progressTools")) return;
    var box = document.createElement("div");
    box.className = "tools";
    box.id = "progressTools";
    box.innerHTML =
      '<button type="button" id="pExport">导出进度</button>' +
      '<button type="button" id="pImport">导入进度</button>' +
      '<button type="button" id="pReset">清空进度</button>' +
      '<input type="file" id="pFile" accept="application/json" hidden>';
    bar.appendChild(box);
    $("#pExport").addEventListener("click", function () {
      var blob = new Blob([P.exportJson(state)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "econpsych-progress.json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $("#pImport").addEventListener("click", function () { $("#pFile").click(); });
    $("#pFile").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        state = P.importJson(String(r.result));
        P.save(state);
        renderMini();
        initCatalog();
        refreshLessonStatus();
        window.alert("已导入进度。");
      };
      r.readAsText(f);
    });
    $("#pReset").addEventListener("click", function () {
      if (!window.confirm("清空本机保存的全部学习进度？此操作不可撤销。")) return;
      state = P.emptyState();
      P.save(state);
      renderMini();
      initCatalog();
      refreshLessonStatus();
    });
  }

  // ---- 目录页：筛选 + 进度徽标 ----
  function applyCatalog() {
    var input = $("#lessonSearch");
    if (!input) return;
    var q = input.value.trim().toLowerCase();
    $$(".lesson-list li").forEach(function (li) {
      var hay = li.getAttribute("data-search") || "";
      li.hidden = q !== "" && hay.indexOf(q) < 0;
    });
    $$(".lesson-list").forEach(function (ul) {
      var any = $$("li", ul).some(function (li) { return !li.hidden; });
      var sec = ul.closest(".module");
      if (sec) sec.hidden = !any;
    });
  }

  function initCatalog() {
    var input = $("#lessonSearch");
    if (!input) return;
    input.addEventListener("input", applyCatalog);
    $$("a.lesson-card").forEach(function (a) {
      var idEl = a.querySelector(".c-id[data-lesson]");
      var id = idEl ? idEl.getAttribute("data-lesson") : "";
      var st = statusOf(id);
      var title = a.querySelector(".c-title");
      if (!title || st === "not-started" || title.querySelector(".badge")) return;
      var b = document.createElement("span");
      b.className = "badge " + (st === "done" ? "done" : st === "reading" ? "reading" : "");
      b.textContent = st === "done" ? "已完成" : st === "reading" ? "在读" : "测验过";
      title.appendChild(document.createTextNode(" "));
      title.appendChild(b);
    });
  }

  // ---- 课程页：状态 + 测验 ----
  function refreshLessonStatus() {
    var el = $("#lessonStatus");
    if (!el) return;
    var art = $("article.lesson");
    if (!art) return;
    var id = art.getAttribute("data-lesson");
    var st = statusOf(id);
    var score = state.lessons[id] && state.lessons[id].quizScore;
    var label = { "not-started": "未开始", reading: "在读", quizzed: "已测验（未达 70%）", done: "已完成" }[st] || st;
    el.textContent = "本讲状态 " + label + (score != null ? " · 最近得分 " + Math.round(score * 100) + "%" : "");
  }

  function initLesson() {
    var art = $("article.lesson");
    if (!art) return;
    var id = art.getAttribute("data-lesson");
    if (statusOf(id) === "not-started") {
      state = P.setStatus(state, id, "reading");
      P.save(state);
    }
    refreshLessonStatus();

    var form = $(".quiz-form", art);
    if (!form) return;
    var result = $(".quiz-result", art);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var quiz = DATA && DATA.quizzes ? DATA.quizzes[id] : null;
      if (!quiz) return;
      var right = 0;
      var lines = [];
      quiz.questions.forEach(function (q, i) {
        var picked = form.querySelector('input[name="q' + i + '"]:checked');
        var pickedIdx = picked ? Number(picked.value) : null;
        var ok = pickedIdx === q.correct;
        if (ok) right++;
        var opts = q.options.map(function (text, oi) {
          var cls = oi === q.correct ? "opt-correct" : oi === pickedIdx ? "opt-wrong" : "";
          var mark = oi === q.correct ? "（正确）" : oi === pickedIdx ? "（你的选择）" : "";
          return cls ? '<span class="' + cls + '">' + esc(text) + mark + "</span>" : esc(text);
        });
        lines.push(
          "<li>" + (ok ? "✔" : "✘") + " " + esc(q.question) + "<ul>" +
          opts.map(function (o) { return "<li>" + o + "</li>"; }).join("") +
          '</ul><div class="reveal">' + esc(q.explanation) + "</div></li>"
        );
      });
      var score = right / quiz.questions.length;
      result.innerHTML =
        '<p class="score">得分 ' + right + " / " + quiz.questions.length + "（" + Math.round(score * 100) + "%）</p>" +
        "<ol>" + lines.join("") + "</ol>";
      result.hidden = false;
      state = P.recordQuiz(state, id, score);
      P.save(state);
      renderMini();
      refreshLessonStatus();
      result.scrollIntoView({ block: "nearest" });
    });
  }

  // ---- 顶部阅读刻度尺 ----
  function updateTick() {
    var bar = document.getElementById("tickBar");
    if (!bar) return;
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? Math.min(1, h.scrollTop / max) : 0) * 100 + "%";
  }

  // ---- 右栏段落导航：随滚动高亮当前段落（纯增强；无 JS 时导航仍可点） ----
  var tocTicking = false;
  function updateTOC() {
    if (tocTicking) return;
    tocTicking = true;
    requestAnimationFrame(function () {
      tocTicking = false;
      var links = $$(".toc-list a");
      if (!links.length) return;
      var bar = $(".topbar");
      var offset = (bar ? bar.offsetHeight : 0) + 24;
      var active = links.length - 1;
      for (var i = 0; i < links.length; i++) {
        var el = document.getElementById((links[i].getAttribute("href") || "").slice(1));
        if (el && el.getBoundingClientRect().top > offset) { active = i - 1; break; }
      }
      if (active < 0) active = 0;
      links.forEach(function (a, i) {
        if (i === active) a.classList.add("is-active");
        else a.classList.remove("is-active");
      });
    });
  }

  // ---- Mermaid：仅当本页含图表时按需加载并渲染 ----
  var mermaidPromise = null;
  function enhanceMermaid() {
    if (!document.querySelector("pre.mermaid")) return;
    if (window.mermaid) { if (window.mermaid.run) window.mermaid.run(); return; }
    if (!mermaidPromise) {
      mermaidPromise = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
        s.onload = function () { if (window.mermaid) window.mermaid.initialize({ startOnLoad: false }); resolve(); };
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    mermaidPromise.then(function () { if (window.mermaid && window.mermaid.run) window.mermaid.run(); }).catch(function () {});
  }

  // ---- 客户端导航：读取并渲染目标页面，避免整页刷新 ----
  function isSameDoc(url) {
    var a = url.pathname.replace(/index\.html$/, "");
    var b = location.pathname.replace(/index\.html$/, "");
    return a === b && url.search === location.search;
  }

  function swapFrom(html, url) {
    if (!MAIN) return false;
    var doc = new DOMParser().parseFromString(html, "text/html");
    var newMain = doc.getElementById("main");
    if (!newMain) return false;
    var title = doc.querySelector("title");
    MAIN.innerHTML = newMain.innerHTML;
    if (title) document.title = title.textContent;
    if (url) history.pushState({ soft: true }, "", url.href);
    afterSwap();
    return true;
  }

  function navigate(url) {
    fetch(url.href, { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (html) { if (!swapFrom(html, url)) location.href = url.href; })
      .catch(function () { location.href = url.href; });
  }

  function afterSwap() {
    initCatalog();
    initLesson();
    enhanceMermaid();
    updateTick();
    updateTOC();
    window.scrollTo(0, 0);
    if (MAIN) { try { MAIN.focus({ preventScroll: true }); } catch (e) { MAIN.focus(); } }
  }

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#") return;
    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;
    if (!/\.html$|\/$/.test(url.pathname)) return;
    if (isSameDoc(url)) return;
    e.preventDefault();
    navigate(url);
  });

  window.addEventListener("popstate", function () {
    if (!MAIN) return;
    fetch(location.href, { credentials: "same-origin" })
      .then(function (r) { return r.text(); })
      .then(function (html) { swapFrom(html, null); })
      .catch(function () { location.reload(); });
  });

  function onScroll() { updateTick(); updateTOC(); }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  document.addEventListener("keydown", function (e) {
    var input = $("#lessonSearch");
    if (!input) return;
    if (e.key === "/" && document.activeElement !== input) { e.preventDefault(); input.focus(); }
    if (e.key === "Escape" && document.activeElement === input) { input.value = ""; applyCatalog(); input.blur(); }
  });

  injectTools();
  renderMini();
  initCatalog();
  initLesson();
  updateTick();
  updateTOC();
  enhanceMermaid();
})();