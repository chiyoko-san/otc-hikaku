#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pmda_backfill.py -- PMDA 詳細ページから ings / effect を埋める

設計:
  ・進捗はDB自体が持つ（ings が空のレコードを N 件取る）
    → 何回流しても冪等。途中で落ちても次回が自然に続きから始まる
  ・既存の値は絶対に上書きしない。空のフィールドにだけ書く
  ・連続失敗が閾値を超えたら即座に停止（ブロック時に空書き込みを防ぐ）
  ・--sample は書き込み一切なし。--run で初めて書く

使い方:
    python pmda_backfill.py --sample 20          # 読むだけ
    python pmda_backfill.py --run --limit 500    # 書き込み
"""

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

SCRIPT_VERSION = "pmda_backfill_v1"

UA = ("Mozilla/5.0 (compatible; kusuri-compass-bot/1.0; "
      "+https://kusuri-compass.com)")
SLEEP = 1.5
RETRY = 3
TIMEOUT = 40
EMPTY_THRESHOLD = 100        # これ未満のバイト数は空応答とみなす
MAX_CONSECUTIVE_FAIL = 5     # 連続失敗がこれに達したら中断

RE_DETAIL = re.compile(r"/ogo/([A-Z]\d{10})_(\d+)_(\d+)\s*$")

# 成分行から除外するラベル
SKIP_ING_LABELS = {"添加物", "成分", "分量", "内訳", "成分分量", ""}


# ------------------------------------------------------------------ 整形

def clean(s):
    if s is None:
        return ""
    s = s.replace("\u3000", " ")
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def to_half_paren(s):
    return s.replace("（", "(").replace("）", ")")


def format_ingredient(name, amount):
    """
    既存669件の形式に合わせる: 'イブプロフェン(450mg)'

    注意: 成分名自体が括弧を含むことがある（例: アミノエチルスルホン酸(タウリン)）。
    そのまま連結すると page.tsx の amountOf() が最初の括弧を分量と誤認するため、
    成分名側の括弧は角括弧に置き換える。丸括弧は分量専用にする。
    """
    name = clean(name)
    for a, b in (("（", "［"), ("）", "］"), ("(", "［"), (")", "］")):
        name = name.replace(a, b)
    amount = to_half_paren(clean(amount))
    if not name:
        return None
    if not amount:
        return name          # 分量なしは成分名のみ（page.tsx 側で「配合」と表示される）
    return f"{name}({amount})"


# ------------------------------------------------------------------ 解析

def build_label_map(soup):
    """2セル以上の行を『1セル目=ラベル, 2セル目=値』として辞書化"""
    out = {}
    for row in soup.find_all("tr"):
        tds = row.find_all("td")
        if len(tds) < 2:
            continue
        label = clean(tds[0].get_text(" ", strip=True))
        value = clean(tds[1].get_text(" ", strip=True))
        if label and label not in out:
            out[label] = value
    return out


def find_ingredient_table(soup):
    """ヘッダーが『成分』『分量』で始まるテーブルを返す"""
    for table in soup.find_all("table"):
        first = table.find("tr")
        if not first:
            continue
        ths = [clean(c.get_text(" ", strip=True)) for c in first.find_all("th")]
        if len(ths) >= 2 and ths[0] == "成分" and ths[1] == "分量":
            return table
    return None


def parse_ingredients(soup):
    table = find_ingredient_table(soup)
    if table is None:
        return []
    out = []
    for row in table.find_all("tr"):
        tds = row.find_all("td")
        if not tds:
            continue
        name = clean(tds[0].get_text(" ", strip=True))
        if name in SKIP_ING_LABELS:
            continue
        amount = clean(tds[1].get_text(" ", strip=True)) if len(tds) > 1 else ""
        item = format_ingredient(name, amount)
        if item and item not in out:
            out.append(item)
    return out


RISK_MAP = {
    "第１類医薬品": 1, "第1類医薬品": 1,
    "第２類医薬品": 2, "第2類医薬品": 2,
    "第「２」類医薬品": 2.5, "第「2」類医薬品": 2.5, "指定第２類医薬品": 2.5,
    "第３類医薬品": 3, "第3類医薬品": 3,
}


def parse_detail(html):
    soup = BeautifulSoup(html, "lxml")
    lm = build_label_map(soup)

    risk_label = clean(lm.get("リスク区分等", ""))
    risk = RISK_MAP.get(risk_label.replace(" ", ""))

    return {
        "ings": parse_ingredients(soup),
        "effect": clean(lm.get("効能・効果", "")),
        "maker": clean(lm.get("製造販売会社", "")),
        "risk_label": risk_label,
        "risk": risk,
        "name": clean(lm.get("製品名", "")),
    }


# ------------------------------------------------------------------ 取得

class Fetcher:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers.update({
            "User-Agent": UA,
            "Accept-Language": "ja,en;q=0.8",
        })
        self.requests_made = 0

    def get_html(self, url):
        """本文が取れたら文字列、空応答なら None"""
        for attempt in range(RETRY):
            try:
                r = self.s.get(url, timeout=TIMEOUT, allow_redirects=True)
                self.requests_made += 1
                time.sleep(SLEEP)
                if r.status_code != 200:
                    return None
                if len(r.content) < EMPTY_THRESHOLD:
                    return None
                return r.content.decode("euc-jp", errors="replace")
            except Exception as e:
                print(f"    retry {attempt+1}/{RETRY}: {e}", file=sys.stderr)
                time.sleep(SLEEP * (attempt + 2) * 2)
        return None

    def fetch_with_rev_fallback(self, detail_url):
        """
        rev がずれて空応答になるレコードがあるため、前後の rev を試す。
        戻り値 (html, 実際に成功したURL)
        """
        html = self.get_html(detail_url)
        if html:
            return html, detail_url

        m = RE_DETAIL.search(detail_url)
        if not m:
            return None, None
        pid, rev, seq = m.group(1), int(m.group(2)), m.group(3)

        for cand in (rev + 1, rev + 2, rev - 1, rev + 3, rev - 2):
            if cand < 1 or cand > 99:
                continue
            alt = f"https://www.info.pmda.go.jp/ogo/{pid}_{cand:02d}_{seq}"
            html = self.get_html(alt)
            if html:
                return html, alt
        return None, None


# ------------------------------------------------------------------ Supabase

class Supa:
    def __init__(self):
        self.url = (os.environ.get("SUPABASE_URL")
                    or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")).rstrip("/")
        self.key = os.environ.get("SUPABASE_SERVICE_KEY", "")
        if not self.url or not self.key:
            sys.exit("ERROR: SUPABASE_URL と SUPABASE_SERVICE_KEY が必要です")
        self.h = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }

    def fetch_targets(self, limit):
        """ings が空で detail_url を持つレコードを取得"""
        params = {
            "select": "id,name,detail_url,rev,effect,maker,risk,risk_label",
            "ings": "eq.[]",
            "detail_url": "not.is.null",
            "order": "id.asc",
            "limit": str(limit),
        }
        r = requests.get(f"{self.url}/rest/v1/medicines",
                         headers=self.h, params=params, timeout=60)
        r.raise_for_status()
        return r.json()

    def patch(self, row_id, payload):
        r = requests.patch(
            f"{self.url}/rest/v1/medicines?id=eq.{row_id}",
            headers={**self.h, "Prefer": "return=minimal"},
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            timeout=60,
        )
        if r.status_code not in (200, 204):
            raise RuntimeError(f"PATCH {row_id} 失敗 {r.status_code}: {r.text[:200]}")


def build_payload(row, parsed, actual_url):
    """空のフィールドにだけ書く。既存の値は絶対に触らない"""
    p = {}

    if parsed["ings"]:
        p["ings"] = parsed["ings"]

    if parsed["effect"] and not clean(row.get("effect")):
        p["effect"] = parsed["effect"]

    if parsed["maker"] and not clean(row.get("maker")):
        p["maker"] = parsed["maker"]

    if parsed["risk_label"] and not clean(row.get("risk_label")):
        p["risk_label"] = parsed["risk_label"]

    if parsed["risk"] is not None and row.get("risk") in (None, 0):
        p["risk"] = parsed["risk"]

    # rev フォールバックで別URLが当たった場合は保存し直す
    if actual_url and actual_url != row.get("detail_url"):
        m = RE_DETAIL.search(actual_url)
        if m:
            p["detail_url"] = actual_url
            p["rev"] = m.group(2)

    return p


# ------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, metavar="N",
                    help="N件を取得して結果を表示するだけ（書き込みなし）")
    ap.add_argument("--run", action="store_true", help="実際に書き込む")
    ap.add_argument("--limit", type=int, default=500, help="--run 時の処理件数")
    args = ap.parse_args()

    if not args.sample and not args.run:
        sys.exit("--sample N か --run のどちらかを指定してください")

    limit = args.sample if args.sample else args.limit
    write = bool(args.run)

    supa = Supa()
    fet = Fetcher()

    rows = supa.fetch_targets(limit)
    print(f"[{SCRIPT_VERSION}] 対象 {len(rows)} 件 / "
          f"モード: {'書き込み' if write else 'サンプル（読み取りのみ）'}\n")

    if not rows:
        print("対象が0件でした。フィルタ条件を確認してください。")
        return

    ok = skipped = failed = 0
    consecutive_fail = 0
    lines = []

    for i, row in enumerate(rows, 1):
        name = row.get("name") or f"id={row['id']}"
        html, actual = fet.fetch_with_rev_fallback(row["detail_url"])

        if not html:
            failed += 1
            consecutive_fail += 1
            print(f"[{i}/{len(rows)}] × {name} — 取得失敗")
            if consecutive_fail >= MAX_CONSECUTIVE_FAIL:
                print(f"\n!! {MAX_CONSECUTIVE_FAIL}件連続で失敗したため中断します。"
                      f"ブロックされている可能性があります。")
                break
            continue

        consecutive_fail = 0
        parsed = parse_detail(html)

        if not parsed["ings"] and not parsed["effect"]:
            skipped += 1
            print(f"[{i}/{len(rows)}] △ {name} — 成分・効能とも取得できず")
            continue

        payload = build_payload(row, parsed, actual)
        if not payload:
            skipped += 1
            print(f"[{i}/{len(rows)}] △ {name} — 書き込む項目なし")
            continue

        mark = "→" if actual == row["detail_url"] else "→(rev修正)"
        print(f"[{i}/{len(rows)}] ○ {name} {mark} "
              f"成分{len(parsed['ings'])}件 / 効能{len(parsed['effect'])}字")

        if len(lines) < 10:
            lines.append(
                f"- **{name}** — 成分: `{', '.join(parsed['ings'][:4])}"
                f"{'...' if len(parsed['ings']) > 4 else ''}` / "
                f"効能: {parsed['effect'][:60]}")

        if write:
            try:
                supa.patch(row["id"], payload)
                ok += 1
            except Exception as e:
                failed += 1
                print(f"    書き込み失敗: {e}", file=sys.stderr)
        else:
            ok += 1

    print("\n" + "=" * 60)
    print(f"成功 {ok} / スキップ {skipped} / 失敗 {failed}")
    print(f"リクエスト {fet.requests_made} 回")
    print("=" * 60)

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"## PMDA バックフィル "
                    f"({'書き込み' if write else 'サンプル'})\n\n")
            f.write(f"- 対象: {len(rows)} 件\n")
            f.write(f"- 成功: **{ok}** / スキップ: {skipped} / 失敗: {failed}\n")
            f.write(f"- リクエスト: {fet.requests_made} 回\n\n")
            if lines:
                f.write("### 取得例\n\n" + "\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
