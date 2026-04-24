import Link from 'next/link';
import type { Metadata } from 'next';
import { getPublishedColumns } from '@/lib/supabase/columns';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { buildMetadata } from '@/lib/seo';

// コラムは毎日追加されうるので 1 時間で再生成
export const revalidate = 3600;

export const metadata: Metadata = buildMetadata({
  title: '市販薬コラム|薬剤師監修の市販薬選び方ガイド',
  description:
    '市販薬の選び方・安全情報・成分比較など、薬と健康にまつわるコラムを毎日更新。',
  path: '/columns/',
});

export default async function ColumnsIndexPage() {
  const columns = await getPublishedColumns(100);

  return (
    <div className="container-wide py-6 md:py-10">
      <Breadcrumb items={[{ name: 'ホーム', href: '/' }, { name: 'コラム' }]} />

      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold md:text-4xl">コラム</h1>
        <p className="text-gray-600">
          市販薬の選び方・安全情報・成分比較について、データに基づいた記事を公開しています。
        </p>
      </header>

      {columns.length === 0 ? (
        <p className="text-gray-500">公開中のコラムがありません。</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {columns.map((c) => (
            <Link
              key={c.id}
              href={`/columns/${c.slug || c.id}/`}
              className="block rounded-lg border border-gray-200 bg-white p-5 transition hover:border-brand hover:shadow-md"
            >
              {c.tag && (
                <span className="mb-2 inline-block rounded bg-brand-light px-2 py-0.5 text-xs text-brand-dark">
                  {c.tag}
                </span>
              )}
              <h2 className="mb-2 text-lg font-bold leading-tight">{c.title}</h2>
              {c.summary && (
                <p className="line-clamp-3 text-sm text-gray-600">{c.summary}</p>
              )}
              {c.date && (
                <div className="mt-3 text-xs text-gray-500">{c.date}</div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
