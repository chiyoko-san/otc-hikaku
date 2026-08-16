import Link from 'next/link';
import type { Metadata } from 'next';
import { getPublishedColumns } from '@/lib/supabase/columns';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { buildMetadata } from '@/lib/seo';

// コラムは毎日追加されうるので短い間隔で再生成
export const revalidate = 60;

export const metadata: Metadata = buildMetadata({
  title: '市販薬コラム|薬剤師監修の市販薬選び方ガイド',
  description:
    '市販薬の選び方・安全情報・成分比較など、薬と健康にまつわるコラムを毎日更新。',
  path: '/columns/',
});

/** "2026-08-15" 等を「2026年8月15日」に。datetime属性用に元の値も返す */
function formatDate(raw: string | null): { text: string; dt: string } | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return { text: raw, dt: raw };
  return {
    text: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`,
    dt: d.toISOString().slice(0, 10),
  };
}

export default async function ColumnsIndexPage() {
  const columns = await getPublishedColumns(100);

  return (
    <div className="container-narrow py-6 md:py-10">
      <Breadcrumb items={[{ name: 'ホーム', href: '/' }, { name: 'コラム' }]} />

      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-brand-ink md:text-4xl">
          コラム
        </h1>
        <p className="text-gray-600">
          市販薬の選び方・安全情報・成分比較について、データに基づいた記事を公開しています。
        </p>
      </header>

      {columns.length === 0 ? (
        <p className="text-gray-500">公開中のコラムがありません。</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
          {columns.map((c) => {
            const date = formatDate(c.date);
            return (
              <li key={c.id}>
                <Link
                  href={`/columns/${c.slug || c.id}/`}
                  className="group block px-5 py-5 transition hover:bg-brand-light/20 md:px-7"
                >
                  <h2 className="mb-1.5 text-base font-bold leading-relaxed text-brand-ink group-hover:text-brand-dark md:text-lg">
                    {c.title}
                  </h2>
                  {c.summary && (
                    <p className="mb-2 line-clamp-2 text-sm leading-relaxed text-gray-500">
                      {c.summary}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                    {date && <time dateTime={date.dt}>{date.text}</time>}
                    {c.tag && (
                      <span className="rounded bg-brand-light px-2 py-0.5 font-medium text-brand-deep">
                        {c.tag}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
