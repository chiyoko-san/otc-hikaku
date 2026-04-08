#!/usr/bin/env python3
"""
コラム本文からIMAGE_PROMPTを抽出 → Gemini Imagen APIで画像生成
→ Supabase Storageに自動アップロード → 本文のURLを書き換えて保存

使い方:
  python gen_images.py --col-id auto_20260407_1
  python gen_images.py --col-id auto_20260407_1 --dry-run  # 画像生成せずプロンプト確認のみ

環境変数:
  GEMINI_API_KEY   : Google AI Studio APIキー
  SUPABASE_URL     : https://xxxx.supabase.co
  SUPABASE_KEY     : anon public キー
"""
import os, sys, json, re, argparse, urllib.request, urllib.error, base64
from datetime import datetime, timezone, timedelta
from pathlib import Path

JST = timezone(timedelta(hours=9))

# ── Supabase ──────────────────────────────────────────────

def sb_fetch(path, method="GET", body=None, extra_headers=None):
    sb_url = os.environ["SUPABASE_URL"].rstrip("/")
    sb_key = os.environ["SUPABASE_KEY"]
    headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(
        f"{sb_url}/rest/v1/{path}",
        data=body.encode("utf-8") if body else None,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def get_col(col_id):
    rows = sb_fetch(f"columns?id=eq.{urllib.parse.quote(col_id)}&limit=1")
    return rows[0] if rows else None


def update_col_body(col_id, new_body):
    import urllib.parse
    sb_url = os.environ["SUPABASE_URL"].rstrip("/")
    sb_key = os.environ["SUPABASE_KEY"]
    payload = json.dumps({"body": new_body}).encode("utf-8")
    req = urllib.request.Request(
        f"{sb_url}/rest/v1/columns?id=eq.{urllib.parse.quote(col_id)}",
        data=payload,
        headers={
            "apikey": sb_key,
            "Authorization": f"Bearer {sb_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="PATCH",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status in (200, 204)


def upload_to_storage(image_bytes: bytes, storage_path: str) -> str:
    """Supabase Storageにアップロードしてpublic URLを返す"""
    sb_url = os.environ["SUPABASE_URL"].rstrip("/")
    sb_key = os.environ["SUPABASE_KEY"]
    bucket = "column-images"
    upload_url = f"{sb_url}/storage/v1/object/{bucket}/{storage_path}"
    req = urllib.request.Request(
        upload_url,
        data=image_bytes,
        headers={
            "apikey": sb_key,
            "Authorization": f"Bearer {sb_key}",
            "Content-Type": "image/png",
            "x-upsert": "true",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        pass
    # public URL
    project_ref = re.search(r"https://([^.]+)\.supabase\.co", sb_url).group(1)
    return f"https://{project_ref}.supabase.co/storage/v1/object/public/{bucket}/{storage_path}"


# ── Gemini Imagen ─────────────────────────────────────────

def generate_image(prompt: str) -> bytes:
    """Gemini Imagen 3でpngバイト列を返す"""
    api_key = os.environ["GEMINI_API_KEY"]
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"imagen-3.0-generate-002:predict?key={api_key}"
    )
    payload = json.dumps({
        "instances": [{"prompt": prompt}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": "16:9",
            "safetyFilterLevel": "block_only_high",
            "personGeneration": "dont_allow",
        },
    }).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            resp = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        raise RuntimeError(f"Gemini API error {e.code}: {body}")

    b64 = resp["predictions"][0]["bytesBase64Encoded"]
    return base64.b64decode(b64)


# ── プロンプト抽出 ────────────────────────────────────────

def extract_prompts(body: str) -> list[dict]:
    """
    ![説明](IMAGE_PROMPT: ...プロンプト...)
    または
    ![説明](https://...supabase.../column-images/...)
    を全て抽出する
    """
    pattern = r'!\[([^\]]*)\]\(([^)]+)\)'
    results = []
    for m in re.finditer(pattern, body):
        alt = m.group(1)
        url = m.group(2)
        if url.startswith("IMAGE_PROMPT:"):
            prompt_text = url[len("IMAGE_PROMPT:"):].strip()
            results.append({
                "alt": alt,
                "prompt": prompt_text,
                "original": m.group(0),
                "already_uploaded": False,
            })
        elif "supabase" in url and "column-images" in url:
            # URLが入っていても実ファイルが存在するか確認
            results.append({
                "alt": alt,
                "prompt": None,
                "original": m.group(0),
                "already_uploaded": False,  # HEADリクエストで確認
                "url": url,
                "existing_url": url,  # 既存URLは保持
            })
    return results


# ── メイン ───────────────────────────────────────────────

import urllib.parse

def run(col_id: str, dry_run: bool = False):
    print(f"[img] コラムID: {col_id}")

    col = get_col(col_id)
    if not col:
        print(f"[img] コラムが見つかりません: {col_id}", file=sys.stderr)
        return False

    print(f"[img] タイトル: {col['title']}")
    body = col.get("body", "")

    prompts = extract_prompts(body)
    total = len(prompts)
    # 実際にファイルが存在するか確認
    def file_exists(url):
        try:
            req = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status == 200
        except Exception:
            return False

    for p in prompts:
        if p.get("existing_url"):
            if file_exists(p["existing_url"]):
                p["already_uploaded"] = True
                print(f"[img]   既存ファイル確認済み: {p['existing_url'].split('/')[-1]}")
            else:
                p["already_uploaded"] = False
                print(f"[img]   ファイル未存在（再生成します）: {p['existing_url'].split('/')[-1]}")

    need_gen = [p for p in prompts if not p["already_uploaded"]]
    already = [p for p in prompts if p["already_uploaded"]]

    print(f"[img] 画像: {total}枚（生成必要: {len(need_gen)}枚 / 生成済み: {len(already)}枚）")

    if not need_gen:
        print("[img] 生成が必要な画像はありません")
        return True

    if dry_run:
        print("[img] ── dry-run: 以下のプロンプトを生成します ──")
        for i, p in enumerate(need_gen, 1):
            print(f"\n[{i}] alt: {p['alt']}")
            print(f"     prompt: {p['prompt'][:120]}...")
        return True

    # 日付フォルダをコラムIDから取得
    date_folder = re.search(r'auto_(\d{8})', col_id)
    date_folder = date_folder.group(1) if date_folder else datetime.now(JST).strftime("%Y%m%d")

    new_body = body
    success = 0

    for i, p in enumerate(need_gen, 1):
        print(f"\n[img] 生成中 {i}/{len(need_gen)}: {p['alt'][:40]}")

        # プロンプトがない場合（既存URLのみ）は汎用プロンプトで生成
        prompt = p.get("prompt") or (
            f"Flat vector illustration for a Japanese health information article. "
            f"Topic: {p['alt']}. Clean minimal design, teal and navy color palette, "
            f"no text, no dates, no faces. 16:9 ratio."
        )
        print(f"      prompt: {prompt[:80]}...")

        try:
            image_bytes = generate_image(prompt)
            print(f"      → 生成完了 ({len(image_bytes)//1024}KB)")
        except Exception as e:
            print(f"      → 生成失敗: {e}", file=sys.stderr)
            continue

        # 既存URLがあればそのパスを使う、なければ番号ベース
        if p.get("existing_url"):
            # https://.../column-images/20260408/1.png → 20260408/1.png
            storage_path = "/".join(p["existing_url"].split("/")[-2:])
        else:
            storage_path = f"{date_folder}/{i}.png"
        try:
            public_url = upload_to_storage(image_bytes, storage_path)
            print(f"      → アップロード完了: {public_url}")
        except Exception as e:
            print(f"      → アップロード失敗: {e}", file=sys.stderr)
            continue

        # 本文を更新（IMAGE_PROMPTまたは既存URLを新URLに置換）
        new_body = new_body.replace(
            p["original"],
            f'![{p["alt"]}]({public_url})',
            1
        )
        success += 1

    print(f"\n[img] 生成完了: {success}/{len(need_gen)}枚")

    if success > 0:
        print("[img] Supabaseの本文を更新中...")
        if update_col_body(col_id, new_body):
            print("[img] ✅ 本文のURLを更新しました")
        else:
            print("[img] ⚠️ 本文の更新に失敗しました", file=sys.stderr)

    return success == len(need_gen)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--col-id", required=True, help="コラムID（例: auto_20260407_1）")
    p.add_argument("--dry-run", action="store_true", help="プロンプト確認のみ（画像生成しない）")
    args = p.parse_args()

    for env in ["SUPABASE_URL", "SUPABASE_KEY"]:
        if not os.environ.get(env):
            print(f"[img] 環境変数 {env} が未設定", file=sys.stderr)
            sys.exit(1)
    if not args.dry_run and not os.environ.get("GEMINI_API_KEY"):
        print("[img] 環境変数 GEMINI_API_KEY が未設定", file=sys.stderr)
        sys.exit(1)

    ok = run(args.col_id, dry_run=args.dry_run)
    sys.exit(0 if ok else 1)
