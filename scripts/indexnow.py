#!/usr/bin/env python3
"""
indexnow.py — サイトマップに載っている全URLを IndexNow に一括送信する（Bing 向け）

Google は IndexNow に対応していないが、Bing は対応している（日本の検索の数%）。
Google 向けの「一括登録」は存在しないので、こちらは「できる分は全部やっておく」もの。

仕組み:
  1. https://www.kusuri-compass.com/sitemap.xml（目次）→ 4本のサイトマップ → 全 <loc> を集める
  2. 10,000件ずつ https://api.indexnow.org/indexnow に POST
  3. 鍵は public/7130201bd923212ce1d0cfc1692f7493.txt（中身は鍵そのもの）。サイト側で
     https://www.kusuri-compass.com/7130201bd923212ce1d0cfc1692f7493.txt が開けることが条件

環境変数: SITE_URL（既定 https://www.kusuri-compass.com）
"""
from __future__ import annotations
import json, os, re, sys, urllib.request, urllib.error

KEY = "7130201bd923212ce1d0cfc1692f7493"
SITE_URL = os.environ.get("SITE_URL", "https://www.kusuri-compass.com").rstrip("/")
HOST = SITE_URL.split("//", 1)[1]
BATCH = 10000


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "kusuri-compass-indexnow"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def locs(xml: str) -> list[str]:
    return re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml)


def main() -> int:
    index = fetch(f"{SITE_URL}/sitemap.xml")
    maps = locs(index) or [f"{SITE_URL}/sitemap.xml"]
    urls: list[str] = []
    for m in maps:
        urls += locs(fetch(m))
    urls = sorted(set(u for u in urls if u.startswith(SITE_URL)))
    print(f"[indexnow] {len(maps)} sitemaps, {len(urls)} urls")
    if not urls:
        print("[indexnow] URLが取れなかった")
        return 1

    sent = 0
    for i in range(0, len(urls), BATCH):
        chunk = urls[i : i + BATCH]
        body = json.dumps({
            "host": HOST,
            "key": KEY,
            "keyLocation": f"{SITE_URL}/{KEY}.txt",
            "urlList": chunk,
        }).encode("utf-8")
        req = urllib.request.Request(
            "https://api.indexnow.org/indexnow", data=body, method="POST",
            headers={"Content-Type": "application/json; charset=utf-8"},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                print(f"[indexnow] {len(chunk)}件 → {r.status}")
                sent += len(chunk)
        except urllib.error.HTTPError as e:
            print(f"[indexnow] {len(chunk)}件 → {e.code} {e.read().decode('utf-8','replace')[:200]}")
            return 1
    print(f"[indexnow] 送信完了 {sent}件（200/202なら受理）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
