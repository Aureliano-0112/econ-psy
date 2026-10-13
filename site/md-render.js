/* md-render.js — 单一 Markdown 渲染器（Node 与浏览器共用同一份）
 *
 * 定位（见 AGENTS.md 规则 1/10）：
 *   - 只把 phases/** 的正文与产物渲染成 HTML，本身不写入任何课程内容；
 *   - 只实现本课程用到的 Markdown 子集，刻意不支持 raw HTML（一律转义），
 *     因此它是"安全"的：正文里的 < > & 不会被解释成标签；
 *   - 图表只认 ```mermaid 围栏（交给浏览器里的 Mermaid 渲染），其余围栏按代码块处理；
 *     绝不用 ASCII art 充当图形。
 *
 * 用法：
 *   Node:      const md = require('./md-render.js'); md.render(text)
 *   浏览器:     <script src="md-render.js"></script>  →  window.mdRender.render(text)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.mdRender = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  // 只放行安全协议与相对链接，挡掉 javascript: / data: 这类注入。
  function safeUrl(url) {
    var u = String(url).trim();
    if (u === "") return "";
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
    if (/^(#|\/|\.\.?\/)/.test(u)) return u;
    if (/^[a-z0-9._~%!$&'()*+,;=:@/-]*$/i.test(u)) return u; // 纯相对路径
    return ""; // 其余（含 javascript:、data:）一律丢弃目标，只留文字
  }

  function isBlank(line) { return /^\s*$/.test(line); }

  function isTableSep(line) {
    var s = line.trim();
    if (!s.startsWith("|")) return false;
    var cells = s.replace(/^\||\|$/g, "").split("|");
    return cells.length > 0 && cells.every(function (c) {
      return /^\s*:?-{2,}:?\s*$/.test(c);
    });
  }

  function isHeading(line) { return /^(#{1,6})\s+/.test(line); }
  function isFence(line) { return /^\s*```/.test(line); }
  function isHr(line) { return /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line); }
  function isQuote(line) { return /^\s*>/.test(line); }
  function isUl(line) { return /^\s*[-*+]\s+/.test(line); }
  function isOl(line) { return /^\s*\d+[.)]\s+/.test(line); }

  function isBlockStart(lines, i) {
    var l = lines[i];
    if (isBlank(l) || isHeading(l) || isFence(l) || isHr(l) || isQuote(l) || isUl(l) || isOl(l)) return true;
    if (l.trim().startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) return true;
    return false;
  }

  // ---- 行内：先转义，再按 代码 → 链接 → 粗体 → 斜体 的顺序还原标记 ----
  function inline(text) {
    var out = escapeHtml(text);
    var codes = [];
    out = out.replace(/`([^`]+)`/g, function (_, code) {
      codes.push(code);
      return "\u0000" + (codes.length - 1) + "\u0000";
    });
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, href) {
      var url = safeUrl(href.replace(/&amp;/g, "&"));
      if (!url) return label;
      return '<a href="' + escapeHtml(url) + '">' + label + "</a>";
    });
    // 粗体优先（允许内部再嵌斜体，如 **…（Madrian & Shea, 2001，*QJE* 116(4)）。**）
    out = out.replace(/\*\*(.+?)\*\*/g, function (_, inner) {
      return "<strong>" + inner.replace(/\*([^*\n]+)\*/g, "<em>$1</em>") + "</strong>";
    });
    out = out.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    out = out.replace(/\u0000(\d+)\u0000/g, function (_, n) {
      return "<code>" + codes[Number(n)] + "</code>";
    });
    return out;
  }

  function renderTable(rows) {
    function cells(line) {
      return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); });
    }
    var head = cells(rows[0]);
    var body = rows.slice(2).map(cells);
    var html = "<table><thead><tr>";
    head.forEach(function (c) { html += "<th>" + inline(c) + "</th>"; });
    html += "</tr></thead><tbody>";
    body.forEach(function (r) {
      html += "<tr>";
      for (var c = 0; c < head.length; c++) html += "<td>" + inline(r[c] === undefined ? "" : r[c]) + "</td>";
      html += "</tr>";
    });
    return html + "</tbody></table>";
  }

  function renderList(lines, start, ordered) {
    var itemRe = ordered ? /^\s*(\d+)[.)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
    var items = [];
    var cur = null;
    var i = start;
    while (i < lines.length) {
      var l = lines[i];
      if (isBlank(l)) break;
      var m = l.match(itemRe);
      if (m) {
        if (cur !== null) items.push(cur);
        cur = ordered ? m[2] : m[1];
        i++;
        continue;
      }
      if (cur !== null && /^\s+\S/.test(l)) { // 缩进续行归入上一条
        cur += "\n" + l.trim();
        i++;
        continue;
      }
      break;
    }
    if (cur !== null) items.push(cur);
    var tag = ordered ? "ol" : "ul";
    var html = "<" + tag + ">";
    items.forEach(function (raw) {
      var box = "";
      var text = raw.replace(/\n/g, " ");
      var task = text.match(/^\[([ xX])\]\s+(.*)$/);
      if (task) {
        box = '<input type="checkbox" disabled' + (task[1] === " " ? "" : " checked") + "> ";
        text = task[2];
      }
      html += "<li>" + box + inline(text) + "</li>";
    });
    return { html: html + "</" + tag + ">", next: i };
  }

  function render(markdown) {
    var lines = String(markdown == null ? "" : markdown).replace(/\r\n?/g, "\n").split("\n");
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (isBlank(line)) { i++; continue; }

      var fence = line.match(/^\s*```(.*)$/);
      if (fence) {
        var info = fence[1].trim();
        var buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // 跳过收尾围栏
        if (/^mermaid\b/i.test(info)) {
          out.push('<pre class="mermaid">' + escapeHtml(buf.join("\n")) + "</pre>");
        } else {
          var lang = info ? ' class="language-' + escapeHtml(info.split(/\s+/)[0]) + '"' : "";
          out.push("<pre><code" + lang + ">" + escapeHtml(buf.join("\n")) + "</code></pre>");
        }
        continue;
      }

      var h = line.match(/^(#{1,6})\s+(.*?)\s*$/);
      if (h) {
        var lv = h[1].length;
        out.push("<h" + lv + ">" + inline(h[2]) + "</h" + lv + ">");
        i++;
        continue;
      }

      if (isHr(line)) { out.push("<hr>"); i++; continue; }

      if (isQuote(line)) {
        var qb = [];
        while (i < lines.length && isQuote(lines[i])) {
          qb.push(lines[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        var inner = qb.map(function (t) { return isBlank(t) ? "" : "<p>" + inline(t) + "</p>"; }).join("");
        out.push("<blockquote>" + inner + "</blockquote>");
        continue;
      }

      if (line.trim().startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        var rows = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(lines[i]); i++; }
        out.push(renderTable(rows));
        continue;
      }

      if (isUl(line) || isOl(line)) {
        var res = renderList(lines, i, isOl(line));
        out.push(res.html);
        i = res.next;
        continue;
      }

      var para = [];
      while (i < lines.length && !isBlockStart(lines, i)) {
        para.push(lines[i].trim());
        i++;
      }
      out.push("<p>" + inline(para.join("\n")) + "</p>");
    }
    return out.join("\n");
  }

  return { render: render, inline: inline, escapeHtml: escapeHtml };
});