#!/usr/bin/env python3
"""
healthcheck.py — サイトの「止まっていないか」を毎朝1回まとめて確認する

確認する項目（どれか1つでも落ちたら終了コード1。結果は healthcheck.md に書く）:
  1. Anthropic API の残高   … 最小のリクエストを1回送り、400(credit) なら「残高切れ」
  2. Supabase の応答        … columns を1件だけ読む
  3. コラムの鮮度          … 公開済みコラムの最新 date が N 日以内か（既定 5日。2026-10 から週2本＝火・金）
  4. サイトの応答          … トップ・条件で探す・薬ページ・切替・コラム・撮るだけ・サイトマップが 200 で返るか
  5. ユーザー数の急落      … GA4 の昨日のユーザー数が、その前7日の中央値の4割を切っていないか
                              （Google の Secrets が無ければ飛ばす。検索クリックは1日数回で揺れが大きいので見ない）
  6. 本番のビルド          … main の最新コミットで Vercel のデプロイが失敗していないか
  7. 成長エージェント      … 土曜の growth-agent が前回失敗していないか

環境変数:
  ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY（anon で可）
  GOOGLE_SERVICE_ACCOUNT_JSON, GA4_PROPERTY_ID（任意。5 に使う）
  GITHUB_TOKEN, GITHUB_REPOSITORY（任意。6・7 に使う）
  HEALTH_MAX_AGE_DAYS（既定 5）, SITE_URL（既定 https://www.kusuri-compass.com）

使い方:
  python scraper/healthcheck.py            # 結果を表示し、healthcheck.md に書く
"""
from __future__ import annotations
import os, sys, json, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta, date

JST = timezone(timedelta(hours=9))
SITE_URL = os.environ.get("SITE_URL", "https://www.kusuri-compass.com").rstrip("/")
MAX_AGE = int(os.environ.get("HEALTH_MAX_AGE_DAYS", "5"))
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


SITE_PATHS = (
    "/", "/sagasu/", "/sagasu/bien/nemuke-nashi/", "/medicines/index/", "/switch/allegra/",
    "/columns/", "/otc-similar/photo/", "/sitemap.xml",
)


def check_featured_medicine() -> tuple[bool, str] | None:
    """トップに出している薬ページの1件目が開くか（薬ページ全体が壊れていないかの代表）"""
    try:
        with open("data/agent/featured.json", encoding="utf-8") as f:
            slugs = json.load(f).get("medicines", [])
    except Exception:
        return None
    if not slugs:
        return None
    return check_site(f"/medicines/{slugs[0]}/")


def check_users_drop() -> tuple[bool, str] | None:
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    prop = os.environ.get("GA4_PROPERTY_ID", "").strip()
    if not raw or not prop:
        return None
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import AuthorizedSession
        creds = service_account.Credentials.from_service_account_info(
            json.loads(raw), scopes=["https://www.googleapis.com/auth/analytics.readonly"])
        s = AuthorizedSession(creds)
        today = datetime.now(JST).date()
        r = s.post(f"https://analyticsdata.googleapis.com/v1beta/properties/{prop}:runReport", timeout=60, json={
            "dateRanges": [{"startDate": (today - timedelta(days=8)).isoformat(), "endDate": (today - timedelta(days=1)).isoformat()}],
            "dimensions": [{"name": "date"}], "metrics": [{"name": "totalUsers"}],
        })
        r.raise_for_status()
        by_day = {row["dimensionValues"][0]["value"]: int(row["metricValues"][0]["value"]) for row in r.json().get("rows", [])}
    except Exception as e:  # noqa: BLE001
        return False, f"GA4 が読めない（{type(e).__name__}）。サービスアカウントの権限を確認"
    days = [(today - timedelta(days=i)).strftime("%Y%m%d") for i in range(1, 9)]
    yesterday = by_day.get(days[0], 0)
    prev = sorted(by_day.get(x, 0) for x in days[1:])
    median = prev[len(prev) // 2]
    if median >= 20 and yesterday < median * 0.4:
        return False, f"昨日のユーザー数 {yesterday}人（その前7日の中央値 {median}人の4割未満）。サイトが落ちていないか、GA4 のタグが外れていないかを確認"
    return True, f"昨日 {yesterday}人（その前7日の中央値 {median}人）"


def _gh(path: str):
    token, repo = os.environ.get("GITHUB_TOKEN", ""), os.environ.get("GITHUB_REPOSITORY", "")
    if not token or not repo:
        return None
    status, text = http(f"https://api.github.com/repos/{repo}{path}",
                        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})
    if status != 200:
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def check_vercel() -> tuple[bool, str] | None:
    j = _gh("/commits/main/status")
    if not j:
        return None
    vercel = [x for x in j.get("statuses", []) if "vercel" in (x.get("context", "") + x.get("description", "")).lower()]
    if not vercel:
        return None
    st = vercel[0].get("state")
    if st in ("failure", "error"):
        return False, f"main の最新コミットで Vercel のデプロイが失敗（{vercel[0].get('description', '')}）。Vercel の Deployments でエラー内容を確認"
    return True, f"Vercel {st}"


def check_growth_agent() -> tuple[bool, str] | None:
    j = _gh("/actions/workflows/growth-agent.yml/runs?per_page=1&status=completed")
    if not j or not j.get("workflow_runs"):
        return None
    run = j["workflow_runs"][0]
    if run.get("conclusion") == "failure":
        return False, f"前回の成長エージェント（{run.get('created_at', '')[:10]}）が失敗。Actions のログを確認: {run.get('html_url', '')}"
    return True, f"前回 {run.get('created_at', '')[:10]} は {run.get('conclusion')}"


def main() -> int:
    results: list[tuple[str, bool, str]] = []

    ok, msg = check_anthropic();            results.append(("Anthropic API 残高", ok, msg))
    ok, msg, latest = check_supabase();     results.append(("Supabase 応答", ok, msg))
    if ok:
        ok2, msg2 = check_freshness(latest); results.append(("コラムの鮮度", ok2, msg2))
    for p in SITE_PATHS:
        ok, msg = check_site(p);            results.append((f"サイト {p}", ok, msg))
    for name, fn in (("薬ページ（トップ掲載の1件目）", check_featured_medicine), ("ユーザー数の急落", check_users_drop),
                     ("本番のビルド（Vercel）", check_vercel), ("成長エージェント", check_growth_agent)):
        r = fn()
        if r is not None:
            results.append((name, r[0], r[1]))

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
