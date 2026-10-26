#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_switch_candidates.py — 「処方薬名×市販」300薬の候補を、公開データから機械的に作る

入力（すべてリポジトリ内）:
  data/ndb/ndb11_naifuku_ingai.xlsx, ndb11_gaiyo.xlsx   NDBオープンデータ「処方薬」内服 外来（院外）・外用 の性年齢別薬効分類別数量（第11回）
  data/yakka/*.xlsx            厚労省 薬価基準収載品目リスト（成分名・品名・先発/後発）
  data/medicines.json          市販薬（PMDA）
  data/otc-similar-items.json  上乗せ料金 対象77成分に該当する処方薬688品目（成分番号の照合に使う）
  lib/switch-data.ts           手書きの切替30薬（同じ成分は候補から外し「既存」として扱う）

出力:
  data/switch-drugs.json       ページ生成用（Phase1）。1薬 = 1先発ブランド
  data/switch-candidates.csv   本人が目視するための一覧（順位・ブランド・成分・市販薬の有無と製品名・区分・index可否）

使い方:
  python scripts/build_switch_candidates.py            # 上位300で生成
  python scripts/build_switch_candidates.py --limit 150
  python scripts/build_switch_candidates.py --dry-run  # ファイルを書かず上位を表示

選び方（設計書どおり）:
  1. 内服・外用の外来（院外）処方数量を成分ごとに集計し、内服・外用それぞれ上位から取る
  2. 同じ成分の先発・後発を1ブランド（先発名）に集約。先発が無い成分は成分名をそのまま名前にする
  3. 除外する薬効分類: 催眠鎮静・抗不安(112)、抗てんかん(113)、精神神経用剤(117)、腫瘍用薬(42x)、麻薬(81x,82x)、漢方(520)
  4. 既存30薬と重なる成分は候補に入れない（既存ページがある）
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NDB_DIR = ROOT / "data" / "ndb"
YAKKA_DIR = ROOT / "data" / "yakka"
MED_JSON = ROOT / "data" / "medicines.json"
ITEMS_JSON = ROOT / "data" / "otc-similar-items.json"
SWITCH_TS = ROOT / "lib" / "switch-data.ts"
OUT_JSON = ROOT / "data" / "switch-drugs.json"
OUT_CSV = ROOT / "data" / "switch-candidates.csv"

EXCLUDE_CAT_PREFIX = ("111", "112", "113", "117", "325", "42", "7", "81", "82", "520")
EXCLUDE_REASON = {
    "111": "全身麻酔剤", "112": "催眠鎮静・抗不安剤", "113": "抗てんかん剤", "117": "精神神経用剤", "325": "経腸栄養剤",
    "42": "腫瘍用薬", "7": "治療目的でない薬（調剤用・診断用など）", "81": "麻薬", "82": "麻薬", "520": "漢方製剤（別途）",
}


def nfkc(s) -> str:
    return unicodedata.normalize("NFKC", str(s)).strip() if s is not None else ""


# ---------------------------------------------------------------- 薬価基準

def load_yakka() -> dict[str, dict]:
    """薬価基準収載医薬品コード → 行（build_otc_similar_items.py と同じ読み方）"""
    from openpyxl import load_workbook
    out: dict[str, dict] = {}
    for f in sorted(YAKKA_DIR.glob("*.xlsx")):
        wb = load_workbook(f, read_only=True)
        ws = wb[wb.sheetnames[0]]
        header = None
        for r in ws.iter_rows(values_only=True):
            if header is None:
                header = [nfkc(c) for c in r]
                if not ("区分" in header and "薬価" in header and "成分名" in header):
                    break
                idx = {h: i for i, h in enumerate(header) if h}
                continue
            code = r[idx["薬価基準収載医薬品コード"]]
            if not code:
                continue
            route = nfkc(r[idx["区分"]])
            if route == "注射薬":
                continue
            try:
                price = float(r[idx["薬価"]])
            except (TypeError, ValueError):
                continue
            out[nfkc(code)] = {
                "route": route,
                "code": nfkc(code),
                "ingredient": nfkc(r[idx["成分名"]]),
                "spec": nfkc(r[idx["規格"]]),
                "name": nfkc(r[idx["品名"]]),
                "maker": nfkc(r[idx["メーカー名"]]),
                "brand": bool(r[idx["先発医薬品"]]) if "先発医薬品" in idx else False,
                "generic": bool(r[idx["診療報酬において加算等の算定対象となる後発医薬品"]]) if "診療報酬において加算等の算定対象となる後発医薬品" in idx else False,
                "price": price,
            }
    if not out:
        sys.exit(f"[cand] {YAKKA_DIR} に薬価基準のExcelがありません")
    return out


# ---------------------------------------------------------------- NDB

def load_ndb(path: Path) -> list[dict]:
    """NDB 処方薬シート: 4行目までが見出し。薬効分類は結合セルなので前の値を引き継ぐ"""
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True)
    ws = wb[wb.sheetnames[0]]
    rows: list[dict] = []
    cat = catname = None
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i < 4:
            continue
        if row[0] is not None:
            cat, catname = str(row[0]).zfill(3), nfkc(row[1])
        code = row[5]
        if not code:
            continue
        try:
            qty = float(row[8])
        except (TypeError, ValueError):
            qty = 0.0
        rows.append({"cat": cat or "", "catname": catname or "", "name": nfkc(row[3]), "unit": nfkc(row[4]), "code": nfkc(code), "qty": qty, "gen": row[7]})
    return rows


def load_ndb_all() -> tuple[list[dict], list[str]]:
    files = sorted(NDB_DIR.glob("*.xlsx"))
    # ファイル名は ASCII に直して置く: ndb11_naifuku_ingai.xlsx（【内服】外来（院外）_性年齢別薬効分類別数量）、ndb11_gaiyo.xlsx（【外用】性年齢別薬効分類別数量）
    oral = [f for f in files if "naifuku" in f.name or ("内服" in f.name and "院外" in f.name and "性年齢" in f.name and "歯科" not in f.name and "医科" not in f.name)]
    ext = [f for f in files if "gaiyo" in f.name or ("外用" in f.name and "性年齢" in f.name)]
    if not oral or not ext:
        sys.exit(f"[cand] {NDB_DIR} に ndb*_naifuku_ingai.xlsx（内服 外来・院外 性年齢別）と ndb*_gaiyo.xlsx（外用 性年齢別）を置いてください")
    rows = load_ndb(oral[0]) + load_ndb(ext[0])
    return rows, [oral[0].name, ext[0].name]


# ---------------------------------------------------------------- 名前の扱い

FORM_TOKENS = [
    "OD錠", "D錠", "CR錠", "LA錠", "L錠", "SR錠", "R錠", "S錠", "Z錠", "EX錠", "錠", "カプセル", "細粒", "顆粒", "散", "ドライシロップ", "シロップ",
    "内用液", "経口液", "液", "点眼", "点鼻", "点耳", "テープ", "パップ", "ゲル", "クリーム", "軟膏", "ローション", "坐剤", "坐薬", "吸入", "エアゾール",
    "エアロゾル", "スプレー", "貼付", "配合", "チュアブル", "口腔内崩壊", "徐放", "腸溶", "ゼリー", "スティック", "フィルム", "パウダー",
    "ソフト", "ハード", "プラスター", "ローション", "うがい", "外用", "注", "ジェル", "小児用", "耳鼻科用", "眼", "経口", "粒状",
    "速崩", "糖衣", "舌下", "点滴", "消毒", "含嗽", "キット", "バッグ",
]
LEADING_RE = re.compile(r"^(?:[0-9.]+\s*(?:%|mg|g|mL|mcg|μg|単位)?\s*|強力|含嗽用|複方|新)")
GENERIC_NAME_RE = re.compile(r"「[^」]+」")


def brand_from_product(name: str) -> str:
    """品名から剤形・含量を落としてブランド名にする。'ロキソニン錠60mg' → 'ロキソニン'"""
    s = LEADING_RE.sub("", nfkc(name)).strip()
    cut = len(s)
    for tok in FORM_TOKENS:
        i = s.find(tok)
        if i >= 2 and i < cut:  # ブランド名は2文字以上残す
            cut = i
    m = re.search(r"[0-9]", s)
    if m and 0 < m.start() < cut:
        cut = m.start()
    for sep in ("・", " ", "（", "("):
        i = s.find(sep)
        if i > 0 and i < cut:
            cut = i
    b = s[:cut].strip(" -・")
    return b if len(b) >= 2 else s


def is_generic_name(name: str, ingredient: str) -> bool:
    """「サワイ」付き、または成分名で始まる品名はジェネリック扱い"""
    n = nfkc(name)
    if GENERIC_NAME_RE.search(n):
        return True
    ing_core = ingredient_core(ingredient)
    return bool(ing_core) and n.startswith(ing_core[: max(3, len(ing_core) - 2)])


SALT_SUFFIXES = (
    "水和物", "無水物", "塩酸塩", "ベシル酸塩", "フマル酸塩", "マレイン酸塩", "クエン酸塩", "酒石酸塩", "硫酸塩", "メシル酸塩", "臭化水素酸塩",
    "リン酸塩", "酢酸塩", "コハク酸塩", "トシル酸塩", "シレキセチル", "メドキソミル", "エステル", "塩化物", "臭化物", "ナトリウム", "カリウム",
    "カルシウム", "マグネシウム", "アルファデクス",
)


def ingredient_core(ingredient: str) -> str:
    """成分名から塩の名前を落として芯だけにする。'アムロジピンベシル酸塩' → 'アムロジピン'"""
    ing = ingredient.split("・")[0].strip()
    changed = True
    while changed and len(ing) > 3:
        changed = False
        for suf in SALT_SUFFIXES:
            if ing.endswith(suf) and len(ing) - len(suf) >= 3:
                ing = ing[: -len(suf)].strip()
                changed = True
    return ing


KATAKANA = {
    'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o', 'カ': 'ka', 'キ': 'ki', 'ク': 'ku', 'ケ': 'ke', 'コ': 'ko',
    'サ': 'sa', 'シ': 'shi', 'ス': 'su', 'セ': 'se', 'ソ': 'so', 'タ': 'ta', 'チ': 'chi', 'ツ': 'tsu', 'テ': 'te', 'ト': 'to',
    'ナ': 'na', 'ニ': 'ni', 'ヌ': 'nu', 'ネ': 'ne', 'ノ': 'no', 'ハ': 'ha', 'ヒ': 'hi', 'フ': 'fu', 'ヘ': 'he', 'ホ': 'ho',
    'マ': 'ma', 'ミ': 'mi', 'ム': 'mu', 'メ': 'me', 'モ': 'mo', 'ヤ': 'ya', 'ユ': 'yu', 'ヨ': 'yo', 'ラ': 'ra', 'リ': 'ri',
    'ル': 'ru', 'レ': 're', 'ロ': 'ro', 'ワ': 'wa', 'ヲ': 'o', 'ン': 'n', 'ガ': 'ga', 'ギ': 'gi', 'グ': 'gu', 'ゲ': 'ge',
    'ゴ': 'go', 'ザ': 'za', 'ジ': 'ji', 'ズ': 'zu', 'ゼ': 'ze', 'ゾ': 'zo', 'ダ': 'da', 'ヂ': 'ji', 'ヅ': 'zu', 'デ': 'de',
    'ド': 'do', 'バ': 'ba', 'ビ': 'bi', 'ブ': 'bu', 'ベ': 'be', 'ボ': 'bo', 'パ': 'pa', 'ピ': 'pi', 'プ': 'pu', 'ペ': 'pe',
    'ポ': 'po', 'ヴ': 'vu',
}
SMALL = {'ャ': 'ya', 'ュ': 'yu', 'ョ': 'yo', 'ァ': 'a', 'ィ': 'i', 'ゥ': 'u', 'ェ': 'e', 'ォ': 'o'}


def romaji(s: str) -> str:
    """カタカナ→ヘボン式ローマ字（URL用）。読めない文字（漢字など）は落とす"""
    out = []
    i = 0
    s = nfkc(s)
    while i < len(s):
        ch = s[i]
        nxt = s[i + 1] if i + 1 < len(s) else ""
        if ch == "ッ":
            if nxt in KATAKANA:
                out.append(KATAKANA[nxt][0])
            i += 1
            continue
        if ch == "ー":
            i += 1
            continue
        if ch in KATAKANA:
            base = KATAKANA[ch]
            if nxt in SMALL:
                head = base[:-1] if base[-1] in "aiueo" else base
                if head.endswith("sh") or head.endswith("ch") or head.endswith("j"):
                    out.append(head + SMALL[nxt][-1])
                else:
                    out.append(head + SMALL[nxt])
                i += 2
                continue
            out.append(base)
            i += 1
            continue
        if ch.isascii() and ch.isalnum():
            out.append(ch.lower())
        i += 1
    r = "".join(out)
    r = re.sub(r"-+", "-", r)
    return r.strip("-")


# ---------------------------------------------------------------- 市販薬の照合

def norm_ing(s: str) -> str:
    """lib/slug.ts の normalizeIngredientName と同じ規則"""
    s = re.sub(r"[(（][^)）]*[)）]", "", s)
    s = re.sub(r"\d+(\.\d+)?\s*(mg|ml|g|μg|iu|%)", "", s, flags=re.I)
    s = re.sub(r"\s+$", "", s)
    s = re.sub(r"Na水和物$", "", s, flags=re.I)
    s = re.sub(r"水和物$", "", s)
    s = re.sub(r"無水物$", "", s)
    s = re.sub(r"ナトリウム$", "Na", s)
    return s.strip()


def otc_index(meds: list[dict]) -> list[tuple[dict, list[str]]]:
    out = []
    for m in meds:
        if not m.get("effect"):
            continue
        ings = [norm_ing(nfkc(i)) for i in (m.get("ings") or []) if str(i).strip()]
        if ings:
            out.append((m, ings))
    return out


def match_otc(ingredient: str, index) -> tuple[list[dict], list[dict]]:
    """戻り値: (単剤の一致, 配合剤の一致)。配合の処方薬は全成分が入っている市販薬だけ"""
    parts = [norm_ing(p) for p in ingredient.split("・") if p.strip()]
    if not parts:
        return [], []
    single, combo = [], []
    for m, ings in index:
        if all(any(p == x for x in ings) for p in parts):
            if len(ings) == len(parts):
                single.append(m)
            else:
                combo.append(m)
    return single, combo


RISK_LABEL = {1: "第1類", 2: "第2類", 2.5: "指定第2類", 3: "第3類"}


# ---------------------------------------------------------------- 既存30薬

def existing_switch() -> dict[str, dict]:
    """lib/switch-data.ts の ingredientKeys → slug（同じ成分の候補は『既存』にする）"""
    if not SWITCH_TS.exists():
        return {}
    ts = SWITCH_TS.read_text(encoding="utf-8")
    out = {}
    for block in re.split(r"\n  \{\n    slug: '", ts)[1:]:
        slug = block.split("'", 1)[0]
        rx = re.search(r"rxName: '([^']+)'", block)
        keys = re.search(r"ingredientKeys: \[([^\]]*)\]", block)
        if keys:
            for k in keys.group(1).split(","):
                k = k.strip().strip("'")
                if k:
                    out[k] = {"slug": slug, "rx": rx.group(1) if rx else slug}
    return out


# ---------------------------------------------------------------- main

# 機械的に決めにくい成分の名前と slug（成分名 → (ブランド表示名, slug)）
OVERRIDES = {
    "パップ剤": ("MS温シップ・MS冷シップ", "ms-shippu"),
    "炭酸水素ナトリウム": ("重曹（炭酸水素ナトリウム）", "juso"),
    "サリチル酸": ("サリチル酸ワセリン", "sarichirusan-waserin"),
    "スギ花粉エキス": ("シダキュア", "shidakyua"),
}


def build(limit: int) -> tuple[list[dict], list[dict], dict]:
    yakka = load_yakka()
    ndb, ndb_files = load_ndb_all()
    meds = json.loads(MED_JSON.read_text(encoding="utf-8"))["medicines"]
    oidx = otc_index(meds)
    items = json.loads(ITEMS_JSON.read_text(encoding="utf-8"))["items"]
    code_to_no = {i["code"]: i["no"] for i in items}
    existing = existing_switch()

    groups: dict[str, dict] = defaultdict(lambda: {"qty_oral": 0.0, "qty_ext": 0.0, "cats": Counter(), "products": []})
    unmatched = 0
    for r in ndb:
        y = yakka.get(r["code"])
        if not y:
            unmatched += 1
            continue
        g = groups[y["ingredient"]]
        if y["route"] == "内用薬":
            g["qty_oral"] += r["qty"]
        else:
            g["qty_ext"] += r["qty"]
        g["cats"][(r["cat"], r["catname"])] += r["qty"]
        # 品名は NDB 側（実際の製品名。薬価基準は統一名収載で「アスピリン腸溶錠」のように書かれる）
        g["products"].append({**y, "name": r["name"] or y["name"], "listed_name": y["name"], "qty": r["qty"], "unit": r["unit"], "gen": r.get("gen")})

    def rank_list(key):
        lst = [(ing, g) for ing, g in groups.items() if g[key] > 0]
        lst.sort(key=lambda kv: -kv[1][key])
        return {ing: i + 1 for i, (ing, g) in enumerate(lst)}

    rank_oral = rank_list("qty_oral")
    rank_ext = rank_list("qty_ext")

    def main_cat(g):
        return g["cats"].most_common(1)[0][0]

    cands = []
    excluded = []
    for ing, g in groups.items():
        cat, catname = main_cat(g)
        ro, re_ = rank_oral.get(ing), rank_ext.get(ing)
        # 内服・外用それぞれの順位の良いほうで並べる（外用は品目が少ないので係数で内服と並べる）
        scores = [x for x in (ro, (re_ * 4) if re_ else None) if x is not None]
        if not scores:
            continue
        score = min(scores)
        reason = next((EXCLUDE_REASON[p] for p in EXCLUDE_CAT_PREFIX if cat.startswith(p)), None)
        # 同じ製品名（メーカー違いの行）は1つにまとめる
        agg: dict[str, dict] = {}
        for p in g["products"]:
            key = p["name"]
            if key in agg:
                agg[key]["qty"] += p["qty"]
            else:
                agg[key] = dict(p)
        prods = sorted(agg.values(), key=lambda p: -p["qty"])
        brand_prods = [p for p in prods if p["brand"] or not is_generic_name(p["name"], ing)]
        top = brand_prods[0] if brand_prods else prods[0]
        brand = brand_from_product(top["name"]) if brand_prods else ingredient_core(ing)
        if ing in OVERRIDES:
            brand = OVERRIDES[ing][0]
        if any(k in ing for k in existing):
            ex = next(v for k, v in existing.items() if k in ing)
            reason = f"既存ページあり（/switch/{ex['slug']}/）"
        row = {
            "ingredient": ing, "brand": brand, "top_product": top["name"], "top_maker": top["maker"],
            "cat": cat, "catname": catname, "rank_oral": ro, "rank_ext": re_, "score": score,
            "qty_oral": g["qty_oral"], "qty_ext": g["qty_ext"], "routes": sorted({p["route"] for p in prods}),
            "products": prods, "exclude": reason,
        }
        (excluded if reason else cands).append(row)

    cands.sort(key=lambda r: (r["score"], -r["qty_oral"] - r["qty_ext"]))
    cands = cands[:limit]

    used_slugs = {v["slug"] for v in existing.values()}
    for i, r in enumerate(cands, 1):
        r["rank"] = i
        single, combo = match_otc(r["ingredient"], oidx)
        r["otc_single"] = single
        r["otc_combo"] = combo
        risks = Counter(m.get("risk") for m in single if m.get("risk"))
        r["otc_risk"] = risks.most_common(1)[0][0] if risks else None
        nos = {code_to_no[p["code"]] for p in r["products"] if p["code"] in code_to_no}
        r["otc_similar_no"] = sorted(nos)[0] if nos else None
        base = OVERRIDES[r["ingredient"]][1] if r["ingredient"] in OVERRIDES else (romaji(r["brand"]) or f"rx-{r['rank']}")
        slug = base
        n = 2
        while slug in used_slugs:
            slug = f"{base}-{n}"
            n += 1
        used_slugs.add(slug)
        r["slug"] = slug
        r["slug_needs_check"] = r["ingredient"] not in OVERRIDES and (not re.fullmatch(r"[a-z][a-z0-9-]*", base) or any(not (c.isascii() or '\u30a0' <= c <= '\u30ff') for c in r["brand"]))
        # Phase1 で検索エンジンに出すページ: 同じ成分を含む市販薬がある（単剤・配合を問わず）か、上乗せ料金の対象
        r["index"] = bool(single) or bool(combo) or r["otc_similar_no"] is not None

    meta = {"ndb_files": ndb_files, "ndb_rows": len(ndb), "ndb_unmatched": unmatched, "groups": len(groups), "excluded": len(excluded)}
    return cands, excluded, meta


def to_json(cands: list[dict]) -> dict:
    out = []
    for r in cands:
        rx_items = [{"code": p["code"], "name": p["name"], "spec": p["spec"], "maker": p["maker"], "price": p["price"],
                     "kind": "先発" if p["brand"] else ("後発" if (p["generic"] or is_generic_name(p["name"], r["ingredient"])) else "その他"),
                     "route": p["route"], "qty": round(p["qty"])}
                    for p in r["products"][:40]]
        # 先発 → その他（ブランド名の長期収載品など）→ ジェネリック の順、同じ区分は処方数量順
        order = {"先発": 0, "その他": 1, "後発": 2}
        rx_items.sort(key=lambda i: (order.get(i["kind"], 3), -i["qty"]))
        out.append({
            "slug": r["slug"],
            "rxName": r["brand"],
            "genericName": r["ingredient"],
            "ingredientKeys": [norm_ing(p) for p in r["ingredient"].split("・") if p.strip()],
            "categoryLabel": r["catname"],
            "catCode": r["cat"],
            "routes": r["routes"],
            "otcSimilarNo": r["otc_similar_no"],
            "otcRisk": r["otc_risk"],
            "otcSingleIds": [m["id"] for m in r["otc_single"]],
            "otcComboIds": [m["id"] for m in r["otc_combo"]],
            "index": r["index"],
            "rank": r["rank"],
            "rxItems": rx_items,
            "phase": 1,
        })
    return {"generated_from": "NDBオープンデータ（第11回、2024年4月〜2025年3月）・厚労省薬価基準・PMDA承認情報", "total": len(out), "drugs": out}


def to_csv_rows(cands: list[dict]) -> list[list]:
    rows = [["順位", "ブランド", "slug", "slug要確認", "成分", "薬効分類", "内服順位", "外用順位", "代表品名", "メーカー", "上乗せ対象No", "市販薬(単剤)数", "市販薬(配合)数", "区分", "index", "単剤の例", "配合の例"]]
    for r in cands:
        rows.append([
            r["rank"], r["brand"], r["slug"], "要確認" if r["slug_needs_check"] else "", r["ingredient"], f"{r['cat']} {r['catname']}",
            r["rank_oral"] or "", r["rank_ext"] or "", r["top_product"], r["top_maker"], r["otc_similar_no"] or "",
            len(r["otc_single"]), len(r["otc_combo"]), RISK_LABEL.get(r["otc_risk"], ""), "index" if r["index"] else "noindex",
            "／".join(m["name"] for m in r["otc_single"][:5]), "／".join(m["name"] for m in r["otc_combo"][:3]),
        ])
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=300)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    cands, excluded, meta = build(a.limit)
    n_index = sum(1 for r in cands if r["index"])
    n_single = sum(1 for r in cands if r["otc_single"])
    print(f"[cand] NDB {meta['ndb_rows']}行（薬価基準と一致しない {meta['ndb_unmatched']}行）→ 成分 {meta['groups']}、除外 {meta['excluded']}、候補 {len(cands)}")
    print(f"[cand] 市販薬(単剤)あり {n_single}、上乗せ対象 {sum(1 for r in cands if r['otc_similar_no'])}、index {n_index}、noindex {len(cands) - n_index}")
    if a.dry_run:
        for r in cands[:60]:
            print(f"{r['rank']:3d} {r['brand'][:14]:14s} /switch/{r['slug']}/ {r['ingredient'][:22]:22s} 単剤{len(r['otc_single']):3d} 配合{len(r['otc_combo']):3d} {'No.'+str(r['otc_similar_no']) if r['otc_similar_no'] else ''} {'index' if r['index'] else ''}")
        return 0
    OUT_JSON.write_text(json.dumps(to_json(cands), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        csv.writer(f).writerows(to_csv_rows(cands))
    print(f"[cand] 書き込み: {OUT_JSON.relative_to(ROOT)}, {OUT_CSV.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
