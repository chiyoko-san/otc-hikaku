#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
debug_pmda_detail.py
PMDA詳細ページが今どんな中身を返しているかを調べるための調査用スクリプト。
データを書き換えず、ログに状況を吐くだけ。

使い方（GitHub Actions / ローカル共通）:
  python scraper/debug_pmda_detail.py

medicines.json の reprocess 対象（OTC・効能/成分が空・pmda_url有）の先頭3件について、
  1) GeneralListページの body.text 冒頭
  2) ページ内の全リンク（href / テキスト）
  3) 「効能又は効果」等のラベルが本文に存在するか
  4) HTML添付文書リンクが取れるか
を出力する。
"""
import json, time, re
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
try:
    from webdriver_manager.chrome import ChromeDriverManager
    HAVE_WDM = True
except Exception:
    HAVE_WDM = False

DATA = Path("scraper/medicines.json")
if not DATA.exists():
    DATA = Path("data/medicines.json")

LABELS_EFFECT = ["効能又は効果", "効能・効果", "効能効果", "【効能・効果】", "効能", "効能 又は 効果"]
LABELS_ING    = ["成分及び分量", "成分・分量", "成分", "有効成分"]

def make_driver():
    o = Options()
    for a in ["--headless","--no-sandbox","--disable-dev-shm-usage","--disable-gpu",
              "--window-size=1280,900","--lang=ja"]:
        o.add_argument(a)
    o.add_argument("user-agent=Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36")
    if HAVE_WDM:
        try:
            return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=o)
        except Exception:
            pass
    return webdriver.Chrome(options=o)

def pr(*a):
    print(*a, flush=True)

def probe(driver, name, url):
    pr("\n" + "="*70)
    pr(f"■ {name}")
    pr(f"  URL: {url}")
    try:
        driver.get(url)
        time.sleep(3)
    except Exception as e:
        pr(f"  [get失敗] {e}")
        return

    # 1) body text 冒頭
    try:
        body = driver.find_element(By.TAG_NAME, "body").text
    except Exception as e:
        pr(f"  [body取得失敗] {e}")
        body = ""
    pr(f"\n  --- body.text 冒頭600字 ---")
    pr("  " + (body[:600].replace("\n", "\n  ") if body else "(空)"))
    pr(f"  --- body.text 長さ: {len(body)}字 ---")

    # 2) ラベル存在チェック
    pr(f"\n  --- ラベル検出 ---")
    for lab in LABELS_EFFECT:
        if lab in body:
            idx = body.find(lab)
            pr(f"  ✓ 効能ラベル「{lab}」発見 → 直後: {body[idx:idx+60].replace(chr(10),' ')}")
            break
    else:
        pr("  ✗ 効能ラベルが本文に見つからない")
    for lab in LABELS_ING:
        if lab in body:
            idx = body.find(lab)
            pr(f"  ✓ 成分ラベル「{lab}」発見 → 直後: {body[idx:idx+60].replace(chr(10),' ')}")
            break
    else:
        pr("  ✗ 成分ラベルが本文に見つからない")

    # 3) リンク一覧（HTML添付文書 / PDF を見分ける）
    pr(f"\n  --- ページ内リンク（最大30件） ---")
    try:
        links = driver.find_elements(By.TAG_NAME, "a")
        shown = 0
        html_candidates = []
        pdf_candidates = []
        for ln in links:
            href = ln.get_attribute("href") or ""
            txt  = (ln.text or "").strip()
            if not href:
                continue
            low = href.lower()
            if ".pdf" in low:
                pdf_candidates.append((txt, href))
            if "html" in low or txt.upper() == "HTML" or "DetailWithHtml" in href:
                html_candidates.append((txt, href))
            if shown < 30 and (txt or "Detail" in href or ".pdf" in low):
                pr(f"    [{txt[:20]:20s}] {href[:90]}")
                shown += 1
        pr(f"\n  HTML添付文書候補: {len(html_candidates)}件")
        for t,h in html_candidates[:5]:
            pr(f"    HTML→ [{t[:20]}] {h[:90]}")
        pr(f"  PDF候補: {len(pdf_candidates)}件")
        for t,h in pdf_candidates[:5]:
            pr(f"    PDF→ [{t[:20]}] {h[:90]}")
    except Exception as e:
        pr(f"  [リンク取得失敗] {e}")

def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    meds = data.get("medicines", [])
    targets = [m for m in meds
               if (not m.get("itype") or m.get("itype")=="otc")
               and not m.get("effect") and not m.get("ings")
               and m.get("pmda_url")][:3]
    pr(f"調査対象: {len(targets)}件")
    driver = make_driver()
    try:
        for m in targets:
            probe(driver, m["name"], m["pmda_url"])
    finally:
        try: driver.quit()
        except Exception: pass
    pr("\n調査完了。上の出力をそのまま共有してください。")

if __name__ == "__main__":
    main()
