# 经济学 × 心理学 · 学习网站

> 纯静态学习站：无后端、无账号。内容真相在 `phases/**`，其余文件（本 README、ROADMAP 计数、`site/**`）都是由 `site/build.js` 生成的**派生视图**，禁止手改。

## 当前进度

- 计划讲次：**72** 讲
- 已登记讲次：**22** 讲
- 已建讲目录：**22** 个

## 模块总表

| 模块号 | 模块 | 目录 | 计划讲数 | 已建 |
| --- | --- | --- | --- | --- |
| 00 | 导论 | `00-orientation` | 2 | 2 |
| 01 | 经济学基础 | `01-economics-basics` | 10 | 10 |
| 02 | 心理学基础 | `02-psychology-basics` | 10 | 10 |
| 03 | 行为经济学核心 | `03-behavioral-core` | 24 | 0 |
| 04 | 应用 | `04-applications` | 12 | 0 |
| 05 | 方法 | `05-methods` | 8 | 0 |
| 06 | 综合项目 | `06-capstone` | 6 | 0 |

> 本表由 `node site/build.js` 回写；计数唯一来源是 `ROADMAP.md`，讲数分配的唯一来源是 `plan.md` §1.1。

## 门禁（提交前必须全绿）

```bash
node site/build.js
node site/build.js --check
python3 scripts/audit_lessons.py --strict
python3 scripts/audit_lessons.py --report > coverage.md
node site/test_quiz_debias.js
node site/test_progress.js
node site/test_seo_routes.js
```

## 目录结构

- `phases/NN-module/NN-lesson/`：每讲四件套（`docs/zh.md` + `quiz.json` + `gen-prompt.md` + `outputs/`）
- `LESSON_TEMPLATE.md` / `QUIZ_CONTRACT.md`：正文骨架与测验形状的唯一来源
- `ROADMAP.md`：讲次数量的唯一来源
- `scripts/`：脚手架与审计（门禁）
- `site/`：构建脚本与派生站点
- `glossary/`：术语表与常见误区
- `learning-paths/`：学习路径顺序的唯一来源

约定：CI 用 `python3`，本地 Windows 用 `python`；路径一律用 `/`。

> SITE_URL 已指向真实 GitHub Pages 站点；换域名时改这里（或用环境变量 SITE_URL 覆盖）。
