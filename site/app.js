/* app.js — 交互层。
 *
 * 视图模型：页面由构建脚本预渲染（AGENTS.md 规则 10：刷新/直链/无 JS 均可读），
 * 本文件在此之上做「增强」：
 *   1. 站内导航改为客户端读取并渲染对应页面（不再整页刷新，阅读不中断）；
 *   2. 目录筛选与进度徽标、课程页测验判定与解析揭示、进度导入导出；
 *   3. 顶部阅读进度条、Mermaid 图表按需渲染。
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

  // ---- 外壳链接的绝对化 ----
  // 顶栏与页脚不随软导航替换，但它们内部的相对链接是按「文档初次加载时所在的层级」生成的
  // （目录页是 `glossary/index.html`，讲次页是 `../../../glossary/index.html`）。
  // 软导航 pushState 会改变文档基准 URL，若不处理，从目录页跳到讲次页后点顶栏「术语表」就会
  // 解析成 `.../lessons/<模块>/<讲>/glossary/index.html` → 404（反之亦然）。
  // 因此在加载时把外壳链接的绝对地址固化下来，每次换页后回填。
  var CHROME_LINKS = [];
  function pinChromeLinks() {
    CHROME_LINKS = $$(".topbar a, .foot a").map(function (a) { return { el: a, abs: a.href }; });
  }
  function restoreChromeLinks() {
    CHROME_LINKS.forEach(function (o) { o.el.setAttribute("href", o.abs); });
  }

  // ---- 顶栏「当前栏目」高亮的同步 ----
  // 顶栏同样在 #main 之外、不参与替换，其 aria-current 是 build.js 预渲染时按落地页写死的
  // （目录页标「目录」、术语表标「术语表」、学习路径标「学习路径」、讲次页三个都不标）。
  // 不重算，软导航后高亮就会一直停在落地页的栏目上。
  // 唯一来源：直接抄目标页顶栏的标记——不在这里复刻一遍「哪个页面属于哪个栏目」的判定。
  function syncNavCurrent(doc) {
    var live = $$(".topbar .nav a");
    if (!live.length || !doc) return;
    var tgt = $$(".topbar .nav a", doc);
    var activeIdx = -1;
    for (var i = 0; i < tgt.length; i++) {
      if (tgt[i].hasAttribute("aria-current")) { activeIdx = i; break; }
    }
    live.forEach(function (a, i) {
      if (i === activeIdx) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }
  function statusOf(id) { return (state.lessons[id] && state.lessons[id].status) || "not-started"; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- 顶栏：进度读数 + 进度工具（顶栏不随导航替换，只注入一次）----
  function renderMini() {
    var el = $("#progressMini");
    if (!el) return;
    var s = P.summary(state);
    var total = DATA && DATA.counts ? DATA.counts.built : 0;
    if (!total) { el.innerHTML = ""; return; }
    el.innerHTML =
      "<span>进度</span>" +
      "<span><b>" + s.done + "</b> 完成</span>" +
      "<span><b>" + s.quizzed + "</b> 已测</span>" +
      "<span><b>" + s.reading + "</b> 在读</span>" +
      "<span>共 <b>" + total + "</b> 讲</span>";
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

  // ---- 目录页：登记册筛选 + 进度徽标；术语表页：表格筛选 ----
  function filterRegister() {
    var input = $("#lessonSearch");
    if (!input) return;
    var q = input.value.trim().toLowerCase();
    $$(".register li").forEach(function (li) {
      var hay = li.getAttribute("data-search") || "";
      li.hidden = q !== "" && hay.indexOf(q) < 0;
    });
    $$(".module").forEach(function (sec) {
      if (q === "") { sec.hidden = false; return; }
      var any = $$(".register li", sec).some(function (li) { return !li.hidden; });
      sec.hidden = !any;
    });
  }

  function filterGlossary() {
    var input = $("#glossarySearch");
    if (!input) return;
    var q = input.value.trim().toLowerCase();
    var rows = $$(".term-table tbody tr");
    var shown = 0;
    rows.forEach(function (tr) {
      var hit = q === "" || (tr.getAttribute("data-search") || "").indexOf(q) >= 0;
      tr.hidden = !hit;
      if (hit) shown++;
    });
    var out = $("#glossaryCount");
    if (out) out.textContent = q === "" ? rows.length + " 条" : shown + " / " + rows.length + " 条";
  }

  function bindFilter(el, fn) {
    if (!el || el.dataset.filterBound) return;   // 幂等：重复调用不会叠加监听器
    el.dataset.filterBound = "1";
    el.addEventListener("input", fn);
  }

  function initFilters() {
    bindFilter($("#lessonSearch"), filterRegister);
    bindFilter($("#glossarySearch"), filterGlossary);
  }

  function initCatalog() {
    initFilters();
    var input = $("#lessonSearch");
    if (!input) return;
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

  // ---- 课程页：状态读数 + 测验 ----
  function refreshLessonStatus() {
    var el = $("#lessonStatus");
    if (!el) return;
    var art = $("article.lesson");
    if (!art) return;
    var id = art.getAttribute("data-lesson");
    var st = statusOf(id);
    var score = state.lessons[id] && state.lessons[id].quizScore;
    var label = { "not-started": "未开始", reading: "在读", quizzed: "已测验（未达 70%）", done: "已完成" }[st] || st;
    el.setAttribute("data-status", st);
    el.innerHTML = '<span class="status-mark" aria-hidden="true"></span>' +
      "<span>本讲状态 " + label + (score != null ? " · 最近得分 " + Math.round(score * 100) + "%" : "") + "</span>";
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
          var cls = oi === q.correct ? "opt-hit" : oi === pickedIdx ? "opt-miss" : "";
          var mark = oi === q.correct ? "（正确答案）" : oi === pickedIdx ? "（你的选择）" : "";
          return cls ? '<span class="' + cls + '">' + esc(text) + mark + "</span>" : esc(text);
        });
        lines.push(
          '<li><span class="mk ' + (ok ? "mk-hit" : "mk-miss") + '">' + (ok ? "答对" : "答错") + "</span>" +
          esc(q.question) + "<ul>" +
          opts.map(function (o) { return "<li>" + o + "</li>"; }).join("") +
          '</ul><div class="reveal">' + esc(q.explanation) + "</div></li>"
        );
      });
      var score = right / quiz.questions.length;
      var pct = Math.round(score * 100);
      result.innerHTML =
        '<p class="score">' + right + " / " + quiz.questions.length + "　" + pct + "%</p>" +
        '<p class="verdict">' + (pct >= 70 ? "达到 70%，本讲记为已完成" : "低于 70%，本讲已进入复习队列") + "</p>" +
        "<ol>" + lines.join("") + "</ol>";
      result.hidden = false;
      state = P.recordQuiz(state, id, score);
      P.save(state);
      renderMini();
      refreshLessonStatus();
      result.scrollIntoView({ block: "nearest" });
    });
  }

  // ---- 顶部阅读进度条 ----
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

  // ---- 右栏段落导航的点击：由脚本做确定性滚动 ----
  // 实测：点击 `<a href="#sec-NN">` 后地址栏 hash 会变，但页面**完全不滚动**（scrollY 恒为 0），
  // 而同一目标的 `scrollIntoView` 却能正常滚到位——即原生 fragment 跳转在本环境下被整段跳过。
  // 因此这里显式接管：先滚动到位，再用 replaceState 记账（replaceState 不新增历史条目，
  // 免得「返回」时触发 popstate 重新 fetch 换页）。
  // 无 JS 时 href="#sec-NN" 仍是可用的原生锚点（规则 10；本条只是增强层）。
  function goToSection(id) {
    var el = document.getElementById(id);
    if (!el) return false;
    var root = document.documentElement;
    var prev = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";   // 就地压过 html 上的 scroll-behavior:smooth，确保一定滚到位
    el.scrollIntoView(true);
    root.style.scrollBehavior = prev;
    if (location.hash !== "#" + id) {
      try { history.replaceState(history.state, "", "#" + id); } catch (e) { location.hash = id; }
    }
    return true;
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
    // 版式策略随目标页切换，必须整份复制 #main 的 class：
    //   课程页 = "wrap wrap-lesson"（通铺全屏）／ 目录·术语·路径页 = "wrap"（68rem 版心居中）。
    // 只换 innerHTML 而不换 class，会让上一页的策略残留——课程页版式出现在目录页上，反之亦然。
    // 见 AGENTS.md §12.3 第 5 条。
    MAIN.className = newMain.className;
    MAIN.innerHTML = newMain.innerHTML;
    syncNavCurrent(doc);     // 顶栏当前栏目随目标页重算（外壳不参与替换，须手动同步）
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
    restoreChromeLinks();
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
    if (!href) return;
    if (href.charAt(0) === "#") {
      // 同页锚点（右栏段落导航）：由脚本接管滚动（原因见 goToSection 上方注释）
      if (href.length > 1 && goToSection(href.slice(1))) e.preventDefault();
      return;
    }
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
    var input = $("#lessonSearch") || $("#glossarySearch");
    if (!input) return;
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "");
    if (e.key === "/" && !typing) { e.preventDefault(); input.focus(); }
    if (e.key === "Escape" && e.target === input) {
      input.value = "";
      input.dispatchEvent(new Event("input"));
      input.blur();
    }
  });

  injectTools();
  pinChromeLinks();
  renderMini();
  initCatalog();
  initLesson();
  updateTick();
  updateTOC();
  enhanceMermaid();
})();