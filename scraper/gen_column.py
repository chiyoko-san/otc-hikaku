#!/usr/bin/env python3
"""
Claude APIで市販薬コラムを自動生成 → Supabase に直接保存

v3 変更点（2026-09）:
  - テーマプールを「OTC類似薬の上乗せ料金（2027年3月〜）」中心の30本に差し替え
      → 旧テーマは GENERAL_THEMES として温存し、制度テーマを使い切った後に回す
  - テーマの重複防止: コラムIDにテーマ番号を埋め込み（auto_YYYYMMDD_1_t07）、
      Supabase上の既存IDを見て「未使用のテーマ」だけを選ぶ。日付ハッシュ方式は廃止
  - 各テーマに facts（数字・対象/対象外）と links（サイト内リンク）を持たせ、
      本文中に内部リンクを必ず入れさせる（コラム→切替ページ/ハブの導線）
  - 読者像を60〜80代に設定（短い文・言い換え・結論先出し）

v2 変更点:
  - normalize_body(): ::: 記法 / 生HTML callout を標準Markdownに正規化
  - 生HTML出力をシステムプロンプトで明示禁止
  - 画像挿入を --with-images オプション制に（既定は画像なし＝壊れリンク防止）
  - image_base_url を SUPABASE_URL から導出（プロジェクトrefのハードコード廃止）
  - --preview / --no-save で保存前に本文を確認可能

環境変数:
  ANTHROPIC_API_KEY : Claude APIキー
  SUPABASE_URL      : https://xxxx.supabase.co
  SUPABASE_KEY      : anon public キー
  CALLOUT_STYLE     : blockquote（既定） / plain
"""
import json, re, sys, os, argparse, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timezone, timedelta, date

DATA_DIR = Path(__file__).parent
MED_JSON = DATA_DIR / "medicines.json"
JST      = timezone(timedelta(hours=9))

# ══════════════════════════════════════════════════════════
#  制度の事実（本文中の数字はここにあるものだけを使わせる）
# ══════════════════════════════════════════════════════════

POLICY_CONTEXT = """## OTC類似薬「特別の料金」（当サイトでは「上乗せ料金」と呼ぶ）の事実
- 根拠法: 改正健康保険法（2026年5月成立）
- 実施時期: 2027年3月（令和8年度中）の予定
- 仕組み: 市販薬と成分・投与経路が同一で1日最大用量が異ならない医療用医薬品（OTC類似薬）を処方された場合、
  通常の定率負担（1〜3割）とは別に、対象薬剤の薬剤費の4分の1を「特別の料金」として患者が負担する。保険適用は残る。
- 対象: 厚生労働省の案（2025年12月25日 社会保障審議会医療保険部会）で77成分・約1,100品目。
  ※最終的な対象品目は国の告示で確定する。必ず「案」であることを明記する。
- 対象外とする方向で検討されている人: こども、がん・難病など配慮が必要な慢性疾患のある人、低所得者、入院患者、
  医師が長期使用等を医療上必要と判断した人。詳細は厚労省の検討会で整理中。
- 令和9年度（2027年度）以降: 対象範囲の拡大と料率の引き上げを検討。
- 政府は年約900億円の医療費削減を見込む（報道ベース）。
- 計算例（薬代1,000円の薬）: 上乗せ料金250円 ＋ 残り750円の定率負担。
  3割負担 300円→約480円（+約180円）、2割負担 200円→400円（+200円）、1割負担 100円→約330円（+約230円）。
  診察料・調剤料などの技術料は変わらない。
- 対象の代表例（案）: ロキソニン（ロキソプロフェン）、アレグラ（フェキソフェナジン）、アレジオン（エピナスチン）、
  クラリチン（ロラタジン）、タリオン（ベポタスチン）、ザジテン（ケトチフェン）、フルナーゼ点鼻液、ナゾネックス点鼻液、
  ボルタレン外用（ジクロフェナク）、セルタッチ・ナパゲルン（フェルビナク）、インテバン（インドメタシン）、
  ヒルドイド（ヘパリン類似物質）、リンデロンV、ベトネベートN、ロコイド、ムコダイン（カルボシステイン）、PL配合顆粒、
  マグミット（酸化マグネシウム）、ラキソベロン、テレミンソフト坐薬、ラミシール外用、ゾビラックス軟膏、
  イソジン、白色ワセリン（プロペト）、ケラチナミン（尿素）、MS温シップ・冷シップ
- 対象外の代表例（案に含まれない）: カロナール（アセトアミノフェン単剤）、ガスター（ファモチジン）、
  ジルテック（セチリジン）、ザイザル（レボセチリジン）、ロペミン、ナウゼリン、メジコン、
  モーラステープ（ケトプロフェン）、リンデロンVG（ゲンタマイシン配合のため）、漢方薬全般（葛根湯など）
- 薬価と上乗せ額の実例（厚労省 薬価基準 2026年8月13日時点、上乗せ額＝薬価÷4）:
  ロキソニン錠60mg 薬価10.8円→上乗せ約2.7円/錠、アレグラ錠60mg 20.9円→約5.2円/錠、
  ヒルドイドソフト軟膏0.3% 17.7円/g→約4.4円/g（25gで約111円）、ロキソニンテープ100mg 18.2円/枚→約4.6円/枚、
  マグミット錠330mg 6.3円→約1.6円/錠、ムコダイン錠500mg 10.8円→約2.7円/錠、ゾビラックス軟膏5% 90.6円/g→約22.7円/g。
  多くの薬で1回の処方あたり数十〜数百円の増加。ジェネリックは薬価が安いぶん上乗せ額も小さい。
- 出典URL:
  https://www.mhlw.go.jp/content/12401000/001621875.pdf （制度の考え方）
  https://www.mhlw.go.jp/content/12401000/001621851.pdf （対象77成分一覧・案）
"""

POLICY_TAGS = {"上乗せ料金", "制度解説"}

# ══════════════════════════════════════════════════════════
#  テーマプール
#   - 上から順に使う（優先度順）。使ったテーマはSupabase上のIDで記録され二度と選ばれない
#   - facts: そのテーマで必ず触れる事実 / links: 本文中に必ず入れるサイト内リンク
# ══════════════════════════════════════════════════════════

POLICY_THEMES = [
    {"tag": "制度解説",
     "desc": "OTC類似薬の「上乗せ料金」とは？2027年3月から病院の薬で何が変わるか（対象・時期・金額・かからない人）",
     "facts": "制度の全体像を、初めて聞く人向けに。保険がなくなるわけではない点を最初に。",
     "links": ["/otc-similar/", "/otc-similar/name/"]},
    {"tag": "制度解説",
     "desc": "上乗せ料金はいくら増える？1割・2割・3割負担別の計算例と、薬代が高い薬・安い薬で差が出る理由",
     "facts": "計算例はPOLICY_CONTEXTの数字のみ。薬価の安いジェネリックでは上乗せ額が小さく、軟膏・保湿剤のように薬代が大きい薬では差が大きい、という構造を説明。",
     "links": ["/otc-similar/"]},
    {"tag": "制度解説",
     "desc": "上乗せ料金がかからない人は誰？こども・がん・難病・低所得・入院・長期使用の考え方",
     "facts": "配慮対象は「検討中」の段階。該当するかは受診先・薬局で確認する、と必ず書く。",
     "links": ["/otc-similar/"]},
    {"tag": "制度解説",
     "desc": "自分の薬が上乗せ料金の対象か調べる方法。お薬手帳・薬袋・薬の説明書の見方と成分名の探し方",
     "facts": "先発名（ロキソニン）と成分名（ロキソプロフェン）の違い、ジェネリック名の読み方を丁寧に。",
     "links": ["/otc-similar/name/", "/otc-similar/use/"]},
    {"tag": "上乗せ料金",
     "desc": "ロキソニンは上乗せ料金の対象？2027年3月からの負担と、市販のロキソニンSとの違い・注意点",
     "facts": "対象（案）。成分ロキソプロフェン。医療用も市販も1錠60mg。市販は第1類で薬剤師の情報提供が必要。胃腸障害・ぜんそく既往に注意。",
     "links": ["/switch/loxonin/", "/otc-similar/"]},
    {"tag": "上乗せ料金",
     "desc": "アレグラは上乗せ料金の対象？花粉症シーズン前に知っておく負担の変化と市販のアレグラFX",
     "facts": "対象（案）。成分フェキソフェナジン。医療用・市販とも1回60mg1日2回で同等。ディレグラ（プソイドエフェドリン配合）も対象。",
     "links": ["/switch/allegra/", "/otc-similar/use/allergy/"]},
    {"tag": "上乗せ料金",
     "desc": "ヒルドイドは上乗せ料金の対象？乾燥肌の保湿剤処方と、こども・市販のヘパリン類似物質製剤",
     "facts": "対象（案）。成分ヘパリン類似物質0.3%。こどもは対象外の方向で検討中。市販にも0.3%製剤が多数。出血性血液疾患・傷口には使えない。",
     "links": ["/switch/hirudoid/", "/otc-similar/use/skin/"]},
    {"tag": "上乗せ料金",
     "desc": "湿布は上乗せ料金の対象？ロキソニンテープ・ボルタレン・モーラス・MS冷シップの違い",
     "facts": "ロキソプロフェン・ジクロフェナク・フェルビナク・インドメタシン・サリチル酸メチル系（MS温/冷シップ）は対象（案）。モーラステープ（ケトプロフェン）は案に含まれず対象外。ケトプロフェンは光線過敏症に注意。",
     "links": ["/switch/mohrus/", "/switch/voltaren/", "/switch/seltouch/", "/otc-similar/use/pain/"]},
    {"tag": "上乗せ料金",
     "desc": "カロナールは上乗せ料金の対象外。理由と、アセトアミノフェンを含む市販薬・PL配合顆粒との関係",
     "facts": "アセトアミノフェン単剤は77成分の案に含まれず対象外。ただしPL配合顆粒（4成分配合）は対象。令和9年度以降の拡大で変わる可能性あり。過量摂取（肝障害）に注意。",
     "links": ["/switch/calonal/", "/switch/pl/", "/otc-similar/"]},
    {"tag": "上乗せ料金",
     "desc": "アレジオンは上乗せ料金の対象？就寝前1回の花粉症薬と市販のアレジオン20",
     "facts": "対象（案）。成分エピナスチン。市販アレジオン20は1回20mg1日1回。眠気に注意。",
     "links": ["/switch/alesion/", "/otc-similar/use/allergy/"]},
    {"tag": "上乗せ料金",
     "desc": "クラリチン・ジルテック・ザイザルの違い。同じ花粉症薬でも上乗せ料金の対象と対象外に分かれる理由",
     "facts": "クラリチン（ロラタジン）は対象（案）。ジルテック（セチリジン）・ザイザル（レボセチリジン）は案に含まれず対象外。理由は「市販薬と同一成分か」で機械的に選ばれたため。",
     "links": ["/switch/claritin/", "/switch/zyrtec/", "/switch/xyzal/", "/otc-similar/use/allergy/"]},
    {"tag": "上乗せ料金",
     "desc": "フルナーゼ・ナゾネックスの点鼻薬は上乗せ料金の対象？ステロイド点鼻薬と市販薬の違い",
     "facts": "フルナーゼ（フルチカゾンプロピオン酸エステル）・ナゾネックス（モメタゾン）とも対象（案）。市販フルナーゼは季節性アレルギー専用・18歳以上。",
     "links": ["/switch/flunase/", "/otc-similar/use/allergy/"]},
    {"tag": "上乗せ料金",
     "desc": "タリオン・ザジテンは上乗せ料金の対象？市販のタリオンAR・ザジテンALとの違い",
     "facts": "両方とも対象（案）。タリオンARは1回10mg1日2回・15歳以上。ザジテンは眠気が出やすい。",
     "links": ["/switch/talion/", "/switch/zaditen/", "/otc-similar/use/allergy/"]},
    {"tag": "上乗せ料金",
     "desc": "リンデロンV・ロコイドは上乗せ料金の対象、リンデロンVGは対象外。ステロイド外用薬で分かれる理由と市販薬",
     "facts": "リンデロンV（ベタメタゾン吉草酸エステル）・ロコイドは対象（案）。リンデロンVGはゲンタマイシン配合で同じ市販薬がないため案に含まれず対象外。市販リンデロンVsはVと同濃度だが抗生物質は入っていない。顔・広範囲・長期使用は避ける。",
     "links": ["/switch/rinderon-v/", "/switch/rinderon-vg/", "/otc-similar/use/steroid/"]},
    {"tag": "上乗せ料金",
     "desc": "かぜで処方されるムコダイン・PL配合顆粒は上乗せ料金の対象？市販の同成分薬と受診の目安",
     "facts": "両方とも対象（案）。PL配合顆粒の市販版はパイロンPL顆粒（同じ4成分）。せき・たんが2週間以上続けば受診。",
     "links": ["/switch/mucodyne/", "/switch/pl/", "/otc-similar/use/cold/"]},
    {"tag": "上乗せ料金",
     "desc": "マグミット（酸化マグネシウム）は上乗せ料金の対象？便秘薬を長く飲んでいる人の負担と市販薬",
     "facts": "対象（案）。市販の酸化マグネシウム便秘薬は同成分。腎機能低下・高齢者は高マグネシウム血症に注意。医師が長期使用を必要と判断すれば対象外の方向。",
     "links": ["/switch/magmitt/", "/otc-similar/use/laxative/"]},
    {"tag": "上乗せ料金",
     "desc": "ラキソベロン・テレミンソフト坐薬は上乗せ料金の対象？刺激性下剤の市販薬と連用の注意",
     "facts": "両方とも対象（案）。ピコラックス（2.5mg）はラキソベロン錠と同量。コーラック（ビサコジル）は1回量が異なる。連用で効きにくくなる。",
     "links": ["/switch/laxoberon/", "/switch/teleminsoft/", "/otc-similar/use/laxative/"]},
    {"tag": "上乗せ料金",
     "desc": "ガスター（ファモチジン）は上乗せ料金の対象外。理由と、市販のガスター10との含有量の違い",
     "facts": "案に含まれず対象外。市販ガスター10は1回10mg、処方は10〜20mg。2週間を超えて続けない。",
     "links": ["/switch/gaster/", "/otc-similar/"]},
    {"tag": "上乗せ料金",
     "desc": "ラミシールなどのみずむし薬は上乗せ料金の対象？外用と内服の違い、市販のラミシールAT",
     "facts": "外用（テルビナフィン・ブテナフィン・ミコナゾール・クロトリマゾール等）は対象（案）。爪白癬の内服薬は市販になく対象外。症状が消えても4週間程度塗り続ける。",
     "links": ["/switch/lamisil/", "/otc-similar/use/antifungal/"]},
    {"tag": "上乗せ料金",
     "desc": "ゾビラックス軟膏・アラセナ-Aは上乗せ料金の対象？口唇ヘルペスの市販薬が使える条件",
     "facts": "両方とも対象（案）。市販のアクチビア・ヘルペシアは「医師の診断を受けたことがある再発」のみ。初めての発症・性器ヘルペスは受診。",
     "links": ["/switch/zovirax/", "/otc-similar/use/antiviral/"]},
    {"tag": "上乗せ料金",
     "desc": "イソジンうがい薬は上乗せ料金の対象？処方と市販の違い、ヨウ素を避けたほうがよい人",
     "facts": "対象（案）。市販イソジンうがい薬は同じポビドンヨード7%。甲状腺疾患・ヨウ素過敏症は注意。",
     "links": ["/switch/isodine/", "/otc-similar/use/antiseptic/"]},
    {"tag": "上乗せ料金",
     "desc": "プロペト・白色ワセリン・ケラチナミン（尿素）は上乗せ料金の対象？保湿剤の市販薬の選び方",
     "facts": "3つとも対象（案）。市販の白色ワセリン・プロペト ピュアベール・ケラチナミンコーワ20%は同成分。目の周りは精製度の高い製品。",
     "links": ["/switch/propeto/", "/switch/keratinamin/", "/otc-similar/use/skin/"]},
    {"tag": "上乗せ料金",
     "desc": "葛根湯などの漢方薬は上乗せ料金の対象？77成分に漢方が入っていない理由と今後",
     "facts": "漢方薬は案に含まれず対象外。令和9年度以降の拡大で変わる可能性。市販の葛根湯はエキス量（満量処方か）が製品で異なる。",
     "links": ["/switch/kakkonto/", "/otc-similar/"]},
    {"tag": "制度解説",
     "desc": "年金生活の高齢者（1割・2割負担）にとっての上乗せ料金。薬代はどう変わり、どこで相談すればよいか",
     "facts": "1割負担は100円→約330円と増え幅が相対的に大きい。長期使用は医師判断で対象外の方向。薬局・かかりつけ医で相談。",
     "links": ["/otc-similar/", "/otc-similar/name/"]},
    {"tag": "制度解説",
     "desc": "こどもの処方薬（ヒルドイド・アレグラ・ホクナリンなど）は上乗せ料金がかかる？小児の扱い",
     "facts": "こどもは対象外とする方向で検討中（年齢の線引きは未確定）。ホクナリンテープは77成分に含まれない。断定を避け「検討中」を明記。",
     "links": ["/otc-similar/", "/switch/hirudoid/"]},
    {"tag": "制度解説",
     "desc": "市販薬に替える？替えない？上乗せ料金が始まる前に整理しておく判断の目安（長期・慢性・併用・小児）",
     "facts": "サイトは切替を推奨しない立場。含有量・剤形・適応の違い、併用薬の重複、受診が必要なサイン、薬剤師への相談を軸に。",
     "links": ["/switch/", "/otc-similar/"]},
    {"tag": "制度解説",
     "desc": "処方薬と市販薬、結局どちらが安い？薬代・上乗せ料金・診察料と市販価格の比べ方",
     "facts": "処方には診察料・調剤料などの技術料がかかる点、市販は全額自己負担だが受診の手間がない点を整理。具体的な市販価格は書かない（変動するため）。",
     "links": ["/otc-similar/", "/switch/"]},
    {"tag": "制度解説",
     "desc": "令和9年度以降はどう広がる？今は対象外の薬（カロナール・ガスター・漢方）は今後どうなるか",
     "facts": "令和9年度以降に対象範囲の拡大・料率引き上げを検討。具体的な追加成分は未定なので予測を断定しない。",
     "links": ["/otc-similar/", "/switch/calonal/", "/switch/gaster/"]},
    {"tag": "制度解説",
     "desc": "市販薬に替えたら税金が戻る？セルフメディケーション税制と上乗せ料金の関係",
     "facts": "セルフメディケーション税制は対象市販薬の年間購入額が12,000円を超えた分（上限88,000円）を所得控除。レシート保管が必要。上乗せ料金との組み合わせは「制度は別物」と明記。",
     "links": ["/otc-similar/", "/switch/"]},
    {"tag": "制度解説",
     "desc": "薬局で「この薬は上乗せ料金の対象ですか？」と聞くときのポイント。お薬手帳の活用と相談のしかた",
     "facts": "聞き方の例、成分名の確認、同成分の市販薬があるかの確認、長期使用の相談。当サイトの「薬の名前で探す」を紹介。",
     "links": ["/otc-similar/name/", "/otc-similar/"]},
]

# 旧テーマ（制度テーマを使い切った後に回す）
GENERAL_THEMES = [
    {"tag": "安全情報", "desc": "市販薬の飲み合わせ危険ランキング。サプリ・他薬との相互作用"},
    {"tag": "安全情報", "desc": "妊娠中・授乳中に使える市販薬・使えない市販薬の見分け方"},
    {"tag": "安全情報", "desc": "子ども（12歳未満）に与えてはいけない市販薬成分"},
    {"tag": "安全情報", "desc": "市販薬の過量服用リスク。アセトアミノフェンの肝障害"},
    {"tag": "安全情報", "desc": "高齢者が注意すべき市販薬。腎機能・認知機能への影響"},
    {"tag": "安全情報", "desc": "運転前に飲んではいけない市販薬成分一覧"},
    {"tag": "安全情報", "desc": "市販薬と食品の組み合わせ注意。グレープフルーツ・アルコール"},
    {"tag": "基礎知識", "desc": "ジェネリック医薬品と先発薬の違い。OTCでの選び方"},
    {"tag": "基礎知識", "desc": "第1類・第2類・第3類の違いと薬剤師に相談すべきケース"},
    {"tag": "基礎知識", "desc": "市販薬の使用期限。開封後と未開封での違い"},
    {"tag": "基礎知識", "desc": "解熱鎮痛薬の選び方。アセトアミノフェン・イブプロフェン・ロキソプロフェン比較"},
    {"tag": "基礎知識", "desc": "抗ヒスタミン薬の第1世代・第2世代の違いと選び方"},
    {"tag": "花粉症",   "desc": "花粉症薬の正しい飲み始めタイミング。シーズン前から始める理由"},
    {"tag": "花粉症",   "desc": "点鼻薬・点眼薬・飲み薬の使い分け。花粉症治療の組み合わせ方"},
    {"tag": "かぜ薬",   "desc": "風邪の症状に合った市販薬の選び方。のど・鼻・熱それぞれの対処"},
    {"tag": "かぜ薬",   "desc": "総合感冒薬は本当に必要か？症状に応じた単剤選択という考え方"},
    {"tag": "胃腸",     "desc": "胃薬の選び方。制酸薬・H2ブロッカー・PPIの違いと使い分け"},
    {"tag": "胃腸",     "desc": "下痢止めを飲むべきケース・飲まないほうがいいケース"},
    {"tag": "美容・スキンケア", "desc": "シミ・肝斑に効く市販薬成分。トラネキサム酸・ビタミンCの違い"},
    {"tag": "育毛",     "desc": "ミノキシジル配合育毛剤の正しい使い方と期待できる効果"},
    {"tag": "漢方",     "desc": "葛根湯は万能薬？漢方薬を正しく使うための「証」の考え方"},
    {"tag": "漢方",     "desc": "防風通聖散・大柴胡湯・防己黄耆湯。肥満に用いる漢方薬の違い"},
    {"tag": "安全情報", "desc": "景品表示法改正で変わった健康食品広告のルール"},
    {"tag": "基礎知識", "desc": "機能性表示食品と医薬品の違い。パッケージの見分け方"},
    {"tag": "安全情報", "desc": "定期購入トラブル急増。健康食品・サプリの契約に潜む罠"},
]

ALL_THEMES = POLICY_THEMES + GENERAL_THEMES


def theme_key(index: int) -> str:
    return f"t{index:02d}"


# ══════════════════════════════════════════════════════════
#  本文正規化（callout / 生HTML → 標準Markdown）
# ══════════════════════════════════════════════════════════

CALLOUT_ICON = {
    "tip":     "💡",
    "info":    "ℹ️",
    "note":    "📝",
    "warn":    "⚠️",
    "warning": "⚠️",
    "danger":  "🚨",
    "caution": "⚠️",
}

# blockquote = 「> **💡 タイトル**」形式（引用ブロックとして装飾される）
# plain      = 「**💡 タイトル**」＋通常段落（引用が効かないレンダラー用フォールバック）
CALLOUT_STYLE = os.environ.get("CALLOUT_STYLE", "blockquote").lower()

_FENCE_START = re.compile(
    r'^\s*:{3,}\s*(tip|info|note|warn|warning|danger|caution)\b\s*(.*?)\s*$', re.I)
_FENCE_END   = re.compile(r'^\s*:{3,}\s*$')
_HTML_START  = re.compile(
    r'^\s*<div\s+class=["\']callout-(\w+)["\']\s*>\s*(.*)$', re.I)
_TITLE_DIV   = re.compile(
    r'<div\s+class=["\']callout-title["\']\s*>(.*?)</div>', re.I | re.S)
_ANY_DIV     = re.compile(r'</?div[^>]*>', re.I)


def _render_callout(kind: str, title: str, body_lines: list) -> str:
    icon  = CALLOUT_ICON.get(kind.lower(), "💡")
    title = (title or "").strip()
    head  = f"**{icon} {title}**" if title else f"**{icon}**"
    body  = [l.strip() for l in body_lines if l.strip()]

    if CALLOUT_STYLE == "blockquote":
        out = [f"> {head}", ">"]
        out += [f"> {l}" for l in body]
        return "\n".join(out)
    return "\n\n".join([head] + body)


def normalize_body(body: str) -> tuple[str, dict]:
    """::: 記法・生HTML callout を標準Markdownへ。(正規化後本文, 統計) を返す"""
    stats = {"fence": 0, "html": 0, "stray_div": 0}
    body  = body.replace("\r\n", "\n")
    lines = body.split("\n")
    out, i, n = [], 0, len(lines)

    while i < n:
        line = lines[i]

        # ── ::: tip タイトル ... :::
        m = _FENCE_START.match(line)
        if m:
            kind, title = m.group(1), m.group(2)
            i += 1
            buf = []
            while i < n and not _FENCE_END.match(lines[i]):
                buf.append(lines[i]); i += 1
            i += 1  # 閉じ ::: を消費
            out.append(_render_callout(kind, title, buf))
            out.append("")
            stats["fence"] += 1
            continue

        # ── <div class="callout-tip"> ... </div>
        m = _HTML_START.match(line)
        if m:
            kind = m.group(1)
            chunk_lines = [m.group(2)]
            depth = 1 + len(re.findall(r'<div\b', m.group(2), re.I)) \
                      - len(re.findall(r'</div>', m.group(2), re.I))
            i += 1
            while i < n and depth > 0:
                l = lines[i]
                depth += len(re.findall(r'<div\b', l, re.I))
                depth -= len(re.findall(r'</div>', l, re.I))
                chunk_lines.append(l)
                i += 1
            chunk = "\n".join(chunk_lines)
            tm = _TITLE_DIV.search(chunk)
            title = tm.group(1).strip() if tm else ""
            chunk = _TITLE_DIV.sub("", chunk)
            chunk = _ANY_DIV.sub("", chunk)
            out.append(_render_callout(kind, title, chunk.split("\n")))
            out.append("")
            stats["html"] += 1
            continue

        out.append(line); i += 1

    text = "\n".join(out)

    # 取りこぼした裸の <div> / </div> を除去
    stray = len(_ANY_DIV.findall(text))
    if stray:
        stats["stray_div"] = stray
        text = _ANY_DIV.sub("", text)

    text = re.sub(r'[ \t]+\n', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip() + "\n", stats


# ══════════════════════════════════════════════════════════
#  システムプロンプト
# ══════════════════════════════════════════════════════════

_BASE_PROMPT = """あなたは薬剤師・医療ライターです。
市販薬（OTC医薬品）の正しい選び方・安全な使い方について、消費者向けにわかりやすいコラムを書いてください。

## 読者
- 60〜80代が中心。スマートフォンで読む
- 1文は短く（40文字程度まで）。専門用語には必ず言い換えを添える（例：薬剤費（薬そのものの値段））
- 結論を最初の3行で書く。その後に理由・詳細

## 制約
- 根拠は厚生労働省・消費者庁・PMDAの公開情報に基づく
- 医療行為や診断の代替にならないことを明記する
- 本文は3000〜4000文字程度（日本語）
- 最後に「出典：」を記載する
- 一人称は使わない
- 数字（金額・時期・件数）は、与えられた参考情報にあるものだけを使う。参考情報にない数字を作らない
- 処方薬から市販薬への切替を推奨しない。判断材料の提示と、薬剤師・医師への相談を促す立場で書く

## サイト内リンク（必ず入れる）
指定された「本文に入れるリンク」は、それぞれ本文中の自然な位置に **Markdownのリンク記法** で必ず入れること。
例: [自分の薬が対象か、名前で調べる](/otc-similar/name/)
URLは指定されたものをそのまま使い、変更・追加しない。

## 記法（厳守）
本文は **純粋なMarkdownのみ** で書くこと。
使ってよい記法は次のものだけ：
  ## 見出し / ### 小見出し / **太字** / - 箇条書き / 1. 番号リスト
  | 表 | 形式 | / > 引用 / [リンク](URL) / 吹き出し（下記 ::: 記法）

**HTMLタグは絶対に出力しないこと。**
`<div>` `<span>` `<br>` `<p>` `<table>` などを1文字でも書いてはいけない。
特に `<div class="callout-tip">` のような書き方は禁止。吹き出しは必ず下の ::: 記法を使うこと。

## 吹き出し記法（2〜3個必ず使う）
:::tip タイトル
本文（1〜3行）
:::

:::warn タイトル
本文（1〜3行）
:::

:::danger タイトル
本文（1〜3行）
:::

開始行は `:::tip` のようにコロン3つ＋種別＋半角スペース＋タイトル。
終了行は `:::` のみを単独行で書くこと。中に空行を入れないこと。

## 読みやすさ
- 文字だけが続かないよう、比較・分類の説明には必ずMarkdownの表を1〜2個使うこと
- 1つの段落は3文以内にすること
"""

_IMAGE_PROMPT = """
## 画像の挿入ルール
本文中の適切な箇所（見出しの直後・重要な説明の後）に、以下の形式で画像を挿入すること。
{IMAGE_BASE_URL} はシステムが自動で置換するプレースホルダなのでそのまま記述すること。

![画像の説明文]({IMAGE_BASE_URL}/1.png)

画像は本文中に3〜5枚、番号は1から順に振ること。
"""

_JSON_FORMAT_NOIMG = """
## 出力フォーマット（JSONのみ・余分なテキスト不要）
{
  "title": "記事タイトル（60文字以内）",
  "tag": "タグ",
  "summary": "サマリー（100文字以内）",
  "body": "本文（Markdown形式、3000〜4000文字）"
}
"""

_JSON_FORMAT_IMG = """
## 出力フォーマット（JSONのみ・余分なテキスト不要）
{
  "title": "記事タイトル（60文字以内）",
  "tag": "タグ",
  "summary": "サマリー（100文字以内）",
  "body": "本文（Markdown形式、3000〜4000文字）",
  "image_prompts": [
    {
      "label": "サムネイル",
      "is_thumb": true,
      "filename": "thumb.png",
      "prompt": "Flat vector illustration for thumbnail. Topic: [記事の主題を英語で]. Teal and navy palette, no text, no faces, no dates. 16:9 ratio."
    },
    {
      "label": "本文①：[見出し名]",
      "filename": "1.png",
      "prompt": "Flat vector illustration of [内容を英語で説明]. Clean minimal design, teal palette, no text, no faces, no dates. 16:9 ratio."
    }
  ]
}

image_promptsは本文中の画像と同じ数だけ生成すること（thumb.pngは別枠）。
各promptは英語で flat vector illustration スタイル、no text・no faces・no dates を必ず含めること。
"""


def build_system_prompt(with_images: bool) -> str:
    if with_images:
        return _BASE_PROMPT + _IMAGE_PROMPT + _JSON_FORMAT_IMG
    return _BASE_PROMPT + _JSON_FORMAT_NOIMG


# ══════════════════════════════════════════════════════════

def build_user_prompt(theme: dict, context: str, with_images: bool) -> str:
    tag, desc = theme["tag"], theme["desc"]
    parts = [
        "次のテーマでコラムを書いてください：\n",
        f"テーマ: {desc}",
        f"タグ: {tag}",
    ]
    if tag in POLICY_TAGS:
        parts.append(
            "\nタイトルには薬の名前（あれば）と「上乗せ料金」を入れ、2027年3月からの話だと分かるようにすること。"
            "\n制度の呼び方は「上乗せ料金」を主に使い、正式名称「OTC類似薬の特別の料金」は一度だけ括弧で添えること。"
        )
    if theme.get("facts"):
        parts.append(f"\nこのテーマで必ず触れる事実:\n{theme['facts']}")
    if theme.get("links"):
        parts.append("\n本文に入れるリンク（すべて必須・URLはそのまま）:")
        parts += [f"- {u}" for u in theme["links"]]
    if tag in POLICY_TAGS:
        parts.append("\n参考情報（この中の数字だけを使うこと）:\n" + POLICY_CONTEXT)
    if with_images:
        parts.append(
            "\n画像URLベース: {IMAGE_BASE_URL}\n"
            "（本文中の画像はすべて {IMAGE_BASE_URL}/1.png, /2.png ... の形式で挿入してください）"
        )
    parts.append("\nHTMLタグは一切使わず、Markdownと ::: 吹き出し記法だけで書いてください。")
    if context:
        parts.append(f"\n参考データ（関連OTC商品）:\n{context}")
    return "\n".join(parts)


def call_claude(theme: dict, context: str = "",
                with_images: bool = False, model: str = "claude-opus-4-5-20251101") -> dict | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("[gen] ANTHROPIC_API_KEY が未設定", file=sys.stderr)
        return None

    user_prompt = build_user_prompt(theme, context, with_images)

    payload = json.dumps({
        "model": model,
        "max_tokens": 6000,
        "system": build_system_prompt(with_images),
        "messages": [{"role": "user", "content": user_prompt}]
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            resp = json.loads(r.read().decode("utf-8"))
            text = "".join(b.get("text", "") for b in resp.get("content", [])).strip()
            text = re.sub(r'^```(?:json)?\s*|\s*```$', '', text).strip()
            m = re.search(r'\{[\s\S]+\}', text)
            if m:
                return json.loads(m.group())
            print("[gen] JSONが抽出できませんでした", file=sys.stderr)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"[gen] Claude APIエラー: {e.code} {e.reason}", file=sys.stderr)
        print(f"[gen] レスポンス: {body}", file=sys.stderr)
    except Exception as e:
        print(f"[gen] Claude APIエラー: {e}", file=sys.stderr)
    return None


def save_image_prompts(image_prompts: list, date_folder: str) -> str | None:
    """画像プロンプトJSONをSupabase Storageに保存してURLを返す"""
    sb_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    sb_key = os.environ.get("SUPABASE_KEY", "")
    if not sb_url or not sb_key:
        return None
    try:
        payload = json.dumps(image_prompts, ensure_ascii=False, indent=2).encode("utf-8")
        storage_path = f"{date_folder}/prompts.json"
        req = urllib.request.Request(
            f"{sb_url}/storage/v1/object/column-images/{storage_path}",
            data=payload,
            headers={
                "apikey": sb_key,
                "Authorization": f"Bearer {sb_key}",
                "Content-Type": "application/json",
                "x-upsert": "true",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30):
            pass
        public_url = f"{sb_url}/storage/v1/object/public/column-images/{storage_path}"
        print(f"[gen] プロンプトJSON保存: {public_url}")
        return public_url
    except urllib.error.HTTPError as e:
        print(f"[gen] プロンプトJSON保存失敗: {e.code} {e.read().decode('utf-8')[:200]}", file=sys.stderr)
        print("[gen]   → anonキーではStorage書き込みが拒否される場合があります（バケットのINSERTポリシーを確認）", file=sys.stderr)
    except Exception as e:
        print(f"[gen] プロンプトJSON保存失敗: {e}", file=sys.stderr)
    return None


def _sb_headers() -> dict:
    sb_key = os.environ.get("SUPABASE_KEY", "")
    return {"apikey": sb_key, "Authorization": f"Bearer {sb_key}"}


def used_theme_keys() -> set[str]:
    """Supabase上の既存コラムIDから、使用済みテーマ番号（_tNN）を集める"""
    sb_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if not sb_url or not os.environ.get("SUPABASE_KEY"):
        return set()
    url = f"{sb_url}/rest/v1/columns?select=id&id=like.auto_*&limit=2000"
    req = urllib.request.Request(url, headers=_sb_headers(), method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            rows = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"[gen] 使用済みテーマの取得に失敗（重複防止なしで続行）: {e}", file=sys.stderr)
        return set()
    used = set()
    for row in rows:
        m = re.search(r'_(t\d{2})$', str(row.get("id", "")))
        if m:
            used.add(m.group(1))
    return used


def pick_theme() -> tuple[int, dict]:
    """未使用のテーマを上から順に選ぶ。全部使い切ったら先頭から再利用（警告付き）"""
    used = used_theme_keys()
    for i, t in enumerate(ALL_THEMES):
        if theme_key(i) not in used:
            return i, t
    print(f"[gen] ⚠️ 全{len(ALL_THEMES)}テーマ使用済み。先頭から再利用します（テーマの追加を検討）", file=sys.stderr)
    return 0, ALL_THEMES[0]


def save_to_supabase(col: dict) -> bool:
    sb_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    sb_key = os.environ.get("SUPABASE_KEY", "")
    if not sb_url or not sb_key:
        print("[gen] SUPABASE_URL / SUPABASE_KEY が未設定", file=sys.stderr)
        return False

    check_url = f"{sb_url}/rest/v1/columns?id=eq.{col['id']}&select=id"
    req_check = urllib.request.Request(check_url, headers=_sb_headers(), method="GET")
    try:
        with urllib.request.urlopen(req_check, timeout=30) as r:
            if json.loads(r.read().decode("utf-8")):
                print(f"[gen] Supabase内ID重複: {col['id']} → スキップ（正常）")
                return True
    except Exception as e:
        print(f"[gen] 重複チェックエラー: {e}", file=sys.stderr)

    payload = json.dumps({
        "id":         col["id"],
        "title":      col["title"],
        "date":       col["date"],
        "tag":        col["tag"],
        "summary":    col["summary"],
        "body":       col["body"],
        "status":     "draft",
        "updated_at": datetime.now(JST).isoformat(),
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{sb_url}/rest/v1/columns",
        data=payload,
        headers={
            "apikey":        sb_key,
            "Authorization": f"Bearer {sb_key}",
            "Content-Type":  "application/json",
            "Prefer":        "return=minimal",
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"[gen] Supabase保存完了: status={r.status}")
            return True
    except urllib.error.HTTPError as e:
        print(f"[gen] Supabase保存エラー: {e.code} {e.read().decode('utf-8')}", file=sys.stderr)
    except Exception as e:
        print(f"[gen] Supabase保存エラー: {e}", file=sys.stderr)
    return False


def get_medicines_context(tag: str) -> str:
    if not MED_JSON.exists():
        return ""
    try:
        data = json.loads(MED_JSON.read_text(encoding="utf-8"))
        meds = data.get("medicines", [])
        tag_to_cat = {
            "花粉症": ["allergy", "nose"],
            "かぜ薬": ["cold"],
            "胃腸":   ["stomach"],
            "育毛":   ["hair"],
        }
        cats = tag_to_cat.get(tag, [])
        relevant = [m for m in meds if m.get("cat") in cats and m.get("effect")][:5]
        if not relevant:
            return ""
        return "\n".join(
            f"- {m['name']}（{m.get('maker','')}）: {m.get('effect','')[:60]}"
            for m in relevant
        )
    except Exception:
        return ""


def run(dry_run=False, theme_index=None, with_images=False,
        preview=False, no_save=False):
    today    = datetime.now(JST)
    date_str = today.strftime("%Y-%m-%d")
    slot     = 0 if today.hour < 15 else 1

    if theme_index is not None:
        idx   = theme_index % len(ALL_THEMES)
        theme = ALL_THEMES[idx]
    else:
        idx, theme = pick_theme()

    col_id = f"auto_{today.strftime('%Y%m%d')}_{slot}_{theme_key(idx)}"

    print(f"[gen] テーマ[{idx:02d}]: [{theme['tag']}] {theme['desc']}")
    print(f"[gen] コラムID: {col_id}")
    print(f"[gen] 画像モード: {'ON' if with_images else 'OFF'}")
    print(f"[gen] callout形式: {CALLOUT_STYLE}")

    if dry_run:
        print("[gen] dry-run モード（APIは呼ばない）")
        return True

    context  = get_medicines_context(theme["tag"])
    print("[gen] Claude APIでコラム生成中...")
    col_data = call_claude(theme, context, with_images=with_images)

    if not col_data:
        print("[gen] コラム生成失敗", file=sys.stderr)
        return False

    body = col_data.get("body", "")

    # ── 正規化（callout / 生HTML → 標準Markdown）
    body, stats = normalize_body(body)
    print(f"[gen] 正規化: :::記法 {stats['fence']}件 / HTML callout {stats['html']}件 "
          f"/ 裸のdiv除去 {stats['stray_div']}件")
    if stats["html"] or stats["stray_div"]:
        print("[gen] ⚠️ モデルがHTMLを出力しました（正規化済み・要プロンプト監視）")

    # ── 指定リンクが入っているか検査（欠けていたら末尾に「関連ページ」として補う）
    missing = [u for u in theme.get("links", []) if f"]({u})" not in body]
    if missing:
        print(f"[gen] ⚠️ 指定リンク未挿入 {len(missing)}件 → 末尾に補います: {missing}")
        label = {
            "/otc-similar/": "上乗せ料金とは？なぜ・いつから・いくら",
            "/otc-similar/name/": "自分の薬が対象か、名前で調べる",
            "/otc-similar/use/": "用途から対象の成分を探す",
            "/switch/": "処方薬から市販薬を探す",
        }
        lines = ["", "## 関連ページ"]
        for u in missing:
            text = label.get(u)
            if not text:
                m = re.match(r'/otc-similar/use/([a-z_]+)/', u)
                text = "同じ用途の対象成分と市販薬" if m else "同じ成分の市販薬と切替時の注意"
            lines.append(f"- [{text}]({u})")
        body = body.rstrip() + "\n" + "\n".join(lines) + "\n"

    # ── 画像URL置換
    sb_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    date_folder = today.strftime("%Y%m%d")
    if with_images:
        if not sb_url:
            print("[gen] SUPABASE_URL 未設定のため画像URLを置換できません", file=sys.stderr)
            return False
        image_base_url = f"{sb_url}/storage/v1/object/public/column-images/{date_folder}"
        body = body.replace("{IMAGE_BASE_URL}", image_base_url)
        img_count = len(re.findall(r'!\[[^\]]*\]\([^)]*?/\d+\.png\)', body))
        print(f"[gen] 画像挿入: {img_count} 箇所 / ベース: {image_base_url}")
        prompts = col_data.get("image_prompts", [])
        body_imgs = [p for p in prompts if not p.get("is_thumb")]
        if len(body_imgs) != img_count:
            print(f"[gen] ⚠️ 本文の画像数({img_count})とimage_prompts({len(body_imgs)})が不一致", file=sys.stderr)
    else:
        # 画像モードOFFなのにプレースホルダが残っていたら行ごと削除
        removed = len(re.findall(r'^.*\{IMAGE_BASE_URL\}.*$', body, re.M))
        if removed:
            body = re.sub(r'^.*\{IMAGE_BASE_URL\}.*$\n?', '', body, flags=re.M)
            print(f"[gen] 画像プレースホルダ {removed} 行を削除（画像モードOFF）")

    col = {
        "id":      col_id,
        "title":   col_data.get("title", theme["desc"][:60]),
        "date":    date_str,
        "tag":     col_data.get("tag", theme["tag"]),
        "summary": col_data.get("summary", "")[:200],
        "body":    body,
    }

    print(f"[gen] タイトル: {col['title']}")
    print(f"[gen] 文字数: {len(col['body'])} 文字")

    if preview:
        print("\n" + "─" * 60)
        print(col["body"])
        print("─" * 60 + "\n")

    if no_save:
        print("[gen] --no-save のため保存しません")
        return True

    if with_images:
        prompts = col_data.get("image_prompts", [])
        if prompts:
            print(f"[gen] 画像プロンプト: {len(prompts)} 件")
            save_image_prompts(prompts, date_folder)
            prompts_path = DATA_DIR / f"prompts_{col_id}.json"
            prompts_path.write_text(
                json.dumps(prompts, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[gen] 画像プロンプトJSON保存: {prompts_path.name}")
        else:
            print("[gen] ⚠️ image_promptsが空です")

    if save_to_supabase(col):
        print("[gen] ✅ Supabaseに下書き保存しました")
        print("[gen] → admin.html で確認・編集後に公開してください")
        return True
    return False


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run",     action="store_true", help="APIを呼ばずテーマ確認のみ")
    p.add_argument("--theme",       type=int, default=None, help="テーマ番号（--list で確認）")
    p.add_argument("--list",        action="store_true")
    p.add_argument("--with-images", action="store_true", help="本文に画像を挿入する")
    p.add_argument("--preview",     action="store_true", help="本文を標準出力に表示")
    p.add_argument("--no-save",     action="store_true", help="Supabaseに保存しない")
    a = p.parse_args()

    if a.list:
        used = used_theme_keys()
        for i, t in enumerate(ALL_THEMES):
            mark = "済" if theme_key(i) in used else "  "
            print(f"[{i:2d}] {mark} {t['tag']}: {t['desc']}")
        sys.exit(0)

    ok = run(dry_run=a.dry_run, theme_index=a.theme, with_images=a.with_images,
             preview=a.preview, no_save=a.no_save)
    sys.exit(0 if ok else 1)
