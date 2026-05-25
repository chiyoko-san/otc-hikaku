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

# ── テーマプール(消費者保護・景表法・誇大広告系50テーマ)──
THEMES = [
    # ─── A. 景表法・薬機法・誇大広告(17テーマ)─────────
    ("景表法",   "「No.1表示」のカラクリ。健康食品・サプリで許される表現と禁止される表現"),
    ("景表法",   "「医師の◯◯%が推奨」広告の真実。アンケート回答数・抽出方法の落とし穴"),
    ("景表法",   "ビフォーアフター写真が景表法違反になる4つのパターン"),
    ("景表法",   "「個人の感想です」の但し書きで責任を逃れられない理由"),
    ("景表法",   "「天然成分100%」「無添加」と謳える本当の条件"),
    ("景表法",   "「1ヶ月で-10kg」効果保証広告の景表法違反例"),
    ("景表法",   "「臨床試験で実証」の根拠を疑うべき5つのチェックポイント"),
    ("景表法",   "「全額返金保証」の落とし穴。実際に返金されないケース"),
    ("景表法",   "「業界初」「日本初」表示が景表法違反になるケース"),
    ("景表法",   "ステマ規制(2023年10月施行)で何が変わったか。違反事例も解説"),
    ("景表法",   "インフルエンサーの「PR」表示義務と違反事例"),
    ("景表法",   "アフィリエイト広告の景表法違反。誰が責任を負うのか"),
    ("景表法",   "ランキングサイトの真実。広告料で順位が決まる典型事例"),
    ("薬機法",   "健康食品の「医薬品的効能効果」表示違反例"),
    ("薬機法",   "化粧品の薬機法違反フレーズ。「シミが消える」と言えない理由"),
    ("薬機法",   "「飲むだけで痩せる」が違法な理由。サプリと医薬品の境界線"),
    ("薬機法",   "「免疫力アップ」と書けない理由。薬機法と健康食品の表現規制"),

    # ─── B. 定期購入・契約トラブル(16テーマ)─────────
    ("契約",     "「初回500円」のカラクリ。総額3万円の罠を見抜く方法"),
    ("契約",     "定期購入の解約条件。電話のみ・受付時間制限の特商法問題"),
    ("契約",     "「お試し」「ワンコイン」表示が特商法違反になるケース"),
    ("契約",     "解約電話が繋がらないときの対処法。記録の取り方"),
    ("契約",     "クレジットカード会社への異議申し立て手順。チャージバック制度"),
    ("契約",     "消費者ホットライン188の上手な使い方と相談前の準備"),
    ("契約",     "クーリングオフが使える通販と使えない通販の違い"),
    ("契約",     "SNS広告経由の契約。Instagram・TikTokからのトラブル増加事例"),
    ("契約",     "LINE広告で誘導された定期購入トラブルの典型例"),
    ("契約",     "「中途解約金」の上限。違法な違約金請求の見抜き方"),
    ("契約",     "「定期コース」と「都度購入」の見分け方。最終確認画面の重要性"),
    ("契約",     "健康食品定期購入の解約成功例・失敗例から学ぶこと"),
    ("契約",     "「いつでも解約OK」の罠。実は条件付きだったケース"),
    ("契約",     "高齢者の被害が多い健康食品の特徴。家族ができる予防策"),
    ("契約",     "ネット通販の販売事業者情報の見方。実在しない業者の見分け方"),
    ("契約",     "2022年特商法改正のポイント。最終確認画面の表示義務"),

    # ─── C. 消費者被害事例・予防(17テーマ)──────────
    ("被害事例", "過去の健康食品被害事例から学ぶ。プエラリア・酵素飲料の問題"),
    ("被害事例", "「飲むだけで痩せる」サプリの実態。摂取注意成分一覧"),
    ("被害事例", "美容ドリンクの肝障害事例。コラーゲン以外の隠れリスク"),
    ("被害事例", "海外製サプリの危険性。個人輸入で起きた死亡例"),
    ("被害事例", "カフェイン過剰摂取の事例。エナジードリンク・カフェイン剤の盲点"),
    ("被害事例", "「眠気覚まし」薬の依存性。市販薬の乱用事例"),
    ("被害事例", "風邪薬乱用症候群(MOH)。鎮痛剤の連用が引き起こすこと"),
    ("被害事例", "機能性表示食品の届出撤回事例から見える問題"),
    ("被害事例", "特定保健用食品(トクホ)で問題になった商品事例"),
    ("被害事例", "健康食品の添加物リスク。表示されない隠れた成分"),
    ("被害事例", "「医師監修」「薬剤師推奨」の真実。表示の見極め方"),
    ("被害事例", "健康食品の科学的根拠の格付け。エビデンスレベルの見方"),
    ("被害事例", "ダイエット食品の景表法違反事例(消費者庁措置命令から)"),
    ("被害事例", "育毛剤の効果保証広告問題と過去の摘発事例"),
    ("被害事例", "「がんに効く」健康食品の摘発事例と被害者の声"),
    ("被害事例", "美白化粧品のトラブル事例(白斑問題から学ぶこと)"),
    ("被害事例", "市販の漢方薬・生薬製剤による健康被害の報告例"),
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
7. **テーブルを積極的に使う**:3つ以上の比較・並列情報は箇条書きではなくMarkdownテーブルに整理する。例:「窓口」「用途」「特徴」のような構造化情報
8. **吹き出し (:::tip / :::warn) は最低2個、最大4個まで**:ポイント・注意点・実践的アドバイスを目立たせる
9. **「——」(ダッシュ)を効果的に使う**:転換・強調・余韻を作るときに使う。例:「しかし——」「だからこそ——」

### 読者を引き込むテクニック
10. **読者の内面に刺さる一言を各セクションに1つ入れる**:「『もしかして、私が買ったあの商品も……』」のように、読者の頭に浮かぶ独白や疑問を引用符付きで挿入する
11. **「Before/After」「Step 1/2/3」「パターン①〜④」**など、わかりやすい型を使って構造化する
12. **専門用語は必ず噛み砕いて説明**:法律名や条文番号を出した直後に「つまり——」「ざっくり言えば——」の形で平易な言い換えを添える
13. **問いかけを混ぜる**:「なぜこれが違法なのか?」「あなたはどう動くべきか?」のように、読者に考えさせる疑問文をセクションの冒頭や転換点に置く

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

## 吹き出し記法(必ず2〜3個使うこと)
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
def fetch_recent_columns(limit: int = 20) -> list[dict]:
    """Supabaseから直近のコラムを取得(重複回避用)"""
    sb_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    sb_key = os.environ.get("SUPABASE_KEY", "")
    if not sb_url or not sb_key:
        return []
    url = f"{sb_url}/rest/v1/columns?select=title,tag,summary&order=date.desc&limit={limit}"
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
        lines.append(f"{i}. [{tag}] {title}\n   要約: {summary}")
    return "\n".join(lines)


def pick_theme_smart(slot: int, date_str: str, past: list[dict]) -> tuple[int, str, str]:
    """過去コラムのタグ分布を見て、偏りを避けてテーマを選定"""
    # 直近5本のタグを取得
    recent_tags = [c.get("tag", "") for c in past[:5]]
    # 直近5本のタイトルから既出キーワードを抽出(完全一致回避用)
    recent_titles = set(c.get("title", "") for c in past[:20])

    # 候補:直近で使われていないタグを優先
    candidates = []
    for i, (tag, desc) in enumerate(THEMES):
        # すでに完全一致するタイトルが過去にあったらスキップ
        # (THEMESのdescが直接タイトルになることがあるため)
        if desc in recent_titles:
            continue
        # 直近5本に同じタグが3回以上出ていたら、そのタグはスキップ
        if recent_tags.count(tag) >= 3:
            continue
        candidates.append((i, tag, desc))

    # 候補が空ならフォールバック(全テーマから選ぶ)
    if not candidates:
        candidates = [(i, t, d) for i, (t, d) in enumerate(THEMES)]

    # 日付+スロットで擬似ランダム選定(再現性確保)
    seed = int(hashlib.md5(f"{date_str}-{slot}".encode()).hexdigest(), 16)
    idx, tag, desc = candidates[seed % len(candidates)]
    return idx, tag, desc


def pick_structure_pattern(date_str: str, slot: int) -> dict:
    """構成パターンを日付ベースで選択(同じ日は同じ構成)"""
    seed = int(hashlib.md5(f"struct-{date_str}-{slot}".encode()).hexdigest(), 16)
    return STRUCTURE_PATTERNS[seed % len(STRUCTURE_PATTERNS)]


def call_claude(theme_tag: str, theme_desc: str, past_columns: list[dict], structure: dict) -> dict | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("[gen] ANTHROPIC_API_KEY が未設定", file=sys.stderr)
        return None

    # システムプロンプトに構成パターンを追加
    system_prompt = SYSTEM_PROMPT_BASE + "\n\n" + structure["instruction"]

    # ユーザープロンプトに過去コラム情報を含める
    user_prompt = f"次のテーマでコラムを書いてください:\n\nテーマ: {theme_desc}\nタグ: {theme_tag}\n\n本文中には画像のMarkdownリンクを一切含めないこと。テキストのみで完結させてください。"

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
        "model": "claude-opus-4-7",
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
        theme_tag, theme_desc = THEMES[theme_index % len(THEMES)]
        picked_idx = theme_index % len(THEMES)
    else:
        picked_idx, theme_tag, theme_desc = pick_theme_smart(slot, date_str, past_columns)

    # 構成パターン選定
    structure = pick_structure_pattern(date_str, slot)

    print(f"[gen] テーマ[{picked_idx}]: [{theme_tag}] {theme_desc}")
    print(f"[gen] 構成パターン: {structure['name']}")
    print(f"[gen] コラムID: {col_id}")

    if dry_run:
        print("[gen] dry-run モード(APIは呼ばない)")
        print("[gen] --- 過去コラム(直近5本)---")
        for c in past_columns[:5]:
            print(f"  [{c.get('tag','')}] {c.get('title','')}")
        return True

    print("[gen] Claude APIでコラム生成中...")
    col_data = call_claude(theme_tag, theme_desc, past_columns, structure)
    if not col_data:
        print("[gen] コラム生成失敗", file=sys.stderr)
        return False

    # 念のため:本文内の画像Markdown(![...](...))を全て削除する保険処理
    body = col_data.get("body", "")
    img_md_pattern = re.compile(r'!\[[^\]]*\]\([^)]*\)\s*\n?')
    removed_images = len(img_md_pattern.findall(body))
    body = img_md_pattern.sub('', body)
    # 連続した空行を1つに整理
    body = re.sub(r'\n{3,}', '\n\n', body)

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
        for i, (tag, desc) in enumerate(THEMES):
            print(f"[{i:2d}] {tag}: {desc}")
        sys.exit(0)
    ok = run(dry_run=a.dry_run, theme_index=a.theme)
    sys.exit(0 if ok else 1)
