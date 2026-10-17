import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { buildMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/layout/JsonLd';
import { getIndexRows } from '@/lib/kana-index';

// 配置先: app/medicines/index/page.tsx  →  /medicines/index/
// 薬の一覧（50音順）の入口。全薬ページへ「トップ → ここ → 行 → 薬」の3クリックで届くようにする。
// 検索エンジンが全ページを辿るための道でもある（HTMLサイトマップ）。

export const metadata: Metadata = buildMetadata({
  title: '市販薬の一覧（50音順）｜7,000品以上を名前から探す',
  description:
    '市販薬を名前の50音順に一覧にしました。あ行〜わ行、英字、漢字で始まる薬（漢方など）から、成分・効能・リスク区分のページへ。',
  path: '/medicines/index/',
});

export default function MedicineIndexPage() {
  const rows = getIndexRows();
  const kana = rows.filter((r) => r.kind === 'kana');
  const abc = rows.filter((r) => r.kind === 'abc');
  const kanji = rows.filter((r) => r.kind === 'kanji');
  const total = rows.reduce((s, r) => s + r.count, 0);

  const crumbs = [
    { name: 'ホーム', href: '/' },
    { name: '薬を探す', href: '/medicines/' },
    { name: '50音順の一覧' },
  ];

  return (
    <div className="container-narrow py-6 md:py-10">
      <JsonLd data={buildBreadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, url: c.href || '/medicines/index/' })))} />
      <Breadcrumb items={crumbs} />

      <h1 className="mt-2 text-2xl font-bold md:text-4xl">市販薬の一覧（50音順）</h1>
      <p className="mt-3 text-base text-gray-600 md:text-lg">
        {total.toLocaleString('ja-JP')}品を名前の頭文字から探せます。商品名の最初の文字を押してください。
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-bold md:text-2xl">カタカナ・ひらがなで始まる薬</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {kana.map((r) => (
            <li key={r.key}>
              <Link
                href={`/medicines/index/${r.key}/`}
                className="flex min-h-[64px] flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-3 py-3 hover:border-brand"
              >
                <span className="text-xl font-bold text-brand">{r.label}</span>
                <span className="text-xs text-gray-500">{r.count.toLocaleString('ja-JP')}品</span>
              </Link>
            </li>
          ))}
          {abc.map((r) => (
            <li key={r.key}>
              <Link
                href={`/medicines/index/${r.key}/`}
                className="flex min-h-[64px] flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-3 py-3 hover:border-brand"
              >
                <span className="text-xl font-bold text-brand">{r.label}</span>
                <span className="text-xs text-gray-500">{r.count.toLocaleString('ja-JP')}品</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-bold md:text-2xl">漢字で始まる薬（漢方薬など）</h2>
        <p className="mt-2 text-sm text-gray-600 md:text-base">数が多いので、薬の分類ごとに分けています。</p>
        <ul className="mt-4 space-y-2">
          {kanji.map((r) => (
            <li key={r.key}>
              <Link
                href={`/medicines/index/${r.key}/`}
                className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-3 hover:border-brand"
              >
                <span className="font-bold text-brand">{r.label.replace('漢字で始まる薬：', '')}</span>
                <span className="shrink-0 text-sm text-gray-500">{r.count.toLocaleString('ja-JP')}品 ›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 text-base text-gray-600">
        症状や成分から探すなら
        <Link href="/medicines/" className="mx-1 font-bold text-brand underline underline-offset-4">薬を探す</Link>
        へ。
      </p>
    </div>
  );
}
