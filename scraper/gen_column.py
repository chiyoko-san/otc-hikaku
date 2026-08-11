#!/usr/bin/env python3
"""
Claude APIで市販薬・健康食品の消費者保護コラムを自動生成 → Supabase に直接保存

【v2 改善点】
1. 過去コラム(直近20本)をプロンプトに渡して重複回避
2. 構成パターンを5種類用意してランダム選択
3. テーマ選定で「直近使ったカテゴリ」を避けてバランス化
4. モデルを claude-opus-4-7 に更新

環境変数:
  ANTHROPIC_API_KEY : Claude APIキー
  SUPABASE_URL      : https://xxxx.supabase.co
  SUPABASE_KEY      : anon public キー
"""
import json, re, sys, os, argparse, urllib.request, urllib.error, random, hashlib
from pathlib import Path
from datetime import datetime, timezone, timedelta

DATA_DIR = Path(__file__).parent
MED_JSON = DATA_DIR / "medicines.json"
JST      = timezone(timedelta(hours=9))

# 重複判定のしきい値: 過去記事との類似度がこれ以上なら再生成する
# 0.7 = 7割以上似ていたらボツ。厳しくするなら下げる(0.5等)、緩めるなら上げる。
SIMILARITY_THRESHOLD = 0.7
# 再生成の最大試行回数(これを超えたら諦めて中止し、その日は生成しない)
MAX_RETRIES = 4

# ── 被害報告誘導セクション(末尾に自動挿入)─────────
DAMAGE_REPORT_FOOTER = """
---

## 🛡️ 被害報告にご協力ください

同じような被害を受けた方が、これ以上増えないために。

クスリノコンパスでは、消費者の皆さまから**広告・契約トラブルの目撃情報・被害情報**を集めています。あなたの1件が、次の誰かの被害を防ぐ手がかりになります。

🔗 **[被害情報を投稿する(匿名OK・1分で完了)](https://www.kusuri-compass.com/damage-reports/submit/)**

※投稿内容は集計データとして公表され、特定の個人や企業を非難する目的では使用されません。
"""

# ── ①素材の3軸(掛け合わせて組み合わせ爆発させる)────────
# 固定テーマ50個だと使い切って重複する。トピック×読者×切り口を
# 毎回ランダムに掛け合わせ、同じ素材でも別角度の記事になるようにする。

TOPICS = [
    # ─── A. 成分・薬の知識(サイトの中核。ここを厚くして偏りを消す)──
    ("成分",   "解熱鎮痛成分の違い(アセトアミノフェン/イブプロフェン/ロキソプロフェン)と使い分け"),
    ("成分",   "抗ヒスタミン成分の第1世代と第2世代の違い。眠くなる薬・眠くならない薬の見分け方"),
    ("成分",   "胃薬の種類(H2ブロッカー/制酸剤/健胃生薬)と症状ごとの選び方"),
    ("成分",   "美白有効成分の違い(トラネキサム酸/ビタミンC誘導体/アルブチン)と何に効くか"),
    ("成分",   "整腸薬の乳酸菌・ビフィズス菌・酪酸菌の違いと腸内での働き"),
    ("成分",   "咳止め・去痰成分の分類(中枢性/末梢性/去痰)と咳のタイプ別の選び方"),
    ("成分",   "外用鎮痛消炎剤(ロキソプロフェン/インドメタシン/フェルビナク/サリチル酸)の強さと違い"),
    ("成分",   "水虫薬の抗真菌成分の違いと、再発させないための使い方"),
    ("知識",   "同じ成分でも処方薬と市販薬で用量が違う理由。市販薬の『上限』の考え方"),
    ("知識",   "『第1類・第2類・第3類』医薬品の区分の意味と、買うときの実際の違い"),
    ("知識",   "薬の飲み合わせ(のみ合わせ)の基本。市販薬同士・食品との相互作用"),
    ("知識",   "『眠くなる成分』はなぜ眠くなるのか。運転前に避けるべき市販薬"),
    ("知識",   "市販薬の『やめどき』。何日使って効かなければ受診すべきかの目安"),
    ("知識",   "薬の剤形(錠剤/カプセル/顆粒/液剤/テープ)による効き方・使い分けの違い"),
    ("選び方", "総合感冒薬と単剤(症状別の薬)、どちらを選ぶべきか"),
    ("選び方", "『成分で選ぶ』とは何か。パッケージの効能書きに頼らない市販薬の選び方"),

    # ─── B. 消費者保護(重要だが柱の一つに留める)────────────
    ("景表法", "誇大広告の見抜き方(No.1表示/体験談/効果保証)と、健康食品広告の落とし穴"),
    ("薬機法", "健康食品・化粧品が『痩せる』『シミが消える』と書けない理由(医薬品的効能効果)"),
    ("契約",   "『初回500円』定期購入の総額の罠と、解約できないときの対処・救済制度"),
    ("被害事例", "サプリ・健康食品・市販薬の乱用や過剰摂取で実際に起きた健康被害から学ぶ"),
]

# 誰に向けて書くか# 誰に向けて書くか(同じトピックでも読者が変わると事例も語り口も変わる)
READERS = [
    "ドラッグストアで薬が多すぎてどれを選べばいいか分からない人",
    "花粉症や頭痛など、毎年同じ症状で市販薬を買う人",
    "子ども・家族のために市販薬を選ぶ立場の親",
    "市販薬を常用していて副作用や飲み合わせが不安な人",
    "美容・スキンケアの成分にこだわりたい人",
    "定期購入や健康食品の広告に不安を感じている消費者",
    "薬の知識はないが、失敗せず賢く選べるようになりたい人",
]

# どの切り口で書くか(構成パターンとは別の「視点」の軸)
ANGLES = [
    "『結局どれを選べばいいか』の結論を先に示し、理由を成分で裏付ける",
    "よくある勘違い(『強い薬ほど良い』等)を1つずつ事実で正す",
    "具体的な症状シーン(夜中の頭痛、会議前の花粉症等)を起点に選び方を示す",
    "成分名の意味を『体の中で何をしているか』から噛み砕いて説明する",
    "似た製品を成分で見比べて『違いはどこか』を具体的に示す",
    "『やってはいけない使い方』と『安全に効かせるコツ』を対で示す",
    "知っておくと得する豆知識・雑学として、軽い読み物調で伝える",
]

# ── 構成パターン(5種類からランダム選択して多様化)──────
STRUCTURE_PATTERNS = [
    {
        "name": "標準型",
        "instruction": """## 推奨構成
1. **導入**:具体的な相談事例や典型シナリオから入る(読者の「あるある」感を引き出す)
2. **本論**:法的根拠・仕組みの解説(条文・公的データを引用)
3. **見抜き方**:消費者が自衛するための具体的チェックポイント(箇条書きで5つ程度)
4. **困ったときの対処法**:相談窓口、解約手順など
5. **まとめ**:重要ポイント3つに絞って再掲"""
    },
    {
        "name": "Q&A型",
        "instruction": """## 推奨構成(Q&A形式で構成すること)
複数の具体的な質問とその回答で構成する。
- 冒頭:なぜこのテーマが今問題なのかを2〜3段落で導入
- Q1〜Q5:読者が実際に抱きそうな疑問を5つ用意し、それぞれに法的根拠・実例つきで回答
- 各Qの回答は400〜600文字程度
- 最後にまとめと相談窓口の案内
**見出しは ## Q1. 〜?  形式で書く**"""
    },
    {
        "name": "ケーススタディ型",
        "instruction": """## 推奨構成(具体的な架空事例ベース)
1. **ケース紹介**:架空の消費者(年齢・性別・職業を設定)が陥った具体的なシナリオを物語形式で200〜400文字で描写
2. **何が問題だったか**:法的観点からの分析
3. **どこで気づくべきだったか**:契約時・広告閲覧時に注意できたポイント
4. **似たケースの参考事例**:消費者庁・国民生活センターの公開事例を引用
5. **同じ被害を避けるための具体的行動**:箇条書きで
※ケースは「Aさん(40代女性・会社員)」のように架空人物として明示"""
    },
    {
        "name": "誤解・神話バスター型",
        "instruction": """## 推奨構成(よくある誤解を1つずつ崩していく)
1. **導入**:このテーマでなぜ誤解が蔓延しているのか
2. **誤解その1**:「〜は安心」「〜なら大丈夫」など世間に流布する誤解を提示 → 法的事実で反証
3. **誤解その2**:別の誤解を提示 → 反証
4. **誤解その3**:別の誤解を提示 → 反証
5. **誤解その4**:別の誤解を提示 → 反証
6. **本当に正しい知識**:消費者が持つべき正しい認識をまとめる
7. **相談窓口**
**見出しは ## 誤解1:「〜」  形式で書く**"""
    },
    {
        "name": "時系列・歴史型",
        "instruction": """## 推奨構成(規制の変遷や事件の時系列で構成)
1. **導入**:現在の規制状況を一言で
2. **過去**:このテーマに関する規制・事件はどう変遷してきたか(具体的な年と出来事を3〜5個)
3. **現在**:今の法規制・運用はどうなっているか(条文を引用)
4. **典型的な違反パターン**:現在も発生している事例(具体的に3つ)
5. **将来の見通し**:今後さらに規制強化が予想される領域
6. **消費者として今できること**:具体的アクション
**年号や日付を積極的に入れて時間軸を明確にする**"""
    },
]

# ── システムプロンプト(消費者保護路線)─────────────
# ── システムプロンプト(消費者保護路線)─────────────
SYSTEM_PROMPT_BASE = """あなたは消費者問題に詳しい医療・法律ライターです。
市販薬・健康食品・サプリメントに関する消費者被害、誇大広告、景品表示法違反、定期購入トラブルについて、消費者目線で具体的かつ法的根拠に基づいた解説コラムを書いてください。

## サイトの立ち位置
- クスリノコンパスは「市販薬を成分で選ぶ」中立比較サイト(広告ゼロ運営)
- 読者は、薬・健康食品の購入や定期購入で「困った経験」をした、またはこれから注意したい一般消費者
- 業界批判ではなく、消費者が自衛するための知識として書く

## 取り扱いトピック
A) 景品表示法・薬機法違反の広告事例
B) 定期購入・契約トラブル
C) 過去の健康食品・市販薬による消費者被害事例

## 引用根拠の優先順位
1. 消費者庁の措置命令・課徴金事例(公開資料)
2. 国民生活センター・PIO-NETの消費者相談データ
3. 景品表示法・特定商取引法・薬機法の条文
4. PMDA・厚生労働省の公開情報
5. 都道府県の消費生活センターの公表事例

## 文章の書き方ルール(必ず守ること)
読み手を飽きさせない、視覚的にリズムのある文章を書いてください。
情報をベタ書きで並べず、抑揚と「呼吸」のある文章にしてください。

### 構成・段落のルール
1. **導入は「シーン」から始める**:いきなり結論や説明文ではなく、読者が「あるある」と感じる場面描写や、心の中のつぶやきから入る。例:「『初回500円』の文字が、SNS広告の中で光って見えた。」のように具体的な情景を1〜2文で描いてから本論に入る
2. **1文を短く切る**:長い1文を避ける。「〜であり、〜であって、〜である」のような重文・複文は分割する。読者の視線が止まらないリズムを作る
3. **段落を「呼吸」で区切る**:1段落は3〜5文以内を基本とする。重要な転換点では1行だけの段落も使う(余白で強調)
4. **小見出しを階層化**:## (H2)の下に必要に応じて ### (H3)を入れる。1つのH2セクションに3〜5文だけということは避け、視覚的にスカスカでも構造を作る

### 強調・視覚要素のルール
5. **太字を効果的に使う**:重要な単語・キーワードは **太字** で強調する。1段落に1〜2箇所程度
6. **引用ブロック (>) を活用する**:法律の条文、消費者庁の見解、印象的なフレーズは `> 〜` の引用ブロックで浮かせる
7. **テーブルは内容が要求するときだけ**:比較・並列情報が実際にあるときに使う。埋めるために作らない
8. **吹き出し (:::tip / :::warn) は0〜3個**:必要なときだけ使う。無理に入れない
9. **「——」(ダッシュ)を効果的に使う**:転換・強調・余韻を作るときに使う。例:「しかし——」「だからこそ——」

### 読者を引き込くために(手段は記事ごとに変えること)
以下は「引き出しの候補」であって、全部を毎回使う必要はない。この記事の
読者と切り口に合うものだけを選び、記事ごとに異なる見せ方をすること。
毎回同じテクニックを全部盛りにすると、どの記事も同じ声・同じリズムになる。
- 読者の内面の独白、問いかけ、専門用語の噛み砕き、型(Before/After等)は
  「使ってもよい道具」。この記事に必要な分だけ、自然に使う。
- むしろ意識すべきは、指定された『想定読者』の具体的な状況・気持ちに
  合わせて、語り口そのものを変えること。

### NGパターン(避けるべき書き方)
- 「近年、〜が増えています」のような定型的な書き出し
- 1段落が10文以上続く長すぎる説明
- 太字・引用・テーブル・吹き出しが一切ない、ベタ書きの文章
- 専門用語の連発(条文番号や法律名を説明なしに重ねる)
- まとめが「以上、〜について解説しました」で終わる定型句

## 制約
- 法的根拠は景品表示法・特定商取引法・薬機法の該当条文を引用
- 事例は消費者庁・国民生活センター・PMDAの公開情報を出典として明記
- 特定企業・特定商品名を実名で批判しない(過去の措置命令事例として消費者庁が公表済みの企業名は引用可)
- 医療・法律相談の代替にならないことを明記する
- 困っている読者に「188(消費者ホットライン)」の存在を最低1回は伝える
- Markdownで記述する(## 見出し、**太字**、- リスト、> 引用、::: tip/warn/danger 吹き出し)
- 本文は3000〜4000文字程度(日本語)
- 最後に「出典:」セクションを設けて、引用した公的機関のURLや法令名を箇条書きで列挙
- 一人称は使わない

## 画像の挿入ルール(重要)
本文中には画像(Markdown の `![...](...)` 記法)を一切挿入しないこと。
画像URLや画像のプレースホルダ(`{IMAGE_BASE_URL}` など)も使用しないこと。
本文はテキストのみで完結させること。

## 吹き出し記法(必要な場合のみ使用)
::: tip タイトル
内容
:::

::: warn タイトル
内容
:::

## 出力フォーマット(JSONのみ・余分なテキスト不要)
{
  "title": "記事タイトル(60文字以内)",
  "tag": "タグ",
  "summary": "サマリー(100文字以内)",
  "body": "本文(Markdown形式、3000〜4000文字)"
}"""

# ─────────────────────────────────────────────────────────
def _bigrams(text: str) -> set:
    t = re.sub(r"\s+", "", text or "")
    return {t[i:i+2] for i in range(len(t) - 1)} if len(t) >= 2 else {t}


def similarity(a: str, b: str) -> float:
    """文字bi-gramのJaccard類似度(0〜1)。0.5超で「似すぎ」とみなす。"""
    sa, sb = _bigrams(a), _bigrams(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def is_too_similar(candidate: dict, past: list[dict], threshold: float = SIMILARITY_THRESHOLD) -> tuple[bool, str]:
    """生成コラムが過去コラムと似すぎていないか判定。
    タイトルとサマリーを結合して比較し、最も近い過去記事との類似度を見る。"""
    cand_text = (candidate.get("title", "") + " " + candidate.get("summary", ""))
    worst = 0.0
    worst_title = ""
    for c in past:
        past_text = (c.get("title", "") + " " + c.get("summary", ""))
        sim = similarity(cand_text, past_text)
        # タイトル単独の一致も別途チェック(サマリーで薄まるのを防ぐ)
        title_sim = similarity(candidate.get("title", ""), c.get("title", ""))
        sim = max(sim, title_sim)
        if sim > worst:
            worst, worst_title = sim, c.get("title", "")
    return worst >= threshold, f"{worst:.0%} 似ている: 「{worst_title}」"


def fetch_recent_columns(limit: int = 20) -> list[dict]:
    """Supabaseから直近のコラムを取得(重複回避用)"""
    sb_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    sb_key = os.environ.get("SUPABASE_KEY", "")
    if not sb_url or not sb_key:
        return []
    url = f"{sb_url}/rest/v1/columns?select=title,tag,summary,body&order=date.desc&limit={limit}"
    req = urllib.request.Request(
        url,
        headers={"apikey": sb_key, "Authorization": f"Bearer {sb_key}"},
        method="GET"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"[gen] 過去コラム取得エラー(無視して続行): {e}", file=sys.stderr)
        return []


def format_past_columns_for_prompt(past: list[dict]) -> str:
    """過去コラムをプロンプト用にフォーマット"""
    if not past:
        return ""
    lines = []
    for i, c in enumerate(past, 1):
        title = c.get("title", "")
        tag = c.get("tag", "")
        summary = c.get("summary", "")
        # 冒頭2文だけ抜き出して「書き出しの被り」も検知できるようにする
        body = (c.get("body") or "").lstrip("#").strip()
        opening = "".join(body.split("\n"))[:80]
        lines.append(f"{i}. [{tag}] {title}\n   要約: {summary}\n   書き出し: {opening}…")
    return "\n".join(lines)


def pick_theme_smart(slot: int, date_str: str, past: list[dict]) -> tuple[int, str, str, str, str]:
    """トピック×読者×切り口を掛け合わせて選ぶ。
    直近の重複を避けつつ、同じトピックでも読者・切り口が変わるので
    組み合わせが枯渇しにくい(16×6×6=576通り)。"""
    recent_tags = [c.get("tag", "") for c in past[:5]]
    recent_titles = set(c.get("title", "") for c in past[:20])

    # トピック候補: 直近5本で同タグ3回以上は避ける
    topic_candidates = [
        (i, tag, desc) for i, (tag, desc) in enumerate(TOPICS)
        if recent_tags.count(tag) < 3
    ]
    if not topic_candidates:
        topic_candidates = [(i, t, d) for i, (t, d) in enumerate(TOPICS)]

    seed = int(hashlib.md5(f"{date_str}-{slot}".encode()).hexdigest(), 16)
    idx, tag, desc = topic_candidates[seed % len(topic_candidates)]
    # 読者と切り口は別のシードで選び、トピックと独立に回す
    reader = READERS[(seed // 7) % len(READERS)]
    angle = ANGLES[(seed // 13) % len(ANGLES)]
    return idx, tag, desc, reader, angle


def pick_structure_pattern(date_str: str, slot: int) -> dict:
    """構成パターンを日付ベースで選択(同じ日は同じ構成)"""
    seed = int(hashlib.md5(f"struct-{date_str}-{slot}".encode()).hexdigest(), 16)
    return STRUCTURE_PATTERNS[seed % len(STRUCTURE_PATTERNS)]


def call_claude(theme_tag: str, theme_desc: str, reader: str, angle: str, past_columns: list[dict], structure: dict) -> dict | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("[gen] ANTHROPIC_API_KEY が未設定", file=sys.stderr)
        return None

    # システムプロンプトに構成パターンを追加
    system_prompt = SYSTEM_PROMPT_BASE + "\n\n" + structure["instruction"]

    # ユーザープロンプトに過去コラム情報を含める
    user_prompt = f"""次の条件でコラムを1本書いてください。

## トピック領域
{theme_desc}(タグ: {theme_tag})

## 想定読者(この人に語りかけるつもりで書く)
{reader}

## この記事の切り口(必ずこの視点を軸にする)
{angle}

上のトピックを、上の読者に向けて、上の切り口で書いてください。
トピックが同じでも、読者と切り口が変われば、選ぶ具体例・語り口・構成は
まったく別物になるはずです。一般論の寄せ集めにせず、この読者のこの状況に
刺さる記事にしてください。

本文中には画像のMarkdownリンクを一切含めないこと。テキストのみで完結させてください。"""

    past_str = format_past_columns_for_prompt(past_columns)
    if past_str:
        user_prompt += f"""

## 【重要】重複回避のための過去コラム一覧
以下は本サイトで直近に公開された記事です。
これらと**タイトル・切り口・構成・冒頭の入り方・使用する具体例**が被らないようにしてください。
同じテーマ領域でも、必ず違う角度・違う事例・違う構成で書いてください。

{past_str}

特に注意:
- 同じ冒頭の入り方(「近年、〜が増えています」「皆さんは〜をご存じですか」など定型句)を避ける
- 過去コラムで既に挙げられた具体例(企業名・商品ジャンル)はできるだけ別のものを使う
- まとめの締め方も定型化させない"""

    payload = json.dumps({
        "model": "claude-opus-4-8",
        "max_tokens": 6000,
        "system": system_prompt,
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
            text = resp["content"][0]["text"].strip()
            m = re.search(r'\{[\s\S]+\}', text)
            if m:
                return json.loads(m.group())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"[gen] Claude APIエラー: {e.code} {e.reason}", file=sys.stderr)
        print(f"[gen] レスポンス: {body}", file=sys.stderr)
    except Exception as e:
        print(f"[gen] Claude APIエラー: {e}", file=sys.stderr)
    return None


def save_to_supabase(col: dict) -> bool:
    sb_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    sb_key = os.environ.get("SUPABASE_KEY", "")
    if not sb_url or not sb_key:
        print("[gen] SUPABASE_URL / SUPABASE_KEY が未設定", file=sys.stderr)
        return False
    # 重複チェック
    check_url = f"{sb_url}/rest/v1/columns?id=eq.{col['id']}&select=id"
    req_check = urllib.request.Request(
        check_url,
        headers={"apikey": sb_key, "Authorization": f"Bearer {sb_key}"},
        method="GET"
    )
    try:
        with urllib.request.urlopen(req_check, timeout=30) as r:
            existing = json.loads(r.read().decode("utf-8"))
            if existing:
                print(f"[gen] ID重複: {col['id']} → 生成済みです(正常終了)")
                return True
    except Exception as e:
        print(f"[gen] 重複チェックエラー: {e}", file=sys.stderr)
    # 保存(status='draft' で保存 → 管理画面で確認後に公開)
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
        body = e.read().decode("utf-8")
        print(f"[gen] Supabase保存エラー: {e.code} {body}", file=sys.stderr)
    except Exception as e:
        print(f"[gen] Supabase保存エラー: {e}", file=sys.stderr)
    return False


def run(dry_run=False, theme_index=None):
    today    = datetime.now(JST)
    date_str = today.strftime("%Y-%m-%d")
    slot     = 0 if today.hour < 15 else 1
    col_id   = f"auto_{today.strftime('%Y%m%d')}_{slot}"

    # 過去コラムを取得(重複回避とテーマ選定の両方に使う)
    print("[gen] 過去コラム取得中...")
    past_columns = fetch_recent_columns(limit=20)
    print(f"[gen] 過去コラム {len(past_columns)} 件取得")

    # テーマ選定
    if theme_index is not None:
        theme_tag, theme_desc = TOPICS[theme_index % len(TOPICS)]
        picked_idx = theme_index % len(TOPICS)
        # 手動指定時も読者・切り口は日付ベースで回す
        seed = int(hashlib.md5(f"{date_str}-{slot}".encode()).hexdigest(), 16)
        reader = READERS[(seed // 7) % len(READERS)]
        angle = ANGLES[(seed // 13) % len(ANGLES)]
    else:
        picked_idx, theme_tag, theme_desc, reader, angle = pick_theme_smart(slot, date_str, past_columns)

    # 構成パターン選定
    structure = pick_structure_pattern(date_str, slot)

    print(f"[gen] トピック[{picked_idx}]: [{theme_tag}] {theme_desc}")
    print(f"[gen] 想定読者: {reader}")
    print(f"[gen] 切り口: {angle}")
    print(f"[gen] 構成パターン: {structure['name']}")
    print(f"[gen] コラムID: {col_id}")

    if dry_run:
        print("[gen] dry-run モード(APIは呼ばない)")
        print("[gen] --- 過去コラム(直近5本)---")
        for c in past_columns[:5]:
            print(f"  [{c.get('tag','')}] {c.get('title','')}")
        return True

    print("[gen] Claude APIでコラム生成中...")
    col_data = None
    for attempt in range(1, MAX_RETRIES + 1):  # 似すぎたらトピックを変えて再生成
        candidate = call_claude(theme_tag, theme_desc, reader, angle, past_columns, structure)
        if not candidate:
            print(f"[gen] 生成失敗(試行{attempt})", file=sys.stderr)
            break
        too_sim, detail = is_too_similar(candidate, past_columns)
        if not too_sim:
            col_data = candidate
            print(f"[gen] 類似チェックOK({detail})")
            break
        print(f"[gen] ⚠ 過去記事と{detail} → 別トピックで再生成(試行{attempt})")
        # 別トピック・別読者・別切り口に振り直す
        seed = int(hashlib.md5(f"{date_str}-{slot}-retry{attempt}".encode()).hexdigest(), 16)
        picked_idx2 = seed % len(TOPICS)
        theme_tag, theme_desc = TOPICS[picked_idx2]
        reader = READERS[(seed // 7) % len(READERS)]
        angle = ANGLES[(seed // 13) % len(ANGLES)]
        structure = pick_structure_pattern(date_str, slot + attempt)
        print(f"[gen]   → [{theme_tag}] {theme_desc[:30]} / 読者変更 / 切り口変更")
    if not col_data:
        print("[gen] コラム生成失敗(または全試行で類似)", file=sys.stderr)
        return False

    # 念のため:本文内の画像Markdown(![...](...))を全て削除する保険処理
    body = col_data.get("body", "")
    img_md_pattern = re.compile(r'!\[[^\]]*\]\([^)]*\)\s*\n?')
    removed_images = len(img_md_pattern.findall(body))
    body = img_md_pattern.sub('', body)
    # 連続した空行を1つに整理
    body = re.sub(r'\n{3,}', '\n\n', body)

    # 被害報告誘導セクションを「## 出典」の直前に挿入
    # 既に入ってる場合は二重挿入を防ぐ
    if "damage-reports/submit" not in body:
        if "## 出典" in body:
            # 「## 出典」の直前に挿入
            body = body.replace("## 出典", DAMAGE_REPORT_FOOTER + "\n## 出典", 1)
        else:
            # 出典セクションがない場合は末尾に追加
            body = body.rstrip() + DAMAGE_REPORT_FOOTER
        print(f"[gen] ✅ 被害報告誘導セクションを挿入しました")
    else:
        print(f"[gen] ℹ️ 被害報告誘導セクションは既に含まれています")

    col = {
        "id":      col_id,
        "title":   col_data.get("title", theme_desc[:60]),
        "date":    date_str,
        "tag":     col_data.get("tag", theme_tag),
        "summary": col_data.get("summary", "")[:200],
        "body":    body,
    }
    print(f"[gen] タイトル: {col['title']}")
    print(f"[gen] 文字数: {len(col['body'])} 文字")
    if removed_images > 0:
        print(f"[gen] ⚠️ 画像Markdownを{removed_images}箇所削除しました(AIが指示を無視)")
    else:
        print(f"[gen] 画像Markdown: 0箇所(指示通り)")

    if save_to_supabase(col):
        print(f"[gen] ✅ Supabaseに下書き保存しました")
        print(f"[gen] → admin.html で確認・編集後に公開してください")
        return True
    return False


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run",  action="store_true")
    p.add_argument("--theme",    type=int, default=None)
    p.add_argument("--list",     action="store_true")
    a = p.parse_args()
    if a.list:
        for i, (tag, desc) in enumerate(TOPICS):
            print(f"[{i:2d}] {tag}: {desc}")
        sys.exit(0)
    ok = run(dry_run=a.dry_run, theme_index=a.theme)
    sys.exit(0 if ok else 1)
