import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchResults } from '@/components/medicine/SearchResults';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { buildMetadata } from '@/lib/seo';

type Props = {
  searchParams: { q?: string };
};

export function generateMetadata({ searchParams }: Props): Metadata {
  const q = (searchParams.q || '').trim();
  return buildMetadata({
    title: q ? `「${q}」の検索結果` : '市販薬の検索',
    description: q
      ? `「${q}」に関連する市販薬の一覧。成分・効能・リスク区分から絞り込み可能。`
      : '市販薬を商品名・成分・症状・メーカーから検索できます。',
    path: q ? `/search/?q=${encodeURIComponent(q)}` : '/search/',
    noindex: !!q, // クエリ付き検索ページはnoindex
  });
}

export default function SearchPage({ searchParams }: Props) {
  const q = (searchParams.q || '').trim();

  return (
    <div className="container-wide py-6 md:py-10">
      <Breadcrumb
        items={[
          { name: 'ホーム', href: '/' },
          { name: q ? `「${q}」の検索結果` : '検索' },
        ]}
      />

      <header className="mb-6">
        <h1 className="text-3xl font-bold md:text-4xl">
          {q ? `「${q}」の検索結果` : '市販薬を検索'}
        </h1>
      </header>

      <Suspense fallback={<p className="text-gray-500">読み込み中…</p>}>
        <SearchResults q={q} />
      </Suspense>
    </div>
  );
}
