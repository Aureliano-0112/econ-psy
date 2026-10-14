# ROADMAP.md · 模块与讲次总表

> 本文件是**讲次数量的唯一来源**。
> `site/build.js --check` 读本文件与 `phases/**` 双向对账；`scripts/scaffold_lesson.py` 读第 2 节的登记行取标题、类型与目录名。
>
> **铁律：先在本表登记，再生成骨架。** 不在第 2 节里的讲次，脚手架直接拒绝生成。
> 改本文件等于改计数来源，改完必须跑 `node site/build.js --check`。

模块划分的依据见 `plan.md` §1.1（00 导论 + 01–06 六个内容模块 = 72 讲）。

---

## 1. 模块分区（机器解析）

| 目录                | 模块           | 计划讲数 | ID 范围       |
| ------------------- | -------------- | -------- | ------------- |
| `00-orientation`      | 导论           | 2        | 00-01 – 00-02 |
| `01-economics-basics` | 经济学基础     | 10       | 01-01 – 01-10 |
| `02-psychology-basics`| 心理学基础     | 10       | 02-01 – 02-10 |
| `03-behavioral-core`  | 行为经济学核心 | 24       | 03-01 – 03-24 |
| `04-applications`     | 应用           | 12       | 04-01 – 04-12 |
| `05-methods`          | 方法           | 8        | 05-01 – 05-08 |
| `06-capstone`         | 综合项目       | 6        | 06-01 – 06-06 |
| **合计**              |                | **72**   |               |

**解析规则**：只读本节表格的数据行。每行的 `目录` 取反引号内文本；`计划讲数` 取整数（`**72**` 这类加粗要去掉标记）。表头行与 `合计` 行单独处理。

**硬约束**

- 恰好 7 个模块行；`计划讲数` 合计必须 = **72**，且与 `plan.md` §1.1 逐行一致。
- `ID 范围` 的两端必须与该模块的 `计划讲数` 自洽（起 01、止 = 计划数、两位补零）。
- **刻意不设"已建"列**：已建数量是派生值，只能由 `build.js` 计算或回写，不在本表手写（见 AGENTS.md 规则 1）。

---

## 2. 讲次登记表（机器解析）

| 讲次 ID | 目录 slug                | 标题                             | 类型  | 状态 |
| ------- | ------------------------ | -------------------------------- | ----- | ---- |
| `00-01` | `01-why-intersect`       | 经济学与心理学为何交叉           | Learn | 完成 |
| `00-02` | `02-three-strands`       | 从理性人到行为经济学：三条脉络   | Learn | 完成 |
| `01-01` | `01-scarcity-choice`     | 稀缺与选择：机会成本             | Learn | 完成 |
| `01-02` | `02-marginal-thinking`   | 边际思维：多一个单位的取舍       | Learn | 完成 |
| `01-03` | `03-demand-supply`       | 需求与供给：价格如何传递信息     | Learn | 完成 |
| `01-04` | `04-equilibrium`         | 均衡与市场出清                   | Learn | 完成 |
| `01-05` | `05-elasticity`          | 弹性：数量对价格有多敏感         | Learn | 完成 |
| `01-06` | `06-incentives-institutions` | 激励与制度：价格之外的手段   | Learn | 完成 |
| `01-07` | `07-strategic-interaction` | 策略互动：从囚徒困境到纳什均衡 | Learn | 完成 |
| `01-08` | `08-risk-expected-utility` | 风险与期望效用                 | Learn | 完成 |
| `01-09` | `09-information-asymmetry` | 信息不对称：逆向选择与道德风险 | Learn | 完成 |
| `01-10` | `10-welfare-externalities` | 福利与外部性：市场失灵         | Learn | 完成 |
| `02-01` | `01-perception-attention` | 知觉与注意：信息如何进入心智 | Learn | 完成 |
| `02-02` | `02-memory-reconstruction` | 记忆：不是回放，而是重建 | Learn | 完成 |
| `02-03` | `03-learning-reinforcement` | 学习与强化：行为如何被塑造 | Learn | 完成 |
| `02-04` | `04-dual-process` | 双系统加工：快思维与慢思维 | Learn | 完成 |
| `02-05` | `05-emotion-appraisal` | 情绪与评价：感受如何参与判断 | Learn | 完成 |
| `02-06` | `06-motivation` | 动机：为什么做，以及为什么不做 | Learn | 完成 |
| `02-07` | `07-social-cognition` | 社会认知：我们如何理解他人 | Learn | 完成 |
| `02-08` | `08-attitudes-persuasion` | 态度与说服：观点如何形成与改变 | Learn | 完成 |
| `02-09` | `09-personality-differences` | 人格与个体差异：稳定的行为倾向 | Learn | 完成 |
| `02-10` | `10-measurement-reliability` | 测量与信效度：心理学如何做到可靠 | Learn | 完成 |
| `03-01` | `01-from-eu-to-behavioral` | 从期望效用到行为描述：理性人假设的边界 | Learn | 完成 |
| `03-02` | `02-loss-aversion` | 损失厌恶：失去的痛重于得到的爽 | Learn | 完成 |
| `03-03` | `03-reference-value-function` | 参照点与价值函数：收益与损失的编码 | Learn | 完成 |
| `03-04` | `04-probability-weighting` | 概率加权：小概率被高估，确定性被偏爱 | Learn | 完成 |
| `03-05` | `05-endowment-status-quo` | 禀赋效应与现状偏差：拥有即被高估 | Learn | 完成 |
| `03-06` | `06-anchoring-adjustment` | 锚定与调整：任意数字如何拉动估计 | Learn | 完成 |
| `03-07` | `07-availability-heuristic` | 可得性启发：容易想到的就以为常见 | Learn | 完成 |
| `03-08` | `08-representativeness` | 代表性启发：用相似性代替概率 | Learn | 完成 |
| `03-09` | `09-framing-effect` | 框架效应：表述方式如何反转选择 | Learn | 完成 |
| `03-10` | `10-mental-accounting` | 心理账户：钱与钱并不完全可替代 | Learn | 完成 |
| `03-11` | `11-sunk-cost-escalation` | 沉没成本与承诺升级：已经投入的为什么放不下 | Learn | 完成 |
| `03-12` | `12-choice-architecture-nudge` | 选择架构与助推：不强制地引导选择 | Learn | 完成 |
| `03-13` | `13-hyperbolic-discounting` | 双曲贴现与现时偏误：为什么总是拖延 | Learn | 完成 |
| `03-14` | `14-self-control-procrastination` | 自我控制与拖延：两个自我的战争 | Apply | 完成 |
| `03-15` | `15-social-preferences-fairness` | 社会偏好与公平：人不只关心自己的钱 | Learn | 完成 |
| `03-16` | `16-trust-reciprocity` | 信任与互惠：合作如何在陌生人之间发生 | Learn | 完成 |
| `03-17` | `17-overconfidence` | 过度自信：人为什么高估自己 | Learn | 完成 |
| `03-18` | `18-planning-fallacy` | 规划谬误：为什么项目总超时超支 | Learn | 完成 |
| `03-19` | `19-gamblers-hot-hand` | 赌徒谬误与热手：把连续当趋势 | Learn | 完成 |
| `03-20` | `20-herd-information-cascade` | 从众与信息瀑布：跟着走还是跟着错 | Learn | 完成 |
| `03-21` | `21-scarcity-bandwidth` | 稀缺与带宽：贫困如何占用心智 | Learn | 完成 |
| `03-22` | `22-placebo-value-experience` | 安慰剂效应：价格与标签如何改变感受 | Learn | 完成 |
| `03-23` | `23-gift-exchange-market-norms` | 礼物交换与市场规范：什么时候给钱反而坏事 | Apply | 完成 |
| `03-24` | `24-bias-map-synthesis` | 行为偏差地图：一张图串起本模块 | Apply | 完成 |

**解析规则**：只读本节表格的数据行，5 列固定顺序，不认列名改动。`讲次 ID` 取反引号内的 `NN-NN`；`目录 slug` 取反引号内文本。

**取值约束**

| 列        | 允许值                                              |
| --------- | --------------------------------------------------- |
| 类型      | `Learn` / `Build` / `Apply`（语义见 `LESSON_TEMPLATE.md` §3.2） |
| 状态      | `计划` / `骨架` / `完成`                             |

`状态` 由人工维护，表示"我打算做到哪一步"；**机器真相**不看它——`--report` 会独立计算每讲是否还残留占位标记并打印实际完成度。

**硬约束**

- **双向一一对应**：登记表每行必须对应磁盘上真实存在的 `phases/<模块目录>/<slug>/`；磁盘上存在的讲目录也必须在表里。缺任一侧即对账失败。
- 每个 ID 必须落在第 1 节对应模块的 `ID 范围` 内（例：`03-99` 永远非法）。
- 同一模块内的 ID 必须**连续**，不跳号。
- 标题非空。标题是生成 `docs/zh.md` 时的 H1 初值；生成后**正文的 H1 是权威**，登记表不再与它比对。

---

## 3. 对账规则（`node site/build.js --check` 查什么）

| # | 检查                                                                     |
| - | ------------------------------------------------------------------------ |
| 1 | 第 1 节 7 个模块的 `计划讲数` 合计 = 72，且与 `plan.md` §1.1 一致          |
| 2 | 第 1 节每个模块的 `目录` 在 `phases/` 下真实存在（允许暂为空目录）         |
| 3 | 第 2 节登记行 ↔ `phases/**` 讲目录 **双向**一一对应                        |
| 4 | 每个登记 ID 落在其模块的 `ID 范围` 内，且模块内 ID 连续                    |
| 5 | 每个登记行的 `目录 slug` 与该讲的实际目录名一致                            |
| 6 | `README.md` 中的讲数文案与第 2 节行数一致（README 由 build.js 回写）        |

`--check` 只校验不写盘；不带 `--check` 的构建会回写 `README.md` 的计数文案。任一项失败即 `exit 1`，阻塞部署。

---

## 4. 与其它文件的关系

| 文件                                   | 关系                                                         |
| -------------------------------------- | ------------------------------------------------------------ |
| `plan.md` §1.1                          | 讲数分配的**意图来源**；本表第 1 节是它的可执行副本，冲突时以 §1.1 为准并回来修本表 |
| `LESSON_TEMPLATE.md` §2                 | 正文骨架的唯一来源；脚手架从那里取块，本表只提供标题/类型/目录名 |
| `QUIZ_CONTRACT.md` §2                   | 测验形状的唯一来源；脚手架从那里取占位 JSON                   |
| `site/build.js --check`                 | 本表第 1、2 节的执行者                                        |
| `scripts/scaffold_lesson.py`            | 本表第 2 节的消费者（取登记行生成骨架）                        |

---

## 5. 维护流程

```text
要新增一讲：
1. 在 §2 登记表加一行（ID / slug / 标题 / 类型 / 状态=计划）
2. python scripts/scaffold_lesson.py <模块号> <讲号>
3. 填内容（正文 / quiz / gen-prompt / outputs）
4. 状态改为 骨架 → 内容中不需要额外词；填完改为 完成
5. node site/build.js --check && python scripts/audit_lessons.py --strict
```

要调整课程规模（增删模块、改讲数）：先改 `plan.md` §1.1，再改本表 §1，最后补 `learning-paths/*.json`，然后跑门禁。
