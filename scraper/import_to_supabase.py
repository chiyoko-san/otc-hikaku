#!/usr/bin/env python3
"""
medicines.json → Supabase にインポートするスクリプト
columns（コラム）も同時にインポート

使い方:
  pip install supabase
  python import_to_supabase.py

環境変数（.envファイルか直接書き換え）:
  SUPABASE_URL=https://glxhggfxxwpfmwqoulyy.supabase.co
  SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdseGhnZ2Z4eHdwZm13cW91bHl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODY4NDMsImV4cCI6MjA5MDg2Mjg0M30.djy6MZQz28_U7exsEjLq3PeLJTw2QuSSeVhrCNkF894
"""
import json, os, sys, time
from pathlib import Path

# ── 設定（ここを書き換えてください） ──────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://glxhggfxxwpfmwqoulyy.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdseGhnZ2Z4eHdwZm13cW91bHl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODY4NDMsImV4cCI6MjA5MDg2Mjg0M30.djy6MZQz28_U7exsEjLq3PeLJTw2QuSSeVhrCNkF894")
MEDICINES_JSON = Path(__file__).parent / "medicines.json"
BATCH_SIZE = 200  # 1回に送るレコード数
# ────────────────────────────────────────────────────

def get_client():
    try:
        from supabase import create_client
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    except ImportError:
        print("❌ supabaseライブラリが見つかりません")
        print("   pip install supabase  を実行してください")
        sys.exit(1)

def clean_medicine(m):
    """medicines.jsonの1件をSupabaseのカラム形式に変換"""
    return {
        "id":          m.get("id"),
        "cat":         m.get("cat", "vitamin"),
        "itype":       m.get("itype", "otc"),
        "name":        (m.get("name") or "")[:200],
        "maker":       (m.get("maker") or "")[:100],
        "price":       m.get("price"),
        "risk":        m.get("risk"),
        "drowsy":      bool(m.get("drowsy", False)),
        "symptoms":    m.get("symptoms") or [],
        "effect":      (m.get("effect") or "")[:500],
        "ings":        m.get("ings") or [],
        "warn_ings":   m.get("warnIngs") or [],
        "note":        (m.get("note") or "")[:500],
        "note_type":   m.get("noteType", "nn"),
        "asin":        m.get("asin", ""),
        "rakuten_url": m.get("rakuten_url", ""),
    }

def import_medicines(client):
    print("─── medicines インポート開始 ───")
    data = json.loads(MEDICINES_JSON.read_text(encoding="utf-8"))
    meds = data.get("medicines", [])
    total = len(meds)
    print(f"対象: {total}件")

    # 既存データを削除（再インポート対応）
    ans = input("既存データを削除してから入れ直しますか？ [y/N]: ").strip().lower()
    if ans == "y":
        print("既存データを削除中...")
        client.table("medicines").delete().neq("id", 0).execute()
        print("✅ 削除完了")

    success = 0
    errors = 0
    for i in range(0, total, BATCH_SIZE):
        batch = meds[i:i+BATCH_SIZE]
        rows  = [clean_medicine(m) for m in batch if m.get("id") and m.get("name")]
        try:
            client.table("medicines").upsert(rows).execute()
            success += len(rows)
            pct = success / total * 100
            print(f"  進捗: {success}/{total}件 ({pct:.0f}%)", end="\r")
        except Exception as e:
            errors += len(rows)
            print(f"\n  ⚠ バッチエラー [{i}〜{i+BATCH_SIZE}]: {e}")
        time.sleep(0.1)  # レートリミット対策

    print(f"\n✅ medicines完了: 成功{success}件 / エラー{errors}件")

def import_columns(client):
    print("\n─── columns インポート開始 ───")
    # build.pyからCOLUMNS定義を読み込む
    build_py = Path(__file__).parent / "build.py"
    if not build_py.exists():
        print("⚠ build.py が見つかりません。columnsはスキップします。")
        return

    import re
    content = build_py.read_text(encoding="utf-8")
    # COLUMNS = [ ... ] を抽出
    m = re.search(r'COLUMNS\s*=\s*\[([\s\S]+?)\]\s*\n\n', content)
    if not m:
        print("⚠ COLUMNS定義が見つかりません。columnsはスキップします。")
        return

    # Pythonのdict形式をevalで読み込む
    try:
        cols_raw = eval("[" + m.group(1) + "]")
    except Exception as e:
        print(f"⚠ COLUMNS解析エラー: {e}")
        return

    rows = []
    for col in cols_raw:
        rows.append({
            "id":         col.get("id", ""),
            "title":      (col.get("title") or "")[:200],
            "date":       col.get("date"),
            "tag":        col.get("tag", ""),
            "summary":    (col.get("summary") or "")[:500],
            "body":       col.get("body", ""),
            "thumb":      col.get("thumb"),
            "status":     col.get("status", "published"),
            "publish_at": col.get("publishAt"),
        })

    if not rows:
        print("⚠ コラムデータが0件です。")
        return

    try:
        client.table("columns").upsert(rows).execute()
        print(f"✅ columns完了: {len(rows)}件")
    except Exception as e:
        print(f"❌ columnsエラー: {e}")

def verify(client):
    print("\n─── 確認 ───")
    med_count = client.table("medicines").select("id", count="exact").execute()
    col_count  = client.table("columns").select("id",  count="exact").execute()
    print(f"medicines テーブル: {med_count.count}件")
    print(f"columns   テーブル: {col_count.count}件")

if __name__ == "__main__":
    if "xxxxxxxxxxxx" in SUPABASE_URL or "xxxxxxxxxxxx" in SUPABASE_KEY:
        print("❌ SUPABASE_URL と SUPABASE_KEY を設定してください")
        print("   スクリプト先頭の定数を書き換えるか、環境変数で指定してください")
        print("   例: SUPABASE_URL=https://xxxx.supabase.co python import_to_supabase.py")
        sys.exit(1)

    client = get_client()
    import_medicines(client)
    import_columns(client)
    verify(client)
    print("\n🎉 インポート完了！")
