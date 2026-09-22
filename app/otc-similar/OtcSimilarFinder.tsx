'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

// 配置先: app/otc-similar/OtcSimilarFinder.tsx
// page.tsx（サーバー側）で組み立てたデータを受け取り、
// 「薬の名前で探す」「用途で探す」の2通りで77成分のカードを表示する。

export type FinderMedicine = { name: string; slug: string };
export type FinderGuide = { slug: string; rxName: string };
export type FinderRow = {
  no: number;
  name: string; // 成分名（厚労省表記）
  use: string; // 用途
  group: string; // OtcSimilarGroup
  rxExamples: string[]; // 代表的な処方薬
  otcCount: number;
  otcTop: FinderMedicine[];
  guides: FinderGuide[];
};
export type FinderGroup = { key: string; label: string; lead: string };
export type FinderName = {
  label: string; // 処方薬名
  kana: string; // あ〜わ / 英
  target: boolean; // 特別料金の対象か
  no: number | null; // 対象成分の番号（対象外は null）
  guideSlug?: string; // 切替ガイドのslug
};

const KANA_ROWS = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ', '英'];

function toKatakana(s: string): string {
  return s.replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

export default function OtcSimilarFinder({
  rows,
  groups,
  names,
}: {
  rows: FinderRow[];
  groups: FinderGroup[];
  names: FinderName[];
}) {
  const [query, setQuery] = useState('');
  const [kana, setKana] = useState<string | null>(null);

  const q = toKatakana(query.trim());

  const filteredNames = useMemo(() => {
    let list = names;
    if (q) list = list.filter((n) => toKatakana(n.label).includes(q));
    if (kana) list = list.filter((n) => n.kana === kana);
    return list;
  }, [names, q, kana]);

  const filteredRows = useMemo(() => {
    if (!q) return rows;
    return rows.filter(
      (r) =>
        toKatakana(r.name).includes(q) ||
        r.rxExamples.some((x) => toKatakana(x).includes(q)) ||
        r.otcTop.some((m) => toKatakana(m.name).includes(q))
    );
  }, [rows, q]);

  const showingIndex = Boolean(q || kana);

  return (
    <div className="mt-10">
      {/* ① 薬の名前で探す */}
      <section id="find-by-name" className="scroll-mt-24">
        <h2 className="text-2xl font-bold leading-snug md:text-3xl">
          <span className="mr-2 inline-block rounded-full bg-[#1f4d3a] px-3 py-0.5 text-lg text-white align-middle">1</span>
          あなたの薬は対象？ 名前で探す
        </h2>
        <p className="mt-2 text-lg leading-relaxed">
          お薬手帳や薬袋に書いてある薬の名前で探せます。頭文字を押すか、名前を入力してください。
        </p>

        <label className="mt-4 block">
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

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="頭文字で探す">
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
                  'min-h-[52px] min-w-[52px] rounded-lg border-2 px-3 text-xl font-bold ' +
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

        {showingIndex && (
          <div className="mt-5 rounded-lg border-2 border-[#1f4d3a] bg-[#f3f9f5] p-4">
            {filteredNames.length === 0 ? (
              <p className="text-lg leading-relaxed">
                この名前の薬は一覧にありません。成分名でも探せます。下の「用途で探す」もお試しください。
              </p>
            ) : (
              <ul className="divide-y divide-gray-300">
                {filteredNames.map((n) => (
                  <li key={`${n.label}-${n.no ?? 'x'}`} className="py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge target={n.target} />
                      <span className="text-xl font-bold">{n.label}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {n.no != null && (
                        <a
                          href={`#ing-${n.no}`}
                          className="inline-block min-h-[48px] rounded-lg bg-[#1f4d3a] px-4 py-2.5 text-lg font-bold text-white"
                        >
                          同じ成分の市販薬を見る
                        </a>
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
      </section>

      {/* ② 用途で探す */}
      <section id="find-by-use" className="mt-12 scroll-mt-24">
        <h2 className="text-2xl font-bold leading-snug md:text-3xl">
          <span className="mr-2 inline-block rounded-full bg-[#1f4d3a] px-3 py-0.5 text-lg text-white align-middle">2</span>
          用途で探す（対象77成分のすべて）
        </h2>
        <p className="mt-2 text-lg leading-relaxed">
          それぞれの成分について、同じ成分を含む市販薬を当サイトのデータから表示しています。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {groups.map((g) => (
            <a
              key={g.key}
              href={`#group-${g.key}`}
              className="inline-block min-h-[48px] rounded-lg border-2 border-gray-400 bg-white px-4 py-2.5 text-lg font-bold text-gray-900 hover:bg-[#e8f3ec]"
            >
              {g.label}
            </a>
          ))}
        </div>

        {groups.map((g) => {
          const groupRows = filteredRows.filter((r) => r.group === g.key);
          if (groupRows.length === 0) return null;
          return (
            <div key={g.key} id={`group-${g.key}`} className="mt-10 scroll-mt-24">
              <h3 className="border-l-8 border-[#1f4d3a] pl-3 text-2xl font-bold">{g.label}</h3>
              <p className="mt-1 text-lg text-gray-800">{g.lead}</p>
              <ul className="mt-4 space-y-4">
                {groupRows.map((r) => (
                  <li
                    key={r.no}
                    id={`ing-${r.no}`}
                    className="scroll-mt-24 rounded-xl border-2 border-gray-300 bg-white p-5"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge target />
                      <span className="text-2xl font-bold leading-snug">
                        {r.rxExamples.length > 0 ? r.rxExamples.join('・') : r.name}
                      </span>
                    </div>
                    <p className="mt-2 text-lg text-gray-800">
                      成分：{r.name}
                      <span className="text-gray-600">（{r.use}）</span>
                    </p>

                    <div className="mt-4">
                      <p className="text-lg font-bold">
                        同じ成分の市販薬
                        {r.otcCount > 0 && (
                          <span className="ml-2 font-normal text-gray-700">{r.otcCount}件</span>
                        )}
                      </p>
                      {r.otcCount === 0 ? (
                        <p className="mt-1 text-lg text-gray-700">
                          当サイトのデータでは、同じ成分の市販薬が見つかりませんでした。薬局で薬剤師に相談してください。
                        </p>
                      ) : (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {r.otcTop.map((m) => (
                            <li key={m.slug}>
                              <Link
                                href={`/medicines/${m.slug}/`}
                                className="inline-block min-h-[48px] rounded-lg border-2 border-[#1f4d3a] bg-[#e8f3ec] px-4 py-2.5 text-lg font-bold text-[#1f4d3a]"
                              >
                                {m.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {r.guides.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {r.guides.map((gd) => (
                          <Link
                            key={gd.slug}
                            href={`/switch/${gd.slug}/`}
                            className="inline-block min-h-[48px] rounded-lg bg-[#1f4d3a] px-4 py-2.5 text-lg font-bold text-white"
                          >
                            {gd.rxName}を市販薬に替えるときの注意
                          </Link>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {q && filteredRows.length === 0 && (
          <p className="mt-6 text-lg leading-relaxed">
            「{query}」に当てはまる成分はありませんでした。
          </p>
        )}
      </section>
    </div>
  );
}

function Badge({ target }: { target: boolean }) {
  return target ? (
    <span className="inline-block rounded-md bg-[#b42318] px-2.5 py-1 text-base font-bold text-white">
      上乗せ対象
    </span>
  ) : (
    <span className="inline-block rounded-md border-2 border-gray-500 bg-white px-2.5 py-1 text-base font-bold text-gray-800">
      対象外
    </span>
  );
}
