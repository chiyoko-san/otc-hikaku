#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pmda_monthly_v2.py -- PMDA月次自動更新（Supabase直接書き込み版）

v1 (pmda_monthly.py) からの変更点:

  1. data/medicines.json ではなく Supabase の medicines テーブルを直接読み書きする。
     JSONとDBの二重管理をやめ、巻き戻り事故の余地を無くす。

  2. カラム名を Supabase のスキーマ(snake_case)に合わせる。
     warnIngs → warn_ings / noteType → note_type
     Supabase に無いキー (seller / amazon_tag / price_updated_at / _at) は送らない。

  3. 一覧からしか取れない項目を保存する。
     seq / rev / name_norm / risk_label / detail_url / pdf_url / pmda_updated
     v1はこれらを落としていたため、後から詳細ページを引き直せなかった。

  4. 指定第2類を risk=2.5 として保存する（既存データの慣例に合わせる）。

  5. 申告件数の集計を軽量化した。
     v1は充足率を出すためだけに全ページを再ページングしていて、通信量が
     2倍になっていた。各リスク区分の1ページ目だけ見れば総件数は取れる。

  6. --dry-run を既定にした。--run を付けるまで書き込まない。

使い方:
    python scraper/pmda_monthly_v2.py                    # 差分を見るだけ
    python scraper/pmda_monthly_v2.py --run              # 実際に追加する
    python scraper/pmda_monthly_v2.py --run --limit-new 30

必要な環境変数:
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_KEY
"""

import argparse
import datetime
import json
import os
import re
import sys
import time
import unicodedata

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 一覧クローラ
from pmda_v4 import PMDA, RISKS, norm_name

# 詳細ページの取得とパース、カテゴリ判定。v1の実績あるロジックをそのまま使う。
from pmda_monthly import (
    fetch, parse, decide, is_external, split_makers,
    SYM_MAP, WARN_CHECK, DROWSY_ING, DROWSY_TEXT,
)

SUPABASE_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or ""
TABLE = "medicines"

UPDATES_DIR = "data/updates"
UA = ("Mozilla/5.0 (compatible; kusuri-compass-bot/1.0; "
      "+https://kusuri-compass.com)")

PAGE = 1000            # Supabaseから1回に読む件数
INSERT_BATCH = 100     # 1回のINSERTに含める件数
COVERAGE_MIN = 0.985   # 充足率がこれ未満なら中止

# リスク区分の数値表現。指定第2類は既存データに合わせて 2.5 とする。
RISK_NUM = {
    "要指導医薬品": 0,
    "第1類医薬品": 1,
    "第「2」類医薬品": 2.5,
    "第2類医薬品": 2,
    "第3類医薬品": 3,
    "リスク区分なし": None,
    "リスク区分未確認": None,
}


def risk_to_num(label):
    if not label:
        return None
    key = unicodedata.normalize("NFKC", label).strip()
    return RISK_NUM.get(key)


# ------------------------------------------------------------ Supabase I/O
# HTTPの薄いラッパーなので pmda_backfill.py と一部重複する。
# GitHubのブラウザUIだけで運用する前提のため、ファイル単体で完結させている。

def sb_headers(extra=None):
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def sb_select_all(cols):
    rows, offset = [], 0
    while True:
        url = (f"{SUPABASE_URL}/rest/v1/{TABLE}"
               f"?select={cols}&order=id.asc&limit={PAGE}&offset={offset}")
        r = requests.get(url, headers=sb_headers(), timeout=60)
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        rows.extend(batch)
        offset += PAGE
        if len(batch) < PAGE:
            break
    return rows


def sb_insert(records):
    url = f"{SUPABASE_URL}/rest/v1/{TABLE}"
    h = sb_headers({"Prefer": "return=minimal"})
    r = requests.post(url, headers=h,
                      data=json.dumps(records, ensure_ascii=False).encode("utf-8"),
                      timeout=90)
    if r.status_code >= 300:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")


# ------------------------------------------------------------ record build

def build_row(next_id, item, html):
    """一覧の1品目 + 詳細HTML から medicines テーブル1行を作る。"""

    pdfs = item.get("pdf_current") or item.get("pdfs") or []

    row = {
        "id":           next_id,
        "cat":          None,
        "itype":        "otc",
        "name":         item["name"],
        "name_norm":    item.get("name_norm") or norm_name(item["name"]),
        "maker":        None,
        "price":        None,
        "risk":         risk_to_num(item.get("risk")),
        "risk_label":   (item.get("risk") or "").strip() or None,
        "drowsy":       False,
        "symptoms":     [],
        "effect":       None,
        "ings":         [],
        "warn_ings":    [],
        "note":         "",
        "note_type":    "nn",
        "asin":         "",
        "rakuten_url":  "",
        "pmda_id":      item["pmda_id"],
        "seq":          item.get("seq"),
        "rev":          item.get("rev"),
        "detail_url":   item.get("detail_url"),
        "pdf_url":      pdfs[0] if pdfs else None,
        "pmda_updated": item.get("updated"),
        "source":       "pmda_monthly_v2",
        "status":       "active",
    }

    # 一覧側で製造販売元が取れていれば先に入れておく
    maker_from_list, _ = split_makers(item.get("maker"))
    if maker_from_list:
        row["maker"] = maker_from_list

    if not html:
        return row

    d, ings = parse(html)

    effect = (d.get("効能・効果") or "").replace("\n", "")[:400] or None
    caution = d.get("使用上の注意") or ""
    yakko = d.get("薬効分類")
    form = d.get("剤形")
    ing_str = " ".join(ings)

    ext = is_external(yakko, form)
    drowsy_text = bool(DROWSY_TEXT.search(caution))

    warn_ings = [w for w in WARN_CHECK if w in ing_str]

    # 注意文は dict.fromkeys で重複を潰す。
    # 同じ警告が複数回並ぶ不具合はここが原因だった。
    notes = []
    for w in warn_ings:
        if "アリルイソプロピルアセチル尿素" in w:
            notes.append("⚠ア尿素含有：2023年AU全面規制・2025年KR麻薬類指定。依存リスクあり。")
        elif "コデイン" in w:
            notes.append("⚠コデイン系：12歳未満禁忌。依存リスクあり。")
        elif "ブロム" in w or "ブロモ" in w:
            notes.append("⚠ブロム尿素含有：依存性成分。連用注意。")
    note = " ".join(dict.fromkeys(notes))

    cat, _ = decide(yakko, effect, item["name"])

    row.update({
        "ings":      ings[:30],
        "effect":    effect,
        "symptoms":  [s for s, kws in SYM_MAP
                      if any(k in (effect or "") for k in kws)],
        "warn_ings": warn_ings,
        "drowsy":    drowsy_text if ext else (
                        drowsy_text or any(k in ing_str for k in DROWSY_ING)),
        "note":      note,
        "note_type": "danger" if note else "nn",
        # 判定できなかった場合、誤った値を入れるより未分類のままにする
        "cat":       cat or None,
    })

    if not row["maker"]:
        raw = d.get("製造販売会社")
        if raw:
            m, _ = split_makers(raw)
            row["maker"] = m

    return row


# ------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true",
                    help="実際にSupabaseへ書き込む。指定しなければ差分表示のみ")
    ap.add_argument("--limit-new", type=int, default=500,
                    help="1回の実行で詳細取得する新規品目の上限")
    args = ap.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        sys.exit("環境変数 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY "
                 "が設定されていません。")

    stamp = datetime.datetime.now().strftime("%Y-%m")
    os.makedirs(UPDATES_DIR, exist_ok=True)

    # ---------- 1. 全件クロール ----------
    print("=" * 66)
    print("STEP 1/4  PMDA全件クロール")
    print("=" * 66)
    api = PMDA()
    t0 = time.time()

    items = {}
    for code, name in RISKS.items():
        print(f"--- {name} ---")
        items.update(api.harvest({"cboRisk": code}))

    # 申告件数は各区分の1ページ目だけで分かる。
    # v1はここで全ページを再取得していたが、その必要はない。
    declared = 0
    for code in RISKS:
        total, _, _ = api.parse(api.get({"cboRisk": code}, 1))
        declared += total

    coverage = len(items) / max(declared, 1)
    print(f"\n取得 {len(items):,} / 申告 {declared:,}  充足率 {coverage*100:.1f}%")
    print(f"通信 {api.n:,}回 / {(time.time()-t0)/60:.1f}分")
    if api.warnings:
        print("\n★ クロール警告")
        for w in api.warnings[:10]:
            print("   " + w)

    # ---------- 2. 安全装置 ----------
    if coverage < COVERAGE_MIN:
        print(f"\n★★ 充足率が {COVERAGE_MIN*100:.1f}% を下回りました。")
        print("★★ PMDAの仕様変更かクロール不良の可能性があるため中止します。")
        sys.exit(2)

    # ---------- 3. Supabaseとの差分 ----------
    print("\n" + "=" * 66)
    print("STEP 2/4  Supabase との差分")
    print("=" * 66)

    existing = sb_select_all("id,pmda_id,name_norm")
    have_ids = {m["pmda_id"] for m in existing if m.get("pmda_id")}
    have_names = {m["name_norm"] for m in existing if m.get("name_norm")}
    max_id = max([m.get("id") or 0 for m in existing] + [0])
    print(f"DB既存: {len(existing):,}件")

    crawl_ids = {it["pmda_id"] for it in items.values()}
    new_items = [it for it in items.values()
                 if it["pmda_id"] not in have_ids
                 and it["name_norm"] not in have_names]
    gone = sorted(have_ids - crawl_ids)
    print(f"新規: {len(new_items):,}件 / 販売終了の疑い: {len(gone):,}件")

    if not args.run:
        print("\n--- 差分表示のみ（--run を付けると書き込みます） ---")
        for it in sorted(new_items, key=lambda x: x["key"])[:30]:
            print(f"  [{it['pmda_id']}] {it['name'][:34]:<36} {it.get('risk','')}")
        if len(new_items) > 30:
            print(f"  ... 他 {len(new_items)-30:,}件")
        return

    # ---------- 4. 新規品目の詳細取得と挿入 ----------
    added, buf = [], []
    if new_items:
        n_target = min(len(new_items), args.limit_new)
        print("\n" + "=" * 66)
        print(f"STEP 3/4  新規 {n_target}件の詳細取得と挿入")
        print("=" * 66)

        s = requests.Session()
        s.headers.update({"User-Agent": UA, "Accept-Language": "ja"})
        next_id = max_id + 1

        for i, it in enumerate(sorted(new_items, key=lambda x: x["key"])
                               [:args.limit_new], 1):
            html, _, why = fetch(it["pmda_id"], it["rev"], it["seq"], s)
            row = build_row(next_id, it, html)
            buf.append(row)
            added.append(row)
            next_id += 1

            mark = f"成分{len(row['ings'])}件" if html else f"詳細なし({why})"
            print(f"  [{i}/{n_target}] {it['name'][:26]:<28} {mark}")

            if len(buf) >= INSERT_BATCH:
                sb_insert(buf)
                print(f"    → {len(buf)}件をDBに挿入")
                buf = []

        if buf:
            sb_insert(buf)
            print(f"    → {len(buf)}件をDBに挿入")
    else:
        print("\n新規品目はありません。")

    # ---------- 5. レポート ----------
    print("\n" + "=" * 66)
    print("STEP 4/4  レポート")
    print("=" * 66)

    if added:
        with open(f"{UPDATES_DIR}/{stamp}.json", "w", encoding="utf-8") as f:
            json.dump([{k: r[k] for k in
                        ("id", "name", "maker", "cat", "risk", "pmda_id")}
                       for r in added], f, ensure_ascii=False, indent=1)

    with open(f"{UPDATES_DIR}/{stamp}.md", "w", encoding="utf-8") as f:
        f.write(f"# PMDA月次更新レポート {stamp}\n\n")
        f.write(f"- 実行日時: {datetime.datetime.now().isoformat()}\n")
        f.write(f"- PMDA取得: {len(items):,}件 / 申告 {declared:,}件"
                f"（充足率 {coverage*100:.1f}%）\n")
        f.write(f"- DB既存: {len(existing):,}件\n")
        f.write(f"- 新規追加: {len(added):,}件\n")
        f.write(f"- 販売終了の疑い: {len(gone):,}件（削除はしていません）\n\n")
        if added:
            n_ing = sum(1 for r in added if r["ings"])
            n_cat = sum(1 for r in added if r["cat"])
            f.write(f"- うち成分取得済: {n_ing:,}件 / カテゴリ判定済: {n_cat:,}件\n\n")
            f.write("## 追加された品目\n\n")
            for r in added:
                f.write(f"- {r['name']}（{r['maker'] or '?'} / "
                        f"{r['cat'] or '未分類'}）\n")
        if gone:
            f.write("\n## 販売終了の疑い（PMDAから消えた品目ID）\n\n")
            for pid in gone[:100]:
                f.write(f"- {pid}\n")
            if len(gone) > 100:
                f.write(f"- ...他 {len(gone)-100}件\n")

    print(f"レポート: {UPDATES_DIR}/{stamp}.md")
    print(f"\n完了。新規 {len(added):,}件を追加しました。")


if __name__ == "__main__":
    main()
