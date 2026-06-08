#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
debug_pmda_ings.py
詳細ページ（/otcDetail/{ID}）の成分テーブルとメーカー欄の構造を観察する。
parse_ings / parse_maker を正確に直すための調査。データは書き換えない。
"""
import json, time
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

def to_detail_url(u):
    return u.replace("/otcDetail/GeneralList/", "/otcDetail/") if "/otcDetail/GeneralList/" in u else u

def make_driver():
    o = Options()
    for a in ["--headless","--no-sandbox","--disable-dev-shm-usage","--disable-gpu",
              "--window-size=1280,1400","--lang=ja"]:
        o.add_argument(a)
    o.add_argument("user-agent=Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36")
    if HAVE_WDM:
        try: return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=o)
        except Exception: pass
    return webdriver.Chrome(options=o)

def pr(*a): print(*a, flush=True)

def probe(driver, name, generallist_url):
    url = to_detail_url(generallist_url)
    pr("\n" + "="*70)
    pr(f"■ {name}")
    pr(f"  詳細URL: {url}")
    driver.get(url)
    time.sleep(4)

    # 全テーブルの行を、th/td を区別して吐く
    tables = driver.find_elements(By.TAG_NAME, "table")
    pr(f"\n  テーブル数: {len(tables)}")
    for ti, table in enumerate(tables):
        rows = table.find_elements(By.TAG_NAME, "tr")
        # 成分・メーカーに関係しそうなテーブルだけ詳しく
        tabletext = table.text
        relevant = any(k in tabletext for k in ["成分","分量","製造販売","販売会社","会社","リスク区分"])
        if not relevant:
            continue
        pr(f"\n  --- テーブル[{ti}] 行数{len(rows)} ---")
        for ri, row in enumerate(rows[:25]):
            ths = [c.text.strip() for c in row.find_elements(By.TAG_NAME, "th")]
            tds = [c.text.strip() for c in row.find_elements(By.TAG_NAME, "td")]
            pr(f"    r{ri}: TH={ths} | TD={tds}")

    # メーカー欄周辺のテキスト（ラベル前後を見る）
    body = driver.find_element(By.TAG_NAME, "body").text
    pr(f"\n  --- メーカー欄周辺テキスト ---")
    for label in ["製造販売", "販売会社", "会社名", "製造販売元", "販売元"]:
        idx = body.find(label)
        if idx >= 0:
            pr(f"    「{label}」周辺: {body[idx:idx+80].replace(chr(10),' / ')}")

def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    meds = data.get("medicines", [])
    # 効能は取れたが成分が壊れていた漢方系と、別タイプ（鎮痛テープ等）を混ぜて2件
    targets = []
    for m in meds:
        if m.get("pmda_url") and "GeneralList" in m.get("pmda_url",""):
            targets.append(m)
        if len(targets) >= 2:
            break
    pr(f"調査対象: {len(targets)}件")
    driver = make_driver()
    try:
        for m in targets:
            try: probe(driver, m["name"], m["pmda_url"])
            except Exception as e: pr(f"  [例外] {e}")
    finally:
        try: driver.quit()
        except Exception: pass
    pr("\n調査完了。出力をそのまま共有してください。")

if __name__ == "__main__":
    main()
