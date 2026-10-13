#!/usr/bin/env python3
"""scaffold_lesson.py — 按契约生成一讲的骨架。

形状的唯一来源（脚本内不内联任何骨架或字段常量）：
  LESSON_TEMPLATE.md 第 2 节（唯一的 ```markdown 块） -> docs/zh.md 的正文形状
  QUIZ_CONTRACT.md   第 2 节（唯一的 ```json 块）     -> quiz.json 的占位形状
  ROADMAP.md §1/§2                                     -> 本讲的模块目录、slug、标题、类型

用法：
  python scripts/scaffold_lesson.py <模块号> <讲号> [--force]

退出码：0 成功；1 任何拒绝或自检失败。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:  # Windows 控制台默认 GBK，避免中文输出报错
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:  # pragma: no cover
    pass

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_FILE = ROOT / "LESSON_TEMPLATE.md"
QUIZ_FILE = ROOT / "QUIZ_CONTRACT.md"
ROADMAP_FILE = ROOT / "ROADMAP.md"

H2_RE = re.compile(r"^## (.+?)\s*$", re.M)
FIELD_RE = re.compile(r"\*\*(?!\s)([^*：\n]{1,12})：\*\*")


class ScaffoldError(Exception):
    """可预期的拒绝：参数不对、没登记、越界、已存在、契约不一致。"""


# ---------------------------------------------------------------- 基础读取


def read_text(path: Path) -> str:
    if not path.exists():
        raise ScaffoldError(f"缺少契约文件：{path.relative_to(ROOT)}")
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise ScaffoldError(f"{path.relative_to(ROOT)} 不是合法 UTF-8：{exc}") from exc


def fenced_blocks(text: str, info: str) -> list[list[str]]:
    """取出所有 ```<info> ... ``` 围栏块的块内行。"""
    lines = text.split("\n")
    opener = "```" + info
    blocks: list[list[str]] = []
    i = 0
    while i < len(lines):
        if lines[i].strip() == opener:
            j = i + 1
            while j < len(lines) and lines[j].strip() != "```":
                j += 1
            if j >= len(lines):
                raise ScaffoldError(f"{info} 围栏块未闭合（第 {i + 1} 行起）")
            blocks.append(lines[i + 1 : j])
            i = j
        i += 1
    return blocks


def canonical_block(path: Path, info: str) -> list[str]:
    """契约要求：有且只有一个该信息串的围栏块。"""
    blocks = fenced_blocks(read_text(path), info)
    if len(blocks) != 1:
        raise ScaffoldError(
            f"{path.relative_to(ROOT)} 必须恰有 1 个 ```{info} 块，实际 {len(blocks)} 个"
        )
    return blocks[0]


def table_rows(section_lines: list[str]) -> list[list[str]]:
    """解析 markdown 表格的数据行（跳过表头与分隔行）。"""
    rows: list[list[str]] = []
    for line in section_lines:
        s = line.strip()
        if not s.startswith("|"):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c != ""):
            continue  # 分隔行
        rows.append(cells)
    return rows[1:] if rows else []  # 去掉表头


def sections(text: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    key: str | None = None
    for line in text.split("\n"):
        if line.startswith("## "):
            key = line[3:].strip()
            out[key] = []
        elif key is not None:
            out[key].append(line)
    return out


def pick_section(secs: dict[str, list[str]], needle: str) -> list[str]:
    for name, body in secs.items():
        if needle in name:
            return body
    raise ScaffoldError(f"ROADMAP.md 里找不到含「{needle}」的小节")


# ---------------------------------------------------------------- ROADMAP


def parse_roadmap() -> tuple[list[dict], list[dict], int]:
    secs = sections(read_text(ROADMAP_FILE))

    modules: list[dict] = []
    total: int | None = None
    for cells in table_rows(pick_section(secs, "模块分区")):
        if len(cells) < 4:
            continue
        m = re.search(r"`([^`]+)`", cells[0])
        if not m:
            num = re.search(r"\d+", cells[2])
            if "合计" in cells[0] and num:
                total = int(num.group())
            continue
        count = re.search(r"\d+", cells[2])
        if not count:
            raise ScaffoldError(f"模块分区行缺少计划讲数：{cells}")
        modules.append({"dir": m.group(1), "name": cells[1], "count": int(count.group())})

    registry: list[dict] = []
    for cells in table_rows(pick_section(secs, "讲次登记表")):
        if len(cells) < 5:
            continue
        lid = re.search(r"`(\d{2}-\d{2})`", cells[0])
        slug = re.search(r"`([^`]+)`", cells[1])
        if not lid or not slug:
            raise ScaffoldError(f"讲次登记行格式不对（需要 `NN-NN` 与 `slug`）：{cells}")
        registry.append(
            {
                "id": lid.group(1),
                "slug": slug.group(1),
                "title": cells[2],
                "type": cells[3],
                "status": cells[4],
            }
        )

    if not modules:
        raise ScaffoldError("ROADMAP.md §1 没解析出任何模块行")
    if total is None:
        raise ScaffoldError("ROADMAP.md §1 缺少「合计」行")
    if sum(m["count"] for m in modules) != total:
        raise ScaffoldError(
            f"ROADMAP.md §1 自相矛盾：各模块合计 {sum(m['count'] for m in modules)} ≠ 合计行 {total}"
        )
    for row in registry:
        if row["type"] not in {"Learn", "Build", "Apply"}:
            raise ScaffoldError(f"{row['id']} 的类型非法：{row['type']}")
        if row["status"] not in {"计划", "骨架", "完成"}:
            raise ScaffoldError(f"{row['id']} 的状态非法：{row['status']}")
    return modules, registry, total


# ---------------------------------------------------------------- 生成


def fill_body(block: list[str], title: str, mod: str, les: str, kind: str) -> str:
    """只替换 H1、主旨行与 模块/讲次/类型 三个字段值，其余（含 TODO）原样保留。"""
    text = "\n".join(block) + "\n"
    text = re.sub(r"^#\s+.*$", f"# {title}", text, count=1, flags=re.M)
    text = re.sub(
        r"^>\s+.*$",
        "> TODO（一句话主旨：15–60 字，说清本讲要解决的张力；站点抓为摘要）",
        text,
        count=1,
        flags=re.M,
    )
    for field, value in (("模块", mod), ("讲次", les), ("类型", kind)):
        pattern = rf"(\*\*{field}：\*\*\s*)\S+"
        text, n = re.subn(pattern, lambda m: m.group(1) + value, text, count=1)
        if n != 1:
            raise ScaffoldError(f"骨架里找不到头部字段：{field}")
    return text


def gen_prompt(lesson_id: str, title: str, module_dir: str, module_name: str,
               kind: str, n_h2: int, n_q: int, dist: str, n_opt: int) -> str:
    return f"""# 第 {lesson_id} 讲 · 生成提示词

> 本文件是第 {lesson_id} 讲《{title}》的**可复现生成源**：改内容先改这里，再按它重新生成。
> 正文骨架与字段约束见 `LESSON_TEMPLATE.md`；测验约束见 `QUIZ_CONTRACT.md`。

## 1. 本讲位置

- 讲次 ID：{lesson_id}
- 模块：`{module_dir}`（{module_name}）
- 标题：{title}
- 类型：{kind}
- 前置：TODO（依赖的讲次 ID，多个用、分隔；无则写"无"）
- 在课程中的位置：TODO（一句话说明它承接什么、为后面哪几讲铺路）

## 2. 必须覆盖的概念清单

- TODO 概念 1
- TODO 概念 2
- TODO 概念 3

> 这份清单是本讲的验收标准：正文必须让读者掌握其中每一条。

## 3. 正文骨架（不得增删章节）

严格按 `LESSON_TEMPLATE.md` 第 2 节的 **{n_h2} 个 H2**、原顺序与原文字生成；
头部 6 个字段的取值规则见 `LESSON_TEMPLATE.md` §3；各章节的数量与质量要求见 §5。

## 4. 测验要求

- 题数与 stage 分布：按 `QUIZ_CONTRACT.md` §2 规范样例 —— 当前 **{n_q} 题**，分布 **{dist}**。
- **先在下面写死本讲的槽位序列，再照它出题**（见 `QUIZ_CONTRACT.md` §6.4）：
  - 本讲槽位序列：TODO，例 `0,1,2,3,1,2`
  - 硬约束：同一槽位最多 2 次；至少用满 3 个不同槽位。
- `options` 恰好 {n_opt} 个；禁止「以上都对 / 以上都不对 / 无法判断」。
- `explanation` ≥ 40 字，且必须同时说明「正确项为何对」与「最容易被误选的那项为何错」。
- 正文《自测题》必须与 `quiz.json` **同序、同考点**。

## 5. 产出物

| 产出 | 要求 |
| --- | --- |
| `docs/zh.md` | 替换全部 TODO，达到 `LESSON_TEMPLATE.md` §5 的各章节要求 |
| `quiz.json` | 替换全部 TODO；`lesson` 保持 `{lesson_id}`；键名不得增删 |
| `outputs/` | ≥1 件可带走的东西（学习卡 / 决策清单 / 实验设计 / 术语卡），frontmatter 去掉 `status: template` |
| `examples/`（可选） | 数据表 / 计算脚本 / 问卷设计；允许伪代码 + 手工推导 |

## 6. 禁止事项

- 不编造论文、作者、年份、期刊或数据；经典研究必须写全 作者/年份/结论/争议。
- 有争议的结论必须显式标注争议，不得写成定论。
- 图表只用 Mermaid 或 SVG，禁止 ASCII art。
- 不擅自增删 `LESSON_TEMPLATE.md` 规定的 H2，也不增删 `QUIZ_CONTRACT.md` 规定的键。
- 不把答案写进作答前可见的 DOM（见 `QUIZ_CONTRACT.md` §10）。
"""


OUTPUT_FRONTMATTER = """---
title: TODO
type: 学习卡
lesson: {lesson_id}
source: TODO
status: template
---

TODO：把本讲最值得带走的东西写成一张卡。不要复述整篇讲义。
"""


# ---------------------------------------------------------------- 自检


def shape_check(body_text: str, tmpl_block: list[str], quiz_data: dict, quiz_tmpl: dict) -> None:
    want_h2 = H2_RE.findall("\n".join(tmpl_block))
    got_h2 = H2_RE.findall(body_text)
    if got_h2 != want_h2:
        raise ScaffoldError(f"自检失败：H2 清单与模板不一致\n  模板 {want_h2}\n  产出 {got_h2}")
    want_fields = FIELD_RE.findall("\n".join(tmpl_block))
    got_fields = FIELD_RE.findall(body_text)
    if got_fields != want_fields:
        raise ScaffoldError(f"自检失败：头部字段与模板不一致\n  模板 {want_fields}\n  产出 {got_fields}")
    if list(quiz_data.keys()) != list(quiz_tmpl.keys()):
        raise ScaffoldError("自检失败：quiz 顶层键与 QUIZ_CONTRACT.md 样例不一致")
    q, t = quiz_data["questions"], quiz_tmpl["questions"]
    if len(q) != len(t):
        raise ScaffoldError(f"自检失败：题数 {len(q)} ≠ 样例 {len(t)}")
    for i, (a, b) in enumerate(zip(q, t)):
        if list(a.keys()) != list(b.keys()):
            raise ScaffoldError(f"自检失败：第 {i + 1} 题键集合与样例不一致")
        if len(a["options"]) != len(b["options"]):
            raise ScaffoldError(f"自检失败：第 {i + 1} 题选项数 ≠ {len(b['options'])}")
    if [x["stage"] for x in q] != [x["stage"] for x in t]:
        raise ScaffoldError("自检失败：stage 顺序/分布与样例不一致")


# ---------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser(description="按契约生成一讲的骨架")
    ap.add_argument("module", help="模块号，如 03")
    ap.add_argument("lesson", help="讲号，如 05")
    ap.add_argument("--force", action="store_true", help="覆盖已存在的讲目录")
    args = ap.parse_args()

    try:
        mod = f"{int(args.module):02d}"
        les = f"{int(args.lesson):02d}"
    except ValueError:
        print(f"错误：模块号/讲号必须是数字，收到 {args.module!r} / {args.lesson!r}", file=sys.stderr)
        return 1
    lesson_id = f"{mod}-{les}"

    try:
        modules, registry, total = parse_roadmap()

        module = next((m for m in modules if m["dir"].split("-")[0] == mod), None)
        if module is None:
            raise ScaffoldError(f"ROADMAP.md §1 没有模块 {mod}（现有：{'、'.join(m['dir'] for m in modules)}）")
        if not 1 <= int(les) <= module["count"]:
            raise ScaffoldError(
                f"{lesson_id} 越界：模块 {module['dir']} 计划 {module['count']} 讲，有效范围 "
                f"{mod}-01 – {mod}-{module['count']:02d}"
            )

        row = next((r for r in registry if r["id"] == lesson_id), None)
        if row is None:
            raise ScaffoldError(
                f"{lesson_id} 未在 ROADMAP.md §2 登记。先加一行（ID / slug / 标题 / 类型 / 状态=计划）再来生成。"
            )

        target = ROOT / "phases" / module["dir"] / row["slug"]
        if target.exists() and not args.force:
            raise ScaffoldError(f"{target.relative_to(ROOT)} 已存在。要覆盖请显式传 --force。")

        tmpl_block = canonical_block(TEMPLATE_FILE, "markdown")
        quiz_block = canonical_block(QUIZ_FILE, "json")
        try:
            quiz_tmpl = json.loads("\n".join(quiz_block))
        except json.JSONDecodeError as exc:
            raise ScaffoldError(f"QUIZ_CONTRACT.md §2 的 JSON 无法解析：{exc}") from exc

        body = fill_body(tmpl_block, row["title"], mod, les, row["type"])

        quiz_data = json.loads(json.dumps(quiz_tmpl))  # 深拷贝
        quiz_data["lesson"] = lesson_id

        shape_check(body, tmpl_block, quiz_data, quiz_tmpl)

        stages = [q["stage"] for q in quiz_tmpl["questions"]]
        dist = " + ".join(f"{stages.count(s)} {s}" for s in dict.fromkeys(stages))

        (target / "docs").mkdir(parents=True, exist_ok=True)
        (target / "outputs").mkdir(parents=True, exist_ok=True)
        (target / "docs" / "zh.md").write_text(body, encoding="utf-8", newline="\n")
        (target / "quiz.json").write_text(
            json.dumps(quiz_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
        )
        (target / "gen-prompt.md").write_text(
            gen_prompt(lesson_id, row["title"], module["dir"], module["name"], row["type"],
                       len(H2_RE.findall("\n".join(tmpl_block))), len(quiz_tmpl["questions"]),
                       dist, len(quiz_tmpl["questions"][0]["options"])),
            encoding="utf-8",
            newline="\n",
        )
        (target / "outputs" / "学习卡.md").write_text(
            OUTPUT_FRONTMATTER.format(lesson_id=lesson_id), encoding="utf-8", newline="\n"
        )

    except ScaffoldError as exc:
        print(f"拒绝生成：{exc}", file=sys.stderr)
        return 1

    rel = target.relative_to(ROOT)
    print(f"已生成 {lesson_id}《{row['title']}》骨架  ->  {rel.as_posix()}/")
    print(f"  正文   {rel.as_posix()}/docs/zh.md      （{len(H2_RE.findall(body))} 个 H2，全部为 TODO）")
    print(f"  测验   {rel.as_posix()}/quiz.json         （{len(quiz_data['questions'])} 题，{dist}，全部为 TODO）")
    print(f"  生成源 {rel.as_posix()}/gen-prompt.md")
    print(f"  产物   {rel.as_posix()}/outputs/学习卡.md （status: template）")
    print()
    print("下一步：按 gen-prompt.md 填内容；填完跑 node site/build.js --check 与 audit_lessons.py --strict。")
    print("注意：当前产物**必然**过不了 L002/L004/L006——这是脚手架的设计意图（形状合规 ≠ 内容写完）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
