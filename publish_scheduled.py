"""
publish_scheduled.py
期日が到来した予約公開コラムを自動でpublishedに更新するスクリプト
GitHub Actions から毎時実行される
"""
import os
import requests
from datetime import datetime, timezone

SB_URL = os.environ["SB_URL"]
SB_KEY = os.environ["SB_KEY"]

HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

def main():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M")
    print(f"実行時刻（UTC）: {now}")

    # 予約公開でpublish_atが現在時刻以前のものを取得
    res = requests.get(
        f"{SB_URL}/rest/v1/columns"
        f"?status=eq.scheduled"
        f"&publish_at=lte.{now}"
        f"&select=id,title,publish_at",
        headers=HEADERS,
    )
    res.raise_for_status()
    targets = res.json()

    if not targets:
        print("公開対象の予約コラムはありません")
        return

    for col in targets:
        patch = requests.patch(
            f"{SB_URL}/rest/v1/columns?id=eq.{col['id']}",
            json={"status": "published"},
            headers=HEADERS,
        )
        if patch.ok:
            print(f"✅ 公開しました: [{col['id']}] {col['title']} (予約: {col['publish_at']})")
        else:
            print(f"❌ 失敗: [{col['id']}] {col['title']} → {patch.status_code} {patch.text}")

if __name__ == "__main__":
    main()
