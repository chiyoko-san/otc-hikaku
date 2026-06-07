#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_akinator_weights.py
medicines.json の symptoms[] 共起から、症状アキネーターの重み叩き台を生成する。

出力:
  scripts/akinator_seed.sql   ... Supabase 投入用 INSERT 文（schema 実行後に流す）
  scripts/akinator_cooccur.json ... 症状ごとの共起TOP（重み調整の参考資料）

使い方:
  python3 scripts/gen_akinator_weights.py
  → 生成された akinator_seed.sql を Supabase SQL Editor で実行

設計方針:
  - カテゴリ(STAGE1)と質問骨子(STAGE2)は人手で定義（QUESTION_DEF）
  - 各選択肢の主タグ(primary)は人手、共起から副タグ(co)を自動補完して重み付け
  - primary は重み3、共起上位は件数に応じて 2/1 を自動配分
  - これにより「複数選択→スコア合算→上位タグ抽出」が成立する
"""
import json, os, re
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MED  = os.path.join(ROOT, "data", "medicines.json")

# ---- 1) 共起テーブル構築 ----------------------------------------
def load_cooccur():
    meds = json.load(open(MED, encoding="utf-8"))["medicines"]
    co = defaultdict(Counter)
    freq = Counter()
    for m in meds:
        syms = m.get("symptoms", []) or []
        for s in syms:
            freq[s] += 1
        for a in syms:
            for b in syms:
                if a != b:
                    co[a][b] += 1
    return co, freq

def co_weights(primary_tags, co, top=3):
    """primary タグ群に対し、共起上位を副タグとして {tag: weight} を返す。
       primary=3、共起1位=2、2-3位=1。primary 同士の重複は最大値を採用。"""
    w = {}
    for p in primary_tags:
        w[p] = max(w.get(p, 0), 3)
    bucket = Counter()
    for p in primary_tags:
        for tag, c in (co[p].most_common(top) if p in co else []):
            if tag in primary_tags:
                continue
            bucket[tag] += c
    for i, (tag, _) in enumerate(bucket.most_common(top)):
        w[tag] = max(w.get(tag, 0), 2 if i == 0 else 1)
    return w

# ---- 2) カテゴリ & 質問定義（人手の骨子） ------------------------
# choices の "p" は primary症状タグ（medicines.json の symptoms と一致させる）
# "red" は緊急受診フラグ
QUESTION_DEF = [
  {"cat":"head","label":"頭・熱・のど・歯","emoji":"🤕","questions":[
    {"id":"head_q1","q":"いちばんつらい部位はどこですか？","multi":True,"choices":[
      {"l":"頭が痛い","p":["頭痛"]},
      {"l":"熱がある・熱っぽい","p":["発熱"]},
      {"l":"のどが痛い・イガイガ","p":["のど痛","のどの炎症"]},
      {"l":"歯が痛い","p":["歯痛"]},
      {"l":"口内炎ができた","p":["口内炎"]},
    ]},
    {"id":"head_q2","q":"頭痛のタイプ・きっかけは？（当てはまるもの全部）","multi":True,"choices":[
      {"l":"ズキズキ・脈打つ／光や音がつらい","p":["頭痛"]},
      {"l":"締め付けられる・肩こりを伴う","p":["頭痛","肩こり"]},
      {"l":"生理前後に起きる","p":["頭痛","月経痛"]},
      {"l":"突然これまでにない激痛","p":[],"red":"突然の激しい頭痛はくも膜下出血など緊急疾患の可能性があります。市販薬で様子を見ず、すぐ医療機関を受診してください。"},
    ]},
  ]},
  {"cat":"nose_eye","label":"鼻・目（アレルギー）","emoji":"🤧","questions":[
    {"id":"ne_q1","q":"気になる症状は？（複数可）","multi":True,"choices":[
      {"l":"鼻水・くしゃみが出る","p":["鼻水","くしゃみ"]},
      {"l":"鼻づまりがつらい","p":["鼻づまり"]},
      {"l":"目がかゆい","p":["目のかゆみ","かゆみ"]},
      {"l":"目が充血している","p":["充血"]},
    ]},
    {"id":"ne_q2","q":"症状の出方は？","multi":True,"choices":[
      {"l":"花粉の季節に悪化する","p":["花粉症","鼻水"]},
      {"l":"一年中ある（ほこり・ペット）","p":["鼻水","くしゃみ"]},
      {"l":"黄・緑のドロッとした鼻水","p":["鼻水"],"red":"色のついた粘い鼻水が続く場合は細菌性副鼻腔炎の可能性があります。耳鼻科の受診をおすすめします。"},
    ]},
  ]},
  {"cat":"cough","label":"咳・痰","emoji":"😮‍💨","questions":[
    {"id":"co_q1","q":"咳・痰の様子は？","multi":True,"choices":[
      {"l":"乾いた咳が続く","p":["せき"]},
      {"l":"痰がからむ・湿った咳","p":["せき","たん"]},
      {"l":"のども痛い","p":["のど痛","のどの炎症"]},
      {"l":"息苦しい・胸が苦しい","p":[],"red":"呼吸困難や胸の苦しさを伴う咳は、喘息発作や肺炎の可能性があります。早めに医療機関を受診してください。"},
    ]},
  ]},
  {"cat":"stomach","label":"胃・お腹","emoji":"🤢","questions":[
    {"id":"st_q1","q":"お腹の症状は？（複数可）","multi":True,"choices":[
      {"l":"胃が痛い","p":["胃痛"]},
      {"l":"胃もたれ・食べ過ぎ","p":["胃もたれ","食べ過ぎ"]},
      {"l":"胸やけ・酸が上がる","p":["胸やけ"]},
      {"l":"下痢・お腹がゆるい","p":["下痢","整腸"]},
      {"l":"便秘・お腹が張る","p":["便秘","腹部膨満"]},
      {"l":"吐き気・乗り物酔い","p":["吐き気"]},
    ]},
    {"id":"st_q2","q":"気になるサインはありますか？","multi":True,"choices":[
      {"l":"特になし","p":[]},
      {"l":"黒い便・血が混じる／激しい腹痛","p":[],"red":"黒色便・血便・激しい腹痛は消化管出血など重い病気のサインのことがあります。市販薬で様子を見ず受診してください。"},
    ]},
  ]},
  {"cat":"skin","label":"皮膚・かゆみ","emoji":"🩹","questions":[
    {"id":"sk_q1","q":"皮膚の症状は？（複数可）","multi":True,"choices":[
      {"l":"かゆみ・湿疹・かぶれ","p":["かゆみ","湿疹・かぶれ"]},
      {"l":"虫に刺された","p":["虫刺され","かゆみ"]},
      {"l":"乾燥・肌荒れ","p":["乾燥肌","肌荒れ"]},
      {"l":"にきび・吹き出物","p":["にきび"]},
      {"l":"水虫","p":["水虫"]},
    ]},
    {"id":"sk_q2","q":"全身症状はありますか？","multi":True,"choices":[
      {"l":"局所だけ","p":[]},
      {"l":"全身じんましん＋顔の腫れ・息苦しさ","p":[],"red":"全身のじんましんに顔の腫れや息苦しさを伴う場合、アナフィラキシーの危険があります。ただちに救急要請してください。"},
    ]},
  ]},
  {"cat":"pain","label":"肩・腰・関節・筋肉","emoji":"💪","questions":[
    {"id":"pn_q1","q":"痛む部位は？（複数可）","multi":True,"choices":[
      {"l":"肩・首がこる","p":["肩こり"]},
      {"l":"腰が痛い","p":["腰痛"]},
      {"l":"関節が痛い","p":["関節痛"]},
      {"l":"筋肉痛","p":["筋肉痛"]},
      {"l":"打撲・ねんざ","p":["打撲・ねんざ"]},
      {"l":"神経痛・しびれ","p":["神経痛"]},
    ]},
  ]},
  {"cat":"mind","label":"疲れ・眠れない・ストレス","emoji":"😪","questions":[
    {"id":"mn_q1","q":"いまの状態は？（複数可）","multi":True,"choices":[
      {"l":"体がだるい・疲れがとれない","p":["肉体疲労"]},
      {"l":"眠れない・眠りが浅い","p":["不眠"]},
      {"l":"イライラ・ストレスを感じる","p":["精神的ストレス"]},
      {"l":"動悸がする","p":["動悸"]},
    ]},
    {"id":"mn_q2","q":"特定の時期と関係しますか？","multi":True,"choices":[
      {"l":"特になし","p":[]},
      {"l":"生理前・更年期ごろ","p":["更年期障害","月経不順"]},
    ]},
  ]},
  {"cat":"women_circu","label":"冷え・生理・めまい","emoji":"🩸","questions":[
    {"id":"wc_q1","q":"気になる症状は？（複数可）","multi":True,"choices":[
      {"l":"手足の冷え","p":["冷え"]},
      {"l":"生理痛","p":["月経痛"]},
      {"l":"生理不順","p":["月経不順"]},
      {"l":"めまい・立ちくらみ","p":["めまい・立ちくらみ"]},
    ]},
  ]},
]

def esc(s): return s.replace("'", "''")

def main():
    co, freq = load_cooccur()

    # 共起資料を書き出し（重み調整の参考）
    cooccur_dump = {}
    for tag in freq:
        pairs = co[tag].most_common(6) if tag in co else []
        cooccur_dump[tag] = {t:c for t,c in pairs}
    json.dump(cooccur_dump, open(os.path.join(HERE,"akinator_cooccur.json"),"w",encoding="utf-8"),
              ensure_ascii=False, indent=2)

    lines = ["-- AUTO-GENERATED by gen_akinator_weights.py  (schema 実行後に流す)",
             "begin;"]
    for ci, cat in enumerate(QUESTION_DEF):
        lines.append(
          f"insert into ak_categories(id,label,emoji,sort,active) values "
          f"('{cat['cat']}','{esc(cat['label'])}','{cat.get('emoji','')}',{ci},true) "
          f"on conflict(id) do update set label=excluded.label,emoji=excluded.emoji,sort=excluded.sort;")
        for qi, q in enumerate(cat["questions"]):
            lines.append(
              f"insert into ak_questions(id,category_id,q,multi,sort,active) values "
              f"('{q['id']}','{cat['cat']}','{esc(q['q'])}',{str(q['multi']).lower()},{qi},true) "
              f"on conflict(id) do update set q=excluded.q,multi=excluded.multi,sort=excluded.sort;")
            for cj, ch in enumerate(q["choices"]):
                cid = f"{q['id']}_c{cj+1}"
                if ch.get("red"):
                    weights = {}; red="true"; rmsg=esc(ch["red"])
                else:
                    weights = co_weights(ch["p"], co); red="false"; rmsg=""
                wjson = esc(json.dumps(weights, ensure_ascii=False))
                lines.append(
                  f"insert into ak_choices(id,question_id,label,weights,redcard,redcard_msg,sort,active) values "
                  f"('{cid}','{q['id']}','{esc(ch['l'])}','{wjson}'::jsonb,{red},'{rmsg}',{cj},true) "
                  f"on conflict(id) do update set label=excluded.label,weights=excluded.weights,"
                  f"redcard=excluded.redcard,redcard_msg=excluded.redcard_msg,sort=excluded.sort;")
    lines.append("commit;")
    open(os.path.join(HERE,"akinator_seed.sql"),"w",encoding="utf-8").write("\n".join(lines)+"\n")

    # サマリ表示
    ncat=len(QUESTION_DEF); nq=sum(len(c["questions"]) for c in QUESTION_DEF)
    nch=sum(len(q["choices"]) for c in QUESTION_DEF for q in c["questions"])
    print(f"OK  categories={ncat}  questions={nq}  choices={nch}")
    print("  -> scripts/akinator_seed.sql")
    print("  -> scripts/akinator_cooccur.json")

if __name__ == "__main__":
    main()
