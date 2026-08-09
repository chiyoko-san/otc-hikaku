#!/usr/bin/env python3
"""
quasi_scraper.py — 医薬部外品・指定医薬部外品のメーカーサイト巡回スクレイパー

前提:
  医薬部外品にはPMDAのような横断DBが存在しないため、メーカー公式の
  製品ページを1件ずつ取得して「効能」「有効成分(分量)」を抽出する。
  取得結果は quasi_scraped.csv に出力され、人手レビュー後に
  import_quasi.py で medicines.json に取り込む(直接は書き込まない)。
  医薬品情報サイトとして、機械抽出→人手確認の2段構えを必須とする。

使い方:
  1. quasi_sources.csv に製品ページURLを追記
       url,maker,itype,cat
       https://www.catalog-taisho.com/category/01/001/00347/,大正製薬,designated_quasi,vitamin
  2. 収集:   python scraper/quasi_scraper.py
  3. 一覧ページからURLを自動発見して sources に追記:
       python scraper/quasi_scraper.py --discover <一覧URL> --pattern "/category/01/" \
           --maker 大正製薬 --itype designated_quasi --cat vitamin
  4. レビュー後: quasi_scraped.csv の行を quasi_products.csv に移して
       python scraper/import_quasi.py --write

注意:
  - 各サイトの robots.txt を確認し、Disallow のページは取得しない
  - 2秒/リクエストのレート制限。利用規約は事前に確認すること
"""
import argparse
import csv
import json
import re
import time
import urllib.robotparser
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

DATA_DIR = Path(__file__).parent
SOURCES = DATA_DIR / "quasi_sources.csv"
OUTPUT = DATA_DIR / "quasi_scraped.csv"
CACHE_DIR = DATA_DIR / "quasi_cache"
DELAY = 2.0
UA = "Mozilla/5.0 (compatible; kusuri-compass-bot/1.0; +https://www.kusuri-compass.com)"

# 効能・成分の見出しラベル
EFFECT_LABELS = ["効能・効果", "効能又は効果", "効能効果", "効能"]
ING_LABELS = ["有効成分", "成分・分量", "成分及び分量", "成分"]
STOP_LABELS = ["用法・用量", "用法", "使用方法", "使用上の注意", "注意", "保管",
               "添加物", "内容量", "価格", "JAN", "お問い合わせ"]

AMOUNT_RE = re.compile(
    r"([^\s、,，：:（(）)0-9]{2,30}?)\s*[（(]?\s*([\d,.]+\s*(?:mg|g|mL|ml|μg|mcg|IU|単位|億個))\s*[）)]?"
)

_robots_cache: dict[str, urllib.robotparser.RobotFileParser] = {}


def robots_ok(url: str) -> bool:
    host = urlparse(url).scheme + "://" + urlparse(url).netloc
    rp = _robots_cache.get(host)
    if rp is None:
        rp = urllib.robotparser.RobotFileParser()
        try:
            rp.set_url(host + "/robots.txt")
            rp.read()
        except Exception:
            rp = None  # robots取得不可 → 許可扱い(ただしレート制限は維持)
        _robots_cache[host] = rp
    return rp.can_fetch(UA, url) if rp else True


def fetch(url: str) -> str | None:
    CACHE_DIR.mkdir(exist_ok=True)
    key = re.sub(r"[^\w]", "_", url)[-140:]
    cache = CACHE_DIR / f"{key}.html"
    if cache.exists():
        return cache.read_text(encoding="utf-8", errors="ignore")
    if not robots_ok(url):
        print(f"  robots.txt により取得禁止: {url}")
        return None
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=30)
        r.raise_for_status()
        r.encoding = r.apparent_encoding
        cache.write_text(r.text, encoding="utf-8")
        time.sleep(DELAY)
        return r.text
    except Exception as e:
        print(f"  取得失敗: {url} ({e})")
        return None


def visible_text(soup: BeautifulSoup) -> str:
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text("\n")
    return re.sub(r"\n{2,}", "\n", text)


def slice_after_label(text: str, labels: list[str]) -> str:
    """ラベルの直後から、次の見出しラベルまでを切り出す"""
    for label in labels:
        idx = text.find(label)
        if idx < 0:
            continue
        seg = text[idx + len(label): idx + len(label) + 1200]
        # 次の見出しで打ち切り
        cut = len(seg)
        for stop in STOP_LABELS + EFFECT_LABELS + ING_LABELS:
            if stop == label:
                continue
            j = seg.find(stop)
            if 0 <= j < cut:
                cut = j
        seg = seg[:cut]
        seg = seg.strip(" ：:・\n\t／/")
        if len(seg) >= 4:
            return re.sub(r"\s+", " ", seg).strip()
    return ""


def parse_ingredients(seg: str) -> list[str]:
    """「タウリン1000mg、イノシトール50mg…」→ ["タウリン(1000mg)", ...]"""
    if not seg:
        return []
    # 成分名に付く別名括弧(例: チアミン硝化物(ビタミンB1)5mg)を除去してから量を抽出
    # 括弧の中身が分量表記でない場合(別名・注記)のみ除去
    seg = re.sub(
        r"[（(](?![\d,.]+\s*(?:mg|g|mL|ml|μg|mcg|IU|単位|億個)\s*[)）])[^)）]{1,25}[)）]",
        "", seg)
    # 添加物以降は対象外
    for stop in ["添加物", "その他の成分", "その他の"]:
        j = seg.find(stop)
        if j >= 0:
            seg = seg[:j]
    out, seen = [], set()
    for name, amount in AMOUNT_RE.findall(seg):
        name = name.strip("・、,，:： 　()（）")
        if len(name) < 2 or name in seen:
            continue
        seen.add(name)
        out.append(f"{name}({amount.replace(' ', '')})")
    if out:
        return out
    # 分量表記がない場合: 読点区切りの成分名のみ
    parts = [p.strip("・ 　") for p in re.split(r"[、,，/／]", seg)]
    return [p for p in parts if 2 <= len(p) <= 30 and "その他" not in p][:10]


def product_name(soup: BeautifulSoup) -> str:
    og = soup.find("meta", property="og:title")
    if og and og.get("content"):
        return re.split(r"[|｜/／]", og["content"])[0].strip()
    h1 = soup.find("h1")
    if h1:
        return h1.get_text(" ", strip=True)[:60]
    if soup.title:
        return re.split(r"[|｜/／]", soup.title.get_text())[0].strip()
    return ""


def scrape_one(row: dict) -> dict | None:
    url = row["url"].strip()
    html = fetch(url)
    if not html:
        return None
    soup = BeautifulSoup(html, "html.parser")
    text = visible_text(soup)
    name = (row.get("name") or "").strip() or product_name(soup)
    effect = slice_after_label(text, EFFECT_LABELS)
    ings = parse_ingredients(slice_after_label(text, ING_LABELS))
    return {
        "name": name,
        "maker": row.get("maker", "").strip(),
        "itype": row.get("itype", "quasi").strip(),
        "cat": row.get("cat", "quasi_skin").strip(),
        "effect": effect,
        "ings": ";".join(ings),
        "symptoms": "",
        "note": f"※機械抽出・要レビュー(取得元: {url})",
    }


def discover(list_url: str, pattern: str, maker: str, itype: str, cat: str):
    """一覧ページから製品ページURLを収集して sources に追記"""
    html = fetch(list_url)
    if not html:
        return
    soup = BeautifulSoup(html, "html.parser")
    found = []
    for a in soup.find_all("a", href=True):
        href = urljoin(list_url, a["href"])
        if pattern in href and href != list_url:
            found.append(href)
    found = sorted(set(found))
    existing = set()
    if SOURCES.exists():
        with open(SOURCES, encoding="utf-8-sig") as f:
            existing = {r["url"] for r in csv.DictReader(f)}
    new_rows = [u for u in found if u not in existing]
    write_header = not SOURCES.exists()
    with open(SOURCES, "a", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        if write_header:
            w.writerow(["url", "maker", "itype", "cat", "name"])
        for u in new_rows:
            w.writerow([u, maker, itype, cat, ""])
    print(f"発見 {len(found)}件 / 新規追記 {len(new_rows)}件 → {SOURCES}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--discover", help="一覧ページURL(製品URLを収集してsourcesへ追記)")
    ap.add_argument("--pattern", default="", help="製品URLに含まれる文字列(discover時の絞り込み)")
    ap.add_argument("--maker", default="")
    ap.add_argument("--itype", default="quasi", choices=["quasi", "designated_quasi"])
    ap.add_argument("--cat", default="quasi_skin")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    if args.discover:
        discover(args.discover, args.pattern, args.maker, args.itype, args.cat)
        return 0

    if not SOURCES.exists():
        print(f"{SOURCES} がありません。--discover か手動でURLを登録してください")
        return 1

    with open(SOURCES, encoding="utf-8-sig") as f:
        rows = [r for r in csv.DictReader(f) if (r.get("url") or "").startswith("http")]
    if args.limit:
        rows = rows[: args.limit]
    print(f"対象URL: {len(rows)}件")

    results, ok_ings = [], 0
    for i, row in enumerate(rows, 1):
        print(f"[{i}/{len(rows)}] {row['url'][:70]}")
        rec = scrape_one(row)
        if rec and rec["name"]:
            results.append(rec)
            if rec["ings"]:
                ok_ings += 1
            print(f"  → {rec['name']} / 成分{len(rec['ings'].split(';')) if rec['ings'] else 0}件 / 効能{'有' if rec['effect'] else '無'}")

    with open(OUTPUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["name", "maker", "itype", "cat", "effect", "ings", "symptoms", "note"])
        w.writeheader()
        w.writerows(results)
    print(f"\n出力: {OUTPUT} ({len(results)}件 / 成分抽出成功{ok_ings}件)")
    print("→ 内容をレビューして quasi_products.csv へ移し、import_quasi.py --write で取り込んでください")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
