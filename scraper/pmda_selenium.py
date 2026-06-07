#!/usr/bin/env python3
"""
PMDA OTC医薬品スクレイパー v2
- GeneralListページ + HTML添付文書ページの2段階取得
- リスク区分・メーカーはGeneralListページから確実に取得
- 効能・成分はHTML添付文書ページから取得（存在する場合）
"""
import json, time, re, argparse, os
from pathlib import Path
from datetime import datetime

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

DATA_DIR    = Path(__file__).parent
OUTPUT      = DATA_DIR / "medicines.json"
CACHE_DIR   = DATA_DIR / "pmda_cache"
LOG_FILE    = DATA_DIR / "scraper.log"
STATS_FILE  = DATA_DIR / "scrape_stats.json"
PMDA_SEARCH = "https://www.pmda.go.jp/PmdaSearch/otcSearch"
PAGE_DELAY  = 2.5
DET_DELAY   = 2.0
HTML_DELAY  = 1.5

GROUPS = {
    "hira":  list("あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん"),
    "kata":  list("アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン"),
    "alpha": list("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"),
}

WARN_CHECK   = ["アリルイソプロピルアセチル尿素","ブロムワレリル尿素",
                "ジヒドロコデインリン酸塩","コデインリン酸塩","ジヒドロコデイン"]
DROWSY_CHECK = ["クロルフェニラミン","ジフェンヒドラミン","プロメタジン",
                "ジフェニルピラリン","コデイン","ジヒドロコデイン"]

CAT_MAP = [
    ("cold",    ["解熱","鎮痛","かぜ","感冒","発熱","咽喉","のど痛","総合感冒"]),
    ("stomach", ["胃","腸","整腸","下痢","便秘","消化","胸やけ","H2ブロッカー","ファモチジン","制酸"]),
    ("allergy", ["アレルギー","花粉","蕁麻疹","鼻炎","抗ヒスタミン"]),
    ("cough",   ["鎮咳","去痰","咳","痰","気管支","コデイン","ジヒドロコデイン"]),
    ("nose",    ["鼻炎","鼻水","鼻づまり","アレルギー性鼻炎"]),
    ("eye",     ["点眼","目","眼","ビタミンA","眼疲労"]),
    ("ext_pain",["消炎鎮痛","貼付","外皮","ロキソプロフェン","インドメタシン","テープ","パッチ"]),
    ("ext_skin",["皮膚","湿疹","かぶれ","かゆみ","虫さされ","じんましん","にきび"]),
    ("foot",    ["水虫","白癬","抗真菌","テルビナフィン","ミコナゾール"]),
    ("hair",    ["発毛","育毛","脱毛","ミノキシジル"]),
    ("skin_oral",["シミ","そばかす","トラネキサム","肝斑","美白"]),
    ("women",   ["更年期","女性","月経","生理不順","婦人"]),
    ("sleep",   ["催眠","不眠","睡眠"]),
    ("smoking", ["禁煙","ニコチン"]),
    ("motion",  ["乗物酔い","動揺病"]),
    ("oral",    ["口腔","歯","口内炎","殺菌","含嗽"]),
    ("anal",    ["痔","痔疾"]),
    ("circu",   ["循環器","血流","血圧"]),
    ("test",    ["検査","妊娠","排卵"]),
    ("disinfect",["消毒","殺菌","ポビドンヨード","エタノール"]),
    ("kampo",   ["漢方","エキス錠","エキス顆粒","エキス細粒","湯エキス"]),
    ("joint",   ["関節","筋肉","神経痛","骨","グルコサミン","コンドロイチン"]),
]

SYM_MAP = [
    ("頭痛",        ["頭痛"]),
    ("発熱",        ["発熱","解熱"]),
    ("のど痛",      ["咽喉痛","のど痛","口腔内"]),
    ("月経痛",      ["月経痛","生理痛"]),
    ("鼻水",        ["鼻水","鼻汁"]),
    ("鼻づまり",    ["鼻づまり","鼻閉"]),
    ("目のかゆみ",  ["目のかゆみ","眼のかゆみ"]),
    ("せき",        ["咳","せき"]),
    ("たん",        ["痰","たん"]),
    ("胃痛",        ["胃痛","胃部不快感"]),
    ("胸やけ",      ["胸やけ"]),
    ("下痢",        ["下痢"]),
    ("便秘",        ["便秘"]),
    ("肌荒れ",      ["肌荒れ","皮膚炎"]),
    ("かゆみ",      ["かゆみ","掻痒"]),
    ("虫刺され",    ["虫さされ","虫刺"]),
    ("水虫",        ["水虫","白癬"]),
    ("肉体疲労",    ["疲労","滋養強壮","体力"]),
    ("眼精疲労",    ["眼精疲労","目の疲れ"]),
    ("不眠",        ["不眠","寝つき"]),
    ("乗物酔い",    ["乗物酔い","動揺病"]),
    ("口内炎",      ["口内炎"]),
    ("腰痛",        ["腰痛"]),
    ("関節痛",      ["関節痛","関節炎"]),
    ("筋肉痛",      ["筋肉痛","筋痛"]),
    ("神経痛",      ["神経痛"]),
]

# ── ユーティリティ ──────────────────────────────
def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

def make_driver():
    opts = Options()
    opts.add_argument("--headless")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1280,900")
    opts.add_argument("--lang=ja")
    opts.add_argument("user-agent=Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36")
    try:
        svc = Service(ChromeDriverManager().install())
        return webdriver.Chrome(service=svc, options=opts)
    except Exception:
        return webdriver.Chrome(options=opts)

def cache_path(url):
    CACHE_DIR.mkdir(exist_ok=True)
    key = re.sub(r'[^\w]', '_', url)[-120:]
    return CACHE_DIR / f"{key}.json"

def read_cache(url):
    p = cache_path(url)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    return None

def write_cache(url, data):
    try:
        cache_path(url).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass

def dismiss_alert(driver):
    try:
        WebDriverWait(driver, 2).until(EC.alert_is_present())
        driver.switch_to.alert.dismiss()
    except Exception:
        pass

def extract_between(text, starts, ends):
    for s in starts:
        idx = text.find(s)
        if idx < 0: continue
        rest = text[idx+len(s):]
        ep = len(rest)
        for e in ends:
            p = rest.find(e)
            if 0 < p < ep: ep = p
        c = rest[:ep].strip()
        if c: return c
    return ""

# ── パース ──────────────────────────────────────
def parse_risk(body):
    if "要指導"    in body: return 0
    if "指定第２類" in body or "指定第2類" in body: return 2
    if "第１類"    in body or "第1類" in body: return 1
    if "第２類"    in body or "第2類" in body: return 2.5
    if "第３類"    in body or "第3類" in body: return 3
    return None

def parse_ings(driver, body):
    ings = []
    # テーブルから成分・分量を取得
    try:
        for table in driver.find_elements(By.TAG_NAME, "table"):
            in_ing = False
            for row in table.find_elements(By.TAG_NAME, "tr"):
                ths = [c.text.strip() for c in row.find_elements(By.TAG_NAME, "th")]
                tds = [c.text.strip() for c in row.find_elements(By.TAG_NAME, "td")]
                if any("成分" in t or "分量" in t for t in ths):
                    in_ing = True; continue
                if in_ing:
                    val = tds[0] if tds else ""
                    if not val: break
                    if not any(s in val for s in ["添加物","合計","注","備考"]):
                        ings.append(val)
    except Exception:
        pass

    # テーブルで取れなければテキストから抽出
    if not ings:
        sec = extract_between(body,
            ["成分及び分量","成分・分量","有効成分","成分と分量"],
            ["【用法","添加物","次の注意","用法及び用量"])
        for line in sec.splitlines():
            line = line.strip()
            if line and len(line) > 2 and not line.startswith("【"):
                # 「成分名　量mg」形式をパース
                m = re.match(r'^(.+?)\s+([\d.]+\s*(?:mg|g|μg|μL|mL|IU|万|億|%)[^　\s]*)(.*)$', line)
                if m:
                    ing_name = m.group(1).strip()
                    amount = m.group(2).strip()
                    ings.append(f"{ing_name}({amount})")
                elif len(line) < 60:
                    ings.append(line)
    return [i for i in ings if len(i) < 80][:15]

def parse_maker(body):
    for label in ["販売会社名","製造販売元","会社名","販売元","製造元"]:
        val = extract_between(body, [label], ["\n\n","\n※","\n【","\n〒"])
        if val and len(val) < 80:
            return val.strip()
    return ""

def enrich(d):
    ings = d.get("ings", [])
    effect = d.get("effect", "")
    name = d.get("name", "")
    ing_str = " ".join(ings)

    warn_ings = [w for w in WARN_CHECK if w in ing_str]
    drowsy = any(k in ing_str for k in DROWSY_CHECK)

    text = f"{effect} {ing_str} {name}"
    cat = "vitamin"
    for cid, kws in CAT_MAP:
        if any(k in text for k in kws):
            cat = cid; break

    syms = [sym for sym, kws in SYM_MAP if any(k in effect for k in kws)]

    notes = []
    for w in warn_ings:
        if "アリルイソプロピルアセチル尿素" in w:
            notes.append("⚠ア尿素含有：2023年AU全面規制・2025年KR麻薬類指定。依存リスクあり。")
        elif "コデイン" in w or "ジヒドロコデイン" in w:
            notes.append("⚠コデイン系：12歳未満禁忌。依存リスクあり。")
        elif "ブロムワレリル" in w:
            notes.append("⚠ブロム尿素含有：依存性成分。連用注意。")

    note_type = "danger" if any("禁忌" in n or "依存" in n for n in notes) \
                else "warn" if notes else "nn"
    note = " ".join(notes) if notes else ""

    d.update({
        "cat":      cat,
        "drowsy":   drowsy,
        "warnIngs": warn_ings,
        "symptoms": syms,
        "note":     note,
        "noteType": note_type,
    })
    return d

# ── 詳細取得（修正版） ───────────────────────────
def get_html_detail_url(driver, generallist_url):
    """GeneralListページからHTML添付文書URLを取得"""
    try:
        links = driver.find_elements(By.TAG_NAME, "a")
        for link in links:
            href = link.get_attribute("href") or ""
            text = link.text.strip()
            # HTML添付文書リンクを探す
            if ("DetailWithHtml" in href or "otcDetail/Detail/" in href) and "DetailWithHtml" in href:
                return href
            if text in ["HTML", "html"] and ("pmda.go.jp" in href or href.startswith("/")):
                return href if href.startswith("http") else f"https://www.pmda.go.jp{href}"
    except Exception:
        pass
    return None

def get_detail(driver, item):
    url = item["url"]
    cached = read_cache(url)
    if cached:
        cached.pop("_at", None)
        return cached

    result = {"name": item["name"], "pmda_url": url}

    try:
        driver.get(url)
        time.sleep(DET_DELAY)
        body = driver.find_element(By.TAG_NAME, "body").text

        # GeneralListページから基本情報取得
        risk = parse_risk(body)
        maker = parse_maker(body)

        if risk is not None:
            result["risk"] = risk
        if maker:
            result["maker"] = maker

        # HTML添付文書リンクを探す
        html_url = get_html_detail_url(driver, url)

        if html_url:
            # HTML添付文書ページから効能・成分取得
            try:
                log(f"    HTML添付文書: {html_url[:60]}")
                driver.get(html_url)
                time.sleep(HTML_DELAY)
                html_body = driver.find_element(By.TAG_NAME, "body").text

                effect = extract_between(html_body,
                    ["効能又は効果", "効能・効果", "効能効果", "【効能・効果】"],
                    ["用法及び用量", "用法・用量", "【用法", "＜用法"])
                ings = parse_ings(driver, html_body)
                if not maker:
                    maker = parse_maker(html_body)
                if risk is None:
                    risk = parse_risk(html_body)

                result.update({
                    "effect": effect[:300] if effect else "",
                    "ings":   ings,
                    "risk":   risk,
                    "maker":  maker,
                })
                log(f"    取得成功: 効能={bool(effect)} 成分={len(ings)}件")
            except Exception as e:
                log(f"    HTML詳細エラー: {e}")
        else:
            # HTML版なし → GeneralListからテキスト抽出を試みる
            effect = extract_between(body,
                ["効能又は効果", "効能・効果"],
                ["用法及び用量", "用法・用量"])
            ings_text = extract_between(body,
                ["成分及び分量", "成分・分量"],
                ["用法及び用量", "添加物"])

            result.update({
                "effect": effect[:300] if effect else "",
                "ings":   parse_ings(driver, body) if ings_text else [],
                "risk":   risk,
                "maker":  maker,
            })

    except Exception as e:
        log(f"  詳細エラー [{item['name']}]: {e}")

    result = enrich(result)
    write_cache(url, result)
    return result

# ── 検索・一覧取得 ──────────────────────────────
def go_next(driver):
    try:
        nxt = driver.find_element(By.LINK_TEXT, "次へ")
        if nxt:
            nxt.click()
            time.sleep(PAGE_DELAY)
            return True
    except Exception:
        pass
    try:
        links = driver.find_elements(By.TAG_NAME, "a")
        for lnk in links:
            if lnk.text.strip() in ["次へ", ">", "次ページ", "→"]:
                lnk.click()
                time.sleep(PAGE_DELAY)
                return True
    except Exception:
        pass
    return False

def extract_items(driver):
    raw = driver.execute_script("""
        var out=[];
        document.querySelectorAll('a[href]').forEach(function(a){
            var h=a.getAttribute('href')||'', t=a.textContent.trim();
            if(t.length>1 && (
                h.indexOf('otcDetail')>-1 ||
                h.indexOf('GeneralList')>-1 ||
                h.indexOf('rdDetail')>-1
            ))
                out.push({name:t, href:h});
        });
        return out;
    """) or []
    items, seen = [], set()
    for r in raw:
        href = r["href"]
        name = r["name"].strip()
        if not name or len(name) < 2: continue
        if not href.startswith("http"):
            href = "https://www.pmda.go.jp" + href
        # 不要なリンクを除外（PDF直リンク、"次へ"ボタンなど）
        if any(x in name for x in ["次へ","前へ","先頭","最後","PDF","HTML","添付"]):
            continue
        if name in seen: continue
        seen.add(name)
        # GeneralListかDetailのURLのみ
        if "GeneralList" in href or "otcDetail" in href or "rdDetail" in href:
            items.append({"name": name, "url": href})
    return items

# ── 変化に強いフォーム操作（多段フォールバック） ──────────────
def find_keyword_input(driver):
    """検索キーワード入力欄を複数の手がかりで探す。
    PMDA側のid/name変更に耐えるため、id→name→type→placeholderの順に試す。"""
    candidates = [
        (By.ID, "txtName"),
        (By.NAME, "txtName"),
        (By.CSS_SELECTOR, "input[name*='Name']"),
        (By.CSS_SELECTOR, "input[id*='Name']"),
        (By.CSS_SELECTOR, "input[type='text']"),
        (By.CSS_SELECTOR, "input[placeholder*='名']"),
    ]
    for by, sel in candidates:
        try:
            els = driver.find_elements(by, sel)
            for el in els:
                # 表示されていて入力可能なものを優先
                if el.is_displayed() and el.is_enabled():
                    return el
        except Exception:
            continue
    return None

def click_search_button(driver):
    """検索ボタンを複数の手がかりで探してクリック。見つかればTrue。"""
    candidates = [
        (By.CSS_SELECTOR, "input[type='image'][name='btnA']"),
        (By.CSS_SELECTOR, "input[type='image']"),
        (By.CSS_SELECTOR, "button[type='submit']"),
        (By.CSS_SELECTOR, "input[type='submit']"),
        (By.XPATH, "//input[contains(@value,'検索')]"),
        (By.XPATH, "//button[contains(.,'検索')]"),
        (By.XPATH, "//a[contains(.,'検索')]"),
    ]
    for by, sel in candidates:
        try:
            for el in driver.find_elements(by, sel):
                if el.is_displayed() and el.is_enabled():
                    el.click()
                    return True
        except Exception:
            continue
    # 最終手段: 入力欄でEnter送信
    try:
        inp = find_keyword_input(driver)
        if inp:
            from selenium.webdriver.common.keys import Keys
            inp.send_keys(Keys.RETURN)
            return True
    except Exception:
        pass
    return False

def search_keyword(driver, keyword):
    all_items = []
    driver.get(PMDA_SEARCH)
    time.sleep(1.5)
    dismiss_alert(driver)

    # 100件表示（テキスト一致だけに頼らず、件数系リンクを総当たり）
    try:
        driver.execute_script("""
            document.querySelectorAll('a,option').forEach(function(a){
                var t=(a.textContent||a.value||'').trim();
                if(t==='100件'||t==='100'){ try{a.click();}catch(e){} }
            });
        """)
        time.sleep(0.8)
    except Exception:
        pass

    # キーワード入力（多段フォールバック）
    inp = find_keyword_input(driver)
    if inp is None:
        log(f"  入力欄が見つかりません（PMDAの画面構造が変わった可能性）keyword=「{keyword}」")
        return []
    try:
        inp.clear()
        inp.send_keys(keyword)
    except Exception as e:
        log(f"  入力エラー: {e}")
        return []

    # 検索ボタン（多段フォールバック）
    original_handles = set(driver.window_handles)
    if not click_search_button(driver):
        log(f"  検索ボタンが見つかりません（PMDAの画面構造が変わった可能性）keyword=「{keyword}」")
        return []

    time.sleep(PAGE_DELAY)
    dismiss_alert(driver)

    new_handles = set(driver.window_handles) - original_handles
    if new_handles:
        driver.switch_to.window(new_handles.pop())

    page = 1
    seen_signatures = set()   # 各ページの内容シグネチャ（薬名の集合）を記録
    seen_names = set()        # このキーワード内で既出の薬名
    stale = 0                 # 新規ゼロが続いた回数
    while True:
        items = extract_items(driver)

        # ページ内容のシグネチャ（順不同の薬名集合）。同一ページの繰り返しを検出する
        sig = frozenset(it["name"] for it in items)
        if items and sig in seen_signatures:
            log(f"  p{page}: {len(items)}件（前と同一内容 → ページ送りが進んでいないため停止）")
            break
        seen_signatures.add(sig)

        # このキーワード内での新規だけ採用
        fresh = [it for it in items if it["name"] not in seen_names]
        for it in fresh:
            seen_names.add(it["name"])
        all_items.extend(fresh)
        log(f"  p{page}: {len(items)}件（新規{len(fresh)}件）")

        # 新規が出ないページが2回続いたら、実質終端とみなして停止
        if not fresh:
            stale += 1
            if stale >= 2:
                log("  新規ゼロが連続 → 終端とみなし停止")
                break
        else:
            stale = 0

        if not items:
            # 空ページが返ったら終端
            break

        if not go_next(driver):
            break
        page += 1
        if page > 50:
            log("  page上限(50)到達 → 停止")
            break

    if len(driver.window_handles) > 1:
        try:
            driver.close()
            driver.switch_to.window(list(driver.window_handles)[0])
        except Exception:
            pass

    return all_items

# ── データ管理 ──────────────────────────────────
def load_existing():
    if OUTPUT.exists():
        try:
            d = json.loads(OUTPUT.read_text(encoding="utf-8"))
            return d.get("medicines", [])
        except Exception:
            pass
    return []

def save(meds):
    data = {
        "total":      len(meds),
        "updated_at": datetime.now().isoformat(),
        "medicines":  meds,
    }
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def _merge(existing, new_items):
    seen = {m["name"] for m in existing}
    merged = list(existing)
    next_id = max((m.get("id", 0) for m in existing), default=0) + 1
    for item in new_items:
        if item["name"] not in seen:
            if "id" not in item:
                item["id"] = next_id
                next_id += 1
            # デフォルト値補完
            item.setdefault("price", None)
            item.setdefault("asin", "")
            item.setdefault("rakuten_url", "")
            item.setdefault("amazon_tag", "")
            item.setdefault("price_updated_at", "")
            merged.append(item)
            seen.add(item["name"])
    return merged

def git_commit(msg):
    import subprocess
    try:
        subprocess.run(["git", "pull", "--rebase"], capture_output=True)
        subprocess.run(["git", "add", str(OUTPUT)], capture_output=True)
        r = subprocess.run(["git", "diff", "--staged", "--quiet"], capture_output=True)
        if r.returncode != 0:
            subprocess.run(["git", "commit", "-m", msg], capture_output=True)
            subprocess.run(["git", "push"], capture_output=True)
            log(f"自動コミット: {msg}")
    except Exception as e:
        log(f"コミットエラー: {e}")

# ── メイン ──────────────────────────────────────
def run(group="hira", resume=False, limit=0, reprocess=False):
    """
    reprocess=True: 既存のeffect/ingsが空のものを再取得
    """
    keywords = GROUPS.get(group, GROUPS["hira"])
    log(f"PMDA スクレイパー v2 開始 group={group} keywords={len(keywords)}個 resume={resume} reprocess={reprocess}")

    existing = load_existing()
    existing_names = {m["name"] for m in existing}
    log(f"既存: {len(existing)}件")

    # reprocessモード: effectもingsもない商品のURLリストを作成
    reprocess_items = []
    if reprocess:
        for m in existing:
            if (not m.get('itype') or m.get('itype') == 'otc') and \
               not m.get('effect') and not m.get('ings') and m.get('pmda_url'):
                reprocess_items.append({"name": m["name"], "url": m["pmda_url"]})
        log(f"再取得対象: {len(reprocess_items)}件")

    driver = make_driver()
    new_items = []
    updated_items = {}  # name → updated data
    raw_found = 0       # PMDAから返ってきた総件数（健全性チェック用）

    try:
        if reprocess and reprocess_items:
            # 再取得モード
            targets = reprocess_items[:limit] if limit else reprocess_items
            attempted = 0   # 試行数（早期判定用）
            for i, item in enumerate(targets):
                log(f"再取得 [{i+1}/{len(targets)}]: {item['name']}")
                # キャッシュを削除して再取得
                cp = cache_path(item["url"])
                if cp.exists():
                    cp.unlink()
                det = get_detail(driver, item)
                attempted += 1
                if det.get('effect') or det.get('ings'):
                    updated_items[item['name']] = det
                    log(f"  → 取得成功: 効能={bool(det.get('effect'))} 成分={len(det.get('ings',[]))}件")
                if (i+1) % 50 == 0:
                    # 中間コミット
                    merged = _apply_updates(existing, updated_items)
                    save(merged)
                    if os.environ.get("GITHUB_ACTIONS"):
                        git_commit(f"reprocess中間: {len(updated_items)}件更新")

                # 早期判定: 最初の30件を試して成功0件なら詳細取得が壊れている。
                # 7,015件を無駄に4時間回さず、ここで中断して気づけるようにする。
                if attempted == 30 and len(updated_items) == 0:
                    log("⚠ 最初の30件すべてで効能・成分が取得できませんでした。"
                        "詳細ページの構造変化（ラベル変更等）の疑いがあるため中断します。")
                    break
        else:
            # 通常スクレイピング
            for i, kw in enumerate(keywords):
                log(f"キーワード [{i+1}/{len(keywords)}]: 「{kw}」")
                try:
                    kw_items = search_keyword(driver, kw)
                except Exception as e:
                    log(f"  検索エラー「{kw}」: {e}"); continue

                raw_found += len(kw_items)  # PMDAから返ってきた総件数（重複込み）
                for item in kw_items:
                    if item["name"] in existing_names: continue
                    if limit and len(new_items) >= limit:
                        log(f"limit={limit}件に達したため終了")
                        break
                    log(f"  取得: {item['name']}")
                    det = get_detail(driver, item)
                    new_items.append(det)
                    existing_names.add(item["name"])
                    if len(new_items) % 100 == 0:
                        merged = _merge(existing if resume else [], new_items)
                        save(merged)
                        if os.environ.get("GITHUB_ACTIONS"):
                            git_commit(f"中間コミット: {len(new_items)}件")

                if limit and len(new_items) >= limit:
                    break
                time.sleep(0.5)

    except KeyboardInterrupt:
        log("中断")
    finally:
        driver.quit()

    if reprocess:
        merged = _apply_updates(existing, updated_items)
        log(f"再取得完了: {len(updated_items)}件更新")
    else:
        merged = _merge(existing if resume else [], new_items)
        log(f"完了: 新規{len(new_items)}件 / 合計{len(merged)}件")

    save(merged)

    # ── 健全性チェック（壊れたら気づくための仕組み） ──────────
    # 通常クロールでPMDAから1件も返らなかった = セレクタ破損やサイト変更の疑い。
    # 「新規0件」だけでは判定しない（既存と重複しただけかもしれないため）。
    healthy = True
    reason = ""
    if reprocess:
        if len(updated_items) == 0 and reprocess_items:
            healthy = False
            reason = f"reprocess対象{len(reprocess_items)}件に対し更新0件。詳細ページの構造変化の疑い。"
    else:
        if raw_found == 0:
            healthy = False
            reason = "PMDA検索結果が全キーワードで0件。検索フォーム/結果ページの構造変化の疑い。"

    stats = {
        "ran_at":       datetime.now().isoformat(),
        "mode":         "reprocess" if reprocess else "scrape",
        "group":        group,
        "raw_found":    raw_found,
        "new_items":    len(new_items),
        "updated_items": len(updated_items),
        "total_after":  len(merged),
        "healthy":      healthy,
        "reason":       reason,
    }
    try:
        STATS_FILE.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass

    if not healthy:
        log(f"⚠ 健全性チェック失敗: {reason}")
        # CI（GitHub Actions）では非ゼロ終了でジョブを失敗させ、通知を出す
        if os.environ.get("GITHUB_ACTIONS"):
            import sys as _sys
            _sys.exit(2)

    return len(updated_items) if reprocess else len(new_items)

def _apply_updates(existing, updated_items):
    """既存データに更新を適用"""
    result = []
    for m in existing:
        if m["name"] in updated_items:
            upd = updated_items[m["name"]]
            m_copy = dict(m)
            m_copy.update({
                "effect":   upd.get("effect", m.get("effect", "")),
                "ings":     upd.get("ings",   m.get("ings", [])),
                "risk":     upd.get("risk",   m.get("risk")),
                "maker":    upd.get("maker",  m.get("maker", "")),
                "cat":      upd.get("cat",    m.get("cat", "vitamin")),
                "drowsy":   upd.get("drowsy", m.get("drowsy", False)),
                "warnIngs": upd.get("warnIngs", m.get("warnIngs", [])),
                "symptoms": upd.get("symptoms", m.get("symptoms", [])),
                "note":     upd.get("note",    m.get("note", "")),
                "noteType": upd.get("noteType", m.get("noteType", "nn")),
            })
            result.append(m_copy)
        else:
            result.append(m)
    return result

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--group",      default="hira", choices=list(GROUPS.keys()))
    p.add_argument("--resume",     action="store_true")
    p.add_argument("--limit",      type=int, default=0)
    p.add_argument("--reprocess",  action="store_true", help="effect/ingsが空の既存データを再取得")
    a = p.parse_args()
    run(group=a.group, resume=a.resume, limit=a.limit, reprocess=a.reprocess)
