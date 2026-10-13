/* progress.js — 进度存储契约（AGENTS.md 第 9 节）
 *
 * 纯 localStorage，键 econpsych.progress.v1；不采集、不上传任何数据。
 * 结构：{ schemaVersion, lessons: { "<id>": { status, quizScore, updatedAt } }, reviewQueue: [] }
 * 状态机：not-started → reading → quizzed → done；quiz 得分低于 70% 进 reviewQueue。
 * 支持导出/导入 JSON；schemaVersion 迁移函数必须有测试覆盖（门禁第 6 条）。
 *
 * Node 与浏览器共用：纯逻辑部分不碰 localStorage，存储通过适配器注入。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Progress = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEY = "econpsych.progress.v1";
  var SCHEMA_VERSION = 1;
  var PASS = 0.7;
  var STATUSES = ["not-started", "reading", "quizzed", "done"];
  var TRANSITIONS = {
    "not-started": ["reading", "quizzed", "done"],
    reading: ["reading", "quizzed", "done"],
    quizzed: ["quizzed", "reading", "done"],
    done: ["done", "reading"]
  };

  function now() { return new Date().toISOString(); }

  function emptyState() {
    return { schemaVersion: SCHEMA_VERSION, lessons: {}, reviewQueue: [] };
  }

  function normalizeLesson(raw) {
    if (!raw || typeof raw !== "object") return null;
    var status = STATUSES.indexOf(raw.status) >= 0 ? raw.status : "not-started";
    var score = typeof raw.quizScore === "number" && isFinite(raw.quizScore) ? raw.quizScore : null;
    return {
      status: status,
      quizScore: score,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now()
    };
  }

  // 迁移：接受旧版本、残缺、甚至非法输入，一律产出当前版本的结构。
  function migrate(input) {
    var src = input;
    if (typeof src === "string") {
      try { src = JSON.parse(src); } catch (e) { src = null; }
    }
    if (!src || typeof src !== "object" || Array.isArray(src)) return emptyState();

    var state = emptyState();
    var lessons = src.lessons && typeof src.lessons === "object" ? src.lessons : {};
    Object.keys(lessons).forEach(function (id) {
      var norm = normalizeLesson(lessons[id]);
      if (norm) state.lessons[id] = norm;
    });
    if (Array.isArray(src.reviewQueue)) {
      state.reviewQueue = src.reviewQueue.filter(function (id) { return typeof id === "string"; });
    }
    state.schemaVersion = SCHEMA_VERSION;
    return state;
  }

  // ---- 存储适配器：浏览器用 localStorage，Node/测试可注入内存对象 ----
  function browserStorage() {
    try {
      var s = root.localStorage;
      s.getItem(KEY);
      return s;
    } catch (e) {
      return null;
    }
  }

  function load(storage) {
    var s = storage || browserStorage();
    if (!s) return emptyState();
    return migrate(s.getItem(KEY));
  }

  function save(state, storage) {
    var s = storage || browserStorage();
    var normalized = migrate(state);
    if (s) s.setItem(KEY, JSON.stringify(normalized));
    return normalized;
  }

  function ensure(state, id) {
    if (!state.lessons[id]) state.lessons[id] = { status: "not-started", quizScore: null, updatedAt: now() };
    return state.lessons[id];
  }

  function setStatus(state, id, status) {
    if (STATUSES.indexOf(status) < 0) return state;
    var entry = ensure(state, id);
    var allowed = TRANSITIONS[entry.status] || [];
    if (entry.status === status || allowed.indexOf(status) >= 0) {
      entry.status = status;
      entry.updatedAt = now();
    }
    return state;
  }

  function markReading(state, id) { return setStatus(state, id, "reading"); }

  // 提交测验：写入 quizScore；≥70% 记为 done，否则 quizzed 并进 reviewQueue。
  function recordQuiz(state, id, score) {
    var entry = ensure(state, id);
    var clamped = Math.max(0, Math.min(1, Number(score) || 0));
    entry.quizScore = clamped;
    entry.status = clamped >= PASS ? "done" : "quizzed";
    entry.updatedAt = now();
    var idx = state.reviewQueue.indexOf(id);
    if (clamped < PASS && idx < 0) state.reviewQueue.push(id);
    if (clamped >= PASS && idx >= 0) state.reviewQueue.splice(idx, 1);
    return state;
  }

  function exportJson(state) { return JSON.stringify(migrate(state), null, 2); }

  function importJson(text) { return migrate(text); }

  function summary(state) {
    var out = { reading: 0, quizzed: 0, done: 0 };
    Object.keys(state.lessons).forEach(function (id) {
      var st = state.lessons[id].status;
      if (st === "reading" || st === "quizzed" || st === "done") out[st]++;
    });
    return out;
  }

  return {
    KEY: KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    PASS_THRESHOLD: PASS,
    STATUSES: STATUSES,
    emptyState: emptyState,
    migrate: migrate,
    load: load,
    save: save,
    setStatus: setStatus,
    markReading: markReading,
    recordQuiz: recordQuiz,
    exportJson: exportJson,
    importJson: importJson,
    summary: summary
  };
});