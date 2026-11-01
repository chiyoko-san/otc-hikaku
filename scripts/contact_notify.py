#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
contact_notify.py — /contact/ のフォームに新しい問い合わせが来たら GitHub の Issue で知らせる

なぜ: フォームの送信は Supabase の contact_messages に保存されるだけで、通知が無かった。
     Issue に @chiyoko-san を書くと、GitHub からメールが届く（GitHub の通知設定でメールが有効なら）。

プライバシー: Issue には件数・種別・受付日時だけを書く。名前・メールアドレス・本文は書かない
             （リポジトリが公開でも個人情報が出ないように）。本文は Supabase で読む。

既に知らせた問い合わせは、ラベル contact の Issue 本文に埋めた <!-- contact-ids: ... --> で覚えておく
（データベース側に列を足さなくて済む）。

使い方（GitHub Actions から）:
  python scripts/contact_notify.py   # 新着があれば new_contacts.md を書き出す（ワークフローがIssueにする）
環境変数: SUPABASE_URL, SUPABASE_SERVICE_KEY（読み取りに必要。anon キーでは読めない）, NOTIFIED_IDS（既知のid。カンマ区切り）
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))
TYPE_LABEL = {
    "feedback": "ご意見・ご要望",
    "correction": "掲載情報の訂正依頼",
    "takedown": "掲載削除の依頼",
    "business": "取材・業務連絡",
    "other": "その他",
}


def main() -> int:
    url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or ""
    if not url or not key:
        print("ERROR: SUPABASE_URL と SUPABASE_SERVICE_KEY が必要です", file=sys.stderr)
        return 1
    known = {s.strip() for s in (os.environ.get("NOTIFIED_IDS") or "").split(",") if s.strip()}

    q = urllib.parse.urlencode({"select": "*", "order": "id.asc", "limit": 1000})
    req = urllib.request.Request(f"{url}/rest/v1/contact_messages?{q}",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        rows = json.loads(r.read().decode("utf-8"))

    new = [row for row in rows if str(row.get("id")) not in known]
    print(f"[contact] 全{len(rows)}件、うち未通知 {len(new)}件")
    if not new:
        return 0

    ref = url.split("//", 1)[-1].split(".", 1)[0]
    editor = f"https://supabase.com/dashboard/project/{ref}/editor"
    lines = [
        f"@chiyoko-san お問い合わせフォームに新しい問い合わせが **{len(new)}件** あります。",
        "",
        "| 受付日時 | 種別 |",
        "| --- | --- |",
    ]
    for row in new:
        ts = row.get("created_at") or ""
        try:
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(JST).strftime("%Y-%m-%d %H:%M")
        except ValueError:
            pass
        lines.append(f"| {ts or '（日時なし）'} | {TYPE_LABEL.get(row.get('type') or '', row.get('type') or 'その他')} |")
    lines += [
        "",
        f"本文とメールアドレスは Supabase で確認してください: {editor} → テーブル `contact_messages`",
        "",
        "返信したら、この Issue を Close してください（閉じても通知済みの記録は残ります）。",
        "",
        "<!-- contact-ids: " + ",".join(str(row.get("id")) for row in new) + " -->",
    ]
    with open("new_contacts.md", "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    has_correction = any(row.get("type") in ("correction", "takedown") for row in new)
    with open("new_contacts_title.txt", "w", encoding="utf-8") as f:
        f.write(f"{'【訂正・削除依頼あり】' if has_correction else ''}お問い合わせ {len(new)}件（{datetime.now(JST).strftime('%m/%d %H:%M')}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
