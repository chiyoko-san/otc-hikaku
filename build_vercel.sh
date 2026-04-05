#!/bin/bash
set -e

echo "[build] index.html に環境変数を埋め込み中..."

if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
  echo "⚠ NEXT_PUBLIC_SUPABASE_URL が未設定です"
  exit 1
fi
if [ -z "$NEXT_PUBLIC_SUPABASE_KEY" ]; then
  echo "⚠ NEXT_PUBLIC_SUPABASE_KEY が未設定です"
  exit 1
fi

# Python で確実に置換（sed はエスケープ問題が起きやすいため）
python3 - << PYEOF
import os, re

url = os.environ['NEXT_PUBLIC_SUPABASE_URL'].strip()
key = os.environ['NEXT_PUBLIC_SUPABASE_KEY'].strip()

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('__SUPABASE_URL__', url)
html = html.replace('__SUPABASE_KEY__', key)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print(f"[build] URL埋め込み完了: {url[:40]}...")
print(f"[build] KEY埋め込み完了: {key[:20]}...")
PYEOF

echo "[build] 完了"
