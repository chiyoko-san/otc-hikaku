#!/usr/bin/env python3
"""build.py — medicines.json → index.html"""
import json, argparse, re
from pathlib import Path
from datetime import datetime

DATA_DIR = Path(__file__).parent
SRC_JSON = DATA_DIR / "medicines.json"
OUT_HTML = DATA_DIR.parent / "index.html"

# ── 成分効果辞典 ─────────────────────────────────────
ING_DICT = {
    "アセトアミノフェン": {"en":"Acetaminophen","effect":"解熱・鎮痛。プロスタグランジン合成を抑制し、痛みや発熱を緩和します。胃への刺激が少なく、空腹時でも服用可能。","caution":"過量服用・飲酒との併用で肝障害リスク。1日最大量4000mgを厳守。","color":"#3b82f6"},
    "イブプロフェン": {"en":"Ibuprofen","effect":"消炎・鎮痛・解熱。NSAIDsの代表。炎症の原因物質(プロスタグランジン)を強力に抑制し、痛み・腫れ・熱を取り除きます。","caution":"空腹時服用で胃腸障害。喘息患者・妊娠後期禁忌。腎機能障害に注意。","color":"#3b82f6"},
    "ロキソプロフェンナトリウム": {"en":"Loxoprofen","effect":"プロドラッグ型NSAIDs。体内で活性化され強力な消炎鎮痛効果を発揮。胃腸への直接刺激が少ない設計。","caution":"第1類医薬品（薬剤師要相談）。腎機能・心機能障害者注意。","color":"#3b82f6"},
    "アスピリン": {"en":"Aspirin","effect":"NSAIDs。解熱鎮痛に加え、低用量では血小板凝集抑制（抗血栓）作用も持つ。","caution":"15歳未満・インフルエンザ患者禁忌（ライ症候群）。胃潰瘍に注意。","color":"#3b82f6"},
    "クロルフェニラミンマレイン酸塩": {"en":"Chlorpheniramine","effect":"第一世代抗ヒスタミン薬。アレルギー反応を抑え、鼻水・くしゃみ・かゆみを改善。鎮静作用で眠気が出やすい。","caution":"眠気・集中力低下。車の運転不可。緑内障・前立腺肥大患者注意。","color":"#f59e0b"},
    "ジフェンヒドラミン": {"en":"Diphenhydramine","effect":"第一世代抗ヒスタミン薬。アレルギー症状の緩和と強い鎮静作用。睡眠補助薬としても使用される。","caution":"強い眠気。運転不可。連続使用で効果減弱（耐性）が起きやすい。","color":"#f59e0b"},
    "フェキソフェナジン": {"en":"Fexofenadine","effect":"第二世代抗ヒスタミン薬。眠気が出にくく、花粉症・アレルギー性鼻炎に広く使用される。1日2回服用。","caution":"果汁（グレープフルーツ・オレンジ等）と同時服用で吸収低下。","color":"#10b981"},
    "ロラタジン": {"en":"Loratadine","effect":"第二世代抗ヒスタミン薬。1日1回服用で眠気が出にくい。アレルギー性鼻炎・蕁麻疹に有効。","caution":"腎・肝機能障害者は減量。","color":"#10b981"},
    "エピナスチン塩酸塩": {"en":"Epinastine","effect":"第二世代抗ヒスタミン薬。1日1回。花粉症の予防的服用にも有効。抗炎症作用を併せ持つ。","caution":"眠気が出ることあり。高齢者は慎重に。","color":"#10b981"},
    "ジヒドロコデインリン酸塩": {"en":"Dihydrocodeine","effect":"中枢性鎮咳薬。咳中枢を直接抑制し強力な鎮咳効果を発揮。痰が多い場合は去痰薬と併用。","caution":"⚠️依存性あり。12歳未満禁忌。眠気・便秘。連用で精神的・身体的依存。","color":"#ef4444"},
    "コデインリン酸塩": {"en":"Codeine","effect":"中枢性鎮咳・鎮痛薬。強力な咳止め効果と軽度の鎮痛作用を持つ。","caution":"⚠️依存性あり。12歳未満禁忌。眠気・便秘・呼吸抑制リスク。","color":"#ef4444"},
    "アリルイソプロピルアセチル尿素": {"en":"Allylisopropylacetylurea","effect":"鎮静・催眠補助成分。解熱鎮痛薬に配合され、痛みへの不安を和らげる鎮静作用を持つ。","caution":"⚠️2023年AU全面規制・2025年KR麻薬類指定。依存性あり。眠気必発・運転不可。","color":"#ef4444"},
    "ブロムワレリル尿素": {"en":"Bromvalerylurea","effect":"鎮静・催眠補助成分。鎮痛薬への配合で鎮静効果を補助する。","caution":"⚠️海外規制済・依存性あり。眠気・運転不可。連用禁忌。","color":"#ef4444"},
    "グアイフェネシン": {"en":"Guaifenesin","effect":"去痰薬。気道の分泌液を増やし痰を柔らかくして排出を促進。単独では咳を止めない。","caution":"大量の水分補給で効果UP。過剰摂取で悪心。","color":"#8b5cf6"},
    "カルボシステイン": {"en":"Carbocisteine","effect":"去痰・鼻粘膜正常化薬。痰の粘性を下げ排出を助けると同時に、鼻づまりにも効果。","caution":"副作用少なく比較的安全。長期服用可能。","color":"#8b5cf6"},
    "ファモチジン": {"en":"Famotidine","effect":"H2ブロッカー。胃酸分泌を抑制しストマ・胸やけ・胃痛を改善。効果持続8〜12時間。","caution":"第1類（薬剤師要相談）。腎機能障害者は用量調整必要。","color":"#0ea5e9"},
    "ビサコジル": {"en":"Bisacodyl","effect":"大腸刺激型下剤。大腸の蠕動運動を促進し排便を助ける。就寝前服用で翌朝に効果。","caution":"連用で依存性（弛緩性便秘）。妊婦・授乳婦注意。牛乳と同時服用禁忌。","color":"#0ea5e9"},
    "センノシド": {"en":"Sennoside","effect":"刺激性下剤。大腸で分解され腸壁を刺激し排便を促進。就寝前服用で翌朝効果。","caution":"連用禁忌（習慣性）。妊婦注意。腹痛を伴う便秘には使用禁忌。","color":"#0ea5e9"},
    "ミノキシジル": {"en":"Minoxidil","effect":"血管拡張作用により頭皮の血流を改善し毛包に栄養を供給。発毛・育毛を促進。","caution":"要指導（薬剤師要相談）。低血圧・心臓病禁忌。4ヶ月以上継続必要。","color":"#10b981"},
    "テルビナフィン": {"en":"Terbinafine","effect":"アリルアミン系抗真菌薬。白癬菌の細胞膜合成を阻害。水虫・たむしに有効。","caution":"爪水虫には浸透しにくい（専用製品が必要）。皮膚刺激に注意。","color":"#10b981"},
    "ビフォナゾール": {"en":"Bifonazole","effect":"イミダゾール系抗真菌薬。真菌の細胞膜を破壊。水虫・いんきんたむし・ぜにたむしに有効。","caution":"角層浸透性高く1日1回で効果。眼・粘膜への接触回避。","color":"#10b981"},
    "ニコチン": {"en":"Nicotine","effect":"ニコチン代替療法。禁煙時のニコチン渇望・禁断症状を緩和し、段階的に依存を断ち切る。","caution":"第1類（薬剤師要相談）。喫煙との並行禁忌。心臓疾患・妊婦禁忌。","color":"#f59e0b"},
    "フルスルチアミン": {"en":"Fursultiamine","effect":"ビタミンB1誘導体（脂溶性）。通常のB1より吸収が良く、神経機能の維持・エネルギー代謝の促進に働く。","caution":"大量摂取で消化器症状。過剰分は尿中に排泄される。","color":"#6366f1"},
    "シアノコバラミン": {"en":"Cyanocobalamin","effect":"ビタミンB12。神経細胞の修復・DNA合成に不可欠。末梢神経障害・しびれ・貧血に有効。","caution":"基本的に安全。大量投与でも毒性は低い。","color":"#6366f1"},
    "メコバラミン": {"en":"Mecobalamin","effect":"活性型ビタミンB12（補酵素型）。通常のB12より末梢神経への移行が良好。しびれ・神経痛に直接的に効く。","caution":"光に不安定。遮光保存が重要。","color":"#6366f1"},
    "トラネキサム酸": {"en":"Tranexamic acid","effect":"抗プラスミン薬。炎症・アレルギー反応を抑制。肝斑（シミ）の改善に特異的な効果を持つ。","caution":"血栓症リスクのある方は服用前に相談。長期服用の安全性は確立。","color":"#ec4899"},
    "L-システイン": {"en":"L-Cysteine","effect":"アミノ酸。メラニン生成を抑制しシミ・そばかすを改善。ケラチン合成にも寄与し髪・爪・皮膚を強化。","caution":"基本的に安全。過剰摂取で消化器症状の可能性。","color":"#ec4899"},
    "コンドロイチン硫酸エステルナトリウム": {"en":"Chondroitin sulfate","effect":"軟骨の主成分。関節軟骨の保護・再生を助け、膝・腰の関節痛を緩和。目薬では角膜保護にも使用。","caution":"効果発現まで数週間〜数ヶ月。副作用は少ない。","color":"#0ea5e9"},
    "ベクロメタゾン": {"en":"Beclomethasone","effect":"局所ステロイド。鼻腔内の炎症を直接抑制。アレルギー性鼻炎に高い効果を発揮。全身への影響は少ない。","caution":"鼻感染症には使用禁忌。長期使用で鼻粘膜乾燥。","color":"#f97316"},
    "ヒドロコルチゾン": {"en":"Hydrocortisone","effect":"弱〜中強度ステロイド。皮膚・粘膜の炎症・かゆみを抑制。外用・坐薬等に使用。","caution":"長期・広範囲・顔面使用禁忌。感染症への使用禁忌。","color":"#f97316"},
    "木クレオソート": {"en":"Wood Creosote","effect":"殺菌・収れん・局所麻酔作用。腸内の過剰な蠕動を抑え下痢を改善。古くから使われる民間薬由来成分。","caution":"独特のにおい。大量使用で口腔粘膜への刺激。","color":"#0ea5e9"},
    "ラクトミン": {"en":"Lactobacillus","effect":"乳酸菌（プロバイオティクス）。腸内細菌バランスを改善し、下痢・便秘・腹部膨満を緩和。","caution":"副作用はほぼない。冷暗所保存が効果を維持。","color":"#10b981"},
    "ポビドンヨード": {"en":"Povidone-iodine","effect":"ヨウ素系殺菌消毒薬。細菌・真菌・ウイルスに広範な殺菌効果。傷の消毒・うがいに使用。","caution":"甲状腺疾患・妊婦・授乳婦注意。ヨウ素アレルギーに禁忌。","color":"#8b5cf6"},
    "エタノール": {"en":"Ethanol","effect":"タンパク質変性による殺菌消毒。70〜80%濃度で最大効果。手指消毒・医療器具の消毒に広く使用。","caution":"引火性あり火気厳禁。粘膜・目への直接使用禁忌。","color":"#8b5cf6"},
}

# ── コラムデータ ──────────────────────────────────────
COLUMNS = [
    {
        "id": "c1",
        "title": "第1類・第2類・第3類、何が違うの？OTC医薬品のリスク区分を徹底解説",
        "date": "2026-03-01",
        "tag": "基礎知識",
        "summary": "薬局で見かける「第1類」「第2類」などの表示。これはリスクの高さを示す分類です。選び方・購入方法の違いを解説します。",
        "body": """OTC（市販）医薬品は副作用リスクに応じて4段階に分類されています。

**要指導医薬品（最もリスクが高い）**
ダイレクトOTCやスイッチ直後の成分が含まれます。薬剤師による対面販売が義務付けられ、ネット購入は不可。ミノキシジル5%（リアップX5等）が代表例です。

**第1類医薬品**
副作用・相互作用のリスクが高い成分を含みます。薬剤師からの情報提供が義務。ファモチジン（ガスター10）、ロキソプロフェン（ロキソニンS）、ニコチン製品等。ネット購入時も薬剤師とのやり取りが必要です。

**第2類医薬品（指定第2類含む）**
比較的リスクの高い成分を含む薬。登録販売者でも販売可能。市販薬の大半がこのカテゴリ。パブロン・バファリン・コーラック等。

**第3類医薬品**
日常的なビタミン剤・整腸薬など、副作用リスクが比較的低い薬。コンビニでも販売可能なものも。

**選び方のポイント**：症状が重い・長期間続く場合は医師への受診を優先。市販薬を選ぶ際は第1類・要指導は薬剤師に相談する習慣をつけましょう。""",
    },
    {
        "id": "c2",
        "title": "「ア尿素」が含まれる市販薬に注意。海外で規制が進む依存性成分とは",
        "date": "2026-03-10",
        "tag": "安全情報",
        "summary": "イブA錠などに含まれる「アリルイソプロピルアセチル尿素（ア尿素）」。2023年にオーストラリアで全面規制、2025年には韓国で麻薬類に指定されました。",
        "body": """**アリルイソプロピルアセチル尿素（ア尿素）とは**

解熱鎮痛薬に「鎮静補助成分」として配合されている成分です。痛みへの不安を和らげ薬の効果を高める目的で長年使用されてきましたが、近年その依存性が問題視されています。

**規制の動向**
- 2023年：オーストラリアで販売全面禁止
- 2025年：韓国で麻薬類に指定
- 日本：現時点では規制なし、販売継続中

**含有する主な市販薬**
イブA錠、イブクイック頭痛薬DX、ノーシンピュア等

**症状と注意点**
- 服用後に必ず眠気が出る（運転・機械操作禁忌）
- 長期・頻回使用で耐性・依存が形成される
- 急な中断で不快感（不眠、焦燥感）が生じることも

**代替選択肢**
同様の症状にはア尿素を含まないアセトアミノフェン単体（タイレノールA等）やイブプロフェン（ただしア尿素なし製品を選ぶ）を選ぶと安全です。""",
    },
    {
        "id": "c3",
        "title": "花粉症の市販薬、眠くなる・ならないの差は？成分で選ぶ正しい方法",
        "date": "2026-03-15",
        "tag": "花粉症",
        "summary": "「眠くなる花粉症薬」と「眠くならない花粉症薬」の違いは世代の違いにあります。仕事中でも使える薬の選び方を解説。",
        "body": """花粉症薬の「眠気の出やすさ」は、抗ヒスタミン薬の世代によって大きく異なります。

**第一世代抗ヒスタミン薬（眠気が強い）**
クロルフェニラミン、ジフェンヒドラミン等。血液脳関門を通過しやすく、脳内のヒスタミン受容体も遮断するため強い眠気が出ます。
→ 就寝前に服用、乗り物酔い防止にも使われる

**第二世代抗ヒスタミン薬（眠気が少ない）**
フェキソフェナジン（アレグラFX）、ロラタジン（クラリチンEX）、エピナスチン（アレジオン20）等。血液脳関門を通過しにくく、末梢のアレルギー反応を選択的に抑える。
→ 日中の使用・仕事・運転（製品により異なる）に適している

**選び方のポイント**
- 仕事中・運転あり → 第二世代（フェキソフェナジン・ロラタジンが特に眠気少）
- 夜間・症状が強い → 第一世代も選択肢（コスト低め）
- ステロイド点鼻薬（ベクロメタゾン等）の併用で効果大幅アップ

**服用タイミング**
花粉飛散シーズン前（1〜2週間前）から予防的に服用を開始すると、シーズン中の症状が大幅に軽減されます。""",
    },
    {
        "id": "c4",
        "title": "コデイン系咳止め薬の12歳未満禁忌。なぜ？代替品の選び方",
        "date": "2026-03-20",
        "tag": "安全情報",
        "summary": "2019年以降、コデイン・ジヒドロコデイン含有薬の12歳未満への使用が禁忌となりました。その理由と安全な代替品を解説します。",
        "body": """**なぜ12歳未満禁忌になったのか**

コデインは体内でモルヒネに変換されます。大人はゆっくり変換されますが、CYP2D6という酵素が活発な「超高速代謝者」では急激に大量のモルヒネが産生される可能性があります。

特に子どもでは代謝の個人差が大きく、呼吸抑制（呼吸が止まる）という重篤な副作用が報告されたため、2019年に12歳未満への使用が禁忌となりました。

**コデイン系が含まれる主な市販薬**
- ブロン錠エース
- パブロンゴールドA
- 新コンタック咳止めダブル持続性
- エスタックイブNEX

**子どもの咳に使える代替品**
- カルボシステイン（去痰薬）：痰を柔らかくして排出促進。副作用少なく安全
- ムコダインSなど去痰薬中心の製品
- 龍角散（生薬系）：のど・咳に穏やかに作用

**大人でも注意**
コデイン系は依存性があるため、必要最小限の期間・量での使用が推奨されます。""",
    },
]

def run(output=None):
    out = Path(output) if output else OUT_HTML
    with open(SRC_JSON, encoding="utf-8") as f:
        data = json.load(f)

    meds = data.get("medicines", [])
    updated = data.get("updated_at", "")
    try:
        dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
        updated_str = dt.strftime("%Y年%m月%d日 更新")
    except Exception:
        updated_str = ""

    meds_js = json.dumps(meds, ensure_ascii=False).replace("</script>", "<\\/script>")
    ing_dict_js = json.dumps(ING_DICT, ensure_ascii=False).replace("</script>", "<\\/script>")
    columns_js = json.dumps(COLUMNS, ensure_ascii=False).replace("</script>", "<\\/script>")

    print(f"[build] {len(meds)}件 成分辞典:{len(ING_DICT)}件 コラム:{len(COLUMNS)}件 → {out}")

    html = build(meds_js, ing_dict_js, columns_js, updated_str, len(meds))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"[build] 完了 {out.stat().st_size:,} bytes")

def build(meds_js, ing_dict_js, columns_js, updated_str, count):
    tpl = '''<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>くすり成分ガイド｜OTC医薬品 成分・効能・価格データベース</title>
<meta name="description" content="市販薬を成分から比較。第1類〜第3類のリスク区分、眠気の有無、要注意成分を一覧で確認。__COUNT__品目収録。">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{{
  --navy:#0f1c35;--teal:#2fa18d;--teal2:#1a7f6e;--tl:#e8f5f2;
  --amber:#fffbeb;--amberb:#f59e0b;--red:#b91c1c;--rb:#fef2f2;
  --sl:#f1f5f9;--bd:#e2e8f0;--bdm:#cbd5e1;
  --tx:#0f172a;--txm:#475569;--txl:#94a3b8;--wh:#fff;
  --shadow:0 1px 3px rgba(15,23,42,.08);
  --shadow-lg:0 4px 16px rgba(15,23,42,.12);
}}
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'Noto Sans JP',-apple-system,sans-serif;background:var(--sl);color:var(--tx);font-size:14px;line-height:1.7}}
a{{color:inherit;text-decoration:none}}
button{{cursor:pointer;font-family:inherit}}

/* ── NAV ── */
.nav{{background:var(--navy);border-bottom:3px solid var(--teal);position:sticky;top:0;z-index:100}}
.nav-inner{{max-width:1240px;margin:0 auto;padding:0 20px;display:flex;align-items:center;gap:16px;height:52px}}
.logo{{font-size:17px;font-weight:700;color:#fff;white-space:nowrap}}
.logo em{{color:var(--teal);font-style:normal}}
.nav-tabs{{display:flex;gap:2px;margin-left:auto}}
.nav-tab{{padding:6px 14px;border-radius:6px;font-size:13px;font-weight:500;color:#94a3b8;background:transparent;border:none;transition:all .15s}}
.nav-tab:hover{{color:#fff;background:rgba(255,255,255,.08)}}
.nav-tab.active{{color:#fff;background:var(--teal2)}}
.nav-badge{{font-size:11px;padding:2px 6px;border-radius:10px;background:var(--teal);color:#fff;margin-left:4px;vertical-align:middle}}

/* ── PAGES ── */
.page{{display:none;max-width:1240px;margin:0 auto;padding:16px 20px 60px}}
.page.active{{display:block}}
.page-2col{{display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:start}}

/* ── SIDEBAR ── */
.sb{{position:sticky;top:68px;display:flex;flex-direction:column;gap:8px;max-height:calc(100vh - 80px);overflow-y:auto;scrollbar-width:thin}}
.sb::-webkit-scrollbar{{width:3px}}
.sb::-webkit-scrollbar-thumb{{background:var(--bdm);border-radius:2px}}

/* アコーディオン */
.acc{{background:var(--wh);border:1px solid var(--bd);border-radius:10px;overflow:hidden;box-shadow:var(--shadow)}}
.acc-hd{{display:flex;align-items:center;gap:6px;padding:10px 14px;font-size:13px;font-weight:600;color:var(--txm);background:transparent;border:none;width:100%;text-align:left;transition:background .12s}}
.acc-hd:hover{{background:var(--sl)}}
.acc-hd .acc-ico{{font-size:14px}}
.acc-hd .acc-count{{margin-left:auto;font-size:11px;padding:2px 7px;background:var(--teal);color:#fff;border-radius:10px;display:none}}
.acc-hd .acc-count.show{{display:inline}}
.acc-hd .acc-arr{{margin-left:6px;font-size:10px;color:var(--txl);transition:transform .2s}}
.acc-hd.open .acc-arr{{transform:rotate(180deg)}}
.acc-bd{{display:none;padding:8px 10px 12px}}
.acc-bd.open{{display:block}}

/* 検索 */
.srch-wrap{{background:var(--wh);border:1px solid var(--bd);border-radius:10px;padding:10px;box-shadow:var(--shadow)}}
.srch-box{{position:relative}}
.srch-box input{{width:100%;padding:8px 8px 8px 32px;border:1.5px solid var(--bd);border-radius:7px;font-size:13px;outline:none;font-family:inherit}}
.srch-box input:focus{{border-color:var(--teal);box-shadow:0 0 0 3px rgba(47,161,141,.12)}}
.srch-ico{{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--txl);font-size:14px;pointer-events:none}}

/* カテゴリボタン */
.cat-list{{display:flex;flex-direction:column;gap:1px}}
.cbtn{{display:flex;align-items:center;gap:7px;width:100%;padding:5px 8px;border-radius:6px;border:none;background:transparent;font-size:12.5px;color:var(--txm);text-align:left;transition:all .12s}}
.cbtn:hover{{background:var(--tl);color:var(--teal2)}}
.cbtn.active{{background:var(--tl);color:var(--teal2);font-weight:600}}
.cbtn .cico{{font-size:13px;width:18px;text-align:center}}
.cbtn .cbadge{{margin-left:auto;font-size:10px;padding:1px 5px;background:var(--sl);border-radius:8px;color:var(--txl)}}
.cbtn.active .cbadge{{background:rgba(47,161,141,.15);color:var(--teal2)}}

/* 症状タグ */
.sym-group{{margin-bottom:8px}}
.sym-gh{{display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:var(--txm);padding:3px 0;border-bottom:1px solid var(--bd);cursor:pointer;user-select:none;margin-bottom:4px}}
.sym-gh .gar{{margin-left:auto;font-size:10px;transition:transform .15s}}
.sym-gh.col .gar{{transform:rotate(-90deg)}}
.sym-tags{{display:flex;flex-wrap:wrap;gap:3px}}
.sym-tags.hidden{{display:none}}
.stag{{font-size:11px;padding:2px 8px;border-radius:12px;border:1px solid var(--bd);cursor:pointer;color:var(--txm);background:var(--wh);user-select:none;transition:all .12s}}
.stag:hover{{border-color:var(--amberb);color:#92400e;background:var(--amber)}}
.stag.active{{background:var(--amberb);border-color:var(--amberb);color:#fff;font-weight:600}}

/* 成分チップ */
.ichip{{font-size:11px;padding:2px 7px;border-radius:12px;border:1px solid var(--bd);cursor:pointer;color:var(--txm);background:var(--wh);margin:2px;display:inline-block;transition:all .12s}}
.ichip:hover{{border-color:var(--teal);color:var(--teal)}}
.ichip.active{{background:var(--teal);border-color:var(--teal);color:#fff}}

/* フィルタ */
.fsel{{width:100%;padding:6px 8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;color:var(--tx);background:var(--wh);outline:none;font-family:inherit;margin-top:5px}}
.chk{{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--txm);cursor:pointer;padding:3px 0}}
.chk input{{accent-color:var(--teal)}}
.rbtn{{width:100%;padding:6px;border:1px dashed var(--bdm);border-radius:6px;background:transparent;font-size:12px;color:var(--txl);margin-top:8px;transition:all .12s}}
.rbtn:hover{{border-color:var(--red);color:var(--red);background:var(--rb)}}

/* 警告ボックス */
.warn-box{{background:var(--rb);border:1px solid #fecaca;border-radius:8px;padding:10px 12px;font-size:11px;color:#7f1d1d;line-height:1.8}}
.warn-box strong{{color:var(--red);display:block;margin-bottom:2px;font-size:12px}}

/* ── MAIN ── */
.main{{min-width:0}}
.res-bar{{margin-bottom:10px;display:flex;align-items:center;flex-wrap:wrap;gap:8px}}
.res-info{{font-size:13px;color:var(--txm)}}
.res-info strong{{color:var(--tx);font-size:16px;font-weight:700}}
.af-chips{{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}}
.afc{{display:inline-flex;align-items:center;gap:3px;font-size:11px;padding:2px 8px;background:var(--tl);color:var(--teal2);border-radius:12px;border:1px solid rgba(47,161,141,.25)}}
.afc button{{background:none;border:none;font-size:13px;color:var(--teal2);padding:0 1px;line-height:1}}

/* 比較ボタン */
.cmp-bar{{background:var(--wh);border:1px solid var(--bd);border-radius:8px;padding:8px 14px;margin-bottom:10px;display:flex;align-items:center;gap:10px;box-shadow:var(--shadow)}}
.cmp-bar span{{font-size:13px;color:var(--txm)}}
.cmp-btn{{padding:5px 14px;background:var(--teal);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600}}
.cmp-btn:disabled{{background:var(--bdm);cursor:not-allowed}}
.cmp-count{{font-size:11px;padding:1px 6px;background:var(--teal);color:#fff;border-radius:10px}}

/* ── カード ── */
.grid{{display:flex;flex-direction:column;gap:8px}}
.card{{background:var(--wh);border:1px solid var(--bd);border-radius:10px;padding:13px 16px;box-shadow:var(--shadow);transition:box-shadow .15s,border-color .15s;position:relative}}
.card:hover{{box-shadow:var(--shadow-lg);border-color:#c5d5e5}}
.card-sel{{position:absolute;top:10px;right:12px}}
.card-sel input[type=checkbox]{{accent-color:var(--teal);width:16px;height:16px;cursor:pointer}}
.chard{{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:5px;padding-right:28px}}
.cname{{font-size:15px;font-weight:700}}
.cmaker{{font-size:11px;color:var(--txl);margin-top:1px}}
.cprice{{text-align:right;flex-shrink:0}}
.cpval{{font-size:18px;font-weight:700}}
.cpval.nopr{{font-size:12px;color:var(--txl);font-weight:400}}
.cpnote{{font-size:10px;color:var(--txl)}}
.badges{{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px}}
.badge{{font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;white-space:nowrap}}
.bc{{background:#1c2b4a;color:#cbd5e1}}
.r0,.r1{{background:#fee2e2;color:#991b1b;border:1px solid #fecaca}}
.r2{{background:#fff7ed;color:#92400e;border:1px solid #fed7aa}}
.r25{{background:#fef3c7;color:#78350f;border:1px solid #fde68a}}
.r3{{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}}
.bd2{{background:#f5f3ff;color:#5b21b6;border:1px solid #ddd6fe}}
.bw{{background:#fef9c3;color:#713f12;border:1px solid #fde047}}
.csymp{{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px}}
.sym{{font-size:10px;padding:2px 7px;border-radius:12px;background:#fef3c7;color:#92400e;border:1px solid #fde68a}}
.sym.hit{{background:var(--amberb);color:#fff;border-color:var(--amberb);font-weight:600}}
.cef{{font-size:12px;color:var(--txm);margin-bottom:7px;line-height:1.6}}
.ings{{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:7px}}
.itag{{font-size:11px;padding:2px 7px;border-radius:4px;cursor:pointer;transition:opacity .12s}}
.itag:hover{{opacity:.8}}
.in{{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}}
.im{{background:var(--tl);color:var(--teal2);border:1px solid #99d4cd;font-weight:600}}
.iw{{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}}
.note{{font-size:11.5px;padding:6px 10px;border-radius:6px;margin-bottom:7px;line-height:1.7}}
.nn{{background:var(--sl);color:var(--txm);border-left:3px solid var(--bdm)}}
.nw{{background:var(--amber);color:#713f12;border-left:3px solid var(--amberb)}}
.nd{{background:var(--rb);color:#7f1d1d;border-left:3px solid var(--red)}}
.cfoot{{display:flex;justify-content:space-between;align-items:center;padding-top:7px;border-top:1px solid var(--bd);font-size:11px}}
.cfoot a{{color:#2563eb}}
.cfoot a:hover{{text-decoration:underline}}
.cfootl{{color:var(--txl)}}
.sim-btn{{font-size:11px;padding:2px 8px;border:1px solid var(--teal);border-radius:12px;color:var(--teal);background:transparent}}
.sim-btn:hover{{background:var(--tl)}}

/* ── ページネーション ── */
.pagi{{display:flex;justify-content:center;align-items:center;gap:4px;margin-top:16px;flex-wrap:wrap}}
.pgb{{min-width:32px;height:32px;padding:0 7px;border:1px solid var(--bd);border-radius:6px;background:var(--wh);font-size:13px;color:var(--txm);transition:all .12s}}
.pgb:hover:not(:disabled){{border-color:var(--teal);color:var(--teal)}}
.pgb.active{{background:var(--teal);border-color:var(--teal);color:#fff;font-weight:600}}
.pgb:disabled{{opacity:.35;cursor:not-allowed}}
.pagi-info{{font-size:12px;color:var(--txl);padding:0 4px}}
.nores{{text-align:center;padding:50px 20px;color:var(--txl)}}
.nores .nores-ico{{font-size:36px;margin-bottom:8px}}

/* ── 比較表モーダル ── */
.modal-bg{{position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px)}}
.modal-bg.hidden{{display:none}}
.modal{{background:var(--wh);border-radius:12px;max-width:900px;width:100%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(15,23,42,.25)}}
.modal-hd{{padding:16px 20px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between}}
.modal-hd h2{{font-size:16px;font-weight:700}}
.modal-close{{width:32px;height:32px;border:none;background:var(--sl);border-radius:6px;font-size:18px;color:var(--txm)}}
.modal-body{{overflow:auto;padding:16px 20px}}
.cmp-table{{width:100%;border-collapse:collapse;font-size:12px}}
.cmp-table th,.cmp-table td{{padding:8px 10px;border:1px solid var(--bd);text-align:left;vertical-align:top}}
.cmp-table th{{background:var(--sl);font-weight:600;color:var(--txm);white-space:nowrap}}
.cmp-table tr:nth-child(even){{background:#f8fafc}}
.cmp-table .cmp-name{{font-weight:700;font-size:13px}}
.cmp-table .cmp-risk0,.cmp-table .cmp-risk1{{background:#fee2e2}}
.cmp-table .cmp-risk2,.cmp-table .cmp-risk25{{background:#fff7ed}}
.cmp-table .cmp-risk3{{background:#f0fdf4}}
.cmp-ings-row td{{font-size:11px}}
.ck{{color:#10b981;font-weight:700;font-size:14px}}
.cx{{color:#cbd5e1}}

/* 成分ポップアップ */
.ing-popup{{position:fixed;z-index:300;background:var(--navy);color:#e2e8f0;border-radius:10px;padding:14px 16px;max-width:320px;font-size:12px;line-height:1.7;box-shadow:0 8px 32px rgba(15,23,42,.4);pointer-events:none;opacity:0;transition:opacity .15s}}
.ing-popup.show{{opacity:1}}
.ing-popup h4{{font-size:13px;font-weight:700;color:#fff;margin-bottom:4px}}
.ing-popup .ing-en{{font-size:10px;color:#94a3b8;margin-bottom:6px}}
.ing-popup .ing-effect{{color:#e2e8f0;margin-bottom:4px}}
.ing-popup .ing-caution{{color:#fca5a5;border-top:1px solid rgba(255,255,255,.1);padding-top:4px;margin-top:4px}}

/* 類似商品 */
.sim-panel{{background:var(--sl);border:1px solid var(--bd);border-radius:10px;padding:14px;margin-top:10px}}
.sim-panel h3{{font-size:13px;font-weight:700;margin-bottom:10px;color:var(--txm)}}
.sim-cards{{display:flex;flex-direction:column;gap:8px}}
.sim-card{{background:var(--wh);border:1px solid var(--bd);border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px}}
.sim-card-info{{min-width:0}}
.sim-card-name{{font-size:13px;font-weight:600}}
.sim-card-score{{font-size:11px;color:var(--txl)}}
.sim-card-btn{{font-size:11px;padding:4px 12px;background:var(--teal);color:#fff;border:none;border-radius:6px;white-space:nowrap}}

/* ── 症状ガイド ── */
.guide-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:20px}}
.guide-card{{background:var(--wh);border:1px solid var(--bd);border-radius:10px;padding:16px;cursor:pointer;transition:all .15s;text-align:center}}
.guide-card:hover{{border-color:var(--teal);box-shadow:var(--shadow-lg);transform:translateY(-1px)}}
.guide-card .g-ico{{font-size:28px;margin-bottom:6px}}
.guide-card .g-name{{font-size:14px;font-weight:600}}
.guide-card .g-sub{{font-size:11px;color:var(--txl);margin-top:2px}}

/* ── コラム ── */
.col-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}}
.col-card{{background:var(--wh);border:1px solid var(--bd);border-radius:10px;overflow:hidden;cursor:pointer;transition:all .15s;box-shadow:var(--shadow)}}
.col-card:hover{{box-shadow:var(--shadow-lg);transform:translateY(-2px)}}
.col-card-top{{background:linear-gradient(135deg,var(--navy) 0%,#1e3a5f 100%);padding:20px;color:#fff}}
.col-card-tag{{font-size:10px;padding:2px 8px;background:var(--teal);border-radius:10px;display:inline-block;margin-bottom:8px}}
.col-card-title{{font-size:14px;font-weight:700;line-height:1.5}}
.col-card-body{{padding:14px}}
.col-card-date{{font-size:11px;color:var(--txl);margin-bottom:6px}}
.col-card-summary{{font-size:12px;color:var(--txm);line-height:1.7}}
.col-detail{{background:var(--wh);border-radius:10px;padding:24px;box-shadow:var(--shadow);max-width:760px;margin:0 auto}}
.col-detail h1{{font-size:20px;font-weight:700;line-height:1.5;margin-bottom:8px}}
.col-detail .col-meta{{font-size:12px;color:var(--txl);margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--bd)}}
.col-detail .col-body{{font-size:14px;line-height:1.9;color:var(--tx)}}
.col-detail .col-body h2{{font-size:16px;font-weight:700;margin:20px 0 8px;color:var(--navy)}}
.col-detail .col-body p{{margin-bottom:12px}}
.col-back{{display:inline-flex;align-items:center;gap:4px;font-size:13px;color:var(--teal);margin-bottom:16px}}
.col-back:hover{{text-decoration:underline}}

/* ページタイトル */
.page-title{{font-size:18px;font-weight:700;margin-bottom:16px;color:var(--navy)}}
.page-desc{{font-size:13px;color:var(--txm);margin-bottom:16px}}

/* フッター */
.footer{{background:var(--navy);color:#64748b;text-align:center;padding:20px;font-size:11px;margin-top:40px}}

@media(max-width:800px){{
  .page-2col{{grid-template-columns:1fr}}
  .sb{{position:static;max-height:none}}
  .nav-tab span{{display:none}}
  .guide-grid{{grid-template-columns:repeat(2,1fr)}}
}}
</style>
</head>
<body>

<!-- NAV -->
<nav class="nav">
  <div class="nav-inner">
    <div class="logo">くすり成分<em>ガイド</em></div>
    <div class="nav-tabs">
      <button class="nav-tab active" onclick="showPage('search')" id="tab-search">🔍 <span>検索</span></button>
      <button class="nav-tab" onclick="showPage('guide')" id="tab-guide">💊 <span>症状から選ぶ</span></button>
      <button class="nav-tab" onclick="showPage('column')" id="tab-column">📖 <span>コラム</span></button>
    </div>
    <div style="font-size:11px;color:#475569;margin-left:8px;white-space:nowrap">__UPDATED_STR__</div>
  </div>
</nav>

<!-- ページ1: 検索 -->
<div class="page active" id="page-search">
  <div class="page-2col">

    <!-- サイドバー -->
    <aside class="sb">
      <!-- 検索ボックス -->
      <div class="srch-wrap">
        <div class="srch-box">
          <span class="srch-ico">🔍</span>
          <input type="text" id="q" placeholder="商品名・成分・症状・メーカー…" autocomplete="off">
        </div>
      </div>

      <!-- カテゴリ（アコーディオン） -->
      <div class="acc">
        <button class="acc-hd" onclick="toggleAcc(this)">
          <span class="acc-ico">💊</span> カテゴリ
          <span class="acc-count" id="acc-cat-cnt"></span>
          <span class="acc-arr">▼</span>
        </button>
        <div class="acc-bd">
          <div class="cat-list" id="catlist"></div>
        </div>
      </div>

      <!-- 症状（アコーディオン） -->
      <div class="acc">
        <button class="acc-hd" onclick="toggleAcc(this)">
          <span class="acc-ico">🤕</span> 症状で絞り込む
          <span class="acc-count" id="acc-sym-cnt"></span>
          <span class="acc-arr">▼</span>
        </button>
        <div class="acc-bd">
          <div id="sym-area"></div>
        </div>
      </div>

      <!-- 成分（アコーディオン） -->
      <div class="acc">
        <button class="acc-hd" onclick="toggleAcc(this)">
          <span class="acc-ico">⚗️</span> 成分で絞り込む
          <span class="acc-count" id="acc-ing-cnt"></span>
          <span class="acc-arr">▼</span>
        </button>
        <div class="acc-bd">
          <div id="ing-area" style="max-height:200px;overflow-y:auto;display:flex;flex-wrap:wrap"></div>
        </div>
      </div>

      <!-- その他フィルタ（アコーディオン） -->
      <div class="acc">
        <button class="acc-hd open" onclick="toggleAcc(this)">
          <span class="acc-ico">⚙️</span> 絞り込み・並び替え
          <span class="acc-arr">▼</span>
        </button>
        <div class="acc-bd open">
          <select class="fsel" id="frisk">
            <option value="">リスク区分：すべて</option>
            <option value="0">要指導医薬品</option>
            <option value="1">第1類</option>
            <option value="2">第2類（指定含む）</option>
            <option value="3">第3類</option>
          </select>
          <select class="fsel" id="fsort" style="margin-top:6px">
            <option value="default">並び替え：デフォルト</option>
            <option value="price_asc">価格：安い順</option>
            <option value="price_desc">価格：高い順</option>
            <option value="name">名前：五十音順</option>
            <option value="risk">リスク区分順</option>
          </select>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
            <label class="chk"><input type="checkbox" id="cnd"> 眠気なしのみ表示</label>
            <label class="chk"><input type="checkbox" id="cnw"> 要注意成分を含まない</label>
          </div>
          <button class="rbtn" id="rbtn">✕ すべてリセット</button>
        </div>
      </div>

      <!-- 警告 -->
      <div class="warn-box">
        <strong>⚠️ 要注意成分について</strong>
        <b>ア尿素</b>（アリルイソプロピルアセチル尿素）→ 2023年AU規制・2025年KR麻薬類指定<br>
        <b>コデイン系</b> → 12歳未満禁忌・依存リスク
      </div>
    </aside>

    <!-- メイン -->
    <main class="main">
      <!-- 比較バー -->
      <div class="cmp-bar">
        <span>比較したい商品を選択 <span class="cmp-count" id="cmp-count">0</span>/4</span>
        <button class="cmp-btn" id="cmp-open-btn" disabled onclick="openCompare()">📊 成分比較表を開く</button>
      </div>

      <div class="res-bar">
        <div>
          <div class="res-info" id="ri"></div>
          <div class="af-chips" id="af"></div>
        </div>
      </div>
      <div class="grid" id="grid"></div>
      <div class="pagi" id="pagi"></div>
    </main>
  </div>
</div>

<!-- ページ2: 症状から選ぶ -->
<div class="page" id="page-guide">
  <div class="page-title">症状から薬を選ぶ</div>
  <div class="page-desc">症状をクリックすると、該当する薬の一覧を表示します。</div>
  <div class="guide-grid" id="guide-grid"></div>
  <div id="guide-result"></div>
</div>

<!-- ページ3: コラム -->
<div class="page" id="page-column">
  <div id="col-list-view">
    <div class="page-title">📖 お役立ちコラム</div>
    <div class="page-desc">市販薬の正しい選び方・安全な使い方を解説します。</div>
    <div class="col-grid" id="col-grid"></div>
  </div>
  <div id="col-detail-view" style="display:none"></div>
</div>

<!-- 比較モーダル -->
<div class="modal-bg hidden" id="cmp-modal">
  <div class="modal">
    <div class="modal-hd">
      <h2>📊 成分比較表</h2>
      <button class="modal-close" onclick="closeCompare()">×</button>
    </div>
    <div class="modal-body" id="cmp-body"></div>
  </div>
</div>

<!-- 成分ポップアップ -->
<div class="ing-popup" id="ing-popup">
  <h4 id="ip-name"></h4>
  <div class="ing-en" id="ip-en"></div>
  <div class="ing-effect" id="ip-effect"></div>
  <div class="ing-caution" id="ip-caution"></div>
</div>

<!-- フッター -->
<footer class="footer">
  本サイトはPMDA添付文書等の公開情報を元にした一般情報提供です。服用前に必ず添付文書をお読みください。広告収入を得ていません。
</footer>

<script>
// ── データ ─────────────────────────────────────────
const MEDS = __MEDS_JS__;
const ING_DICT = __ING_DICT_JS__;
const COLUMNS = __COLUMNS_JS__;

const SYMP_GROUPS = [
  {{g:"痛み・熱",i:"🔥",s:["頭痛","偏頭痛","歯痛","のど痛","月経痛","腰痛","関節痛","筋肉痛","神経痛","打撲・ねんざ","発熱"]}},
  {{g:"鼻・目・のど",i:"👃",s:["鼻水","くしゃみ","鼻づまり","目のかゆみ","充血","目の疲れ","乾き目","花粉症","のどの炎症","のど痛"]}},
  {{g:"咳・痰・声",i:"😮‍💨",s:["せき","たん","声がれ","口腔殺菌"]}},
  {{g:"胃腸・お腹",i:"🫃",s:["胃痛","胸やけ","胃もたれ","食べ過ぎ","飲み過ぎ","吐き気","下痢","便秘","腹部膨満","整腸"]}},
  {{g:"皮膚・かゆみ",i:"🧴",s:["湿疹・かぶれ","かゆみ","虫刺され","乾燥肌","にきび","口内炎","水虫","肌荒れ"]}},
  {{g:"疲労・神経",i:"💪",s:["肉体疲労","眼精疲労","手足のしびれ","冷え","めまい・立ちくらみ","動悸"]}},
  {{g:"美容",i:"✨",s:["シミ・そばかす","肝斑","肌荒れ","薄毛・脱毛"]}},
  {{g:"女性・メンタル",i:"🌙",s:["更年期障害","月経不順","不眠","乗物酔い"]}},
  {{g:"その他",i:"💊",s:["禁煙","痔","排卵確認","妊娠確認","消毒"]}},
];
const CATS = [
  {{id:"all",l:"すべて",i:"💊"}},{{id:"cold",l:"かぜ薬・解熱鎮痛",i:"🤒"}},
  {{id:"stomach",l:"消化器官用薬",i:"🫃"}},{{id:"allergy",l:"アレルギー用薬",i:"🌸"}},
  {{id:"cough",l:"鎮咳・去痰・含嗽薬",i:"😮‍💨"}},{{id:"nose",l:"鼻炎用薬",i:"👃"}},
  {{id:"ext_pain",l:"外皮用薬（鎮痛）",i:"🩹"}},{{id:"ext_skin",l:"外皮用薬（皮膚）",i:"🧴"}},
  {{id:"eye",l:"眼科用薬",i:"👁"}},{{id:"joint",l:"関節・筋肉（内服）",i:"🦴"}},
  {{id:"skin_oral",l:"皮膚科・シミ（内服）",i:"✨"}},{{id:"hair",l:"育毛・発毛薬",i:"💈"}},
  {{id:"women",l:"女性用薬",i:"🌙"}},{{id:"sleep",l:"催眠鎮静薬",i:"😴"}},
  {{id:"vitamin",l:"ビタミン・滋養強壮",i:"💪"}},{{id:"kampo",l:"漢方製剤",i:"🌿"}},
  {{id:"foot",l:"水虫・皮膚感染",i:"🦶"}},{{id:"oral",l:"歯科口腔用薬",i:"🦷"}},
  {{id:"anal",l:"痔疾用薬",i:"🔴"}},{{id:"circu",l:"循環器・血液用薬",i:"❤️"}},
  {{id:"smoking",l:"禁煙補助剤",i:"🚭"}},{{id:"motion",l:"乗物酔い",i:"🚢"}},
  {{id:"test",l:"一般用検査薬",i:"🔬"}},{{id:"disinfect",l:"消毒薬",i:"🧪"}},
];
const RLABEL={{0:"要指導",1:"第1類",2:"第2類（指定）",2.5:"第２類",3:"第3類"}};
const RCLS={{0:"r0",1:"r1",2:"r2",2.5:"r25",3:"r3"}};

// ── 状態 ────────────────────────────────────────────
const S={{cat:"all",q:"",ings:new Set(),syms:new Set(),risk:"",sort:"default",nd:false,nw:false,page:1,pp:20}};
const CMP_SET = new Set(); // 比較選択中の商品ID

// ── ページ切替 ──────────────────────────────────────
function showPage(id){{
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  document.getElementById('tab-'+id).classList.add('active');
  if(id==='column') renderColumns();
  if(id==='guide') renderGuide();
}}

// ── アコーディオン ──────────────────────────────────
function toggleAcc(btn){{
  btn.classList.toggle('open');
  const bd=btn.nextElementSibling;
  bd.classList.toggle('open');
}}

// ── カテゴリ構築 ────────────────────────────────────
const catEl=document.getElementById('catlist');
CATS.forEach(c=>{{
  const cnt=c.id==='all'?MEDS.length:MEDS.filter(m=>m.cat===c.id).length;
  if(cnt===0&&c.id!=='all')return;
  const b=document.createElement('button');
  b.className='cbtn'+(c.id==='all'?' active':'');
  b.dataset.cat=c.id;
  b.innerHTML=`<span class="cico">${{c.i}}</span>${{c.l}}<span class="cbadge">${{cnt}}</span>`;
  b.addEventListener('click',()=>{{
    document.querySelectorAll('.cbtn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');S.cat=c.id;S.page=1;render();
    updateAccCnt();
  }});
  catEl.appendChild(b);
}});

// ── 症状パネル ──────────────────────────────────────
function buildSymp(){{
  const el=document.getElementById('sym-area');el.innerHTML='';
  SYMP_GROUPS.forEach(grp=>{{
    const d=document.createElement('div');d.className='sym-group';
    const h=document.createElement('div');h.className='sym-gh';
    h.innerHTML=`<span>${{grp.i}}</span>${{grp.g}}<span class="gar">▼</span>`;
    const t=document.createElement('div');t.className='sym-tags hidden';
    grp.s.forEach(sym=>{{
      const cnt=MEDS.filter(m=>m.symptoms&&m.symptoms.includes(sym)).length;
      if(cnt===0)return;
      const sp=document.createElement('span');
      sp.className='stag'+(S.syms.has(sym)?' active':'');
      sp.innerHTML=`${{sym}}<span style="opacity:.5;font-size:9px;margin-left:2px">${{cnt}}</span>`;
      sp.addEventListener('click',()=>{{
        if(S.syms.has(sym))S.syms.delete(sym);else S.syms.add(sym);
        sp.classList.toggle('active');S.page=1;render();updateAccCnt();
      }});
      t.appendChild(sp);
    }});
    h.addEventListener('click',()=>{{h.classList.toggle('col');t.classList.toggle('hidden');}});
    d.appendChild(h);d.appendChild(t);el.appendChild(d);
  }});
}}
buildSymp();

// ── 成分チップ ──────────────────────────────────────
function buildIngs(){{
  const map={{}};
  MEDS.forEach(m=>(m.ings||[]).forEach(ing=>{{
    const k=ing.replace(/[\(（][^)）]*[\)）]/g,'').trim();
    if(k)map[k]=(map[k]||0)+1;
  }}));
  const sorted=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,80).map(e=>e[0]);
  const el=document.getElementById('ing-area');el.innerHTML='';
  sorted.forEach(ing=>{{
    const c=document.createElement('span');
    c.className='ichip'+(S.ings.has(ing)?' active':'');
    c.textContent=ing;
    c.addEventListener('click',()=>{{
      if(S.ings.has(ing)){{S.ings.delete(ing);c.classList.remove('active');}}
      else{{S.ings.add(ing);c.classList.add('active');}}
      S.page=1;render();updateAccCnt();
    }});
    el.appendChild(c);
  }});
}}
buildIngs();

// アコーディオンのバッジ更新
function updateAccCnt(){{
  const catCnt=S.cat!=='all'?1:0;
  const symCnt=S.syms.size;
  const ingCnt=S.ings.size;
  ['cat','sym','ing'].forEach((k,i)=>{{
    const cnt=[catCnt,symCnt,ingCnt][i];
    const el=document.getElementById(`acc-${{k}}-cnt`);
    if(el){{el.textContent=cnt;el.classList.toggle('show',cnt>0);}}
  }});
}}

// ── フィルタ・ソート ────────────────────────────────
function filter(){{
  let r=[...MEDS];
  if(S.cat!=='all')r=r.filter(m=>m.cat===S.cat);
  if(S.q){{
    const q=S.q.toLowerCase();
    r=r.filter(m=>
      (m.name||'').toLowerCase().includes(q)||
      (m.maker||'').toLowerCase().includes(q)||
      (m.effect||'').toLowerCase().includes(q)||
      (m.ings||[]).some(i=>i.toLowerCase().includes(q)));
  }}
  if(S.syms.size>0)r=r.filter(m=>m.symptoms&&[...S.syms].some(s=>m.symptoms.includes(s)));
  if(S.ings.size>0)r=r.filter(m=>[...S.ings].some(si=>
    (m.ings||[]).some(mi=>mi.replace(/[\(（][^)）]*[\)）]/g,'').trim().includes(si))));
  if(S.risk!==''){{
    const rv=parseFloat(S.risk);
    r=rv===2?r.filter(m=>m.risk>=2&&m.risk<3):r.filter(m=>m.risk===rv);
  }}
  if(S.nd)r=r.filter(m=>!m.drowsy);
  if(S.nw)r=r.filter(m=>!(m.warnIngs&&m.warnIngs.length));
  if(S.sort==='price_asc')r.sort((a,b)=>(a.price||999999)-(b.price||999999));
  else if(S.sort==='price_desc')r.sort((a,b)=>(b.price||0)-(a.price||0));
  else if(S.sort==='name')r.sort((a,b)=>a.name.localeCompare(b.name,'ja'));
  else if(S.sort==='risk')r.sort((a,b)=>(a.risk||9)-(b.risk||9));
  return r;
}}

// ── 類似商品スコア ───────────────────────────────────
function getSimilar(med,n=3){{
  const baseIngs=new Set((med.ings||[]).map(i=>i.replace(/[\(（][^)）]*[\)）]/g,'').trim()));
  return MEDS.filter(m=>m.id!==med.id&&m.cat===med.cat)
    .map(m=>{{
      const mIngs=new Set((m.ings||[]).map(i=>i.replace(/[\(（][^)）]*[\)）]/g,'').trim()));
      const inter=[...baseIngs].filter(i=>mIngs.has(i)).length;
      const union=new Set([...baseIngs,...mIngs]).size;
      return {{m,score:union?inter/union:0}};
    }})
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score)
    .slice(0,n);
}}

// ── カード描画 ──────────────────────────────────────
function card(med){{
  const cat=CATS.find(c=>c.id===med.cat)||{{}};
  const wSet=new Set((med.warnIngs||[]).map(w=>w.replace(/[\(（][^)）]*[\)）]/g,'').trim()));
  const ingsH=(med.ings||[]).map(ing=>{{
    const base=ing.replace(/[\(（][^)）]*[\)）]/g,'').trim();
    const isM=[...S.ings].some(si=>base.includes(si));
    const isW=wSet.has(base)||(med.warnIngs||[]).some(w=>ing.includes(w.replace(/[\(（][^)）]*[\)）]/g,'').trim()));
    const hasDef=!!ING_DICT[base];
    return `<span class="itag ${{isW?'iw':isM?'im':'in'}}" 
      ${{hasDef?`onmouseenter="showIngPopup(event,'${{base.replace(/'/g,"\\'")}}')"`:''}}`+
      ` onmouseleave="hideIngPopup()">${{ing}}</span>`;
  }}).join('');
  const symH=(med.symptoms&&med.symptoms.length)?
    `<div class="csymp">${{med.symptoms.map(s=>`<span class="sym${{S.syms.has(s)?' hit':''}}">
${{s}}</span>`).join('')}}</div>`:'';
  const nc=med.noteType==='danger'?'nd':med.noteType==='warn'?'nw':'nn';
  const pr=med.price?`<div class="cpval">¥${{med.price.toLocaleString()}}</div><div class="cpnote">参考価格（税込）</div>`:
    `<div class="cpval nopr">価格要確認</div>`;
  const isSelected=CMP_SET.has(med.id);
  return `<div class="card" id="card-${{med.id}}">
    <div class="card-sel">
      <input type="checkbox" ${{isSelected?'checked':''}} title="比較に追加"
        onchange="toggleCmp(${{med.id}},this.checked)">
    </div>
    <div class="chard">
      <div><div class="cname">${{med.name}}</div><div class="cmaker">${{med.maker||''}}</div></div>
      <div class="cprice">${{pr}}</div>
    </div>
    <div class="badges">
      <span class="badge bc">${{cat.i||''}} ${{cat.l||med.cat||''}}</span>
      <span class="badge ${{RCLS[med.risk]||'r25'}}">${{RLABEL[med.risk]||''}}</span>
      ${{med.drowsy?'<span class="badge bd2">🌙 眠気注意</span>':''}}
      ${{(med.warnIngs&&med.warnIngs.length)?'<span class="badge bw">⚠️ 要注意成分</span>':''}}
    </div>
    ${{symH}}
    <div class="cef">${{med.effect||''}}</div>
    <div class="ings">${{ingsH}}</div>
    ${{med.note?`<div class="note ${{nc}}">${{med.note}}</div>`:''}}
    <div class="cfoot">
      <span class="cfootl">成分数: ${{(med.ings||[]).length}}</span>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="sim-btn" onclick="showSimilar(${{med.id}})">類似商品</button>
        <a href="https://www.pmda.go.jp/PmdaSearch/otcSearch" target="_blank" rel="noopener">📄 PMDA ↗</a>
      </div>
    </div>
    <div id="sim-${{med.id}}" style="display:none"></div>
  </div>`;
}}

// ── 類似商品パネル ──────────────────────────────────
function showSimilar(id){{
  const med=MEDS.find(m=>m.id===id);
  if(!med)return;
  const el=document.getElementById('sim-'+id);
  if(el.style.display==='block'){{el.style.display='none';return;}}
  const sims=getSimilar(med);
  if(!sims.length){{el.innerHTML='<div style="font-size:12px;color:var(--txl);padding:8px">類似商品が見つかりません</div>';el.style.display='block';return;}}
  el.innerHTML=`<div class="sim-panel"><h3>🔍 類似商品</h3><div class="sim-cards">${{
    sims.map(x=>`<div class="sim-card">
      <div class="sim-card-info">
        <div class="sim-card-name">${{x.m.name}}</div>
        <div class="sim-card-score">成分一致度 ${{Math.round(x.score*100)}}% | ${{x.m.maker||''}}</div>
      </div>
      <button class="sim-card-btn" onclick="jumpToCard(${{x.m.id}})">詳細を見る</button>
    </div>`).join('')
  }}</div></div>`;
  el.style.display='block';
}}

function jumpToCard(id){{
  const el=document.getElementById('card-'+id);
  if(el){{el.scrollIntoView({{behavior:'smooth',block:'center'}});el.style.outline='2px solid var(--teal)';setTimeout(()=>el.style.outline='',1500);}}
}}

// ── 成分ポップアップ ────────────────────────────────
const popup=document.getElementById('ing-popup');
function showIngPopup(e,name){{
  const d=ING_DICT[name];if(!d)return;
  document.getElementById('ip-name').textContent=name;
  document.getElementById('ip-en').textContent=d.en||'';
  document.getElementById('ip-effect').textContent=d.effect||'';
  document.getElementById('ip-caution').textContent=d.caution?'⚠️ '+d.caution:'';
  const{{clientX:x,clientY:y}}=e;
  const pw=320,ph=160;
  popup.style.left=(x+pw>window.innerWidth?x-pw-8:x+12)+'px';
  popup.style.top=(y+ph>window.innerHeight?y-ph-8:y+12)+'px';
  popup.classList.add('show');
}}
function hideIngPopup(){{popup.classList.remove('show');}}

// ── 比較機能 ────────────────────────────────────────
function toggleCmp(id,checked){{
  if(checked){{
    if(CMP_SET.size>=4){{alert('最大4件まで比較できます');
      const cb=document.querySelector(`#card-${{id}} input[type=checkbox]`);
      if(cb)cb.checked=false;return;}}
    CMP_SET.add(id);
  }}else CMP_SET.delete(id);
  const cnt=CMP_SET.size;
  document.getElementById('cmp-count').textContent=cnt;
  document.getElementById('cmp-open-btn').disabled=cnt<2;
}}

function openCompare(){{
  const meds=[...CMP_SET].map(id=>MEDS.find(m=>m.id===id)).filter(Boolean);
  if(meds.length<2)return;

  // 全成分の収集
  const allIngsSet=new Set();
  meds.forEach(m=>(m.ings||[]).forEach(ing=>allIngsSet.add(ing.replace(/[\(（][^)）]*[\)）]/g,'').trim())));
  const allIngs=[...allIngsSet].filter(Boolean);

  const hd=meds.map(m=>`<th class="${{RCLS[m.risk]||'r25'}}">
    <div class="cmp-name">${{m.name}}</div>
    <div style="font-size:10px;color:var(--txm)">${{m.maker||''}}</div>
    <div style="font-size:10px;margin-top:2px">${{RLABEL[m.risk]||''}}</div>
  </th>`).join('');

  const prRow=`<tr><th>価格</th>${{meds.map(m=>`<td>${{m.price?'¥'+m.price.toLocaleString():'不明'}}</td>`).join('')}}</tr>`;
  const drRow=`<tr><th>眠気</th>${{meds.map(m=>`<td>${{m.drowsy?'🌙 あり':'✅ なし'}}</td>`).join('')}}</tr>`;
  const wnRow=`<tr><th>要注意成分</th>${{meds.map(m=>`<td>${{(m.warnIngs&&m.warnIngs.length)?'⚠️ あり':'✅ なし'}}</td>`).join('')}}</tr>`;

  const ingRows=allIngs.map(ing=>{{
    const cells=meds.map(m=>{{
      const has=(m.ings||[]).some(i=>i.replace(/[\(（][^)）]*[\)）]/g,'').trim()===ing);
      return `<td style="text-align:center">${{has?'<span class="ck">✓</span>':'<span class="cx">-</span>'}}</td>`;
    }}).join('');
    const def=ING_DICT[ing];
    return `<tr><th title="${{def?def.effect:''}}">${{ing}}${{def?'<span style="font-size:9px;color:var(--teal);margin-left:4px">ⓘ</span>':''}}</th>${{cells}}</tr>`;
  }}).join('');

  document.getElementById('cmp-body').innerHTML=`
    <table class="cmp-table">
      <thead><tr><th>成分 / 商品</th>${{hd}}</tr></thead>
      <tbody>
        ${{prRow}}${{drRow}}${{wnRow}}
        <tr><th colspan="${{meds.length+1}}" style="background:#f1f5f9;font-size:11px;color:var(--txl)">── 有効成分 ──</th></tr>
        ${{ingRows}}
      </tbody>
    </table>
    <p style="font-size:11px;color:var(--txl);margin-top:8px">成分名にカーソルを合わせると効果説明が表示されます（辞典登録成分のみ）</p>`;

  document.getElementById('cmp-modal').classList.remove('hidden');
}}

function closeCompare(){{document.getElementById('cmp-modal').classList.add('hidden');}}

// ── アクティブフィルタチップ ────────────────────────
function afChips(){{
  const el=document.getElementById('af');el.innerHTML='';
  const add=(label,fn)=>{{
    const s=document.createElement('span');s.className='afc';
    s.innerHTML=`${{label}} <button>×</button>`;
    s.querySelector('button').addEventListener('click',fn);el.appendChild(s);
  }};
  if(S.cat!=='all'){{const c=CATS.find(x=>x.id===S.cat);if(c)add(c.l,()=>{{S.cat='all';
    document.querySelectorAll('.cbtn').forEach(b=>b.classList.remove('active'));
    document.querySelector('[data-cat="all"]').classList.add('active');S.page=1;render();updateAccCnt();}});}}
  if(S.q)add(`"${{S.q}}"`,()=>{{S.q='';document.getElementById('q').value='';S.page=1;render();}});
  S.syms.forEach(s=>add(`🤕 ${{s}}`,()=>{{S.syms.delete(s);buildSymp();S.page=1;render();updateAccCnt();}}));
  S.ings.forEach(i=>add(i,()=>{{S.ings.delete(i);buildIngs();S.page=1;render();updateAccCnt();}}));
  if(S.risk)add(RLABEL[parseFloat(S.risk)]||S.risk,()=>{{S.risk='';document.getElementById('frisk').value='';S.page=1;render();}});
  if(S.nd)add('眠気なし',()=>{{S.nd=false;document.getElementById('cnd').checked=false;S.page=1;render();}});
  if(S.nw)add('要注意成分なし',()=>{{S.nw=false;document.getElementById('cnw').checked=false;S.page=1;render();}});
}}

// ── ページネーション ────────────────────────────────
function pagi(total){{
  const pages=Math.ceil(total/S.pp);
  const el=document.getElementById('pagi');el.innerHTML='';
  if(pages<=1)return;
  const mk=(lb,pg,dis,act)=>{{
    const b=document.createElement('button');b.className='pgb'+(act?' active':'');
    b.textContent=lb;if(dis)b.disabled=true;
    else b.addEventListener('click',()=>{{S.page=pg;render();scrollTo({{top:0,behavior:'smooth'}});}});
    return b;
  }};
  el.appendChild(mk('‹',S.page-1,S.page===1,false));
  let prev=0;
  for(let i=1;i<=pages;i++){{
    if(i===1||i===pages||(i>=S.page-2&&i<=S.page+2)){{
      if(prev&&i-prev>1){{const d=document.createElement('span');d.className='pagi-info';d.textContent='…';el.appendChild(d);}}
      el.appendChild(mk(i,i,false,i===S.page));prev=i;
    }}
  }}
  el.appendChild(mk('›',S.page+1,S.page===pages,false));
}}

// ── メインレンダリング ───────────────────────────────
function render(){{
  const filtered=filter();const total=filtered.length;
  const start=(S.page-1)*S.pp;const paged=filtered.slice(start,start+S.pp);
  document.getElementById('ri').innerHTML=`<strong>${{total.toLocaleString()}}件</strong>表示中（全${{MEDS.length.toLocaleString()}}件）`;
  afChips();
  document.getElementById('grid').innerHTML=paged.length===0?
    `<div class="nores"><div class="nores-ico">🔍</div><p>条件に合う医薬品が見つかりません</p></div>`:
    paged.map(card).join('');
  pagi(total);
}}

// ── イベント ────────────────────────────────────────
let t;
document.getElementById('q').addEventListener('input',e=>{{
  clearTimeout(t);t=setTimeout(()=>{{S.q=e.target.value.trim();S.page=1;render();}},200);
}});
document.getElementById('frisk').addEventListener('change',e=>{{S.risk=e.target.value;S.page=1;render();}});
document.getElementById('fsort').addEventListener('change',e=>{{S.sort=e.target.value;S.page=1;render();}});
document.getElementById('cnd').addEventListener('change',e=>{{S.nd=e.target.checked;S.page=1;render();}});
document.getElementById('cnw').addEventListener('change',e=>{{S.nw=e.target.checked;S.page=1;render();}});
document.getElementById('rbtn').addEventListener('click',()=>{{
  S.cat='all';S.q='';S.ings.clear();S.syms.clear();S.risk='';
  S.sort='default';S.nd=false;S.nw=false;S.page=1;
  document.getElementById('q').value='';
  document.getElementById('frisk').value='';
  document.getElementById('fsort').value='default';
  document.getElementById('cnd').checked=false;
  document.getElementById('cnw').checked=false;
  document.querySelectorAll('.cbtn').forEach(b=>b.classList.remove('active'));
  document.querySelector('[data-cat="all"]').classList.add('active');
  buildIngs();buildSymp();updateAccCnt();render();
}});
document.getElementById('cmp-modal').addEventListener('click',e=>{{
  if(e.target===document.getElementById('cmp-modal'))closeCompare();
}});

// ── 症状ガイドページ ────────────────────────────────
function renderGuide(){{
  const el=document.getElementById('guide-grid');
  if(el.innerHTML)return;
  el.innerHTML=SYMP_GROUPS.map(g=>
    `<div class="guide-card" onclick="guideFilter('${{g.g}}')">
      <div class="g-ico">${{g.i}}</div>
      <div class="g-name">${{g.g}}</div>
      <div class="g-sub">${{g.s.slice(0,3).join(' / ')}}…</div>
    </div>`
  ).join('');
}}

function guideFilter(groupName){{
  const grp=SYMP_GROUPS.find(g=>g.g===groupName);
  if(!grp)return;
  const res=document.getElementById('guide-result');
  const meds=MEDS.filter(m=>m.symptoms&&grp.s.some(s=>m.symptoms.includes(s)));
  res.innerHTML=`
    <div style="margin-top:16px">
      <div class="page-title" style="font-size:15px">${{grp.i}} ${{groupName}}（${{meds.length}}件）</div>
      <div class="grid" style="margin-top:10px">${{meds.slice(0,20).map(m=>{{
        const cat=CATS.find(c=>c.id===m.cat)||{{}};
        return `<div class="card">
          <div class="chard"><div><div class="cname">${{m.name}}</div><div class="cmaker">${{m.maker||''}}</div></div>
          <div class="cprice">${{m.price?'<div class="cpval">¥'+m.price.toLocaleString()+'</div>':'<div class="cpval nopr">価格要確認</div>'}}</div></div>
          <div class="badges"><span class="badge bc">${{cat.i||''}} ${{cat.l||m.cat}}</span>
          <span class="badge ${{RCLS[m.risk]||'r25'}}">${{RLABEL[m.risk]||''}}</span></div>
          <div class="cef">${{m.effect||''}}</div>
          <div class="ings">${{(m.ings||[]).slice(0,5).map(i=>`<span class="itag in">${{i}}</span>`).join('')}}</div>
        </div>`;
      }}).join('')}}</div>
      ${{meds.length>20?`<p style="font-size:12px;color:var(--txl);margin-top:8px">他${{meds.length-20}}件は検索ページで「症状」で絞り込んでください。</p>`:''}}
    </div>`;
}}

// ── コラムページ ────────────────────────────────────
function renderColumns(){{
  const el=document.getElementById('col-grid');
  if(el.innerHTML)return;
  el.innerHTML=COLUMNS.map(col=>
    `<div class="col-card" onclick="showColumn('${{col.id}}')">
      <div class="col-card-top">
        <div class="col-card-tag">${{col.tag}}</div>
        <div class="col-card-title">${{col.title}}</div>
      </div>
      <div class="col-card-body">
        <div class="col-card-date">${{col.date}}</div>
        <div class="col-card-summary">${{col.summary}}</div>
      </div>
    </div>`
  ).join('');
}}

function showColumn(id){{
  const col=COLUMNS.find(c=>c.id===id);
  if(!col)return;
  document.getElementById('col-list-view').style.display='none';
  const dv=document.getElementById('col-detail-view');
  dv.style.display='block';
  // マークダウン的な変換
  const body=col.body
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/^- (.+)$/gm,'<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s,'<ul>$1</ul>')
    .split('\n\n').map(p=>p.startsWith('<')?p:`<p>${{p}}</p>`).join('');
  dv.innerHTML=`<div class="col-detail">
    <div class="col-back" onclick="backToColumns()">← コラム一覧に戻る</div>
    <h1>${{col.title}}</h1>
    <div class="col-meta">${{col.date}} | ${{col.tag}}</div>
    <div class="col-body">${{body}}</div>
  </div>`;
}}

function backToColumns(){{
  document.getElementById('col-list-view').style.display='block';
  document.getElementById('col-detail-view').style.display='none';
}}

// ── 初期化 ──────────────────────────────────────────
render();
</script>
</body>
</html>'''
    return (tpl
        .replace('__MEDS_JS__', meds_js)
        .replace('__ING_DICT_JS__', ing_dict_js)
        .replace('__COLUMNS_JS__', columns_js)
        .replace('__UPDATED_STR__', updated_str)
        .replace('__COUNT__', str(count))
    )

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--output", default=str(OUT_HTML))
    a = p.parse_args()
    run(output=a.output)
