#!/usr/bin/env python3
"""
validate_agent_data.py — 成長エージェントが書き換えた data/agent/*.json の検査

ここに通ったときだけ main に直接反映する（通らなければ PR で止める）。
エージェント本体（agent/growth.py）も、書き込む前に同じ関数で1件ずつ確かめている。

見ること:
  - JSON として読めるか、形が決まりどおりか（ビルドを壊さない）
  - タイトル: 薬の名前で始まる / 40文字以内 / 誇大・断定・資格を名乗る言葉がない
  - 説明文: 20〜130文字 / 同じ禁止語がない / 「眠くなる」の記述が元の説明文と食い違っていない
  - トップに出す薬: 12件以内、slug の形
  - /sagasu/ の追加: lib/sagasu.ts にある症状・条件の組だけ
  - 改修の記録（experiments.json）: id・状態・対象・開始日の形
使い方: python scripts/validate_agent_data.py   （0=合格、1=不合格）
"""
from __future__ import annotations
import json, os, re, sys

AGENT_DIR = "data/agent"
TITLE_MAX = 40
DESC_MIN, DESC_MAX = 20, 130
FEATURED_MAX = 12

BANNED = [
    "治る", "治す", "治ります", "必ず", "絶対", "最強", "最安", "一番", "No.1", "No1", "ナンバーワン",
    "おすすめ", "オススメ", "お勧め", "安全", "副作用なし", "副作用がない", "副作用が少ない", "効果抜群", "即効",
    "よく効く", "すぐ効く", "医師", "薬剤師", "監修", "専門家", "公式", "ランキング", "激安", "驚", "!", "！",
    "http", "<", ">",
]
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")

EXP_STATUS = {"proposed", "running", "fix", "grow", "drop", "skipped"}
EXP_PATH_RE = re.compile(r"^/(?:[a-z0-9][a-z0-9-]*/)*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

DROWSY_YES = "眠くなる成分を含み"
DROWSY_NO = "眠くなる成分は含まれていません"


def banned_in(text: str) -> list[str]:
    return [w for w in BANNED if w in text]


def check_title(title: object, name: object) -> list[str]:
    errs = []
    if not isinstance(title, str) or not title.strip():
        return ["タイトルが空"]
    if "\n" in title:
        errs.append("タイトルに改行")
    if len(title) > TITLE_MAX:
        errs.append(f"タイトルが{len(title)}文字（上限{TITLE_MAX}）")
    if not isinstance(name, str) or not name or not title.startswith(name):
        errs.append("タイトルが薬の名前で始まっていない")
    b = banned_in(title)
    if b:
        errs.append(f"タイトルに使えない言葉: {'・'.join(b)}")
    return errs


def check_description(desc: object, basis: object) -> list[str]:
    errs = []
    if not isinstance(desc, str):
        return ["説明文が文字列でない"]
    if "\n" in desc:
        errs.append("説明文に改行")
    if not (DESC_MIN <= len(desc) <= DESC_MAX):
        errs.append(f"説明文が{len(desc)}文字（{DESC_MIN}〜{DESC_MAX}）")
    b = banned_in(desc)
    if b:
        errs.append(f"説明文に使えない言葉: {'・'.join(b)}")
    basis = basis if isinstance(basis, str) else ""
    if DROWSY_YES in basis:
        if "含まれていません" in desc or "眠くならない" in desc or "眠くなりにくい" in desc:
            errs.append("元は『眠くなる成分を含む』なのに、説明文が眠くならないと読める")
    if DROWSY_NO in basis:
        if DROWSY_YES in desc or "運転はできません" in desc:
            errs.append("元は『眠くなる成分は含まれていません』なのに、説明文が眠くなると読める")
    return errs


def sagasu_keys(path: str = "lib/sagasu.ts") -> tuple[set[str], set[str]]:
    """lib/sagasu.ts の SYMPTOMS と CONDS のキーを読む"""
    src = open(path, encoding="utf-8").read()

    def keys(block_name: str) -> set[str]:
        m = re.search(rf"export const {block_name}[^=]*=\s*\{{(.*?)\n\}}", src, re.S)
        if not m:
            return set()
        body = m.group(1)
        return set(re.findall(r"^\s{2}'?([a-z][a-z-]*)'?\s*:", body, re.M))

    return keys("SYMPTOMS"), keys("CONDS")


def load(name: str):
    with open(os.path.join(AGENT_DIR, name), encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    errors: list[str] = []

    try:
        seo = load("seo-overrides.json")
        meds = seo.get("medicines")
        if not isinstance(meds, dict):
            errors.append("seo-overrides.json: medicines が辞書でない")
            meds = {}
        for slug, e in meds.items():
            if not SLUG_RE.match(slug):
                errors.append(f"seo-overrides.json: slug の形がおかしい {slug!r}")
            if not isinstance(e, dict):
                errors.append(f"seo-overrides.json: {slug} が辞書でない")
                continue
            if "title" in e:
                errors += [f"{slug}: {x}" for x in check_title(e.get("title"), e.get("name"))]
            if "description" in e:
                errors += [f"{slug}: {x}" for x in check_description(e.get("description"), e.get("basis"))]
    except Exception as ex:  # noqa: BLE001
        errors.append(f"seo-overrides.json が読めない: {ex}")

    try:
        fe = load("featured.json")
        lst = fe.get("medicines")
        if not isinstance(lst, list):
            errors.append("featured.json: medicines がリストでない")
        else:
            if len(lst) > FEATURED_MAX:
                errors.append(f"featured.json: {len(lst)}件（上限{FEATURED_MAX}）")
            for s in lst:
                if not isinstance(s, str) or not SLUG_RE.match(s):
                    errors.append(f"featured.json: slug の形がおかしい {s!r}")
    except Exception as ex:  # noqa: BLE001
        errors.append(f"featured.json が読めない: {ex}")

    try:
        sx = load("sagasu-extra.json")
        pages = sx.get("pages")
        syms, conds = sagasu_keys()
        if not syms or not conds:
            errors.append("lib/sagasu.ts から症状・条件のキーが読めない")
        if not isinstance(pages, list):
            errors.append("sagasu-extra.json: pages がリストでない")
        else:
            for p in pages:
                if not (isinstance(p, list) and len(p) == 2 and p[0] in syms and p[1] in conds):
                    errors.append(f"sagasu-extra.json: 使えない組 {p!r}")
    except Exception as ex:  # noqa: BLE001
        errors.append(f"sagasu-extra.json が読めない: {ex}")

    try:
        h = load("history.json")
        if not isinstance(h.get("runs"), list) or not isinstance(h.get("actions"), list):
            errors.append("history.json: runs / actions がリストでない")
    except Exception as ex:  # noqa: BLE001
        errors.append(f"history.json が読めない: {ex}")

    try:
        ex = load("experiments.json")
        lst = ex.get("experiments")
        if not isinstance(lst, list):
            errors.append("experiments.json: experiments がリストでない")
            lst = []
        ids = set()
        for e in lst:
            if not isinstance(e, dict):
                errors.append("experiments.json: 辞書でない行がある")
                continue
            eid = e.get("id")
            if not isinstance(eid, str) or not eid or eid in ids:
                errors.append(f"experiments.json: id が空か重複 {eid!r}")
            ids.add(eid)
            if e.get("status") not in EXP_STATUS:
                errors.append(f"experiments.json: {eid} の status が決まり外 {e.get('status')!r}")
            if e.get("kind") not in ("search", "channel"):
                errors.append(f"experiments.json: {eid} の kind が決まり外 {e.get('kind')!r}")
            t = e.get("targets")
            if not isinstance(t, list) or not t or not all(isinstance(x, str) and x for x in t):
                errors.append(f"experiments.json: {eid} の targets が空")
            elif e.get("kind") == "search" and not all(EXP_PATH_RE.match(x) for x in t):
                errors.append(f"experiments.json: {eid} の targets がパスの形でない {t!r}")
            if e.get("status") in ("running", "fix", "grow", "drop") and not DATE_RE.match(str(e.get("started") or "")):
                errors.append(f"experiments.json: {eid} は開始済みなのに started が日付でない")
    except FileNotFoundError:
        pass   # まだ無いのは構わない
    except Exception as ex_:  # noqa: BLE001
        errors.append(f"experiments.json が読めない: {ex_}")

    if errors:
        print("不合格:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("合格")
    return 0


if __name__ == "__main__":
    sys.exit(main())
