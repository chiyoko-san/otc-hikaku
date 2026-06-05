import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getColumnBySlugOrId,
  getAllColumnSlugs,
  getPublishedColumns,
} from '@/lib/supabase/columns';
import { ColumnRenderer } from '@/components/column/ColumnRenderer';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { JsonLd } from '@/components/layout/JsonLd';
import {
  buildMetadata,
  buildArticleJsonLd,
  buildBreadcrumbJsonLd,
} from '@/lib/seo';

export const revalidate = 300;

type ColumnData = {
  id: string;
  title: string;
  date?: string | null;
  tag?: string | null;
  summary?: string | null;
  body?: string | null;
  thumb?: string | null;
  status?: string | null;
  slug?: string | null;
  updated_at?: string | null;
};

export async function generateStaticParams() {
  try {
    const slugs = await getAllColumnSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch (e) {
    console.error('[generateStaticParams] error:', e);
    return [];
  }
}

type Props = {
  params: { slug: string };
  searchParams: { preview?: string };
};

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const isPreview = searchParams?.preview === 'true';
  const col = await getColumnBySlugOrId(params.slug, isPreview);
  if (!col) return { title: 'コラムが見つかりません' };

  const baseMeta = buildMetadata({
    title: col.title,
    description: col.summary || col.title,
    path: `/columns/${col.slug || col.id}/`,
    image: col.thumb || undefined,
    type: 'article',
  });

  if (isPreview) {
    return {
      ...baseMeta,
      robots: { index: false, follow: false },
    };
  }

  return baseMeta;
}

type RelatedCardProps = { col: ColumnData };

function RelatedCard(props: RelatedCardProps) {
  const col = props.col;
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

export default async function ColumnDetailPage({
  params,
  searchParams,
}: Props) {
  const isPreview = searchParams?.preview === 'true';
  const col = await getColumnBySlugOrId(params.slug, isPreview);
  if (!col) notFound();

  const related = col.tag
    ? (await getPublishedColumns(100))
        .filter((c) => c.tag === col.tag && c.id !== col.id)
        .slice(0, 4)
    : [];

  const breadcrumbs = [
    { name: 'ホーム', href: '/' },
    { name: 'コラム', href: '/columns/' },
    { name: col.title },
  ];

  const isDraft = col.status !== 'published';
  const showJsonLd = !isDraft;
  const showPreviewBanner = isPreview && isDraft;

  return (
    <>
      {showJsonLd ? (
        <>
          <JsonLd
            data={buildArticleJsonLd({
              ...col,
              slug: col.slug || col.id,
            } as any)}
          />
          <JsonLd
            data={buildBreadcrumbJsonLd(
              breadcrumbs.map((b) => ({
                name: b.name,
                url: b.href || `/columns/${col.slug || col.id}/`,
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
