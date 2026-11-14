#!/usr/bin/env python3
"""
growth.py — ユーザー数を増やす成長エージェント（毎週土曜 06:00 JST）

考え方（2026-11-14 から）:
  - 仕事は「母数（サイトに来る人の数）を増やすこと」。毎週1つ、母数を増やす大改修を出す。
  - 週1回の高速PDCA。前週までの改修を数字で判定（伸ばす／直す／捨てる）→ 今週の大改修を1つ。
  - 「選択肢が多いと人は選べない」を分析と改修案の土台にする。運営者にも案は1つだけ出す。
  - 改修の記録は data/agent/experiments.json（改修名・対象・開始日・判定）。

流れ（.github/workflows/growth-agent.yml から2回呼ぶ）:
  0) python agent/growth.py start
       いちばん新しい「案」を「開始した」に変える（改修を反映した日に、Actions から mode=start で動かす）。
  1) python agent/growth.py plan
       Search Console と GA4 から先週までの数字を取り、
       (a) 進行中の改修を判定し、(b) 母数の天井を決めている原因を掘り、(c) 今週の大改修を1つ決める。
       あわせて、決まった種類の小さな打ち手だけ data/agent/*.json に書く（コードは触らない）。
         - クリックされない薬ページ → タイトル・説明文の差し替え（seo-overrides.json）
         - 8〜20位の薬ページ        → トップの「よく調べられている薬」に載せる（featured.json）
         - 需要がある条件の組       → /sagasu/ にページを追加（sagasu-extra.json）
         - 3週間前の差し替えで悪化  → 元に戻す（seo-overrides.json から消す）
       結果は agent/out/growth/state.json に残す。
  2) （ワークフローが検査 → main に反映 or PR）
  3) python agent/growth.py report --status applied|pr|failed|dryrun [--pr-url URL]
       「今ある課題」「解決策」「実際にやったこと」の3項目だけの Issue を立てる。
       大改修はコードの変更なので、Issue に「実装の依頼文」を付けるところまで（反映は人が決める）。

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
EXPERIMENTS = os.path.join(AGENT_DIR, "experiments.json")
MODEL = os.environ.get("GROWTH_MODEL", "claude-sonnet-4-6")
ANALYSIS_MODEL = os.environ.get("GROWTH_ANALYSIS_MODEL", "").strip() or MODEL
JST = dt.timezone(dt.timedelta(hours=9))
TODAY = dt.datetime.now(JST).date()

MAX_TITLE_CHANGES = 8
MAX_SAGASU_ADD = 3
FEATURED_MAX = 12
REVERT_AFTER_DAYS = 21
INDEX_GRACE_DAYS = 21          # 公開からこの日数たっても未登録のページだけを課題にする
SAGASU_LAUNCH = "2026-11-03"   # /sagasu/ の最初の15ページを公開した日

# 改修の判定（週1回）
TRACK_DAYS = 60                # 開始からこの日数は数字を追い続ける
MIN_POST_DAYS = 3              # 開始後のデータがこれ未満なら「開始直後」（判定は次の週）
GROW_RATIO = 1.3               # 1日あたりが開始前の1.3倍以上で「伸ばす」
GROW_FLOOR = {"search": 5.0, "channel": 2.0}   # かつ 1日あたりこれ以上の純増（誤差で「伸びた」としない）
ZERO_START = {"search": 5.0, "channel": 3.0}   # 開始前が0のときは、1日あたりこれ以上で「伸ばす」
MAX_FIX = 1                    # 「直す」は1回まで。次も伸びなければ「捨てる」

# ページ群（上から順に当てはめる）
GROUPS = [
    ("薬ページ", "/medicines/"),
    ("処方薬→同じ成分の市販薬", "/switch/"),
    ("条件で探す", "/sagasu/"),
    ("上乗せ料金（OTC類似薬）", "/otc-similar/"),
    ("コラム", "/columns/"),
    ("成分ページ", "/ingredients/"),
    ("症状ページ", "/symptoms/"),
    ("分類ページ", "/categories/"),
    ("症状アキネーター", "/akinator/"),
]

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


def gsc_query(s, site: str, start: dt.date, end: dt.date, dims: list[str], limit: int = 25000, filters=None,
              data_state: str = "final") -> list[dict]:
    url = f"https://www.googleapis.com/webmasters/v3/sites/{urllib.parse.quote(site, safe='')}/searchAnalytics/query"
    rows: list[dict] = []
    start_row = 0
    while True:
        body = {"startDate": d(start), "endDate": d(end), "dimensions": dims,
                "rowLimit": min(25000, limit - len(rows)), "startRow": start_row, "dataState": data_state}
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

def call_claude(prompt: str, max_tokens: int = 4000, model: str | None = None) -> str | None:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    try:
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": model or MODEL, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]},
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

ANALYSIS_PROMPT = """# 役割
あなたはクスリノコンパス（kusuri-compass.com）の成長責任者です。
仕事は、サイトに来る人の数（母数）を増やすことです。
「母数が少ないので判断できない」は禁句です。母数が少ないなら、母数を増やす改修を打ちます。
読んでも運営者の行動が変わらない報告は不合格です。

# サイト
一般用医薬品（市販薬）を成分で比べる、広告もスポンサーもない中立の消費者保護サイト。
出典は公的機関（PMDA・厚生労働省・消費者庁・国民生活センター）だけ。主な利用者は高齢者。
ページ群は下の「データ」の groups にあるとおり（URL数と検索の数字つき）。
使える公開データの例: PMDAの添付文書、厚労省の薬価基準・NDBオープンデータ（処方数量）、
消費者庁の機能性表示食品データベース、国民生活センターの相談事例。
2027年3月に、OTC類似薬の「特別の料金」（上乗せ料金）が始まる予定で、関心が高まる時期が近い。

# 変えてはいけない制約
- 中立。アフィリエイト・特定の商品を推すこと・並び順の恣意的な操作・スポンサー由来の内容は不可
- 医薬品情報（YMYL）。事実は公的機関のデータだけ。診断・治療方針・受診を控えさせる表現は不可
- 不安や恐怖をあおる表現、急がせる表現、だます作り（ダークパターン）は不可
- 監修者はいない。薬剤師・医師などの資格や監修を名乗る表現は使わない
- 運営者は1人。作業はGitHubのブラウザ画面とGitHub Actionsだけ。使える時間は週5時間まで
- 技術は Next.js 14 / Vercel / Supabase / GitHub Actions。データ変更は自動、コード変更は依頼文まで

# 基本方針1: 毎週、母数を増やす大改修を1つ
- 改修は「母数を増やすもの」に限る。次のいずれか。
  ・新しい入口を作る（検索される新しいページ群、新しい検索語への対応）
  ・既にある入口を広げる（Googleに登録されていないページ群を登録させる、順位圏外のページ群を作り直す）
  ・検索以外の経路を開く（LINE・X・薬局・自治体・メディア・ほかのサイトからのリンク）
  ・来た人が次の人を連れてくる仕組み（共有・家族に送る）
- 今いる少数の訪問者だけに効く改善（個別ページの文言調整、数ページのタイトル修正）は改修に数えない。
- 小さな改修を複数回すより、大きな改修を1つ。反応が数字に出る大きさにする。
  目安: ページ群まるごと（数十〜数千ページ）か、経路1本まるごと。
- 今週の改修は、experiments にある進行中の改修と違うページ群・違う経路を対象にする
  （数字をページ群・経路ごとに分ければ、改修が重なっても効果を切り分けられるため）。
- experiments で「捨てる」になった型と同じ失敗を繰り返さない。past_proposals と同じ案も出さない。

# 基本方針2: 1週間で判定する
- 判定はプログラムが済ませている（experiments の verdict: grow=伸ばす / fix=直す / drop=捨てる / early=開始直後）。
  あなたは判定を変えない。数字を読んで、次の一言を書く。
  伸ばす → 同じ型をどこへ広げるか
  直す   → 伸びない原因を1つだけ特定し、直し方を1つ（直すのは1回まで）
  捨てる → なぜ外れたかを1行（これ以上手をかけない。ページは消さない）
- 今週の改修にも、1週間で動く判定指標を決める。
  検索向け: 対象ページ群の表示回数（1日あたり）と、表示が1回以上あったURLの数
  検索以外: その経路からのセッション数（1日あたり）
  クリック数・再訪は遅れて動くので、追跡用の指標として別に書く。

# 基本方針3: 選択肢が多いと人は選べない
この前提を、分析と改修案の両方の土台にする。
- 分析では「利用者が選択肢の多さで止まっている場所」を探す。
  例: リンクが多すぎる入口、数十〜数百件が並ぶ一覧、次に押す場所がいくつもある画面。
- 改修で作る・直すページは次の型に従う。
  ・1画面に用件は1つ。次に押す場所は1つ
  ・選択肢は3つまで。それ以上は質問で絞り込んでから見せる
  ・「迷ったらここから」を必ず1つ示す（次の一歩や、公的データで説明できる並び順の既定。特定の商品を推すのは不可）
  ・入口を増やすときも、1つの入口の中の選択肢は増やさない
- 報告も同じ。運営者に選択肢を並べない。本命を1つ、対案は多くて1つ。

# 分析の進め方
1. groups・channels・queries から「母数の天井を決めている原因」を探す。症状で止めず、
   打ち手が変わる深さまで掘る。
   ・需要があるのに取れていない検索語はどれか（表示はあるが順位が低い）
   ・URLは多いのに表示がほとんど無いページ群はどれで、なぜか（sitemap_urls と urls_with_impr_28d の差）
   ・検索以外の経路はどれだけあり、どれに伸びる余地があるか
2. 今の施策（ページ群）のうち、母数の増加に効いていないものを1つ「やめる・縮める」候補として挙げる
3. 今週の大改修を1つに絞る

# 禁止
- 数字の根拠が無い一般論（「内部リンクを強化」「コンテンツを充実」など）
- 「母数が少ないので判断できない」「様子を見る」「引き続き監視」
- 小さな修正を並べること
- 根拠のない予測値。見込みは「28日の表示回数 × 想定クリック率」のように、データにある数字を使った計算式で示す
- データに無いこと（競合の内情、検索需要の総数など）についての推測。必要なら「計測を先に作る」と書く
- 専門用語。運営者が1分で読める言葉で書く

# 返事
JSON だけを返す（前後に文章を書かない。最初の文字は {{ ）。値はすべて日本語の文字列。
{{
  "root_cause": "母数の天井を決めている根本原因を1つ。1〜2文。数字を1つ以上",
  "chain": ["原因の連鎖。1行に数字を1つ。最大3行"],
  "stuck_by_choice": "選択肢の多さで利用者が止まっていそうな場所を1つ。データから言える範囲で。言えなければ空文字",
  "stop": "やめる・縮めるものを1つと、その理由（数字つき）",
  "reviews": [{{"id": "experiments の id", "comment": "判定に対する一言（上の決まりどおり）"}}],
  "proposal": {{
    "name": "今週の大改修の名前（30文字以内）",
    "kind": "search または channel",
    "targets": ["search なら対象ページ群のパスの先頭（例 /switch/ 。新設なら新しいパス）。channel なら GA4 の参照元に含まれる文字（例 line、t.co）。1〜3個"],
    "what": "何を変えるか。ページ群名・機能名で具体的に",
    "scale": "対象の規模（例: 約300ページを新設）",
    "why": "なぜ母数が増えるか。数字と論理で",
    "formula": "見込みの計算式（データにある数字だけを使う）",
    "metric_week": "1週間後に見る数字（何が、いくつ以上なら伸ばす）",
    "metric_follow": "2〜4週後に追う数字",
    "concerns": "正確さ・中立性・高齢者のわかりやすさの懸念と、その避け方",
    "first_step": "今週のうちにやる最初の一歩を1つ",
    "brief": "実装する人にそのまま渡せる依頼文。どのデータから、どんな型のページ（基本方針3の型）を、何ページ作る／どこを直すか。5〜10行"
  }},
  "alt": "対案を1つだけ、2行以内。無ければ空文字",
  "question": "運営者が「やる／やらない」で答えられる問いを1つ"
}}

データ:
{data}
"""


# ───────────────────────── ページ群・改修の記録 ─────────────────────────

def group_of(path: str) -> str:
    if path == "/":
        return "トップ"
    for name, prefix in GROUPS:
        if path.startswith(prefix):
            return name
    return "その他"


def group_stats(rows: list[dict]) -> dict[str, dict]:
    """ページ別の行を、ページ群ごとにまとめる"""
    out: dict[str, dict] = {}
    for r in rows:
        g = out.setdefault(group_of(path_of(r["page"])), {"impr": 0, "clicks": 0, "urls": 0, "_pos": 0.0})
        g["impr"] += r["impressions"]
        g["clicks"] += r["clicks"]
        g["urls"] += 1
        g["_pos"] += r["position"] * r["impressions"]
    for g in out.values():
        g["pos"] = round(g.pop("_pos") / g["impr"], 1) if g["impr"] else None
    return out


def sitemap_counts() -> dict[str, int]:
    """公開中のサイトマップから、ページ群ごとのURL数を数える（読めなければ空）"""
    counts: dict[str, int] = {}
    try:
        idx = requests.get(SITE + "/sitemap.xml", timeout=60).text
        children = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", idx)
        if "<sitemapindex" not in idx:
            children, bodies = [], [idx]
        else:
            bodies = [requests.get(html.unescape(u), timeout=120).text for u in children[:20]]
        for body in bodies:
            for u in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body):
                g = group_of(path_of(html.unescape(u)))
                counts[g] = counts.get(g, 0) + 1
    except requests.RequestException as e:
        log("サイトマップが読めません:", e)
    return counts


def load_experiments() -> dict:
    data = load_json(EXPERIMENTS, {"experiments": []})
    data.setdefault("experiments", [])
    return data


def match_target(path: str, target: str) -> bool:
    return path == "/" if target == "/" else path.startswith(target)


def search_window(s, site: str, targets: list[str], a: dt.date, b: dt.date) -> dict | None:
    """対象ページ群の、期間内の表示・クリック・表示があったURL数"""
    if a > b:
        return None
    seen: dict[tuple[str, str], dict] = {}
    for t in targets:
        filt = [{"dimension": "page", "operator": "equals" if t == "/" else "contains", "expression": SITE + t}]
        for r in gsc_query(s, site, a, b, ["date", "page"], filters=filt, data_state="all"):
            if any(match_target(path_of(r["page"]), x) for x in targets):
                seen[(r["date"], r["page"])] = r
    days = (b - a).days + 1
    impr = sum(r["impressions"] for r in seen.values())
    clicks = sum(r["clicks"] for r in seen.values())
    return {"days": days, "impr": impr, "clicks": clicks, "urls": len({p for _, p in seen}),
            "per_day": round(impr / days, 1), "clicks_per_day": round(clicks / days, 2)}


def channel_window(ga_daily: list[dict], targets: list[str], a: dt.date, b: dt.date) -> dict | None:
    """対象の経路（参照元・メディア・チャネル名に targets の文字が含まれるもの）の、期間内のセッション数"""
    if a > b:
        return None
    lo, hi = a.strftime("%Y%m%d"), b.strftime("%Y%m%d")
    ts = [t.lower() for t in targets]
    n = 0
    for r in ga_daily:
        if not (lo <= r.get("date", "") <= hi):
            continue
        key = " / ".join(str(r.get(k, "")) for k in ("sessionSource", "sessionMedium", "sessionDefaultChannelGroup")).lower()
        if any(t in key for t in ts):
            n += r.get("sessions", 0)
    days = (b - a).days + 1
    return {"days": days, "sessions": n, "per_day": round(n / days, 1)}


def decide(kind: str, pre: float, post: float, post_days: int, fix_count: int) -> str:
    """1日あたりの数字（開始前7日 → 開始後）から、伸ばす／直す／捨てる を決める"""
    if post_days < MIN_POST_DAYS:
        return "early"
    if pre <= 0:
        grew = post >= ZERO_START[kind]
    else:
        grew = post >= pre * GROW_RATIO and (post - pre) >= GROW_FLOOR[kind]
    if grew:
        return "grow"
    return "drop" if fix_count >= MAX_FIX else "fix"


VERDICT_JA = {"grow": "伸ばす", "fix": "直す", "drop": "捨てる", "early": "開始直後（判定は次の週）"}
STATUS_JA = {"proposed": "案（未着手）", "running": "判定待ち", "fix": "直し中", "grow": "伸ばす", "drop": "捨てた",
             "skipped": "見送り"}


def judge_experiments(s, site: str, ga_daily: list[dict] | None, exps: list[dict]) -> list[dict]:
    """進行中の改修を判定し、exps を書き換える。戻り値はレポート用"""
    out = []
    gsc_end = TODAY - dt.timedelta(days=2)   # 速報値（dataState=all）なら2日前まで読める
    ga_end = TODAY - dt.timedelta(days=1)
    for e in exps:
        if e.get("status") not in ("running", "fix", "grow", "drop") or not e.get("started"):
            continue
        try:
            started = dt.date.fromisoformat(e["started"])
        except ValueError:
            continue
        if (TODAY - started).days > TRACK_DAYS:
            continue
        kind = e.get("kind", "search")
        targets = [t for t in e.get("targets", []) if isinstance(t, str) and t]
        end = gsc_end if kind == "search" else ga_end
        pre_a, pre_b = started - dt.timedelta(days=7), started - dt.timedelta(days=1)
        post_a = max(started + dt.timedelta(days=1), end - dt.timedelta(days=6))
        try:
            if kind == "search":
                pre, post = search_window(s, site, targets, pre_a, pre_b), search_window(s, site, targets, post_a, end)
                unit = "表示"
            else:
                if ga_daily is None:
                    continue
                pre, post = channel_window(ga_daily, targets, pre_a, pre_b), channel_window(ga_daily, targets, post_a, end)
                unit = "セッション"
        except requests.HTTPError as ex:
            log("改修の数字が取れません:", e.get("id"), ex.response.status_code)
            continue
        post_days = post["days"] if post else 0
        pre_v = pre["per_day"] if pre else 0.0
        post_v = post["per_day"] if post else 0.0
        j = {"id": e.get("id"), "name": e.get("name"), "kind": kind, "targets": targets, "started": e["started"],
             "unit": unit, "pre_per_day": pre_v, "post_per_day": post_v, "post_days": post_days,
             "change": fmt_pct(pct(post_v, pre_v)), "prev_status": e.get("status")}
        if kind == "search" and post:
            j.update(urls_with_impr=post["urls"], urls_before=pre["urls"] if pre else 0,
                     clicks_per_day=post["clicks_per_day"])
        last = (e.get("checks") or [{}])[-1]
        judged_this_week = last.get("date", "") > d(TODAY - dt.timedelta(days=6))
        if e["status"] in ("running", "fix") and judged_this_week:
            j["verdict"] = last.get("verdict", e["status"])   # 同じ週に2回動かしても、判定は進めない
            j["comment"] = e.get("lesson", "")
            out.append(j)
            continue
        if e["status"] in ("running", "fix"):
            v = decide(kind, pre_v, post_v, post_days, int(e.get("fix_count", 0)))
            j["verdict"] = v
            if v == "grow":
                e["status"] = "grow"
            elif v == "fix":
                e["status"] = "fix"
                e["fix_count"] = int(e.get("fix_count", 0)) + 1
            elif v == "drop":
                e["status"] = "drop"
        else:
            j["verdict"] = e["status"]      # 判定済み。数字だけ追う
            j["tracking_only"] = True
        e.setdefault("checks", []).append({
            "date": d(TODAY), "pre_per_day": pre_v, "post_per_day": post_v, "post_days": post_days,
            "verdict": j["verdict"]})
        e["checks"] = e["checks"][-12:]
        out.append(j)
    return out


def clean_proposal(p: object) -> dict | None:
    """Claude の案を検査して、記録できる形にする（だめなら None）"""
    if not isinstance(p, dict):
        return None
    name = str(p.get("name", "")).strip()
    kind = str(p.get("kind", "")).strip()
    targets = p.get("targets")
    if not name or kind not in ("search", "channel") or not isinstance(targets, list):
        return None
    targets = [str(t).strip() for t in targets if str(t).strip()][:3]
    if kind == "search":
        fixed = []
        for t in targets:
            t = "/" + t.strip("/") + "/" if t.strip("/") else "/"
            if re.fullmatch(r"/(?:[a-z0-9][a-z0-9-]*/)*", t):
                fixed.append(t)
        targets = fixed
    else:
        targets = [t.lower() for t in targets if len(t) >= 2]
    if not targets:
        return None
    out = {"name": name[:60], "kind": kind, "targets": targets}
    for k in ("what", "scale", "why", "formula", "metric_week", "metric_follow", "concerns", "first_step", "brief"):
        out[k] = str(p.get(k, "")).strip()
    return out if out["what"] and out["why"] else None


def new_experiment_id(name: str, exps: list[dict]) -> str:
    base = d(TODAY)
    ids = {e.get("id") for e in exps}
    i = 1
    while f"{base}-{i}" in ids:
        i += 1
    return f"{base}-{i}"



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

    # ── 5) 条件ページのインデックス状況（公開から3週間たったページだけ、最大20URL）
    #    公開したばかりのページが未登録なのは当たり前なので、課題にしない
    try:
        published = {(a, b): SAGASU_LAUNCH for a, b in existing - skip}
        for target, when in added_on.items():
            m_ = re.fullmatch(r"/sagasu/([a-z-]+)/([a-z-]+)/", target)
            if m_ and (m_.group(1), m_.group(2)) in published and when:
                published[(m_.group(1), m_.group(2))] = when
        cutoff = d(TODAY - dt.timedelta(days=INDEX_GRACE_DAYS))
        old_pages = sorted(k for k, v in published.items() if v <= cutoff)
        targets = ([f"{SITE}/sagasu/"] if SAGASU_LAUNCH <= cutoff else []) + \
                  [f"{SITE}/sagasu/{a}/{b}/" for a, b in old_pages]
        targets = targets[:20]
        not_indexed = []
        for u in targets:
            st = gsc_inspect(s, site, u)
            if st != "PASS":
                not_indexed.append((u, st))
        state["metrics"]["sagasu_index"] = {"checked": len(targets), "not_indexed": len(not_indexed),
                                            "young_pages": len(published) - len(old_pages)}
        if not_indexed:
            state["issues"].append({
                "kind": "index", "impact": 10 * len(not_indexed),
                "problem": f"公開から3週間以上たった「条件で探す」ページ{len(targets)}件のうち{len(not_indexed)}件が、まだGoogleに登録されていない",
                "solution": "トップ・薬ページからのリンクを増やし、Bing には IndexNow で知らせる。4週間たっても未登録なら、中身が薄いと見られている可能性があるので一覧の説明を厚くする",
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

    # ── 6) 進行中の改修を判定する（伸ばす／直す／捨てる）
    exp_data = load_experiments()
    exps: list[dict] = exp_data["experiments"]
    ga_daily = None
    if ga:
        try:
            ga_daily = ga4_report(s, prop, {
                "dateRanges": [{"startDate": d(TODAY - dt.timedelta(days=TRACK_DAYS + 8)), "endDate": d(g_end)}],
                "dimensions": [{"name": "date"}, {"name": "sessionSource"}, {"name": "sessionMedium"},
                               {"name": "sessionDefaultChannelGroup"}],
                "metrics": [{"name": "sessions"}], "limit": 50000})
        except requests.HTTPError as e:
            log("GA4 の経路別データが読めません:", e.response.status_code)
    unstarted = [{"id": e.get("id"), "name": e.get("name"), "proposed": e.get("proposed")}
                 for e in exps if e.get("status") == "proposed"]
    judgments = judge_experiments(s, site, ga_daily, exps)
    state["judgments"] = judgments
    state["unstarted"] = unstarted
    log("改修の判定:", len(judgments), "/ 未着手の案:", len(unstarted))

    # ── 7) 母数の天井を決めている原因を掘り、今週の大改修を1つ決める
    def gsum(rows):
        return group_stats(rows)

    g_c7, g_p7 = gsum(gsc_query(s, site, *c7, ["page"])), gsum(gsc_query(s, site, *p7, ["page"]))
    g_c28, g_p28 = gsum(pages), gsum(gsc_query(s, site, *p28, ["page"]))
    sm = sitemap_counts()
    groups = []
    for name in ["トップ"] + [n for n, _ in GROUPS] + ["その他"]:
        a7, b7, a28, b28 = (g.get(name, {}) for g in (g_c7, g_p7, g_c28, g_p28))
        if not (sm.get(name) or a28 or b28):
            continue
        groups.append({
            "group": name, "path": dict(GROUPS).get(name, "/" if name == "トップ" else ""),
            "sitemap_urls": sm.get(name), "urls_with_impr_28d": a28.get("urls", 0),
            "impr_7d": a7.get("impr", 0), "impr_prev_7d": b7.get("impr", 0),
            "clicks_7d": a7.get("clicks", 0), "clicks_prev_7d": b7.get("clicks", 0),
            "impr_28d": a28.get("impr", 0), "impr_prev_28d": b28.get("impr", 0),
            "clicks_28d": a28.get("clicks", 0), "clicks_prev_28d": b28.get("clicks", 0),
            "avg_position_28d": a28.get("pos"),
        })
    missed = sorted([q for q in queries if q["impressions"] >= 20 and q["position"] > 10],
                    key=lambda q: -q["impressions"])[:40]
    won = sorted([q for q in queries if q["clicks"] > 0], key=lambda q: -q["clicks"])[:15]

    def qrow(q):
        return {"query": q["query"], "impr_28d": q["impressions"], "clicks_28d": q["clicks"], "position": round(q["position"], 1)}

    sources: dict[str, dict] = {}
    for r in ga_daily or []:
        key = f"{r.get('sessionSource', '')} / {r.get('sessionMedium', '')}"
        v = sources.setdefault(key, {"source": key, "sessions_7d": 0, "sessions_prev_7d": 0})
        if gc[0].strftime("%Y%m%d") <= r.get("date", "") <= gc[1].strftime("%Y%m%d"):
            v["sessions_7d"] += r.get("sessions", 0)
        elif gp[0].strftime("%Y%m%d") <= r.get("date", "") <= gp[1].strftime("%Y%m%d"):
            v["sessions_prev_7d"] += r.get("sessions", 0)
    top_sources = sorted([v for v in sources.values() if v["sessions_7d"] or v["sessions_prev_7d"]],
                         key=lambda v: -(v["sessions_7d"] + v["sessions_prev_7d"]))[:12]

    pack = {
        "today": d(TODAY),
        "users_7d": users_now, "users_prev_7d": users_prev,
        "search_clicks_7d": cw, "search_clicks_prev_7d": pw, "search_impr_7d": iw, "search_impr_prev_7d": ipw,
        "channels": ch_diff, "sources": top_sources,
        "groups": groups,
        "queries_missed": [qrow(q) for q in missed],
        "queries_won": [qrow(q) for q in won],
        "top_landing_7d": ga.get("top_landing", []),
        "symptoms": [x["problem"] for x in state["issues"][:5]],
        "experiments": [{k: j.get(k) for k in ("id", "name", "kind", "targets", "started", "unit", "pre_per_day",
                                               "post_per_day", "post_days", "change", "urls_with_impr", "verdict")}
                        for j in judgments],
        "past_proposals": [{"name": e.get("name"), "targets": e.get("targets"), "status": e.get("status"),
                            "lesson": e.get("lesson", "")} for e in exps][-30:],
    }
    state["metrics"]["groups"] = groups
    analysis = parse_json_block(call_claude(
        ANALYSIS_PROMPT.format(data=json.dumps(pack, ensure_ascii=False, indent=1)), 6000, ANALYSIS_MODEL))
    if isinstance(analysis, dict):
        proposal = clean_proposal(analysis.get("proposal"))
        analysis["proposal"] = proposal
        by_id = {e.get("id"): e for e in exps}
        for rv in analysis.get("reviews") or []:
            if not isinstance(rv, dict):
                continue
            comment = str(rv.get("comment", "")).strip()
            for j in judgments:
                if j["id"] == rv.get("id") and comment:
                    j["comment"] = comment
                    e = by_id.get(j["id"])
                    if e and not j.get("tracking_only"):
                        e["lesson"] = comment
        if proposal:
            for e in exps:
                if e.get("status") == "proposed":
                    e["status"] = "skipped"
            pid = new_experiment_id(proposal["name"], exps)
            proposal["id"] = pid
            exps.append({"id": pid, "name": proposal["name"], "kind": proposal["kind"], "targets": proposal["targets"],
                         "status": "proposed", "proposed": d(TODAY), "started": None, "fix_count": 0,
                         "what": proposal["what"], "metric_week": proposal["metric_week"], "checks": []})
        else:
            state["pending"].append({"detail": "今週の大改修の案が決まりの形で出なかったので、記録していません（来週もう一度）"})
        state["analysis"] = analysis
    else:
        state["pending"].append({"detail": "分析（Claude）が失敗したので、今週の大改修の案はありません（Actions のログを確認）"})
    exp_data["experiments"] = exps[-120:]

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
        save_json(EXPERIMENTS, exp_data)
    save_json(STATE, state)
    with open(os.path.join(OUT_DIR, "changed_urls.txt"), "w") as f:
        f.write("\n".join(state["changed_urls"]) + ("\n" if state["changed_urls"] else ""))
    log(f"課題{len(state['issues'])} / やったこと{len(state['actions'])} / 変更URL{len(state['changed_urls'])}")
    return 0


# ───────────────────────── start ─────────────────────────

def start(exp_id: str, date: str) -> int:
    """案を「開始した」に変える。id を省くと、いちばん新しい案"""
    data = load_experiments()
    exps = data["experiments"]
    try:
        when = dt.date.fromisoformat(date) if date else TODAY
    except ValueError:
        log("日付の形が違います（例 2026-11-14）:", date)
        return 1
    if exp_id:
        cand = [e for e in exps if e.get("id") == exp_id and e.get("status") in ("proposed", "skipped")]
    else:
        cand = [e for e in exps if e.get("status") == "proposed"]
    os.makedirs(OUT_DIR, exist_ok=True)
    if not cand:
        msg = "開始できる案がありません（id の打ち間違いか、もう開始済みです）。data/agent/experiments.json を確認してください。"
        code = 1
    else:
        e = cand[-1]
        e.update(status="running", started=d(when), fix_count=0)
        save_json(EXPERIMENTS, data)
        msg = (f"改修「{e.get('name')}」（{e.get('id')}）を {d(when)} 開始として記録しました。"
               f"次の土曜から、対象 {'、'.join(e.get('targets', []))} の数字で判定します。")
        code = 0
    with open(os.path.join(OUT_DIR, "report.md"), "w", encoding="utf-8") as f:
        f.write(msg + "\n")
    print(msg)
    return code


# ───────────────────────── report ─────────────────────────

SETUP_HELP = """## 今ある課題
1. 成長エージェントが Google（GA4・Search Console）のデータを読めていません：{err}

## 解決策
1. サービスアカウントの鍵を Secrets `GOOGLE_SERVICE_ACCOUNT_JSON` に入れ、GA4 のプロパティIDを `GA4_PROPERTY_ID` に入れる。サービスアカウントのメールアドレスを GA4（閲覧者）と Search Console（制限付き）に追加する

## 実際にやったこと
- なし
"""


def judgment_line(j: dict) -> str:
    v = VERDICT_JA.get(j.get("verdict", ""), j.get("verdict", ""))
    nums = f"{j['unit']} 1日{j['pre_per_day']} → {j['post_per_day']}（{j['change']}、開始後{j['post_days']}日分）"
    if j.get("kind") == "search" and "urls_with_impr" in j:
        nums += f"、表示があったURL {j.get('urls_before', 0)} → {j['urls_with_impr']}"
    line = f"- 「{j['name']}」（{j['started']} 開始）: {nums} → **{v}**"
    if j.get("comment"):
        line += f"。{j['comment']}"
    return line


def render_report(state: dict, status: str) -> str:
    """「今ある課題」「解決策」「実際にやったこと」の3項目だけのレポート"""
    an = state.get("analysis") if isinstance(state.get("analysis"), dict) else None
    judged = [j for j in state.get("judgments", []) if not j.get("tracking_only")]
    tracked = [j for j in state.get("judgments", []) if j.get("tracking_only")]
    L: list[str] = ["## 今ある課題", "", "**前週までの改修の判定**"]
    L += [judgment_line(j) for j in judged]
    for u in state.get("unstarted", []):
        L.append(f"- 「{u['name']}」（{u.get('proposed')} の案）は未着手。今週の案に置き換えました"
                 f"（やはり始めるなら mode=start で id `{u['id']}` を指定）")
    if not judged and not state.get("unstarted"):
        L.append("- 判定する改修はまだありません")
    L += ["", "**母数の天井を決めている原因**"]
    if an:
        L.append(str(an.get("root_cause", "")).strip() or "（原因を特定できませんでした）")
        L += [f"- {str(c).strip()}" for c in (an.get("chain") or [])[:3] if str(c).strip()]
        if str(an.get("stuck_by_choice", "")).strip():
            L.append(f"- 選択肢が多くて止まっている場所: {str(an['stuck_by_choice']).strip()}")
    else:
        issues = state.get("issues", [])[:3]
        L += [f"- {x['problem']}" for x in issues] or ["- 分析に失敗しました（機械的に見つかった課題もなし）"]

    L += ["", "## 解決策", ""]
    p = an.get("proposal") if an else None
    if p:
        L += [f"**今週の大改修: {p['name']}**",
              f"- 何を変えるか: {p['what']}" + (f"（規模: {p['scale']}）" if p.get("scale") else ""),
              f"- なぜ母数が増えるか: {p['why']}"]
        if p.get("formula"):
            L.append(f"- 見込みの計算: {p['formula']}")
        if str(an.get("stop", "")).strip():
            L.append(f"- やめること: {str(an['stop']).strip()}")
        L.append(f"- 1週間後の判定: {p.get('metric_week') or '対象の1日あたりの数字が開始前の1.3倍以上なら伸ばす'}"
                 f"（対象 {'、'.join(p['targets'])}）")
        if p.get("metric_follow"):
            L.append(f"- 追跡: {p['metric_follow']}")
        if p.get("concerns"):
            L.append(f"- 懸念: {p['concerns']}")
        if p.get("first_step"):
            L.append(f"- 最初の一歩: {p['first_step']}")
        if str(an.get("alt", "")).strip():
            L += ["", f"対案: {str(an['alt']).strip()}"]
        if str(an.get("question", "")).strip():
            L += ["", f"**→ {str(an['question']).strip()}**"]
        L += ["", "やる場合: 下の依頼文を Claude に渡して作る → 反映した日に Actions →「Growth agent」→ Run workflow → mode=`start`"
                  f"（案の id は `{p.get('id', '')}`。空欄のままでもこの案が選ばれます）"]
        if p.get("brief"):
            L += ["", "<details><summary>実装の依頼文</summary>", "", p["brief"], "", "</details>"]
    else:
        issues = state.get("issues", [])[:3]
        L += ["今週の大改修の案は出せませんでした。機械的に見つかった打ち手だけ載せます。"]
        L += [f"- {x['solution']}" for x in issues]

    L += ["", "## 実際にやったこと", ""]
    acts = [f"- {a['detail']}" for a in state.get("actions", [])]
    acts += [f"- 未実施（要判断）：{x['detail']}" for x in state.get("pending", [])]
    L += acts or ["- 自動で反映した変更はなし"]
    if tracked:
        L += ["", "**判定済みの改修（数字だけ追跡）**"]
        L += [judgment_line(j) for j in tracked]
    if status == "dryrun":
        L += ["", "（試し実行のため、改修の判定と案は記録していません）"]
    return "\n".join(L) + "\n"


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
        body = render_report(state, status)

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
    p3 = sub.add_parser("start")
    p3.add_argument("--id", default="", help="開始する案の id（空ならいちばん新しい案）")
    p3.add_argument("--date", default="", help="開始日 YYYY-MM-DD（空なら今日）")
    a = ap.parse_args()
    if a.cmd == "plan":
        return plan(a.dry)
    if a.cmd == "start":
        return start(a.id.strip(), a.date.strip())
    return report(a.status, a.pr_url, not a.no_post)


if __name__ == "__main__":
    sys.exit(main())
