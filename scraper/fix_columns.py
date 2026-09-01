#!/usr/bin/env python3
"""
fix_columns.py — 既存コラムの callout 記法を一括正規化する

生成時のプロンプト修正より前に作られたコラムには、
  ・::: tip 記法（レンダラーが解釈できず素の文字で出る）
  ・<div class="callout-tip"> という生HTML
が残っている。これを標準Markdownに書き換える。

環境変数:
  SUPABASE_URL          : https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY  : service_role キー（UPDATE に必要）
  CALLOUT_STYLE         : blockquote（既定） / plain

使い方:
  python scraper/fix_columns.py --report                 # 対象を一覧（既定・書き込みなし）
  python scraper/fix_columns.py --report --scope all     # 公開済みも含めて確認
  python scraper/fix_columns.py --diff auto_20260430_1   # 1本の変更前後を表示
  python scraper/fix_columns.py --fix --scope all        # 実際に書き換える
  python scraper/fix_columns.py --fix --only auto_20260430_1
"""
from __future__ import annotations
import os, re, sys, json, base64, argparse, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

JST   = timezone(timedelta(hours=9))
TABLE = "columns"


# ══════════════════════════════════════════════════════════
#  正規化ロジック（gen_column.py の normalize_body と同一仕様）
# ══════════════════════════════════════════════════════════
CALLOUT_ICON = {
    "tip": "💡", "info": "ℹ️", "note": "📝",
    "warn": "⚠️", "warning": "⚠️", "caution": "⚠️", "danger": "🚨",
}
CALLOUT_STYLE = os.environ.get("CALLOUT_STYLE", "blockquote").lower()

_FENCE_START = re.compile(
    r'^\s*:{3,}\s*(tip|info|note|warn|warning|danger|caution)\b\s*(.*?)\s*$', re.I)
_FENCE_END   = re.compile(r'^\s*:{3,}\s*$')
_HTML_START  = re.compile(r'^\s*<div\s+class=["\']callout-(\w+)["\']\s*>\s*(.*)$', re.I)
_TITLE_DIV   = re.compile(r'<div\s+class=["\']callout-title["\']\s*>(.*?)</div>', re.I | re.S)
_ANY_DIV     = re.compile(r'</?div[^>]*>', re.I)
_HEADING     = re.compile(r'^\s{0,3}#{1,6}\s')


def _render_callout(kind: str, title: str, body_lines: list) -> str:
    icon  = CALLOUT_ICON.get(kind.lower(), "💡")
    title = (title or "").strip()
    head  = f"**{icon} {title}**" if title else f"**{icon}**"
    body  = [l.strip() for l in body_lines if l.strip()]
    if CALLOUT_STYLE == "blockquote":
        return "\n".join([f"> {head}", ">"] + [f"> {l}" for l in body])
    return "\n\n".join([head] + body)


def normalize_body(body: str) -> tuple[str, dict]:
    stats = {"fence": 0, "html": 0, "stray_div": 0, "orphan_fence": 0, "unclosed": 0}
    body  = (body or "").replace("\r\n", "\n")
    lines = body.split("\n")
    out, i, n = [], 0, len(lines)

    while i < n:
        line = lines[i]

        m = _FENCE_START.match(line)
        if m:
            kind, title = m.group(1), m.group(2)
            i += 1
            buf = []
            # 閉じ ::: が無いまま見出しや次の吹き出しに突入したら、そこで打ち切る
            while i < n and not _FENCE_END.match(lines[i]):
                if _HEADING.match(lines[i]) or _FENCE_START.match(lines[i]):
                    stats["unclosed"] += 1
                    break
                buf.append(lines[i]); i += 1
            else:
                i += 1
            if i < n and _FENCE_END.match(lines[i]):
                i += 1
            while buf and not buf[-1].strip():
                buf.pop()
            out.append(_render_callout(kind, title, buf)); out.append("")
            stats["fence"] += 1
            continue

        m = _HTML_START.match(line)
        if m:
            kind = m.group(1)
            chunk_lines = [m.group(2)]
            depth = (1 + len(re.findall(r'<div\b', m.group(2), re.I))
                       - len(re.findall(r'</div>', m.group(2), re.I)))
            i += 1
            while i < n and depth > 0:
                l = lines[i]
                depth += len(re.findall(r'<div\b', l, re.I))
                depth -= len(re.findall(r'</div>', l, re.I))
                chunk_lines.append(l); i += 1
            chunk = "\n".join(chunk_lines)
            tm = _TITLE_DIV.search(chunk)
            title = tm.group(1).strip() if tm else ""
            chunk = _ANY_DIV.sub("", _TITLE_DIV.sub("", chunk))
            out.append(_render_callout(kind, title, chunk.split("\n"))); out.append("")
            stats["html"] += 1
            continue

        out.append(line); i += 1

    text = "\n".join(out)

    stray = len(_ANY_DIV.findall(text))
    if stray:
        stats["stray_div"] = stray
        text = _ANY_DIV.sub("", text)

    # 対で閉じられなかった ::: の残骸を落とす
    kept = []
    for l in text.split("\n"):
        if _FENCE_END.match(l) or _FENCE_START.match(l):
            stats["orphan_fence"] += 1
            continue
        kept.append(l)
    text = "\n".join(kept)

    text = re.sub(r'[ \t]+\n', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip() + "\n", stats


def needs_fix(body: str) -> bool:
    b = body or ""
    return bool(
        _ANY_DIV.search(b)
        or re.search(r'callout-', b, re.I)
        or any(_FENCE_START.match(l) or _FENCE_END.match(l) for l in b.split("\n"))
    )


# ══════════════════════════════════════════════════════════
#  Supabase
# ══════════════════════════════════════════════════════════
class SbError(RuntimeError):
    pass


def key_role(key: str) -> str | None:
    try:
        p = key.split(".")[1]; p += "=" * (-len(p) % 4)
        return json.loads(base64.urlsafe_b64decode(p)).get("role")
    except Exception:
        return None


def config() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url:
        raise SbError("SUPABASE_URL が未設定です")
    if not key:
        raise SbError("SUPABASE_SERVICE_KEY が未設定です（書き換えには service_role キーが必要）")
    return url, key


def _request(method: str, path: str, body: bytes | None = None, extra: dict | None = None):
    url, key = config()
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    headers.update(extra or {})
    req = urllib.request.Request(f"{url}/rest/v1/{path}", data=body,
                                 headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        hint = ""
        if e.code in (401, 403):
            hint = "\n  → service_role キーか確認してください"
        raise SbError(f"{method} {path} が {e.code} {e.reason}\n  応答: {detail}{hint}")
    except urllib.error.URLError as e:
        raise SbError(f"{method} {path} に接続できません: {e.reason}")


def fetch(scope: str, only: str | None) -> list[dict]:
    sel = "select=id,title,status,date,body&order=date.asc"
    if only:
        return _request("GET", f"{TABLE}?id=eq.{only}&{sel}")
    if scope == "draft":
        return _request("GET", f"{TABLE}?status=eq.draft&{sel}")
    if scope == "published":
        return _request("GET", f"{TABLE}?status=eq.published&{sel}")
    return _request("GET", f"{TABLE}?{sel}")


def update_body(col_id: str, body: str) -> None:
    payload = json.dumps({
        "body": body,
        "updated_at": datetime.now(JST).isoformat(),
    }).encode("utf-8")
    _request("PATCH", f"{TABLE}?id=eq.{col_id}", payload, {"Prefer": "return=minimal"})


# ══════════════════════════════════════════════════════════
def show_diff(col: dict) -> None:
    before = col.get("body") or ""
    after, stats = normalize_body(before)
    print(f"\n=== {col['id']}（{col.get('status')}）「{col.get('title','')}」 ===")
    print(f"検出: :::記法 {stats['fence']} / HTML {stats['html']} "
          f"/ 裸div {stats['stray_div']} / 孤立::: {stats['orphan_fence']}")
    b_lines = before.split("\n")
    a_lines = after.split("\n")
    import difflib
    diff = list(difflib.unified_diff(b_lines, a_lines, "before", "after", lineterm="", n=2))
    print("\n".join(diff[:120]) if diff else "（変更なし）")
    if len(diff) > 120:
        print(f"... 他 {len(diff) - 120} 行")


def run(scope: str, only: str | None, do_fix: bool) -> int:
    url, key = config()
    print(f"[fix] 接続先: {url.split('//')[-1]}")
    print(f"[fix] キーのrole: {key_role(key) or '不明'}")
    print(f"[fix] 対象範囲: {only or scope} / callout形式: {CALLOUT_STYLE}")

    cols = fetch(scope, only)
    print(f"[fix] 取得: {len(cols)} 件")

    targets = [c for c in cols if needs_fix(c.get("body") or "")]
    print(f"[fix] 要修正: {len(targets)} 件\n")

    total = {"fence": 0, "html": 0, "stray_div": 0, "orphan_fence": 0, "unclosed": 0}
    for c in targets:
        after, stats = normalize_body(c.get("body") or "")
        for k in total:
            total[k] += stats[k]
        mark = "🔧" if do_fix else "○"
        print(f"[fix] {mark} {c['id']} [{c.get('status')}] 「{c.get('title','')[:36]}」")
        print(f"[fix]      :::記法 {stats['fence']} / HTML {stats['html']} "
              f"/ 裸div {stats['stray_div']} / 孤立::: {stats['orphan_fence']} "
              f"/ 閉じ忘れ {stats['unclosed']} "
              f"/ {len(c.get('body') or '')}→{len(after)}文字")
        if do_fix:
            update_body(c["id"], after)

    print(f"\n[fix] 合計: :::記法 {total['fence']} / HTML {total['html']} "
          f"/ 裸div {total['stray_div']} / 孤立::: {total['orphan_fence']} "
          f"/ 閉じ忘れ {total['unclosed']}")
    if do_fix:
        print(f"[fix] ✅ {len(targets)} 件を書き換えました")
    else:
        print("[fix] 判定のみ。実行するには --fix を付けてください")
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--report", action="store_true", help="判定のみ（既定）")
    p.add_argument("--fix",    action="store_true", help="実際に書き換える")
    p.add_argument("--diff",   metavar="COL_ID",   help="1本の変更前後を表示")
    p.add_argument("--only",   metavar="COL_ID",   help="対象を1本に限定")
    p.add_argument("--scope",  choices=["draft", "published", "all"], default="draft")
    a = p.parse_args()

    try:
        if a.diff:
            rows = fetch("all", a.diff)
            if not rows:
                print(f"[fix] {a.diff} が見つかりません", file=sys.stderr); sys.exit(1)
            show_diff(rows[0]); sys.exit(0)
        sys.exit(run(a.scope, a.only, a.fix))
    except SbError as e:
        print(f"[fix] ❌ Supabaseエラー: {e}", file=sys.stderr)
        sys.exit(2)
