#!/usr/bin/env python3
"""
healthcheck.py — サイトの「止まっていないか」を毎朝1回まとめて確認する

確認する項目（どれか1つでも落ちたら終了コード1。結果は healthcheck.md に書く）:
  1. Anthropic API の残高   … 最小のリクエストを1回送り、400(credit) なら「残高切れ」
  2. Supabase の応答        … columns を1件だけ読む
  3. コラムの鮮度          … 公開済みコラムの最新 date が N 日以内か（既定 3日）
  4. サイトの応答          … /columns/ と /otc-similar/photo/ が 200 で返るか

環境変数:
  ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY（anon で可）
  HEALTH_MAX_AGE_DAYS（既定 3）, SITE_URL（既定 https://www.kusuri-compass.com）

使い方:
  python scraper/healthcheck.py            # 結果を表示し、healthcheck.md に書く
"""
from __future__ import annotations
import os, sys, json, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta, date

JST = timezone(timedelta(hours=9))
SITE_URL = os.environ.get("SITE_URL", "https://www.kusuri-compass.com").rstrip("/")
MAX_AGE = int(os.environ.get("HEALTH_MAX_AGE_DAYS", "3"))
OUT = "healthcheck.md"


def http(url: str, method: str = "GET", headers: dict | None = None, body: bytes | None = None, timeout: int = 30):
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # DNS・タイムアウトなど
        return 0, f"{type(e).__name__}: {e}"


def check_anthropic() -> tuple[bool, str]:
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        return False, "ANTHROPIC_API_KEY が Secrets にない"
    body = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "ping"}],
    }).encode()
    status, text = http(
        "https://api.anthropic.com/v1/messages", "POST",
        {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        body,
    )
    if status == 200:
        return True, "残高あり（応答200）"
    if status == 400 and "credit" in text.lower():
        return False, "残高切れ。Anthropic Console → Plans & Billing でクレジット購入"
    if status == 401:
        return False, "APIキーが無効（401）。Secrets の ANTHROPIC_API_KEY を確認"
    return False, f"想定外の応答 {status}: {text[:200]}"


def check_supabase() -> tuple[bool, str, str | None]:
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_KEY", "").strip() or os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        return False, "SUPABASE_URL / SUPABASE_KEY が Secrets にない", None
    status, text = http(
        f"{url}/rest/v1/columns?select=date&status=eq.published&order=date.desc&limit=1",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    if status == 402:
        return False, "Supabase が制限状態（402）。転送量超過か支払い。Dashboard を確認", None
    if status != 200:
        return False, f"Supabase 応答 {status}: {text[:200]}", None
    try:
        rows = json.loads(text)
        latest = rows[0]["date"] if rows else None
    except Exception:
        latest = None
    return True, "応答200", latest


def check_freshness(latest: str | None) -> tuple[bool, str]:
    if not latest:
        return False, "公開済みコラムの日付が取れない"
    try:
        d = date.fromisoformat(latest[:10])
    except Exception:
        return False, f"date の形式が読めない: {latest}"
    age = (datetime.now(JST).date() - d).days
    if age > MAX_AGE:
        return False, f"最新コラムが {latest}（{age}日前）。生成か公開が止まっている可能性。Actions の Auto Generate Column / Publish Drafts を確認"
    return True, f"最新 {latest}（{age}日前）"


def check_site(path: str) -> tuple[bool, str]:
    status, text = http(f"{SITE_URL}{path}", headers={"User-Agent": "kusuri-compass-healthcheck"})
    if status == 200:
        return True, "200"
    return False, f"{path} が {status}。Vercel の Deployments を確認"


def main() -> int:
    results: list[tuple[str, bool, str]] = []

    ok, msg = check_anthropic();            results.append(("Anthropic API 残高", ok, msg))
    ok, msg, latest = check_supabase();     results.append(("Supabase 応答", ok, msg))
    if ok:
        ok2, msg2 = check_freshness(latest); results.append(("コラムの鮮度", ok2, msg2))
    for p in ("/columns/", "/otc-similar/photo/"):
        ok, msg = check_site(p);            results.append((f"サイト {p}", ok, msg))

    all_ok = all(r[1] for r in results)
    now = datetime.now(JST).strftime("%Y-%m-%d %H:%M")
    lines = [f"確認時刻: {now} JST", ""]
    for name, ok, msg in results:
        lines.append(f"- {'✅' if ok else '❌'} **{name}**: {msg}")
    lines.append("")
    lines.append("検査ロジック: `scraper/healthcheck.py`")
    text = "\n".join(lines)
    print(text)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text + "\n")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
