import type { Medicine } from '@/types';
import { getAllMedicines } from './medicines';
import { isIndexableMedicine } from './indexable';
import { CATEGORIES } from './categories';

// 配置先: lib/kana-index.ts
// 「薬の一覧（50音順）」用。検索エンジンが全薬ページに2〜3クリックで辿り着けるようにする
// HTMLサイトマップの土台。カタカナ・ひらがなで始まる名前は行（あ〜わ）、英字は「英字」、
// 漢字で始まる名前（漢方など約2,000品）は1ページに入れると重すぎるので分類ごとに分ける。

type KanaRow = { key: string; label: string; chars: string; heads: string[] };

const KANA_ROWS: KanaRow[] = [
  { key: 'a', label: 'あ行', chars: 'あいうえおぁぃぅぇぉアイウエオァィゥェォヴ', heads: ['ア', 'イ', 'ウ', 'エ', 'オ'] },
  { key: 'ka', label: 'か行', chars: 'かきくけこがぎぐげごカキクケコガギグゲゴヵヶ', heads: ['カ', 'キ', 'ク', 'ケ', 'コ'] },
  { key: 'sa', label: 'さ行', chars: 'さしすせそざじずぜぞサシスセソザジズゼゾ', heads: ['サ', 'シ', 'ス', 'セ', 'ソ'] },
  { key: 'ta', label: 'た行', chars: 'たちつてとだぢづでどタチツテトダヂヅデドッっ', heads: ['タ', 'チ', 'ツ', 'テ', 'ト'] },
  { key: 'na', label: 'な行', chars: 'なにぬねのナニヌネノ', heads: ['ナ', 'ニ', 'ヌ', 'ネ', 'ノ'] },
  { key: 'ha', label: 'は行', chars: 'はひふへほばびぶべぼぱぴぷぺぽハヒフヘホバビブベボパピプペポ', heads: ['ハ', 'ヒ', 'フ', 'ヘ', 'ホ'] },
  { key: 'ma', label: 'ま行', chars: 'まみむめもマミムメモ', heads: ['マ', 'ミ', 'ム', 'メ', 'モ'] },
  { key: 'ya', label: 'や行', chars: 'やゆよゃゅょヤユヨャュョ', heads: ['ヤ', 'ユ', 'ヨ'] },
  { key: 'ra', label: 'ら行', chars: 'らりるれろラリルレロ', heads: ['ラ', 'リ', 'ル', 'レ', 'ロ'] },
  { key: 'wa', label: 'わ行', chars: 'わをんゎワヲンヮ', heads: ['ワ', 'ヲ', 'ン'] },
];

/** 濁点・半濁点・小書きを清音の大きい片仮名に寄せる（見出し用） */
const HEAD_MAP: Record<string, string> = {};
(() => {
  const pairs: [string, string][] = [
    ['ガギグゲゴ', 'カキクケコ'], ['ザジズゼゾ', 'サシスセソ'], ['ダヂヅデド', 'タチツテト'],
    ['バビブベボ', 'ハヒフヘホ'], ['パピプペポ', 'ハヒフヘホ'], ['ァィゥェォ', 'アイウエオ'],
    ['ャュョ', 'ヤユヨ'], ['ッ', 'ツ'], ['ヴ', 'ウ'], ['ヵヶ', 'カケ'], ['ヮ', 'ワ'],
  ];
  for (const [from, to] of pairs) for (let i = 0; i < from.length; i++) HEAD_MAP[from[i]] = to[i];
})();

function toKatakana(ch: string): string {
  const code = ch.charCodeAt(0);
  // ひらがな → カタカナ
  if (code >= 0x3041 && code <= 0x3096) return String.fromCharCode(code + 0x60);
  return ch;
}

/** 名前の先頭文字から、見出し用の片仮名1文字（例: 「ロキソニンS」→「ロ」、「ばんそうこう」→「ハ」） */
export function headCharOf(name: string): string {
  const k = toKatakana(name.trim().charAt(0));
  return HEAD_MAP[k] ?? k;
}

export type IndexRow = { key: string; label: string; count: number; kind: 'kana' | 'abc' | 'kanji' };

function rowKeyOf(name: string): string {
  const ch = name.trim().charAt(0);
  for (const r of KANA_ROWS) if (r.chars.includes(ch)) return r.key;
  if (/^[A-Za-z0-9Ａ-Ｚａ-ｚ０-９]/.test(ch)) return 'abc';
  return 'kanji';
}

let _byRow: Map<string, Medicine[]> | null = null;

function build(): Map<string, Medicine[]> {
  if (_byRow) return _byRow;
  const map = new Map<string, Medicine[]>();
  for (const m of getAllMedicines()) {
    if (!isIndexableMedicine(m)) continue;
    let key = rowKeyOf(m.name);
    if (key === 'kanji') key = `kanji-${m.cat}`;
    map.set(key, [...(map.get(key) ?? []), m]);
  }
  for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  _byRow = map;
  return map;
}

/** 一覧ページに並べる行（件数0の行は出さない） */
export function getIndexRows(): IndexRow[] {
  const map = build();
  const rows: IndexRow[] = [];
  for (const r of KANA_ROWS) {
    const n = map.get(r.key)?.length ?? 0;
    if (n) rows.push({ key: r.key, label: r.label, count: n, kind: 'kana' });
  }
  const abc = map.get('abc')?.length ?? 0;
  if (abc) rows.push({ key: 'abc', label: '英字・数字', count: abc, kind: 'abc' });
  for (const c of CATEGORIES) {
    const n = map.get(`kanji-${c.id}`)?.length ?? 0;
    if (n) rows.push({ key: `kanji-${c.id}`, label: `漢字で始まる薬：${c.label}`, count: n, kind: 'kanji' });
  }
  return rows;
}

export function getRowLabel(key: string): string | null {
  return getIndexRows().find((r) => r.key === key)?.label ?? null;
}

export function getRowHeads(key: string): string[] {
  return KANA_ROWS.find((r) => r.key === key)?.heads ?? [];
}

/** 行に属する薬（名前順） */
export function getMedicinesInRow(key: string): Medicine[] {
  return build().get(key) ?? [];
}
