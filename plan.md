# 经济学 + 心理学学习网站 · 初步规划

> 参照《可复用课程框架》的五层架构与十二条原则，针对**个人课外学习 + AI 生成内容 + 静态站点**这一场景做适配。规模从原项目的 523 节缩减到 72 讲，CI 从 26 步缩减到 5–7 步，去掉多语言/认证/分发等重型模块。

---

## 1. 项目定位

| 维度     | 决策                                                       |
| -------- | ---------------------------------------------------------- |
| 产品形态 | 纯静态网站，无后端、无账号、无数据库                       |
| 内容真相 | 磁盘目录 `phases/NN-*/NN-*/` 为唯一来源                    |
| 内容生成 | 由 AI 按契约逐讲生成，人工审校                             |
| 使用方式 | 浏览器阅读                                                 |
| 规模基线 | 7 个 phases 目录（00 导论 + 01–06 六个内容模块）/ 72 讲 / 每讲 1 份讲义 + 1 份 quiz                 |
| 技术栈   | Node 构建脚本 + 单一 Markdown 渲染器 + 纯前端 localStorage |
| 部署     | GitHub Pages 静态托管                                      |

**与母框架的关键差异**：

- 删掉：多语言层、认证层、API 层、技能分发安装器、上游同步。
- 保留：文件系统即真相、每讲四件套契约、quiz 答案的 UI 延迟揭示（§4.2）、构建对账、结构审计、进度本地存储。
- 新增：AI 生成契约（每讲的 prompt 模板本身就是一等公民，存进仓库）。

### 1.1 讲次分配（72 讲基线）

目录里实际有 **7 个 phases 目录**：`00-orientation` 是导论，`01`–`06` 才是六个内容模块。分配如下，**这是讲次编号的唯一来源**（`ROADMAP.md` 按此建表，`build.js --check` 按此对账）：

| 目录                 | 模块         | 讲数 | 讲次范围      |
| -------------------- | ------------ | ---- | ------------- |
| `00-orientation`     | 导论         | 2    | 00-01 – 00-02 |
| `01-economics-basics`| 经济学基础   | 10   | 01-01 – 01-10 |
| `02-psychology-basics`| 心理学基础  | 10   | 02-01 – 02-10 |
| `03-behavioral-core` | 行为经济学核心 | 24  | 03-01 – 03-24 |
| `04-applications`    | 应用         | 12   | 04-01 – 04-12 |
| `05-methods`         | 方法         | 8    | 05-01 – 05-08 |
| `06-capstone`        | 综合项目     | 6    | 06-01 – 06-06 |
| **合计**             |              | **72** |             |

自洽校验：

- `24 周 × 3 讲 = 72`，`36 周 × 2 讲 = 72`。
- `03-24` 是模块 03 的最后一讲，与第 6 节学习路径里的门禁锚点 `after: 03-24` 一致。
- 模块 `04` 有 12 讲，覆盖第 6 节示例里的 `optional: ["04-07","04-08"]`。
- `applied-only` 跳过 01/02，实际学 00+03+04+06 = 44 讲。

调整课程规模只需改本表，其余（ROADMAP、build --check、learning-paths）都从它派生。

---

## 2. 五层架构（本项目版）

```text
L1 内容源层   phases/NN-module/NN-lesson/{docs/zh.md, quiz.json, outputs/, gen-prompt.md}
L2 契约层     AGENTS.md（硬规则）+ LESSON_TEMPLATE.md（骨架）+ QUIZ_CONTRACT.md
L3 校验层     scripts/audit_lessons.py（结构/字段/链接/quiz 分布）+ build --check（计数对账）
L4 派生层     site/data.js、sitemap.xml、llms.txt、预渲染 lessons/**/index.html
L5 表现层     静态站点（目录页 / 课程页 / 术语表 / 学习路径）+ 浏览器进度
```

四件套在本项目里调整为：

| 组件 | 母框架                 | 本项目                                                       |
| ---- | ---------------------- | ------------------------------------------------------------ |
| 正文 | `docs/zh.md`           | 同                                                           |
| 代码 | `code/` 可运行         | **可选第五件**：改为 `examples/`，放数据表/计算脚本/问卷设计，允许"伪代码 + 手工推导"；不参与 L006 强制检查 |
| 测验 | `quiz.json` 6 题       | 同，1 pre + 3 check + 2 post                                 |
| 产物 | `outputs/` 技能/提示词 | 改为 `outputs/` 学习卡、决策清单、实验设计模板、术语卡       |

---

## 3. 目录骨架

```text
econ-psych-course/
  AGENTS.md                    # 硬规则（AI 与人都读）
  LESSON_TEMPLATE.md           # 每讲固定骨架
  QUIZ_CONTRACT.md             # 测验字段与分布契约
  ROADMAP.md                   # 7 个 phases 目录 / 72 讲总表（计数唯一来源，视图）
  README.md                    # 入口（视图）
  phases/
    00-orientation/
      README.md
      01-why-intersect/
        docs/zh.md
        quiz.json
        gen-prompt.md          # 本讲生成用的完整提示词（可复现）
        outputs/               # 必填且非空：学习卡/决策清单/实验设计/术语卡
        examples/              # 可选：数据表/计算脚本/问卷设计
    01-economics-basics/
    02-psychology-basics/
    03-behavioral-core/
    04-applications/
    05-methods/
    06-capstone/
  learning-paths/
    full-24w.json              # 24 周主线
    full-36w.json              # 36 周慢线
    applied-only.json          # 只学应用模块
  glossary/
    terms.md                   # 术语表（唯一来源）
    myths.md                   # 常见误区
  site/
    build.js                   # 解析 → data.js + 预渲染 + sitemap + llms.txt
    md-render.js               # 单一渲染器（Node 与浏览器共用）
    template.html
    app.js                     # 目录/课程/术语/路径/进度
    progress.js                # localStorage，schemaVersion 迁移
    styles.css
  scripts/
    audit_lessons.py           # 结构审计 --strict
    check_counts.py            # 计数对账（可并入 build --check）
    scaffold_lesson.py         # 生成新讲骨架（形状=审计器接受的形状）
    gen_report.py              # 覆盖率报表：哪些讲缺 quiz/outputs
  .github/workflows/
    build.yml                  # 5–7 步 CI
```

---

## 4. 课程契约（决定"合格"的机器可判定标准）

### 4.1 每讲正文必填字段（`docs/zh.md` 头部）

```markdown
# 标题
> 一句话主旨（站点抓为摘要）

**模块：** NN  **讲次：** NN  **类型：** Learn|Build|Apply
**前置：** 课程链接或"无"  **预计时间：** 45–60 分钟
**AI 生成提示词：** gen-prompt.md

## 学习目标（3–4 条，动词开头）
## 问题背景（2–5 段，每段一个功能）
## 核心概念（通俗解释 + 例子，先直觉后术语）
## 经济学视角
## 心理学视角
## 交叉洞察
## 现实案例（2 个）
## 常见误区（3 条）
## 经典研究 5 分钟摘要（作者/年份/结论/争议）
## 自测题（6 道，与 quiz.json 对应）
## 延伸关键词
```

> **头部字段计数：6 个键值字段**（模块 / 讲次 / 类型 / 前置 / 预计时间 / AI 生成提示词）。H1 标题与一句话主旨由 L002 检查，**不计入这 6 个字段**，避免 L002/L003 重复计数（原写"7 个"为笔误）。
> **正文骨架：11 个 H2**（如上）。以 `LESSON_TEMPLATE.md` 为唯一来源；L009 从模板**派生**标题清单与数量，**不在审计器里写死数字**——将来增删章节只改模板。

### 4.2 测验契约（`quiz.json`）

```json
{
  "lesson": "03-01",
  "questions": [
    {"stage":"pre","question":"...","options":["A","B","C","D"],"correct":2,"explanation":"..."},
    ... 共 6 题：1 pre + 3 check + 2 post
  ]
}
```

硬规则：

- 字段名固定为 `stage/question/options/correct/explanation`，拒绝旧键。
- `options` 恰好 4 个，`correct` 为 0 基索引且在界内。
- 正确答案位置分布必须均衡（4 个槽位各约 25%）。**职责划界**：L005 对 `quiz.json` 做**静态槽位分布检查**；`test_quiz_debias.js` 做**数据载荷与渲染检查**（生成的 `data.js` 与预渲染 DOM 在提交前不含 `correct` 索引与 `explanation` 文本，选项顺序未被渲染器打乱）。二者不重叠。
- 答案隔离**降级为 UI 延迟揭示**：纯静态站无法对浏览器隐藏答案，`data.js` 中必然存在 `correct`，因此**不把"答案隔离"当安全边界**，也不为此引入后端。规则是：学习者作答前，渲染出的 DOM 与控件不得出现答案与解析；判定与解析在提交动作之后才揭示；quiz 区域明示"答案可见于页面数据，本站不做防作弊"。
  - 可选加固（非安全边界，仅减少无意窥见）：答案与解析另存 `quiz-answers.json`，答完再取。

### 4.3 AI 生成契约（`gen-prompt.md`）

每讲目录下存一份生成该讲的完整提示词，包含：

- 本讲在课程中的位置与前置知识。
- 必须覆盖的概念清单。
- 必须遵守的正文骨架（引用 LESSON_TEMPLATE.md）。
- 必须产出的 quiz 分布与答案位置约束。
- 禁止事项：不编造论文、不虚构数据、争议结论必须标注。

这样每讲都可**重新生成**且结果可比对，符合"批量机器改写必须可证伪"原则。

---

## 5. 工具链与门禁

### 5.1 构建脚本 `site/build.js`

职责：

1. 扫描 `phases/**` 得到课程清单。
2. 解析每讲 `docs/zh.md` 头部字段与正文。
3. 用 `md-render.js` 预渲染 `site/lessons/<module>/<lesson>/index.html`。
4. 生成 `site/data.js`（课程清单 + 摘要 + quiz）、`sitemap.xml`、`llms.txt`。
5. 回写 README/ROADMAP 的计数文案（`--check` 模式只校验不写）。

### 5.2 审计脚本 `scripts/audit_lessons.py`

规则码（精简版）：

| 码   | 检查                                                |
| ---- | --------------------------------------------------- |
| L001 | 目录命名 `NN-slug`，模块与讲次编号连续              |
| L002 | `docs/zh.md` 存在、UTF-8、≥800B、有 H1 与一句话主旨 |
| L003 | 头部 6 个键值字段齐全，`前置` 链接可解析            |
| L004 | `quiz.json` 存在，键集合/题数/stage 分布从 `QUIZ_CONTRACT.md` 派生 |
| L005 | `correct` 为 0 基且在 0–3，答案位置分布不偏斜       |
| L006 | `outputs/` 非空，至少一件带完整 frontmatter 且非脚手架占位（`status: template` 视为未完成） |
| L007 | `gen-prompt.md` 存在且引用本讲编号                  |
| L008 | 站内相对链接可解析                                  |
| L009 | 正文骨架 H2 齐全（清单与数量均从 `LESSON_TEMPLATE.md` 派生，不写死） |
| L010 | 术语表引用的术语在 `glossary/terms.md` 中存在       |

`--strict` 任一失败 exit 1。

### 5.3 CI 步骤（5–7 步）

```text
1. node site/build.js                  # 构建
2. node site/build.js --check          # 计数对账
3. python3 scripts/audit_lessons.py --strict
4. python3 scripts/audit_lessons.py --report > coverage.md   # 覆盖率报表（不阻塞）
5. node site/test_quiz_debias.js       # 数据载荷与作答前 DOM 防泄漏（静态分布由 L005 检查）
6. node site/test_progress.js          # 进度 schemaVersion 迁移
7. node site/test_seo_routes.js        # 预渲染页面可访问
```

无 `continue-on-error`，失败阻塞部署。

### 5.4 脚手架 `scripts/scaffold_lesson.py`

CLI 契约：`python scripts/scaffold_lesson.py <模块号> <讲号> [--force]`——标题、类型、目录名从 `ROADMAP.md` §2 登记行取，**未登记则拒绝生成**（这样"先登记再生成"由工具强制，元数据不出现第二个来源）

生成：`docs/zh.md` 骨架 + `quiz.json` 占位（题数与 stage 分布从 `QUIZ_CONTRACT.md` 派生）+ `gen-prompt.md` 模板 + `outputs/` 占位产物（frontmatter 带 `status: template`）。

硬约束：

- 讲次 ID 必须落在 `ROADMAP.md` §1 该模块的 ID 范围内。
- 目标讲目录已存在时**拒绝覆盖**，除非显式传 `--force`。
- 原则：**脚手架产出的形状 = 审计器接受的形状**，避免"写完才发现不合规"。
- 产出必须原文照抄两份契约的规范块，写完自检 H2 清单/字段清单/quiz 键集合是否与契约一致。

---

## 6. 学习路径 JSON

```json
{
  "id": "full-24w",
  "name": "24 周主线",
  "weeks": 24,
  "lessonsPerWeek": 3,
  "required": ["00-01","00-02","01-01","..."],
  "optional": ["04-07","04-08"],
  "gates": [{"after":"03-24","check":"check-understanding 03"}]
}
```

三条路线：

- `full-24w`：每周 3 讲，全 72 讲。
- `full-36w`：每周 2 讲，节奏更慢。
- `applied-only`：跳过模块 1/2 的基础课，只学模块 3/4/6（适合有基础者）。
- 每个 ID 必须存在于 `phases/**`；讲数分配见 §1.1（模块 03 共 24 讲，故门禁锚点为 `after: 03-24`）。

路线顺序以 JSON 为源，站点只渲染，不手写顺序。

---

## 7. 进度存储（`site/progress.js`）

- 纯 localStorage，键 `econpsych.progress.v1`。
- 结构：`{ schemaVersion, lessons: { "<id>": { status, quizScore, updatedAt } }, reviewQueue: [] }`。
- 状态机：`not-started → reading → quizzed → done`；低于 70% 进 `reviewQueue`。
- 导出/导入 JSON；`schemaVersion` 迁移函数预留。

---

## 8. 起步顺序（MVP 九步）

```text
第 1 步  写 AGENTS.md：定位、目录、10 条硬规则、契约摘要   ✅ 已完成
第 2 步  写 LESSON_TEMPLATE.md 与 QUIZ_CONTRACT.md   ✅ 已完成
第 3 步  写 scaffold_lesson.py，生成第 1 讲骨架   ✅ 已完成
第 4 步  手工完成第 1 讲（正文 + quiz + gen-prompt），作为深度基准   ✅ 已完成
第 5 步  写 md-render.js（单一渲染器）   ✅ 已完成
第 6 步  写 build.js（解析 + data.js + 预渲染 + --check）   ✅ 已完成
第 7 步  写 audit_lessons.py（L001–L010）   ✅ 已完成
第 8 步  写 progress.js + 站点四个页面（目录/课程/术语/路径）   ✅ 已完成
第 9 步  接 CI；按 gen-prompt 批量生成内容，人工审校   🔄 进行中（已建 22 / 72 讲）
```

**关键心法**：先把契约和门禁立起来，再用 AI 批量生成内容。不要先写 72 讲再补校验——那时返工成本最高。

---

## 9. 质量门禁对照表

| #    | 母框架门禁         | 本项目落地                             |
| ---- | ------------------ | -------------------------------------- |
| 1    | 构建成功且产物存在 | `build.js` 产出 data.js + 预渲染页     |
| 2    | 计数一致性         | `build.js --check` 对账 README/ROADMAP |
| 3    | 课程结构契约       | `audit_lessons.py` L001–L003、L009     |
| 4    | quiz 分布与去偏    | L004–L005 + `test_quiz_debias.js`      |
| 5    | 站内链接完整性     | L008                                   |
| 6    | 代码/练习可运行    | `examples/` 若含脚本则冒烟跑（可选）   |
| 7    | 图表机制           | 只用 Mermaid/SVG，禁 ASCII             |
| 8    | 前端契约           | 预渲染路由 + 移动端 CSS 测试           |
| 9    | 多语言             | 不做（中文单语）                       |
| 10   | 可访问性           | 朗读可选（Web Speech）+ 键盘导航       |
| 11   | 分发契约           | 不做（个人站）                         |
| 12   | 合规声明           | 术语表与经典研究处标注来源与争议       |

---

## 10. 现状体检（规划阶段的起点快照）

> 下表记录**项目开工时**的观测，作为历史参照，不再随进度更新；**实时状态以 `AGENTS.md` 第 10 节为准**。

| 观测项            | 起点                | 建议                               |
| ----------------- | ------------------- | ---------------------------------- |
| 课程目录          | 0（仅有 72 讲目录） | 先搭骨架，再填内容                 |
| 契约文件          | AGENTS.md + 两份形状契约已写 | 接着写 scaffold_lesson.py（第 3 步） |
| quiz 覆盖率       | 0%                  | 前 10 讲必须 100%，作为契约样本    |
| gen-prompt 覆盖率 | 0%                  | 每讲必备，否则无法复现生成         |
| 术语表            | 未建                | 先立 30 条核心术语，随课程增长     |
| 学习路径          | 未建                | 先立 3 条 JSON                     |
| CI                | 未建                | 5–7 步，失败阻塞                   |
| 孤儿脚本风险      | 未知                | 每加一个脚本就加一个测试或 CI 步骤 |

**结论**：这是一个从零起步的项目。最大的风险不是技术，而是**先写内容后补契约导致返工**。务必按第 8 节的顺序，先用第 1 讲验证整条流水线（脚手架 → 生成 → 审计 → 构建 → 站点 → 技能），再批量扩量。

---

## 11. 落地动作（原"下一步"，除最后一项外均已完成）

1. `AGENTS.md` 全文（本项目硬规则）。 ✅ 已完成
2. `LESSON_TEMPLATE.md` + `QUIZ_CONTRACT.md` 全文。 ✅ 已完成
3. 第 1 讲《经济学与心理学为何交叉》的完整四件套（正文 + quiz + outputs + gen-prompt），作为全课深度基准。 ✅ 已完成
4. `build.js` + `md-render.js` + `audit_lessons.py` 的可运行初版。 ✅ 已完成
5. 站点模板与进度模块。 ✅ 已完成
6. 内容批量扩量：模块 `02`–`06`（60 讲）。 🔄 未开始（现 12 / 72 讲）

---

## 12. 未决项决议（已定，正文各处已按此修正）

写第 1 步 AGENTS.md 时暴露出 8 处内部不一致或未定义；第 9 步内容建设期又新增 3 处（O9：界面与导航分层；O10：课程页三栏流体自适应；O11：软导航下外壳链接的绝对化）。以下为决议——**这是最终口径**，与正文冲突时以本节为准，并应尽快修掉正文。

| 编号 | 原问题                                         | 决议                                                                 |
| ---- | ---------------------------------------------- | -------------------------------------------------------------------- |
| O1   | 只说总 72 讲，从未给模块分配                    | 见 **§1.1 分配表**：00=2、01=10、02=10、03=24、04=12、05=8、06=6      |
| O2   | L009 写"13 个二级标题"，§4.1 只列出 11 个 H2     | 规范骨架 = **§4.1 的 11 个 H2**；L009 改为**从 `LESSON_TEMPLATE.md` 派生**清单与数量，不写死数字 |
| O3   | L003 写"7 个必填字段"，§4.1 只有 6 个键值字段     | 头部 = **6 个键值字段**（模块/讲次/类型/前置/预计时间/AI 生成提示词）；H1 与一句话主旨由 L002 负责，不重复计数 |
| O4   | §1"6 模块"与 §3 的 7 个 phases 目录不一致        | 统一为"**7 个 phases 目录 = 00 导论 + 01–06 六个内容模块**"           |
| O5   | §2 表格提到 `examples/`，L006 只认 `outputs/`    | `examples/` 定为**可选第五件**，不参与 L006 强制检查                  |
| O6   | `test_quiz_debias.js` 与 L005 职责重叠           | L005 = `quiz.json` **静态槽位分布**；`test_quiz_debias.js` = **数据载荷与作答前 DOM 防泄漏** |
| O7   | 静态站无法真正隐藏 quiz 答案                     | "答案隔离"**降级为 UI 延迟揭示 + 明示不防作弊**；可选加固：答案另存 `quiz-answers.json`，答后取 |
| O8   | `scaffold_lesson.py` 的 CLI 形态未定义            | `<模块号> <讲号> [--force]`；标题/类型/目录名取自 `ROADMAP.md` §2 登记行，**未登记则拒绝生成**；已存在则拒绝覆盖；占位产物带 `status: template`，L006 视为未完成 |
| O9   | 课程页"每讲一个 HTML 太拥挤"，是否改为单页 `lesson.html?id=…` | **保持预渲染**（AGENTS.md 规则 10 不变）：每讲仍是 `site/lessons/<模块>/<讲>/index.html` 独立静态路由；**另加客户端软导航**作为增强层（`fetch` 目标页 → 只替换 `#main` → `pushState`，失败退回整页跳转）。分层、token 与红线见 `AGENTS.md` 第 12 节 |
| O10  | 课程页三栏用「固定尺寸 + 硬断点」，各屏宽下位置与大小不一致：超宽屏左右栏贴窗口、正文两侧留大片空洞；1200px 时正文中心右偏 136px | **改为流体自适应**（原口径「三栏铺满全宽、左右栏各吸到页面一端」作废）：三条轨道与栏距全部 `clamp()` 随视口连续缩放（`--rail-w clamp(10.5rem,16.6vw,15rem)`、`--read-w clamp(30rem,46vw,50rem)`、`--gap-x clamp(1.25rem,2.2vw,2rem)`）；`.lesson-layout { justify-content: center }` 让三栏块整体居中，多余宽度对称留白；断点只保留结构性两处——≤78rem 隐藏右栏（**第三轨道保留**，正文仍居中）、≤60rem 转单栏（正文取 `--measure 36rem`）。见 `AGENTS.md` 第 12.1 / 12.2 节 |
| O11  | 软导航只替换 `#main`，顶栏/页脚不替换，但其相对链接按文档初次加载层级预渲染；`pushState` 改变基准 URL 后，跨层级软导航再点顶栏会解析到错误层级（如 `/lessons/<模块>/<讲>/glossary/index.html` → 404） | **外壳链接必须绝对化**：`app.js` 加载时把 `.topbar a, .foot a` 的绝对地址固化，每次换页在 `afterSwap()` 回填；`#main` 内链接不受影响（每次整体替换，相对路径天然跟随新 URL）。见 `AGENTS.md` 第 12.3 节第 4 条 |

**贯穿这 8 条的同一个原则**：凡是"一个数字要在多处保持一致"的地方（骨架标题数、头字段数、讲次总数），一律**指定唯一来源 + 派生**，禁止两处各写一份常量。这样以后改课程规模只改一处。
