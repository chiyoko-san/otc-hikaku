#!/usr/bin/env python3
"""
Claude APIで市販薬コラムを自動生成 → Supabase に直接保存

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

## 制約
- 根拠は厚生労働省・消費者庁・PMDAの公開情報に基づく
- 医療行為や診断の代替にならないことを明記する
- 本文は3000〜4000文字程度（日本語）
- 最後に「出典：」を記載する
- 一人称は使わない

## 記法（厳守）
本文は **純粋なMarkdownのみ** で書くこと。
使ってよい記法は次のものだけ：
  ## 見出し / ### 小見出し / **太字** / - 箇条書き / 1. 番号リスト
  | 表 | 形式 | / > 引用 / 吹き出し（下記 ::: 記法）

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

def call_claude(theme_tag: str, theme_desc: str, context: str = "",
                with_images: bool = False, model: str = "claude-opus-4-5-20251101") -> dict | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("[gen] ANTHROPIC_API_KEY が未設定", file=sys.stderr)
        return None

    user_prompt = (
        f"次のテーマでコラムを書いてください：\n\n"
        f"テーマ: {theme_desc}\nタグ: {theme_tag}\n"
    )
    if with_images:
        user_prompt += (
            "\n画像URLベース: {IMAGE_BASE_URL}\n"
            "（本文中の画像はすべて {IMAGE_BASE_URL}/1.png, /2.png ... の形式で挿入してください）\n"
        )
    user_prompt += "\nHTMLタグは一切使わず、Markdownと ::: 吹き出し記法だけで書いてください。"
    if context:
        user_prompt += f"\n\n参考データ（関連OTC商品）:\n{context}"

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


def save_to_supabase(col: dict) -> bool:
    sb_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    sb_key = os.environ.get("SUPABASE_KEY", "")
    if not sb_url or not sb_key:
        print("[gen] SUPABASE_URL / SUPABASE_KEY が未設定", file=sys.stderr)
        return False

    check_url = f"{sb_url}/rest/v1/columns?id=eq.{col['id']}&select=id"
    req_check = urllib.request.Request(
        check_url,
        headers={"apikey": sb_key, "Authorization": f"Bearer {sb_key}"},
        method="GET"
    )
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


def pick_theme(slot: int, date_str: str) -> tuple[str, str]:
    import hashlib
    seed = int(hashlib.md5(f"{date_str}-{slot}".encode()).hexdigest(), 16)
    return THEMES[seed % len(THEMES)]


def run(dry_run=False, theme_index=None, with_images=False,
        preview=False, no_save=False):
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
    print(f"[gen] 画像モード: {'ON' if with_images else 'OFF'}")
    print(f"[gen] callout形式: {CALLOUT_STYLE}")

    if dry_run:
        print("[gen] dry-run モード（APIは呼ばない）")
        return True

    context  = get_medicines_context(theme_tag)
    print("[gen] Claude APIでコラム生成中...")
    col_data = call_claude(theme_tag, theme_desc, context, with_images=with_images)

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
        "title":   col_data.get("title", theme_desc[:60]),
        "date":    date_str,
        "tag":     col_data.get("tag", theme_tag),
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
    p.add_argument("--theme",       type=int, default=None)
    p.add_argument("--list",        action="store_true")
    p.add_argument("--with-images", action="store_true", help="本文に画像を挿入する")
    p.add_argument("--preview",     action="store_true", help="本文を標準出力に表示")
    p.add_argument("--no-save",     action="store_true", help="Supabaseに保存しない")
    a = p.parse_args()

    if a.list:
        for i, (tag, desc) in enumerate(THEMES):
            print(f"[{i:2d}] {tag}: {desc}")
        sys.exit(0)

    ok = run(dry_run=a.dry_run, theme_index=a.theme, with_images=a.with_images,
             preview=a.preview, no_save=a.no_save)
    sys.exit(0 if ok else 1)
