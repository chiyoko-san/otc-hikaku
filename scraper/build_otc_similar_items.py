#!/usr/bin/env python3
"""
厚労省「薬価基準収載品目リスト」(Excel) から、OTC類似薬「特別の料金」対象77成分に
該当する医療用医薬品の品目を抜き出し、data/otc-similar-items.json を作る。

入力:
  data/yakka/*.xlsx   厚労省サイトからダウンロードしたExcel（内用薬・外用薬・歯科用薬剤。
                      注射薬のファイルが混ざっていても自動で除外する）
  lib/otc-similar-77.ts  77成分の定義（ingredientKeys / matchAll / excludeKeys を読む）

出力:
  data/otc-similar-items.json
    {
      "generated_at": "...", "source_files": [...], "total": N,
      "items": [ { "no": 76, "code": "1149019F1xxx", "name": "ロキソニン錠60mg", "maker": "...",
                   "ingredient": "ロキソプロフェンナトリウム水和物", "spec": "60mg1錠",
                   "route": "内用薬", "price": 10.1, "surcharge": 2.5,
                   "kind": "先発"|"後発"|"その他" }, ... ]
    }

使い方:
  python scraper/build_otc_similar_items.py            # 通常
  python scraper/build_otc_similar_items.py --report   # 成分ごとの件数を表示

照合の考え方:
  薬価リストの「成分名」と厚労省77成分の表記は同じ命名なので、NFKC正規化後の完全一致で照合する
  （部分一致だと「アスコルビン酸」でモビプレップのような配合剤まで拾ってしまう）。
  完全一致で拾えないものは ALIASES（PL配合顆粒＝「非ピリン系感冒剤」など）で補い、
  ROUTES（内用/外用）と NAME_FILTERS（吸入剤・点眼・坐剤の除外など）で投与経路をそろえる。
  厚労省の「約1,100品目」とは数え方が異なる可能性があるため、サイト上では「当サイトの推計」と明記すること。
"""
import argparse, json, re, sys, unicodedata
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
XLSX_DIR = ROOT / "data" / "yakka"
TS_FILE = ROOT / "lib" / "otc-similar-77.ts"
OUT_FILE = ROOT / "data" / "otc-similar-items.json"
JST = timezone(timedelta(hours=9))

# 成分番号 → 対象とする投与経路（薬価リストの「区分」）。注射薬は常に除外
ORAL, TOPICAL = "内用薬", "外用薬"
ROUTES = {
    1: [TOPICAL], 2: [TOPICAL], 3: [ORAL], 4: [TOPICAL], 5: [TOPICAL], 6: [TOPICAL],
    7: [ORAL], 8: [ORAL], 9: [TOPICAL], 10: [TOPICAL], 11: [TOPICAL], 12: [ORAL],
    13: [ORAL], 14: [TOPICAL], 15: [TOPICAL], 16: [TOPICAL], 17: [TOPICAL], 18: [TOPICAL],
    19: [TOPICAL], 20: [TOPICAL], 21: [TOPICAL], 22: [TOPICAL], 23: [TOPICAL],
    24: [ORAL, TOPICAL], 25: [ORAL], 26: [TOPICAL], 27: [TOPICAL], 28: [TOPICAL], 29: [TOPICAL],
    30: [ORAL], 31: [TOPICAL], 32: [TOPICAL], 33: [TOPICAL], 34: [TOPICAL], 35: [ORAL],
    36: [ORAL, TOPICAL], 37: [ORAL], 38: [ORAL], 39: [TOPICAL], 40: [TOPICAL], 41: [TOPICAL],
    42: [ORAL], 43: [TOPICAL], 44: [TOPICAL], 45: [TOPICAL], 46: [ORAL], 47: [ORAL],
    48: [TOPICAL], 49: [TOPICAL], 50: [TOPICAL], 51: [ORAL], 52: [ORAL], 53: [TOPICAL],
    54: [TOPICAL], 55: [TOPICAL], 56: [ORAL], 57: [ORAL], 58: [TOPICAL], 59: [TOPICAL],
    60: [TOPICAL], 61: [TOPICAL], 62: [TOPICAL], 63: [ORAL], 64: [ORAL], 65: [ORAL],
    66: [TOPICAL], 67: [TOPICAL], 68: [TOPICAL], 69: [TOPICAL], 70: [ORAL], 71: [ORAL],
    72: [TOPICAL], 73: [TOPICAL], 74: [TOPICAL], 75: [TOPICAL], 76: [ORAL, TOPICAL], 77: [ORAL],
}

# 薬価リスト側の「成分名」が厚労省表記と異なるもの（完全一致で拾えないもの）
ALIASES = {
    22: ["クロラムフェニコール・フラジオマイシン配合剤"],   # クロマイ-P軟膏
    25: ["非ピリン系感冒剤"],                               # PL配合顆粒・幼児用PL配合顆粒
    27: ["パップ剤"],                                       # MS温シップ・ラクール温シップ
    28: ["パップ剤"],                                       # MS冷シップ
    29: ["パップ剤"],                                       # ラクール冷シップ
}

# 品名・規格に対する追加フィルタ（include: 一致必須 / exclude: 一致したら除外）
NAME_FILTERS = {
    1:  {"exclude": r"眼軟膏"},                                  # アシクロビル: 皮膚外用のみ
    10: {"exclude": r"坐|サポ|点眼"},                             # インドメタシン: 貼付・塗布のみ
    21: {"exclude": r"腟|膣|点眼|点耳"},                          # クロラムフェニコール: 皮膚外用のみ
    24: {"exclude": r"シロップ"},                                 # ケトチフェン: 小児用シロップは除外
    27: {"include": r"温シップ"},
    28: {"include": r"MS冷シップ"},
    29: {"include": r"ラクール冷シップ"},
    33: {"exclude": r"点眼|坐|サポ"},                             # ジクロフェナク: 貼付・塗布のみ
    40: {"exclude": r"点眼|点耳|眼"},                             # デキサメタゾン: 口腔用・皮膚外用
    43: {"include": r"口腔|貼付"},                                # トリアムシノロン: 口内炎用のみ
    58: {"include": r"点鼻|噴霧", "exclude": r"吸入|エアゾール|ディスカス|ロタディスク|エリプタ"},  # フルチカゾン: 点鼻のみ
    69: {"exclude": r"スクラブ|フィールド|パルクリン"},              # ポビドンヨード: 手術用消毒は除外
    72: {"exclude": r"口腔|経口"},                                # ミコナゾール: 皮膚・腟用のみ
    74: {"include": r"点鼻|噴霧"},                                # モメタゾン: 点鼻のみ
    75: {"exclude": r"カデックス"},                               # ヨウ素: 創傷被覆剤は除外
}


def nfkc(s) -> str:
    return unicodedata.normalize("NFKC", str(s)).strip() if s is not None else ""


def parse_ts_definitions(ts_path: Path) -> list[dict]:
    """lib/otc-similar-77.ts の OTC_SIMILAR_77 配列から no / name（厚労省表記）を取り出す"""
    text = ts_path.read_text(encoding="utf-8")
    entries = [{"no": int(no), "name": nfkc(name)}
               for no, name in re.findall(r"\{\s*no:\s*(\d+),\s*name:\s*'([^']*)'", text)]
    if len(entries) != 77:
        print(f"[build] ⚠️ TSから読めた成分が {len(entries)} 件（77件のはず）。ファイル形式を確認", file=sys.stderr)
    return entries


def ingredient_matches(entry: dict, ingredient: str) -> bool:
    ing = nfkc(ingredient)
    if ing == entry["name"]:
        return True
    return ing in ALIASES.get(entry["no"], [])


def load_rows(xlsx_dir: Path) -> tuple[list[dict], list[str]]:
    from openpyxl import load_workbook
    files = sorted(xlsx_dir.glob("*.xlsx"))
    if not files:
        sys.exit(f"[build] {xlsx_dir} にExcelがありません")
    rows, used = [], []
    for f in files:
        wb = load_workbook(f, read_only=True)
        ws = wb[wb.sheetnames[0]]
        header = None
        for r in ws.iter_rows(values_only=True):
            if header is None:
                header = [nfkc(c) for c in r]
                # 薬価リスト本体（区分/成分名/品名/薬価 がある）だけ使う。後発品情報の別表はスキップ
                if not ("区分" in header and "薬価" in header and "成分名" in header):
                    print(f"[build] スキップ（薬価リスト本体ではない）: {f.name}")
                    break
                idx = {h: i for i, h in enumerate(header) if h}
                used.append(f.name)
                continue
            if not r[idx["薬価基準収載医薬品コード"]]:
                continue
            route = nfkc(r[idx["区分"]])
            if route == "注射薬":
                continue
            price = r[idx["薬価"]]
            try:
                price = float(price)
            except (TypeError, ValueError):
                continue
            rows.append({
                "route": route,
                "code": nfkc(r[idx["薬価基準収載医薬品コード"]]),
                "ingredient": nfkc(r[idx["成分名"]]),
                "spec": nfkc(r[idx["規格"]]),
                "name": nfkc(r[idx["品名"]]),
                "maker": nfkc(r[idx["メーカー名"]]),
                "generic": bool(r[idx["診療報酬において加算等の算定対象となる後発医薬品"]]) if "診療報酬において加算等の算定対象となる後発医薬品" in idx else False,
                "brand": bool(r[idx["先発医薬品"]]) if "先発医薬品" in idx else False,
                "price": price,
                "expiry": nfkc(r[idx["経過措置による使用期限"]]) if "経過措置による使用期限" in idx else "",
            })
    return rows, used


def build(xlsx_dir: Path, ts_path: Path) -> dict:
    defs = parse_ts_definitions(ts_path)
    rows, used_files = load_rows(xlsx_dir)
    items = []
    for row in rows:
        for entry in defs:
            no = entry["no"]
            if row["route"] not in ROUTES.get(no, []):
                continue
            if not ingredient_matches(entry, row["ingredient"]):
                continue
            flt = NAME_FILTERS.get(no)
            target = row["name"] + " " + row["spec"]
            if flt:
                if flt.get("include") and not re.search(flt["include"], target):
                    continue
                if flt.get("exclude") and re.search(flt["exclude"], target):
                    continue
            kind = "先発" if row["brand"] else ("後発" if row["generic"] else "その他")
            items.append({
                "no": no,
                "code": row["code"],
                "name": row["name"],
                "maker": row["maker"],
                "ingredient": row["ingredient"],
                "spec": row["spec"],
                "route": row["route"],
                "price": row["price"],
                "surcharge": round(row["price"] / 4, 2),
                "kind": kind,
                "expiry": row["expiry"],
            })
            break  # 1品目は1成分にだけ紐づける（先に一致した番号を採用）
    # 表示順: 成分No → 先発 → 薬価が高い順
    kind_rank = {"先発": 0, "後発": 1, "その他": 2}
    items.sort(key=lambda x: (x["no"], kind_rank[x["kind"]], -x["price"], x["name"]))
    return {
        "generated_at": datetime.now(JST).isoformat(timespec="seconds"),
        "source_files": used_files,
        "note": "厚労省 薬価基準収載品目リストから、OTC類似薬「特別の料金」対象77成分（案）に該当する品目を当サイトが抽出したもの。最終的な対象品目は告示で確定。",
        "total": len(items),
        "items": items,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx-dir", default=str(XLSX_DIR))
    ap.add_argument("--ts", default=str(TS_FILE))
    ap.add_argument("--out", default=str(OUT_FILE))
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()

    data = build(Path(a.xlsx_dir), Path(a.ts))
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[build] {data['total']} 品目 → {out}")

    if a.report:
        defs = {d["no"]: d["name"] for d in parse_ts_definitions(Path(a.ts))}
        from collections import Counter, defaultdict
        cnt = Counter(i["no"] for i in data["items"])
        brands = defaultdict(list)
        for i in data["items"]:
            if i["kind"] == "先発" and len(brands[i["no"]]) < 3:
                brands[i["no"]].append(i["name"])
        for no in sorted(defs):
            print(f"[{no:2d}] {cnt.get(no, 0):4d}件  {defs[no][:28]:<30} 先発例: {'、'.join(brands[no])}")


if __name__ == "__main__":
    main()
