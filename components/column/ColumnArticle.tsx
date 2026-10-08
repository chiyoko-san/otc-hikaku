import Link from 'next/link';
import type { Column } from '@/types';
import type { ColumnListItem } from '@/lib/supabase/columns';
import { ColumnRenderer } from '@/components/column/ColumnRenderer';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { JsonLd } from '@/components/layout/JsonLd';
import { buildArticleJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo';

// 配置先: components/column/ColumnArticle.tsx
// コラム記事の本体。公開ページ(app/columns/[slug]/page.tsx)と
// 下書きプレビュー(app/columns/[slug]/preview/page.tsx)の両方から使う。

type Props = {
  col: Column;
  related: ColumnListItem[];
  /** 下書きプレビューから呼ばれたとき true(構造化データを出さない) */
  isPreview?: boolean;
};

function RelatedCard({ col }: { col: ColumnListItem }) {
  const href = `/columns/${col.slug || col.id}/`;
  return (
    <Link
      href={href}
      className="rounded border border-gray-200 bg-white p-4 hover:border-brand"
    >
      <div className="mb-1 text-sm font-bold">{col.title}</div>
      {col.summary ? (
        <p className="line-clamp-2 text-xs text-gray-600">{col.summary}</p>
      ) : null}
    </Link>
  );
}

export function ColumnArticle({ col, related, isPreview = false }: Props) {
  const selfPath = `/columns/${col.slug || col.id}/`;

  const breadcrumbs = [
    { name: 'ホーム', href: '/' },
    { name: 'コラム', href: '/columns/' },
    { name: col.title },
  ];

  const isDraft = col.status !== 'published';
  const showJsonLd = !isDraft && !isPreview;
  const showPreviewBanner = isPreview && isDraft;

  return (
    <>
      {showJsonLd ? (
        <>
          <JsonLd
            data={buildArticleJsonLd({
              title: col.title,
              summary: col.summary,
              date: col.date,
              updated_at: col.updated_at,
              slug: col.slug || col.id,
            })}
          />
          <JsonLd
            data={buildBreadcrumbJsonLd(
              breadcrumbs.map((b) => ({
                name: b.name,
                url: b.href || selfPath,
              }))
            )}
          />
        </>
      ) : null}

      <article className="container-narrow py-6 md:py-10">
        <Breadcrumb items={breadcrumbs} />

        {showPreviewBanner ? (
          <div className="mb-6 rounded-lg border-l-4 border-yellow-500 bg-yellow-50 p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📝</span>
              <div>
                <p className="font-bold text-yellow-800">
                  プレビューモード(下書き)
                </p>
                <p className="mt-1 text-sm text-yellow-700">
                  このコラムは下書き状態のため、まだ一般公開されていません。
                </p>
                <p className="mt-1 text-xs text-yellow-600">
                  ステータス: {col.status || 'draft'}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <header className="mb-8">
          {col.tag ? (
            <span className="mb-3 inline-block rounded bg-brand-light px-3 py-1 text-sm text-brand-dark">
              {col.tag}
            </span>
          ) : null}
          <h1 className="mb-3 text-3xl font-bold leading-tight md:text-4xl">
            {col.title}
          </h1>
          {col.summary ? (
            <p className="mb-4 text-lg leading-relaxed text-gray-700">
              {col.summary}
            </p>
          ) : null}
          <div className="flex items-center gap-3 border-t border-b border-gray-200 py-3 text-sm text-gray-500">
            {col.date ? <span>公開: {col.date}</span> : null}
            {col.updated_at && col.updated_at !== col.date ? (
              <span>
                更新: {new Date(col.updated_at).toLocaleDateString('ja-JP')}
              </span>
            ) : null}
          </div>
        </header>

        {col.thumb ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={col.thumb}
            alt={col.title}
            className="mb-8 w-full rounded-lg"
            loading="eager"
          />
        ) : null}

        {col.body ? <ColumnRenderer body={col.body} /> : null}

        {related.length > 0 ? (
          <aside className="mt-16 border-t border-gray-200 pt-8">
            <h2 className="mb-4 text-xl font-bold">関連コラム</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {related.map((c) => (
                <RelatedCard key={c.id} col={c} />
              ))}
            </div>
          </aside>
        ) : null}
      </article>
    </>
  );
}
