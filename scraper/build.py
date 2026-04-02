#!/usr/bin/env python3
"""build.py — medicines.json → index.html"""
import json, argparse
from pathlib import Path
from datetime import datetime

DATA_DIR = Path(__file__).parent
SRC_JSON = DATA_DIR / "medicines.json"
OUT_HTML = DATA_DIR.parent / "index.html"

ING_DICT = {
    "アセトアミノフェン": "解熱・鎮痛。胃への刺激が少なく空腹時でも服用可能。過量服用で肝障害リスク。",
    "イブプロフェン": "消炎・鎮痛・解熱。NSAIDs。空腹時は胃腸障害に注意。喘息・妊娠後期禁忌。",
    "ロキソプロフェンナトリウム": "プロドラッグ型NSAIDs。強力な消炎鎮痛。第1類（薬剤師要相談）。",
    "クロルフェニラミンマレイン酸塩": "第一世代抗ヒスタミン薬。鼻水・くしゃみ改善。眠気強め・運転不可。",
    "ジフェンヒドラミン塩酸塩": "第一世代抗ヒスタミン薬。強い鎮静作用。運転不可。耐性が出やすい。",
    "フェキソフェナジン塩酸塩": "第二世代抗ヒスタミン薬。眠気が出にくい。花粉症・アレルギー性鼻炎に。",
    "ロラタジン": "第二世代抗ヒスタミン薬。1日1回。眠気少。アレルギー性鼻炎・蕁麻疹に。",
    "ジヒドロコデインリン酸塩": "中枢性鎮咳薬。強力な咳止め。依存性あり・12歳未満禁忌・眠気必発。",
    "アリルイソプロピルアセチル尿素": "鎮静補助成分。2023年AU全面規制・2025年KR麻薬類指定。依存性あり・眠気必発。",
    "ブロムワレリル尿素": "鎮静補助成分。海外規制済。依存性あり・眠気必発・連用禁忌。",
    "ファモチジン": "H2ブロッカー。胃酸分泌抑制。胸やけ・胃痛に効果。第1類（薬剤師要相談）。",
    "ミノキシジル": "血管拡張で頭皮血流改善。発毛・育毛促進。要指導（薬剤師要相談）。4ヶ月以上継続必要。",
    "トラネキサム酸": "抗プラスミン薬。肝斑・シミの改善に特異的効果。炎症・アレルギー反応を抑制。",
    "フルスルチアミン": "脂溶性ビタミンB1誘導体。神経機能維持・エネルギー代謝促進。通常B1より吸収良好。",
    "シアノコバラミン": "ビタミンB12。神経細胞修復・DNA合成に必須。末梢神経障害・しびれに有効。",
    "コンドロイチン硫酸エステルナトリウム": "軟骨の主成分。関節軟骨保護・再生補助。膝・腰の関節痛緩和。",
    "ニコチン": "ニコチン代替療法。禁煙補助。第1類（薬剤師要相談）。喫煙との併用禁忌。",
    "ポビドンヨード": "ヨウ素系殺菌消毒。細菌・ウイルス・真菌に広範な効果。甲状腺疾患・妊婦注意。",
    "テルビナフィン塩酸塩": "アリルアミン系抗真菌薬。白癬菌の細胞膜合成阻害。水虫・たむしに有効。",
    "グアイフェネシン": "去痰薬。気道分泌液を増やし痰を柔らかく排出促進。水分補給で効果UP。",
    "ビサコジル": "大腸刺激型下剤。就寝前服用で翌朝効果。連用で依存性・妊婦注意。",
    "センノシド": "刺激性下剤。大腸を刺激し排便促進。連用禁忌。腹痛を伴う便秘には禁忌。",
}

COLUMNS = [
    {"id":"c1","title":"第1類・第2類・第3類の違いとは？OTC医薬品のリスク区分を解説","date":"2026-03-01","tag":"基礎知識",
     "summary":"薬局で見かける「第1類」「第2類」などの表示。これはリスクの高さを示す分類です。",
     "body":"OTC医薬品は副作用リスクに応じて4段階に分類されています。\n\n要指導医薬品はダイレクトOTCやスイッチ直後の成分が含まれ、薬剤師による対面販売が義務付けられネット購入は不可です。ミノキシジル5%（リアップX5等）が代表例です。\n\n第1類医薬品は副作用・相互作用のリスクが高い成分を含みます。薬剤師からの情報提供が義務付けられています。ファモチジン（ガスター10）・ロキソプロフェン（ロキソニンS）等が該当します。\n\n第2類医薬品は比較的リスクの高い成分を含む薬で、登録販売者でも販売可能。市販薬の大半がこのカテゴリです。\n\n第3類医薬品はビタミン剤・整腸薬など副作用リスクが比較的低い薬で、コンビニでも販売可能なものも含まれます。"},
    {"id":"c2","title":"「ア尿素」が含まれる市販薬に注意。海外で規制が進む依存性成分","date":"2026-03-10","tag":"安全情報",
     "summary":"イブA錠などに含まれる「アリルイソプロピルアセチル尿素（ア尿素）」。2023年にオーストラリアで全面規制、2025年には韓国で麻薬類に指定されました。",
     "body":"アリルイソプロピルアセチル尿素（ア尿素）は解熱鎮痛薬に「鎮静補助成分」として配合されている成分です。\n\n規制の動向として、2023年にオーストラリアで販売全面禁止、2025年に韓国で麻薬類に指定されました。日本では現時点では規制なく販売継続中です。\n\n含有する主な市販薬はイブA錠、イブクイック頭痛薬DX等です。服用後に必ず眠気が出るため運転・機械操作禁忌です。長期・頻回使用で耐性・依存が形成されます。\n\n代替選択肢としてはアセトアミノフェン単体（タイレノールA等）やア尿素なしのイブプロフェン製品を選ぶことをお勧めします。"},
    {"id":"c3","title":"花粉症の市販薬、眠くなる・ならないの違いは？成分で選ぶ方法","date":"2026-03-15","tag":"花粉症",
     "summary":"眠くなる花粉症薬と眠くならない花粉症薬の違いは抗ヒスタミン薬の世代にあります。",
     "body":"花粉症薬の眠気の出やすさは抗ヒスタミン薬の世代によって大きく異なります。\n\n第一世代（眠気が強い）はクロルフェニラミン、ジフェンヒドラミン等です。血液脳関門を通過しやすく強い眠気が出ます。就寝前の使用や乗り物酔い防止にも使われます。\n\n第二世代（眠気が少ない）はフェキソフェナジン（アレグラFX）、ロラタジン（クラリチンEX）等です。末梢のアレルギー反応を選択的に抑えるため眠気が出にくいです。\n\n仕事中や運転がある場合は第二世代を選びましょう。花粉飛散シーズン前から予防的に服用を開始すると症状が大幅に軽減されます。"},
    {"id":"c4","title":"コデイン系咳止め薬の12歳未満禁忌。理由と代替品の選び方","date":"2026-03-20","tag":"安全情報",
     "summary":"2019年以降、コデイン・ジヒドロコデイン含有薬の12歳未満への使用が禁忌となりました。",
     "body":"コデインは体内でモルヒネに変換されます。子どもでは代謝の個人差が大きく、呼吸抑制という重篤な副作用が報告されたため2019年に12歳未満への使用が禁忌となりました。\n\nコデイン系が含まれる主な市販薬はブロン錠エース、パブロンゴールドA、新コンタック咳止めダブル持続性等です。\n\n子どもの咳に使える代替品としてはカルボシステイン（去痰薬）があります。痰を柔らかくして排出を促進し副作用が少なく安全です。また龍角散（生薬系）はのどや咳に穏やかに作用します。\n\n大人でもコデイン系は依存性があるため必要最小限の期間・量での使用が推奨されます。"},
]

SYMP_GROUPS = [
    {"g":"痛み・熱","i":"🔥","s":["頭痛","偏頭痛","歯痛","のど痛","月経痛","腰痛","関節痛","筋肉痛","神経痛","打撲・ねんざ","発熱"]},
    {"g":"鼻・目・のど","i":"👃","s":["鼻水","くしゃみ","鼻づまり","目のかゆみ","充血","目の疲れ","乾き目","花粉症","のどの炎症","のど痛"]},
    {"g":"咳・痰","i":"😮‍💨","s":["せき","たん","声がれ","口腔殺菌"]},
    {"g":"胃腸・お腹","i":"🫃","s":["胃痛","胸やけ","胃もたれ","食べ過ぎ","飲み過ぎ","吐き気","下痢","便秘","腹部膨満","整腸"]},
    {"g":"皮膚・かゆみ","i":"🧴","s":["湿疹・かぶれ","かゆみ","虫刺され","乾燥肌","にきび","口内炎","水虫","肌荒れ"]},
    {"g":"疲労・神経","i":"💪","s":["肉体疲労","眼精疲労","手足のしびれ","冷え","めまい・立ちくらみ","動悸"]},
    {"g":"美容","i":"✨","s":["シミ・そばかす","肝斑","肌荒れ","薄毛・脱毛"]},
    {"g":"女性・メンタル","i":"🌙","s":["更年期障害","月経不順","不眠","乗物酔い"]},
    {"g":"その他","i":"💊","s":["禁煙","痔","排卵確認","妊娠確認","消毒"]},
]

CATS = [
    {"id":"all","l":"すべて","i":"💊"},
    {"id":"cold","l":"かぜ薬・解熱鎮痛","i":"🤒"},
    {"id":"stomach","l":"消化器官用薬","i":"🫃"},
    {"id":"allergy","l":"アレルギー用薬","i":"🌸"},
    {"id":"cough","l":"鎮咳・去痰・含嗽薬","i":"😮‍💨"},
    {"id":"nose","l":"鼻炎用薬","i":"👃"},
    {"id":"ext_pain","l":"外皮用薬（鎮痛）","i":"🩹"},
    {"id":"ext_skin","l":"外皮用薬（皮膚）","i":"🧴"},
    {"id":"eye","l":"眼科用薬","i":"👁"},
    {"id":"joint","l":"関節・筋肉（内服）","i":"🦴"},
    {"id":"skin_oral","l":"皮膚科・シミ（内服）","i":"✨"},
    {"id":"hair","l":"育毛・発毛薬","i":"💈"},
    {"id":"women","l":"女性用薬","i":"🌙"},
    {"id":"sleep","l":"催眠鎮静薬","i":"😴"},
    {"id":"vitamin","l":"ビタミン・滋養強壮","i":"💪"},
    {"id":"kampo","l":"漢方製剤","i":"🌿"},
    {"id":"foot","l":"水虫・皮膚感染","i":"🦶"},
    {"id":"oral","l":"歯科口腔用薬","i":"🦷"},
    {"id":"anal","l":"痔疾用薬","i":"🔴"},
    {"id":"circu","l":"循環器・血液用薬","i":"❤️"},
    {"id":"smoking","l":"禁煙補助剤","i":"🚭"},
    {"id":"motion","l":"乗物酔い","i":"🚢"},
    {"id":"test","l":"一般用検査薬","i":"🔬"},
    {"id":"disinfect","l":"消毒薬","i":"🧪"},
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

    meds_js  = json.dumps(meds,        ensure_ascii=False).replace("</script>", "<\\/script>")
    ing_js   = json.dumps(ING_DICT,    ensure_ascii=False).replace("</script>", "<\\/script>")
    col_js   = json.dumps(COLUMNS,     ensure_ascii=False).replace("</script>", "<\\/script>")
    sym_js   = json.dumps(SYMP_GROUPS, ensure_ascii=False).replace("</script>", "<\\/script>")
    cats_js  = json.dumps(CATS,        ensure_ascii=False).replace("</script>", "<\\/script>")

    print(f"[build] {len(meds)}件 → {out}")
    html = generate(meds_js, ing_js, col_js, sym_js, cats_js, updated_str, len(meds))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"[build] 完了 {out.stat().st_size:,} bytes")

def generate(meds_js, ing_js, col_js, sym_js, cats_js, updated_str, count):
    return """<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>くすり成分ガイド｜OTC医薬品データベース</title>
<meta name="description" content="市販薬を成分から比較。リスク区分・眠気の有無・要注意成分を確認。""" + str(count) + """品目収録。">
<style>
:root{--navy:#0f1c35;--teal:#2fa18d;--teal2:#1a7f6e;--tl:#e8f5f2;--amber:#fffbeb;--amberb:#f59e0b;--red:#b91c1c;--rb:#fef2f2;--sl:#f1f5f9;--bd:#e2e8f0;--bdm:#cbd5e1;--tx:#0f172a;--txm:#475569;--txl:#94a3b8;--wh:#fff;}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'Hiragino Kaku Gothic ProN',sans-serif;background:var(--sl);color:var(--tx);font-size:14px;line-height:1.7}
a{color:inherit;text-decoration:none}
/* NAV */
.nav{background:var(--navy);border-bottom:3px solid var(--teal);position:sticky;top:0;z-index:100}
.nav-inner{max-width:1240px;margin:0 auto;padding:0 12px;display:flex;align-items:center;height:52px;gap:4px;overflow:hidden}
.logo{font-size:15px;font-weight:700;color:#fff;white-space:nowrap;margin-right:4px;flex-shrink:0}
.logo em{color:var(--teal);font-style:normal}
.ntab{padding:5px 10px;border-radius:6px;font-size:12px;font-weight:500;color:#94a3b8;background:transparent;border:none;cursor:pointer;white-space:nowrap;flex-shrink:0}
.ntab:hover{color:#fff;background:rgba(255,255,255,.1)}
.ntab.on{color:#fff;background:var(--teal2)}
.nright{font-size:10px;color:#475569;margin-left:auto;white-space:nowrap;flex-shrink:0}
@media(max-width:480px){.nright{display:none}.logo{font-size:13px}.ntab{padding:5px 8px;font-size:11px}}
/* PAGES */
.pg{display:none;max-width:1240px;margin:0 auto;padding:16px 20px 60px}
.pg.on{display:block}
.layout{display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:start}
/* SIDEBAR */
.sb{position:sticky;top:68px;display:flex;flex-direction:column;gap:8px;max-height:calc(100vh - 80px);overflow-y:auto}
.sb::-webkit-scrollbar{width:3px}
.sb::-webkit-scrollbar-thumb{background:var(--bdm);border-radius:2px}
/* SEARCH BOX */
.sbox{background:var(--wh);border:1px solid var(--bd);border-radius:10px;padding:10px}
.sbox input{width:100%;padding:8px 8px 8px 30px;border:1.5px solid var(--bd);border-radius:7px;font-size:13px;outline:none;font-family:inherit}
.sbox input:focus{border-color:var(--teal)}
.sico{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--txl)}
.srel{position:relative}
/* ACCORDION */
.acc{background:var(--wh);border:1px solid var(--bd);border-radius:10px;overflow:hidden}
.acc-hd{display:flex;align-items:center;gap:6px;padding:10px 14px;font-size:13px;font-weight:600;color:var(--txm);background:none;border:none;width:100%;text-align:left;cursor:pointer}
.acc-hd:hover{background:var(--sl)}
.acc-arr{margin-left:auto;font-size:11px;color:var(--txl);transition:transform .2s}
.acc-hd.open .acc-arr{transform:rotate(180deg)}
.acc-cnt{font-size:10px;padding:1px 6px;background:var(--teal);color:#fff;border-radius:10px;display:none}
.acc-cnt.on{display:inline}
.acc-bd{display:none;padding:8px 10px 12px}
.acc-bd.open{display:block}
/* CATEGORY */
.catlist{display:flex;flex-direction:column;gap:1px}
.cbtn{display:flex;align-items:center;gap:7px;width:100%;padding:5px 8px;border-radius:6px;border:none;background:transparent;font-size:12.5px;color:var(--txm);cursor:pointer;text-align:left}
.cbtn:hover{background:var(--tl);color:var(--teal2)}
.cbtn.on{background:var(--tl);color:var(--teal2);font-weight:600}
.cbtn .ci{font-size:13px;width:18px;text-align:center}
.cbtn .ck{margin-left:auto;font-size:10px;padding:1px 5px;background:var(--sl);border-radius:8px;color:var(--txl)}
.cbtn.on .ck{background:rgba(47,161,141,.15);color:var(--teal2)}
/* SYMPTOM */
.sg{margin-bottom:8px}
.sgh{display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:var(--txm);padding:3px 0;border-bottom:1px solid var(--bd);cursor:pointer;user-select:none;margin-bottom:4px}
.sgh .gar{margin-left:auto;font-size:10px;transition:transform .15s}
.sgh.col .gar{transform:rotate(-90deg)}
.stags{display:flex;flex-wrap:wrap;gap:3px}
.stags.hide{display:none}
.stag{font-size:11px;padding:2px 8px;border-radius:12px;border:1px solid var(--bd);cursor:pointer;color:var(--txm);background:var(--wh)}
.stag:hover{border-color:var(--amberb);background:var(--amber)}
.stag.on{background:var(--amberb);border-color:var(--amberb);color:#fff;font-weight:600}
/* INGREDIENT CHIPS */
.ichip{font-size:11px;padding:2px 7px;border-radius:12px;border:1px solid var(--bd);cursor:pointer;color:var(--txm);background:var(--wh);margin:2px;display:inline-block}
.ichip:hover{border-color:var(--teal);color:var(--teal)}
.ichip.on{background:var(--teal);border-color:var(--teal);color:#fff}
/* FILTERS */
.fsel{width:100%;padding:6px 8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;color:var(--tx);background:var(--wh);outline:none;font-family:inherit;margin-top:5px}
.chk{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--txm);cursor:pointer;padding:3px 0}
.chk input{accent-color:var(--teal)}
.rbtn{width:100%;padding:6px;border:1px dashed var(--bdm);border-radius:6px;background:transparent;font-size:12px;color:var(--txl);margin-top:8px;cursor:pointer}
.rbtn:hover{border-color:var(--red);color:var(--red);background:var(--rb)}
/* WARN BOX */
.wbox{background:var(--rb);border:1px solid #fecaca;border-radius:8px;padding:10px 12px;font-size:11px;color:#7f1d1d;line-height:1.8}
.wbox strong{color:var(--red);display:block;margin-bottom:2px}
/* MAIN */
.cmpbar{background:var(--wh);border:1px solid var(--bd);border-radius:8px;padding:8px 14px;margin-bottom:10px;display:flex;align-items:center;gap:10px}
.cmpbar span{font-size:13px;color:var(--txm)}
.cmpbtn{padding:5px 14px;background:var(--teal);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer}
.cmpbtn:disabled{background:var(--bdm);cursor:not-allowed}
.cmpcnt{font-size:11px;padding:1px 6px;background:var(--teal);color:#fff;border-radius:10px}
.resinfo{font-size:13px;color:var(--txm);margin-bottom:6px}
.resinfo strong{color:var(--tx);font-size:16px;font-weight:700}
.afchips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.afc{display:inline-flex;align-items:center;gap:3px;font-size:11px;padding:2px 8px;background:var(--tl);color:var(--teal2);border-radius:12px}
.afc button{background:none;border:none;font-size:13px;color:var(--teal2);cursor:pointer;padding:0}
/* CARDS */
.grid{display:flex;flex-direction:column;gap:8px}
.card{background:var(--wh);border:1px solid var(--bd);border-radius:10px;padding:13px 16px;position:relative}
.card:hover{box-shadow:0 4px 12px rgba(15,23,42,.1);border-color:#c5d5e5}
.csel{position:absolute;top:10px;right:12px}
.csel input{accent-color:var(--teal);width:16px;height:16px;cursor:pointer}
.chard{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:5px;padding-right:28px}
.cname{font-size:15px;font-weight:700}
.cmaker{font-size:11px;color:var(--txl)}
.cprice{text-align:right;flex-shrink:0}
.cpval{font-size:18px;font-weight:700}
.cpval.np{font-size:12px;color:var(--txl);font-weight:400}
.cpnote{font-size:10px;color:var(--txl)}
.badges{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px}
.badge{font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;white-space:nowrap}
.bc{background:#1c2b4a;color:#cbd5e1}
.r0,.r1{background:#fee2e2;color:#991b1b;border:1px solid #fecaca}
.r2{background:#fff7ed;color:#92400e;border:1px solid #fed7aa}
.r25{background:#fef3c7;color:#78350f;border:1px solid #fde68a}
.r3{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
.bd2{background:#f5f3ff;color:#5b21b6;border:1px solid #ddd6fe}
.bw2{background:#fef9c3;color:#713f12;border:1px solid #fde047}
.csymp{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px}
.sym{font-size:10px;padding:2px 7px;border-radius:12px;background:#fef3c7;color:#92400e;border:1px solid #fde68a}
.sym.hit{background:var(--amberb);color:#fff;border-color:var(--amberb);font-weight:600}
.cef{font-size:12px;color:var(--txm);margin-bottom:7px;line-height:1.6}
.ings{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:7px}
.itag{font-size:11px;padding:2px 7px;border-radius:4px;cursor:pointer;position:relative}
.in{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}
.im{background:var(--tl);color:var(--teal2);border:1px solid #99d4cd;font-weight:600}
.iw{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
.note{font-size:11.5px;padding:6px 10px;border-radius:6px;margin-bottom:7px;line-height:1.7}
.nn{background:var(--sl);color:var(--txm);border-left:3px solid var(--bdm)}
.nw{background:var(--amber);color:#713f12;border-left:3px solid var(--amberb)}
.nd{background:var(--rb);color:#7f1d1d;border-left:3px solid var(--red)}
.cfoot{display:flex;justify-content:space-between;align-items:center;padding-top:7px;border-top:1px solid var(--bd);font-size:11px}
.cfootl{color:var(--txl)}
.cfoot a{color:#2563eb}
.cfoot a:hover{text-decoration:underline}
.simbtn{font-size:11px;padding:2px 8px;border:1px solid var(--teal);border-radius:12px;color:var(--teal);background:transparent;cursor:pointer}
/* TOOLTIP */
.tip{position:fixed;z-index:300;background:var(--navy);color:#e2e8f0;border-radius:8px;padding:10px 14px;max-width:280px;font-size:12px;line-height:1.7;pointer-events:none;opacity:0;transition:opacity .15s;box-shadow:0 8px 24px rgba(0,0,0,.3)}
.tip.on{opacity:1}
.tip b{color:#fff;display:block;margin-bottom:3px}
/* PAGI */
.pagi{display:flex;justify-content:center;align-items:center;gap:4px;margin-top:16px;flex-wrap:wrap}
.pgb{min-width:32px;height:32px;padding:0 7px;border:1px solid var(--bd);border-radius:6px;background:var(--wh);font-size:13px;color:var(--txm);cursor:pointer}
.pgb:hover:not(:disabled){border-color:var(--teal);color:var(--teal)}
.pgb.on{background:var(--teal);border-color:var(--teal);color:#fff;font-weight:600}
.pgb:disabled{opacity:.35;cursor:not-allowed}
.nores{text-align:center;padding:50px 20px;color:var(--txl);font-size:15px}
/* MODAL */
.mbg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px}
.mbg.hide{display:none}
.mdl{background:var(--wh);border-radius:12px;max-width:900px;width:100%;max-height:85vh;display:flex;flex-direction:column}
.mhd{padding:16px 20px;border-bottom:1px solid var(--bd);display:flex;justify-content:space-between;align-items:center}
.mhd h2{font-size:16px;font-weight:700}
.mcls{width:32px;height:32px;border:none;background:var(--sl);border-radius:6px;font-size:18px;cursor:pointer}
.mbd{overflow:auto;padding:16px 20px}
.cmptbl{width:100%;border-collapse:collapse;font-size:12px}
.cmptbl th,.cmptbl td{padding:8px 10px;border:1px solid var(--bd);text-align:left;vertical-align:top}
.cmptbl th{background:var(--sl);font-weight:600;white-space:nowrap}
.cmptbl tr:nth-child(even){background:#f8fafc}
.ck2{color:#10b981;font-weight:700}
.cx2{color:#cbd5e1}
/* SIM PANEL */
.simpnl{background:var(--sl);border:1px solid var(--bd);border-radius:8px;padding:12px;margin-top:8px}
.simpnl h3{font-size:12px;font-weight:700;margin-bottom:8px;color:var(--txm)}
.simcard{background:var(--wh);border:1px solid var(--bd);border-radius:6px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px}
.simgo{font-size:11px;padding:3px 10px;background:var(--teal);color:#fff;border:none;border-radius:5px;cursor:pointer}
/* GUIDE PAGE */
.ggrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:20px}
.gcard{background:var(--wh);border:1px solid var(--bd);border-radius:10px;padding:16px;cursor:pointer;text-align:center}
.gcard:hover{border-color:var(--teal);box-shadow:0 4px 12px rgba(15,23,42,.1)}
.gico{font-size:26px;margin-bottom:6px}
.gname{font-size:13px;font-weight:600}
.gsub{font-size:11px;color:var(--txl);margin-top:2px}
/* COLUMN PAGE */
.cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.ccard{background:var(--wh);border:1px solid var(--bd);border-radius:10px;overflow:hidden;cursor:pointer}
.ccard:hover{box-shadow:0 4px 16px rgba(15,23,42,.12)}
.ctop{background:linear-gradient(135deg,var(--navy),#1e3a5f);padding:20px;color:#fff}
.ctag{font-size:10px;padding:2px 8px;background:var(--teal);border-radius:10px;display:inline-block;margin-bottom:8px}
.ctitle{font-size:14px;font-weight:700;line-height:1.5}
.cbdy{padding:14px}
.cdate{font-size:11px;color:var(--txl);margin-bottom:6px}
.csum{font-size:12px;color:var(--txm);line-height:1.7}
.cdetail{background:var(--wh);border-radius:10px;padding:24px;max-width:760px;margin:0 auto}
.cdetail h1{font-size:20px;font-weight:700;line-height:1.5;margin-bottom:8px}
.cmeta{font-size:12px;color:var(--txl);margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--bd)}
.cbody{font-size:14px;line-height:1.9}
.cbody p{margin-bottom:12px}
.cbody strong{font-weight:700}
.bkbtn{display:inline-flex;align-items:center;gap:4px;font-size:13px;color:var(--teal);background:none;border:none;cursor:pointer;margin-bottom:16px}
/* PAGE TITLE */
.ptitle{font-size:18px;font-weight:700;margin-bottom:12px;color:var(--navy)}
.pdesc{font-size:13px;color:var(--txm);margin-bottom:16px}
/* FOOTER */
footer{background:var(--navy);color:#475569;text-align:center;padding:20px;font-size:11px;margin-top:40px}
@media(max-width:800px){.layout{grid-template-columns:1fr}.sb{position:static}.ggrid{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>

<nav class="nav">
  <div class="nav-inner">
    <div class="logo">くすり成分<em>ガイド</em></div>
    <button type="button" class="ntab on" id="t-search" onclick="showPg('search')">🔍 検索</button>
    <button type="button" class="ntab" id="t-guide" onclick="showPg('guide')">💊 症状から選ぶ</button>
    <button type="button" class="ntab" id="t-column" onclick="showPg('column')">📖 コラム</button>
    <span class="nright">""" + updated_str + """</span>
  </div>
</nav>

<div class="pg on" id="pg-search">
  <div class="layout">
    <aside class="sb">
      <div class="sbox">
        <div class="srel">
          <span class="sico">🔍</span>
          <input type="text" id="qinp" placeholder="商品名・成分・症状・メーカー…" autocomplete="off">
        </div>
      </div>

      <div class="acc">
        <button type="button" class="acc-hd" id="hd-cat" onclick="togAcc('cat')">
          <span>💊</span> カテゴリ
          <span class="acc-cnt" id="cnt-cat"></span>
          <span class="acc-arr">▼</span>
        </button>
        <div class="acc-bd" id="bd-cat">
          <div class="catlist" id="catlist"></div>
        </div>
      </div>

      <div class="acc">
        <button type="button" class="acc-hd" id="hd-sym" onclick="togAcc('sym')">
          <span>🤕</span> 症状で絞り込む
          <span class="acc-cnt" id="cnt-sym"></span>
          <span class="acc-arr">▼</span>
        </button>
        <div class="acc-bd" id="bd-sym">
          <div id="symarea"></div>
        </div>
      </div>

      <div class="acc">
        <button type="button" class="acc-hd" id="hd-ing" onclick="togAcc('ing')">
          <span>⚗️</span> 成分で絞り込む
          <span class="acc-cnt" id="cnt-ing"></span>
          <span class="acc-arr">▼</span>
        </button>
        <div class="acc-bd" id="bd-ing">
          <div id="ingarea" style="max-height:200px;overflow-y:auto;display:flex;flex-wrap:wrap"></div>
        </div>
      </div>

      <div class="acc">
        <button type="button" class="acc-hd open" id="hd-fil" onclick="togAcc('fil')">
          <span>⚙️</span> 絞り込み・並び替え
          <span class="acc-arr">▼</span>
        </button>
        <div class="acc-bd open" id="bd-fil">
          <select class="fsel" id="frisk">
            <option value="">リスク区分：すべて</option>
            <option value="0">要指導医薬品</option>
            <option value="1">第1類</option>
            <option value="2">第2類（指定含む）</option>
            <option value="3">第3類</option>
          </select>
          <select class="fsel" id="fsort" style="margin-top:6px">
            <option value="def">並び替え：デフォルト</option>
            <option value="pa">価格：安い順</option>
            <option value="pd">価格：高い順</option>
            <option value="nm">名前：五十音順</option>
            <option value="rk">リスク区分順</option>
          </select>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
            <label class="chk"><input type="checkbox" id="cnd"> 眠気なしのみ表示</label>
            <label class="chk"><input type="checkbox" id="cnw"> 要注意成分を含まない</label>
          </div>
          <button type="button" class="rbtn" id="rbtn">✕ すべてリセット</button>
        </div>
      </div>

      <div class="wbox">
        <strong>⚠ 要注意成分について</strong>
        <b>ア尿素</b>→ 2023年AU規制・2025年KR麻薬類指定<br>
        <b>コデイン系</b>→ 12歳未満禁忌・依存リスク
      </div>
    </aside>

    <main>
      <div class="cmpbar">
        <span>比較したい商品を選択 <span class="cmpcnt" id="cmpcnt">0</span>/4</span>
        <button type="button" class="cmpbtn" id="cmpbtn" disabled onclick="openCmp()">📊 成分比較表を開く</button>
      </div>
      <div class="resinfo" id="resinfo"></div>
      <div class="afchips" id="afchips"></div>
      <div class="grid" id="grid"></div>
      <div class="pagi" id="pagi"></div>
    </main>
  </div>
</div>

<div class="pg" id="pg-guide">
  <div class="ptitle">💊 症状から薬を選ぶ</div>
  <div class="pdesc">症状グループをクリックすると該当する薬の一覧を表示します。</div>
  <div class="ggrid" id="ggrid"></div>
  <div id="gresult"></div>
</div>

<div class="pg" id="pg-column">
  <div id="clist">
    <div class="ptitle">📖 お役立ちコラム</div>
    <div class="pdesc">市販薬の正しい選び方・安全な使い方を解説します。</div>
    <div class="cgrid" id="cgrid"></div>
  </div>
  <div id="cdetail" style="display:none"></div>
</div>

<div class="mbg hide" id="cmpmodal">
  <div class="mdl">
    <div class="mhd">
      <h2>📊 成分比較表</h2>
      <button type="button" class="mcls" onclick="closeCmp()">×</button>
    </div>
    <div class="mbd" id="cmpbody"></div>
  </div>
</div>

<div class="tip" id="tip"></div>

<footer>本サイトはPMDA添付文書等の公開情報を元にした一般情報提供です。服用前に必ず添付文書をお読みください。広告収入を得ていません。</footer>

<script>
var MEDS=""" + meds_js + """;
var ING=""" + ing_js + """;
var COLS=""" + col_js + """;
var SYMS=""" + sym_js + """;
var CATS=""" + cats_js + """;
var RLBL={0:"要指導",1:"第1類",2:"第2類（指定）",2.5:"第２類",3:"第3類"};
var RCLS={0:"r0",1:"r1",2:"r2",2.5:"r25",3:"r3"};

var S={cat:"all",q:"",ings:[],syms:[],risk:"",sort:"def",nd:false,nw:false,pg:1,pp:20};
var CMP=[];

/* ページ切替 */
function showPg(id){
  document.querySelectorAll(".pg").forEach(function(p){p.classList.remove("on");});
  document.querySelectorAll(".ntab").forEach(function(t){t.classList.remove("on");});
  document.getElementById("pg-"+id).classList.add("on");
  document.getElementById("t-"+id).classList.add("on");
  if(id==="guide") buildGuide();
  if(id==="column") buildCols();
}

/* アコーディオン */
function togAcc(k){
  var hd=document.getElementById("hd-"+k);
  var bd=document.getElementById("bd-"+k);
  hd.classList.toggle("open");
  bd.classList.toggle("open");
}

/* カテゴリ */
function buildCats(){
  var el=document.getElementById("catlist");
  CATS.forEach(function(c){
    var cnt=c.id==="all"?MEDS.length:MEDS.filter(function(m){return m.cat===c.id;}).length;
    if(cnt===0&&c.id!=="all")return;
    var b=document.createElement("button");
    b.type="button";
    b.className="cbtn"+(c.id==="all"?" on":"");
    b.dataset.cat=c.id;
    b.innerHTML='<span class="ci">'+c.i+'</span>'+c.l+'<span class="ck">'+cnt+'</span>';
    b.addEventListener("click",function(){
      document.querySelectorAll(".cbtn").forEach(function(x){x.classList.remove("on");});
      b.classList.add("on");
      S.cat=c.id;S.pg=1;render();updCnts();
    });
    el.appendChild(b);
  });
}
buildCats();

/* 症状 */
function buildSymp(){
  var el=document.getElementById("symarea");el.innerHTML="";
  SYMS.forEach(function(grp){
    var div=document.createElement("div");div.className="sg";
    var h=document.createElement("div");h.className="sgh";
    h.innerHTML="<span>"+grp.i+"</span>"+grp.g+'<span class="gar">▼</span>';
    var t=document.createElement("div");t.className="stags hide";
    grp.s.forEach(function(sym){
      var cnt=MEDS.filter(function(m){return m.symptoms&&m.symptoms.indexOf(sym)>-1;}).length;
      if(!cnt)return;
      var sp=document.createElement("span");
      sp.className="stag"+(S.syms.indexOf(sym)>-1?" on":"");
      sp.innerHTML=sym+'<span style="opacity:.5;font-size:9px;margin-left:2px">'+cnt+'</span>';
      sp.addEventListener("click",function(){
        var idx=S.syms.indexOf(sym);
        if(idx>-1)S.syms.splice(idx,1);else S.syms.push(sym);
        sp.classList.toggle("on");S.pg=1;render();updCnts();
      });
      t.appendChild(sp);
    });
    h.addEventListener("click",function(){h.classList.toggle("col");t.classList.toggle("hide");});
    div.appendChild(h);div.appendChild(t);el.appendChild(div);
  });
}
buildSymp();

/* 成分チップ */
function buildIngs(){
  var map={};
  MEDS.forEach(function(m){
    (m.ings||[]).forEach(function(ing){
      var k=ing.replace(/[(（][^)）]*/g,"").replace(/[)）]/g,"").trim();
      if(k)map[k]=(map[k]||0)+1;
    });
  });
  var sorted=Object.keys(map).sort(function(a,b){return map[b]-map[a];}).slice(0,80);
  var el=document.getElementById("ingarea");el.innerHTML="";
  sorted.forEach(function(ing){
    var c=document.createElement("span");
    c.className="ichip"+(S.ings.indexOf(ing)>-1?" on":"");
    c.textContent=ing;
    c.addEventListener("click",function(){
      var idx=S.ings.indexOf(ing);
      if(idx>-1){S.ings.splice(idx,1);c.classList.remove("on");}
      else{S.ings.push(ing);c.classList.add("on");}
      S.pg=1;render();updCnts();
    });
    el.appendChild(c);
  });
}
buildIngs();

function updCnts(){
  var cc=S.cat!=="all"?1:0;
  var sc=S.syms.length;
  var ic=S.ings.length;
  [["cat",cc],["sym",sc],["ing",ic]].forEach(function(pair){
    var el=document.getElementById("cnt-"+pair[0]);
    if(el){el.textContent=pair[1];el.classList.toggle("on",pair[1]>0);}
  });
}

/* フィルタ */
function doFilter(){
  var r=MEDS.slice();
  if(S.cat!=="all")r=r.filter(function(m){return m.cat===S.cat;});
  if(S.q){
    var q=S.q.toLowerCase();
    r=r.filter(function(m){
      return (m.name||"").toLowerCase().indexOf(q)>-1||
             (m.maker||"").toLowerCase().indexOf(q)>-1||
             (m.effect||"").toLowerCase().indexOf(q)>-1||
             (m.ings||[]).some(function(i){return i.toLowerCase().indexOf(q)>-1;});
    });
  }
  if(S.syms.length>0){
    r=r.filter(function(m){
      return m.symptoms&&S.syms.some(function(s){return m.symptoms.indexOf(s)>-1;});
    });
  }
  if(S.ings.length>0){
    r=r.filter(function(m){
      return S.ings.every(function(si){
        return (m.ings||[]).some(function(mi){
          return mi.replace(/[(（][^)）]*/g,"").replace(/[)）]/g,"").trim().indexOf(si)>-1;
        });
      });
    });
  }
  if(S.risk!==""){
    var rv=parseFloat(S.risk);
    if(rv===2)r=r.filter(function(m){return m.risk>=2&&m.risk<3;});
    else r=r.filter(function(m){return m.risk===rv;});
  }
  if(S.nd)r=r.filter(function(m){return !m.drowsy;});
  if(S.nw)r=r.filter(function(m){return !(m.warnIngs&&m.warnIngs.length);});
  if(S.sort==="pa")r.sort(function(a,b){return (a.price||999999)-(b.price||999999);});
  else if(S.sort==="pd")r.sort(function(a,b){return (b.price||0)-(a.price||0);});
  else if(S.sort==="nm")r.sort(function(a,b){return a.name.localeCompare(b.name,"ja");});
  else if(S.sort==="rk")r.sort(function(a,b){return (a.risk||9)-(b.risk||9);});
  return r;
}

/* ツールチップ */
var tipEl=document.getElementById("tip");
function showTip(e,name){
  var d=ING[name];if(!d)return;
  tipEl.innerHTML="<b>"+name+"</b>"+d;
  var x=e.clientX,y=e.clientY;
  tipEl.style.left=(x+290>window.innerWidth?x-290:x+10)+"px";
  tipEl.style.top=(y+100>window.innerHeight?y-110:y+10)+"px";
  tipEl.classList.add("on");
}
function hideTip(){tipEl.classList.remove("on");}

/* カード */
function mkCard(m){
  var cat=null;
  for(var i=0;i<CATS.length;i++){if(CATS[i].id===m.cat){cat=CATS[i];break;}}
  cat=cat||{i:"",l:m.cat||""};
  var wset={};
  (m.warnIngs||[]).forEach(function(w){
    wset[w.replace(/[(（][^)）]*/g,"").replace(/[)）]/g,"").trim()]=1;
  });
  var iH=(m.ings||[]).map(function(ing){
    var b=ing.replace(/[(（][^)）]*/g,"").replace(/[)）]/g,"").trim();
    var iM=S.ings.indexOf(b)>-1;
    var iW=!!wset[b];
    var hD=!!ING[b];
    var cls=iW?"iw":iM?"im":"in";
        var title=hD?(ING[b]||""):"";
    var ev=title?' title="'+title.substring(0,80).replace(/"/g,"&quot;")+'"':'';
    return '<span class="itag '+cls+'"'+ev+'>'+ing+'</span>';
  }).join("");
  var sH="";
  if(m.symptoms&&m.symptoms.length){
    sH='<div class="csymp">'+m.symptoms.map(function(s){
      return '<span class="sym'+(S.syms.indexOf(s)>-1?" hit":"")+\'">'+s+"</span>";
    }).join("")+"</div>";
  }
  var nc=m.noteType==="danger"?"nd":m.noteType==="warn"?"nw":"nn";
  var pr=m.price?'<div class="cpval">¥'+m.price.toLocaleString()+'</div><div class="cpnote">参考価格（税込）</div>':'<div class="cpval np">価格要確認</div>';
  var sel=CMP.indexOf(m.id)>-1;
  return '<div class="card" id="cd-'+m.id+'">'
    +'<div class="csel"><input type="checkbox"'+(sel?" checked":"")
    +' onchange="togCmp('+m.id+',this.checked)"></div>'
    +'<div class="chard"><div><div class="cname">'+m.name+'</div><div class="cmaker">'+(m.maker||"")+'</div></div>'
    +'<div class="cprice">'+pr+'</div></div>'
    +'<div class="badges"><span class="badge bc">'+cat.i+" "+cat.l+'</span>'
    +'<span class="badge '+(RCLS[m.risk]||"r25")+'">'+(RLBL[m.risk]||"")+'</span>'
    +(m.drowsy?'<span class="badge bd2">🌙 眠気注意</span>':"")
    +((m.warnIngs&&m.warnIngs.length)?'<span class="badge bw2">⚠ 要注意成分</span>':"")
    +"</div>"+sH
    +'<div class="cef">'+(m.effect||"")+"</div>"
    +'<div class="ings">'+iH+"</div>"
    +(m.note?'<div class="note '+nc+'">'+m.note+"</div>":"")
    +'<div class="cfoot"><span class="cfootl">成分数:'+(m.ings||[]).length+'</span>'
    +'<div style="display:flex;gap:8px;align-items:center">'
    +'<button type="button" class="simbtn" onclick="showSim('+m.id+')">類似商品</button>'
    +'<a href="https://www.pmda.go.jp/PmdaSearch/otcSearch" target="_blank">📄 PMDA ↗</a>'
    +"</div></div>"
    +'<div id="sim-'+m.id+'" style="display:none"></div>'
    +"</div>";
}

/* 類似商品 */
function showSim(id){
  var m=null;for(var i=0;i<MEDS.length;i++){if(MEDS[i].id===id){m=MEDS[i];break;}}
  if(!m)return;
  var el=document.getElementById("sim-"+id);
  if(el.style.display==="block"){el.style.display="none";return;}
  var bi={};
  (m.ings||[]).forEach(function(i){bi[i.replace(/[(（][^)）]*/g,"").replace(/[)）]/g,"").trim()]=1;});
  var sims=MEDS.filter(function(x){return x.id!==id&&x.cat===m.cat;}).map(function(x){
    var xi={};
    (x.ings||[]).forEach(function(i){xi[i.replace(/[(（][^)）]*/g,"").replace(/[)）]/g,"").trim()]=1;});
    var inter=Object.keys(bi).filter(function(k){return xi[k];}).length;
    var union=Object.keys(Object.assign({},bi,xi)).length;
    return{x:x,s:union?inter/union:0};
  }).filter(function(o){return o.s>0;}).sort(function(a,b){return b.s-a.s;}).slice(0,3);
  if(!sims.length){el.innerHTML='<div style="font-size:12px;color:var(--txl);padding:6px">類似商品が見つかりません</div>';el.style.display="block";return;}
  el.innerHTML='<div class="simpnl"><h3>🔍 類似商品</h3>'
    +sims.map(function(o){
      return '<div class="simcard"><div><div style="font-size:13px;font-weight:600">'+o.x.name+'</div>'
        +'<div style="font-size:11px;color:var(--txl)">成分一致度 '+Math.round(o.s*100)+'% | '+(o.x.maker||"")+'</div></div>'
        +'<button type="button" class="simgo" onclick="jumpTo('+o.x.id+')">詳細を見る</button></div>';
    }).join("")+"</div>";
  el.style.display="block";
}

function jumpTo(id){
  var el=document.getElementById("cd-"+id);
  if(el){el.scrollIntoView({behavior:"smooth",block:"center"});el.style.outline="2px solid var(--teal)";setTimeout(function(){el.style.outline="";},1500);}
}

/* 比較 */
function togCmp(id,chk){
  if(chk){
    if(CMP.length>=4){alert("最大4件まで比較できます");
      var cb=document.querySelector("#cd-"+id+" input[type=checkbox]");if(cb)cb.checked=false;return;}
    CMP.push(id);
  }else{var i=CMP.indexOf(id);if(i>-1)CMP.splice(i,1);}
  document.getElementById("cmpcnt").textContent=CMP.length;
  document.getElementById("cmpbtn").disabled=CMP.length<2;
}

function openCmp(){
  var meds=CMP.map(function(id){for(var i=0;i<MEDS.length;i++){if(MEDS[i].id===id)return MEDS[i];}return null;}).filter(Boolean);
  if(meds.length<2)return;
  var allI={};
  meds.forEach(function(m){(m.ings||[]).forEach(function(ing){allI[ing.replace(/[(（][^)）]*/g,"").replace(/[)）]/g,"").trim()]=1;});});
  var ings=Object.keys(allI).filter(Boolean);
  var hd=meds.map(function(m){return '<th class="'+(RCLS[m.risk]||"r25")+'"><b>'+m.name+'</b><br><span style="font-size:10px;font-weight:400">'+(m.maker||"")+"</span></th>";}).join("");
  var rows=ings.map(function(ing){
    var cells=meds.map(function(m){
      var has=(m.ings||[]).some(function(i){return i.replace(/[(（][^)）]*/g,"").replace(/[)）]/g,"").trim()===ing;});
      return '<td style="text-align:center">'+(has?'<span class="ck2">✓</span>':'<span class="cx2">-</span>')+'</td>';
    }).join("");
    return "<tr><th>"+ing+"</th>"+cells+"</tr>";
  }).join("");
  var prRow="<tr><th>価格</th>"+meds.map(function(m){return "<td>"+(m.price?"¥"+m.price.toLocaleString():"不明")+"</td>";}).join("")+"</tr>";
  var drRow="<tr><th>眠気</th>"+meds.map(function(m){return "<td>"+(m.drowsy?"🌙 あり":"✅ なし")+"</td>";}).join("")+"</tr>";
  document.getElementById("cmpbody").innerHTML=
    '<table class="cmptbl"><thead><tr><th>成分</th>'+hd+'</tr></thead><tbody>'+prRow+drRow+rows+'</tbody></table>';
  document.getElementById("cmpmodal").classList.remove("hide");
}
function closeCmp(){document.getElementById("cmpmodal").classList.add("hide");}

/* アクティブフィルタ表示 */
function buildAfChips(){
  var el=document.getElementById("afchips");el.innerHTML="";
  function add(lb,fn){
    var s=document.createElement("span");s.className="afc";
    s.innerHTML=lb+' <button type="button">×</button>';
    s.querySelector("button").onclick=fn;el.appendChild(s);
  }
  if(S.cat!=="all"){
    var c=null;for(var i=0;i<CATS.length;i++){if(CATS[i].id===S.cat){c=CATS[i];break;}}
    if(c)add(c.l,function(){S.cat="all";document.querySelectorAll(".cbtn").forEach(function(b){b.classList.remove("on");});document.querySelector('[data-cat="all"]').classList.add("on");S.pg=1;render();updCnts();});
  }
  if(S.q)add('"'+S.q+'"',function(){S.q="";document.getElementById("qinp").value="";S.pg=1;render();});
  S.syms.forEach(function(sym){
    (function(s){add("🤕 "+s,function(){var i=S.syms.indexOf(s);if(i>-1)S.syms.splice(i,1);buildSymp();S.pg=1;render();updCnts();});})(sym);
  });
  S.ings.forEach(function(ing){
    (function(v){add(v,function(){var i=S.ings.indexOf(v);if(i>-1)S.ings.splice(i,1);buildIngs();S.pg=1;render();updCnts();});})(ing);
  });
  if(S.risk){var lbl=RLBL[parseFloat(S.risk)]||S.risk;add(lbl,function(){S.risk="";document.getElementById("frisk").value="";S.pg=1;render();});}
  if(S.nd)add("眠気なし",function(){S.nd=false;document.getElementById("cnd").checked=false;S.pg=1;render();});
  if(S.nw)add("要注意成分なし",function(){S.nw=false;document.getElementById("cnw").checked=false;S.pg=1;render();});
}

/* ページネーション */
function buildPagi(total){
  var pages=Math.ceil(total/S.pp);
  var el=document.getElementById("pagi");el.innerHTML="";
  if(pages<=1)return;
  function mk(lb,pg,dis,act){
    var b=document.createElement("button");b.type="button";
    b.className="pgb"+(act?" on":"");b.textContent=lb;
    if(dis)b.disabled=true;
    else b.onclick=function(){S.pg=pg;render();window.scrollTo({top:0,behavior:"smooth"});};
    return b;
  }
  el.appendChild(mk("‹",S.pg-1,S.pg===1,false));
  var prev=0;
  for(var i=1;i<=pages;i++){
    if(i===1||i===pages||(i>=S.pg-2&&i<=S.pg+2)){
      if(prev&&i-prev>1){var d=document.createElement("span");d.style.padding="0 4px";d.style.color="var(--txl)";d.textContent="…";el.appendChild(d);}
      el.appendChild(mk(i,i,false,i===S.pg));prev=i;
    }
  }
  el.appendChild(mk("›",S.pg+1,S.pg===pages,false));
}

/* メインレンダリング */
function render(){
  var fl=doFilter();var total=fl.length;
  document.getElementById("resinfo").innerHTML='<strong>'+total.toLocaleString()+'件</strong>表示中（全'+MEDS.length.toLocaleString()+'件）';
  buildAfChips();
  var start=(S.pg-1)*S.pp;var page=fl.slice(start,start+S.pp);
  document.getElementById("grid").innerHTML=page.length===0?'<div class="nores">🔍 条件に合う医薬品が見つかりません</div>':page.map(mkCard).join("");
  buildPagi(total);
}

/* イベント */
var qt;
document.getElementById("qinp").addEventListener("input",function(e){clearTimeout(qt);qt=setTimeout(function(){S.q=e.target.value.trim();S.pg=1;render();},200);});
document.getElementById("frisk").addEventListener("change",function(e){S.risk=e.target.value;S.pg=1;render();});
document.getElementById("fsort").addEventListener("change",function(e){S.sort=e.target.value;S.pg=1;render();});
document.getElementById("cnd").addEventListener("change",function(e){S.nd=e.target.checked;S.pg=1;render();});
document.getElementById("cnw").addEventListener("change",function(e){S.nw=e.target.checked;S.pg=1;render();});
document.getElementById("rbtn").addEventListener("click",function(){
  S.cat="all";S.q="";S.ings=[];S.syms=[];S.risk="";S.sort="def";S.nd=false;S.nw=false;S.pg=1;
  document.getElementById("qinp").value="";
  document.getElementById("frisk").value="";
  document.getElementById("fsort").value="def";
  document.getElementById("cnd").checked=false;
  document.getElementById("cnw").checked=false;
  document.querySelectorAll(".cbtn").forEach(function(b){b.classList.remove("on");});
  document.querySelector('[data-cat="all"]').classList.add("on");
  buildIngs();buildSymp();updCnts();render();
});
document.getElementById("cmpmodal").addEventListener("click",function(e){if(e.target===this)closeCmp();});

/* 症状ガイド */
function buildGuide(){
  var el=document.getElementById("ggrid");
  if(el.children.length)return;
  SYMS.forEach(function(g){
    var div=document.createElement("div");
    div.className="gcard";
    div.innerHTML='<div class="gico">'+g.i+'</div><div class="gname">'+g.g+'</div><div class="gsub">'+g.s.slice(0,3).join(" / ")+"…</div>";
    (function(name){div.addEventListener("click",function(){filterGuide(name);});})(g.g);
    el.appendChild(div);
  });
}

function filterGuide(name){
  var grp=null;for(var i=0;i<SYMS.length;i++){if(SYMS[i].g===name){grp=SYMS[i];break;}}
  if(!grp)return;
  var meds=MEDS.filter(function(m){return m.symptoms&&grp.s.some(function(s){return m.symptoms.indexOf(s)>-1;});});
  document.getElementById("gresult").innerHTML='<div style="margin-top:16px">'
    +'<div class="ptitle" style="font-size:15px">'+grp.i+" "+name+"（"+meds.length+"件）</div>"
    +'<div class="grid" style="margin-top:10px">'+meds.slice(0,20).map(function(m){
      var cat=null;for(var i=0;i<CATS.length;i++){if(CATS[i].id===m.cat){cat=CATS[i];break;}}cat=cat||{i:"",l:m.cat};
      return '<div class="card"><div class="chard"><div><div class="cname">'+m.name+'</div><div class="cmaker">'+(m.maker||"")+'</div></div>'
        +'<div class="cprice">'+(m.price?'<div class="cpval">¥'+m.price.toLocaleString()+'</div>':'<div class="cpval np">価格要確認</div>')+'</div></div>'
        +'<div class="badges"><span class="badge bc">'+cat.i+" "+cat.l+'</span><span class="badge '+(RCLS[m.risk]||"r25")+'">'+(RLBL[m.risk]||"")+'</span></div>'
        +'<div class="cef">'+(m.effect||"")+"</div></div>";
    }).join("")+"</div>"
    +(meds.length>20?'<p style="font-size:12px;color:var(--txl);margin-top:8px">他'+(meds.length-20)+'件は検索ページで症状を選択してください。</p>':"")
    +"</div>";
}

/* コラム */
function buildCols(){
  var el=document.getElementById("cgrid");
  if(el.children.length)return;
  COLS.forEach(function(col){
    var div=document.createElement("div");
    div.className="ccard";
    div.innerHTML='<div class="ctop"><div class="ctag">'+col.tag+'</div><div class="ctitle">'+col.title+'</div></div>'
      +'<div class="cbdy"><div class="cdate">'+col.date+'</div><div class="csum">'+col.summary+'</div></div>';
    (function(id){div.addEventListener("click",function(){showCol(id);});})(col.id);
    el.appendChild(div);
  });
}

function showCol(id){
  var col=null;for(var i=0;i<COLS.length;i++){if(COLS[i].id===id){col=COLS[i];break;}}
  if(!col)return;
  document.getElementById("clist").style.display="none";
  var body=col.body.split("\\n").map(function(p){
    if(!p.trim())return"";
    p=p.replace(/\\*\\*(.+?)\\*\\*/g,"<strong>$1</strong>");
    return"<p>"+p+"</p>";
  }).join("");
  document.getElementById("cdetail").innerHTML=
    '<button type="button" class="bkbtn" onclick="backCol()">← コラム一覧に戻る</button>'
    +'<div class="cdetail"><h1>'+col.title+'</h1>'
    +'<div class="cmeta">'+col.date+" | "+col.tag+'</div>'
    +'<div class="cbody">'+body+'</div></div>';
  document.getElementById("cdetail").style.display="block";
}

function backCol(){
  document.getElementById("clist").style.display="block";
  document.getElementById("cdetail").style.display="none";
}

/* 初期化 */
render();
</script>
</body>
</html>"""

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--output", default=str(OUT_HTML))
    a = p.parse_args()
    run(output=a.output)
