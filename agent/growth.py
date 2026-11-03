#!/usr/bin/env python3
"""
growth.py — ユーザー数を増やす成長エージェント（毎週土曜 06:00 JST）

流れ（.github/workflows/growth-agent.yml から2回呼ぶ）:
  1) python agent/growth.py plan
       Search Console と GA4 から先週までの数字を取り、課題を見つけ、
       決まった種類の打ち手だけ data/agent/*.json に書く（コードは触らない）。
         - クリックされない薬ページ → タイトル・説明文の差し替え（seo-overrides.json）
         - 8〜20位の薬ページ        → トップの「よく調べられている薬」に載せる（featured.json）
         - 需要がある条件の組       → /sagasu/ にページを追加（sagasu-extra.json）
         - 3週間前の差し替えで悪化  → 元に戻す（seo-overrides.json から消す）
       結果は agent/out/growth/state.json に残す。
  2) （ワークフローが検査 → main に反映 or PR）
  3) python agent/growth.py report --status applied|pr|failed|dryrun [--pr-url URL]
       「今ある課題」「解決策」「実際にやったこと」の3項目だけの Issue を立てる。

必要な Secrets:
  GOOGLE_SERVICE_ACCOUNT_JSON  サービスアカウントの鍵（JSONの中身そのまま）
  GA4_PROPERTY_ID              GA4 のプロパティID（数字）
  GSC_SITE_URL                 任意。空なら見えるプロパティから自動で選ぶ
  ANTHROPIC_API_KEY            既存
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import urllib.parse

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import validate_agent_data as V  # noqa: E402

SITE = os.environ.get("SITE_URL", "https://www.kusuri-compass.com").rstrip("/")
AGENT_DIR = "data/agent"
OUT_DIR = "agent/out/growth"
STATE = os.path.join(OUT_DIR, "state.json")
MODEL = os.environ.get("GROWTH_MODEL", "claude-sonnet-4-6")
JST = dt.timezone(dt.timedelta(hours=9))
TODAY = dt.datetime.now(JST).date()

MAX_TITLE_CHANGES = 8
MAX_SAGASU_ADD = 3
FEATURED_MAX = 12
REVERT_AFTER_DAYS = 21

SCOPES = [
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/webmasters.readonly",
]


class SetupError(Exception):
    pass


# ───────────────────────── 小道具 ─────────────────────────

def load_json(path: str, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def save_json(path: str, data) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def d(x: dt.date) -> str:
    return x.isoformat()


def pct(a: float, b: float) -> float | None:
    return None if not b else (a - b) / b * 100


def fmt_pct(v: float | None) -> str:
    return "—" if v is None else f"{v:+.0f}%"


def log(*a) -> None:
    print("[growth]", *a, flush=True)


# ───────────────────────── Google ─────────────────────────

def google_session():
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw:
        raise SetupError("Secrets に GOOGLE_SERVICE_ACCOUNT_JSON がありません")
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import AuthorizedSession
    except ImportError as e:
        raise SetupError(f"google-auth が入っていません: {e}")
    info = json.loads(raw)
    creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    return AuthorizedSession(creds), info.get("client_email", "")


def gsc_site(s) -> str:
    want = os.environ.get("GSC_SITE_URL", "").strip()
    if want:
        return want
    r = s.get("https://www.googleapis.com/webmasters/v3/sites", timeout=60)
    r.raise_for_status()
    sites = [e["siteUrl"] for e in r.json().get("siteEntry", []) if "kusuri-compass" in e.get("siteUrl", "")]
    if not sites:
        raise SetupError("Search Console のプロパティにサービスアカウントが追加されていません")
    sites.sort(key=lambda u: (not u.startswith("sc-domain:"), "www" not in u))
    return sites[0]


def gsc_query(s, site: str, start: dt.date, end: dt.date, dims: list[str], limit: int = 25000, filters=None) -> list[dict]:
    url = f"https://www.googleapis.com/webmasters/v3/sites/{urllib.parse.quote(site, safe='')}/searchAnalytics/query"
    rows: list[dict] = []
    start_row = 0
    while True:
        body = {"startDate": d(start), "endDate": d(end), "dimensions": dims,
                "rowLimit": min(25000, limit - len(rows)), "startRow": start_row, "dataState": "final"}
        if filters:
            body["dimensionFilterGroups"] = [{"filters": filters}]
        r = s.post(url, json=body, timeout=120)
        r.raise_for_status()
        got = r.json().get("rows", [])
        for g in got:
            row = {k: g["keys"][i] for i, k in enumerate(dims)}
            row.update(clicks=g["clicks"], impressions=g["impressions"], ctr=g["ctr"], position=g["position"])
            rows.append(row)
        if len(got) < body["rowLimit"] or len(rows) >= limit:
            return rows
        start_row += len(got)


def gsc_inspect(s, site: str, url: str) -> str:
    r = s.post("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
               json={"inspectionUrl": url, "siteUrl": site, "languageCode": "ja"}, timeout=60)
    r.raise_for_status()
    res = r.json().get("inspectionResult", {}).get("indexStatusResult", {})
    return res.get("verdict", "")  # PASS = 登録済み


def ga4_report(s, prop: str, body: dict) -> list[dict]:
    r = s.post(f"https://analyticsdata.googleapis.com/v1beta/properties/{prop}:runReport", json=body, timeout=120)
    r.raise_for_status()
    j = r.json()
    dn = [h["name"] for h in j.get("dimensionHeaders", [])]
    mn = [h["name"] for h in j.get("metricHeaders", [])]
    out = []
    for row in j.get("rows", []):
        o = {n: row["dimensionValues"][i]["value"] for i, n in enumerate(dn)}
        for i, n in enumerate(mn):
            v = row["metricValues"][i]["value"]
            o[n] = float(v) if "." in v else int(v)
        out.append(o)
    return out


# ───────────────────────── サイト ─────────────────────────

def path_of(url: str) -> str:
    p = urllib.parse.urlparse(url).path or "/"
    return urllib.parse.unquote(p if p.endswith("/") else p + "/")


def medicine_slug(path: str) -> str | None:
    m = re.fullmatch(r"/medicines/([a-z0-9][a-z0-9-]*)/", path)
    if not m or m.group(1) in ("index",):
        return None
    return m.group(1)


def fetch_page(path: str) -> dict | None:
    try:
        r = requests.get(SITE + path, timeout=30, headers={"User-Agent": "kusuri-compass-growth-agent"})
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    t = r.text

    def grab(rx: str) -> str:
        m = re.search(rx, t, re.S | re.I)
        return html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else ""

    return {
        "title": grab(r"<title[^>]*>(.*?)</title>"),
        "description": grab(r'<meta[^>]+name="description"[^>]+content="([^"]*)"'),
        "h1": grab(r"<h1[^>]*>(.*?)</h1>"),
        "noindex": bool(re.search(r'<meta[^>]+name="robots"[^>]+content="[^"]*noindex', t, re.I)),
    }


def expected_ctr(pos: float) -> float:
    table = [(1.5, .28), (2.5, .15), (3.5, .10), (4.5, .07), (5.5, .05), (6.5, .04), (7.5, .03),
             (8.5, .025), (9.5, .02), (10.5, .018), (12.5, .012)]
    for p, c in table:
        if pos <= p:
            return c
    return .008


SITE_NAME_SUFFIX = re.compile(r"[|｜]クスリノコンパス$")

# 条件ページの需要を見つける言葉
COND_WORDS = {
    "nemuke-nashi": ["眠くならない", "眠くなりにくい", "眠気なし", "眠くならん", "眠気が出ない"],
    "caffeine-nashi": ["カフェインなし", "カフェイン無し", "カフェインレス", "ノンカフェイン", "カフェイン 入って"],
    "kodomo": ["子供", "子ども", "こども", "小児", "キッズ", "幼児"],
    "tanzai": ["単一成分", "単剤", "成分 一つ", "成分が一つ"],
    "steroid-nashi": ["ステロイドなし", "ステロイド無し", "非ステロイド", "ノンステロイド"],
}
SYM_WORDS = {
    "kaze": ["風邪薬", "かぜ薬", "風邪 薬", "総合感冒", "感冒薬"],
    "bien": ["鼻炎", "花粉症", "鼻水", "鼻づまり", "アレルギー 薬"],
    "seki": ["咳止め", "せき止め", "咳 薬", "痰", "たん"],
    "zutsu": ["頭痛薬", "頭痛 薬", "解熱鎮痛", "痛み止め", "解熱剤"],
    "me-kayumi": ["目薬", "目のかゆみ", "目 かゆみ"],
    "shisshin": ["かゆみ止め", "湿疹", "塗り薬", "かぶれ"],
}


def sagasu_existing() -> set[tuple[str, str]]:
    src = open("lib/sagasu.ts", encoding="utf-8").read()
    m = re.search(r"const BASE_PAGES[^=]*=\s*\[(.*?)\n\]", src, re.S)
    pairs = set(re.findall(r"\['([a-z-]+)',\s*'([a-z-]+)'\]", m.group(1))) if m else set()
    extra = load_json(os.path.join(AGENT_DIR, "sagasu-extra.json"), {"pages": []}).get("pages", [])
    for p in extra:
        if isinstance(p, list) and len(p) == 2:
            pairs.add((p[0], p[1]))
    return pairs


# ───────────────────────── Claude ─────────────────────────

def call_claude(prompt: str, max_tokens: int = 4000) -> str | None:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    try:
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": MODEL, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]},
            timeout=300,
        )
        r.raise_for_status()
        return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")
    except Exception as e:  # noqa: BLE001
        log("Claude 失敗:", e)
        return None


def parse_json_block(text: str | None):
    if not text:
        return None
    t = re.sub(r"```(?:json)?", "", text).strip()
    m = re.search(r"(\[.*\]|\{.*\})", t, re.S)
    try:
        return json.loads(m.group(1)) if m else None
    except json.JSONDecodeError:
        return None


TITLE_PROMPT = """あなたは日本の市販薬比較サイト「クスリノコンパス」の検索結果の見出しを直す担当です。
下の薬ページは検索で表示されているのにクリックされていません。検索する人が知りたいことに、
検索結果の時点で答えるタイトルと説明文に書き直してください。

守ること:
- 使ってよい事実は「今の説明文」に書いてあることだけ。新しい効能・成分・区分・数字を足さない
- タイトルは薬の名前（そのまま）で始め、40文字以内。末尾のサイト名は自動で付くので書かない
- 説明文は60〜120文字
- 眠気について今の説明文に書いてあれば、意味を変えずに残す（「含み、運転はできません」/「含まれていません」）
- 誇大・断定・比較で優れているという表現、「おすすめ」「安全」「治る」「必ず」「最強」「一番」、
  医師・薬剤師・監修・専門家・公式、ランキング、感嘆符は使わない
- 検索語を見て、効果・成分・眠くなるか・似た薬との違い・区分など、どれに答えると押されるかを選ぶ

返事は JSON の配列だけ（前後に文章を書かない）:
[{{"slug": "...", "title": "...", "description": "..."}}]

ページ:
{pages}
"""

REPORT_PROMPT = """あなたは個人運営の市販薬比較サイト「クスリノコンパス」の週次レポートを書く担当です。
下のデータから、運営者が1分で読めるレポートを日本語で書いてください。

形式（この3つの見出しだけ。前置き・まとめ・ほかの見出しは書かない）:
## 今ある課題
（影響の大きい順に最大3つ。番号付き。数字を1つ以上入れる。専門用語は言い換える）
## 解決策
（課題と同じ番号で、何をすればよいかを1〜2行ずつ）
## 実際にやったこと
（「やったこと」に入っているものを箇条書き。自動で反映したもの、元に戻したもの。
 「未実施」に入っているものは「未実施（要判断）：〜」として最後に書く。何もしなかった週は「なし」）

反映の状態: {status}
データ:
{data}
"""


# ───────────────────────── plan ─────────────────────────

def plan(dry: bool) -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    state: dict = {"date": d(TODAY), "issues": [], "actions": [], "pending": [], "metrics": {}, "changed_urls": []}
    try:
        s, sa_email = google_session()
        site = gsc_site(s)
        prop = os.environ.get("GA4_PROPERTY_ID", "").strip()
        if not prop:
            raise SetupError("Secrets に GA4_PROPERTY_ID がありません")
    except SetupError as e:
        state["setup_error"] = str(e)
        save_json(STATE, state)
        log("設定エラー:", e)
        return 0
    state["gsc_site"] = site
    log("Search Console:", site, "/ GA4:", prop, "/", sa_email)

    # 期間（Search Console は2〜3日遅れるので3日前までで切る）
    end = TODAY - dt.timedelta(days=3)
    c28 = (end - dt.timedelta(days=27), end)
    p28 = (end - dt.timedelta(days=55), end - dt.timedelta(days=28))
    c7 = (end - dt.timedelta(days=6), end)
    p7 = (end - dt.timedelta(days=13), end - dt.timedelta(days=7))

    # ── Search Console
    daily = gsc_query(s, site, p28[0], end, ["date"])

    def tot(rows, a, b):
        sel = [r for r in rows if d(a) <= r["date"] <= d(b)]
        return sum(r["clicks"] for r in sel), sum(r["impressions"] for r in sel)

    cw, iw = tot(daily, *c7)
    pw, ipw = tot(daily, *p7)
    pages = gsc_query(s, site, *c28, ["page"])
    queries = gsc_query(s, site, *c28, ["query"], limit=10000)
    state["metrics"]["gsc"] = {"week_clicks": cw, "prev_week_clicks": pw, "week_impr": iw, "prev_week_impr": ipw,
                               "period": f"{d(c7[0])}〜{d(c7[1])}"}

    # ── GA4（直近7日 = 昨日まで）
    g_end = TODAY - dt.timedelta(days=1)
    gc = (g_end - dt.timedelta(days=6), g_end)
    gp = (g_end - dt.timedelta(days=13), g_end - dt.timedelta(days=7))
    ga = {}
    try:
        def ga_tot(a, b):
            rows = ga4_report(s, prop, {"dateRanges": [{"startDate": d(a), "endDate": d(b)}],
                                        "metrics": [{"name": "totalUsers"}, {"name": "sessions"}, {"name": "engagedSessions"}]})
            return rows[0] if rows else {"totalUsers": 0, "sessions": 0, "engagedSessions": 0}

        def ga_ch(a, b):
            rows = ga4_report(s, prop, {"dateRanges": [{"startDate": d(a), "endDate": d(b)}],
                                        "dimensions": [{"name": "sessionDefaultChannelGroup"}],
                                        "metrics": [{"name": "totalUsers"}]})
            return {r["sessionDefaultChannelGroup"]: r["totalUsers"] for r in rows}

        ga = {"week": ga_tot(*gc), "prev_week": ga_tot(*gp), "channels": ga_ch(*gc), "prev_channels": ga_ch(*gp),
              "period": f"{d(gc[0])}〜{d(gc[1])}"}
        top_landing = ga4_report(s, prop, {"dateRanges": [{"startDate": d(gc[0]), "endDate": d(gc[1])}],
                                           "dimensions": [{"name": "landingPage"}],
                                           "metrics": [{"name": "totalUsers"}, {"name": "engagedSessions"}, {"name": "sessions"}],
                                           "orderBys": [{"metric": {"metricName": "totalUsers"}, "desc": True}], "limit": 10})
        ga["top_landing"] = top_landing
    except requests.HTTPError as e:
        state["ga4_error"] = f"GA4 が読めませんでした（{e.response.status_code}）。サービスアカウントを GA4 の閲覧者に追加したか確認"
        log(state["ga4_error"])
    state["metrics"]["ga4"] = ga

    history = load_json(os.path.join(AGENT_DIR, "history.json"), {"runs": [], "actions": []})
    seo = load_json(os.path.join(AGENT_DIR, "seo-overrides.json"), {"medicines": {}})
    overrides: dict = seo.setdefault("medicines", {})
    featured = load_json(os.path.join(AGENT_DIR, "featured.json"), {"medicines": []})
    sagasu_extra = load_json(os.path.join(AGENT_DIR, "sagasu-extra.json"), {"pages": []})

    # ── 0) ユーザー数の増減
    users_now = ga.get("week", {}).get("totalUsers")
    users_prev = ga.get("prev_week", {}).get("totalUsers")
    ch_diff = []
    if ga:
        for ch in set(ga.get("channels", {})) | set(ga.get("prev_channels", {})):
            a, b = ga["channels"].get(ch, 0), ga["prev_channels"].get(ch, 0)
            ch_diff.append({"channel": ch, "now": a, "prev": b, "diff": a - b})
        ch_diff.sort(key=lambda x: x["diff"])
    users_change = pct(users_now or 0, users_prev or 0) if users_prev else None
    if users_change is not None and users_change <= -15:
        worst = ch_diff[0] if ch_diff else None
        state["issues"].append({
            "kind": "users_drop", "impact": (users_prev - users_now) * 3,
            "problem": f"先週のユーザー数 {users_now}人（前の週 {users_prev}人、{fmt_pct(users_change)}）。"
                       + (f"減ったのは主に {worst['channel']}（{worst['prev']}→{worst['now']}人）" if worst and worst["diff"] < 0 else ""),
            "solution": "検索からの減少なら下の打ち手で回復を図る。SNS・紹介からの減少なら、先週と同じ量の投稿・送付を続ける",
        })
    state["metrics"]["users_change"] = users_change
    state["metrics"]["channels"] = ch_diff

    # ── 1) 3週間前の差し替えの効果を見て、悪化していたら戻す
    evaluated = 0
    for slug, e in list(overrides.items()):
        since = e.get("since")
        if not since or e.get("evaluated"):
            continue
        sd = dt.date.fromisoformat(since)
        if (end - sd).days < REVERT_AFTER_DAYS:
            continue
        url = f"{SITE}/medicines/{slug}/"
        filt = [{"dimension": "page", "operator": "equals", "expression": url}]
        before = gsc_query(s, site, sd - dt.timedelta(days=28), sd - dt.timedelta(days=1), ["page"], filters=filt)
        after = gsc_query(s, site, sd + dt.timedelta(days=3), min(end, sd + dt.timedelta(days=31)), ["page"], filters=filt)
        b = before[0] if before else {"clicks": 0, "impressions": 0, "ctr": 0}
        a = after[0] if after else {"clicks": 0, "impressions": 0, "ctr": 0}
        evaluated += 1
        result = {"before_ctr": round(b["ctr"] * 100, 2), "after_ctr": round(a["ctr"] * 100, 2),
                  "before_impr": b["impressions"], "after_impr": a["impressions"]}
        if a["impressions"] >= 100 and b["impressions"] >= 100 and a["ctr"] < b["ctr"] * 0.7:
            overrides.pop(slug)
            state["actions"].append({"type": "revert", "target": f"/medicines/{slug}/",
                                     "detail": f"タイトル差し替えでクリック率が {result['before_ctr']}%→{result['after_ctr']}% に下がったため元に戻した"})
            state["changed_urls"].append(url)
        else:
            e["evaluated"] = d(TODAY)
            e["result"] = result
            state.setdefault("kept", []).append({"slug": slug, **result})
    log("効果判定:", evaluated)

    # ── 2) クリックされない薬ページ → タイトル・説明文の差し替え
    reverted_recent = {a["target"] for a in history.get("actions", [])
                       if a.get("type") == "revert" and a.get("date", "") >= d(TODAY - dt.timedelta(days=56))}
    cands = []
    for r in pages:
        path = path_of(r["page"])
        slug = medicine_slug(path)
        if not slug or slug in overrides or path in reverted_recent:
            continue
        if r["impressions"] < 100 or r["position"] > 12:
            continue
        exp = expected_ctr(r["position"])
        if r["ctr"] >= exp * 0.6:
            continue
        cands.append({**r, "slug": slug, "path": path, "gain": r["impressions"] * (exp - r["ctr"])})
    cands.sort(key=lambda x: -x["gain"])
    cands = cands[:MAX_TITLE_CHANGES]

    title_done = []
    if cands:
        pq = gsc_query(s, site, *c28, ["page", "query"], limit=25000,
                       filters=[{"dimension": "page", "operator": "contains", "expression": "/medicines/"}])
        blocks, meta = [], {}
        for c in cands:
            info = fetch_page(c["path"])
            if not info or info["noindex"] or not info["h1"]:
                continue
            qs = sorted([q for q in pq if path_of(q["page"]) == c["path"]], key=lambda q: -q["impressions"])[:8]
            meta[c["slug"]] = {"name": info["h1"], "basis": info["description"], "cand": c,
                               "old_title": SITE_NAME_SUFFIX.sub("", info["title"])}
            blocks.append(json.dumps({
                "slug": c["slug"], "薬の名前": info["h1"], "今のタイトル": meta[c["slug"]]["old_title"],
                "今の説明文": info["description"], "順位": round(c["position"], 1),
                "表示回数_28日": c["impressions"], "クリック率": f"{c['ctr'] * 100:.1f}%",
                "検索語": [f"{q['query']}（{q['impressions']}回）" for q in qs],
            }, ensure_ascii=False))
        out = parse_json_block(call_claude(TITLE_PROMPT.format(pages="\n".join(blocks)))) if blocks else None
        for item in out or []:
            slug = item.get("slug")
            if slug not in meta:
                continue
            m = meta[slug]
            title, desc = str(item.get("title", "")).strip(), str(item.get("description", "")).strip()
            errs = V.check_title(title, m["name"]) + V.check_description(desc, m["basis"])
            if errs:
                state["pending"].append({"detail": f"/medicines/{slug}/ のタイトル案は検査で不合格のため見送り（{errs[0]}）"})
                continue
            c = m["cand"]
            overrides[slug] = {"name": m["name"], "title": title, "description": desc, "basis": m["basis"],
                               "old_title": m["old_title"], "since": d(TODAY),
                               "baseline": {"ctr": round(c["ctr"] * 100, 2), "impressions": c["impressions"],
                                            "position": round(c["position"], 1)}}
            title_done.append({"slug": slug, "old": m["old_title"], "new": title, "ctr": c["ctr"], "impr": c["impressions"]})
            state["changed_urls"].append(f"{SITE}/medicines/{slug}/")
    if cands:
        gain = sum(c["gain"] for c in cands)
        state["issues"].append({
            "kind": "low_ctr", "impact": gain,
            "problem": f"検索で表示されているのにクリックされない薬ページが{len(cands)}件（表示 計{sum(c['impressions'] for c in cands):,}回/28日、"
                       f"クリック率は平均{sum(c['clicks'] for c in cands) / max(1, sum(c['impressions'] for c in cands)) * 100:.1f}%）",
            "solution": "検索語に答える形でタイトルと説明文を書き直す。3週間後にクリック率を比べ、下がったものは元に戻す",
        })
    if cands and not title_done:
        state["pending"].append({"detail": "タイトル案を作れなかったので差し替えは見送り（来週もう一度）"})
    for t in title_done:
        state["actions"].append({"type": "title", "target": f"/medicines/{t['slug']}/",
                                 "detail": f"タイトル差し替え「{t['old']}」→「{t['new']}」（表示{t['impr']}回・クリック率{t['ctr'] * 100:.1f}%）"})

    # ── 3) 8〜20位の薬ページ → トップから直接リンク
    near = [r for r in pages if medicine_slug(path_of(r["page"])) and 8 <= r["position"] <= 20 and r["impressions"] >= 30]
    near.sort(key=lambda r: -r["impressions"])
    new_featured = []
    for r in near:
        slug = medicine_slug(path_of(r["page"]))
        if slug and slug not in new_featured:
            new_featured.append(slug)
        if len(new_featured) >= FEATURED_MAX:
            break
    if near:
        state["issues"].append({
            "kind": "near_miss", "impact": sum(r["impressions"] for r in near[:FEATURED_MAX]) * 0.02,
            "problem": f"あと少しで1ページ目（8〜20位）の薬ページが{len(near)}件。上位12件で表示 計{sum(r['impressions'] for r in near[:FEATURED_MAX]):,}回/28日",
            "solution": "トップページの「よく調べられている薬」から直接リンクして、サイト内での重要度を上げる（毎週入れ替え）",
        })
    if new_featured and new_featured != featured.get("medicines"):
        added = [x for x in new_featured if x not in featured.get("medicines", [])]
        featured = {"_note": featured.get("_note", ""), "updated": d(TODAY), "medicines": new_featured}
        state["actions"].append({"type": "featured", "target": "/",
                                 "detail": f"トップの「よく調べられている薬」を{len(new_featured)}件に更新（新しく{len(added)}件）"})
        state["changed_urls"].append(f"{SITE}/")

    # ── 4) 条件で探す需要 → /sagasu/ にページ追加
    # 先週までに足した組のうち、該当が5品未満でページにならなかったものは外して、二度と足さない
    skip = set(tuple(x) for x in history.setdefault("sagasu_skip", []))
    added_on = {a["target"]: a.get("date", "") for a in history.get("actions", []) if a.get("type") == "sagasu"}
    kept_pairs = []
    for p in sagasu_extra.get("pages", []):
        target = f"/sagasu/{p[0]}/{p[1]}/"
        when = added_on.get(target, "")
        if when and when <= d(TODAY - dt.timedelta(days=6)):
            try:
                ok = requests.get(SITE + target, timeout=30).status_code == 200
            except requests.RequestException:
                ok = True
            if not ok:
                skip.add((p[0], p[1]))
                state["actions"].append({"type": "sagasu_drop", "target": target,
                                         "detail": f"{target} は該当する薬が5品未満でページにならなかったので候補から外した"})
                continue
        kept_pairs.append(p)
    sagasu_extra["pages"] = kept_pairs
    history["sagasu_skip"] = sorted([list(x) for x in skip])
    existing = sagasu_existing() | skip
    demand: dict[tuple[str, str], dict] = {}
    for q in queries:
        text = q["query"]
        conds = [c for c, ws in COND_WORDS.items() if any(w in text for w in ws)]
        syms = [s_ for s_, ws in SYM_WORDS.items() if any(w in text for w in ws)]
        for c in conds:
            for s_ in syms:
                k = (s_, c)
                v = demand.setdefault(k, {"impressions": 0, "clicks": 0, "examples": []})
                v["impressions"] += q["impressions"]
                v["clicks"] += q["clicks"]
                if len(v["examples"]) < 3:
                    v["examples"].append(text)
    new_pairs = sorted([(k, v) for k, v in demand.items() if k not in existing and v["impressions"] >= 20],
                       key=lambda kv: -kv[1]["impressions"])[:MAX_SAGASU_ADD]
    if new_pairs:
        pages_list = sagasu_extra.setdefault("pages", [])
        for (s_, c), v in new_pairs:
            pages_list.append([s_, c])
            state["actions"].append({"type": "sagasu", "target": f"/sagasu/{s_}/{c}/",
                                     "detail": f"/sagasu/{s_}/{c}/ を追加（「{v['examples'][0]}」など 表示{v['impressions']}回。該当5品以上なら公開、未満なら来週外す）"})
            state["changed_urls"].append(f"{SITE}/sagasu/{s_}/{c}/")
        state["issues"].append({
            "kind": "demand", "impact": sum(v["impressions"] for _, v in new_pairs) * 0.05,
            "problem": "条件付きで探す検索（例：" + "、".join(f"「{v['examples'][0]}」" for _, v in new_pairs) + "）に答えるページがない",
            "solution": "成分データから条件に合う薬の一覧ページを作る",
        })

    # ── 5) 条件ページのインデックス状況（最大20URL）
    try:
        targets = [f"{SITE}/sagasu/"] + [f"{SITE}/sagasu/{a}/{b}/" for a, b in sorted(existing - skip)][:19]
        not_indexed = []
        for u in targets:
            st = gsc_inspect(s, site, u)
            if st != "PASS":
                not_indexed.append((u, st))
        state["metrics"]["sagasu_index"] = {"checked": len(targets), "not_indexed": len(not_indexed)}
        if not_indexed and len(not_indexed) >= len(targets) // 2:
            state["issues"].append({
                "kind": "index", "impact": 30,
                "problem": f"条件で探すページ{len(targets)}件のうち{len(not_indexed)}件がまだGoogleに登録されていない",
                "solution": "トップ・薬ページからのリンクを増やし、Bing には IndexNow で知らせる。Google は2〜4週間待って再確認",
            })
            state["changed_urls"] += [u for u, _ in not_indexed]
    except requests.HTTPError as e:
        log("URL検査 失敗:", e.response.status_code)

    # ── 検索全体の増減（課題としては弱め）
    ch = pct(cw, pw)
    if ch is not None and ch <= -20 and pw >= 20:
        state["issues"].append({
            "kind": "gsc_drop", "impact": (pw - cw) * 2,
            "problem": f"先週の検索クリック {cw}回（前の週 {pw}回、{fmt_pct(ch)}）",
            "solution": "Search Console の「ページ」で登録が減っていないか確認。減っていれば原因を特定してから直す",
        })
        state["pending"].append({"detail": "検索クリックの減少の原因調べ（Search Console の画面確認が必要）"})

    state["issues"].sort(key=lambda x: -x["impact"])
    state["changed_urls"] = sorted(set(state["changed_urls"]))

    # 書き込み
    history["runs"].append({"date": d(TODAY), "users": users_now, "users_prev": users_prev,
                            "gsc_week_clicks": cw, "gsc_prev_week_clicks": pw})
    history["runs"] = history["runs"][-60:]
    for a in state["actions"]:
        history["actions"].append({"date": d(TODAY), **a})
    history["actions"] = history["actions"][-500:]
    if not dry:
        save_json(os.path.join(AGENT_DIR, "seo-overrides.json"), seo)
        save_json(os.path.join(AGENT_DIR, "featured.json"), featured)
        save_json(os.path.join(AGENT_DIR, "sagasu-extra.json"), sagasu_extra)
        save_json(os.path.join(AGENT_DIR, "history.json"), history)
    save_json(STATE, state)
    with open(os.path.join(OUT_DIR, "changed_urls.txt"), "w") as f:
        f.write("\n".join(state["changed_urls"]) + ("\n" if state["changed_urls"] else ""))
    log(f"課題{len(state['issues'])} / やったこと{len(state['actions'])} / 変更URL{len(state['changed_urls'])}")
    return 0


# ───────────────────────── report ─────────────────────────

SETUP_HELP = """## 今ある課題
1. 成長エージェントが Google（GA4・Search Console）のデータを読めていません：{err}

## 解決策
1. サービスアカウントの鍵を Secrets `GOOGLE_SERVICE_ACCOUNT_JSON` に入れ、GA4 のプロパティIDを `GA4_PROPERTY_ID` に入れる。サービスアカウントのメールアドレスを GA4（閲覧者）と Search Console（制限付き）に追加する

## 実際にやったこと
- なし
"""


def fallback_report(state: dict, status: str) -> str:
    issues = state["issues"][:3]
    lines = ["## 今ある課題"]
    lines += [f"{i}. {x['problem']}" for i, x in enumerate(issues, 1)] or ["1. 目立った課題なし"]
    lines += ["", "## 解決策"]
    lines += [f"{i}. {x['solution']}" for i, x in enumerate(issues, 1)] or ["1. 今週の打ち手を続ける"]
    lines += ["", "## 実際にやったこと"]
    acts = [f"- {a['detail']}" for a in state["actions"]]
    acts += [f"- 未実施（要判断）：{p['detail']}" for p in state.get("pending", [])]
    lines += acts or ["- なし"]
    return "\n".join(lines) + "\n"


def report(status: str, pr_url: str, post: bool) -> int:
    state = load_json(STATE, None)
    if state is None:
        body = SETUP_HELP.format(err="plan が実行されていません（ワークフローのログを確認）")
    elif state.get("setup_error"):
        body = SETUP_HELP.format(err=state["setup_error"])
    else:
        if status == "pr":
            for a in state["actions"]:
                a["detail"] += "（検査に通らなかったので PR で止めた）"
            state["pending"].append({"detail": f"今週の変更は検査に通らなかったため PR で止めています：{pr_url}"})
        elif status == "failed":
            state["pending"].append({"detail": "今週の変更は反映に失敗しました（Actions のログを確認）"})
            state["actions"] = []
        elif status == "dryrun":
            for a in state["actions"]:
                a["detail"] += "（試し実行のため未反映）"
        if state.get("ga4_error"):
            state["pending"].append({"detail": state["ga4_error"]})
        data = {k: state.get(k) for k in ("issues", "actions", "pending", "metrics", "kept")}
        data["issues"] = (data["issues"] or [])[:3]
        text = call_claude(REPORT_PROMPT.format(status=status, data=json.dumps(data, ensure_ascii=False, indent=1)), 2000)
        body = text.strip() + "\n" if text and "## 今ある課題" in text and "## 実際にやったこと" in text else fallback_report(state, status)

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "report.md"), "w", encoding="utf-8") as f:
        f.write(body)
    print(body)
    if not post:
        return 0

    token, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
    if not token or not repo:
        log("GITHUB_TOKEN / GITHUB_REPOSITORY がないので Issue は作りません")
        return 0
    h = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    requests.post(f"https://api.github.com/repos/{repo}/labels", headers=h, timeout=30,
                  json={"name": "growth-agent", "color": "1f4d3a", "description": "成長エージェントの週次報告"})
    r = requests.post(f"https://api.github.com/repos/{repo}/issues", headers=h, timeout=30,
                      json={"title": f"週次レポート {d(TODAY)}（成長エージェント）", "body": body, "labels": ["growth-agent"]})
    log("Issue:", r.status_code, r.json().get("html_url", ""))
    return 0 if r.ok else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p1 = sub.add_parser("plan")
    p1.add_argument("--dry", action="store_true", help="data/agent を書き換えない")
    p2 = sub.add_parser("report")
    p2.add_argument("--status", default="applied", choices=["applied", "pr", "failed", "dryrun"])
    p2.add_argument("--pr-url", default="")
    p2.add_argument("--no-post", action="store_true")
    a = ap.parse_args()
    if a.cmd == "plan":
        return plan(a.dry)
    return report(a.status, a.pr_url, not a.no_post)


if __name__ == "__main__":
    sys.exit(main())
