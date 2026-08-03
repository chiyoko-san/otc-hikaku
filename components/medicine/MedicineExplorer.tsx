'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { trackEvent } from '@/lib/analytics';

type IndexItem = {
  n: string; // name
  s: string; // slug
  m: string; // maker
  c: string; // category id
  r: number; // risk (1/2/2.5/3/0=不明/-1=機能性/-2=医薬部外品)
  d: number; // drowsy 0/1
  g: string[]; // symptom tags
  i: string[]; // ingredients
};

type CategoryOption = { id: string; label: string; count: number };

const RISK_FILTERS: { value: number; label: string }[] = [
  { value: 1, label: '第1類' },
  { value: 2.5, label: '指定第2類' },
  { value: 2, label: '第2類' },
  { value: 3, label: '第3類' },
];

function riskLabel(r: number): string {
  if (r === -1) return '機能性';
  if (r === -2) return '医薬部外品';
  if (r === 1) return '第1類';
  if (r === 2) return '第2類';
  if (r === 2.5) return '指定第2類';
  if (r === 3) return '第3類';
  return '不明';
}

function riskBadgeClass(r: number): string {
  const base =
    'whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold';
  if (r === 1) return `${base} bg-red-100 text-red-800`;
  if (r === 2.5) return `${base} bg-orange-100 text-orange-800`;
  if (r === 2) return `${base} bg-yellow-100 text-yellow-800`;
  if (r === 3) return `${base} bg-green-100 text-green-800`;
  return `${base} bg-gray-100 text-gray-600`;
}

/** ひらがな→カタカナ・全角英数→半角・小文字化して比較用に正規化 */
function normalize(s: string): string {
  return s
    .replace(/[ぁ-ん]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) + 0x60)
    )
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .toLowerCase()
    .trim();
}

const PAGE_SIZE = 30;

export function MedicineExplorer({
  categories,
}: {
  categories: CategoryOption[];
}) {
  const [items, setItems] = useState<IndexItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [risks, setRisks] = useState<number[]>([]);
  const [noDrowsy, setNoDrowsy] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const trackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // インデックスを初回に取得(CDNキャッシュ済み)
  useEffect(() => {
    let alive = true;
    fetch('/api/medicine-index/')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data: { items: IndexItem[] }) => {
        if (alive) setItems(data.items || []);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 検索実行の計測(800msデバウンス)
  useEffect(() => {
    if (!q.trim()) return;
    if (trackTimer.current) clearTimeout(trackTimer.current);
    trackTimer.current = setTimeout(() => {
      trackEvent('explorer_search', { q: q.trim() });
    }, 800);
    return () => {
      if (trackTimer.current) clearTimeout(trackTimer.current);
    };
  }, [q]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const nq = normalize(q);
    const hasQuery = nq.length > 0;

    type Scored = { item: IndexItem; score: number };
    const out: Scored[] = [];

    for (const it of items) {
      if (cat && it.c !== cat) continue;
      if (risks.length > 0 && !risks.includes(it.r)) continue;
      if (noDrowsy && it.d === 1) continue;

      if (!hasQuery) {
        out.push({ item: it, score: 0 });
        continue;
      }

      const name = normalize(it.n);
      let score = -1;
      if (name.startsWith(nq)) score = 100;
      else if (name.includes(nq)) score = 80;
      else if (it.i.some((x) => normalize(x).includes(nq))) score = 60;
      else if (it.g.some((x) => normalize(x).includes(nq))) score = 40;
      else if (normalize(it.m).includes(nq)) score = 20;
      if (score >= 0) out.push({ item: it, score });
    }

    if (hasQuery) out.sort((a, b) => b.score - a.score);
    return out.map((s) => s.item);
  }, [items, q, cat, risks, noDrowsy]);

  // フィルタ変更時は表示件数をリセット
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [q, cat, risks, noDrowsy]);

  const toggleRisk = (value: number) => {
    setRisks((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value]
    );
    trackEvent('explorer_filter', { type: 'risk', value: String(value) });
  };

  const isFiltering =
    q.trim().length > 0 || cat !== '' || risks.length > 0 || noDrowsy;

  return (
    <section className="mb-10 rounded-lg border border-gray-200 bg-white p-4 md:p-5">
      {/* 検索入力 */}
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="商品名・成分・症状・メーカーで絞り込み(例: ロキソニン、頭痛)"
        aria-label="市販薬を絞り込み検索"
        className="mb-3 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light"
      />

      {/* フィルタ */}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <select
          value={cat}
          onChange={(e) => {
            setCat(e.target.value);
            trackEvent('explorer_filter', { type: 'cat', value: e.target.value });
          }}
          aria-label="カテゴリで絞り込み"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-brand focus:outline-none"
        >
          <option value="">すべてのカテゴリ</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}({c.count})
            </option>
          ))}
        </select>

        {RISK_FILTERS.map((rf) => (
          <button
            key={rf.value}
            type="button"
            onClick={() => toggleRisk(rf.value)}
            aria-pressed={risks.includes(rf.value)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              risks.includes(rf.value)
                ? 'border-brand bg-brand text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:border-brand'
            }`}
          >
            {rf.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => {
            setNoDrowsy((v) => !v);
            trackEvent('explorer_filter', { type: 'no_drowsy', value: String(!noDrowsy) });
          }}
          aria-pressed={noDrowsy}
          className={`rounded-full border px-3 py-1.5 text-sm transition ${
            noDrowsy
              ? 'border-brand bg-brand text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:border-brand'
          }`}
        >
          眠気成分なし
        </button>
      </div>

      {/* 結果 */}
      {loadError && (
        <p className="mt-3 text-sm text-gray-600">
          検索データの読み込みに失敗しました。再読み込みしてお試しください。
        </p>
      )}

      {!loadError && !items && (
        <p className="mt-3 text-sm text-gray-500">検索データを読み込み中…</p>
      )}

      {items && isFiltering && (
        <div className="mt-3">
          <p className="mb-3 text-sm text-gray-600">
            {filtered.length}件が見つかりました
          </p>
          {filtered.length > 0 && (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {filtered.slice(0, visible).map((it) => (
                <li key={it.s}>
                  <Link
                    href={`/medicines/${it.s}/`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 transition hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-900">
                        {it.n}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {it.m}
                        {it.g.length > 0 && ` ・ ${it.g.slice(0, 3).join('/')}`}
                      </span>
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-1">
                      {it.d === 1 && (
                        <span className="whitespace-nowrap rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-800">
                          眠気あり
                        </span>
                      )}
                      <span className={riskBadgeClass(it.r)}>
                        {riskLabel(it.r)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {filtered.length > visible && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="rounded-lg border border-gray-300 px-6 py-2 text-sm text-gray-700 transition hover:border-brand hover:text-brand"
              >
                さらに表示({filtered.length - visible}件)
              </button>
            </div>
          )}
        </div>
      )}

      {items && !isFiltering && (
        <p className="mt-2 text-xs text-gray-500">
          {items.length}品からその場で絞り込めます。キーワード入力またはフィルタを選択してください。
        </p>
      )}
    </section>
  );
}
