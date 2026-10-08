import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getColumnBySlugOrId,
  getAllColumnSlugs,
  getPublishedColumns,
} from '@/lib/supabase/columns';
import { ColumnArticle } from '@/components/column/ColumnArticle';
import { buildMetadata } from '@/lib/seo';

// 配置先: app/columns/[slug]/page.tsx
//
// ISR: 5分ごとに再生成。一覧に無い slug もアクセス時に生成する。
//
// 重要: このページで searchParams / cookies / headers を使ってはいけない。
// 使うと静的生成できないページになり、Supabase停止中にビルドが走った場合に
// 全記事が DYNAMIC_SERVER_USAGE で500になる(2026-10-07の障害)。
// 下書きの確認は /columns/[slug]/preview/ を使う。
export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  try {
    const slugs = await getAllColumnSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch (e) {
    console.error('[generateStaticParams] error:', e);
    return [];
  }
}

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const col = await getColumnBySlugOrId(params.slug);
  if (!col) return { title: 'コラムが見つかりません' };

  return buildMetadata({
    title: col.title,
    description: col.summary || col.title,
    path: `/columns/${col.slug || col.id}/`,
    image: col.thumb || undefined,
    type: 'article',
  });
}

export default async function ColumnDetailPage({ params }: Props) {
  const col = await getColumnBySlugOrId(params.slug);
  if (!col) notFound();

  // 同じタグの記事を関連コラムとして最大4本(本文なしの一覧から選ぶ)
  const related = col.tag
    ? (await getPublishedColumns(100))
        .filter((c) => c.tag === col.tag && c.id !== col.id)
        .slice(0, 4)
    : [];

  return <ColumnArticle col={col} related={related} />;
}
