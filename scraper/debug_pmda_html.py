#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
debug_pmda_html.py
PMDA詳細ページの「HTML」ボタン(javascript:void(0))をクリックし、
描画後に効能・成分の本文がどこに・どう出るかを観察する調査用スクリプト。
データは書き換えない。

使い方:
  python scraper/debug_pmda_html.py
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

LABELS = ["効能又は効果", "効能・効果", "効能効果", "効能", "成分及び分量",
          "成分・分量", "成分", "有効成分", "用法及び用量", "用法・用量"]

def make_driver():
    o = Options()
    for a in ["--headless","--no-sandbox","--disable-dev-shm-usage","--disable-gpu",
              "--window-size=1280,1200","--lang=ja"]:
        o.add_argument(a)
    o.add_argument("user-agent=Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36")
    if HAVE_WDM:
        try:
            return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=o)
        except Exception:
            pass
    return webdriver.Chrome(options=o)

def pr(*a): print(*a, flush=True)

def find_html_button(driver):
    """「HTML」と表示されたクリック可能要素を探す（a / button / span など）"""
    # まず a タグ
    for el in driver.find_elements(By.TAG_NAME, "a"):
        if (el.text or "").strip().upper() == "HTML":
            return el
    # onclick を持つ要素全般
    for tag in ["button", "span", "input", "div"]:
        for el in driver.find_elements(By.TAG_NAME, tag):
            t = (el.text or el.get_attribute("value") or "").strip().upper()
            if t == "HTML":
                return el
    return None

def probe(driver, name, url):
    pr("\n" + "="*70)
    pr(f"■ {name}")
    pr(f"  URL: {url}")
    driver.get(url)
    time.sleep(3)

    handles_before = list(driver.window_handles)
    body_before = driver.find_element(By.TAG_NAME, "body").text

    btn = find_html_button(driver)
    if not btn:
        pr("  ✗ HTMLボタンが見つからない")
        return
    pr(f"  HTMLボタン発見: tag={btn.tag_name} onclick={ (btn.get_attribute('onclick') or '')[:80] }")

    # クリック
    try:
        driver.execute_script("arguments[0].click();", btn)
    except Exception as e:
        pr(f"  クリック失敗: {e}")
        return
    time.sleep(4)  # 描画待ち

    # 1) 新しいタブ/ウィンドウが開いたか
    handles_after = list(driver.window_handles)
    pr(f"\n  ウィンドウ数: {len(handles_before)} → {len(handles_after)}")
    if len(handles_after) > len(handles_before):
        new = [h for h in handles_after if h not in handles_before][0]
        driver.switch_to.window(new)
        time.sleep(2)
        pr(f"  新しいタブに切替。URL: {driver.current_url[:90]}")

    # 2) iframe があるか
    iframes = driver.find_elements(By.TAG_NAME, "iframe")
    pr(f"  iframe数: {len(iframes)}")
    bodies = []
    main_body = driver.find_element(By.TAG_NAME, "body").text
    bodies.append(("main", main_body))
    for i, fr in enumerate(iframes):
        try:
            driver.switch_to.frame(fr)
            fb = driver.find_element(By.TAG_NAME, "body").text
            bodies.append((f"iframe{i}", fb))
            driver.switch_to.default_content()
        except Exception:
            driver.switch_to.default_content()

    # 3) 各bodyでラベルが見つかるか＆冒頭表示
    for label, txt in bodies:
        changed = "（クリック前と同じ）" if txt == body_before else "（内容が変化）"
        pr(f"\n  --- [{label}] 長さ{len(txt)}字 {changed} ---")
        hits = [l for l in LABELS if l in txt]
        if hits:
            pr(f"  ✓ ラベル発見: {hits}")
            idx = txt.find(hits[0])
            pr(f"    抜粋: {txt[idx:idx+200].replace(chr(10),' ')}")
        else:
            pr("  ✗ ラベルなし")
        if txt and txt != body_before:
            pr("  冒頭400字:")
            pr("  " + txt[:400].replace("\n","\n  "))

def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    meds = data.get("medicines", [])
    targets = [m for m in meds
               if (not m.get("itype") or m.get("itype")=="otc")
               and not m.get("effect") and not m.get("ings")
               and m.get("pmda_url")][:2]
    pr(f"調査対象: {len(targets)}件")
    driver = make_driver()
    try:
        for m in targets:
            try:
                probe(driver, m["name"], m["pmda_url"])
            except Exception as e:
                pr(f"  [probe例外] {e}")
            driver.switch_to.default_content()
            # タブを最初の1枚に戻す
            while len(driver.window_handles) > 1:
                driver.switch_to.window(driver.window_handles[-1])
                driver.close()
            driver.switch_to.window(driver.window_handles[0])
    finally:
        try: driver.quit()
        except Exception: pass
    pr("\n調査完了。上の出力をそのまま共有してください。")

if __name__ == "__main__":
    main()
