#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
クスリノコンパス サイト最適化エージェント v1

5段階パイプライン:
  [1] 収集   Supabase + リポジトリ + 前回Issue
  [2] 診断   Claude API x 3 (marketer / psychologist / physician) 各独立実行
  [3] 統合   executive 人格が裁定・優先順位付け
  [4] 差分   前回提案との重複を除去
  [5] 投稿   GitHub Issue を作成

使い方:
  python agent/site_agent.py --inspect     # 各テーブルの列名だけ確認（API課金なし）
  python agent/site_agent.py --collect     # 収集結果だけ出力（API課金なし）
  python agent/site_agent.py               # ドライラン（Issueは作らない）
  python agent/site_agent.py --post        # 実際にIssueを作成
  python agent/site_agent.py --persona marketer   # 1人格だけテスト

必要な環境変数:
  ANTHROPIC_API_KEY
  NEXT_PUBLIC_SUPABASE_URL (または SUPABASE_URL)
  SUPABASE_SERVICE_KEY
  GITHUB_TOKEN         (--post 時のみ / Actions では自動)
  GITHUB_REPOSITORY    (--post 時のみ / Actions では自動)
"""

import argparse
import json
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# 設定
# ---------------------------------------------------------------------------

JST = timezone(timedelta(hours=9))

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent
OUT_DIR = BASE_DIR / "out"

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

# 3人格は Sonnet、統合の裁定は Opus。週5回なのでコストは僅少。
# モデル名は Anthropic Console の最新値に合わせて調整してください。
PERSONA_MODEL = os.environ.get("PERSONA_MODEL", "claude-sonnet-5")
EXEC_MODEL = os.environ.get("EXEC_MODEL", "claude-opus-5")
MAX_TOKENS = 8000

SUPABASE_URL = (
    os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    or os.environ.get("SUPABASE_URL")
    or ""
).rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO = os.environ.get("GITHUB_REPOSITORY", "chiyoko-san/otc-hikaku")
AGENT_LABEL = "site-agent"

PERSONAS = ["marketer", "psychologist", "physician"]

# 列名の候補。--inspect の結果を見て、必要ならここを直してください。
FIELDS = {
    "columns": {
        "title": ["title", "name", "heading", "subject"],
        "slug": ["slug", "path", "url", "id"],
        "body": ["body", "content", "markdown", "md", "text", "html"],
        "created": ["published_at", "created_at", "publish_date", "date"],
        "category": ["category", "tag", "genre", "theme"],
        "status": ["status", "state", "published"],
    },
    "medicines": {
        "name": ["name", "product_name", "brand_name", "title"],
        "ingredients": ["ingredients", "active_ingredients", "ingredient", "seibun"],
        "category": ["category", "classification", "risk_class", "risk", "type"],
        "form": ["dosage_form", "form", "zaikei"],
    },
    "damage_reports": {
        "created": ["created_at", "reported_at", "inserted_at", "date"],
        "category": ["category", "type", "kind", "genre"],
    },
    "ad_sightings": {
        "created": ["created_at", "reported_at", "inserted_at", "date"],
        "category": ["category", "type", "kind", "media"],
    },
}

# 収集に失敗した項目はここに溜まり、そのまま憲法の「利用不可データ」に流れる
UNAVAILABLE = [
    "PV・訪問数・直帰率・滞在時間（GA4 Data API 未接続）",
    "検索クエリ・掲載順位・CTR・表示回数（Search Console API 未接続）",
    "症状アキネーターの回答ログ・離脱地点・到達結果（ak_sessions テーブル未実装）",
    "各フォームの表示数・入力開始数・離脱率（イベント計測未実装）",
]


# ---------------------------------------------------------------------------
# 小道具
# ---------------------------------------------------------------------------

def log(msg):
    print(f"[{datetime.now(JST).strftime('%H:%M:%S')}] {msg}", flush=True)


def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def pick(row, candidates):
    """候補の列名のうち、最初に存在する値を返す。"""
    if not isinstance(row, dict):
        return None
    for c in candidates:
        if c in row and row[c] not in (None, ""):
            return row[c]
    return None


def iso_week(dt):
    y, w, _ = dt.isocalendar()
    return f"{y}-W{w:02d}"


def strip_html(s):
    if not isinstance(s, str):
        return ""
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def extract_json(text):
    """モデル出力からJSONを取り出す。"""
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass
    start, end = t.find("{"), t.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(t[start:end + 1])
        except json.JSONDecodeError:
            pass
    raise ValueError("JSONの取り出しに失敗しました:\n" + t[:800])


# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------

def sb_get(table, select="*", limit=1000, order=None):
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Supabaseの環境変数が設定されていません")
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    params = {"select": select, "limit": str(limit)}
    if order:
        params["order"] = order
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept": "application/json",
    }
    r = requests.get(url, params=params, headers=headers, timeout=60)
    r.raise_for_status()
    return r.json()


def sb_count(table):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Prefer": "count=exact",
        "Range": "0-0",
    }
    r = requests.get(url, params={"select": "*"}, headers=headers, timeout=60)
    r.raise_for_status()
    cr = r.headers.get("content-range", "")
    if "/" in cr:
        tail = cr.split("/")[-1]
        if tail.isdigit():
            return int(tail)
    return None


def cmd_inspect():
    """各テーブルの実際の列名を表示（API課金なし）。"""
    tables = [
        "medicines", "columns", "damage_reports", "ad_sightings",
        "ak_categories", "ak_questions", "ak_choices",
    ]
    for t in tables:
        try:
            rows = sb_get(t, limit=1)
            n = sb_count(t)
            cols = sorted(rows[0].keys()) if rows else []
            print(f"\n■ {t}  （件数: {n}）")
            for c in cols:
                v = rows[0].get(c)
                sample = strip_html(str(v))[:60] if v is not None else "None"
                print(f"    {c:<28} {sample}")
        except Exception as e:
            print(f"\n■ {t}  取得失敗: {e}")
    print("\n上の列名を見て、site_agent.py の FIELDS を必要に応じて直してください。")


# ---------------------------------------------------------------------------
# [1] 収集
# ---------------------------------------------------------------------------

def collect_columns():
    rows = sb_get("columns", limit=1000)
    f = FIELDS["columns"]
    items, bodies = [], []
    for r in rows:
        body = strip_html(str(pick(r, f["body"]) or ""))
        slug = pick(r, f["slug"])
        items.append({
            "slug": slug,
            "title": pick(r, f["title"]),
            "category": pick(r, f["category"]),
            "created": str(pick(r, f["created"]) or "")[:10],
            "chars": len(body),
            "outlinks": sorted(set(
                re.findall(r"\]\((/[^)\s]+)\)", str(pick(r, f["body"]) or ""))
                + re.findall(r'href="(/[^"]+)"', str(pick(r, f["body"]) or ""))
            )),
        })
        bodies.append(body)

    # 内部リンクの受け数を集計
    inbound = Counter()
    for it in items:
        for link in it["outlinks"]:
            inbound[link.rstrip("/")] += 1
    for it in items:
        key = f"/columns/{it['slug']}".rstrip("/")
        it["inbound"] = inbound.get(key, 0)

    orphans = [
        {"slug": i["slug"], "title": i["title"]}
        for i in items if i["inbound"] == 0
    ]
    return {
        "total": len(items),
        "orphan_count": len(orphans),
        "orphans": orphans[:40],
        "items": [
            {k: v for k, v in i.items() if k != "outlinks"} for i in items
        ][:200],
        "_bodies_joined": " ".join(bodies),
    }


def collect_medicines(columns_text):
    total = sb_count("medicines")
    rows = sb_get("medicines", limit=3000)
    f = FIELDS["medicines"]

    cat = Counter()
    form = Counter()
    ing = Counter()
    for r in rows:
        c = pick(r, f["category"])
        if c:
            cat[str(c)] += 1
        fo = pick(r, f["form"])
        if fo:
            form[str(fo)] += 1
        raw = pick(r, f["ingredients"])
        if raw:
            if isinstance(raw, list):
                parts = [str(x) for x in raw]
            else:
                parts = re.split(r"[、,／/・\n]+", str(raw))
            for p in parts:
                p = p.strip()
                if 2 <= len(p) <= 30:
                    ing[p] += 1

    top_ing = ing.most_common(300)
    uncovered = [
        {"ingredient": name, "medicine_count": n}
        for name, n in top_ing
        if name not in columns_text
    ][:50]

    return {
        "total_registered": total,
        "sampled": len(rows),
        "by_category": dict(cat.most_common(30)),
        "by_dosage_form": dict(form.most_common(30)),
        "top_ingredients": [{"name": n, "count": c} for n, c in top_ing[:60]],
        "ingredients_never_mentioned_in_columns": uncovered,
    }


def collect_reports(table):
    total = sb_count(table)
    rows = sb_get(table, limit=1000)
    f = FIELDS.get(table, {})
    cat = Counter()
    by_month = Counter()
    for r in rows:
        c = pick(r, f.get("category", []))
        if c:
            cat[str(c)] += 1
        d = str(pick(r, f.get("created", [])) or "")[:7]
        if len(d) == 7:
            by_month[d] += 1
    # 欠損率
    missing = {}
    if rows:
        for k in rows[0].keys():
            blank = sum(1 for r in rows if r.get(k) in (None, "", []))
            if blank:
                missing[k] = round(blank / len(rows), 2)
    return {
        "total": total,
        "by_category": dict(cat.most_common(20)),
        "by_month": dict(sorted(by_month.items())[-12:]),
        "field_blank_ratio": missing,
    }


def collect_akinator():
    out = {}
    for t in ("ak_categories", "ak_questions", "ak_choices"):
        try:
            out[t] = sb_get(t, limit=1000)
        except Exception as e:
            out[t] = {"error": str(e)}
            UNAVAILABLE.append(f"{t} の取得に失敗しました")
    return out


def collect_repo():
    pages, comps = [], []
    app_dir = REPO_ROOT / "app"
    if app_dir.exists():
        for p in sorted(app_dir.rglob("page.tsx")):
            pages.append("/" + str(p.parent.relative_to(app_dir)).replace("\\", "/"))
    comp_dir = REPO_ROOT / "components"
    if comp_dir.exists():
        comps = sorted(
            str(p.relative_to(REPO_ROOT)) for p in comp_dir.rglob("*.tsx")
        )[:120]
    return {"pages": pages, "components": comps}


def collect_all():
    ctx = {"generated_at": datetime.now(JST).isoformat()}
    errors = []

    def safe(key, fn):
        try:
            ctx[key] = fn()
        except Exception as e:
            ctx[key] = {"error": str(e)}
            errors.append(f"{key}: {e}")
            UNAVAILABLE.append(f"{key} のデータ（取得に失敗しました: {e}）")

    log("収集: columns")
    safe("columns", collect_columns)
    columns_text = ""
    if isinstance(ctx.get("columns"), dict):
        columns_text = ctx["columns"].pop("_bodies_joined", "")

    log("収集: medicines")
    safe("medicines", lambda: collect_medicines(columns_text))
    log("収集: damage_reports")
    safe("damage_reports", lambda: collect_reports("damage_reports"))
    log("収集: ad_sightings")
    safe("ad_sightings", lambda: collect_reports("ad_sightings"))
    log("収集: akinator")
    safe("akinator", collect_akinator)
    log("収集: repo")
    safe("repo", collect_repo)

    ctx["_errors"] = errors
    return ctx


# ---------------------------------------------------------------------------
# GitHub
# ---------------------------------------------------------------------------

def gh_headers():
    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def fetch_past_issues(n=4):
    if not GITHUB_TOKEN:
        return []
    url = f"https://api.github.com/repos/{GITHUB_REPO}/issues"
    params = {"labels": AGENT_LABEL, "state": "all", "per_page": str(n),
              "sort": "created", "direction": "desc"}
    try:
        r = requests.get(url, params=params, headers=gh_headers(), timeout=30)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log(f"過去Issueの取得に失敗: {e}")
        return []


def build_carryover(issues):
    """過去Issueから提案IDと状態を抽出する。ラベルが記憶の実体。"""
    seen = {}
    for iss in issues:
        labels = {l["name"].lower() for l in iss.get("labels", [])}
        if "done" in labels:
            status = "done"
        elif "rejected" in labels:
            status = "rejected"
        else:
            status = "pending"
        for m in re.finditer(r"^###\s+(A-[\w\-]+)\s+(.+?)\s*[｜|]", 
                             iss.get("body", "") or "", re.M):
            pid, title = m.group(1), m.group(2).strip()
            prev = seen.get(pid)
            carried = (prev["carried_count"] + 1) if prev else 0
            seen[pid] = {
                "id": pid, "title": title, "status": status,
                "week": iss.get("title", ""), "carried_count": carried,
            }
    return list(seen.values())


def create_issue(title, body, labels):
    url = f"https://api.github.com/repos/{GITHUB_REPO}/issues"
    payload = {"title": title, "body": body, "labels": labels}
    r = requests.post(url, headers=gh_headers(), json=payload, timeout=30)
    r.raise_for_status()
    return r.json()


# ---------------------------------------------------------------------------
# [2][3] Claude API
# ---------------------------------------------------------------------------

def call_claude(model, system, user, max_retries=3):
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }
    payload = {
        "model": model,
        "max_tokens": MAX_TOKENS,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    last = None
    for attempt in range(max_retries):
        try:
            r = requests.post(ANTHROPIC_URL, headers=headers,
                              json=payload, timeout=600)
            if r.status_code in (429, 500, 503, 529):
                wait = 10 * (attempt + 1)
                log(f"  {r.status_code} のため {wait}s 待機して再試行")
                time.sleep(wait)
                continue
            r.raise_for_status()
            data = r.json()
            return "".join(
                b.get("text", "") for b in data.get("content", [])
                if b.get("type") == "text"
            )
        except Exception as e:
            last = e
            log(f"  API呼び出し失敗 ({attempt + 1}/{max_retries}): {e}")
            time.sleep(8 * (attempt + 1))
    raise RuntimeError(f"Claude API 呼び出しに失敗しました: {last}")


def load_constitution():
    text = (BASE_DIR / "constitution.md").read_text(encoding="utf-8")
    bullets = "\n".join(f"- {u}" for u in UNAVAILABLE)
    return text.replace("{unavailable_data}", bullets)


PERSONA_OUTPUT_SPEC = """
出力するJSONの形式:

{
  "persona": "<あなたの人格名>",
  "overall": "全体所見を2文以内で",
  "findings": [
    {
      "title": "提案の見出し（30字以内）",
      "severity": "CRITICAL | HIGH | MEDIUM",
      "goal": "traffic | reports | akinator | newpage | cleanup",
      "evidence": "根拠。どのテーブルの何、どのファイルの何を見たか",
      "why": "なぜそれが問題か / なぜ効果があるか",
      "steps": ["ブラウザUIで実行できる粒度の手順", "..."],
      "target_files": ["app/..."],
      "effort_hours": 1.5,
      "autonomy": "L1 | L2 | L3",
      "measure": "効果測定の方法。手段がなければ計測の実装を書く"
    }
  ]
}

findings は最大6件。重要なものから並べてください。
指摘すべきことがなければ findings は空配列にしてください。
"""

EXEC_OUTPUT_SPEC = """
出力するJSONの形式:

{
  "summary_3lines": ["", "", ""],
  "critical_alerts": [
    {"finding": "", "location": "", "action": ""}
  ],
  "actions_this_week": [
    {
      "id": "A-<週番号>-<連番>",
      "title": "",
      "persona": "marketer | psychologist | physician",
      "goal": "traffic | reports | akinator | newpage | cleanup",
      "why": "",
      "steps": ["", ""],
      "target_files": [""],
      "effort_hours": 1.5,
      "autonomy": "L1 | L2 | L3",
      "measure": ""
    }
  ],
  "conflicts": [
    {"topic": "", "positions": {"marketer": "", "physician": ""}, "ruling": ""}
  ],
  "kill_list": [{"target": "", "reason": ""}],
  "backlog": [{"title": "", "goal": ""}],
  "rejected": [{"title": "", "reason": ""}],
  "carryover_status": [{"id": "", "status": "done | pending | rejected", "note": ""}]
}

actions_this_week は最大3件、effort_hours の合計は5.0以下にしてください。
"""


def run_persona(name, ctx):
    persona_text = (BASE_DIR / "personas" / f"{name}.md").read_text(encoding="utf-8")
    system = load_constitution() + "\n\n---\n\n" + persona_text + "\n\n---\n\n" + PERSONA_OUTPUT_SPEC
    user = (
        "以下は現時点のサイトデータです。これだけを根拠に診断してください。\n"
        "ここに含まれない数値には言及しないでください。\n\n"
        "```json\n" + json.dumps(ctx, ensure_ascii=False, indent=1)[:220000] + "\n```"
    )
    log(f"[2] 診断: {name} ({PERSONA_MODEL})")
    raw = call_claude(PERSONA_MODEL, system, user)
    return extract_json(raw)


def run_executive(persona_results, carryover, week):
    persona_text = (BASE_DIR / "personas" / "executive.md").read_text(encoding="utf-8")
    system = load_constitution() + "\n\n---\n\n" + persona_text + "\n\n---\n\n" + EXEC_OUTPUT_SPEC
    week_num = week.split("-W")[-1]
    user = (
        f"今週は {week} です。提案IDは A-{week_num}-1 の形式で採番してください。\n\n"
        "## 3名の専門家からの提案\n```json\n"
        + json.dumps(persona_results, ensure_ascii=False, indent=1)[:180000]
        + "\n```\n\n## 過去の提案とその状態（ラベル由来）\n```json\n"
        + json.dumps(carryover, ensure_ascii=False, indent=1)[:30000]
        + "\n```\n\n"
        "carried_count が2以上かつ status が pending のものは kill_list に移してください。\n"
        "status が done のものを再提案してはいけません。"
    )
    log(f"[3] 統合: executive ({EXEC_MODEL})")
    raw = call_claude(EXEC_MODEL, system, user)
    return extract_json(raw)


# ---------------------------------------------------------------------------
# [5] Markdown 生成
# ---------------------------------------------------------------------------

def render_markdown(res, week, ctx):
    L = []
    L.append("## 現在地（3行）\n")
    for i, s in enumerate(res.get("summary_3lines", [])[:3], 1):
        L.append(f"{i}. {s}")
    L.append("")

    alerts = res.get("critical_alerts") or []
    L.append("## 🚨 医学的アラート\n")
    if alerts:
        for a in alerts:
            L.append(f"- **{a.get('finding','')}**")
            L.append(f"  - 該当: `{a.get('location','')}`")
            L.append(f"  - 対応: {a.get('action','')}")
    else:
        L.append("なし")
    L.append("")

    L.append("## 今週やる（最大3件・合計5h以内）\n")
    acts = res.get("actions_this_week") or []
    if not acts:
        L.append("今週は現状維持が最善と判断されました。")
    total_h = 0.0
    for a in acts:
        try:
            total_h += float(a.get("effort_hours") or 0)
        except (TypeError, ValueError):
            pass
        L.append(
            f"### {a.get('id','A-?')} {a.get('title','')} "
            f"｜ {a.get('persona','')} ｜ {a.get('effort_hours','?')}h "
            f"｜ {a.get('autonomy','L2')}"
        )
        L.append(f"**なぜ**: {a.get('why','')}\n")
        L.append("**手順**")
        for s in a.get("steps", []):
            L.append(f"- [ ] {s}")
        tf = a.get("target_files") or []
        if tf:
            L.append("\n**対象ファイル**: " + ", ".join(f"`{t}`" for t in tf))
        L.append(f"\n**効果測定**: {a.get('measure','')}\n")
    if acts:
        L.append(f"> 合計工数: **{total_h:.1f}h**\n")

    conflicts = res.get("conflicts") or []
    if conflicts:
        L.append("## ⚔️ 専門家の対立と裁定\n")
        for c in conflicts:
            L.append(f"**論点**: {c.get('topic','')}\n")
            for k, v in (c.get("positions") or {}).items():
                L.append(f"- {k}: {v}")
            L.append(f"\n**裁定**: {c.get('ruling','')}\n")

    L.append("## 🗑 削除提案\n")
    kills = res.get("kill_list") or []
    if kills:
        for k in kills:
            L.append(f"- **{k.get('target','')}** — {k.get('reason','')}")
    else:
        L.append("なし")
    L.append("")

    co = res.get("carryover_status") or []
    if co:
        L.append("## 前回までの宿題\n")
        L.append("| ID | 状態 | 備考 |")
        L.append("|---|---|---|")
        for c in co:
            L.append(f"| {c.get('id','')} | {c.get('status','')} | {c.get('note','')} |")
        L.append("")

    backlog = res.get("backlog") or []
    if backlog:
        L.append("## 📥 バックログ（今週はやらない）\n")
        for b in backlog:
            L.append(f"- {b.get('title','')} `{b.get('goal','')}`")
        L.append("")

    rejected = res.get("rejected") or []
    if rejected:
        L.append("<details><summary>却下した案</summary>\n")
        for r in rejected:
            L.append(f"- {r.get('title','')} — {r.get('reason','')}")
        L.append("\n</details>\n")

    L.append("---\n")
    L.append("<details><summary>今回エージェントが見たデータ</summary>\n")
    L.append(f"- コラム: {ctx.get('columns',{}).get('total','?')}件"
             f"（うち被リンク0本: {ctx.get('columns',{}).get('orphan_count','?')}件）")
    L.append(f"- 医薬品: {ctx.get('medicines',{}).get('total_registered','?')}件")
    L.append(f"- 被害報告: {ctx.get('damage_reports',{}).get('total','?')}件")
    L.append(f"- 広告目撃: {ctx.get('ad_sightings',{}).get('total','?')}件")
    L.append(f"- ページ: {len(ctx.get('repo',{}).get('pages',[]))}件")
    if ctx.get("_errors"):
        L.append("\n**収集エラー**")
        for e in ctx["_errors"]:
            L.append(f"- {e}")
    L.append("\n**利用不可データ**")
    for u in UNAVAILABLE:
        L.append(f"- {u}")
    L.append("\n</details>\n")

    L.append("---")
    L.append("このIssueに `done` / `rejected` ラベルを貼ると、次回のエージェントが認識します。")
    L.append("ラベルなし＝pending として持ち越され、2回持ち越されると自動的に削除候補になります。")
    return "\n".join(L)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inspect", action="store_true", help="テーブルの列名だけ確認")
    ap.add_argument("--collect", action="store_true", help="収集結果だけ出力")
    ap.add_argument("--persona", help="1人格だけテスト実行")
    ap.add_argument("--post", action="store_true", help="実際にIssueを作成する")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.inspect:
        cmd_inspect()
        return

    now = datetime.now(JST)
    week = iso_week(now)

    log("[1] データ収集")
    ctx = collect_all()
    (OUT_DIR / "context.json").write_text(
        json.dumps(ctx, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"    -> {OUT_DIR / 'context.json'}")

    if args.collect:
        log("--collect のためここで終了します（API課金なし）")
        return

    if not ANTHROPIC_API_KEY:
        die("ANTHROPIC_API_KEY が設定されていません")

    if args.persona:
        res = run_persona(args.persona, ctx)
        path = OUT_DIR / f"persona_{args.persona}.json"
        path.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(res, ensure_ascii=False, indent=2))
        log(f"-> {path}")
        return

    results = {}
    for p in PERSONAS:
        try:
            results[p] = run_persona(p, ctx)
        except Exception as e:
            log(f"    {p} 失敗: {e}")
            results[p] = {"persona": p, "error": str(e), "findings": []}
    (OUT_DIR / "personas.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    issues = fetch_past_issues()
    carryover = build_carryover(issues)
    log(f"[4] 過去提案 {len(carryover)}件 を引き継ぎ")

    final = run_executive(results, carryover, week)
    (OUT_DIR / "final.json").write_text(
        json.dumps(final, ensure_ascii=False, indent=2), encoding="utf-8")

    body = render_markdown(final, week, ctx)
    title = f"[週次診断] {week}"
    labels = [AGENT_LABEL]
    if final.get("critical_alerts"):
        labels.append("urgent")

    (OUT_DIR / "issue.md").write_text(f"# {title}\n\n{body}", encoding="utf-8")
    log(f"[5] Markdown生成 -> {OUT_DIR / 'issue.md'}")

    if args.post:
        if not GITHUB_TOKEN:
            die("GITHUB_TOKEN が設定されていません")
        iss = create_issue(title, body, labels)
        log(f"    Issue作成: {iss.get('html_url')}")
    else:
        log("    ドライラン（--post を付けると実際にIssueを作成します）")
        print("\n" + "=" * 60)
        print(body)


if __name__ == "__main__":
    main()
