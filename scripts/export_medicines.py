#!/usr/bin/env python3
"""
Supabase の medicines テーブル → data/medicines.json の空欄を埋める。

モード（--mode）:
  overrides-only  Supabase に触らず、data/medicines-overrides.json の手直しだけ反映する
  preview         Supabase を読んで「何がどれだけ埋まるか」を報告するだけ。ファイルは書かない
  apply           空欄の穴埋め＋手直しを data/medicines.json に書く（毎週の自動実行もこれ）

守ること:
  - 入っている値は上書きしない（空欄だけ埋める）。例外は overrides の patch（手直しが最優先）と、下の「修理」
  - 修理（2026-11）: Supabase で source が pmda_refetch / pmda_mismatch になった薬は、成分ずれを
    pmda_backfill_v2.py --recheck で直したもの。ings・effect・risk・maker・source を Supabase の値で上書きし、
    成分から決まる drowsy・warnIngs・note・noteType・symptoms・cat も作り直す
  - JSON に無い薬（id）は追加しない。件数と例だけ報告する
  - 列名は大文字小文字と _ - の違いを無視して対応づける（risk_class と riskClass は同じ列）
  - 型が違う値（JSON は配列なのに Supabase は文字列、など）は埋めずに報告する
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = ROOT / "data" / "medicines.json"
OVERRIDES_PATH = ROOT / "data" / "medicines-overrides.json"
TABLE = "medicines"
ID_KEY = "id"
PAGE = 1000

lines: list[str] = []


def out(s: str = "") -> None:
    print(s)
    lines.append(s)


def flush_summary() -> None:
    p = os.environ.get("GITHUB_STEP_SUMMARY")
    if p:
        with open(p, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")


# ---------- 判定の小道具 ----------

def is_empty(v) -> bool:
    if v is None:
        return True
    if isinstance(v, str):
        return v.strip() == ""
    if isinstance(v, (list, dict)):
        return len(v) == 0
    return False


def norm_key(k: str) -> str:
    return k.replace("_", "").replace("-", "").lower()


def type_tag(v) -> str:
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, (int, float)):
        return "number"
    if isinstance(v, str):
        return "text"
    if isinstance(v, list):
        return "list"
    if isinstance(v, dict):
        return "object"
    return "other"


def short(v, n: int = 80) -> str:
    s = json.dumps(v, ensure_ascii=False)
    return s if len(s) <= n else s[: n - 1] + "…"


# ---------- 読み書き ----------

def load_medicines():
    raw = JSON_PATH.read_text(encoding="utf-8")
    data = json.loads(raw)
    if isinstance(data, list):
        return data, data, raw
    if isinstance(data, dict):
        for k in ("medicines", "items", "data"):
            if isinstance(data.get(k), list):
                return data, data[k], raw
        for v in data.values():
            if isinstance(v, list) and v and isinstance(v[0], dict):
                return data, v, raw
    sys.exit("medicines.json の形が想定外です（薬の一覧が見つかりません）")


def dump_like(root, raw: str) -> str:
    """元のファイルの書き方（インデント有無）に合わせて書き出す"""
    m = re.search(r"\n( +)\S", raw[:5000])
    if m:
        s = json.dumps(root, ensure_ascii=False, indent=len(m.group(1)))
    else:
        s = json.dumps(root, ensure_ascii=False, separators=(",", ":"))
    return s + ("\n" if raw.endswith("\n") else "")


def load_overrides() -> dict:
    if not OVERRIDES_PATH.exists():
        return {}
    return json.loads(OVERRIDES_PATH.read_text(encoding="utf-8"))


def fetch_supabase(test_json: str | None):
    if test_json:  # 手元での動作確認用
        return json.loads(Path(test_json).read_text(encoding="utf-8"))
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        out("❌ Supabase の URL か鍵が見つかりません。GitHub の Secrets に "
            "`SUPABASE_URL` と `SUPABASE_SERVICE_KEY` があるか確認してください。")
        flush_summary()
        sys.exit(1)
    rows, start = [], 0
    while True:
        req = urllib.request.Request(
            f"{url.rstrip('/')}/rest/v1/{TABLE}?select=*&order={ID_KEY}.asc",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Range-Unit": "items",
                "Range": f"{start}-{start + PAGE - 1}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                batch = json.loads(r.read())
        except urllib.error.HTTPError as e:
            out(f"❌ Supabase の読み込みに失敗しました（HTTP {e.code}）: {e.read()[:300]!r}")
            flush_summary()
            sys.exit(1)
        rows += batch
        if len(batch) < PAGE:
            break
        start += PAGE
    return rows


# ---------- 本体 ----------

def ingredient_keys(keys) -> list[str]:
    return [k for k in keys
            if norm_key(k) == "ings" or any(w in norm_key(k) for w in ("ingredient", "成分", "component"))]


def fill_from_supabase(meds: list[dict], sb_rows: list[dict], zero_empty: set[str]) -> dict:
    json_keys: list[str] = []
    for m in meds:
        for k in m:
            if k not in json_keys:
                json_keys.append(k)
    sb_keys: list[str] = []
    for r in sb_rows:
        for k in r:
            if k not in sb_keys:
                sb_keys.append(k)

    sb_by_norm: dict[str, str] = {}
    for k in sb_keys:
        sb_by_norm.setdefault(norm_key(k), k)
    keymap = {k: sb_by_norm[norm_key(k)] for k in json_keys
              if norm_key(k) in sb_by_norm and k != ID_KEY}

    # JSON 側で各列が普段どの型か（空でない値の多数決）
    expected: dict[str, str] = {}
    for k in json_keys:
        counts: dict[str, int] = {}
        for m in meds:
            v = m.get(k)
            if not is_empty(v):
                t = type_tag(v)
                counts[t] = counts.get(t, 0) + 1
        if counts:
            expected[k] = max(counts, key=counts.get)

    sb_by_id = {str(r.get(ID_KEY)): r for r in sb_rows}
    json_ids = {str(m.get(ID_KEY)) for m in meds}

    stats = {k: {"filled": 0, "mismatch": 0, "example": None, "mismatch_example": None} for k in keymap}
    touched_ids: set[str] = set()
    ing_keys = ingredient_keys(json_keys)
    ing_empty_before = {k: sum(1 for m in meds if is_empty(m.get(k))) for k in ing_keys}

    for m in meds:
        sid = str(m.get(ID_KEY))
        r = sb_by_id.get(sid)
        if not r:
            continue
        for jk, sk in keymap.items():
            cur = m.get(jk)
            empty_now = is_empty(cur) or (jk in zero_empty and cur == 0)
            if not empty_now:
                continue
            new = r.get(sk)
            if is_empty(new) or (jk in zero_empty and new == 0):
                continue
            want = expected.get(jk)
            if want and type_tag(new) != want:
                st = stats[jk]
                st["mismatch"] += 1
                st["mismatch_example"] = st["mismatch_example"] or (sid, want, type_tag(new), new)
                continue
            m[jk] = new
            st = stats[jk]
            st["filled"] += 1
            st["example"] = st["example"] or (sid, new)
            touched_ids.add(sid)

    ing_empty_after = {k: sum(1 for m in meds if is_empty(m.get(k))) for k in ing_keys}
    only_sb = [r for r in sb_rows if str(r.get(ID_KEY)) not in json_ids]

    return {
        "json_keys": json_keys, "sb_keys": sb_keys, "keymap": keymap,
        "unmatched_json": [k for k in json_keys if k not in keymap and k != ID_KEY],
        "unmatched_sb": [k for k in sb_keys if norm_key(k) not in {norm_key(j) for j in json_keys}],
        "stats": stats, "touched": len(touched_ids),
        "matched_ids": len(json_ids & set(sb_by_id)),
        "ing_keys": ing_keys, "ing_before": ing_empty_before, "ing_after": ing_empty_after,
        "only_sb": only_sb,
    }


REPAIR_SOURCES = {"pmda_refetch", "pmda_mismatch"}
REPAIR_FIELDS = ("ings", "effect", "risk", "maker", "source")


def _load_enrich_rules():
    """scraper/pmda_selenium.py と同じ判定（警告成分・眠気成分・分類・症状）を読み込む。
    selenium を import しないで済むよう、定数だけをソースから取り出す"""
    import ast
    src = (ROOT / "scraper" / "pmda_selenium.py").read_text(encoding="utf-8")
    want = {"WARN_CHECK", "DROWSY_CHECK", "CAT_MAP", "SYM_MAP"}
    found = {}
    for node in ast.parse(src).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            n = node.targets[0].id
            if n in want:
                found[n] = ast.literal_eval(node.value)
    return found


def _enrich(m: dict, rules: dict) -> None:
    ings = m.get("ings") or []
    effect = m.get("effect") or ""
    ing_str = " ".join(str(i) for i in ings)
    warn = [w for w in rules.get("WARN_CHECK", []) if w in ing_str]
    m["drowsy"] = any(k in ing_str for k in rules.get("DROWSY_CHECK", []))
    m["warnIngs"] = warn
    if effect or ings:
        text = f"{effect} {ing_str} {m.get('name', '')}"
        for cid, kws in rules.get("CAT_MAP", []):
            if any(k in text for k in kws):
                m["cat"] = cid
                break
    if "SYM_MAP" in rules:
        m["symptoms"] = [sym for sym, kws in rules["SYM_MAP"] if any(k in effect for k in kws)]
    notes = []
    for w in warn:
        if "アリルイソプロピルアセチル尿素" in w:
            notes.append("⚠ア尿素含有：2023年AU全面規制・2025年KR麻薬類指定。依存リスクあり。")
        elif "コデイン" in w or "ジヒドロコデイン" in w:
            notes.append("⚠コデイン系：12歳未満禁忌。依存リスクあり。")
        elif "ブロムワレリル" in w:
            notes.append("⚠ブロム尿素含有：依存性成分。連用注意。")
    notes = list(dict.fromkeys(notes))
    m["note"] = " ".join(notes)
    m["noteType"] = "danger" if any("禁忌" in n or "依存" in n for n in notes) else ("warn" if notes else "nn")


def repair_from_supabase(meds: list[dict], sb_rows: list[dict]) -> dict:
    """成分ずれを直した薬（source が pmda_refetch / pmda_mismatch）を Supabase の値で上書きする"""
    sb_by_id = {str(r.get(ID_KEY)): r for r in sb_rows if r.get("source") in REPAIR_SOURCES}
    rules = _load_enrich_rules() if sb_by_id else {}
    res = {"refetch": 0, "mismatch": 0, "examples": []}
    for m in meds:
        r = sb_by_id.get(str(m.get(ID_KEY)))
        if not r or m.get("source") == r.get("source"):
            continue  # 修理の対象外か、すでに反映済み
        before = list(m.get("ings") or [])[:2]
        for k in REPAIR_FIELDS:
            if k in r:
                m[k] = r[k] if r[k] is not None else ([] if k == "ings" else ("" if k in ("effect", "maker") else r[k]))
        if r.get("detail_url"):
            m["pmda_url"] = r["detail_url"]
        _enrich(m, rules)
        res["refetch" if r["source"] == "pmda_refetch" else "mismatch"] += 1
        if len(res["examples"]) < 5:
            res["examples"].append(f"{m.get('name', '')}：{', '.join(map(str, before))} → {', '.join(map(str, (m.get('ings') or [])[:2])) or '（空）'}")
    return res


def apply_overrides(meds: list[dict], ov: dict) -> tuple[int, int, int]:
    dels = {str(i) for i in ov.get("delete_ids", [])}
    before = len(meds)
    meds[:] = [m for m in meds if str(m.get(ID_KEY)) not in dels]
    removed = before - len(meds)
    patched = 0
    for sid, fields in (ov.get("patch") or {}).items():
        for m in meds:
            if str(m.get(ID_KEY)) == str(sid):
                m.update(fields)
                patched += 1
    existing = {str(m.get(ID_KEY)) for m in meds}
    added = 0
    for rec in ov.get("add") or []:
        if str(rec.get(ID_KEY)) not in existing:
            meds.append(rec)
            existing.add(str(rec.get(ID_KEY)))
            added += 1
    return removed, patched, added


def report_fill(res: dict, meds: list[dict]) -> None:
    out(f"- JSON の薬: {len(meds):,} 件 ／ Supabase と id が一致: {res['matched_ids']:,} 件")
    out(f"- 空欄が1つ以上埋まった薬: **{res['touched']:,} 件**")
    for k in res["ing_keys"]:
        b, a = res["ing_before"][k], res["ing_after"][k]
        out(f"- 成分の列 `{k}` が空の薬: {b:,} → **{a:,}** 件（{b - a:,} 件埋まる）")
    if not res["ing_keys"]:
        out("- ⚠️ 成分らしい列名が JSON に見つかりませんでした（下の列一覧を確認）")
    out("")
    out("### 列ごとの穴埋め")
    out("| JSON の列 | Supabase の列 | 埋めた | 型違いで見送り | 例 |")
    out("|---|---|---:|---:|---|")
    for jk, sk in res["keymap"].items():
        st = res["stats"][jk]
        ex = ""
        if st["example"]:
            ex = f"id {st['example'][0]}: {short(st['example'][1], 50)}"
        if st["mismatch_example"]:
            sid, want, got, v = st["mismatch_example"]
            ex += f"（型違い例 id {sid}: JSONは{want}、Supabaseは{got} {short(v, 40)}）"
        out(f"| `{jk}` | `{sk}` | {st['filled']:,} | {st['mismatch']:,} | {ex} |")
    out("")
    out(f"- JSON にあって Supabase に無い列: {', '.join(f'`{k}`' for k in res['unmatched_json']) or 'なし'}")
    out(f"- Supabase にあって JSON に無い列: {', '.join(f'`{k}`' for k in res['unmatched_sb']) or 'なし'}")
    only = res["only_sb"]
    out(f"- Supabase にだけある薬（今回は追加しない）: {len(only):,} 件")
    if only:
        name_k = next((k for k in only[0] if "name" in norm_key(k) or "名" in k), None)
        ex = [f"{r.get(ID_KEY)} {r.get(name_k, '')}" for r in only[:5]]
        out(f"  - 例: {' ／ '.join(ex)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["overrides-only", "preview", "apply"], default="preview")
    ap.add_argument("--supabase-json", help="（動作確認用）Supabase の代わりに読む JSON")
    args = ap.parse_args()

    root, meds, raw = load_medicines()
    ov = load_overrides()
    zero_empty = set(ov.get("treat_zero_as_empty") or [])

    out(f"## medicines.json 書き出し（mode: {args.mode}）")
    out("")

    if args.mode in ("preview", "apply"):
        sb = fetch_supabase(args.supabase_json)
        out(f"- Supabase `{TABLE}`: {len(sb):,} 行")
        rep = repair_from_supabase(meds, sb)
        if rep["refetch"] or rep["mismatch"]:
            out("### 成分ずれの修理（pmda_backfill_v2.py --recheck の結果）")
            out(f"- 正しい成分で上書き: **{rep['refetch']:,} 件** ／ 別の製品だったので空に: **{rep['mismatch']:,} 件**")
            for e in rep["examples"]:
                out(f"  - {e}")
            out("")
        res = fill_from_supabase(meds, sb, zero_empty)
        report_fill(res, meds)
        out("")

    if args.mode == "preview":
        out("👀 preview なのでファイルは書いていません。")
        flush_summary()
        return

    removed, patched, added = apply_overrides(meds, ov)
    out(f"### 手直し（medicines-overrides.json）")
    out(f"- 削除 {removed} 件 ／ 上書き {patched} 件 ／ 追加 {added} 件")

    new_raw = dump_like(root, raw)
    if new_raw == raw:
        out("")
        out("変更はありませんでした。")
    else:
        JSON_PATH.write_text(new_raw, encoding="utf-8")
        out("")
        out(f"✅ data/medicines.json を書き換えました（薬 {len(meds):,} 件）。")
    flush_summary()


if __name__ == "__main__":
    main()
