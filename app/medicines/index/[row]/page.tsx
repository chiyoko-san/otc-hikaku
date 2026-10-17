import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { buildMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/layout/JsonLd';
import { getIndexRows, getMedicinesInRow, getRowHeads, getRowLabel, headCharOf } from '@/lib/kana-index';

// 配置先: app/medicines/index/[row]/page.tsx  →  /medicines/index/a/ など
// 行ごとの一覧。見出しの文字（ア・イ・ウ…）ごとに区切り、各薬ページへの素のリンクを並べる。

export function generateStaticParams() {
  return getIndexRows().map((r) => ({ row: r.key }));
}

type Props = { params: { row: string } };

export function generateMetadata({ params }: Props): Metadata {
  const label = getRowLabel(params.row);
  if (!label) return { title: 'ページが見つかりません' };
  const n = getMedicinesInRow(params.row).length;
  return buildMetadata({
    title: `${label}の市販薬 ${n.toLocaleString('ja-JP')}品｜50音順一覧`,
    description: `${label}で始まる市販薬${n.toLocaleString('ja-JP')}品の一覧。名前を押すと成分・効能・リスク区分・注意点のページに進みます。`,
    path: `/medicines/index/${params.row}/`,
  });
}

export default function MedicineIndexRowPage({ params }: Props) {
  const label = getRowLabel(params.row);
  if (!label) notFound();
  const meds = getMedicinesInRow(params.row);
  const heads = getRowHeads(params.row);

  // かな行は見出し文字ごとに区切る。英字・漢字は1本のリスト
  const groups: { head: string; items: typeof meds }[] = heads.length
    ? heads
        .map((h) => ({ head: h, items: meds.filter((m) => headCharOf(m.name) === h) }))
        .filter((g) => g.items.length > 0)
    : [{ head: '', items: meds }];
  // 見出しに当てはまらない文字（長音など）があれば最後にまとめる
  if (heads.length) {
    const rest = meds.filter((m) => !heads.includes(headCharOf(m.name)));
    if (rest.length) groups.push({ head: 'その他', items: rest });
  }

  const crumbs = [
    { name: 'ホーム', href: '/' },
    { name: '薬を探す', href: '/medicines/' },
    { name: '50音順の一覧', href: '/medicines/index/' },
    { name: label },
  ];

  return (
    <div className="container-narrow py-6 md:py-10">
      <JsonLd data={buildBreadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, url: c.href || `/medicines/index/${params.row}/` })))} />
      <Breadcrumb items={crumbs} />

      <h1 className="mt-2 text-2xl font-bold md:text-4xl">{label}の市販薬</h1>
      <p className="mt-2 text-base text-gray-600 md:text-lg">{meds.length.toLocaleString('ja-JP')}品。名前を押すと詳しいページに進みます。</p>

      {groups.length > 1 ? (
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="見出し">
          {groups.map((g) => (
            <a key={g.head} href={`#h-${g.head}`} className="inline-flex min-h-[40px] items-center rounded-full border border-gray-300 bg-white px-4 text-base text-brand">
              {g.head}
            </a>
          ))}
        </nav>
      ) : null}

      {groups.map((g) => (
        <section key={g.head || 'all'} id={g.head ? `h-${g.head}` : undefined} className="mt-8">
          {g.head ? <h2 className="text-xl font-bold">{g.head}</h2> : null}
          <ul className="mt-3 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            {g.items.map((m) => (
              <li key={m.id}>
                <Link href={`/medicines/${m.slug}/`} className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2 hover:bg-brand-light">
                  <span className="min-w-0">
                    <span className="block text-base text-brand-ink">{m.name}</span>
                    {m.maker ? <span className="block text-xs text-gray-500">{m.maker}</span> : null}
                  </span>
                  <span className="shrink-0 text-gray-400" aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-10 text-base text-gray-600">
        <Link href="/medicines/index/" className="font-bold text-brand underline underline-offset-4">ほかの行を見る</Link>
      </p>
    </div>
  );
}
