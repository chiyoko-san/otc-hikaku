#!/usr/bin/env python3
"""
fpmaj_import.py — 日薬連「医薬品等承認情報」の医薬部外品CSVインポーター

一次ソース:
  日本製薬団体連合会 医薬品等承認情報
  http://www.fpmaj.gr.jp/industry-info/pharmaceutical-approval-info/
  → 期間を指定して「医薬部外品 CSV」をブラウザでダウンロードする。
  (cosmetic-info.jp/qdap はこのデータをDB化した二次サイト。
   qdap側は明示的にbot対策をしており、直接スクレイピングは行わない)

このCSVに含まれるのは承認レベルの情報(販売名・申請者・承認日等)で、
成分・分量・効能は含まれない。そのため役割は:
  1. 「どんな医薬部外品が存在するか」の網羅シードリスト化
  2. 収載済み製品との突き合わせ(未収載の洗い出し)
成分・効能は quasi_scraper.py(メーカー公式巡回) または
quasi_products.csv(手動) で埋める2段構成とする。

使い方:
  python scraper/fpmaj_import.py <ダウンロードしたCSV> [--limit 100]
  → scraper/fpmaj_seed.csv に「name,maker,approved_at,登録状況」を出力

注意:
  このCSVは厚生労働大臣承認分が中心。承認基準に該当する品目
  (薬用化粧品・薬用歯みがき等の多く)は都道府県知事承認のため
  含まれない可能性がある。美容系はメーカー巡回が引き続き必要。
"""
import argparse
import csv
import json
import sys
from pathlib import Path

DATA_DIR = Path(__file__).parent
JSON_FILE = DATA_DIR / "medicines.json"
OUT_FILE = DATA_DIR / "fpmaj_seed.csv"

# 列名の揺れに対応するための候補(部分一致で自動検出)
NAME_KEYS = ["販売名", "名称", "品目名"]
MAKER_KEYS = ["申請者", "製造販売業者", "会社名", "業者名"]
DATE_KEYS = ["承認年月日", "承認日"]
NO_KEYS = ["承認番号"]


def open_csv(path: Path):
    """Shift_JIS(cp932) / UTF-8(BOM) を自動判別して開く"""
    for enc in ("utf-8-sig", "cp932", "utf-8"):
        try:
            with open(path, encoding=enc, newline="") as f:
                rows = list(csv.reader(f))
            if rows:
                return rows, enc
        except (UnicodeDecodeError, UnicodeError):
            continue
    raise SystemExit(f"CSVを読めませんでした(文字コード不明): {path}")


def find_col(header: list[str], keys: list[str]) -> int:
    for i, h in enumerate(header):
        if any(k in (h or "") for k in keys):
            return i
    return -1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path", help="日薬連からダウンロードした医薬部外品CSV")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    path = Path(args.csv_path)
    if not path.exists():
        raise SystemExit(f"ファイルがありません: {path}")

    rows, enc = open_csv(path)
    print(f"読込: {len(rows)}行 (文字コード: {enc})")

    # ヘッダ行を探す(先頭数行に注記があるケースに対応)
    header_idx, cols = -1, {}
    for i, row in enumerate(rows[:10]):
        ni = find_col(row, NAME_KEYS)
        mi = find_col(row, MAKER_KEYS)
        if ni >= 0 and mi >= 0:
            header_idx = i
            cols = {
                "name": ni,
                "maker": mi,
                "date": find_col(row, DATE_KEYS),
                "no": find_col(row, NO_KEYS),
            }
            break
    if header_idx < 0:
        print("ヘッダ行を自動検出できませんでした。先頭3行を表示します:")
        for row in rows[:3]:
            print("  ", row[:8])
        raise SystemExit("列名候補(販売名/申請者など)を確認して NAME_KEYS 等に追記してください")

    print(f"ヘッダ検出: {header_idx + 1}行目 / 列: {rows[header_idx]}")

    # 既存収載データ(同名判定用)
    existing = set()
    if JSON_FILE.exists():
        with open(JSON_FILE, encoding="utf-8") as f:
            existing = {m["name"] for m in json.load(f)["medicines"]}

    body = rows[header_idx + 1:]
    if args.limit:
        body = body[: args.limit]

    out, registered = [], 0
    for row in body:
        if len(row) <= cols["name"]:
            continue
        name = (row[cols["name"]] or "").strip()
        if not name:
            continue
        maker = (row[cols["maker"]] or "").strip() if cols["maker"] >= 0 else ""
        date = (row[cols["date"]] or "").strip() if cols["date"] >= 0 else ""
        is_reg = name in existing
        registered += is_reg
        out.append([name, maker, date, "収載済" if is_reg else "未収載"])

    with open(OUT_FILE, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["name", "maker", "approved_at", "status"])
        w.writerows(out)

    print(f"\n出力: {OUT_FILE}")
    print(f"  総品目: {len(out)}件 / 収載済: {registered}件 / 未収載: {len(out) - registered}件")
    print("次のステップ:")
    print("  1. 未収載品目から優先度の高い製品(整腸薬・ドリンク・美容系の主要ブランド)を選ぶ")
    print("  2. メーカー公式ページURLを quasi_sources.csv に登録して quasi_scraper.py で成分取得")
    print("  3. レビュー後 import_quasi.py --write で取り込み")
    return 0


if __name__ == "__main__":
    sys.exit(main())
