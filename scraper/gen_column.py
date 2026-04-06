#!/usr/bin/env python3
"""
Claude APIで市販薬コラムを自動生成 → Supabase に直接保存

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

# ── テーマプール ─────────────────────────────────────────
THEMES = [
    ("安全情報", "市販薬の飲み合わせ危険ランキング。サプリ・他薬との相互作用"),
    ("安全情報", "妊娠中・授乳中に使える市販薬・使えない市販薬の見分け方"),
    ("安全情報", "子ども（12歳未満）に与えてはいけない市販薬成分"),
    ("安全情報", "市販薬の過量服用リスク。アセトアミノフェンの肝障害"),
    ("安全情報", "高齢者が注意すべき市販薬。腎機能・認知機能への影響"),
    ("安全情報", "運転前に飲んではいけない市販薬成分一覧"),
    ("安全情報", "市販薬と食品の組み合わせ注意。グレープフルーツ・アルコール"),
    ("基礎知識", "ジェネリック医薬品と先発薬の違い。OTCでの選び方"),
    ("基礎知識", "第1類・第2類・第3類の違いと薬剤師に相談すべきケース"),
    ("基礎知識", "市販薬の使用期限。開封後と未開封での違い"),
    ("基礎知識", "解熱鎮痛薬の選び方。アセトアミノフェン・イブプロフェン・ロキソプロフェン比較"),
    ("基礎知識", "抗ヒスタミン薬の第1世代・第2世代の違いと選び方"),
    ("花粉症",   "花粉症薬の正しい飲み始めタイミング。シーズン前から始める理由"),
    ("花粉症",   "点鼻薬・点眼薬・飲み薬の使い分け。花粉症治療の組み合わせ方"),
    ("かぜ薬",   "風邪の症状に合った市販薬の選び方。のど・鼻・熱それぞれの対処"),
    ("かぜ薬",   "総合感冒薬は本当に必要か？症状に応じた単剤選択という考え方"),
    ("胃腸",     "胃薬の選び方。制酸薬・H2ブロッカー・PPIの違いと使い分け"),
    ("胃腸",     "下痢止めを飲むべきケース・飲まないほうがいいケース"),
    ("美容・スキンケア", "シミ・肝斑に効く市販薬成分。トラネキサム酸・ビタミンCの違い"),
    ("育毛",     "ミノキシジル配合育毛剤の正しい使い方と期待できる効果"),
    ("漢方",     "葛根湯は万能薬？漢方薬を正しく使うための「証」の考え方"),
    ("漢方",     "防風通聖散・大柴胡湯・防己黄耆湯。肥満に用いる漢方薬の違い"),
    ("安全情報", "2024年最新：景品表示法改正で変わった健康食品広告のルール"),
    ("基礎知識", "機能性表示食品と医薬品の違い。パッケージの見分け方"),
    ("安全情報", "定期購入トラブル急増。健康食品・サプリの契約に潜む罠"),
]

# ── システムプロンプト ──────────────────────────────────
SYSTEM_PROMPT = """あなたは薬剤師・医療ライターです。
市販薬（OTC医薬品）の正しい選び方・安全な使い方について、消費者向けにわかりやすいコラムを書いてください。

## 制約
- 根拠は厚生労働省・消費者庁・PMDAの公開情報に基づく
- 医療行為や診断の代替にならないことを明記する
- Markdownで記述する（## 見出し、**太字**、- リスト、> 引用、::: tip/warn/danger 吹き出し）
- 本文は3000〜4000文字程度（日本語）
- 最後に「出典：」を記載する
- 一人称は使わない

## 画像プロンプトの挿入ルール（重要）
本文中に画像を入れるべき箇所（見出しの直後・重要な説明の後）に、以下の形式で画像プロンプトを挿入すること。
実際の画像URLは後から差し替えるので、プレースホルダとして挿入する。

形式：
![画像の説明文](IMAGE_PROMPT: Midjourney/Firefly用英語プロンプト。flat vector illustration, no text, no dates, 16:9)

例：
![第1類医薬品の説明図](IMAGE_PROMPT: Flat vector illustration of a pharmacist behind a counter handing medicine to a customer. Teal and navy color palette, no text, no dates, no faces. 16:9 ratio.)

## 吹き出し記法（必ず2〜3個使うこと）
::: tip タイトル
内容
:::

::: warn タイトル
内容
:::

## 出力フォーマット（JSONのみ・余分なテキスト不要）
{
  "title": "記事タイトル（60文字以内）",
  "tag": "タグ",
  "summary": "サマリー（100文字以内）",
  "body": "本文（Markdown形式、3000〜4000文字）"
}"""

# ─────────────────────────────────────────────────────────

def call_claude(theme_tag: str, theme_desc: str, context: str = "") -> dict | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("[gen] ANTHROPIC_API_KEY が未設定", file=sys.stderr)
        return None

    user_prompt = f"次のテーマでコラムを書いてください：\n\nテーマ: {theme_desc}\nタグ: {theme_tag}"
    if context:
        user_prompt += f"\n\n参考データ（関連OTC商品）:\n{context}"

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
                print(f"[gen] ID重複: {col['id']} → スキップ")
                return False
    except Exception as e:
        print(f"[gen] 重複チェックエラー: {e}", file=sys.stderr)

    # 保存（status='draft' で保存 → 管理画面で確認後に公開）
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
        print("[gen] dry-run モード（APIは呼ばない）")
        return True

    context  = get_medicines_context(theme_tag)
    print("[gen] Claude APIでコラム生成中...")
    col_data = call_claude(theme_tag, theme_desc, context)

    if not col_data:
        print("[gen] コラム生成失敗", file=sys.stderr)
        return False

    col = {
        "id":      col_id,
        "title":   col_data.get("title", theme_desc[:60]),
        "date":    date_str,
        "tag":     col_data.get("tag", theme_tag),
        "summary": col_data.get("summary", "")[:200],
        "body":    col_data.get("body", ""),
    }

    print(f"[gen] タイトル: {col['title']}")
    print(f"[gen] 文字数: {len(col['body'])} 文字")

    # IMAGE_PROMPT の数を表示
    img_count = col["body"].count("IMAGE_PROMPT:")
    print(f"[gen] 画像プロンプト: {img_count} 箇所")

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
