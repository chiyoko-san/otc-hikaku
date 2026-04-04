#!/usr/bin/env python3
"""
消費者庁 機能性表示食品届出データベース スクレイパー
https://www.fld.caa.go.jp/caaks/cssc01/

取得方法:
1. CSVダウンロード（推奨・高速）
   - 消費者庁サイトからCSV一括ダウンロードして本スクリプトで変換
   python fld_scraper.py --csv path/to/download.csv --merge --output scraper/medicines.json

2. Webスクレイピング（自動）
   python fld_scraper.py --scrape --merge --output scraper/medicines.json
"""
import json, time, re, argparse, csv, io
from pathlib import Path
from datetime import datetime

# カテゴリマッピング
FUNC_TO_CAT = {
    "目": "eye", "眼": "eye", "視力": "eye", "コントラスト": "eye",
    "関節": "joint", "骨": "joint", "軟骨": "joint",
    "腸内": "stomach", "腸": "stomach", "胃": "stomach", "便通": "stomach", "お腹": "stomach",
    "血糖": "circu", "血圧": "circu", "中性脂肪": "circu", "コレステロール": "circu",
    "体脂肪": "vitamin", "内臓脂肪": "vitamin",
    "肌": "skin_oral", "皮膚": "skin_oral", "シミ": "skin_oral", "肌荒れ": "skin_oral",
    "髪": "hair", "育毛": "hair",
    "睡眠": "sleep", "ストレス": "sleep",
    "疲労": "vitamin", "認知": "vitamin", "記憶": "vitamin", "集中": "vitamin",
    "鼻": "nose", "花粉": "allergy",
}

def effect_to_cat(text):
    for key, cat in FUNC_TO_CAT.items():
        if key in (text or ""):
            return cat
    return "vitamin"

def effect_to_symptoms(text):
    syms = []
    mapping = {
        "目の疲れ": "目の疲れ", "眼精疲労": "眼精疲労",
        "腸内": "腸内環境", "便通": "便通",
        "中性脂肪": "中性脂肪", "血圧": "血圧", "血糖": "血糖値",
        "体脂肪": "体脂肪", "内臓脂肪": "体脂肪",
        "睡眠": "不眠", "疲労": "肉体疲労", "認知": "認知機能",
        "肌": "肌荒れ", "シミ": "シミ・そばかす",
    }
    for key, sym in mapping.items():
        if key in (text or "") and sym not in syms:
            syms.append(sym)
    return syms

def parse_row(row_dict, next_id):
    """届出1件をmedicines形式に変換"""
    # CSVのカラム名（消費者庁の実際のCSV列名に対応）
    # 列名候補: 届出番号, 商品名, 届出者名, 機能性関与成分名, 表示しようとする機能性
    name = (
        row_dict.get("商品名") or
        row_dict.get("shonin_syouhin_name") or
        row_dict.get("name") or ""
    ).strip()
    maker = (
        row_dict.get("届出者名") or
        row_dict.get("todokedeSya_name") or
        row_dict.get("maker") or ""
    ).strip()
    effect = (
        row_dict.get("表示しようとする機能性") or
        row_dict.get("kino_hyoji") or
        row_dict.get("effect") or ""
    ).strip()
    ings_raw = (
        row_dict.get("機能性関与成分名") or
        row_dict.get("kino_seibun") or
        row_dict.get("ings") or ""
    ).strip()
    delivery_no = (
        row_dict.get("届出番号") or
        row_dict.get("todokedeNo") or ""
    ).strip()
    status = (
        row_dict.get("撤回・失効") or
        row_dict.get("status") or ""
    ).strip()

    # 撤回・失効品は除外
    if status and status not in ["", "販売中", "0", "1"]:
        return None
    if not name or len(name) < 2:
        return None

    # 成分をリスト化
    ings = []
    for ing in re.split(r'[、,，・\n]', ings_raw):
        ing = ing.strip()
        if ing and len(ing) > 1:
            ings.append(ing[:40])
    ings = ings[:10]

    # 効能を短縮
    effect_short = re.sub(r'。.+', '。', effect)[:120] if effect else ""

    return {
        "id": next_id,
        "cat": effect_to_cat(effect),
        "itype": "functional",
        "name": name[:60],
        "maker": maker[:40],
        "price": None,
        "risk": None,
        "drowsy": False,
        "symptoms": effect_to_symptoms(effect),
        "effect": effect_short,
        "ings": ings,
        "warnIngs": [],
        "note": "機能性表示食品" + ("（届出番号" + delivery_no + "）" if delivery_no else "") + "。医薬品ではありません。",
        "noteType": "nn",
        "asin": "", "rakuten_url": "", "amazon_tag": "", "price_updated_at": "",
    }

def from_csv(csv_path, limit=0):
    """CSVファイルから読み込み"""
    path = Path(csv_path)
    # エンコーディングを試す
    for enc in ["utf-8-sig", "utf-8", "shift-jis", "cp932"]:
        try:
            text = path.read_text(encoding=enc)
            break
        except Exception:
            continue
    else:
        raise ValueError("CSVファイルのエンコーディングを特定できません")

    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    print(f"[fld] CSV読み込み: {len(rows)}件")
    if rows:
        print("[fld] 列名:", list(rows[0].keys())[:8])
    return rows[:limit] if limit else rows

def from_web(limit=0):
    """Webスクレイピングで取得"""
    import urllib.request, urllib.parse

    all_rows = []
    page = 1
    page_size = 100

    print("[fld] Webスクレイピング開始...")

    # 消費者庁届出DBのエンドポイント
    # GETパラメータでページング
    base = "https://www.fld.caa.go.jp/caaks/cssc02/"

    while True:
        if limit and len(all_rows) >= limit:
            break
        params = urllib.parse.urlencode({
            "screenId": "cssc0201",
            "action": "search",
            "pageNo": page,
            "pageSize": page_size,
            "todokede_status": "1",  # 販売中のみ
        })
        url = base + "?" + params
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; OTC-Hikaku/1.0)",
            "Accept-Language": "ja",
        })
        try:
            print(f"[fld] page {page}...", end=" ", flush=True)
            with urllib.request.urlopen(req, timeout=20) as r:
                html = r.read().decode("utf-8", errors="replace")

            # HTMLからテーブル行を抽出
            rows = parse_html_table(html)
            print(f"{len(rows)}件")
            if not rows:
                break
            all_rows.extend(rows)
            if len(rows) < page_size:
                break
            page += 1
            time.sleep(1.2)
        except Exception as e:
            print(f"エラー: {e}")
            break

    return all_rows

def parse_html_table(html):
    """HTMLテーブルから届出データを抽出"""
    rows = []
    # tr行を抽出
    tr_pattern = re.compile(r'<tr[^>]*>(.*?)</tr>', re.DOTALL | re.IGNORECASE)
    td_pattern = re.compile(r'<t[dh][^>]*>(.*?)</t[dh]>', re.DOTALL | re.IGNORECASE)
    clean = re.compile(r'<[^>]+>')

    headers = []
    for i, tr in enumerate(tr_pattern.finditer(html)):
        cells = [clean.sub('', td.group(1)).strip()
                 for td in td_pattern.finditer(tr.group(1))]
        if not cells:
            continue
        if i == 0 or not headers:
            headers = cells
            continue
        if len(cells) >= 4:
            row = dict(zip(headers, cells))
            rows.append(row)
    return rows

def run(csv_path=None, scrape=False, limit=0, output_path=None, merge=False):
    out = Path(output_path) if output_path else Path(__file__).parent / "medicines.json"

    # 既存データ読み込み
    existing = []
    max_id = 0
    if merge and out.exists():
        data = json.loads(out.read_text(encoding="utf-8"))
        existing = [m for m in data.get("medicines", [])
                    if m.get("itype") != "functional"]
        max_id = max((m.get("id", 0) for m in existing), default=0)
        print(f"[fld] 既存: {len(existing)}件（functional除外）")

    # データ取得
    if csv_path:
        raw_rows = from_csv(csv_path, limit)
    elif scrape:
        raw_rows = from_web(limit)
    else:
        print("[fld] --csv <path> または --scrape を指定してください")
        return 0

    # 変換
    new_meds = []
    for row in raw_rows:
        med = parse_row(row, max_id + len(new_meds) + 1)
        if med:
            new_meds.append(med)

    # 重複除去（name+makerで判定）
    seen = set()
    deduped = []
    for m in new_meds:
        key = (m["name"], m["maker"])
        if key not in seen:
            seen.add(key)
            deduped.append(m)
    print(f"[fld] 変換: {len(new_meds)}件 → 重複除去後 {len(deduped)}件")

    all_meds = existing + deduped
    result = {
        "total": len(all_meds),
        "updated_at": datetime.now().isoformat(),
        "medicines": all_meds,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    otc  = sum(1 for m in all_meds if not m.get("itype") or m.get("itype") == "otc")
    func = sum(1 for m in all_meds if m.get("itype") == "functional")
    quas = sum(1 for m in all_meds if m.get("itype") == "quasi")
    print(f"[fld] 保存完了: 合計{len(all_meds)}件 (OTC:{otc} 機能性:{func} 医薬部外品:{quas})")
    return len(deduped)

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="消費者庁 機能性表示食品スクレイパー")
    p.add_argument("--csv",    default=None,  help="CSVファイルパス（手動ダウンロード）")
    p.add_argument("--scrape", action="store_true", help="Webスクレイピングで自動取得")
    p.add_argument("--limit",  type=int, default=0, help="取得件数上限（0=無制限）")
    p.add_argument("--output", default=None, help="出力JSONパス")
    p.add_argument("--merge",  action="store_true", help="既存medicines.jsonにマージ")
    args = p.parse_args()
    run(csv_path=args.csv, scrape=args.scrape,
        limit=args.limit, output_path=args.output, merge=args.merge)
