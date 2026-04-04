#!/bin/bash
# Vercel ビルドスクリプト
# Vercel の環境変数を index.html の metaタグに埋め込む

set -e

echo "[build] index.html に環境変数を埋め込み中..."

# 環境変数が設定されているか確認
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
  echo "⚠ NEXT_PUBLIC_SUPABASE_URL が未設定です"
  exit 1
fi
if [ -z "$NEXT_PUBLIC_SUPABASE_KEY" ]; then
  echo "⚠ NEXT_PUBLIC_SUPABASE_KEY が未設定です"
  exit 1
fi

# metaタグのプレースホルダを実際の値に置換
sed -i \
  -e "s|__SUPABASE_URL__|${NEXT_PUBLIC_SUPABASE_URL}|g" \
  -e "s|__SUPABASE_KEY__|${NEXT_PUBLIC_SUPABASE_KEY}|g" \
  index.html

echo "[build] 完了"
