#!/usr/bin/env python3
"""
消費者庁 機能性表示食品届出データベース スクレイパー
https://www.fld.caa.go.jp/caaks/cssc01/

使い方:
  python fld_scraper.py --output scraper/medicines.json --merge
  python fld_scraper.py --limit 500 --output scraper/medicines.json --merge
"""
import json, time, re, argparse, sys
from pathlib import Path
from datetime import datetime

try:
    import urllib.request, urllib.parse
    HAS_URLLIB = True
except ImportError:
    HAS_URLLIB = False

# 消費者庁API設定
BASE_URL = "https://www.fld.caa.go.jp/caaks"
SEARCH_API = BASE_URL + "/cssc02/"
CSV_URL = BASE_URL + "/cssc01/"  # CSVダウンロードページ

# カテゴリマッピング（機能性表示食品の機能→サイトのカテゴリ）
FUNC_TO_CAT = {
    "目": "eye",
    "眼": "eye",
    "視力": "eye",
    "関節": "joint",
    "骨": "joint",
    "腸内": "stomach",
    "腸": "stomach",
    "胃": "stomach",
    "便通": "stomach",
    "血糖": "circu",
    "血圧": "circu",
    "中性脂肪": "circu",
    "コレステロール": "circu",
    "体脂肪": "vitamin",
    "肌": "skin_oral",
    "皮膚": "skin_oral",
    "シミ": "skin_oral",
    "髪": "hair",
    "育毛": "hair",
    "睡眠": "sleep",
    "疲労": "vitamin",
    "認知": "vitamin",
    "記憶": "vitamin",
    "集中": "vitamin",
    "ストレス": "sleep",
    "鼻": "nose",
    "花粉": "allergy",
}

def func_to_cat(effect_text):
    """効能テキストからカテゴリを推定"""
    for key, cat in FUNC_TO_CAT.items():
        if key in (effect_text or ""):
            return cat
    return "vitamin"

def fetch_api(params, timeout=15):
    """消費者庁APIからデータ取得"""
    url = SEARCH_API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; OTC-Hikaku-Bot/1.0)',
        'Accept': 'application/json, text/html',
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8')

def parse_row(row, next_id):
    """届出データ1件をmedicines.jsonの形式に変換"""
    # 届出番号: F0001 形式
    name = (row.get("shonin_syouhin_name") or row.get("name") or "").strip()
    maker = (row.get("todokedeSya_name") or row.get("maker") or "").strip()
    effect = (row.get("kino_hyoji") or row.get("effect") or "").strip()
    ings_raw = row.get("kino_seibun") or row.get("ings") or ""
    delivery_no = row.get("todokedeNo") or row.get("id") or ""
    
    if not name:
        return None
    
    # 成分をリスト化
    ings = []
    for ing in re.split(r'[、,，・]', ings_raw):
        ing = ing.strip()
        if ing and len(ing) > 1:
            ings.append(ing)
    
    cat = func_to_cat(effect)
    
    return {
        "id": next_id,
        "cat": cat,
        "itype": "functional",
        "name": name,
        "maker": maker,
        "price": None,
        "risk": None,
        "drowsy": False,
        "symptoms": [],
        "effect": effect[:120] if effect else "",
        "ings": ings[:10],
        "warnIngs": [],
        "note": f"機能性表示食品（届出番号{delivery_no}）。医薬品ではありません。",
        "noteType": "nn",
        "asin": "",
        "rakuten_url": "",
        "amazon_tag": "",
        "price_updated_at": "",
    }

def scrape_page(page_no, page_size=100):
    """1ページ分取得"""
    # 消費者庁の検索API（GETパラメータ）
    params = {
        "screenId": "cssc0201",
        "action": "search",
        "pageNo": page_no,
        "pageSize": page_size,
        "status": "1",  # 販売中
    }
    html = fetch_api(params)
    
    # JSONレスポンスかHTMLかで分岐
    if html.strip().startswith('{') or html.strip().startswith('['):
        return json.loads(html)
    
    # HTMLパース（テーブル形式）
    rows = []
    pattern = re.compile(
        r'<td[^>]*class="[^"]*todokedeNo[^"]*"[^>]*>(.+?)</td>.*?'
        r'<td[^>]*class="[^"]*syouhinName[^"]*"[^>]*>(.+?)</td>.*?'
        r'<td[^>]*class="[^"]*todokedeSya[^"]*"[^>]*>(.+?)</td>.*?'
        r'<td[^>]*class="[^"]*kinoHyoji[^"]*"[^>]*>(.+?)</td>',
        re.DOTALL
    )
    for m in pattern.finditer(html):
        no = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        name = re.sub(r'<[^>]+>', '', m.group(2)).strip()
        maker = re.sub(r'<[^>]+>', '', m.group(3)).strip()
        effect = re.sub(r'<[^>]+>', '', m.group(4)).strip()
        rows.append({"todokedeNo": no, "shonin_syouhin_name": name, "todokedeSya_name": maker, "kino_hyoji": effect})
    return rows

def run(limit=0, output_path=None, merge=False):
    out = Path(output_path) if output_path else Path(__file__).parent / "medicines.json"
    
    existing = []
    max_id = 0
    if merge and out.exists():
        data = json.loads(out.read_text(encoding='utf-8'))
        existing = data.get("medicines", [])
        # functional既存データは除去して再取得
        existing = [m for m in existing if m.get("itype") != "functional"]
        max_id = max((m.get("id", 0) for m in existing), default=0)
        print(f"[fld] 既存データ読み込み: {len(existing)}件（functionalは除外）")
    
    new_meds = []
    page = 1
    page_size = 100
    errors = 0
    
    print(f"[fld] 消費者庁 機能性表示食品データベース取得開始...")
    
    while True:
        if limit > 0 and len(new_meds) >= limit:
            break
        try:
            print(f"[fld] ページ {page} 取得中...", end=" ", flush=True)
            rows = scrape_page(page, page_size)
            
            if not rows:
                print("終了（データなし）")
                break
            
            count = 0
            for row in rows:
                med = parse_row(row, max_id + len(new_meds) + 1)
                if med:
                    new_meds.append(med)
                    count += 1
            
            print(f"{count}件取得（累計{len(new_meds)}件）")
            
            if len(rows) < page_size:
                print("[fld] 最終ページ到達")
                break
            
            page += 1
            time.sleep(1.0)  # サーバー負荷軽減
            errors = 0
            
        except Exception as e:
            print(f"エラー: {e}")
            errors += 1
            if errors >= 3:
                print("[fld] エラーが続くため停止")
                break
            time.sleep(3)
    
    print(f"[fld] 取得完了: {len(new_meds)}件")
    
    all_meds = existing + new_meds
    result = {
        "total": len(all_meds),
        "updated_at": datetime.now().isoformat(),
        "medicines": all_meds,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"[fld] 保存: {out} ({len(all_meds)}件)")
    return len(new_meds)

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="消費者庁 機能性表示食品スクレイパー")
    p.add_argument("--limit", type=int, default=0, help="取得件数上限（0=無制限）")
    p.add_argument("--output", default=None, help="出力JSONパス")
    p.add_argument("--merge", action="store_true", help="既存medicines.jsonにマージ")
    args = p.parse_args()
    run(limit=args.limit, output_path=args.output, merge=args.merge)
