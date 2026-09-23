'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { SlimItem } from '@/lib/otc-similar-items';

// 配置先: app/otc-similar/simulator/Simulator.tsx

type Picked = { item: SlimItem; qty: number };

const RATES = [
  { value: 0.1, label: '1割' },
  { value: 0.2, label: '2割' },
  { value: 0.3, label: '3割' },
];

// 「湿布」「花粉症」のような言葉 → 成分・剤形への言い換え（キーも値も norm() で比較する）
const SYNONYMS_RAW: Record<string, string[]> = {
  湿布: ['シップ', 'テープ', 'パップ'],
  シップ: ['シップ', 'テープ', 'パップ'],
  塗り薬: ['軟膏', 'クリーム', 'ローション', 'ゲル'],
  保湿: ['ヘパリン類似物質', 'ワセリン', '尿素'],
  花粉症: ['フェキソフェナジン', 'エピナスチン', 'ロラタジン', 'ベポタスチン', 'ケトチフェン', 'フルチカゾン', 'モメタゾン', 'ペミロラスト'],
  鼻炎: ['フェキソフェナジン', 'エピナスチン', 'ロラタジン', 'ベポタスチン', 'ケトチフェン', 'フルチカゾン', 'モメタゾン'],
  痛み止め: ['ロキソプロフェン', 'ジクロフェナク', 'イブプロフェン', 'インドメタシン', 'フェルビナク'],
  鎮痛: ['ロキソプロフェン', 'ジクロフェナク', 'イブプロフェン', 'インドメタシン', 'フェルビナク'],
  便秘: ['酸化マグネシウム', 'ピコスルファート', 'ビサコジル', 'マルツエキス'],
  うがい: ['ポビドンヨード'],
  水虫: ['テルビナフィン', 'ブテナフィン', 'ミコナゾール', 'クロトリマゾール', 'オキシコナゾール', 'イソコナゾール'],
  みずむし: ['テルビナフィン', 'ブテナフィン', 'ミコナゾール', 'クロトリマゾール', 'オキシコナゾール', 'イソコナゾール'],
  ヘルペス: ['アシクロビル', 'ビダラビン'],
  ステロイド: ['ベタメタゾン', 'ヒドロコルチゾン', 'プレドニゾロン', 'デキサメタゾン', 'トリアムシノロン'],
  かぜ: ['カルボシステイン', '非ピリン'],
  風邪: ['カルボシステイン', '非ピリン'],
  たん: ['カルボシステイン'],
  痰: ['カルボシステイン'],
  消毒: ['エタノール', 'イソプロパノール', 'クロルヘキシジン', 'ベンザルコニウム', 'ポビドンヨード', 'オキシドール'],
};

function norm(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/[ー\-‐\s]/g, '')
    .toLowerCase();
}

const SYNONYMS: Record<string, string[]> = Object.fromEntries(
  Object.entries(SYNONYMS_RAW).map(([k, v]) => [norm(k), v.map(norm)])
);

function unitOf(spec: string): string {
  const m = spec.match(/(錠|カプセル|包|g|mL|枚|管|瓶|個|本|袋)$/);
  return m ? m[1] : '単位';
}

function presetsFor(unit: string): number[] {
  if (unit === '枚') return [7, 14, 28, 35, 70];
  if (unit === 'g' || unit === 'mL') return [10, 25, 50, 100, 200];
  if (unit === '包') return [14, 21, 42, 84];
  return [7, 14, 28, 30, 60, 90]; // 錠・カプセルなど
}

function yen(n: number): string {
  return `${Math.round(n).toLocaleString('ja-JP')}円`;
}

function calc(item: SlimItem, qty: number, rate: number) {
  const drugCost = item.price * qty;
  const before = drugCost * rate;
  const surcharge = drugCost / 4;
  const after = surcharge + (drugCost - surcharge) * rate;
  return { drugCost, before, surcharge, after, diff: after - before };
}

export default function Simulator({ items }: { items: SlimItem[] }) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Picked[]>([]);
  const [rate, setRate] = useState(0.3);

  // ?item=CODE / ?items=CODE,CODE,… で最初の薬を入れる（撮るだけページ・薬価表から）
  useEffect(() => {
    const codes = [searchParams.get('item'), ...(searchParams.get('items') || '').split(',')]
      .map((c) => (c || '').trim())
      .filter(Boolean);
    if (codes.length === 0) return;
    const initial = codes
      .map((c) => items.find((i) => i.code === c))
      .filter((i): i is SlimItem => Boolean(i))
      .map((it) => ({ item: it, qty: presetsFor(unitOf(it.spec))[1] }));
    if (initial.length) setPicked(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, items]);

  const q = norm(query.trim());
  const results = useMemo(() => {
    if (q.length < 1) return [];
    const words = SYNONYMS[q] ?? [q];
    const hit = items.filter((i) => {
      const hay = norm(i.name) + '|' + norm(i.ingredient);
      return words.some((w) => hay.includes(w));
    });
    const rank = (k: string) => (k === '先発' ? 0 : k === '後発' ? 1 : 2);
    hit.sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name, 'ja'));
    return hit.slice(0, 40);
  }, [q, items]);

  const add = (it: SlimItem) => {
    if (picked.some((p) => p.item.code === it.code)) return;
    setPicked([...picked, { item: it, qty: presetsFor(unitOf(it.spec))[1] }]);
    setQuery('');
  };
  const setQty = (code: string, qty: number) =>
    setPicked(picked.map((p) => (p.item.code === code ? { ...p, qty: Math.max(0, qty) } : p)));
  const remove = (code: string) => setPicked(picked.filter((p) => p.item.code !== code));

  const rows = picked.map((p) => ({ ...p, r: calc(p.item, p.qty, rate) }));
  const total = rows.reduce(
    (a, x) => ({ before: a.before + x.r.before, after: a.after + x.r.after, diff: a.diff + x.r.diff, surcharge: a.surcharge + x.r.surcharge }),
    { before: 0, after: 0, diff: 0, surcharge: 0 }
  );

  return (
    <div className="mt-6">
      {/* ① 探す */}
      <section>
        <h2 className="text-2xl font-bold">
          <span className="mr-2 inline-block rounded-full bg-[#1f4d3a] px-3 py-0.5 text-lg text-white align-middle">1</span>
          薬を探す
        </h2>
        <label className="mt-3 block">
          <span className="sr-only">薬の名前か成分名</span>
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例：ロキソニン、ヒルドイド、湿布"
            className="w-full rounded-lg border-2 border-gray-500 px-4 py-3 text-xl leading-relaxed focus:border-[#1f4d3a] focus:outline-none focus:ring-2 focus:ring-[#1f4d3a]"
          />
        </label>
        {!q && picked.length === 0 && (
          <p className="mt-3 text-base text-gray-700">
            薬が多いときは
            <Link href="/otc-similar/photo/" className="font-bold text-[#1f4d3a] underline">お薬手帳を撮るだけ</Link>
            で全部まとめて入れられます。
          </p>
        )}
        {q && (
          <div className="mt-3 rounded-xl border-2 border-gray-300 bg-white">
            {results.length === 0 ? (
              <p className="p-4">
                見つかりませんでした。この薬は上乗せ料金の対象外か、名前の表記が違う可能性があります。
                成分名（お薬手帳の「一般名」）でも探してみてください。
              </p>
            ) : (
              <ul className="max-h-[420px] divide-y-2 divide-gray-200 overflow-y-auto">
                {results.map((i) => (
                  <li key={i.code}>
                    <button
                      type="button"
                      onClick={() => add(i)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#e8f3ec]"
                    >
                      <span>
                        <span className="block text-xl font-bold">{i.name}</span>
                        <span className="block text-base text-gray-600">
                          {i.spec}・薬価{i.price}円
                          {i.kind === '先発' && '・先発'}
                          {i.kind === '後発' && '・ジェネリック'}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-lg bg-[#1f4d3a] px-3 py-2 text-base font-bold text-white">追加</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {results.length === 40 && (
              <p className="border-t-2 border-gray-200 p-3 text-base text-gray-600">たくさん見つかりました。名前をもう少し入れると絞れます。</p>
            )}
          </div>
        )}
      </section>

      {/* ② 数量 */}
      {picked.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold">
            <span className="mr-2 inline-block rounded-full bg-[#1f4d3a] px-3 py-0.5 text-lg text-white align-middle">2</span>
            量を入れる
          </h2>
          <p className="mt-1 text-base text-gray-700">1回の処方でもらう量です。薬袋や薬の説明書に書いてあります。</p>
          <ul className="mt-3 space-y-4">
            {picked.map((p) => {
              const unit = unitOf(p.item.spec);
              return (
                <li key={p.item.code} className="rounded-xl border-2 border-gray-300 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-xl font-bold">{p.item.name}</div>
                      <div className="text-base text-gray-600">{p.item.spec}・薬価{p.item.price}円／1{unit}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(p.item.code)}
                      className="min-h-[44px] rounded-lg border-2 border-gray-400 px-3 text-base font-bold text-gray-700"
                    >
                      削除
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {presetsFor(unit).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setQty(p.item.code, n)}
                        aria-pressed={p.qty === n}
                        className={
                          'min-h-[48px] rounded-lg border-2 px-4 text-lg font-bold ' +
                          (p.qty === n ? 'border-[#1f4d3a] bg-[#1f4d3a] text-white' : 'border-gray-400 bg-white text-gray-900')
                        }
                      >
                        {n}{unit}
                      </button>
                    ))}
                    <label className="flex items-center gap-2">
                      <span className="sr-only">数量</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={p.qty}
                        onChange={(e) => setQty(p.item.code, Number(e.target.value))}
                        className="w-28 rounded-lg border-2 border-gray-500 px-3 py-2 text-right text-xl"
                      />
                      <span className="text-lg">{unit}</span>
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-base text-gray-700">
            ほかの薬も足せます。上の「薬を探す」からもう一度探してください。
          </p>
        </section>
      )}

      {/* ③ 負担割合と結果 */}
      {picked.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold">
            <span className="mr-2 inline-block rounded-full bg-[#1f4d3a] px-3 py-0.5 text-lg text-white align-middle">3</span>
            窓口負担の割合
          </h2>
          <p className="mt-1 text-base text-gray-700">保険証やマイナポータルで確認できます。70歳以上は1割か2割の方が多いです。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {RATES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRate(r.value)}
                aria-pressed={rate === r.value}
                className={
                  'min-h-[56px] min-w-[96px] rounded-lg border-2 px-5 text-2xl font-bold ' +
                  (rate === r.value ? 'border-[#1f4d3a] bg-[#1f4d3a] text-white' : 'border-gray-400 bg-white text-gray-900')
                }
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-xl border-2 border-[#b42318] bg-[#fff5f4] p-5" aria-live="polite">
            <p className="text-xl font-bold">1回の処方でこう変わります（薬代の部分だけ）</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-white p-3">
                <div className="text-base text-gray-700">これまで</div>
                <div className="text-2xl font-bold md:text-3xl">{yen(total.before)}</div>
              </div>
              <div className="rounded-lg bg-white p-3">
                <div className="text-base text-gray-700">これから</div>
                <div className="text-2xl font-bold md:text-3xl">{yen(total.after)}</div>
              </div>
              <div className="rounded-lg bg-[#b42318] p-3 text-white">
                <div className="text-base">増える額</div>
                <div className="text-2xl font-bold md:text-3xl">+{yen(total.diff)}</div>
              </div>
            </div>
            <p className="mt-3 text-base text-gray-700">上乗せ料金の合計は{yen(total.surcharge)}（薬価×量÷4）。診察料・調剤料などは別です。</p>

            {rows.length > 1 && (
              <ul className="mt-4 divide-y-2 divide-gray-200 border-t-2 border-gray-200 text-base">
                {rows.map((x) => (
                  <li key={x.item.code} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="font-bold">{x.item.name} × {x.qty}{unitOf(x.item.spec)}</span>
                    <span>{yen(x.r.before)} → {yen(x.r.after)}（<span className="font-bold text-[#b42318]">+{yen(x.r.diff)}</span>）</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {Array.from(new Set(rows.map((x) => x.item.group))).map((g) => (
              <Link
                key={g}
                href={`/otc-similar/use/${g}/`}
                className="inline-block min-h-[48px] rounded-lg border-2 border-[#1f4d3a] bg-white px-4 py-2.5 text-lg font-bold text-[#1f4d3a]"
              >
                同じ成分の市販薬を見る
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
