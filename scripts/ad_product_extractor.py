#!/usr/bin/env python3
"""
ad_product_extractor.py
--------------------------------
広告商品のLP URLから購入条件を構造化抽出する。
Claude APIで解析し、Supabaseに保存する。

使い方:
    # 新規追加
    python ad_product_extractor.py --url https://example.com/lp --id adp_001

    # 既存商品の再チェック(価格変動など)
    python ad_product_extractor.py --refresh-all

    # 特定IDのみ更新
    python ad_product_extractor.py --id adp_001 --refresh
"""

import os
import sys
import json
import argparse
from datetime import datetime, timezone
import requests
from anthropic import Anthropic
from supabase import create_client, Client

# --- 環境変数 ---
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

anthropic = Anthropic(api_key=ANTHROPIC_API_KEY)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

MODEL = "claude-opus-4-7"  # または claude-sonnet-4-6


# --- LP取得 ---
def fetch_lp(url: str) -> str:
    """LPのHTMLを取得してテキストのみ抽出"""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; KusuriCompassBot/1.0; "
            "+https://kusuri-compass.com/bot)"
        )
    }
    r = requests.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    return r.text


# --- Claude API で構造化抽出 ---
EXTRACT_PROMPT = """以下は広告商品のランディングページ(LP)のHTMLです。
購入条件を正確に抽出してください。推測はせず、LPに明記されていない項目は null としてください。

抽出してほしい項目:
- name: 商品名
- maker: 販売元・製造元
- classification: 医薬品 / 医薬部外品 / 機能性表示食品 / 栄養機能食品 / 健康食品 のいずれか
- category: diet(ダイエット) / hair(育毛) / joint(関節) / sleep(睡眠) / eye(目) / beauty(美容) / other
- first_price: 初回価格(税込・円、整数)
- first_price_note: 初回価格に関する注記(「初回限定」など)
- regular_price: 2回目以降の価格(税込・円、整数)
- regular_price_note: 通常価格の注記
- retail_price: 通常単品価格
- is_subscription: 定期購入か(true/false)
- bind_count: 最低継続回数(縛りなしなら0)
- total_until_cancel: 解約可能になるまでの総支払額(円)。例: 初回500円+2〜4回目6800円なら 500+6800*3=20900
- cancel_methods: 配列。電話なら"phone"、Webなら"web"、フォームなら"form"、メールなら"mail"
- cancel_deadline_days: 次回発送の何日前までに連絡が必要か
- cancel_hours: 解約受付時間(文字列そのまま)
- cancel_notes: 解約条件の補足を簡潔に
- main_ingredients: 主要成分の配列。各要素は {name, amount, unit}

重要:
- 事実のみ抽出。推測や「おそらく」は禁止。不明は null。
- 数値は単位を統一(価格は円、期間は日数)。
- 全角数字は半角に変換。

出力は以下のJSON形式のみ(前置き・解説・コードブロック不要):

{
  "name": "...",
  "maker": "...",
  ...
}

HTML:
---
"""


def extract_product_info(html: str) -> dict:
    """Claude APIでLP HTMLから商品情報を抽出"""
    # 長すぎると困るのでテキスト部分のみ抽出(簡易)
    # 本番ではBeautifulSoupで <script> <style> を除去した方が良い
    trimmed = html[:80000]

    msg = anthropic.messages.create(
        model=MODEL,
        max_tokens=2000,
        messages=[{"role": "user", "content": EXTRACT_PROMPT + trimmed}],
    )
    text = msg.content[0].text.strip()

    # JSONコードブロックで囲まれてる場合の処理
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    return json.loads(text)


# --- Supabase 操作 ---
def upsert_product(product_id: str, data: dict, source_url: str):
    """商品データをSupabaseにupsertし、変更があれば履歴も記録"""
    # 既存レコード取得
    existing = (
        supabase.table("ad_products")
        .select("*")
        .eq("id", product_id)
        .execute()
        .data
    )

    record = {
        "id": product_id,
        "source_url": source_url,
        "lp_url": source_url,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        **{k: v for k, v in data.items() if v is not None},
    }

    if existing:
        # 変更履歴を記録
        old = existing[0]
        tracked_fields = [
            "first_price", "regular_price", "bind_count",
            "total_until_cancel", "cancel_deadline_days",
        ]
        for f in tracked_fields:
            if f in record and str(old.get(f)) != str(record.get(f)):
                supabase.table("ad_product_history").insert({
                    "product_id": product_id,
                    "field_name": f,
                    "old_value": str(old.get(f)),
                    "new_value": str(record.get(f)),
                }).execute()
                print(f"  [履歴] {f}: {old.get(f)} → {record.get(f)}")

        supabase.table("ad_products").update(record).eq("id", product_id).execute()
        print(f"✓ 更新: {product_id} ({data.get('name')})")
    else:
        supabase.table("ad_products").insert(record).execute()
        print(f"✓ 新規: {product_id} ({data.get('name')})")


# --- メイン処理 ---
def process_url(url: str, product_id: str):
    print(f"処理中: {product_id} - {url}")
    html = fetch_lp(url)
    data = extract_product_info(html)
    upsert_product(product_id, data, url)


def refresh_all():
    """公開中の全商品のLPを再取得して価格変動をチェック"""
    rows = (
        supabase.table("ad_products")
        .select("id, lp_url")
        .not_.is_("lp_url", "null")
        .execute()
        .data
    )
    for row in rows:
        try:
            process_url(row["lp_url"], row["id"])
        except Exception as e:
            print(f"✗ 失敗 {row['id']}: {e}", file=sys.stderr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", help="LPのURL")
    parser.add_argument("--id", help="商品ID (例: adp_001)")
    parser.add_argument("--refresh", action="store_true", help="既存商品を再取得")
    parser.add_argument("--refresh-all", action="store_true", help="全商品を再取得")
    args = parser.parse_args()

    if args.refresh_all:
        refresh_all()
    elif args.id and args.refresh:
        row = supabase.table("ad_products").select("lp_url").eq("id", args.id).execute().data
        if row:
            process_url(row[0]["lp_url"], args.id)
    elif args.url and args.id:
        process_url(args.url, args.id)
    else:
        parser.print_help()
        sys.exit(1)
