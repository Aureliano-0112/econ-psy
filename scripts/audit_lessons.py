#!/usr/bin/env python3
"""audit_lessons.py — 课程结构审计（L001–L010）。

形状的唯一来源（本脚本不内置任何标题/字段/题数常量，全部派生）：
  LESSON_TEMPLATE.md 第 2 节  -> 正文 11 个 H2 清单与顺序、6 个头部字段与顺序、H1、主旨口径
  QUIZ_CONTRACT.md   第 2 节  -> quiz 顶层键、每题键、题数、stage 分布、选项数、correct 取值范围
  ROADMAP.md §1/§2            -> 模块目录、讲次编号、ID 范围
  glossary/terms.md  §2       -> 术语清单（L010）

用法：
  python3 scripts/audit_lessons.py --strict   # 任一失败 exit 1
  python3 scripts/audit_lessons.py --report   # 覆盖率报表（markdown，不阻塞）
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

try:  # Windows 控制台默认 GBK
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:  # pragma: no cover
    pass

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_FILE = ROOT / "LESSON_TEMPLATE.md"
QUIZ_FILE = ROOT / "QUIZ_CONTRACT.md"
ROADMAP_FILE = ROOT / "ROADMAP.md"
GLOSSARY_FILE = ROOT / "glossary" / "terms.md"

MIN_BYTES = 800
SUMMARY_MIN, SUMMARY_MAX = 15, 60
OUTPUT_TYPES = {"学习卡", "决策清单", "实验设计", "术语卡"}
OUTPUT_KEYS = ("title", "type", "lesson", "source")

H2_RE = re.compile(r"^## (.+?)\s*$", re.M)
FIELD_RE = re.compile(r"\*\*(?!\s)([^*：\n]{1,12})：\*\*")
ANGLE_RE = re.compile(r"<[^>\n]*>")
MOD_DIR_RE = re.compile(r"^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$")
LESSON_DIR_RE = re.compile(r"^(\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)$")
TIME_RE = re.compile(r"^(\d{2})–(\d{2}) 分钟$")


class Ctx:
    """从契约文件派生出来的规范量。"""

    def __init__(self) -> None:
        self.h2: list[str] = []
        self.header_fields: list[str] = []
        self.h1: str = ""
        self.summary_line: str = ""
        self.quiz_top_keys: list[str] = []
        self.quiz_q_keys: list[str] = []
        self.quiz_stages: list[str] = []
        self.n_questions: int = 0
        self.n_options: int = 0
        self.modules: list[dict] = []
        self.registry: list[dict] = []
        self.terms: set[str] = set()
        self.load()

    def load(self) -> None:
        # --- LESSON_TEMPLATE.md 第 2 节 ---
        block = canonical_block(TEMPLATE_FILE, "markdown")
        cut = next((i for i, l in enumerate(block) if l.startswith("## ")), len(block))
        header_region = "\n".join(block[:cut])
        self.h2 = [l[3:].rstrip() for l in block if l.startswith("## ")]
        self.header_fields = FIELD_RE.findall(header_region)
        self.h1 = next((l for l in block if l.startswith("# ")), "")
        self.summary_line = next((l for l in block[:cut] if l.startswith("> ")), "")

        # --- QUIZ_CONTRACT.md 第 2 节 ---
        quiz = json.loads("\n".join(canonical_block(QUIZ_FILE, "json")))
        self.quiz_top_keys = list(quiz.keys())
        self.quiz_q_keys = list(quiz["questions"][0].keys())
        self.n_questions = len(quiz["questions"])
        self.n_options = len(quiz["questions"][0]["options"])
        self.quiz_stages = [q["stage"] for q in quiz["questions"]]

        # --- ROADMAP.md ---
        roadmap = read_text(ROADMAP_FILE)
        for cells in table_rows(section_lines(roadmap, r"^## 1\.", r"^## ")):
            m = re.search(r"`([^`]+)`", cells[0])
            if not m:
                continue
            cnt = re.search(r"\d+", cells[2])
            self.modules.append({"dir": m.group(1), "name": cells[1], "planned": int(cnt.group())})
        for cells in table_rows(section_lines(roadmap, r"^## 2\.", r"^## ")):
            lid = re.search(r"`(\d{2}-\d{2})`", cells[0])
            slug = re.search(r"`([^`]+)`", cells[1])
            if lid and slug:
                self.registry.append({"id": lid.group(1), "slug": slug.group(1)})

        # --- glossary/terms.md §2 ---
        gloss = read_text(GLOSSARY_FILE)
        for cells in table_rows(section_lines(gloss, r"^## 2\.", r"^## ")):
            name = re.sub(r"[*`]", "", cells[0]).strip()
            if name:
                self.terms.add(name)


# ---------------------------------------------------------------- 基础读取


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def fenced_blocks(text: str, info: str) -> list[list[str]]:
    lines = text.split("\n")
    opener = "```" + info
    blocks: list[list[str]] = []
    i = 0
    while i < len(lines):
        if lines[i].strip() == opener:
            j = i + 1
            while j < len(lines) and lines[j].strip() != "```":
                j += 1
            blocks.append(lines[i + 1 : j])
            i = j
        i += 1
    return blocks


def canonical_block(path: Path, info: str) -> list[str]:
    blocks = fenced_blocks(read_text(path), info)
    if len(blocks) != 1:
        raise SystemExit(f"契约文件 {path.name} 必须恰有 1 个 ```{info} 块，实际 {len(blocks)} 个")
    return blocks[0]


def section_lines(text: str, start: str, end: str) -> list[str]:
    lines = text.split("\n")
    s = next((i for i, l in enumerate(lines) if re.search(start, l)), -1)
    if s < 0:
        return []
    out: list[str] = []
    for l in lines[s + 1 :]:
        if re.search(end, l):
            break
        out.append(l)
    return out


def table_rows(lines: list[str]) -> list[list[str]]:
    rows: list[list[str]] = []
    for line in lines:
        s = line.strip()
        if not s.startswith("|"):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c != ""):
            continue
        rows.append(cells)
    return rows[1:] if rows else []


def strip_code(text: str) -> str:
    out, infence = [], False
    for line in text.split("\n"):
        if re.match(r"^\s*```", line):
            infence = not infence
            out.append("")
            continue
        out.append("" if infence else line)
    return "\n".join(out)


def split_fields(header: str) -> tuple[list[str], dict[str, str]]:
    marks = [(m.group(1), m.end()) for m in FIELD_RE.finditer(header)]
    order, vals = [], {}
    for i, (name, end) in enumerate(marks):
        if i + 1 < len(marks):
            nxt_name, nxt_end = marks[i + 1]
            stop = nxt_end - len(f"**{nxt_name}：**")
        else:
            stop = len(header)
        vals[name] = header[end:stop].strip()
        order.append(name)
    return order, vals


def header_region_of(text: str) -> str:
    idx = re.search(r"^## ", text, re.M)
    return text[: idx.start()] if idx else text


def h2_sections(text: str) -> list[tuple[str, list[str]]]:
    lines = text.split("\n")
    out: list[tuple[str, list[str]]] = []
    cur: str | None = None
    body: list[str] = []
    for line in lines:
        if line.startswith("## "):
            if cur is not None:
                out.append((cur, body))
            cur, body = line[3:].rstrip(), []
        elif cur is not None:
            body.append(line)
    if cur is not None:
        out.append((cur, body))
    return out


# ---------------------------------------------------------------- 逐讲检查


def check_lesson(ctx: Ctx, lesson: Path, module_dir: str, mod: str, reg_by_id: dict) -> list[str]:
    e: list[str] = []
    lid = f"{mod}-{lesson.name[:2]}"
    zh = lesson / "docs" / "zh.md"
    quiz_path = lesson / "quiz.json"
    gp_path = lesson / "gen-prompt.md"
    out_dir = lesson / "outputs"

    # ---- L002 正文文件级 ----
    text = ""
    if not zh.exists():
        e.append("L002 缺少 docs/zh.md")
    else:
        raw = zh.read_bytes()
        if raw[:3] == b"\xef\xbb\xbf":
            e.append("L002 docs/zh.md 含 UTF-8 BOM")
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            e.append(f"L002 docs/zh.md 不是合法 UTF-8：{exc}")
        if len(raw) < MIN_BYTES:
            e.append(f"L002 docs/zh.md 仅 {len(raw)}B < {MIN_BYTES}B")
        if text:
            outside = strip_code(text)
            nonempty = [l for l in text.split("\n") if l.strip()]
            h1s = [l for l in outside.split("\n") if re.match(r"^#\s", l)]
            if len(h1s) != 1:
                e.append(f"L002 H1 数量应为 1，实际 {len(h1s)}")
            if nonempty and not re.match(r"^#\s", nonempty[0]):
                e.append("L002 首个非空行不是 H1")
            # 主旨
            lines = text.split("\n")
            hi = next((i for i, l in enumerate(lines) if re.match(r"^#\s", l)), None)
            summary = None
            if hi is not None:
                j = hi + 1
                while j < len(lines) and not lines[j].strip():
                    j += 1
                if j < len(lines) and lines[j].lstrip().startswith(">"):
                    summary = lines[j].lstrip()[1:].strip()
                else:
                    e.append("L002 H1 之后缺少以 > 开头的一句话主旨")
            if summary is not None:
                if not (SUMMARY_MIN <= len(summary) <= SUMMARY_MAX):
                    e.append(f"L002 主旨长度 {len(summary)} 字，应在 {SUMMARY_MIN}–{SUMMARY_MAX}")
                if ANGLE_RE.search(summary):
                    e.append("L002 主旨残留角括号占位 <...>")
            if re.search(r"^#\s", outside, re.M) and ANGLE_RE.search(h1s[0] if h1s else ""):
                e.append("L002 H1 残留角括号占位 <...>")
            if "TODO" in outside:
                e.append("L002 正文残留占位 TODO")

    # ---- L003 头部字段 ----
    if text:
        header = header_region_of(text)
        order, vals = split_fields(header)
        if order != ctx.header_fields:
            e.append(f"L003 头部字段与模板不一致：期望 {ctx.header_fields}，实际 {order}")
        else:
            if vals.get("模块") != mod:
                e.append(f"L003 模块「{vals.get('模块')}」≠ 目录推导值 {mod}")
            if vals.get("讲次") != lesson.name[:2]:
                e.append(f"L003 讲次「{vals.get('讲次')}」≠ 目录推导值 {lesson.name[:2]}")
            if vals.get("类型") not in {"Learn", "Build", "Apply"}:
                e.append(f"L003 类型非法：{vals.get('类型')}")
            prereq = vals.get("前置", "")
            if prereq != "无":
                for pid in [p.strip() for p in re.split(r"[、,，]", prereq) if p.strip()]:
                    if not re.fullmatch(r"\d{2}-\d{2}", pid):
                        e.append(f"L003 前置「{pid}」不是合法讲次 ID")
                    elif pid == lid:
                        e.append("L003 前置引用了本讲自身")
                    elif pid not in reg_by_id:
                        e.append(f"L003 前置「{pid}」在 ROADMAP 中不存在")
            tm = TIME_RE.match(vals.get("预计时间", ""))
            if not tm:
                e.append(f"L003 预计时间格式非法：{vals.get('预计时间')}")
            else:
                a, b = int(tm.group(1)), int(tm.group(2))
                if not (30 <= a < b <= 90):
                    e.append(f"L003 预计时间区间非法：{vals.get('预计时间')}")
            if vals.get("AI 生成提示词") != "gen-prompt.md":
                e.append(f"L003 AI 生成提示词字段应为 gen-prompt.md，实际 {vals.get('AI 生成提示词')}")
            for name, v in vals.items():
                if ANGLE_RE.search(v):
                    e.append(f"L003 头部字段「{name}」残留角括号占位 <...>")

    # ---- L004 / L005 quiz.json ----
    quiz = None
    if not quiz_path.exists():
        e.append("L004 缺少 quiz.json")
    else:
        try:
            quiz = json.loads(read_text(quiz_path))
        except json.JSONDecodeError as exc:
            e.append(f"L004 quiz.json 无法解析：{exc}")
        if quiz is not None:
            if list(quiz.keys()) != ctx.quiz_top_keys:
                e.append(f"L004 quiz 顶层键与契约不一致：{list(quiz.keys())} ≠ {ctx.quiz_top_keys}")
            qs = quiz.get("questions")
            if not isinstance(qs, list):
                e.append("L004 questions 不是数组")
            else:
                if len(qs) != ctx.n_questions:
                    e.append(f"L004 题数 {len(qs)} ≠ 契约 {ctx.n_questions}")
                if [q.get("stage") for q in qs] != ctx.quiz_stages:
                    e.append("L004 stage 顺序/分布与契约不一致")
                for i, q in enumerate(qs, 1):
                    if list(q.keys()) != ctx.quiz_q_keys:
                        e.append(f"L004 第 {i} 题键集合与契约不一致：{list(q.keys())}")
                    opts = q.get("options")
                    if not isinstance(opts, list) or len(opts) != ctx.n_options:
                        e.append(f"L004 第 {i} 题选项数 ≠ {ctx.n_options}")
                    else:
                        stripped = [str(o).strip() for o in opts]
                        if any(not o for o in stripped):
                            e.append(f"L004 第 {i} 题存在空选项")
                        if len(set(stripped)) != len(stripped):
                            e.append(f"L004 第 {i} 题选项重复")
            if quiz.get("lesson") != lid:
                e.append(f"L004 lesson 字段「{quiz.get('lesson')}」≠ 目录推导值 {lid}")
            if "TODO" in read_text(quiz_path):
                e.append("L004 quiz.json 残留占位 TODO")
            # L005 槽位
            if isinstance(qs, list) and qs:
                bad = False
                slots = []
                for i, q in enumerate(qs, 1):
                    c = q.get("correct")
                    opts = q.get("options") or []
                    if not isinstance(c, int) or isinstance(c, bool) or not (0 <= c <= len(opts) - 1):
                        e.append(f"L005 第 {i} 题 correct={c!r} 越界（应在 0–{max(len(opts) - 1, 0)}）")
                        bad = True
                    else:
                        slots.append(c)
                if not bad and slots:
                    counts = {s: slots.count(s) for s in set(slots)}
                    if max(counts.values()) > 2:
                        e.append(f"L005 单讲同一槽位出现 {max(counts.values())} 次 > 2（答案位置偏斜）")
                    if len(counts) < 3:
                        e.append(f"L005 仅用满 {len(counts)} 个槽位 < 3（答案位置偏斜）")

    # ---- L006 outputs ----
    if not out_dir.exists() or not any(out_dir.glob("*.md")):
        e.append("L006 outputs/ 为空（每讲至少一件带 frontmatter 的产物）")
    else:
        ok_any = False
        for f in sorted(out_dir.glob("*.md")):
            raw = read_text(f)
            m = re.match(r"^---\n([\s\S]*?)\n---\n?", raw)
            if not m:
                continue
            fm = {}
            for line in m.group(1).split("\n"):
                kv = re.match(r"^([A-Za-z_]+)\s*:\s*(.*)$", line)
                if kv:
                    fm[kv[1]] = kv[2].strip()
            body = raw[m.end():]
            if any(k not in fm or not fm[k] for k in OUTPUT_KEYS):
                continue
            if fm.get("type") not in OUTPUT_TYPES:
                continue
            if fm.get("lesson") != lid:
                continue
            if fm.get("status", "").strip() == "template":
                continue
            if "TODO" in body:
                continue
            ok_any = True
        if not ok_any:
            e.append("L006 outputs/ 中没有一件「完整 frontmatter 且非占位」的产物")

    # ---- L007 gen-prompt ----
    if not gp_path.exists():
        e.append("L007 缺少 gen-prompt.md")
    elif lid not in read_text(gp_path):
        e.append(f"L007 gen-prompt.md 未引用本讲编号 {lid}")

    # ---- L008 站内相对链接 ----
    if text:
        for target in re.findall(r"\]\(([^)\s]+)\)", strip_code(text)):
            if re.match(r"^(https?:|mailto:|tel:|#|/)", target):
                continue
            clean = target.split("#")[0]
            if not clean:
                continue
            if not (lesson / clean).exists():
                e.append(f"L008 站内相对链接无法解析：{target}")

    # ---- L009 骨架 H2 ----
    if text:
        outside = strip_code(text)
        got = [name for name, _ in h2_sections(outside)]
        if got != ctx.h2:
            e.append(f"L009 H2 清单与模板不一致：\n      期望 {ctx.h2}\n      实际 {got}")
        else:
            for name, body in h2_sections(outside):
                if not any(l.strip() for l in body):
                    e.append(f"L009 章节《{name}》之下没有非空内容")
            zice = dict(h2_sections(outside)).get("自测题", [])
            n_items = len([l for l in zice if re.match(r"^\s*\d+[.)]\s", l)])
            if n_items != ctx.n_questions:
                e.append(f"L009 正文《自测题》{n_items} 条 ≠ quiz 契约 {ctx.n_questions} 题")

    # ---- L010 术语 ----
    if text:
        body = dict(h2_sections(strip_code(text))).get("延伸关键词", [])
        raw_terms = "、".join(body)
        items = [t.strip().strip("`*") for t in re.split(r"[、,，\n]", raw_terms) if t.strip()]
        for t in items:
            if t not in ctx.terms:
                e.append(f"L010 术语「{t}」不在 glossary/terms.md §2 中")

    if module_dir not in [m["dir"] for m in ctx.modules]:
        e.append(f"L001 模块目录 {module_dir} 不在 ROADMAP §1")
    return e


def check_structure(ctx: Ctx) -> tuple[dict[str, Path], dict[str, list[str]]]:
    """L001：目录命名与编号连续性 + 扫描讲次。"""
    errs: dict[str, list[str]] = {}
    phases = ROOT / "phases"
    found: dict[str, Path] = {}
    if not phases.exists():
        errs["_global"] = ["L001 缺少 phases/ 目录"]
        return found, errs

    known_dirs = [m["dir"] for m in ctx.modules]
    for mdir in sorted(p for p in phases.iterdir() if p.is_dir()):
        if mdir.name not in known_dirs:
            errs.setdefault("_global", []).append(f"L001 phases/{mdir.name} 不是 ROADMAP §1 的模块目录")
            continue
        if not MOD_DIR_RE.match(mdir.name):
            errs.setdefault("_global", []).append(f"L001 模块目录命名不合规：{mdir.name}")
        lessons = sorted(p for p in mdir.iterdir() if p.is_dir())
        nums = []
        for lp in lessons:
            m = LESSON_DIR_RE.match(lp.name)
            if not m:
                errs.setdefault("_global", []).append(f"L001 讲目录命名不合规：{mdir.name}/{lp.name}")
                continue
            found[f"{mdir.name[:2]}-{m.group(1)}"] = lp
            nums.append(int(m.group(1)))
        planned = next(m["planned"] for m in ctx.modules if m["dir"] == mdir.name)
        for idx, n in enumerate(sorted(nums)):
            if n != idx + 1:
                errs.setdefault("_global", []).append(
                    f"L001 模块 {mdir.name} 讲次不连续：第 {idx + 1} 个应为 {mdir.name[:2]}-{idx + 1:02d}，实际 …-{n:02d}"
                )
                break
            if n > planned:
                errs.setdefault("_global", []).append(f"L001 {mdir.name[:2]}-{n:02d} 超出该模块计划 {planned} 讲")
    return found, errs


# ---------------------------------------------------------------- 报表


def build_report(ctx: Ctx, found: dict[str, Path]) -> str:
    now = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %z")
    lines = ["# 覆盖率报表（audit_lessons.py --report）", "", f"> 生成时间：{now}", ""]
    lines += ["## 每讲覆盖", "", "| 讲次 | 正文 | quiz | outputs | gen-prompt | 残留占位 |", "| --- | --- | --- | --- | --- | --- |"]
    slot_counts = {0: 0, 1: 0, 2: 0, 3: 0}
    total_q = 0
    for lid in sorted(found):
        d = found[lid]
        zh = d / "docs" / "zh.md"
        quiz = d / "quiz.json"
        outs = list((d / "outputs").glob("*.md")) if (d / "outputs").exists() else []
        gp = d / "gen-prompt.md"
        # 占位按 LESSON_TEMPLATE.md §7 的口径：只数 正文 / quiz / outputs 的 TODO；
        # gen-prompt.md 里的「替换全部 TODO」是写作指令，不算占位。
        todo = 0
        for f in [zh, quiz] + outs:
            if f.exists():
                todo += read_text(f).count("TODO")
        mark = lambda ok: "✔" if ok else "—"
        lines.append(
            f"| {lid} | {mark(zh.exists())} | {mark(quiz.exists())} | {mark(bool(outs))} | "
            f"{mark(gp.exists())} | {todo} |"
        )
        if quiz.exists():
            try:
                for q in json.loads(read_text(quiz))["questions"]:
                    c = q.get("correct")
                    if isinstance(c, int) and c in slot_counts:
                        slot_counts[c] += 1
                        total_q += 1
            except Exception:
                pass

    lines += ["", "## correct 槽位分布（全课）", ""]
    if total_q:
        lines += ["| 槽位 | 次数 | 占比 |", "| --- | --- | --- |"]
        for s in (0, 1, 2, 3):
            pct = slot_counts[s] / total_q * 100
            lines.append(f"| {s} | {slot_counts[s]} | {pct:.1f}% |")
        lines += [
            "",
            f"合计 {total_q} 题。**全课分布约束（各 25%±10pp）仅在满编 72 讲（432 题）时强制**"
            "（QUIZ_CONTRACT.md §6.3）；未满编期间只观察是否漂移。",
        ]
    else:
        lines.append("暂无可用 quiz 数据。")
    lines += ["", "> 结构检查通过 ≠ 内容写完：脚手架产物形状合规但必然带 TODO。" , ""]
    return "\n".join(lines)


# ---------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser(description="课程结构审计 L001–L010")
    ap.add_argument("--strict", action="store_true", help="任一失败 exit 1")
    ap.add_argument("--report", action="store_true", help="输出覆盖率报表（不阻塞）")
    args = ap.parse_args()

    ctx = Ctx()
    found, errs = check_structure(ctx)
    reg_by_id = {r["id"]: r for r in ctx.registry}

    if args.report:
        print(build_report(ctx, found))
        return 0

    for lid, path in sorted(found.items()):
        module_dir = path.parent.name
        for msg in check_lesson(ctx, path, module_dir, lid[:2], reg_by_id):
            errs.setdefault(lid, []).append(msg)

    total = sum(len(v) for v in errs.values())
    for key in sorted(errs):
        if key == "_global":
            for msg in errs[key]:
                print(f"[全局] {msg}", file=sys.stderr)
        else:
            for msg in errs[key]:
                print(f"[{key}] {msg}", file=sys.stderr)

    print(f"\n审计讲次 {len(found)} 讲；发现 {total} 个问题。", file=sys.stderr)
    if total:
        print("L001–L010 未全绿。", file=sys.stderr)
        return 1
    print("L001–L010 全部通过。", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())