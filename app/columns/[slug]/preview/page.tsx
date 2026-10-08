import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getColumnBySlugOrId } from '@/lib/supabase/columns';
import { ColumnArticle } from '@/components/column/ColumnArticle';

// 配置先: app/columns/[slug]/preview/page.tsx
//
// 下書きプレビュー専用: /columns/<slug または id>/preview/
// 旧 /columns/<slug>/?preview=true の置き換え。
// 常にその場で描画し(キャッシュしない)、検索エンジンには出さない。
export const dynamic = 'force-dynamic';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const col = await getColumnBySlugOrId(params.slug, true);
  return {
    title: col ? `[プレビュー] ${col.title}` : 'コラムが見つかりません',
    robots: { index: false, follow: false },
  };
}

export default async function ColumnPreviewPage({ params }: Props) {
  const col = await getColumnBySlugOrId(params.slug, true);
  if (!col) notFound();

  return <ColumnArticle col={col} related={[]} isPreview />;
}
