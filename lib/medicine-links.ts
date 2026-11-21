// 配置先: lib/medicine-links.ts
//
// 薬ページ下部の「あわせて見られている薬」に出す8品を決める。
//
// 2026-11-21: 薬ページ同士のリンク（類似薬品の欄）は「データの並び順で先に見つかった薬」を
//   出していたため、先頭付近の数十品に1,000ページ以上からリンクが集まり、検索に出してよい薬
//   7,537品のうち約7割（5,219品）は、ほかの薬ページから1本もリンクされていなかった。
//   Googleはリンクを辿ってページを見つけるので、これが「検出 - インデックス未登録」が減らない一因。
//
// ここでは、同じ主成分（無ければ同じ分類）の薬を1つの輪に並べ、各ページから「輪の次の8品」へ
// リンクする。輪なので、どの薬にも同じ数（8本）のリンクが必ず届く。
// リンク先は検索に出してよい薬（isIndexableMedicine）だけ。

import type { Medicine } from '@/types';
import { getAllMedicines } from './medicines';
import { normalizeIngredientName } from './slug';
import { isIndexableMedicine } from './indexable';
import { getCategoryLabel } from './categories';

/** 輪を作るのに必要な最小の品数。これ未満の成分は分類の輪に入れる */
const MIN_RING = 4;

type Ring = { label: string; members: Medicine[] };

let _ringOf: Map<number, Ring> | null = null;
let _ingRings: Map<string, Ring> | null = null;
let _catRings: Map<string, Ring> | null = null;

function primaryIngredient(med: Medicine): string {
  const first = (med.ings || []).find((s) => typeof s === 'string' && s.trim());
  return first ? normalizeIngredientName(first) : '';
}

function build() {
  if (_ringOf) return;

  const targets = getAllMedicines().filter((m) => isIndexableMedicine(m));

  const byIng = new Map<string, Medicine[]>();
  for (const m of targets) {
    const key = primaryIngredient(m);
    if (!key) continue;
    const list = byIng.get(key);
    if (list) list.push(m);
    else byIng.set(key, [m]);
  }

  const ringOf = new Map<number, Ring>();
  const ingRings = new Map<string, Ring>();
  const rest: Medicine[] = [];

  for (const [key, list] of byIng) {
    if (list.length < MIN_RING) {
      rest.push(...list);
      continue;
    }
    // 同じ分類の薬が隣り合うように並べる（並びは id で固定。毎回同じ結果になる）
    const members = [...list].sort(
      (a, b) => (a.cat || '').localeCompare(b.cat || '') || a.id - b.id
    );
    const ring: Ring = { label: `${key}を含むほかの市販薬`, members };
    ingRings.set(key, ring);
    for (const m of members) ringOf.set(m.id, ring);
  }

  // 主成分の仲間が少ない薬は、分類ごとの輪に入れる
  const catRings = new Map<string, Ring>();
  const byCat = new Map<string, Medicine[]>();
  for (const m of rest) {
    const key = m.cat || '';
    const list = byCat.get(key);
    if (list) list.push(m);
    else byCat.set(key, [m]);
  }
  for (const [cat, list] of byCat) {
    const members = [...list].sort((a, b) => a.id - b.id);
    const name = cat ? getCategoryLabel(cat) : '';
    const ring: Ring = {
      label: name ? `同じ分類（${name}）のほかの市販薬` : 'ほかの市販薬',
      members,
    };
    catRings.set(cat, ring);
    for (const m of members) ringOf.set(m.id, ring);
  }

  _ringOf = ringOf;
  _ingRings = ingRings;
  _catRings = catRings;
}

export type PeerLinks = { label: string; items: Medicine[] };

/**
 * この薬のページから案内する「輪の次の薬」。
 * @param exclude すでに同じページの別の欄に出している薬の id（重複させない）
 */
export function getPeerMedicines(
  med: Medicine,
  limit = 8,
  exclude: Iterable<number> = []
): PeerLinks | null {
  build();

  // 自分が輪に入っていれば自分の位置から。検索に出していない薬のページでは、
  // 同じ主成分→同じ分類の輪を借りて、id から決まる位置から始める
  let ring = _ringOf!.get(med.id) ?? null;
  let start = ring ? ring.members.findIndex((m) => m.id === med.id) : -1;
  if (!ring) {
    ring =
      _ingRings!.get(primaryIngredient(med)) ??
      _catRings!.get(med.cat || '') ??
      null;
    if (!ring || ring.members.length === 0) return null;
    start = Math.abs(med.id) % ring.members.length;
  }

  const skip = new Set<number>(exclude);
  skip.add(med.id);

  const n = ring.members.length;
  const items: Medicine[] = [];
  for (let step = 1; step <= n && items.length < limit; step++) {
    const m = ring.members[(start + step) % n];
    if (skip.has(m.id)) continue;
    skip.add(m.id);
    items.push(m);
  }
  if (items.length === 0) return null;
  return { label: ring.label, items };
}
