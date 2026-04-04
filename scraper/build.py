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
    {"g":"痛み・熱","s":["頭痛","偏頭痛","歯痛","のど痛","月経痛","腰痛","関節痛","筋肉痛","神経痛","打撲・ねんざ","発熱"]},
    {"g":"鼻・目・のど","s":["鼻水","くしゃみ","鼻づまり","目のかゆみ","充血","目の疲れ","乾き目","花粉症","のどの炎症","のど痛"]},
    {"g":"咳・痰","s":["せき","たん","声がれ","口腔殺菌"]},
    {"g":"胃腸・お腹","s":["胃痛","胸やけ","胃もたれ","食べ過ぎ","飲み過ぎ","吐き気","下痢","便秘","腹部膨満","整腸"]},
    {"g":"皮膚・かゆみ","s":["湿疹・かぶれ","かゆみ","虫刺され","乾燥肌","にきび","口内炎","水虫","肌荒れ"]},
    {"g":"疲労・神経","s":["肉体疲労","眼精疲労","手足のしびれ","冷え","めまい・立ちくらみ","動悸"]},
    {"g":"美容","s":["シミ・そばかす","肝斑","肌荒れ","薄毛・脱毛"]},
    {"g":"女性・メンタル","s":["更年期障害","月経不順","不眠","乗物酔い"]},
    {"g":"その他","s":["禁煙","痔","排卵確認","妊娠確認","消毒"]},
]

CATS = [
    {"id":"all","l":"すべて"},
    {"id":"cold","l":"かぜ薬・解熱鎮痛"},
    {"id":"stomach","l":"消化器官用薬"},
    {"id":"allergy","l":"アレルギー用薬"},
    {"id":"cough","l":"鎮咳・去痰・含嗽薬"},
    {"id":"nose","l":"鼻炎用薬"},
    {"id":"ext_pain","l":"外皮用薬（鎮痛）"},
    {"id":"ext_skin","l":"外皮用薬（皮膚）"},
    {"id":"eye","l":"眼科用薬"},
    {"id":"joint","l":"関節・筋肉（内服）"},
    {"id":"skin_oral","l":"皮膚科・シミ（内服）"},
    {"id":"hair","l":"育毛・発毛薬"},
    {"id":"women","l":"女性用薬"},
    {"id":"sleep","l":"催眠鎮静薬"},
    {"id":"vitamin","l":"ビタミン・滋養強壮"},
    {"id":"kampo","l":"漢方製剤"},
    {"id":"foot","l":"水虫・皮膚感染"},
    {"id":"oral","l":"歯科口腔用薬"},
    {"id":"anal","l":"痔疾用薬"},
    {"id":"circu","l":"循環器・血液用薬"},
    {"id":"smoking","l":"禁煙補助剤"},
    {"id":"motion","l":"乗物酔い"},
    {"id":"test","l":"一般用検査薬"},
    {"id":"disinfect","l":"消毒薬"},
    {"id":"quasi_skin","l":"医薬部外品（スキンケア）"},
    {"id":"quasi_oral","l":"医薬部外品（オーラルケア）"},
    {"id":"quasi_hair","l":"医薬部外品（育毛）"},
    {"id":"func_gut","l":"機能性表示（腸内環境）"},
    {"id":"func_eye","l":"機能性表示（目の健康）"},
    {"id":"func_joint","l":"機能性表示（関節・骨）"},
    {"id":"func_stress","l":"機能性表示（ストレス・睡眠）"},
    {"id":"func_fat","l":"機能性表示（体脂肪・血糖）"},
    {"id":"c5","title":"WEB広告表現に騙されないために——景品表示法から読み解く市販薬・健康食品の広告リテラシー","date":"2026-04-04","tag":"安全情報",
     "thumb":None,
     "summary":"「売上No.1」「医師推薦」「即効」——Web広告に溢れる表現の根拠を問う。景品表示法（景表法）の仕組みから、定期購入トラブル・ステマ規制まで、広告リテラシーの基本を解説。",
     "body":"## そのWeb広告の「効果絶大」、根拠はあるか\n\nSNSのタイムラインや検索結果に並ぶ市販薬の広告。「即効」「医師推薦」「売上No.1」「飲むだけで解決」——こうした表現を毎日のように目にする。では、これらの言葉はどのような法律で規制されていて、消費者はどう読み解けばいいのか。**景品表示法（景表法）**を軸に、広告リテラシーの基本を整理する。\n\n---\n\n## 景品表示法とは何か\n\n景品表示法の正式名称は**「不当景品類及び不当表示防止法」**（昭和37年制定、消費者庁所管）である。\n\nこの法律が禁じる「不当表示」は大きく2種類に分けられる。\n\n- **優良誤認表示**（第5条第1号）：商品の品質・効能などが実際よりも著しく優良であると消費者に誤認させる表示\n- **有利誤認表示**（第5条第2号）：価格・取引条件などが実際よりも著しく有利であると消費者に誤認させる表示\n\n市販薬の広告で問題になるのは主に「優良誤認表示」だ。「この薬を飲めばすべての症状が消える」「副作用がまったくない」といった根拠のない主張は、消費者が商品を実際よりも優れたものだと思い込む原因になる。\n\n::: info 景表法の目的\n一般消費者が**自主的・合理的に商品を選択できる環境**を守ることを目的としている（第1条）。同法の運用主体は消費者庁で、違反には措置命令・課徴金・2024年施行の直罰規定が適用される。\n:::\n\n---\n\n## 2024年改正で「直罰制度」が導入された\n\n2024年10月に施行された改正景表法の最大の変化は、**故意の優良誤認表示に対する直罰制度**の導入だ。改正前は「措置命令→命令違反→罰則」という段階を踏む必要があったが、改正後は故意に優良誤認表示をした法人・個人に対して**措置命令なしに100万円以下の罰金**を科せるようになった。\n\nまた、課徴金制度（2016年導入）も継続して運用されており、不当表示による売上額の**3%**が課徴金として課される。これらの強化により、悪質な広告表現に対する抑止力が高まっている。\n\n::: warn 改正景表法（2024年10月施行）の主なポイント\n- 故意の優良誤認表示に**直罰（100万円以下の罰金）**\n- 確約手続制度の導入（自主的な是正措置を認定する手続）\n- デジタル広告への対応強化\n:::\n\n---\n\n## 市販薬広告でよく見られる問題表現\n\n### 「No.1」表示の落とし穴\n\n「売上No.1」「医師推薦No.1」といった表現は非常に多用されるが、景表法上は**調査の対象・時期・条件が明確でなければ有利誤認表示**にあたるリスクがある。\n\n消費者庁が公表している「No.1表示に関する実態調査」（2022年）では、No.1表示の約**6割超**が根拠となる調査の対象範囲・調査時期・調査機関のいずれかが不明確だったとされている。\n\n消費者が確認すべきポイントは次の3点だ。\n\n- 何を対象にした「No.1」なのか（商品カテゴリが極端に狭くないか）\n- いつ行った調査か（数年前のデータを「現在」のように見せていないか）\n- 誰が調査したか（調査機関が明示されているか）\n\n### 「医師推薦」「薬剤師推薦」の信頼性\n\n「医師の9割が推薦」「薬剤師の8割が選ぶ」といった表現も要注意だ。\n\nこうした表示は、推薦した医師・薬剤師の人数・専門分野・選出方法が開示されていなければ実質的に意味をなさない。たとえば「推薦医師10人中9人」でも「医師の9割が推薦」という表現は成立する。数の絶対値だけでなく、**調査規模と方法**を確認することが重要だ。\n\n### 体験談・口コミの扱い\n\n「1週間で症状がなくなった」「長年の悩みが解決した」といった体験談・口コミも、景表法の規制対象になりうる。\n\n消費者庁のガイドライン（2023年10月改定）では、**インフルエンサーや第三者が対価を受けて商品を宣伝する場合は「広告」と明示する義務**が課された（ステルスマーケティング規制）。また、体験談の内容が真実であっても、その効果が一般消費者に同様に得られるとは限らないため、**一般的なデータによる裏付けがなければ優良誤認表示**とみなされる可能性がある。\n\n::: danger ステルスマーケティングに注意\n2023年10月から、インフルエンサーへの対価提供を隠して行う宣伝（いわゆるステマ）は景表法違反となった。SNS上の「個人の感想」に見える投稿でも、**「PR」「広告」「案件」の表示がなければ違法**の可能性がある。\n:::\n\n### 「即効」「劇的改善」などの効果表現\n\n医薬品の広告については薬機法（医薬品医療機器等法）も同時に適用されるが、景表法の観点からも「即効性」や「劇的な効果」を強調する表現は合理的な根拠がなければ問題になる。\n\n根拠として認められるのは原則として次のいずれかだ。\n\n1. 試験・調査の結果（査読付き論文・臨床試験データ等）\n2. 専門家・学術機関等の見解\n\n「多くの方に実感いただいています」「飲んだその日から違う」といった表現に、上記の根拠が添付されていなければ、景表法上の「合理的根拠」とは言えない。\n\n---\n\n## 薬機法との違い\n\n市販薬に関係するもう一つの重要法規が**薬機法（医薬品医療機器等法）**だ。景表法と薬機法は目的が異なるため、両方に抵触することも多い。\n\n| 観点 | 景表法 | 薬機法 |\n|---|---|---|\n| 主な目的 | 消費者の選択の自由を守る | 医薬品の品質・安全・有効性を確保 |\n| 規制対象 | 商品・サービス全般 | 医薬品・医療機器・化粧品等 |\n| 問題となる表現 | 根拠のない優良・有利の主張 | 承認されていない効能・効果の標榜 |\n| 主管 | 消費者庁 | 厚生労働省・都道府県 |\n\n市販薬の広告で「〇〇病が治る」「〇〇に効く」と承認された効能以外を謳えば薬機法違反になる。同時に、根拠のない形で「No.1」や「医師推薦」を掲げれば景表法違反にもなりうる。\n\n---\n\n## 合理的根拠の「事前提出義務」\n\n景表法第7条第2項（旧第4条第2項）に基づき、消費者庁は広告主に対して**表示の根拠となる資料の提出を求める**ことができる。提出を求めた日から15日以内に合理的根拠が示せなければ、その表示は不当表示とみなされる（合理的根拠不提示の推定規定）。\n\nつまり「広告を出す側は、事前に根拠資料を用意しておかなければならない」のが原則だ。消費者の立場から見れば、広告表現に根拠を求めることは正当な権利といえる。\n\n---\n\n## 消費者として広告を読む7つのチェックポイント\n\n市販薬を含む健康・美容商品の広告を見たとき、以下の7点を確認する習慣をつけると騙されにくくなる。\n\n- **[!青] 1. No.1・推薦数値の根拠** — 調査対象・時期・機関が明示されているか\n- **[!青] 2. 体験談の注記** — 「個人の感想です」「効果には個人差があります」の記載があるか\n- **[!青] 3. PR表示の有無** — SNS投稿・ブログ記事に「#PR」「広告」の明示があるか\n- **[!青] 4. 効果の範囲** — 承認された効能・効果の範囲内の主張か（薬機法）\n- **[!青] 5. 価格表示の条件** — 割引・キャンペーン価格に条件・期間が明記されているか\n- **[!青] 6. 定期購入の条件** — 「お試し価格」が実は定期購入契約になっていないか\n- **[!青] 7. 成分情報のアクセス** — 配合成分・含有量が確認できるか\n\n---\n\n## まとめ\n\n景表法は消費者の「自主的・合理的な選択」を守るための法律だ。「No.1」「医師推薦」「即効」といった表現は根拠があれば問題ないが、実際には曖昧な根拠のまま使われているケースが多い。\n\n2024年の改正で直罰制度が導入され、規制は強化されているが、それでも問題のある広告がなくなることはない。最終的には**消費者自身が広告リテラシーを持ち、根拠を問う姿勢**を持つことが重要だ。\n\nおかしいと思った広告は、消費者庁の**消費者ホットライン（局番なし188）**か、最寄りの消費生活センターに相談できる。\n\n---\n\n出典：消費者庁「景品表示法」、消費者庁「No.1表示に関する実態調査報告書（2022年）」、消費者庁「令和5年度 景品表示法改正の概要」、消費者庁「比較広告に関する景品表示法上の考え方」\n\n---\n\n## 薬局・ドラッグストアでの「推奨」表示にも注意\n\n店頭のPOP広告でも同様の問題が起こりうる。「薬剤師一押し！」「スタッフのイチオシ」といった表示は景表法の適用外になることもあるが、消費者の選択に大きく影響する。\n\n特に注意が必要なのが、メーカーから小売店へのいわゆる**販売促進費（リベート）**の問題だ。メーカーが特定商品を目立つ場所に陳列したり推薦したりすることへの対価として金銭を支払う慣行は存在するが、それが「薬剤師の専門的な推薦」のように見える形で消費者に伝わることは、実態と表示が乖離している状態といえる。\n\n消費者庁は2023年の「No.1表示に関する実態調査」の中で、こうしたPOP表示についても問題意識を示している。市販薬を選ぶ際は、POPや陳列位置に影響されず、**添付文書・成分表示・リスク区分**を直接確認することが最も信頼性の高い選び方だ。\n\n---\n\n## 「定期購入」トラブルに巻き込まれないために\n\n市販薬・健康食品のWeb広告で急増しているのが、**定期購入の申込を「お試し」と誤認させる手口**だ。\n\n特定商取引法（特商法）の規制も強化されているが、「初回980円」と大きく表示しながら、定期購入契約であることを小さな文字で記載するケースが後を絶たない。消費者庁の「定期購入トラブルに関する調査」（2023年）によれば、健康食品・サプリメントの定期購入トラブルの相談件数は年間**数万件**規模に上る。\n\n::: danger 定期購入トラブルの典型パターン\n「初回お試し価格」→ 実は定期購入の申込み → 2回目以降は通常価格が自動引き落とし → 解約に電話が必要（繋がらない）——このパターンが最も多い。申込み前に**「定期購入」「最低購入回数」「解約方法」**を必ず確認すること。\n:::\n\n2022年の特商法改正により、定期購入の条件を**申込み画面で明確に表示する義務**が課されたが、依然として問題事例は多い。申込み前に必ず確認すべき事項は次の通りだ。\n\n1. 定期購入か否か\n2. 最低購入回数・縛り期間\n3. 解約・変更の連絡先と方法\n4. 2回目以降の価格\n\n---\n\n## 健康食品・機能性表示食品の広告にも同様の問題\n\n本サイトでも取り扱っている**機能性表示食品**は、事業者が消費者庁へ届出を行い、科学的根拠を示したうえで機能性を表示できる制度だ（2015年導入）。しかし、この制度を悪用した誇大な広告表現が問題になるケースもある。\n\n機能性表示食品の広告で適切な表現は「〇〇を含み、△△の機能があることが報告されています」という形だ。「必ず効く」「医薬品と同等の効果がある」といった表現は、機能性表示食品でも薬機法・景表法上の問題になる。\n\n::: warn 機能性表示食品と医薬品の違い\n機能性表示食品は**疾病の治療や予防を目的としない**。「血圧が高めの方に適している」とは言えても、「高血圧を治す」とは言えない。この差を意図的に曖昧にした広告表現には注意が必要だ。\n:::\n\n---\n\n出典（追加）：消費者庁「定期購入に関する特定商取引法の規制」（2023年）、消費者庁「機能性表示食品制度」、国民生活センター「通販の定期購入をめぐるトラブル」（2023年）\n"},
]

MD_JS = r"""function mdToHtml(src){
  var lines=src.split("\n"),html="",inUl=false,inOl=false,inBq=false,inTbl=false,tblRows=[];
  function close(){
    if(inUl){html+="</ul>";inUl=false;}
    if(inOl){html+="</ol>";inOl=false;}
    if(inBq){html+="</blockquote>";inBq=false;}
    if(inTbl){html+=flushTable();inTbl=false;tblRows=[];}
  }
  function flushTable(){
    if(!tblRows.length)return"";
    var rows=tblRows.filter(function(r){return!/^[\|\s\-:]+$/.test(r);});
    var t='<div style="overflow-x:auto;margin:12px 0"><table style="width:100%;border-collapse:collapse;font-size:13px">';
    rows.forEach(function(row,ri){
      var cells=row.replace(/^\||\|$/g,"").split("|");
      var tag=ri===0?"th":"td";
      t+="<tr>"+cells.map(function(c){return "<"+tag+' style="padding:7px 10px;border:1px solid var(--bd);'+(ri===0?"background:var(--sl);font-weight:600":"background:var(--wh)")+'">'
          +inl(c.trim())+"</"+tag+">";}).join("")+"</tr>";
    });
    return t+"</table></div>";
  }
  function inl(s){
    return s
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;margin:4px 0;display:block">')
      .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
      .replace(/\*([^*\n]+?)\*/g,"<em>$1</em>")
      .replace(/`([^`\n]+?)`/g,'<code style="background:#f1f5f9;padding:1px 5px;border-radius:3px;font-size:12px;font-family:monospace">$1</code>')
      .replace(/==(.+?)==/g,'<mark style="background:#fef08a;padding:1px 3px;border-radius:2px">$1</mark>');
  }
  for(var i=0;i<lines.length;i++){
    var raw=lines[i],l=inl(raw);
    var callout=/^::: ?(tip|warn|danger|info)\s*(.*)$/.exec(raw);
    if(callout){close();var ctype=callout[1],ctitle=callout[2]||"";
      var cmap={tip:{bg:"var(--tl)",bd:"var(--teal)",color:"var(--teal2)",label:"ヒント"},warn:{bg:"var(--amber)",bd:"var(--amberb)",color:"#713f12",label:"注意"},danger:{bg:"var(--rb)",bd:"var(--red)",color:"var(--red)",label:"危険"},info:{bg:"#eff6ff",bd:"#2563eb",color:"#1d4ed8",label:"情報"}};
      var cs=cmap[ctype]||cmap.info;var inner=[];i++;
      while(i<lines.length&&lines[i].trim()!==":::"){inner.push(lines[i]);i++;}
      html+='<div style="border-left:4px solid '+cs.bd+';background:'+cs.bg+';border-radius:0 8px 8px 0;padding:12px 16px;margin:12px 0">'
        +'<div style="font-weight:700;color:'+cs.color+';margin-bottom:4px">'+cs.ico+(ctitle?" "+ctitle:"")+'</div>'
        +'<div style="color:'+cs.color+';font-size:13px;line-height:1.8">'+inner.map(function(ln){return inl(ln);}).join("<br>")+'</div></div>';continue;}
    l=l.replace(/\[!(緑|赤|青|黄)\]\s*(.+)/g,function(_,color,text){
      var cs={緑:{bg:"#f0fdf4",bd:"#bbf7d0",tx:"#166534"},赤:{bg:"var(--rb)",bd:"#fecaca",tx:"var(--red)"},青:{bg:"#eff6ff",bd:"#bfdbfe",tx:"#1d4ed8"},黄:{bg:"var(--amber)",bd:"#fde68a",tx:"#713f12"}};
      var c=cs[color]||cs.青;
      return'<span style="display:inline-block;background:'+c.bg+';border:1px solid '+c.bd+';color:'+c.tx+';border-radius:4px;padding:1px 8px;font-size:12px;font-weight:600">'+inl(text)+'</span>';});
    if(/^\|.+\|/.test(raw)){if(!inTbl){close();inTbl=true;tblRows=[];}tblRows.push(raw);continue;}
    if(inTbl&&!/^\|.+\|/.test(raw)){html+=flushTable();inTbl=false;tblRows=[];}
    var imgm=/^!\[([^\]]*)\]\(([^)]+)\)$/.exec(raw);
    if(imgm){close();html+='<figure style="margin:16px 0;text-align:center"><img src="'+imgm[2]+'" alt="'+imgm[1]+'" style="max-width:100%;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.08)"><figcaption style="font-size:11px;color:var(--txl);margin-top:5px">'+imgm[1]+'</figcaption></figure>';continue;}
    var h3=/^### (.+)/.exec(raw),h2=/^## (.+)/.exec(raw),bq=/^> (.*)/.exec(raw),ul=/^[-*] (.*)/.exec(raw),ol=/^\d+\. (.*)/.exec(raw);
    if(h3){close();html+='<h3 style="font-size:15px;font-weight:700;color:var(--navy);margin:16px 0 5px">'+inl(h3[1])+'</h3>';continue;}
    if(h2){close();html+='<h2 style="font-size:17px;font-weight:700;color:var(--navy);margin:22px 0 8px;padding-bottom:6px;border-bottom:2px solid var(--tl)">'+inl(h2[1])+'</h2>';continue;}
    if(/^---+$/.test(raw)){close();html+='<hr style="border:none;border-top:1px solid var(--bd);margin:16px 0">';continue;}
    if(bq){if(!inBq){close();html+='<blockquote style="border-left:4px solid var(--teal);padding:8px 16px;background:var(--tl);border-radius:0 6px 6px 0;margin:10px 0;color:var(--teal2)">';inBq=true;}html+='<p style="margin:3px 0">'+inl(bq[1])+'</p>';continue;}
    if(inBq&&!bq){html+="</blockquote>";inBq=false;}
    if(ul){if(!inUl){if(inOl){html+="</ol>";inOl=false;}html+='<ul style="padding-left:20px;margin:8px 0">';inUl=true;}html+='<li style="margin:3px 0">'+inl(ul[1])+'</li>';continue;}
    if(inUl&&!ul){html+="</ul>";inUl=false;}
    if(ol){if(!inOl){if(inUl){html+="</ul>";inUl=false;}html+='<ol style="padding-left:20px;margin:8px 0">';inOl=true;}html+='<li style="margin:3px 0">'+inl(ol[1])+'</li>';continue;}
    if(inOl&&!ol){html+="</ol>";inOl=false;}
    if(!raw.trim()){close();continue;}
    html+='<p style="margin:6px 0">'+l+'</p>';}
  close();return html;}
"""
MKEFF_JS = r"""
function addIng(b){
  if(!b||S.ings.indexOf(b)>-1)return;
  S.ings.push(b);S.pg=1;buildIngs();render();updCnts();
}
function addSym(s){
  if(!s||S.syms.indexOf(s)>-1)return;
  S.syms.push(s);S.pg=1;buildSymp();render();updCnts();
}
function mkEffTags(effect){
  if(!effect)return"";
  var parts=effect.split(/[\u3002\u30FB\/\uFF0F\n]+/).map(function(p){return p.trim();}).filter(function(p){return p.length>1;});
  if(parts.length<=1)return'<span class="eftag">'+effect+'</span>';
  return parts.map(function(p){
    var matched=null;
    for(var i=0;i<SYMS.length;i++){
      var g=SYMS[i];
      for(var j=0;j<g.s.length;j++){
        if(p.indexOf(g.s[j])>-1||g.s[j].indexOf(p)>-1){matched=g.s[j];break;}
      }
      if(matched)break;
    }
    if(matched){
      return'<span class="eftag clickable" onclick="addSym(\''+matched.replace(/'/g,"")+'\')">'+p+'</span>';
    }
    return'<span class="eftag">'+p+'</span>';
  }).join("");
}
"""
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
    html = generate(meds_js, ing_js, col_js, sym_js, cats_js, updated_str, len(meds), MD_JS, MKEFF_JS)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"[build] 完了 {out.stat().st_size:,} bytes")

def generate(meds_js, ing_js, col_js, sym_js, cats_js, updated_str, count, md_js, mkeff_js):
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
.nav-inner{max-width:1240px;margin:0 auto;padding:0 20px;display:flex;align-items:center;height:52px;gap:8px}
.logo{font-size:17px;font-weight:700;color:#fff;margin-right:auto}
.logo em{color:var(--teal);font-style:normal}
.ntab{padding:6px 14px;border-radius:6px;font-size:13px;font-weight:500;color:#94a3b8;background:transparent;border:none;cursor:pointer}
.ntab:hover{color:#fff;background:rgba(255,255,255,.1)}
.ntab.on{color:#fff;background:var(--teal2)}
.nright{font-size:11px;color:#475569;margin-left:8px;white-space:nowrap}
/* PAGES */
.pg{display:none;max-width:1240px;margin:0 auto;padding:16px 20px 60px}
.pg.on{display:block}
.layout{display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:start}
/* SIDEBAR */
.sb{position:sticky;top:68px;align-self:start;display:flex;flex-direction:column;gap:8px;max-height:calc(100vh - 68px);overflow-y:auto}
.sb::-webkit-scrollbar{width:3px}
.sb::-webkit-scrollbar-thumb{background:var(--bdm);border-radius:2px}
/* SEARCH BOX */
.sbox{background:var(--wh);border:1px solid var(--bd);border-radius:10px;padding:10px}
.sbox input{width:100%;padding:8px 12px;border:1.5px solid var(--bd);border-radius:7px;font-size:13px;outline:none;font-family:inherit}
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
.acc-bd.open{display:block;overflow-y:auto;max-height:300px}
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
.bq{background:#fdf4ff;color:#6b21a8;border:1px solid #e9d5ff}
.bf{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
.csymp{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px}

.sym.hit{background:var(--amberb);color:#fff;border-color:var(--amberb);font-weight:600}
.cef{margin:5px 0;line-height:1.6}
.ings{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:7px}
.itag{display:inline-block;font-size:11px;padding:2px 7px;border-radius:10px;margin:2px 2px 2px 0;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0}
.itag.clickable{cursor:pointer;transition:background .15s,color .15s}
.itag.clickable:hover{background:var(--tl);color:var(--teal2);border-color:#99d4cd}
.itag.im{background:var(--tl);color:var(--teal2);border-color:#99d4cd;font-weight:600}
.itag.iw{background:#fef9c3;color:#713f12;border-color:#fde047}
.sym{display:inline-block;font-size:11px;padding:2px 8px;border-radius:10px;margin:2px 2px 2px 0;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0}
.sym.clickable{cursor:pointer;transition:background .15s,color .15s}
.sym.clickable:hover{background:#fef3c7;color:#92400e;border-color:#fde68a}
.sym.hit{background:#fef3c7;color:#92400e;border-color:#fde68a;font-weight:600}
.eftag{display:inline-block;font-size:12px;padding:2px 8px;border-radius:6px;margin:2px 2px 2px 0;background:#f8fafc;color:#334155;border:1px solid #e2e8f0}
.eftag.clickable{cursor:pointer;transition:background .15s,color .15s}
.eftag.clickable:hover{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}
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
    <button type="button" class="ntab on" id="t-search" onclick="showPg('search')">検索</button>
    <button type="button" class="ntab" id="t-guide" onclick="showPg('guide')">症状から選ぶ</button>
    <button type="button" class="ntab" id="t-column" onclick="showPg('column')">コラム</button>
    <span class="nright">""" + updated_str + """</span>
  </div>
</nav>

<div class="pg on" id="pg-search">
  <div class="layout">
    <aside class="sb">
      <div class="sbox">
        <div class="srel">
          
          <input type="text" id="qinp" placeholder="商品名・成分・症状・メーカー…" autocomplete="off">
        </div>
      </div>

      <div class="acc">
        <button type="button" class="acc-hd" id="hd-cat" onclick="togAcc('cat')">
          カテゴリ
          <span class="acc-cnt" id="cnt-cat"></span>
          <span class="acc-arr">▼</span>
        </button>
        <div class="acc-bd" id="bd-cat">
          <div class="catlist" id="catlist"></div>
        </div>
      </div>

      <div class="acc">
        <button type="button" class="acc-hd" id="hd-sym" onclick="togAcc('sym')">
          症状で絞り込む
          <span class="acc-cnt" id="cnt-sym"></span>
          <span class="acc-arr">▼</span>
        </button>
        <div class="acc-bd" id="bd-sym">
          <div id="symarea"></div>
        </div>
      </div>

      <div class="acc">
        <button type="button" class="acc-hd" id="hd-ing" onclick="togAcc('ing')">
          成分で絞り込む
          <span class="acc-cnt" id="cnt-ing"></span>
          <span class="acc-arr">▼</span>
        </button>
        <div class="acc-bd" id="bd-ing">
          <div id="ingarea" style="max-height:200px;overflow-y:auto;display:flex;flex-wrap:wrap"></div>
        </div>
      </div>

      <div class="acc">
        <button type="button" class="acc-hd open" id="hd-fil" onclick="togAcc('fil')">
          絞り込み・並び替え
          <span class="acc-arr">▼</span>
        </button>
        <div class="acc-bd open" id="bd-fil">
          <select class="fsel" id="fitype" style="margin-bottom:6px">
            <option value="">種別：すべて</option>
            <option value="otc">OTC医薬品</option>
            <option value="quasi">医薬部外品</option>
            <option value="functional">機能性表示食品</option>
          </select>
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
        <button type="button" class="cmpbtn" id="cmpbtn" disabled onclick="openCmp()">成分比較表を開く</button>
      </div>
      <div class="resinfo" id="resinfo"></div>
      <div class="afchips" id="afchips"></div>
      <div class="grid" id="grid"></div>
      <div class="pagi" id="pagi"></div>
    </main>
  </div>
</div>

<div class="pg" id="pg-guide">
  <div class="ptitle">症状から薬を選ぶ</div>
  <div class="pdesc">症状グループをクリックすると該当する薬の一覧を表示します。</div>
  <div class="ggrid" id="ggrid"></div>
  <div id="gresult"></div>
</div>

<div class="pg" id="pg-column">
  <div id="clist">
    <div class="ptitle">お役立ちコラム</div>
    <div class="pdesc">市販薬の正しい選び方・安全な使い方を解説します。</div>
    <div class="cgrid" id="cgrid"></div>
  </div>
  <div id="cdetail" style="display:none"></div>
</div>

<div class="mbg hide" id="cmpmodal">
  <div class="mdl">
    <div class="mhd">
      <h2>成分比較表</h2>
      <button type="button" class="mcls" onclick="closeCmp()">×</button>
    </div>
    <div class="mbd" id="cmpbody"></div>
  </div>
</div>

<div class="tip" id="tip"></div>

<footer>本サイトはPMDA添付文書等の公開情報を元にした一般情報提供です。服用前に必ず添付文書をお読みください。広告収入を得ていません。</footer>

<script>
""" + md_js + """
""" + mkeff_js + """
var MEDS=""" + meds_js + """;
var ING=""" + ing_js + """;
var COLS=""" + col_js + """;
var SYMS=""" + sym_js + """;
var CATS=""" + cats_js + """;
var RLBL={0:"要指導",1:"第1類",2:"第2類（指定）",2.5:"第２類",3:"第3類"};
var TYPELBL={otc:"OTC医薬品",quasi:"医薬部外品",functional:"機能性表示食品"};
var TYPECLS={otc:"",quasi:"bq",functional:"bf"};
var TYPEICO={otc:"",quasi:"",functional:""};
var TYPELBL={otc:"OTC医薬品",quasi:"医薬部外品",functional:"機能性表示食品"};
var TYPECLS={otc:"",quasi:"bq",functional:"bf"};
var TYPEICO={otc:"",quasi:"",functional:""};
var RCLS={0:"r0",1:"r1",2:"r2",2.5:"r25",3:"r3"};

var S={cat:"all",q:"",ings:[],syms:[],risk:"",itype:"",sort:"def",nd:false,nw:false,pg:1,pp:20};
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
    b.innerHTML=c.l+'<span class="ck">'+cnt+'</span>';
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
    h.innerHTML=grp.g+'<span class="gar">▼</span>';
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
  if(S.itype)r=r.filter(function(m){return (m.itype||"otc")===S.itype;});
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

/* 成分タグをクリックで成分フィルターに追加 */
function addIng(b){
  if(!b||S.ings.indexOf(b)>-1)return;
  S.ings.push(b);
  S.pg=1;
  buildIngs();
  render();
  updCnts();
}

/* 症状タグをクリックで症状フィルターに追加 */
function addSym(s){
  if(!s||S.syms.indexOf(s)>-1)return;
  S.syms.push(s);
  S.pg=1;
  buildSymp();
  render();
  updCnts();
}

/* 効能テキストを記号・読点で分割してクリッカブルタグに変換 */

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
            return '<span class="itag '+cls+' clickable" data-b="'+b.replace(/"/g,'&quot;')+'" onclick="addIng(this.dataset.b)">'+ing+'</span>';
  }).join("");
  var sH="";
  if(m.symptoms&&m.symptoms.length){
    sH='<div class="csymp">'+m.symptoms.map(function(s){
      return '<span class="sym'+(S.syms.indexOf(s)>-1?' hit':'')+' clickable" data-s="'+s+'" onclick="addSym(this.dataset.s)">'+s+'</span>';
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
    +'<div class="badges">'
    +(m.itype&&m.itype!=="otc"?'<span class="badge '+(TYPECLS[m.itype]||"bf")+'">'+(TYPEICO[m.itype]||"")+" "+(TYPELBL[m.itype]||m.itype)+'</span>':"")
    +'<span class="badge bc">'+cat.l+'</span>'
    +(!m.itype||m.itype==="otc"?'<span class="badge '+(RCLS[m.risk]||"r25")+'">'+(RLBL[m.risk]||"")+'</span>':"")
    +(m.drowsy?'<span class="badge bd2">眠気注意</span>':"")
    +((m.warnIngs&&m.warnIngs.length)?'<span class="badge bw2">要注意成分</span>':"")
    +"</div>"+sH
    +'<div class="cef">'+mkEffTags(m.effect||"")+"</div>"
    +'<div class="ings">'+iH+"</div>"
    +(m.note?'<div class="note '+nc+'">'+m.note+"</div>":"")
    +'<div class="cfoot"><span class="cfootl">成分数:'+(m.ings||[]).length+'</span>'
    +'<div style="display:flex;gap:8px;align-items:center">'
    +'<button type="button" class="simbtn" onclick="showSim('+m.id+')">類似商品</button>'
    +'<a href="https://www.pmda.go.jp/PmdaSearch/otcSearch" target="_blank">PMDA ↗</a>'
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
  el.innerHTML='<div class="simpnl"><h3>類似商品</h3>'
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
  var drRow="<tr><th>眠気</th>"+meds.map(function(m){return "<td>"+(m.drowsy?"あり":"✅ なし")+"</td>";}).join("")+"</tr>";
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
    (function(s){add(""+s,function(){var i=S.syms.indexOf(s);if(i>-1)S.syms.splice(i,1);buildSymp();S.pg=1;render();updCnts();});})(sym);
  });
  S.ings.forEach(function(ing){
    (function(v){add(v,function(){var i=S.ings.indexOf(v);if(i>-1)S.ings.splice(i,1);buildIngs();S.pg=1;render();updCnts();});})(ing);
  });
  if(S.itype){var itl=(TYPEICO[S.itype]||"")+" "+(TYPELBL[S.itype]||S.itype);add(itl,function(){S.itype="";document.getElementById("fitype").value="";S.pg=1;render();});}
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
  document.getElementById("grid").innerHTML=page.length===0?'<div class="nores">条件に合う医薬品が見つかりません</div>':page.map(mkCard).join("");
  buildPagi(total);
}

/* イベント */
var qt;
document.getElementById("qinp").addEventListener("input",function(e){clearTimeout(qt);qt=setTimeout(function(){S.q=e.target.value.trim();S.pg=1;render();},200);});
document.getElementById("fitype").addEventListener("change",function(e){S.itype=e.target.value;S.pg=1;render();});
document.getElementById("frisk").addEventListener("change",function(e){S.risk=e.target.value;S.pg=1;render();});
document.getElementById("fsort").addEventListener("change",function(e){S.sort=e.target.value;S.pg=1;render();});
document.getElementById("cnd").addEventListener("change",function(e){S.nd=e.target.checked;S.pg=1;render();});
document.getElementById("cnw").addEventListener("change",function(e){S.nw=e.target.checked;S.pg=1;render();});
document.getElementById("rbtn").addEventListener("click",function(){
  S.cat="all";S.q="";S.ings=[];S.syms=[];S.risk="";S.itype="";S.sort="def";S.nd=false;S.nw=false;S.pg=1;
  document.getElementById("qinp").value="";
  document.getElementById("fitype").value="";
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
    var div=document.createElement("div");div.className="gcard";
    div.innerHTML='<div class="gname">'+g.g+'</div><div class="gsub">'+g.s.slice(0,3).join(" / ")+"…</div>";
    (function(name){div.addEventListener("click",function(){filterGuide(name);});})(g.g);
    el.appendChild(div);
  });
}


function filterGuide(name){
  var grp=null;for(var i=0;i<SYMS.length;i++){if(SYMS[i].g===name){grp=SYMS[i];break;}}
  if(!grp)return;
  var meds=MEDS.filter(function(m){return m.symptoms&&grp.s.some(function(s){return m.symptoms.indexOf(s)>-1;});});
  document.getElementById("gresult").innerHTML='<div style="margin-top:16px">'
    +'<div class="ptitle" style="font-size:15px">'+name+"（"+meds.length+"件）</div>"
    +'<div class="grid" style="margin-top:10px">'+meds.slice(0,20).map(function(m){
      var cat=null;for(var i=0;i<CATS.length;i++){if(CATS[i].id===m.cat){cat=CATS[i];break;}}cat=cat||{i:"",l:m.cat};
      return '<div class="card"><div class="chard"><div><div class="cname">'+m.name+'</div><div class="cmaker">'+(m.maker||"")+'</div></div>'
        +'<div class="cprice">'+(m.price?'<div class="cpval">¥'+m.price.toLocaleString()+'</div>':'<div class="cpval np">価格要確認</div>')+'</div></div>'
        +'<div class="badges"><span class="badge bc">'+cat.l+'</span><span class="badge '+(RCLS[m.risk]||"r25")+'">'+(RLBL[m.risk]||"")+'</span></div>'
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
    var div=document.createElement("div");div.className="ccard";
    var hasThumb=col.thumb&&col.thumb.length>10;
    var topHtml=hasThumb
      ?'<div class="ctop has-thumb"><img src="'+col.thumb+'" alt="" loading="lazy"><div class="ctop-overlay"><div class="ctag">'+col.tag+'</div><div class="ctitle">'+col.title+'</div></div></div>'
      :'<div class="ctop no-thumb"><div class="ctop-overlay"><div class="ctag">'+col.tag+'</div><div class="ctitle">'+col.title+'</div></div></div>';
    div.innerHTML=topHtml+'<div class="cbdy"><div class="cdate">'+col.date+'</div><div class="csum">'+col.summary+'</div></div>';
    (function(id){div.addEventListener("click",function(){showCol(id);});})(col.id);
    el.appendChild(div);
  });
}


function showCol(id){
  var col=null;for(var i=0;i<COLS.length;i++){if(COLS[i].id===id){col=COLS[i];break;}}
  if(!col)return;
  document.getElementById("clist").style.display="none";
  var body=mdToHtml(col.body);
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
