'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { OtcSimilarName } from '@/lib/otc-similar-data';

// 配置先: app/otc-similar/name/NameFinder.tsx
// 何も押していない状態では一覧を出さない。頭文字を押すか名前を入力したときだけ表示する。

const KANA_ROWS = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ', '英'];
const HUB = '/otc-similar/';
const USE = '/otc-similar/use/';

function toKatakana(s: string): string {
  return s.replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

export default function NameFinder({ names }: { names: OtcSimilarName[] }) {
  const [query, setQuery] = useState('');
  const [kana, setKana] = useState<string | null>(null);
  const q = toKatakana(query.trim());

  const results = useMemo(() => {
    if (!q && !kana) return null;
    let list = names;
    if (q) list = list.filter((n) => toKatakana(n.label).includes(q));
    if (kana) list = list.filter((n) => n.kana === kana);
    return list;
  }, [names, q, kana]);

  return (
    <div className="mt-6">
      <p className="text-xl font-bold">頭文字を押してください</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="頭文字で探す">
        {KANA_ROWS.map((k) => {
          const active = kana === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKana(active ? null : k);
                setQuery('');
              }}
              aria-pressed={active}
              className={
                'min-h-[56px] min-w-[56px] rounded-lg border-2 px-3 text-2xl font-bold ' +
                (active
                  ? 'border-[#1f4d3a] bg-[#1f4d3a] text-white'
                  : 'border-gray-400 bg-white text-gray-900 hover:bg-[#e8f3ec]')
              }
            >
              {k}
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-xl font-bold">または、名前を入力</p>
      <label className="mt-3 block">
        <span className="sr-only">薬の名前を入力</span>
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setKana(null);
          }}
          placeholder="例：ロキソニン、ヒルドイド"
          className="w-full rounded-lg border-2 border-gray-500 px-4 py-3 text-xl leading-relaxed focus:border-[#1f4d3a] focus:outline-none focus:ring-2 focus:ring-[#1f4d3a]"
        />
      </label>

      {results && (
        <div className="mt-6 rounded-xl border-2 border-[#1f4d3a] bg-[#f3f9f5] p-4" aria-live="polite">
          {results.length === 0 ? (
            <div>
              <p className="text-lg leading-relaxed">この名前の薬は一覧にありません。</p>
              <p className="mt-2 text-base text-gray-700">
                名前が違う同じ成分の薬（ジェネリック）は、成分名から探せます。
              </p>
              <Link href={USE} className="mt-3 inline-block min-h-[48px] rounded-lg border-2 border-[#1f4d3a] bg-white px-4 py-2.5 text-lg font-bold text-[#1f4d3a]">
                用途から探す
              </Link>
            </div>
          ) : (
            <ul className="divide-y-2 divide-gray-300">
              {results.map((n) => (
                <li key={`${n.label}-${n.no ?? 'x'}`} className="py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    {n.target ? (
                      <span className="inline-block rounded-md bg-[#b42318] px-2.5 py-1 text-base font-bold text-white">上乗せ対象</span>
                    ) : (
                      <span className="inline-block rounded-md border-2 border-gray-500 bg-white px-2.5 py-1 text-base font-bold text-gray-800">対象外</span>
                    )}
                    <span className="text-2xl font-bold">{n.label}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {n.no != null && n.group && (
                      <Link
                        href={`${USE}${n.group}/#ing-${n.no}`}
                        className="inline-block min-h-[48px] rounded-lg bg-[#1f4d3a] px-4 py-2.5 text-lg font-bold text-white"
                      >
                        同じ成分の市販薬を見る
                      </Link>
                    )}
                    {n.guideSlug && (
                      <Link
                        href={`/switch/${n.guideSlug}/`}
                        className="inline-block min-h-[48px] rounded-lg border-2 border-[#1f4d3a] bg-white px-4 py-2.5 text-lg font-bold text-[#1f4d3a]"
                      >
                        市販薬に替えるときの注意
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!results && (
        <p className="mt-6 text-base text-gray-700">
          制度の説明や、いくら増えるかは<Link href={HUB} className="underline">上乗せ料金について</Link>をご覧ください。
        </p>
      )}
    </div>
  );
}
