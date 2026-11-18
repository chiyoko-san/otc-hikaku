#!/usr/bin/env python3
"""
薬名 × 悩み語 の全組み合わせを作り、Googleキーワードプランナーで検索数を測るためのCSVを出す。

2段階で絞る（検索ゼロの薬名は、悩み語を付けても検索ゼロなので）:
  step1: 薬名だけの一覧を出す            → data/keywords/upload/step1-NN.csv
         （キーワードプランナーの結果を data/keywords/volume/step1/ に置く）
  step2: 検索がある薬名 × 悩み語 の全組み合わせ → data/keywords/upload/step2-NN.csv
         （結果を data/keywords/volume/step2/ に置く）
  step3: 検索がある組み合わせだけを採用    → data/keywords/adopted.json（ページ反映用）

使い方:
  python scripts/build_keyword_combos.py step1
  python scripts/build_keyword_combos.py step2 [--min 100]
  python scripts/build_keyword_combos.py step3 [--min 10]

キーワードプランナーのCSV（日本語UI/英語UI、UTF-16タブ区切り/UTF-8カンマ区切り）をそのまま読める。
広告を出していないアカウントは検索数が「100～1000」のような幅になるので、幅の下限で判定する。
"""
import argparse
import csv
import glob
import io
import json
import os
import re
import unicodedata
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KW = os.path.join(ROOT, 'data', 'keywords')
UPLOAD = os.path.join(KW, 'upload')
CHUNK = 1000  # 1ファイルあたりのキーワード数（アップロード上限に余裕を持たせる）

# ---------------------------------------------------------------- 薬名の取り出し

KAMPO = re.compile(r'([一-龥]{1,8}?(?:湯|散|丸|飲|膏)(?:加[一-龥ぁ-ゖ]{1,8})?)(?:料|加減)?')
KAMPO_HEAD = re.compile(r'^(漢方|ツムラ|新|和漢箋|内服液|本草|生|幸輝|強)')
FORM = (r'(錠|カプセル|顆粒|細粒|散|液|シロップ|ドリンク|内服液|クリーム|軟膏|ゲル|ローション|パップ|テープ'
        r'|プラスター|点眼|点鼻|スプレー|ジェル|トローチ|ドロップ|坐剤|チュアブル|パウダー|エアゾール|ソフト|シップ|シート)')
TAIL_WORDS = ['プラス', 'プレミアム', 'ゴールド', 'クイック', 'ファースト', 'ネオ', 'ハイ', 'スーパー', 'ダブル',
              'ジュニア', 'キッズ', 'クール', 'ホット', 'アルファ', 'エース', 'ワン', 'ローヤル', 'ロイヤル']
PREFIX = re.compile(r'^(新|小児用|内服用|複方|強力|日本薬局方|和漢箋|ジェーピーエス|JPS|クラシエ|ツムラ漢方|ツムラ'
                    r'|コタロー|本草|山本漢方|ホノミ漢方|「[^」]*」|【[^】]*】'
                    r'|(?:トチモト|サンワ|ホリエ|クミアイ|ナカジマ|ウチダ|モリ|ウチダ)(?:の|\s|(?=[一-龥ぁ-ゖ]))'
                    r'|[ァ-ヴー]{2,6}の)\s*')
GENERIC = re.compile(r'(かぜ|風邪|感冒|下痢|胃腸|胃薬|胃散|鼻炎|せき|咳|便秘|ビタミン|目薬|うがい|消毒|鎮痛|解熱|整腸'
                     r'|痔|水虫|殺菌|総合|滋養|強壮|保健|漢方|生薬|薬$)')
STOP_BRANDS = {'シオノギ', 'ロート', 'タケダ', 'ライオン', 'コーワ', 'ツムラ', 'クラシエ', 'サトウ', 'ゼリア', 'エスエス',
               'せきどめ', 'ドロップ', 'うがい', 'かぜ', 'のど', 'はな', 'こども', 'こどもの', 'ベビー'}
GENERIC_KATA = {'ビタミン', 'アルコール', 'エタノール', 'ハンド', 'ポビドンヨード', 'ワセリン', 'グリセリン', 'センナ',
                'ゲンノショウコ', 'センブリ', 'ドクダミ', 'オウバク', 'ニンジン', 'カンゾウ', 'ケイヒ'}
CORP = re.compile(r'(株式会社|\(株\)|（株）|有限会社|\(有\)|製薬|薬品|工業|本店|新薬|商事|ファーマ|ヘルスケア|和漢薬)')


def norm(s):
    s = unicodedata.normalize('NFKC', s or '')
    return re.sub(r'\s+', ' ', s).strip()


def maker_head(maker):
    """メーカー名の頭（ウチダ和漢薬→ウチダ、栃本天海堂→栃本）。製品名の頭に付いていれば外すため。"""
    m = CORP.sub('', norm(maker)).strip()
    h = re.match(r'^([ァ-ヴー]{2,}|[一-龥]{2,})', m)
    return h.group(1) if h else ''


def brand_of(name, maker=''):
    n = norm(name)
    n = re.sub(r'[(\[〔<＜].*?[)\]〕>＞]', '', n).strip()
    for _ in range(3):
        n2 = PREFIX.sub('', n)
        if n2 == n:
            break
        n = n2
    head = maker_head(maker)
    if head and n.startswith(head):
        rest = re.sub(r'^の', '', n[len(head):]).strip()
        if len(rest) >= 2:
            n = rest
    # 漢方は処方名でまとめる（ツムラの葛根湯もクラシエの葛根湯も「葛根湯」）
    if not re.match(r'^[ァ-ヴー]{3,}', n):
        k = KAMPO.search(n)
        if k:
            f = k.group(1)
            for _ in range(3):
                f = KAMPO_HEAD.sub('', f)
            if len(f) >= 3 and not GENERIC.search(f):
                return f, 'kampo'
    m = re.match(r'^([ァ-ヴー・]{2,}|[ぁ-ゖー]{3,})', n)
    if m:
        b = m.group(1).strip('・')
        changed = True
        while changed:
            changed = False
            for t in TAIL_WORDS:
                if b.endswith(t) and len(b) - len(t) >= 3:
                    b, changed = b[:-len(t)], True
            b2 = re.sub(FORM + '$', '', b)
            if b2 != b and len(b2) >= 3:
                b, changed = b2, True
        if len(b) >= 3 and b not in GENERIC_KATA and b not in STOP_BRANDS:
            return b, 'otc'
        return None, None
    m = re.match(r'^([一-龥々ぁ-ゖァ-ヴー]{2,12})', n)
    if m:
        b = re.sub(FORM + '$', '', m.group(1))
        if len(b) >= 2 and re.search(r'[一-龥]', b) and not GENERIC.search(b) and b not in STOP_BRANDS:
            return b, 'otc'
    return None, None


def rx_brands():
    """処方薬ブランド（/switch/ の300薬＋手書き30薬）"""
    out = {}
    p = os.path.join(ROOT, 'data', 'switch-drugs.json')
    if os.path.exists(p):
        for d in json.load(open(p, encoding='utf-8'))['drugs']:
            out[norm(d['rxName'])] = d['slug']
    p = os.path.join(ROOT, 'lib', 'switch-data.ts')
    if os.path.exists(p):
        src = open(p, encoding='utf-8').read()
        for slug, rx in re.findall(r"slug:\s*'([^']+)'[\s\S]{0,200}?rxName:\s*'([^']+)'", src):
            out[norm(re.sub(r'[(（].*$', '', rx))] = slug
    for name in list(out):
        if '・' in name:  # 「プロペト・白色ワセリン」→ 2つに分ける
            slug = out.pop(name)
            for part in name.split('・'):
                if len(part) >= 3:
                    out[part] = slug
    return out


def build_brands():
    meds = json.load(open(os.path.join(ROOT, 'data', 'medicines.json'), encoding='utf-8'))['medicines']
    brands = defaultdict(lambda: {'kinds': set(), 'ids': [], 'examples': [], 'rxSlug': None})
    for x in meds:
        if x.get('itype') not in ('otc', None):
            continue  # 機能性表示食品・医薬部外品は対象外
        b, kind = brand_of(x.get('name'), x.get('maker'))
        if not b:
            continue
        e = brands[b]
        e['kinds'].add(kind)
        e['ids'].append(x['id'])
        if len(e['examples']) < 3:
            e['examples'].append(norm(x['name']))
    for name, slug in rx_brands().items():
        e = brands[name]
        e['kinds'].add('rx')
        e['rxSlug'] = slug
    return brands


# ---------------------------------------------------------------- CSVの入出力

def write_upload(prefix, keywords):
    os.makedirs(UPLOAD, exist_ok=True)
    for f in glob.glob(os.path.join(UPLOAD, f'{prefix}-*.csv')):
        os.remove(f)
    files = []
    for i in range(0, len(keywords), CHUNK):
        path = os.path.join(UPLOAD, f'{prefix}-{i // CHUNK + 1:02d}.csv')
        with open(path, 'w', encoding='utf-8-sig', newline='') as fp:
            w = csv.writer(fp)
            w.writerow(['Keyword'])
            for k in keywords[i:i + CHUNK]:
                w.writerow([k])
        files.append(path)
    return files


def read_text(path):
    raw = open(path, 'rb').read()
    for enc in ('utf-16', 'utf-8-sig', 'cp932'):
        try:
            t = raw.decode(enc)
            if 'eyword' in t or 'キーワード' in t:
                return t
        except UnicodeDecodeError:
            pass
    return raw.decode('utf-8', 'ignore')


def parse_volume(v):
    """'100～1000' '1K – 10K' '1000～1万' '590' → 下限の数値。読めなければ None"""
    s = norm(str(v)).replace(',', '')
    if not s or s in ('-', '--'):
        return None
    first = re.split(r'[~～–\-]', s)[0].strip()
    m = re.match(r'^([\d.]+)\s*(K|M|万|千)?', first, re.I)
    if not m:
        return None
    n = float(m.group(1))
    mult = {'k': 1e3, 'm': 1e6, '万': 1e4, '千': 1e3}.get((m.group(2) or '').lower(), 1)
    return int(n * mult)


def read_volumes(folder):
    vols = {}
    for path in sorted(glob.glob(os.path.join(folder, '*.csv'))):
        text = read_text(path)
        lines = text.splitlines()
        start = next((i for i, l in enumerate(lines)
                      if re.match(r'^﻿?"?(Keyword|キーワード)"?[\t,]', l)), None)
        if start is None:
            print(f'⚠ 見出し行が見つからない: {path}')
            continue
        delim = '\t' if '\t' in lines[start] else ','
        rows = list(csv.reader(io.StringIO('\n'.join(lines[start:])), delimiter=delim))
        head = [h.strip().lstrip('﻿') for h in rows[0]]
        ki = 0
        vi = next((i for i, h in enumerate(head) if 'Avg. monthly searches' in h or '月間平均検索' in h), None)
        if vi is None:
            print(f'⚠ 検索数の列が見つからない: {path}')
            continue
        for r in rows[1:]:
            if len(r) > vi and r[ki].strip():
                vols[norm(r[ki])] = parse_volume(r[vi])
    return vols


# ---------------------------------------------------------------- 各段階

def load_words():
    return json.load(open(os.path.join(KW, 'worry-words.json'), encoding='utf-8'))['words']


def step1(_):
    brands = build_brands()
    order = sorted(brands, key=lambda b: (-('rx' in brands[b]['kinds']), -len(brands[b]['ids']), b))
    out = {b: {'kinds': sorted(brands[b]['kinds']), 'ids': brands[b]['ids'],
               'examples': brands[b]['examples'], 'rxSlug': brands[b]['rxSlug']} for b in order}
    with open(os.path.join(KW, 'brands.json'), 'w', encoding='utf-8') as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)
    with open(os.path.join(KW, 'brands-review.csv'), 'w', encoding='utf-8-sig', newline='') as fp:
        w = csv.writer(fp)
        w.writerow(['薬名', '種類', '市販薬の製品数', '製品名の例'])
        kl = {'otc': '市販薬', 'kampo': '漢方', 'rx': '処方薬'}
        for b in order:
            e = out[b]
            w.writerow([b, '・'.join(kl[k] for k in e['kinds']), len(e['ids']), ' / '.join(e['examples'])])
    files = write_upload('step1', order)
    print(f'薬名 {len(order)} 件 → {len(files)} ファイル')


def step2(a):
    brands = json.load(open(os.path.join(KW, 'brands.json'), encoding='utf-8'))
    vols = read_volumes(os.path.join(KW, 'volume', 'step1'))
    if not vols:
        raise SystemExit('data/keywords/volume/step1/ にキーワードプランナーの結果CSVがありません')
    words = load_words()
    keep = [b for b in brands if (vols.get(norm(b)) or 0) >= a.min]
    keep.sort(key=lambda b: -(vols.get(norm(b)) or 0))
    combos = []
    for b in keep:
        kinds = set(brands[b]['kinds'])
        for w in words:
            if kinds & set(w['for']):
                combos.append(f'{b} {w["word"]}')
    files = write_upload('step2', combos)
    print(f'検索{a.min}回/月以上の薬名 {len(keep)} / {len(brands)} 件 → 組み合わせ {len(combos)} 語 → {len(files)} ファイル')


def step3(a):
    brands = json.load(open(os.path.join(KW, 'brands.json'), encoding='utf-8'))
    vols = read_volumes(os.path.join(KW, 'volume', 'step2'))
    if not vols:
        raise SystemExit('data/keywords/volume/step2/ にキーワードプランナーの結果CSVがありません')
    words = {w['word']: w for w in load_words()}
    adopted = []
    for kw, v in vols.items():
        if v is None or v < a.min:
            continue
        b, _, w = kw.rpartition(' ')
        if b not in brands or w not in words:
            continue
        adopted.append({'keyword': kw, 'brand': b, 'word': w, 'volume': v,
                        'answer': words[w]['answer'], 'kinds': brands[b]['kinds'],
                        'ids': brands[b]['ids'], 'rxSlug': brands[b]['rxSlug']})
    adopted.sort(key=lambda x: -x['volume'])
    with open(os.path.join(KW, 'adopted.json'), 'w', encoding='utf-8') as fp:
        json.dump({'min': a.min, 'count': len(adopted), 'items': adopted}, fp, ensure_ascii=False, indent=1)
    by_word = defaultdict(int)
    for x in adopted:
        by_word[x['word']] += x['volume']
    print(f'採用 {len(adopted)} 語（検索{a.min}回/月以上）')
    for w, v in sorted(by_word.items(), key=lambda kv: -kv[1]):
        print(f'  {w}: {v}')


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('step', choices=['step1', 'step2', 'step3'])
    p.add_argument('--min', type=int, default=None)
    a = p.parse_args()
    if a.min is None:
        a.min = 100 if a.step == 'step2' else 10
    {'step1': step1, 'step2': step2, 'step3': step3}[a.step](a)
