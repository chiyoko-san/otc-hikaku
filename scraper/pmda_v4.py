#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pmda_v4.py -- PMDA 一般用医薬品 全件クロール（確定版）

切り分けで判明したPMDAの仕様:
  1. 検索結果が約1,000件を超えると、件数だけ返して一覧を表示しない
     （空のときは本文2,016字の定型ページが返る）
  2. 日本語のパラメータは EUC-JP で送る必要がある（UTF-8だとページが壊れる）
  3. 1ページ内に同じ品目のリンクが重複して現れることがある
     → 「重複を除くと申告件数に届かない」のは正常。失敗ではない

対策:
  ・条件を足して1,000件未満になるまで自動で細分化
      リスク区分 → ＋薬効分類 → ＋剤形 → ＋販売名の頭文字
  ・「取れなかった」と判定するのは1ページ目が完全に空のときだけ
  ・途中経過を随時保存するので、止まっても続きから再開できる

使い方:
    pip install requests
    python pmda_v4.py --test                      # 漢方だけで確認（3分）
    python pmda_v4.py --compare medicines.json    # 本番（15〜25分）
    python pmda_v4.py --compare medicines.json --resume   # 途中から再開
"""

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from collections import Counter
from urllib.parse import urlencode

import requests

BASE = "https://www.info.pmda.go.jp"
SEARCH = BASE + "/osearch/PackinsSearch"
UA = ("Mozilla/5.0 (compatible; kusuri-compass-bot/1.0; "
      "+https://kusuri-compass.com)")
SLEEP = 1.5
RETRY = 3
PAGE = 100
CACHE = "pmda_v4_partial.jsonl"

RISKS = {"9": "要指導医薬品", "1": "第1類医薬品", "B": "第「2」類医薬品",
         "2": "第2類医薬品", "3": "第3類医薬品",
         "0": "リスク区分なし", "-1": "リスク区分未確認"}

EFFECTS = {
    "11": "精神神経用薬", "12": "消化器官用薬", "13": "循環器・血液用薬",
    "14": "呼吸器官用薬", "15": "泌尿生殖器官及び肛門用薬", "16": "滋養強壮保健薬",
    "17": "女性用薬", "18": "アレルギー用薬", "21": "外皮用薬",
    "22": "眼科用薬", "23": "耳鼻科用薬", "24": "歯科口腔用薬",
    "25": "禁煙補助剤", "30": "漢方製剤", "31": "生薬製剤",
    "41": "公衆衛生用薬", "50": "一般用検査薬", "60": "その他",
}

FORMS = {"1": "散剤", "2": "錠剤", "3": "カプセル", "4": "ゼリー", "5": "液剤",
         "6": "噴霧剤", "7": "挿入剤", "8": "貼付剤", "9": "塗布剤", "20": "その他"}

# 販売名の頭文字（前方一致）。EUC-JPで送るので日本語もそのまま使える
HEADS = list("アイウエオカキクケコサシスセソタチツテトナニヌネノ"
             "ハヒフヘホマミムメモヤユヨラリルレロワヲンヴ"
             "ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ"
             "ァィゥェォッャュョー"
             "あいうえおかきくけこさしすせそたちつてとなにぬねの"
             "はひふへほまみむめもやゆよらりるれろわん"
             "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
             "新特強生薬漢内外用日本第健胃小児大中錠液散")

AXES = [("cboRisk", RISKS), ("cboEffect", EFFECTS),
        ("cboDosageForm", FORMS), ("txtSaleName", None)]

RE_TOTAL = re.compile(r'検索の結果.*?<b>(\d+)</b>.{0,40}?件の医薬品', re.S)
RE_RANGE = re.compile(r'そのうち、(\d+)件目〜(\d+)件目')
RE_ITEM = re.compile(
    r'<a href="/ogo/([A-Z]\d{10})_(\d+)_(\d+)"[^>]*>(.*?)</a>'
    r'(?:\s*<font[^>]*>\[(.*?)\]</font>)?'
    r'(.*?)(?=<a href="/ogo/|</BODY>|$)', re.S | re.I)
RE_DATE = re.compile(r'(\d{4})年(\d{1,2})月(\d{1,2})日')
RE_PDF = re.compile(r'/downfiles/otc/PDF/([A-Z]\d{10}_\d+_[A-Z])\.pdf')
RE_MAKER = re.compile(r'製造販売元／([^<\n]+)')
RE_TAG = re.compile(r'<[^>]+>')


def norm_name(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    for ch in " 　・（）()［］[]「」『』／/":
        s = s.replace(ch, "")
    return "".join(c.upper() if "a" <= c <= "z" else c for c in s)


def label(cond):
    out = []
    for axis, table in AXES:
        if axis in cond:
            v = cond[axis]
            out.append(table[v] if table else f"{v}*")
    return " / ".join(out) or "(条件なし)"


class PMDA:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA, "Accept-Language": "ja,en;q=0.8"})
        self.n = 0
        self.warnings = []
        self.cache = None

    # -------------------------------------------------------------- fetch

    def get(self, cond, start=1):
        p = {"SHORIFLG": 0, "cboDisCnt": PAGE, "start": start}
        p.update({k: v for k, v in cond.items() if v not in (None, "")})
        qs = urlencode(p, encoding="euc-jp", errors="replace")   # ← EUC-JPで送る
        for i in range(RETRY):
            try:
                r = self.s.get(f"{SEARCH}?{qs}", timeout=40)
                r.raise_for_status()
                r.encoding = "euc-jp"
                self.n += 1
                time.sleep(SLEEP)
                return r.text
            except Exception as e:
                print(f"      retry {i+1}/{RETRY} ({e})", file=sys.stderr)
                time.sleep(SLEEP * (i + 2) * 2)
        raise RuntimeError(f"取得失敗: {cond} start={start}")

    @staticmethod
    def parse(html):
        m = RE_TOTAL.search(html)
        total = int(m.group(1)) if m else 0
        rng = RE_RANGE.search(html)
        hi = int(rng.group(2)) if rng else 0
        items = []
        for mm in RE_ITEM.finditer(html):
            pid, rev, seq, name, risk, tail = mm.groups()
            tail = tail or ""
            txt = RE_TAG.sub("", tail)
            d = RE_DATE.search(tail)
            mk = RE_MAKER.search(txt)
            pdfs = sorted({f"{BASE}/downfiles/otc/PDF/{x}.pdf"
                           for x in RE_PDF.findall(tail)})
            nm = RE_TAG.sub("", name).strip()
            items.append({
                "key": f"{pid}_{seq}", "pmda_id": pid, "seq": seq, "rev": rev,
                "name": nm, "name_norm": norm_name(nm),
                "risk": (risk or "").strip(),
                "updated": (f"{d.group(1)}-{int(d.group(2)):02d}-{int(d.group(3)):02d}"
                            if d else None),
                "maker": mk.group(1).strip() if mk else None,
                "detail_url": f"{BASE}/ogo/{pid}_{rev}_{seq}",
                "pdf_current": [u for u in pdfs if f"{pid}_{rev}_" in u],
                "pdfs": pdfs,
            })
        return total, hi, items

    # ----------------------------------------------------------- crawling

    def paginate(self, cond):
        """
        戻り値 (申告件数, 品目dict, capped)
        capped=True は「1ページ目が空＝一覧を出してもらえなかった」場合のみ。
        重複除去で件数が申告に届かないのは正常なので失敗扱いしない。
        """
        got, start, total = {}, 1, None
        while True:
            total_, hi, items = self.parse(self.get(cond, start))
            if total is None:
                total = total_
                if total == 0:
                    return 0, {}, False
                if not items:
                    return total, {}, True          # ← 1,000件超えで一覧なし
            if not items:
                # 途中のページが空。混雑の可能性があるので数回粘る
                for _ in range(2):
                    time.sleep(SLEEP * 3)
                    _, hi, items = self.parse(self.get(cond, start))
                    if items:
                        break
                if not items:
                    self.warnings.append(
                        f"{label(cond)}: {start}件目以降が取得できず "
                        f"(申告{total:,} 取得{len(got):,})")
                    break
            for it in items:
                got[it["key"]] = it
                if self.cache:
                    self.cache.write(json.dumps(it, ensure_ascii=False) + "\n")
            if self.cache:
                self.cache.flush()
            if hi >= total:
                break
            start += PAGE
            if start > total + PAGE:
                break
        return total, got, False

    def harvest(self, cond, indent=0):
        total, got, capped = self.paginate(cond)
        pad = "  " * indent
        if total == 0:
            return {}
        if not capped:
            dup = total - len(got)
            note = f"  (重複{dup})" if dup > 0 else ""
            print(f"{pad}{label(cond):<46} {len(got):>6,} / {total:>6,}{note}")
            return got

        # 1,000件超え → 未使用の軸で分割
        nxt = next(((a, t) for a, t in AXES if a not in cond), None)
        if nxt is None:
            self.warnings.append(f"分割不能: {label(cond)} 申告{total:,}")
            print(f"{pad}★ 分割不能: {label(cond)} 申告{total:,}")
            return {}
        axis, table = nxt
        values = list(table) if table else HEADS
        print(f"{pad}{label(cond):<46} {total:>6,} → {len(values)}分割")

        merged = {}
        for v in values:
            merged.update(self.harvest({**cond, axis: v}, indent + 1))
        if len(merged) < total * 0.9:
            msg = (f"{label(cond)}: 申告{total:,} に対し {len(merged):,}"
                   f"（不足 {total-len(merged):,}）")
            self.warnings.append(msg)
            print(f"{pad}★ {msg}")
        return merged


def load_cache():
    items = {}
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            for line in f:
                try:
                    it = json.loads(line)
                    items[it["key"]] = it
                except Exception:
                    pass
    return items


def compare(items, path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        data = data.get("medicines") or data.get("items") or list(data.values())
    nk = ["name", "brand_name", "販売名", "title", "product_name", "sales_name"]
    ik = ["pmda_id", "id", "doc_id", "code"]
    names, ids = set(), set()
    for m in data:
        if not isinstance(m, dict):
            continue
        for k in nk:
            if m.get(k):
                names.add(norm_name(str(m[k])))
                break
        for k in ik:
            v = str(m.get(k) or "")
            if re.fullmatch(r"[A-Za-z]\d{10}", v):
                ids.add(v.upper())
                break
    missing = [it for it in items.values()
               if it["pmda_id"] not in ids and it["name_norm"] not in names]
    return data, missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--out", default="pmda_v4.json")
    ap.add_argument("--compare")
    ap.add_argument("--resume", action="store_true")
    args = ap.parse_args()

    api = PMDA()

    if args.test:
        print("■ 動作確認: 薬効分類=漢方製剤（申告 約1,916件）\n")
        got = api.harvest({"cboEffect": "30"})
        kk = [x["name"] for x in got.values() if "葛根湯" in x["name"]]
        print(f"\n  取得 {len(got):,}件 / リクエスト {api.n}")
        print(f"  葛根湯を含む品目: {len(kk)}件（切り分けでは149件でした）")
        print("\n  ✓ 1,800件以上なら成功" if len(got) >= 1800
              else "\n  × まだ足りません。この出力を共有してください")
        return

    seen = load_cache() if args.resume else {}
    if seen:
        print(f"■ 途中保存から {len(seen):,}件 を読み込みました\n")
    if not args.resume and os.path.exists(CACHE):
        os.remove(CACHE)

    t0 = time.time()
    api.cache = open(CACHE, "a", encoding="utf-8")
    all_items = dict(seen)
    declared = 0

    print("=" * 70)
    print("リスク区分ごとに収集（1,000件を超えたら自動で細分化）")
    print("=" * 70)
    for code, name in RISKS.items():
        print(f"\n--- {name} ---")
        got = api.harvest({"cboRisk": code})
        all_items.update(got)
    api.cache.close()

    for code in RISKS:
        t, _, _ = api.paginate({"cboRisk": code})
        declared += t

    print("\n" + "=" * 70)
    print(f"■ 取得    : {len(all_items):>7,} 件")
    print(f"■ 申告合計 : {declared:>7,} 件")
    print(f"■ 差       : {declared - len(all_items):>+7,} 件")
    print(f"■ リクエスト {api.n:,} 回 / 所要 {(time.time()-t0)/60:.1f}分")
    print("=" * 70)

    if api.warnings:
        print("\n★ 警告")
        for w in api.warnings[:20]:
            print("   " + w)
        if len(api.warnings) > 20:
            print(f"   ... 他 {len(api.warnings)-20}件")

    print("\n■ リスク区分の内訳")
    for k, v in Counter(i["risk"] for i in all_items.values()).most_common():
        print(f"   {k or '(未取得)':<20} {v:>7,}")

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(sorted(all_items.values(), key=lambda x: x["key"]),
                  f, ensure_ascii=False, indent=1)
    print(f"\n→ {args.out} に保存しました")

    if args.compare:
        data, missing = compare(all_items, args.compare)
        rate = (len(all_items) - len(missing)) / max(len(all_items), 1) * 100
        print("\n" + "=" * 70)
        print(f"■ PMDA 総数   : {len(all_items):>7,}")
        print(f"■ 手元のDB    : {len(data):>7,}")
        print(f"■ DBに無い品目 : {len(missing):>7,}")
        print(f"■ 充足率       : {rate:>7.1f}%")
        print("=" * 70)
        for it in missing[:30]:
            print(f"  [{it['pmda_id']}] {it['name']}  ({it['risk']})")
        if len(missing) > 30:
            print(f"  ... 他 {len(missing)-30:,}件")
        with open("pmda_missing_v4.json", "w", encoding="utf-8") as f:
            json.dump(missing, f, ensure_ascii=False, indent=1)
        print("\n→ pmda_missing_v4.json に保存しました")


if __name__ == "__main__":
    main()
