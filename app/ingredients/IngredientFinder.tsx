'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type Item = { name: string; slug: string; count: number };

/** ひらがな→カタカナ・全角英数→半角・小文字化 */
function normalize(s: string): string {
  return s
    .replace(/[ぁ-ん]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .toLowerCase()
    .trim();
}

// 五十音の行インデックス
const ROWS: { label: string; chars: string }[] = [
  { label: 'ア', chars: 'アイウエオヴ' },
  { label: 'カ', chars: 'カキクケコガギグゲゴ' },
  { label: 'サ', chars: 'サシスセソザジズゼゾ' },
  { label: 'タ', chars: 'タチツテトダヂヅデド' },
  { label: 'ナ', chars: 'ナニヌネノ' },
  { label: 'ハ', chars: 'ハヒフヘホバビブベボパピプペポ' },
  { label: 'マ', chars: 'マミムメモ' },
  { label: 'ヤ', chars: 'ヤユヨ' },
  { label: 'ラ', chars: 'ラリルレロ' },
  { label: 'ワ', chars: 'ワヲン' },
  { label: 'A-Z', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' },
];

function rowOf(name: string): string {
  const c = normalize(name)[0]?.toUpperCase() || '';
  const k = name[0] || '';
  for (const r of ROWS) {
    if (r.chars.includes(k) || r.chars.includes(c)) return r.label;
  }
  return 'その他';
}

const SHOW_STEP = 60;

export function IngredientFinder({ items }: { items: Item[] }) {
  const [q, setQ] = useState('');
  const [row, setRow] = useState('');
  const [visible, setVisible] = useState(SHOW_STEP);

  const filtered = useMemo(() => {
    const nq = normalize(q);
    let out = items;
    if (nq) out = out.filter((i) => normalize(i.name).includes(nq));
    if (row) out = out.filter((i) => rowOf(i.name) === row);
    // 配合薬品数の多い順
    return [...out].sort((a, b) => b.count - a.count);
  }, [items, q, row]);

  const isFiltering = q.trim() !== '' || row !== '';
  const popular = useMemo(
    () => [...items].sort((a, b) => b.count - a.count).slice(0, 12),
    [items]
  );

  const select = (r: string) => {
    setRow((prev) => (prev === r ? '' : r));
    setVisible(SHOW_STEP);
  };

  return (
    <>
      {/* 検索パネル */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 md:p-7">
        <div className="relative">
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setVisible(SHOW_STEP);
            }}
            placeholder="成分名で検索(例: ロキソプロフェン)"
            aria-label="成分名で検索"
            className="w-full rounded-xl border border-gray-300 bg-white py-4 pl-12 pr-4 text-base text-brand-ink placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        {/* 五十音インデックス */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {ROWS.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => select(r.label)}
              aria-pressed={row === r.label}
              className={`min-w-[2.5rem] rounded-md border px-2.5 py-1.5 text-sm font-medium transition ${
                row === r.label
                  ? 'border-brand-dark bg-brand-dark text-white'
                  : 'border-gray-300 bg-white text-gray-600 hover:border-brand hover:text-brand-dark'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      {/* ===== 絞り込みなし: よく見られる成分だけ ===== */}
      {!isFiltering && (
        <section className="mt-8">
          <h2 className="mb-3 text-base font-bold text-brand-ink">
            よく見られる成分
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {popular.map((i) => (
              <Link
                key={i.slug}
                href={`/ingredients/${i.slug}/`}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 transition hover:border-brand"
              >
                <span className="font-semibold text-brand-ink">{i.name}</span>
                <span className="text-xs text-gray-400">{i.count}品</span>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-center text-sm text-gray-400">
            すべての成分は、検索または五十音から表示できます
          </p>
        </section>
      )}

      {/* ===== 絞り込みあり: 結果リスト ===== */}
      {isFiltering && (
        <section className="mt-8" aria-live="polite">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-bold text-brand-ink">
              検索結果{' '}
              <span className="text-brand-dark">{filtered.length}</span>
              <span className="text-sm">件</span>
            </h2>
            <button
              type="button"
              onClick={() => {
                setQ('');
                setRow('');
              }}
              className="text-sm text-gray-500 underline underline-offset-2 hover:text-brand-dark"
            >
              条件をクリア
            </button>
          </div>

          {filtered.length === 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
              <p className="mb-1 font-bold text-brand-ink">
                該当する成分が見つかりませんでした
              </p>
              <p className="text-sm text-gray-500">
                表記ゆれ(カタカナ・英語)を変えてお試しください。
              </p>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.slice(0, visible).map((i) => (
              <Link
                key={i.slug}
                href={`/ingredients/${i.slug}/`}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 transition hover:border-brand"
              >
                <span className="font-semibold text-brand-ink">{i.name}</span>
                <span className="text-xs text-gray-400">{i.count}品</span>
              </Link>
            ))}
          </div>

          {filtered.length > visible && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => setVisible((v) => v + SHOW_STEP)}
                className="btn-primary px-8 py-3"
              >
                さらに表示(残り{filtered.length - visible}件)
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
