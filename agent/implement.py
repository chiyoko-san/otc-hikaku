#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
実装係: 週次Issueの提案ID -> コード生成 -> ドラフトPR

使い方:
  python agent/implement.py A-36-1          # 生成のみ（agent/out/impl/ に出力、PRなし）
  python agent/implement.py A-36-1 --pr     # ブランチ作成 + push + PR作成

必要な環境変数:
  ANTHROPIC_API_KEY
  GITHUB_TOKEN / GITHUB_REPOSITORY（--pr 時）
  IMPL_MODEL（省略時 claude-opus-5）
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent
OUT_DIR = BASE_DIR / "out" / "impl"

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
IMPL_MODEL = os.environ.get("IMPL_MODEL", "claude-opus-5")
PLAN_MAX_TOKENS = 2000
IMPL_MAX_TOKENS = int(os.environ.get("IMPL_MAX_TOKENS", "32000"))

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO = os.environ.get("GITHUB_REPOSITORY", "chiyoko-san/otc-hikaku")
AGENT_LABEL = "site-agent"
BASE_BRANCH = "main"

# 書き込み禁止（自己改変・権限昇格・依存追加の防止）
DENY_PREFIXES = (".github/", "agent/", ".git/")
DENY_FILES = {"package.json", "package-lock.json", "next.config.js",
              "next.config.mjs", "next.config.ts", "vercel.json"}
MAX_FILES = 6
MAX_READ_CHARS = 60000   # これを超える既存ファイルは自動実装しない（欠損防止）
SCAN_DIRS = ("app", "components", "lib", "public", "styles")


def log(msg):
    print(msg, flush=True)


def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# GitHub
# ---------------------------------------------------------------------------

def gh_headers():
    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def find_action_block(action_id):
    """site-agent ラベルのIssueから、指定IDの提案ブロックを抽出する。"""
    url = f"https://api.github.com/repos/{GITHUB_REPO}/issues"
    params = {"labels": AGENT_LABEL, "state": "all", "per_page": "10",
              "sort": "created", "direction": "desc"}
    r = requests.get(url, params=params, headers=gh_headers(), timeout=30)
    r.raise_for_status()
    pat = re.compile(
        rf"^###\s+{re.escape(action_id)}\b.*?(?=^###\s|^##\s|\Z)",
        re.M | re.S,
    )
    for iss in r.json():
        m = pat.search(iss.get("body") or "")
        if m:
            return iss, m.group(0).strip()
    die(f"{action_id} を含むIssueが見つかりませんでした")


def create_pr(branch, title, body):
    url = f"https://api.github.com/repos/{GITHUB_REPO}/pulls"
    r = requests.post(url, headers=gh_headers(), json={
        "title": title, "head": branch, "base": BASE_BRANCH, "body": body,
    }, timeout=30)
    if r.status_code == 422 and "already exists" in r.text:
        # 既存PRあり（再実行）: push済みなので既存PRを探して返す
        q = requests.get(url, headers=gh_headers(),
                         params={"head": f"{GITHUB_REPO.split('/')[0]}:{branch}",
                                 "state": "open"}, timeout=30)
        q.raise_for_status()
        prs = q.json()
        if prs:
            return prs[0], True
    r.raise_for_status()
    return r.json(), False


def comment_issue(issue_number, body):
    url = f"https://api.github.com/repos/{GITHUB_REPO}/issues/{issue_number}/comments"
    requests.post(url, headers=gh_headers(), json={"body": body}, timeout=30)


# ---------------------------------------------------------------------------
# Claude API
# ---------------------------------------------------------------------------

def call_claude(system, user, max_tokens, max_retries=3):
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }
    payload = {
        "model": IMPL_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    last = None
    for attempt in range(max_retries):
        try:
            r = requests.post(ANTHROPIC_URL, headers=headers,
                              json=payload, timeout=900)
            if r.status_code in (429, 500, 503, 529):
                time.sleep(15 * (attempt + 1))
                continue
            r.raise_for_status()
            data = r.json()
            if data.get("stop_reason") == "max_tokens":
                die("生成が max_tokens で途切れました。不完全なコードでPRは作りません。"
                    "IMPL_MAX_TOKENS を増やすか、提案を分割してください。")
            return "".join(b.get("text", "") for b in data.get("content", [])
                           if b.get("type") == "text")
        except SystemExit:
            raise
        except Exception as e:
            last = e
            time.sleep(10 * (attempt + 1))
    die(f"Claude API 呼び出しに失敗しました: {last}")


def load_constitution():
    p = BASE_DIR / "constitution.md"
    text = p.read_text(encoding="utf-8")
    return text.replace("{unavailable_data}", "-（実装タスクのため省略）")


def extract_json(text):
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        s, e = t.find("{"), t.rfind("}")
        if s != -1 and e > s:
            return json.loads(t[s:e + 1])
    raise ValueError("JSON解析に失敗:\n" + t[:500])


# ---------------------------------------------------------------------------
# リポジトリ
# ---------------------------------------------------------------------------

def repo_tree():
    paths = []
    for base in SCAN_DIRS:
        d = REPO_ROOT / base
        if not d.exists():
            continue
        for f in d.rglob("*"):
            if f.is_file() and not any(p.startswith(".") for p in f.parts):
                paths.append(str(f.relative_to(REPO_ROOT)))
    return sorted(paths)[:800]


def safe_path(p):
    p = p.strip().lstrip("/").replace("\\", "/")
    if not p or ".." in p:
        die(f"不正なパス: {p}")
    if any(p.startswith(d) for d in DENY_PREFIXES) or p in DENY_FILES:
        die(f"書き込み禁止のパスです: {p}")
    return p


def read_existing(paths):
    out = {}
    for p in paths:
        fp = REPO_ROOT / p
        if not fp.exists():
            out[p] = None
            continue
        text = fp.read_text(encoding="utf-8", errors="replace")
        if len(text) > MAX_READ_CHARS:
            die(f"{p} が {len(text)}文字あり自動実装の上限({MAX_READ_CHARS})を超えます。"
                "全文を渡せないまま『完全なファイル』を生成すると内容が欠損するため、"
                "このタスクは手動で対応してください。")
        out[p] = text
    return out


# ---------------------------------------------------------------------------
# 生成
# ---------------------------------------------------------------------------

PLAN_SPEC = """
あなたは実装計画の担当です。以下の提案を実装するために、
(a) 内容を読む必要がある既存ファイル、(b) 新規に作るファイル、を選んでください。

有効なJSONのみを出力（コードフェンス禁止）:
{"read_files": ["既存ファイルのパス(最大6件)"],
 "new_files": ["新規作成するパス"],
 "approach": "実装方針を2文以内で"}

ファイル一覧に無いパスを read_files に入れてはいけません。
"""

IMPL_RULES = """
あなたは実装エンジニアです。以下のルールを厳守してください。

1. 変更・新規を問わず、各ファイルは必ず「完全な内容」を出力する。
   差分、省略、`// ...既存のまま` のような省略記法は絶対に禁止。
2. 既存コードのスタイル（インポート、命名、スタイリング手法）に合わせる。
3. 新しいnpmパッケージの追加は禁止。既存の依存だけで実装する。
4. 医療・安全に関わる文言は、提案ブロックに指定された文言をそのまま使う。
   指定のない医学的主張・診断的表現を追加しない。煽り表現・強調色は使わない。
5. 提案の範囲外のリファクタや無関係な変更をしない。
6. 実装が安全にできない場合（必要なファイルが見つからない等）は、
   ファイルを1つも出力せず META の notes に理由を書く。

出力フォーマット（これ以外を一切出力しない。前置き・コードフェンス禁止）:

===META===
{"pr_title": "PRタイトル(50字以内)", "notes": "レビュー時の注意点を2文以内"}
===FILE components/example/Example.tsx===
<このファイルの完全な内容>
===END FILE===

複数ファイルは ===FILE ...=== ブロックを繰り返す。
ファイル内容に ===END FILE=== という文字列を含めてはいけない。
"""


def parse_impl_output(text):
    m = re.search(r"===META===\s*(\{.*?\})\s*(?====FILE|\Z)", text, re.S)
    if not m:
        die("META ブロックが見つかりません:\n" + text[:500])
    meta = json.loads(m.group(1))
    files = re.findall(r"===FILE\s+(.+?)===\n(.*?)\n===END FILE===", text, re.S)
    return meta, [(p.strip(), c) for p, c in files]


def run(action_id, make_pr):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    constitution = load_constitution()

    log(f"[1] Issueから {action_id} を検索")
    issue, block = find_action_block(action_id)
    log(f"    Issue #{issue['number']}: {issue['title']}")

    if re.search(r"[｜|]\s*L3\b", block):
        die("この提案は L3（医療・法的記述の変更）です。自動実装の対象外なので手動で対応してください。")

    log("[2] 実装計画（読むファイルの選定）")
    tree = repo_tree()
    plan_user = ("## 提案ブロック\n" + block +
                 "\n\n## リポジトリのファイル一覧\n" + "\n".join(tree))
    plan = extract_json(call_claude(constitution + PLAN_SPEC, plan_user, PLAN_MAX_TOKENS))
    read_files = [safe_path(p) for p in (plan.get("read_files") or [])[:6]]
    log(f"    読む: {read_files}")
    log(f"    方針: {plan.get('approach','')}")

    contents = read_existing(read_files)
    missing = [p for p, v in contents.items() if v is None]
    if missing:
        log(f"    注意: 存在しないファイル {missing}（新規扱いで続行）")

    log("[3] コード生成")
    parts = ["## 提案ブロック\n" + block,
             "## 実装方針\n" + str(plan.get("approach", ""))]
    for p, v in contents.items():
        parts.append(f"## 既存ファイル: {p}\n```\n{v}\n```" if v is not None
                     else f"## {p} は存在しません（新規作成対象）")
    raw = call_claude(constitution + IMPL_RULES, "\n\n".join(parts), IMPL_MAX_TOKENS)
    (OUT_DIR / "raw_output.txt").write_text(raw, encoding="utf-8")

    meta, files = parse_impl_output(raw)
    if not files:
        die("生成対象なし。理由: " + str(meta.get("notes", "")))
    if len(files) > MAX_FILES:
        die(f"生成ファイルが{len(files)}件で上限({MAX_FILES})超過。提案を分割してください。")

    warnings = []
    written = []
    for path, content in files:
        path = safe_path(path)
        orig = contents.get(path)
        if orig and len(orig) > 2000 and len(content) < len(orig) * 0.4:
            warnings.append(f"⚠ `{path}` のサイズが大幅減 ({len(orig)}→{len(content)}文字)。欠損がないか要確認。")
        dst = OUT_DIR / path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(content, encoding="utf-8")
        written.append(path)
        log(f"    生成: {path} ({len(content)}文字)")

    summary = {"action_id": action_id, "issue": issue["number"],
               "files": written, "meta": meta, "warnings": warnings}
    (OUT_DIR / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    if not make_pr:
        log("\nドライラン完了。Artifactの agent/out/impl/ で生成物を確認してください。")
        log("問題なければ create_pr=true で再実行するとPRを作成します。")
        return

    log("[4] ブランチ作成とPR")
    branch = f"agent/{action_id.lower()}"
    sh = lambda *a: subprocess.run(a, cwd=REPO_ROOT, check=True)
    sh("git", "config", "user.name", "site-agent")
    sh("git", "config", "user.email", "site-agent@users.noreply.github.com")
    sh("git", "checkout", "-B", branch)
    for path in written:
        dst = REPO_ROOT / path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text((OUT_DIR / path).read_text(encoding="utf-8"), encoding="utf-8")
        sh("git", "add", path)
    sh("git", "commit", "-m", f"[agent] {action_id}: {meta.get('pr_title','')}")
    sh("git", "push", "-f", "origin", branch)

    body = "\n".join([
        "🤖 エージェントが自動生成したドラフト実装です。**マージ前に必ず確認してください。**",
        "",
        f"- 元Issue: #{issue['number']} の {action_id}",
        f"- 生成メモ: {meta.get('notes','')}",
        *(["", *warnings] if warnings else []),
        "",
        "## レビューチェックリスト",
        "- [ ] Vercel Preview でビルド成功・表示を確認",
        "- [ ] 医療・法的文言が Issue の指定通り",
        "- [ ] 既存機能への影響なし（該当画面を通しで操作）",
        "",
        "問題があればこのPRを閉じるだけで、サイトには何も影響しません。",
    ])
    pr, existed = create_pr(branch, f"[agent] {action_id} {meta.get('pr_title','')}", body)
    log(f"    PR{'（既存を更新）' if existed else '作成'}: {pr['html_url']}")
    comment_issue(issue["number"], f"🤖 {action_id} のドラフトPRを作成しました: {pr['html_url']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("action_id", help="例: A-36-1")
    ap.add_argument("--pr", action="store_true", help="PRを実際に作成する")
    args = ap.parse_args()
    if not ANTHROPIC_API_KEY:
        die("ANTHROPIC_API_KEY が設定されていません")
    if args.pr and not GITHUB_TOKEN:
        die("GITHUB_TOKEN が設定されていません")
    run(args.action_id.strip(), args.pr)


if __name__ == "__main__":
    main()
