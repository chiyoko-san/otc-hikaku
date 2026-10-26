#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
draft_switch_text.py — 切替ページ（生成薬）の「処方薬との違い」文章を、添付文書を根拠にAIが下書きする

流れ（週1回、.github/workflows/switch-text.yml）:
  1. data/switch-drugs.json の薬のうち data/switch-text.json に文章が無いものを、index=true → 順位 の順に N 件選ぶ
  2. 薬ごとに Claude（web検索ツール付き）へ依頼: PMDA の添付文書を探して読み、
       same    処方薬と「同じ」点（成分・1回の量・用法）
       differs 「違う」点（対象年齢・使える症状の範囲）
       caution 切り替えるときの注意
       sources 根拠にした添付文書のURL（pmda.go.jp か製薬会社）
     を JSON で返させる。数字は添付文書に書いてあるものだけ。資格・監修を名乗らない。切替を勧めない。
  3. data/switch-text.json の _entries に書き足す（approved は空。マージ＝承認）
  4. ワークフローが PR を作り、本人が Vercel Preview で読んでマージする

使い方:
  python scripts/draft_switch_text.py --limit 20            # 20薬ぶん下書き
  python scripts/draft_switch_text.py --slugs mukosuta,mejikon
  python scripts/draft_switch_text.py --dry-run             # 対象を表示するだけ（APIを呼ばない）

環境変数: ANTHROPIC_API_KEY
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DRUGS_JSON = ROOT / "data" / "switch-drugs.json"
TEXT_JSON = ROOT / "data" / "switch-text.json"
MED_JSON = ROOT / "data" / "medicines.json"
JST = timezone(timedelta(hours=9))
MODEL = os.environ.get("SWITCH_TEXT_MODEL", "claude-sonnet-4-6")

SYSTEM = """あなたは、PMDA（医薬品医療機器総合機構）の添付文書と厚生労働省の公開資料を読んで書く医療ライターです（薬剤師・医師ではありません）。
患者向けの比較サイトに載せる、処方薬と「同じ成分の市販薬」の違いの説明文を作ります。

必ず守ること:
- 根拠は添付文書（pmda.go.jp か製薬会社の公式サイト）だけ。web検索で該当する添付文書を開いて確認してから書く
- 文中の数字（mg・回数・年齢・日数・%）は、添付文書に書いてあるものだけを使う。確認できない数字は書かない
- 薬剤師・医師などの資格や「監修」を名乗らない。「〜と言われています」のような伝聞で逃げない
- 処方薬から市販薬への切替を勧めない。判断材料を並べ、「医師・薬剤師に相談」で締める
- 市販薬の値段は書かない（販売店で違う）
- 処方薬の適応・用量は、その薬の飲み薬（錠剤・カプセル・シロップ）または塗り薬の添付文書を根拠にする。注射剤だけにある適応（例: 巨赤芽球性貧血）は書かない
- 括弧は全角（）を使う
- 高齢者にも読める平易な日本語。1文は60字以内。専門用語には短い説明を添える
- 出力は JSON だけ。前置き・コードフェンス・説明文は書かない"""


def clean(s) -> str:
    """本文の整形。文字正規化（NFKC）はしない（全角括弧・全角記号をそのまま残すため）。括弧だけ全角に揃える"""
    if s is None:
        return ""
    t = str(s).strip().replace("(", "（").replace(")", "）")
    return t


def load():
    drugs = json.loads(DRUGS_JSON.read_text(encoding="utf-8"))["drugs"]
    text = json.loads(TEXT_JSON.read_text(encoding="utf-8"))
    text.setdefault("_entries", {})
    meds = {m["id"]: m for m in json.loads(MED_JSON.read_text(encoding="utf-8"))["medicines"]}
    return drugs, text, meds


def pick(drugs, text, limit, slugs=None):
    if slugs:
        want = set(slugs)
        return [d for d in drugs if d["slug"] in want]
    todo = [d for d in drugs if d["slug"] not in text["_entries"]]
    todo.sort(key=lambda d: (0 if d.get("index") else 1, d.get("rank", 9999)))
    return todo[:limit]


def build_prompt(d, meds) -> str:
    single = [meds[i] for i in d.get("otcSingleIds", []) if i in meds][:6]
    combo = [meds[i] for i in d.get("otcComboIds", []) if i in meds][:4]
    rx = d.get("rxItems", [])[:4]
    lines = [
        f"処方薬: {d['rxName']}（有効成分 {d['genericName']}、薬効分類 {d['categoryLabel']}）",
        "処方薬の代表的な製品: " + "、".join(f"{i['name']}（{i['spec']}）" for i in rx),
    ]
    if single:
        lines.append("同じ成分だけでできた市販薬: " + "、".join(f"{m['name']}（{m.get('maker','')}、成分 {'・'.join(m.get('ings') or [])}）" for m in single))
    if combo:
        lines.append("同じ成分にほかの成分が加わった市販薬: " + "、".join(f"{m['name']}（{m.get('maker','')}）" for m in combo))
    if not single and not combo:
        lines.append("同じ成分の市販薬: ありません（PMDAの承認情報で確認済み）")
    if d.get("otcSimilarNo"):
        lines.append("2027年3月からの上乗せ料金（OTC類似薬の特別の料金）: 対象（厚労省案）")
    else:
        lines.append("2027年3月からの上乗せ料金: 対象外（厚労省案）")
    lines.append("""
次の JSON を返してください（キーは英語、値は日本語）:
{
  "same": "処方薬と市販薬で同じ点。有効成分、1回の量、1日の回数など。市販薬が無い薬では「〜を含む市販薬は販売されていません」と1文で書く（120字以内）",
  "differs": "違う点。市販薬の対象年齢、使える症状の範囲、処方薬だけにある適応、1日の上限など。市販薬が無い薬では、同じ用途の市販薬が別成分であること、受診の目安を書く（200字以内）",
  "caution": "切り替える・買うときの注意。併用してはいけない薬、続けて使える日数、受診すべきサイン（150字以内）",
  "sources": ["根拠にした添付文書のURL（pmda.go.jp を優先）を2件以上"]
}""")
    return "\n".join(lines)


def call_claude(prompt: str) -> dict | None:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        sys.exit("ERROR: ANTHROPIC_API_KEY がありません")
    body = {
        "model": MODEL,
        "max_tokens": 2000,
        "system": SYSTEM,
        "tools": [{"type": "web_search_20250305", "name": "web_search", "max_uses": 6}],
        "messages": [{"role": "user", "content": prompt}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode("utf-8"),
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        method="POST",
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                resp = json.loads(r.read().decode("utf-8"))
            text = "".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text").strip()
            m = re.search(r"\{.*\}", text, re.S)
            if not m:
                print(f"[draft]   JSONが見つからない: {text[:120]}", file=sys.stderr)
                return None
            return json.loads(m.group())
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "ignore")[:200]
            print(f"[draft]   HTTP {e.code}: {msg}", file=sys.stderr)
            if e.code in (429, 500, 502, 503, 529) and attempt < 2:
                time.sleep(20 * (attempt + 1))
                continue
            return None
        except (json.JSONDecodeError, urllib.error.URLError) as e:
            print(f"[draft]   失敗: {e}", file=sys.stderr)
            return None
    return None


CREDENTIAL = re.compile(r"監修|薬剤師が(解説|教える|選ぶ|答える)|医師が(解説|教える)|薬剤師(です|として|の私)|医師(です|として|の私)")


def validate(entry: dict) -> list[str]:
    ng = []
    for k in ("same", "differs", "caution"):
        v = entry.get(k)
        if not isinstance(v, str) or not v.strip():
            ng.append(f"{k} が空")
        elif CREDENTIAL.search(v):
            ng.append(f"{k} に資格・監修を名乗る表現")
        elif len(v) > 320:
            ng.append(f"{k} が長すぎる（{len(v)}字）")
    srcs = entry.get("sources")
    if not isinstance(srcs, list) or not srcs:
        ng.append("sources が無い")
    else:
        bad = [u for u in srcs if not re.match(r"^https?://", str(u))]
        if bad:
            ng.append(f"sources にURLでないものがある: {bad[:2]}")
    return ng


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--slugs", default="")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    drugs, text, meds = load()
    targets = pick(drugs, text, a.limit, [s.strip() for s in a.slugs.split(",") if s.strip()] or None)
    print(f"[draft] 対象 {len(targets)}薬: " + ", ".join(d["slug"] for d in targets))
    if a.dry_run:
        return 0

    today = datetime.now(JST).strftime("%Y-%m-%d")
    ok, skipped = [], []
    for d in targets:
        print(f"[draft] {d['rxName']} (/switch/{d['slug']}/) ...")
        out = call_claude(build_prompt(d, meds))
        if not out:
            skipped.append((d["slug"], "応答なし"))
            continue
        entry = {
            "same": clean(out.get("same", "")),
            "differs": clean(out.get("differs", "")),
            "caution": clean(out.get("caution", "")),
            "sources": [str(u) for u in (out.get("sources") or []) if u][:5],
            "drafted": today,
            "approved": None,
        }
        problems = validate(entry)
        if problems:
            skipped.append((d["slug"], "；".join(problems)))
            print(f"[draft]   見送り: {problems}", file=sys.stderr)
            continue
        text["_entries"][d["slug"]] = entry
        ok.append(d["slug"])
        time.sleep(2)

    TEXT_JSON.write_text(json.dumps(text, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    summary = [f"- 下書き: {len(ok)}薬 " + ", ".join(ok), f"- 見送り: {len(skipped)}薬 " + "; ".join(f"{s}（{why}）" for s, why in skipped)]
    print("\n".join(summary))
    (ROOT / "draft_summary.md").write_text("\n".join(summary) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
