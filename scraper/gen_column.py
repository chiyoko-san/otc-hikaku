#!/usr/bin/env python3
"""
Claude APIで市販薬・健康食品の消費者保護コラムを自動生成 → Supabase に直接保存
環境変数:
  ANTHROPIC_API_KEY : Claude APIキー
  SUPABASE_URL      : https://xxxx.supabase.co
  SUPABASE_KEY      : anon public キー
"""
import json, re, sys, os, argparse, urllib.request, urllib.error
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
# ── システムプロンプト(消費者保護路線)─────────────
SYSTEM_PROMPT = """あなたは消費者問題に詳しい医療・法律ライターです。
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
本文中に画像を入れるべき箇所(見出しの直後・重要な説明の後)に、以下の形式で画像を挿入すること。
画像URLは {IMAGE_BASE_URL}/1.png, /2.png ... の連番で挿入する。
{IMAGE_BASE_URL} はシステムが自動で置換するプレースホルダなのでそのまま記述すること。

形式:
![画像の説明文]({IMAGE_BASE_URL}/1.png)

例:
![景表法違反の広告例イメージ]({IMAGE_BASE_URL}/1.png)
![定期購入の契約画面イメージ]({IMAGE_BASE_URL}/2.png)
![消費者ホットライン188のイメージ]({IMAGE_BASE_URL}/3.png)

画像は本文中に3〜5枚挿入すること。番号は1から順番に振ること。
画像は警告・契約・スマホ・書類・チェックリスト・天秤・盾等の象徴を意識し、
特定の商品・企業を連想させる描写は避けること。

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
def call_claude(theme_tag: str, theme_desc: str, context: str = "") -> dict | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("[gen] ANTHROPIC_API_KEY が未設定", file=sys.stderr)
        return None
    user_prompt = f"次のテーマでコラムを書いてください:\n\nテーマ: {theme_desc}\nタグ: {theme_tag}\n\n画像URLベース: {{IMAGE_BASE_URL}}\n(本文中の画像はすべて {{IMAGE_BASE_URL}}/1.png, /2.png ... の形式で挿入してください)"
    if context:
        user_prompt += f"\n\n参考データ(関連OTC商品):\n{context}"
    payload = json.dumps({
        "model": "claude-opus-4-5-20251101",
        "max_tokens": 6000,
        "system": SYSTEM_PROMPT,
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
        with urllib.request.urlopen(req, timeout=120) as r:
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
def get_medicines_context(tag: str) -> str:
    """消費者保護系コラムでは、参考データはあまり使わない(汎用テーマが多いため)"""
    # 消費者保護トピックは特定の医薬品カテゴリに紐づかないため、空を返す
    return ""
def pick_theme(slot: int, date_str: str) -> tuple[str, str]:
    import hashlib
    seed = int(hashlib.md5(f"{date_str}-{slot}".encode()).hexdigest(), 16)
    return THEMES[seed % len(THEMES)]
def run(dry_run=False, theme_index=None):
    today    = datetime.now(JST)
    date_str = today.strftime("%Y-%m-%d")
    slot     = 0 if today.hour < 15 else 1
    col_id   = f"auto_{today.strftime('%Y%m%d')}_{slot}"
    if theme_index is not None:
        theme_tag, theme_desc = THEMES[theme_index % len(THEMES)]
    else:
        theme_tag, theme_desc = pick_theme(slot, date_str)
    print(f"[gen] テーマ: [{theme_tag}] {theme_desc}")
    print(f"[gen] コラムID: {col_id}")
    if dry_run:
        print("[gen] dry-run モード(APIは呼ばない)")
        return True
    context  = get_medicines_context(theme_tag)
    print("[gen] Claude APIでコラム生成中...")
    col_data = call_claude(theme_tag, theme_desc, context)
    if not col_data:
        print("[gen] コラム生成失敗", file=sys.stderr)
        return False
    # IMAGE_BASE_URL を実際のSupabase StorageのURLに置換
    sb_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    date_folder = today.strftime("%Y%m%d")
    image_base_url = f"https://glxhggfxxwpfmwqoulyy.supabase.co/storage/v1/object/public/column-images/{date_folder}"
    body = col_data.get("body", "")
    body = body.replace("{IMAGE_BASE_URL}", image_base_url)
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
    print(f"[gen] 画像ベースURL: {image_base_url}")
    # 画像URLの数を確認
    img_count = col["body"].count(image_base_url)
    print(f"[gen] 画像挿入: {img_count} 箇所")
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
