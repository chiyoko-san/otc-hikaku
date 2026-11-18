#!/usr/bin/env python3
"""
Googleの検索候補（サジェスト）で「薬名×悩み語」に検索があるかを判定する。
キーワードプランナー（広告アカウント）を使わない無料の方法。

2段階で調べる（1回の実行で --budget 件まで。途中で止まっても次回は続きから）:
  段階A: 「薬名 」で検索候補を取る（4,950件）
         → 候補が返ってきた薬名＝検索されている薬名。候補そのものも悩みの生データとして保存
  段階B: 検索されている薬名だけ「薬名 悩み語」で候補を取る
         → その組み合わせ（またはその続き）が候補に出れば「検索がある」
  全部調べ終わったら、30日より古いものから調べ直す。

出力（data/keywords/）:
  suggest.json       調べた結果（再開用の状態も兼ねる）
  adopted.json       検索がある組み合わせ（ページ反映用）
  suggest-words.csv  薬名の後ろに続く言葉の集計（悩み語リストに無い悩みを見つける用）

使い方:
  python scripts/suggest_scan.py scan --budget 2500
  python scripts/suggest_scan.py report

注意: 検索候補はGoogleの公開APIではないので、間隔をあけてゆっくり取る。
     429/403 や想定外の応答が続いたら、その時点までを保存して終了する（次回は続きから）。
"""
import argparse
import csv
import datetime as dt
import json
import os
import random
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KW = os.path.join(ROOT, 'data', 'keywords')
STATE = os.path.join(KW, 'suggest.json')
ENDPOINT = 'https://suggestqueries.google.com/complete/search'
REFRESH_DAYS = 30
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'


# 悩み語（data/keywords/worry-words.json があればそちらを優先）
DEFAULT_WORDS = [
    {"word": "効果", "answer": "data", "for": ["otc", "kampo", "rx"]},
    {"word": "成分", "answer": "data", "for": ["otc", "kampo"]},
    {"word": "違い", "answer": "data", "for": ["otc", "kampo", "rx"]},
    {"word": "眠くなる", "answer": "data", "for": ["otc", "kampo", "rx"]},
    {"word": "運転", "answer": "data", "for": ["otc", "rx"]},
    {"word": "市販", "answer": "data", "for": ["rx", "kampo"]},
    {"word": "同じ成分", "answer": "data", "for": ["otc", "rx"]},
    {"word": "ジェネリック", "answer": "data", "for": ["rx"]},
    {"word": "値段", "answer": "data", "for": ["otc", "rx"]},
    {"word": "副作用", "answer": "label", "for": ["otc", "kampo", "rx"]},
    {"word": "何歳から", "answer": "label", "for": ["otc", "kampo"]},
    {"word": "子供", "answer": "label", "for": ["otc", "kampo", "rx"]},
    {"word": "妊娠中", "answer": "label", "for": ["otc", "kampo", "rx"]},
    {"word": "授乳中", "answer": "label", "for": ["otc", "kampo", "rx"]},
    {"word": "高齢者", "answer": "label", "for": ["otc", "kampo"]},
    {"word": "飲み合わせ", "answer": "label", "for": ["otc", "kampo", "rx"]},
    {"word": "併用", "answer": "label", "for": ["otc", "rx"]},
    {"word": "お酒", "answer": "label", "for": ["otc", "rx"]},
    {"word": "空腹時", "answer": "label", "for": ["otc"]},
    {"word": "飲むタイミング", "answer": "label", "for": ["otc", "kampo"]},
    {"word": "何時間あける", "answer": "label", "for": ["otc"]},
    {"word": "1日何回", "answer": "label", "for": ["otc", "kampo"]},
    {"word": "何日まで", "answer": "label", "for": ["otc", "kampo"]},
    {"word": "効かない", "answer": "none", "for": ["otc", "kampo", "rx"]},
    {"word": "口コミ", "answer": "none", "for": ["otc", "kampo"]}
]


def load_words():
    p = os.path.join(KW, 'worry-words.json')
    if os.path.exists(p):
        with open(p, encoding='utf-8') as fp:
            return json.load(fp)['words']
    return DEFAULT_WORDS


def today():
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat()


def norm(s):
    s = unicodedata.normalize('NFKC', s or '').lower()
    return re.sub(r'\s+', ' ', s).strip()


def flat(s):
    return norm(s).replace(' ', '')


def load_json(path, default):
    if os.path.exists(path):
        with open(path, encoding='utf-8') as fp:
            return json.load(fp)
    return default


def save_state(state):
    state['updated'] = today()
    tmp = STATE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fp:
        json.dump(state, fp, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, STATE)


# ---------------------------------------------------------------- 取得

class Blocked(Exception):
    pass


def fetch(q):
    url = ENDPOINT + '?' + urllib.parse.urlencode(
        {'client': 'firefox', 'hl': 'ja', 'gl': 'jp', 'ie': 'utf-8', 'oe': 'utf-8', 'q': q})
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.5'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        if e.code in (403, 429, 503):
            raise Blocked(f'HTTP {e.code}')
        raise
    text = None
    for enc in ('utf-8', 'cp932'):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            pass
    try:
        data = json.loads(text)
        sugs = data[1]
        if not isinstance(sugs, list):
            raise ValueError
        return [s for s in sugs if isinstance(s, str)]
    except Exception:
        raise Blocked('想定外の応答（ロボット確認の画面の可能性）')


# ---------------------------------------------------------------- 判定

def brand_has_demand(brand, sugs):
    """候補のどれかが薬名で始まっていれば、その薬名は検索されている"""
    fb = flat(brand)
    return any(flat(s).startswith(fb) for s in sugs)


def match_pos(phrase, sugs):
    """phrase（またはその続き）が候補の何番目に出るか。出なければ None"""
    fp = flat(phrase)
    for i, s in enumerate(sugs):
        if flat(s).startswith(fp):
            return i
    return None


# ---------------------------------------------------------------- 調べる

def plan_queue(brands, words, state):
    """今回調べる順番: 未調査の薬名 → 未調査の組み合わせ → 古いものの調べ直し"""
    b_done = state['brands']
    c_done = state['combos']
    todo_b = [b for b in brands if b not in b_done]
    todo_c = []
    for b in brands:
        e = b_done.get(b)
        if not e or not e.get('demand'):
            continue
        kinds = set(brands[b]['kinds'])
        for w in words:
            if kinds & set(w['for']):
                kw = f'{b} {w["word"]}'
                if kw not in c_done:
                    todo_c.append(('combo', kw, b, w['word']))
    queue = [('brand', b, b, None) for b in todo_b] + todo_c
    if not queue:
        limit = (dt.date.fromisoformat(today()) - dt.timedelta(days=REFRESH_DAYS)).isoformat()
        old = [('brand', b, b, None) for b, e in b_done.items() if e.get('checked', '') < limit]
        old += [('combo', k, k.rpartition(' ')[0], k.rpartition(' ')[2])
                for k, e in c_done.items() if e.get('checked', '') < limit]
        old.sort(key=lambda x: (b_done.get(x[2], {}).get('checked', ''), x[0] != 'brand'))
        queue = old
    return queue


def scan(a):
    brands = load_json(os.path.join(KW, 'brands.json'), None)
    if not brands:
        sys.exit('data/keywords/brands.json がありません（scripts/build_keyword_combos.py step1 で作る）')
    os.makedirs(KW, exist_ok=True)
    words = load_words()
    state = load_json(STATE, {'brands': {}, 'combos': {}})
    queue = plan_queue(brands, words, state)
    print(f'残り {len(queue)} 件（今回は最大 {a.budget} 件）')
    done = errors = 0
    started = time.time()
    try:
        for kind, q, brand, word in queue[:a.budget]:
            try:
                sugs = fetch(q + (' ' if kind == 'brand' else ''))
                errors = 0
            except Blocked:
                raise
            except Exception as e:  # 通信の一時的な失敗は数回まで許す
                errors += 1
                print(f'  通信エラー {q}: {e}')
                if errors >= 5:
                    raise Blocked('通信エラーが続いた')
                time.sleep(10)
                continue
            if kind == 'brand':
                state['brands'][brand] = {'checked': today(), 'demand': brand_has_demand(brand, sugs),
                                          'sugs': sugs[:10]}
            else:
                pos = match_pos(q, sugs)
                state['combos'][q] = {'checked': today(), 'hit': pos is not None, 'pos': pos,
                                      'n': sum(1 for s in sugs if flat(s).startswith(flat(q)))}
            done += 1
            if done % 200 == 0:
                save_state(state)
                print(f'  {done} 件（{int(time.time() - started)}秒）')
            time.sleep(random.uniform(a.min_wait, a.min_wait * 1.6))
    except Blocked as e:
        print(f'⚠ 止められたので中断: {e}（ここまでを保存。次回は続きから）')
    save_state(state)
    b_total = len(brands)
    b_checked = len(state['brands'])
    b_demand = sum(1 for e in state['brands'].values() if e.get('demand'))
    c_checked = len(state['combos'])
    c_hit = sum(1 for e in state['combos'].values() if e.get('hit'))
    pending = [x for x in plan_queue(brands, words, state)
               if (x[0] == 'brand' and x[1] not in state['brands']) or (x[0] == 'combo' and x[1] not in state['combos'])]
    print(f'今回 {done} 件。薬名 {b_checked}/{b_total} 件調査済み（検索あり {b_demand}）、'
          f'組み合わせ {c_checked} 件調査済み（検索あり {c_hit}）、未調査 {len(pending)} 件')


# ---------------------------------------------------------------- まとめる

def report(_):
    brands = load_json(os.path.join(KW, 'brands.json'), None)
    if not brands:
        sys.exit('data/keywords/brands.json がありません')
    words = {w['word']: w for w in load_words()}
    state = load_json(STATE, {'brands': {}, 'combos': {}})

    # 薬名の検索候補の何番目に出たか（上ほど多く検索されている）
    top_rank = {}
    for b, e in state['brands'].items():
        for i, s in enumerate(e.get('sugs', [])):
            for w in words:
                if flat(s).startswith(flat(f'{b} {w}')) and (b, w) not in top_rank:
                    top_rank[(b, w)] = i

    items = []
    for kw, e in state['combos'].items():
        b, _, w = kw.rpartition(' ')
        if b not in brands or w not in words:
            continue
        rank = top_rank.get((b, w))
        if not e.get('hit') and rank is None:
            continue
        # 強さの目安: 薬名だけの候補に出た（とても多い）> 組み合わせの候補の上位に出た
        score = (100 - rank * 5) if rank is not None else (20 - (e.get('pos') or 0))
        items.append({'keyword': kw, 'brand': b, 'word': w, 'score': score, 'topRank': rank,
                      'answer': words[w]['answer'], 'kinds': brands[b]['kinds'],
                      'products': len(brands[b]['ids']), 'rxSlug': brands[b].get('rxSlug')})
    # 組み合わせを調べる前でも、薬名の候補に出たものは採用する
    for (b, w), rank in top_rank.items():
        kw = f'{b} {w}'
        if kw in state['combos'] or b not in brands:
            continue
        items.append({'keyword': kw, 'brand': b, 'word': w, 'score': 100 - rank * 5, 'topRank': rank,
                      'answer': words[w]['answer'], 'kinds': brands[b]['kinds'],
                      'products': len(brands[b]['ids']), 'rxSlug': brands[b].get('rxSlug')})
    items.sort(key=lambda x: (-x['score'], -x['products'], x['keyword']))
    with open(os.path.join(KW, 'adopted.json'), 'w', encoding='utf-8') as fp:
        json.dump({'updated': today(), 'source': 'google-suggest', 'count': len(items), 'items': items},
                  fp, ensure_ascii=False, separators=(',', ':'))

    # 薬名の後ろに続く言葉（悩み語リストに無いものも含む）を集計
    tail = Counter()
    tail_brands = defaultdict(list)
    for b, e in state['brands'].items():
        seen = set()
        for s in e.get('sugs', []):
            n = norm(s)
            nb = norm(b)
            if not n.startswith(nb):
                continue
            rest = n[len(nb):]
            if not rest.startswith(' '):
                continue  # 「ロキソニンs」のような製品名の続きは数えない
            rest = rest.strip()
            if not rest:
                continue
            head = rest.split(' ')[0]
            if head in seen:
                continue
            seen.add(head)
            tail[head] += 1
            if len(tail_brands[head]) < 5:
                tail_brands[head].append(b)
    with open(os.path.join(KW, 'suggest-words.csv'), 'w', encoding='utf-8-sig', newline='') as fp:
        wr = csv.writer(fp)
        wr.writerow(['続く言葉', '出た薬名の数', '悩み語リストにある', '例'])
        for head, c in tail.most_common():
            wr.writerow([head, c, '○' if head in words else '', ' / '.join(tail_brands[head])])

    # 画面用のまとめ
    by_word = Counter(x['word'] for x in items)
    print(f'検索がある組み合わせ: {len(items)} 語')
    print('悩み語ごとの件数:')
    for w, c in by_word.most_common():
        print(f'  {w}: {c}')
    print('薬名の後ろによく続く言葉（悩み語リストに無いもの・上位30）:')
    shown = 0
    for head, c in tail.most_common():
        if head in words:
            continue
        print(f'  {head}: {c}（例: {" / ".join(tail_brands[head][:3])}）')
        shown += 1
        if shown >= 30:
            break


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('cmd', choices=['scan', 'report'])
    p.add_argument('--budget', type=int, default=2500, help='1回に調べる件数の上限')
    p.add_argument('--min-wait', type=float, default=1.5, help='1件ごとの最短の待ち秒数')
    a = p.parse_args()
    {'scan': scan, 'report': report}[a.cmd](a)
