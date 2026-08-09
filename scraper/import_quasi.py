#!/usr/bin/env python3
"""
import_quasi.py — 医薬部外品・指定医薬部外品のCSV登録パイプライン

背景:
  PMDAの添付文書検索は「一般用医薬品・要指導医薬品」のみが対象で、
  医薬部外品・指定医薬部外品を横断的に収載した公的DBは存在しない。
  (承認は大臣/知事に分かれ、成分・分量はパッケージ表示とメーカー公式サイトが一次情報)

  そのため本スクリプトは、メーカー公式サイト等を確認しながら手入力した
  CSV(scraper/quasi_products.csv)を medicines.json にマージする方式をとる。
  フロントエンドは itype: 'quasi' / 'designated_quasi' に対応済みで、
  マージすれば即座に一覧・検索・詳細ページに反映される。

使い方:
  1. scraper/quasi_products.csv に製品を追記(1行1製品)
  2. python scraper/import_quasi.py           # dry-run(検証のみ)
  3. python scraper/import_quasi.py --write   # medicines.json に反映
  4. cp scraper/medicines.json data/medicines.json && git commit

CSV列:
  name(必須), maker, itype(quasi|designated_quasi), cat,
  effect, ings(;区切り。分量は「成分名(100mg)」形式), symptoms(;区切り), note
"""
import csv
import json
import argparse
from pathlib import Path

DATA_DIR = Path(__file__).parent
CSV_FILE = DATA_DIR / "quasi_products.csv"
JSON_FILE = DATA_DIR / "medicines.json"

# 医薬部外品用のID帯(PMDA由来のIDと衝突しない領域)
QUASI_ID_BASE = 900000

VALID_ITYPES = {"quasi", "designated_quasi"}
VALID_CATS = {
    "cold","stomach","allergy","cough","nose","eye","ext_pain","ext_skin",
    "foot","hair","skin_oral","women","sleep","smoking","motion","oral",
    "anal","circu","test","disinfect","kampo","joint","vitamin",
    "quasi_skin","quasi_oral","quasi_hair",
}


def load_json():
    with open(JSON_FILE, encoding="utf-8") as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="medicines.jsonに書き込む(省略時はdry-run)")
    args = ap.parse_args()

    if not CSV_FILE.exists():
        print(f"CSVが見つかりません: {CSV_FILE}")
        return 1

    data = load_json()
    meds = data["medicines"]
    existing_names = {m["name"] for m in meds}
    max_quasi_id = max(
        [m["id"] for m in meds if m["id"] >= QUASI_ID_BASE], default=QUASI_ID_BASE
    )

    added, skipped, errors = [], [], []
    with open(CSV_FILE, encoding="utf-8-sig") as f:
        for i, row in enumerate(csv.DictReader(f), start=2):  # ヘッダ行=1
            name = (row.get("name") or "").strip()
            if not name:
                continue
            if name in existing_names:
                skipped.append(name)
                continue

            itype = (row.get("itype") or "").strip()
            if itype not in VALID_ITYPES:
                errors.append(f"L{i} {name}: itypeが不正 ({itype})")
                continue
            cat = (row.get("cat") or "quasi_skin").strip()
            if cat not in VALID_CATS:
                errors.append(f"L{i} {name}: catが不正 ({cat})")
                continue

            ings = [x.strip() for x in (row.get("ings") or "").split(";") if x.strip()]
            symptoms = [x.strip() for x in (row.get("symptoms") or "").split(";") if x.strip()]

            max_quasi_id += 1
            added.append({
                "id": max_quasi_id,
                "cat": cat,
                "name": name,
                "maker": (row.get("maker") or "").strip(),
                "price": None,
                "risk": None,
                "itype": itype,
                "drowsy": False,
                "symptoms": symptoms,
                "effect": (row.get("effect") or "").strip(),
                "ings": ings,
                "warnIngs": [],
                "note": (row.get("note") or "").strip(),
                "noteType": "nn",
                "asin": None,
                "rakuten_url": None,
            })
            existing_names.add(name)

    print(f"追加候補: {len(added)}件 / 既存スキップ: {len(skipped)}件 / エラー: {len(errors)}件")
    for e in errors:
        print("  NG:", e)
    for m in added[:10]:
        print(f"  + [{m['itype']}] {m['name']} ({m['maker']}) 成分{len(m['ings'])}件")

    if errors:
        print("エラーを修正してから再実行してください(書き込みは行いません)")
        return 1

    if args.write and added:
        meds.extend(added)
        with open(JSON_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        print(f"書き込み完了: 合計{len(meds)}件")
        print("次: cp scraper/medicines.json data/medicines.json してcommit")
    elif added:
        print("dry-runです。反映するには --write を付けて実行してください")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
