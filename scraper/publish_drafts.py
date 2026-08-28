#!/usr/bin/env python3
"""
publish_drafts.py — 下書きコラムを検査して自動公開する

status='draft' のコラムのうち、
  ・作成から一定時間が経過していて
  ・品質チェックをすべて通過したもの
だけを status='published' に更新する。

環境変数:
  SUPABASE_URL          : https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY  : service_role キー（UPDATE に必要）
                          無ければ SUPABASE_KEY にフォールバック

使い方:
  python scraper/publish_drafts.py --report          # 判定だけ表示（既定）
  python scraper/publish_drafts.py --publish         # 実際に公開する
  python scraper/publish_drafts.py --publish --max 5 --delay-hours 0
"""
from __future__ import annotations
import os, re, sys, json, argparse, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=9))

# ── 公開ポリシー ────────────────────────────────────────
MIN_CHARS      = 1500
MAX_CHARS      = 9000
MAX_TITLE      = 70
DEFAULT_DELAY  = 6      # 生成から何時間空けてから公開するか
DEFAULT_MAX    = 2      # 1回の実行で公開する上限（一気に出さない）

# 断定的・誇大な効能表現。YMYLでは公開前に人が見るべきもの
BANNED = [
    "必ず治", "確実に治", "誰でも治", "すぐ治ります",
    "副作用はありません", "副作用はない", "副作用の心配はありません",
    "絶対に安全", "100%安全", "完全に安全",
    "医師の診察は不要", "病院に行く必要はありません", "受診しなくても",
    "がんが治", "病気が治ります",
]

# 本文に残っていてはいけない生成物の痕跡
ARTIFACTS = [
    (r"<\s*/?\s*(div|span|p|br|table|tr|td|th)\b", "HTMLタグが残っている"),
    (r"\{IMAGE_BASE_URL\}",                        "画像URLのプレースホルダが未置換"),
    (r"\{\{\s*FIG\s*:",                            "図解のプレースホルダが未置換"),
    (r"^\s*:{3,}\s*(tip|warn|warning|danger|info|note)?\s*$", "::: 記法が変換されずに残っている"),
    (r"callout-",                                  "callout用クラス名が残っている"),
    (r"```json",                                   "JSONコードフェンスが混入している"),
]

IMG_RE = re.compile(r'!\[[^\]]*\]\((https?://[^)\s]+)\)')


# ── Supabase ────────────────────────────────────────────
def _sb():
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY", "")
    if not url or not key:
        print("[pub] SUPABASE_URL / SUPABASE_SERVICE_KEY が未設定", file=sys.stderr)
        sys.exit(2)
    return url, key


def _get(path: str):
    url, key = _sb()
    req = urllib.request.Request(
        f"{url}/rest/v1/{path}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        method="GET")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_drafts() -> list[dict]:
    return _get("columns?status=eq.draft&select=id,title,date,summary,body,updated_at"
                "&order=date.asc")


def fetch_published_titles() -> set[str]:
    rows = _get("columns?status=eq.published&select=title")
    return {(r.get("title") or "").strip() for r in rows}


def publish(col_id: str) -> bool:
    url, key = _sb()
    payload = json.dumps({
        "status": "published",
        "updated_at": datetime.now(JST).isoformat(),
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{url}/rest/v1/columns?id=eq.{col_id}",
        data=payload,
        headers={
            "apikey": key, "Authorization": f"Bearer {key}",
            "Content-Type": "application/json", "Prefer": "return=minimal",
        },
        method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=30):
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")[:300]
        print(f"[pub] 公開失敗 {col_id}: {e.code} {body}", file=sys.stderr)
        if e.code in (401, 403):
            print("[pub]   → anonキーではUPDATEが拒否されます。"
                  "SUPABASE_SERVICE_KEY をSecretsに設定してください", file=sys.stderr)
    except Exception as e:
        print(f"[pub] 公開失敗 {col_id}: {e}", file=sys.stderr)
    return False


# ── 検査 ────────────────────────────────────────────────
def url_alive(u: str) -> bool:
    try:
        req = urllib.request.Request(u, method="HEAD")
        with urllib.request.urlopen(req, timeout=15) as r:
            return 200 <= r.status < 400
    except urllib.error.HTTPError as e:
        return 200 <= e.code < 400
    except Exception:
        return False


def inspect(col: dict, published_titles: set[str], check_images: bool) -> list[str]:
    """通過なら空リスト、問題があれば理由のリストを返す"""
    ng: list[str] = []
    body  = col.get("body") or ""
    title = (col.get("title") or "").strip()

    if not title:
        ng.append("タイトルが空")
    elif len(title) > MAX_TITLE:
        ng.append(f"タイトルが長すぎる（{len(title)}文字 > {MAX_TITLE}）")
    if title and title in published_titles:
        ng.append("同じタイトルの公開済みコラムが既にある")

    if not (col.get("summary") or "").strip():
        ng.append("サマリーが空")

    n = len(body)
    if n < MIN_CHARS:
        ng.append(f"本文が短すぎる（{n}文字 < {MIN_CHARS}）")
    elif n > MAX_CHARS:
        ng.append(f"本文が長すぎる（{n}文字 > {MAX_CHARS}）")

    for pat, msg in ARTIFACTS:
        if re.search(pat, body, re.I | re.M):
            ng.append(msg)

    for w in BANNED:
        if w in body:
            ng.append(f"断定的な表現が含まれる: 「{w}」")

    if "出典" not in body:
        ng.append("出典の記載がない")
    if not re.search(r"(薬剤師|医師|登録販売者)", body):
        ng.append("専門家への相談導線がない")

    if check_images:
        for u in dict.fromkeys(IMG_RE.findall(body)):
            if not url_alive(u):
                ng.append(f"画像が存在しない: {u}")

    return ng


def age_hours(col: dict) -> float:
    raw = col.get("updated_at") or ""
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds() / 3600
    except Exception:
        return 999.0


# ── 実行 ────────────────────────────────────────────────
def run(do_publish: bool, limit: int, delay_hours: float, check_images: bool) -> int:
    drafts = fetch_drafts()
    print(f"[pub] 下書き: {len(drafts)} 件")
    if not drafts:
        return 0

    published_titles = fetch_published_titles()
    ok_list, ng_list, wait_list = [], [], []

    for col in drafts:
        age = age_hours(col)
        if age < delay_hours:
            wait_list.append((col, age))
            continue
        reasons = inspect(col, published_titles, check_images)
        (ng_list if reasons else ok_list).append((col, reasons))

    for col, age in wait_list:
        print(f"[pub] ⏳ 待機 {col['id']}（生成から{age:.1f}時間 / {delay_hours}時間待ち）")

    for col, reasons in ng_list:
        print(f"[pub] ❌ 保留 {col['id']} 「{col.get('title','')}」")
        for r in reasons:
            print(f"[pub]      - {r}")

    done = 0
    for col, _ in ok_list:
        if done >= limit:
            print(f"[pub] ⏸ 上限{limit}件に達したため {col['id']} は次回に回します")
            continue
        if do_publish:
            if publish(col["id"]):
                print(f"[pub] ✅ 公開 {col['id']} 「{col.get('title','')}」")
                done += 1
            else:
                return 1
        else:
            print(f"[pub] ○ 公開可 {col['id']} 「{col.get('title','')}」（--publish で実行）")
            done += 1

    print(f"[pub] 公開{'' if do_publish else '候補'}: {done} 件 / 保留: {len(ng_list)} 件 "
          f"/ 待機: {len(wait_list)} 件")

    # 保留があればサマリーをGitHub Actionsに渡す
    out = os.environ.get("GITHUB_OUTPUT")
    if out and ng_list:
        lines = []
        for col, reasons in ng_list:
            lines.append(f"- **{col['id']}**「{col.get('title','')}」")
            lines += [f"  - {r}" for r in reasons]
        with open(out, "a", encoding="utf-8") as f:
            f.write("blocked<<EOF\n" + "\n".join(lines) + "\nEOF\n")
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--publish",      action="store_true", help="実際に公開する（既定は判定のみ）")
    p.add_argument("--report",       action="store_true", help="判定のみ（既定）")
    p.add_argument("--max",          type=int,   default=DEFAULT_MAX)
    p.add_argument("--delay-hours",  type=float, default=DEFAULT_DELAY)
    p.add_argument("--no-check-images", action="store_true")
    a = p.parse_args()
    sys.exit(run(a.publish, a.max, a.delay_hours, not a.no_check_images))
