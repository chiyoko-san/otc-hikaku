#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pmda_monthly.py -- PMDAの月次自動更新（GitHub Actionsから実行）

やること:
  1. PMDA全件クロール（pmda_v4の実績ロジックをそのまま使用）
  2. 申告件数と突き合わせ、充足率98.5%未満なら「クロール不良」としてジョブを失敗させる
     → 不完全なデータで medicines.json を上書きする事故を防ぐ
  3. medicines.json に無い新規品目を検出
  4. 新規品目の詳細（成分・効能）をPMDA詳細ページから取得
  5. medicines.json に既存と同じ形式で追記
  6. 販売終了の疑い（PMDAから消えた品目）はレポートに記載のみ（削除しない）
  7. data/updates/YYYY-MM.md にレポート、YYYY-MM.json に新規品目リストを出力

使い方（リポジトリのルートで実行する前提）:
    python scraper/pmda_monthly.py --run
    python scraper/pmda_monthly.py --run --limit-new 30   # 新規の詳細取得を30件まで
"""

import argparse
import collections
import datetime
import json
import os
import re
import sys
import time
import unicodedata

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pmda_v4 import PMDA, RISKS, norm_name          # 実績のあるクローラー

MEDICINES = "data/medicines.json"
UPDATES_DIR = "data/updates"
BASE = "https://www.info.pmda.go.jp/ogo/"
UA = ("Mozilla/5.0 (compatible; kusuri-compass-bot/1.0; "
      "+https://kusuri-compass.com)")
SLEEP = 1.2
RETRY = 3
COVERAGE_MIN = 0.985      # 充足率がこれ未満なら失敗させる

KEY_ORDER = ["id", "cat", "itype", "name", "maker", "seller", "price", "risk",
             "drowsy", "symptoms", "effect", "ings", "warnIngs", "note",
             "noteType", "asin", "rakuten_url", "amazon_tag",
             "price_updated_at", "pmda_url", "pmda_id", "source", "_at"]

RISK_INT = {"要指導医薬品": 0, "第１類医薬品": 1, "第1類医薬品": 1,
            "第「２」類医薬品": 2, "第「2」類医薬品": 2,
            "第２類医薬品": 2, "第2類医薬品": 2,
            "第３類医薬品": 3, "第3類医薬品": 3}


# ===== カテゴリ判定（fix_cat.py と同一） =====
ID_RE = re.compile(r"([A-Z]\d{10})_(\d+)_(\d+)")
# 漢方の処方名（葛根湯・当帰芍薬散・八味地黄丸・当帰飲子 など）
KAMPO_NAME = re.compile(r"(湯|散|丸|飲|飲子|膏|丹|料)(（[^）]*）)?$")

# PMDAの薬効分類 → サイトのカテゴリ
YAKKO_MAP = {
    # かぜ・解熱鎮痛
    "かぜ薬（内用）": "cold", "かぜ薬（外用）": "cold", "解熱鎮痛薬": "cold",
    "小児用かぜ薬": "cold",
    # せき・たん
    "鎮咳去痰薬": "cough", "去痰薬": "cough",
    # 鼻・耳
    "鼻炎用内服薬": "nose", "鼻炎用点鼻薬": "nose",
    "その他の耳鼻科用薬": "nose", "点耳薬": "nose",
    # アレルギー
    "抗ヒスタミン薬主薬製剤": "allergy", "その他のアレルギー用薬": "allergy",
    "内服アレルギー用薬": "allergy",
    # 胃腸
    "制酸・健胃・消化・整腸を2以上標榜するもの": "stomach",
    "健胃薬": "stomach", "整腸薬": "stomach", "制酸薬": "stomach",
    "消化薬": "stomach", "止瀉薬": "stomach", "瀉下薬（下剤）": "stomach",
    "浣腸薬": "stomach", "胃腸鎮痛鎮けい薬": "stomach",
    "その他の消化器官用薬": "stomach",
    "ヒスタミンH2受容体拮抗剤含有薬": "stomach", "駆虫薬": "stomach",
    # 目
    "一般点眼薬": "eye", "人工涙液": "eye", "アレルギー用点眼薬": "eye",
    "洗眼薬": "eye", "抗菌性点眼薬": "eye", "眼科用薬": "eye",
    "コンタクトレンズ装着液": "eye", "その他の眼科用薬": "eye",
    # 口・のど・歯
    "口腔咽喉薬（せき，たんを標榜しないトローチ剤を含む）": "oral",
    "口腔咽喉薬": "oral", "含嗽薬": "oral", "口内炎用薬": "oral",
    "歯痛・歯槽膿漏薬": "oral", "その他の歯科口腔用薬": "oral",
    # 外用（痛み）
    "鎮痛・鎮痒・収れん・消炎薬（パップ剤を含む）": "__ext_split__",
    "外用鎮痛消炎薬": "ext_pain",
    # 外用（皮膚）
    "皮膚軟化薬（吸出しを含む）": "ext_skin", "その他の外皮用薬": "ext_skin",
    "化膿性疾患用薬": "ext_skin", "しもやけ・あかぎれ用薬": "ext_skin",
    "抗ウイルス薬": "ext_skin", "きず消毒保護剤": "ext_skin",
    # 水虫
    "みずむし・たむし用薬": "foot",
    # 消毒・衛生
    "殺菌消毒薬（特殊絆創膏を含む）": "disinfect", "消毒薬": "disinfect",
    "殺菌消毒薬": "disinfect", "その他の公衆衛生用薬": "disinfect",
    "殺虫薬": "disinfect", "忌避剤": "disinfect",
    # 痔・泌尿
    "外用痔疾用薬": "anal", "内用痔疾用薬": "anal",
    "その他の泌尿生殖器官及び肛門用薬": "anal",
    # 女性
    "婦人薬": "women", "その他の女性用薬": "women", "避妊薬": "women",
    # 睡眠・精神
    "催眠鎮静薬": "sleep", "眠気防止薬": "sleep",
    "その他の精神神経用薬": "sleep", "小児鎮静薬（小児五疳薬等）": "sleep",
    # 乗物酔い
    "鎮うん薬（乗物酔防止薬，つわり用薬を含む）": "motion", "鎮暈薬": "motion",
    # 毛髪
    "毛髪用薬（発毛，養毛，ふけ，かゆみ止め用薬等）": "hair", "毛髪用薬": "hair",
    # 循環器
    "強心薬（センソ含有製剤等）": "circu", "その他の循環器・血液用薬": "circu",
    "動脈硬化用薬（リノール酸，レシチン主薬製剤等）": "circu",
    "高コレステロール改善薬": "circu", "貧血用薬": "circu",
    # 検査薬
    "一般用検査薬（妊娠検査）": "test",
    "一般用検査薬（尿糖・尿タンパク用）": "test",
    "その他の一般用検査薬": "test", "一般用検査薬": "test",
    # 禁煙
    "禁煙補助剤": "smoking",
    # 漢方・生薬
    "生薬製剤（他の薬効群に属さない製剤）": "kampo",
    "その他の漢方製剤": "kampo", "漢方製剤": "kampo",
}

# 「〜主薬製剤」「ビタミン〜」は滋養強壮。効能に「眼精疲労」があっても目薬ではない
VITAMIN_PAT = re.compile(r"主薬製剤|ビタミン含有保健薬|滋養強壮")

# 最後の手段。ここに来るのは対応表にも漢方にも当てはまらなかったものだけ
FALLBACK = [
    ("eye", ["点眼", "結膜", "眼科"]),          # ← 「眼」1文字では判定しない
    ("cold", ["かぜの諸症状", "感冒の諸症状"]),
    ("cough", ["せき", "たん"]),
    ("stomach", ["胃", "腸", "下痢", "便秘", "胸やけ"]),
    ("ext_skin", ["湿疹", "かぶれ", "皮膚炎", "虫さされ"]),
    ("ext_pain", ["打撲", "ねんざ", "肩こり", "腰痛", "筋肉痛"]),
    ("anal", ["痔"]),
    ("women", ["月経", "更年期"]),
    ("vitamin", ["滋養強壮", "肉体疲労", "栄養補給", "ビタミン"]),
]

# パップ剤等をどちらに寄せるか。該当語の数が多いほうを採用する
PAIN_WORDS = ["打撲", "ねんざ", "捻挫", "肩こり", "腰痛", "筋肉痛", "筋肉疲労",
              "関節痛", "神経痛", "腱鞘炎", "五十肩", "骨折痛"]
SKIN_WORDS = ["湿疹", "皮膚炎", "かぶれ", "かゆみ", "虫さされ", "あせも",
              "じんましん", "しもやけ", "ただれ", "にきび", "切傷", "ひび",
              "あかぎれ", "靴ずれ", "やけど"]


def decide(yakko, effect, name):
    """(cat, 根拠) を返す。"""
    y = (yakko or "").split("\n")[0].strip()   # 複数分類は先頭を採用
    eff = effect or ""

    if y:
        if VITAMIN_PAT.search(y):
            return "vitamin", "主薬製剤・保健薬"
        hit = YAKKO_MAP.get(y)
        if hit == "__ext_split__":
            npain = sum(w in eff for w in PAIN_WORDS)
            nskin = sum(w in eff for w in SKIN_WORDS)
            return ("ext_pain" if npain > nskin else "ext_skin"), \
                "鎮痛鎮痒（効能で振り分け）"
        if hit:
            return hit, "薬効分類の対応表"
        if KAMPO_NAME.search(y):
            return "kampo", "漢方の処方名"
        # 葛根湯加川きゅう辛夷 のように末尾が処方名で終わらないもの
        if len(y) <= 16 and re.search(r"[湯散丸飲膏丹]", y) and y not in YAKKO_MAP:
            return "kampo", "漢方の処方名"
        for k, v in YAKKO_MAP.items():
            if v != "__ext_split__" and (k in y or y in k):
                return v, "薬効分類の部分一致"

    hay = eff + " " + (name or "")
    for cat, words in FALLBACK:
        if any(w in hay for w in words):
            return cat, "効能からの推測"
    return "", "判定できず"

# ===== 成分・眠気・警告の判定（pmda_ogo4.py と同一） =====
WARN_CHECK = ["アリルイソプロピルアセチル尿素", "ブロムワレリル尿素",
              "ブロモバレリル尿素", "ジヒドロコデインリン酸塩",
              "コデインリン酸塩", "ジヒドロコデイン"]
DROWSY_ING = ["クロルフェニラミン", "ジフェンヒドラミン", "プロメタジン",
              "ジフェニルピラリン", "コデイン", "ジヒドロコデイン",
              "クレマスチン", "メキタジン", "ケトチフェン"]
DROWSY_TEXT = re.compile(r"乗物又は機械類の運転操作|乗り物又は機械類の運転操作")
# 外用・点眼など、飲まない薬。成分に眠気成分があっても drowsy にしない
EXTERNAL = re.compile(r"点眼|眼科用|外用|外皮|軟膏|クリーム|貼付|パップ|坐|"
                      r"殺虫|忌避|消毒|水虫|たむし|毛髪|育毛|うがい|含嗽|"
                      r"鼻炎用点鼻|検査")
# 漢方の処方名らしい薬効分類（温経湯・当帰飲子・紫雲膏 など）
KAMPO_NAME = re.compile(r"(湯|散|丸|飲子|膏|飲|湯加[^ ]*)$")
EXTERNAL = re.compile(r"点眼|眼科用|外用|外皮|軟膏|クリーム|貼付|パップ|坐|"
                      r"殺虫|忌避|消毒|水虫|たむし|毛髪|育毛|うがい|含嗽|"
                      r"鼻炎用点鼻|検査")
SYM_MAP = [
    ("頭痛", ["頭痛"]), ("発熱", ["発熱", "解熱"]),
    ("のど痛", ["咽喉痛", "のど痛", "のどの痛み"]),
    ("月経痛", ["月経痛", "生理痛"]),
    ("鼻水", ["鼻水", "鼻汁"]), ("鼻づまり", ["鼻づまり", "鼻閉"]),
    ("目のかゆみ", ["目のかゆみ", "眼のかゆみ"]),
    ("せき", ["せき", "咳"]), ("たん", ["たん", "痰"]),
    ("胃痛", ["胃痛", "胃部不快感"]), ("胸やけ", ["胸やけ"]),
    ("下痢", ["下痢"]), ("便秘", ["便秘"]),
    ("肌荒れ", ["肌荒れ", "皮膚炎"]), ("かゆみ", ["かゆみ", "そう痒"]),
    ("虫刺され", ["虫さされ", "虫刺され"]), ("水虫", ["水虫", "白癬"]),
    ("肉体疲労", ["肉体疲労", "滋養強壮", "疲労"]),
    ("眼精疲労", ["眼精疲労", "目の疲れ"]),
    ("不眠", ["不眠", "寝つき"]), ("乗物酔い", ["乗物酔い", "動揺病"]),
    ("口内炎", ["口内炎"]), ("腰痛", ["腰痛"]),
    ("関節痛", ["関節痛"]), ("筋肉痛", ["筋肉痛"]), ("神経痛", ["神経痛"]),
    ("胃酸過多", ["胃酸過多"]), ("嘔吐", ["嘔吐", "吐き気"]),
]
def fetch(pid, rev, seq, session):
    """(html, url, 理由) を返す。html が None なら理由に原因が入る。"""
    url = f"{BASE}{pid}_{rev}_{seq}"
    last = ""
    for i in range(RETRY):
        try:
            r = session.get(url, timeout=40)
            r.encoding = "euc-jp"          # ← このページはEUC-JP
            time.sleep(SLEEP)
            if r.status_code >= 400:
                last = f"HTTP {r.status_code}"
                continue
            body = r.text or ""
            if len(body) < 300:
                return None, url, f"中身が空（HTTP {r.status_code} / {len(body)}字）"
            return body, url, ""
        except Exception as e:
            last = f"{type(e).__name__}: {str(e)[:60]}"
            time.sleep(SLEEP * (i + 2) * 2)
    return None, url, last or "原因不明"
def parse(html):
    """「項目 / 内容」テーブルを辞書にする。成分分量は入れ子表から取る。"""
    soup = BeautifulSoup(html, "html.parser")
    out, ings = {}, []
    for td in soup.find_all("td", class_="head"):
        lab = re.sub(r"\s+", "", td.get_text())
        val = td.find_next_sibling("td")
        if not val:
            continue
        if lab == "成分分量":
            inner = val.find("table")
            if inner:
                for tr in inner.find_all("tr"):
                    cells = [re.sub(r"\s+", " ", c.get_text(" ", strip=True))
                             for c in tr.find_all(["td", "th"])]
                    if len(cells) < 2:
                        continue
                    name, amount = cells[0].strip(), cells[1].strip()
                    if not name or name in ("成分", "分量", "内訳"):
                        continue
                    if any(s in name for s in ("添加物", "合計", "備考")):
                        continue
                    ings.append(f"{name}({amount})" if amount else name)
            out[lab] = val.get_text("\n", strip=True)
        else:
            out[lab] = val.get_text("\n", strip=True)
    return out, ings
def is_external(yakko, form):
    return bool(EXTERNAL.search((yakko or "") + " " + (form or "")))

# ===== 発売元の分離（add_seller2.py と同一） =====
SPLIT = re.compile(r"販売会社／|販売元／|発売元／|会社名：")


NOISE = re.compile(r"HTML|PDF|添付文書情報|詳細|一覧|ダウンロード|"
                   r"^[0-9\-\(\)\s]+$|住所|電話")


def clean_company(s):
    s = (s or "")
    # 改行が入ることがある。社名らしい行だけを残す
    lines = [x.strip(" 　・,、／/：:") for x in re.split(r"[\r\n]+", s)]
    lines = [x for x in lines if x and not NOISE.search(x)]
    if not lines:
        return ""
    s = lines[0]
    s = re.sub(r"^(製造販売元|製造販売会社|発売元|販売元)[／/：:]?", "", s)
    s = s.strip(" 　・,、／/：:")
    # 社名の体裁が無いものは捨てる
    if len(s) < 2 or not re.search(r"[ぁ-んァ-ヶ一-龥A-Za-z]", s):
        return ""
    return s[:60]


def split_makers(raw):
    """(製造販売元, [発売元…]) に分ける。"""
    if not raw:
        return None, []
    parts = [clean_company(p) for p in SPLIT.split(raw)]
    parts = [p for p in parts if p]
    if not parts:
        return None, []
    maker = parts[0]
    sellers, seen = [], {maker}
    for p in parts[1:]:
        if p not in seen:
            seen.add(p)
            sellers.append(p)
    return maker, sellers


# ============================================================ 新規レコード生成

def build_record(next_id, item, html):
    """PMDA一覧の1品目 + 詳細HTML から medicines.json 形式のレコードを作る。"""
    now = datetime.datetime.now().isoformat()
    maker, sellers = split_makers(item.get("maker"))
    rec = {
        "id": next_id, "cat": "", "itype": None,
        "name": item["name"], "maker": maker,
        "seller": " / ".join(sellers) if sellers else None,
        "price": None,
        "risk": RISK_INT.get((item.get("risk") or "").strip()),
        "drowsy": False, "symptoms": [], "effect": None, "ings": [],
        "warnIngs": [], "note": "", "noteType": "nn",
        "asin": "", "rakuten_url": "", "amazon_tag": "",
        "price_updated_at": "",
        "pmda_url": item["detail_url"], "pmda_id": item["pmda_id"],
        "source": "pmda", "_at": now,
    }
    yakko = None
    if html:
        d, ings = parse(html)
        effect = (d.get("効能・効果") or "").replace("\n", "")[:400] or None
        caution = d.get("使用上の注意") or ""
        yakko = d.get("薬効分類")
        ing_str = " ".join(ings)
        ext = is_external(yakko, d.get("剤形"))
        drowsy_text = bool(DROWSY_TEXT.search(caution))
        rec["ings"] = ings[:30]
        rec["effect"] = effect
        rec["symptoms"] = [s for s, kws in SYM_MAP
                           if any(k in (effect or "") for k in kws)]
        rec["warnIngs"] = [w for w in WARN_CHECK if w in ing_str]
        rec["drowsy"] = drowsy_text if ext else (
            drowsy_text or any(k in ing_str for k in DROWSY_ING))
        notes = []
        for w in rec["warnIngs"]:
            if "アリルイソプロピルアセチル尿素" in w:
                notes.append("⚠ア尿素含有：2023年AU全面規制・2025年KR麻薬類指定。依存リスクあり。")
            elif "コデイン" in w:
                notes.append("⚠コデイン系：12歳未満禁忌。依存リスクあり。")
            elif "ブロム" in w or "ブロモ" in w:
                notes.append("⚠ブロム尿素含有：依存性成分。連用注意。")
        rec["note"] = " ".join(dict.fromkeys(notes))
        rec["noteType"] = "danger" if rec["note"] else "nn"
        if maker is None:
            rec["maker"] = pick_maker_from_detail(d)
    cat, _ = decide(yakko, rec["effect"], rec["name"])
    rec["cat"] = cat
    return {k: rec[k] for k in KEY_ORDER}


def pick_maker_from_detail(d):
    raw = d.get("製造販売会社")
    if not raw:
        return None
    first = raw.split("\n")[0].split("添付文書")[0].strip(" 　／/,")
    return first[:60] or None


# ============================================================ main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--limit-new", type=int, default=500,
                    help="1回の実行で詳細取得する新規品目の上限")
    args = ap.parse_args()
    if not args.run:
        ap.print_help()
        return

    if not os.path.exists(MEDICINES):
        sys.exit(f"{MEDICINES} が見つかりません。リポジトリのルートで実行してください。")

    stamp = datetime.datetime.now().strftime("%Y-%m")
    os.makedirs(UPDATES_DIR, exist_ok=True)

    # ---------- 1. 全件クロール ----------
    print("=" * 66)
    print("STEP 1/4  PMDA全件クロール")
    print("=" * 66)
    api = PMDA()
    t0 = time.time()
    items = {}
    for code, name in RISKS.items():
        print(f"--- {name} ---")
        items.update(api.harvest({"cboRisk": code}))
    declared = 0
    for code in RISKS:
        t, _, _ = api.paginate({"cboRisk": code})
        declared += t
    coverage = len(items) / max(declared, 1)
    print(f"\n取得 {len(items):,} / 申告 {declared:,}  充足率 {coverage*100:.1f}%")
    print(f"通信 {api.n:,}回 / {(time.time()-t0)/60:.1f}分")
    if api.warnings:
        print("\n★ クロール警告")
        for w in api.warnings[:10]:
            print("   " + w)

    # ---------- 2. 安全装置 ----------
    if coverage < COVERAGE_MIN:
        print(f"\n★★ 充足率が {COVERAGE_MIN*100:.1f}% を下回りました。")
        print("★★ PMDAの仕様変更かクロール不良の可能性があるため、更新を中止します。")
        sys.exit(2)          # ジョブを失敗させる（メール通知が飛ぶ）

    # ---------- 3. 差分検出 ----------
    print("\n" + "=" * 66)
    print("STEP 2/4  medicines.json との差分")
    print("=" * 66)
    doc = json.load(open(MEDICINES, encoding="utf-8"))
    meds = doc["medicines"]
    have_ids = set()
    have_names = set()
    for m in meds:
        if m.get("pmda_id"):
            have_ids.add(m["pmda_id"])
        u = m.get("pmda_url") or ""
        hit = ID_RE.search(u)
        if hit:
            have_ids.add(hit.group(1))
        have_names.add(norm_name(m.get("name") or ""))

    crawl_ids = {it["pmda_id"] for it in items.values()}
    new_items = [it for it in items.values()
                 if it["pmda_id"] not in have_ids
                 and it["name_norm"] not in have_names]
    gone = sorted(have_ids - crawl_ids)
    print(f"新規: {len(new_items):,}件 / 販売終了の疑い: {len(gone):,}件")

    # ---------- 4. 新規品目の詳細取得と追記 ----------
    added = []
    if new_items:
        print("\n" + "=" * 66)
        print(f"STEP 3/4  新規 {min(len(new_items), args.limit_new)}件の詳細取得")
        print("=" * 66)
        s = requests.Session()
        s.headers.update({"User-Agent": UA, "Accept-Language": "ja"})
        next_id = max([m.get("id") or 0 for m in meds] + [0]) + 1
        for i, it in enumerate(sorted(new_items, key=lambda x: x["key"])
                               [:args.limit_new], 1):
            html, _, why = fetch(it["pmda_id"], it["rev"], it["seq"], s)
            rec = build_record(next_id, it, html)
            meds.append(rec)
            added.append(rec)
            next_id += 1
            mark = "○" if html else f"詳細なし({why})"
            print(f"  [{i}/{min(len(new_items), args.limit_new)}] "
                  f"{it['name'][:28]:<30} {mark}")
    else:
        print("\n新規品目はありません。")

    # ---------- 5. 保存とレポート ----------
    print("\n" + "=" * 66)
    print("STEP 4/4  保存")
    print("=" * 66)
    changed = bool(added)
    if changed:
        doc["medicines"] = meds
        doc["total"] = len(meds)
        doc["updated_at"] = datetime.datetime.now().isoformat()
        with open(MEDICINES, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
        with open(f"{UPDATES_DIR}/{stamp}.json", "w", encoding="utf-8") as f:
            json.dump([{k: r[k] for k in
                        ("id", "name", "maker", "cat", "risk", "pmda_id")}
                       for r in added], f, ensure_ascii=False, indent=1)
        print(f"medicines.json を更新（{len(meds):,}件）")

    with open(f"{UPDATES_DIR}/{stamp}.md", "w", encoding="utf-8") as f:
        f.write(f"# PMDA月次更新レポート {stamp}\n\n")
        f.write(f"- 実行日時: {datetime.datetime.now().isoformat()}\n")
        f.write(f"- PMDA取得: {len(items):,}件 / 申告 {declared:,}件"
                f"（充足率 {coverage*100:.1f}%）\n")
        f.write(f"- 新規追加: {len(added):,}件\n")
        f.write(f"- 販売終了の疑い: {len(gone):,}件（削除はしていません）\n\n")
        if added:
            f.write("## 追加された品目\n\n")
            for r in added:
                f.write(f"- {r['name']}（{r['maker'] or '?'} / "
                        f"{r['cat'] or '未分類'}）\n")
        if gone:
            f.write("\n## 販売終了の疑い（PMDAから消えた品目ID）\n\n")
            for pid in gone[:100]:
                f.write(f"- {pid}\n")
            if len(gone) > 100:
                f.write(f"- ...他 {len(gone)-100}件\n")
    print(f"レポート: {UPDATES_DIR}/{stamp}.md")
    print("\n完了。" + ("変更あり" if changed else "変更なし"))


if __name__ == "__main__":
    main()
