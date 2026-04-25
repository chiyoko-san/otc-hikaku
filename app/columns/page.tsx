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

// サムネイル画像のフォールバック(thumb が無いコラム用)
function ThumbFallback({ tag }: { tag: string | null }) {
  // タグごとに色を変える(視覚的多様性)
  const colorMap: Record<string, string> = {
    成分: 'from-emerald-100 to-teal-100',
    安全: 'from-orange-100 to-red-100',
    比較: 'from-blue-100 to-cyan-100',
    広告: 'from-purple-100 to-pink-100',
    契約: 'from-yellow-100 to-orange-100',
  };
  const matched = tag
    ? Object.entries(colorMap).find(([k]) => tag.includes(k))?.[1]
    : null;
  const cls = matched || 'from-brand-light to-white';

  return (
    <div className={`flex h-40 items-center justify-center bg-gradient-to-br ${cls}`}>
      <div className="text-center">
        <div className="text-3xl">💊</div>
        {tag && (
          <div className="mt-1 text-xs font-bold text-brand-dark">{tag}</div>
        )}
      </div>
    </div>
  );
}

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
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {columns.map((c) => (
            <Link
              key={c.id}
              href={`/columns/${c.slug || c.id}/`}
              className="group block overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:border-brand hover:shadow-md"
            >
              {/* サムネイル画像 */}
              {c.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.thumb}
                  alt={c.title}
                  className="h-40 w-full object-cover transition group-hover:scale-[1.02]"
                  loading="lazy"
                />
              ) : (
                <ThumbFallback tag={c.tag} />
              )}

              <div className="p-5">
                {c.tag && (
                  <span className="mb-2 inline-block rounded bg-brand-light px-2 py-0.5 text-xs text-brand-dark">
                    {c.tag}
                  </span>
                )}
                <h2 className="mb-2 text-lg font-bold leading-tight group-hover:text-brand">
                  {c.title}
                </h2>
                {c.summary && (
                  <p className="line-clamp-3 text-sm text-gray-600">
                    {c.summary}
                  </p>
                )}
                {c.date && (
                  <div className="mt-3 text-xs text-gray-500">{c.date}</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
