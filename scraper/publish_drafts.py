#!/usr/bin/env python3
"""
publish_drafts.py v2 — 下書きコラムを検査して自動公開する

status='draft' のコラムのうち、
  ・作成から一定時間が経過していて
  ・品質チェックをすべて通過したもの
だけを status='published' に更新する。

v2の変更点:
  - Supabaseとの通信エラーを捕捉し、原因のわかるメッセージを出す
  - キーの role（service_role / anon）をJWTから判定して事前に警告
  - --selftest で接続だけを確認できる

環境変数:
  SUPABASE_URL          : https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY  : service_role キー（UPDATE に必要）

使い方:
  python scraper/publish_drafts.py --selftest        # 接続確認だけ
  python scraper/publish_drafts.py --report          # 判定だけ表示（既定）
  python scraper/publish_drafts.py --publish         # 実際に公開する
  python scraper/publish_drafts.py --publish --max 5 --delay-hours 0
"""
from __future__ import annotations
import os, re, sys, json, base64, argparse, urllib.request, urllib.error

from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=9))

# ── 公開ポリシー ────────────────────────────────────────
MIN_CHARS     = 1500
MAX_CHARS     = 9000
MAX_TITLE     = 70
DEFAULT_DELAY = 6      # 生成から何時間空けてから公開するか
DEFAULT_MAX   = 2      # 1回の実行で公開する上限（一気に出さない）

TABLE = "columns"

BANNED = [
    "必ず治", "確実に治", "誰でも治", "すぐ治ります",
    "副作用はありません", "副作用はない", "副作用の心配はありません",
    "絶対に安全", "100%安全", "完全に安全",
    "医師の診察は不要", "病院に行く必要はありません", "受診しなくても",
    "がんが治", "病気が治ります",
]

ARTIFACTS = [
    (r"<\s*/?\s*(div|span|p|br|table|tr|td|th)\b", "HTMLタグが残っている"),
    (r"\{IMAGE_BASE_URL\}",                        "画像URLのプレースホルダが未置換"),
    (r"\{\{\s*FIG\s*:",                            "図解のプレースホルダが未置換"),
    (r"^\s*:{3,}\s*(tip|warn|warning|danger|info|note)?\s*$", "::: 記法が変換されずに残っている"),
    (r"callout-",                                  "callout用クラス名が残っている"),
    (r"```json",                                   "JSONコードフェンスが混入している"),
]

IMG_RE = re.compile(r'!\[[^\]]*\]\((https?://[^)\s]+)\)')


# ══════════════════════════════════════════════════════════
#  Supabase
# ══════════════════════════════════════════════════════════
class SbError(RuntimeError):
    pass


def key_role(key: str) -> str | None:
    """SupabaseキーはJWT。payloadのroleクレームを読む（通信なし）"""
    try:
        payload = key.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get("role")
    except Exception:
        return None


def config() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url:
        raise SbError("SUPABASE_URL が未設定です")
    if not key:
        raise SbError("SUPABASE_SERVICE_KEY が未設定です。"
                      "anonキーではRLSによりUPDATEが拒否されるため、"
                      "service_role キーが必要です")
    if not url.startswith("http"):
        raise SbError(f"SUPABASE_URL の形式が不正です（https:// から始まる必要があります）: {url[:40]}")
    return url, key


def _request(method: str, path: str, body: bytes | None = None,
             extra_headers: dict | None = None):
    url, key = config()
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    headers.update(extra_headers or {})

    full = f"{url}/rest/v1/{path}"
    req = urllib.request.Request(full, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:500]
        hint = ""
        if e.code in (401, 403):
            hint = ("\n  → キーが無効か、RLSで拒否されています。"
                    "SUPABASE_SERVICE_KEY が service_role キーか確認してください")
        elif e.code == 404:
            hint = (f"\n  → テーブル '{TABLE}' が見つかりません。テーブル名を確認してください")
        elif e.code == 400:
            hint = ("\n  → クエリが不正です。select= で指定した列が実在するか確認してください")
        raise SbError(f"{method} {path} が {e.code} {e.reason} で失敗\n  応答: {detail}{hint}")
    except urllib.error.URLError as e:
        raise SbError(f"{method} {path} に接続できません: {e.reason}\n"
                      f"  → SUPABASE_URL のホスト名を確認してください")
    except json.JSONDecodeError as e:
        raise SbError(f"{method} {path} の応答がJSONではありません: {e}")


def fetch_drafts() -> list[dict]:
    return _request("GET", f"{TABLE}?status=eq.draft"
                           f"&select=id,title,date,summary,body,updated_at&order=date.asc")


def fetch_published_titles() -> set[str]:
    rows = _request("GET", f"{TABLE}?status=eq.published&select=title")
    return {(r.get("title") or "").strip() for r in rows}


def publish(col_id: str) -> None:
    payload = json.dumps({
        "status": "published",
        "updated_at": datetime.now(JST).isoformat(),
    }).encode("utf-8")
    _request("PATCH", f"{TABLE}?id=eq.{col_id}", payload,
             {"Prefer": "return=minimal"})


# ══════════════════════════════════════════════════════════
#  検査
# ══════════════════════════════════════════════════════════
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


# ══════════════════════════════════════════════════════════
def preflight() -> None:
    """設定内容を要約して表示。異常があればここで気づける"""
    url, key = config()
    host = url.split("//", 1)[-1]
    role = key_role(key)
    print(f"[pub] 接続先: {host}")
    print(f"[pub] キーのrole: {role or '不明（JWTとして解読できず）'}")
    if role and role != "service_role":
        print(f"[pub] ⚠️ role が '{role}' です。公開(UPDATE)には service_role キーが必要です。"
              f"Secretsの値を確認してください", file=sys.stderr)
    elif role is None:
        print("[pub] ⚠️ キーがJWT形式ではありません。値が途中で切れていないか確認してください",
              file=sys.stderr)


def selftest() -> int:
    preflight()
    drafts = fetch_drafts()
    pub    = fetch_published_titles()
    print(f"[pub] 読み取りOK: 下書き {len(drafts)} 件 / 公開済み {len(pub)} 件")
    if drafts:
        print(f"[pub] 最も古い下書き: {drafts[0]['id']} "
              f"（{age_hours(drafts[0]):.1f}時間前）")
    print("[pub] ✅ 接続確認は正常です")
    return 0


def run(do_publish: bool, limit: int, delay_hours: float, check_images: bool) -> int:
    preflight()
    drafts = fetch_drafts()
    print(f"[pub] 下書き: {len(drafts)} 件")
    if not drafts:
        print("[pub] 公開対象なし")
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
            publish(col["id"])
            print(f"[pub] ✅ 公開 {col['id']} 「{col.get('title','')}」")
        else:
            print(f"[pub] ○ 公開可 {col['id']} 「{col.get('title','')}」（--publish で実行）")
        done += 1

    print(f"[pub] 公開{'' if do_publish else '候補'}: {done} 件 "
          f"/ 保留: {len(ng_list)} 件 / 待機: {len(wait_list)} 件")

    out = os.environ.get("GITHUB_OUTPUT")
    if out and ng_list:
        lines = []
        for col, reasons in ng_list:
            lines.append(f"- **{col['id']}**「{col.get('title','')}」")
            lines += [f"  - {r}" for r in reasons]
        with open(out, "a", encoding="utf-8") as f:
            f.write("blocked<<PUBEOF\n" + "\n".join(lines) + "\nPUBEOF\n")
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--publish",     action="store_true", help="実際に公開する（既定は判定のみ）")
    p.add_argument("--report",      action="store_true", help="判定のみ（既定）")
    p.add_argument("--selftest",    action="store_true", help="接続確認だけ行う")
    p.add_argument("--max",         type=int,   default=DEFAULT_MAX)
    p.add_argument("--delay-hours", type=float, default=DEFAULT_DELAY)
    p.add_argument("--no-check-images", action="store_true")
    a = p.parse_args()

    try:
        if a.selftest:
            sys.exit(selftest())
        sys.exit(run(a.publish, a.max, a.delay_hours, not a.no_check_images))
    except SbError as e:
        print(f"[pub] ❌ Supabaseエラー: {e}", file=sys.stderr)
        sys.exit(2)
    except KeyboardInterrupt:
        sys.exit(130)
