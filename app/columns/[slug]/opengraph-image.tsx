import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';
import { getPublishedColumns } from '@/lib/supabase/columns';

// 配置先: app/columns/[slug]/opengraph-image.tsx
// コラムのタイトルを画像にする。X・LINEで共有されたときのクリック率と、Google Discover対策。
export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type ColumnLite = { id: string; slug?: string | null; title?: string | null; tag?: string | null; summary?: string | null };

export default async function Image({ params }: { params: { slug: string } }) {
  let col: ColumnLite | undefined;
  try {
    const cols = ((await getPublishedColumns(500)) as unknown as ColumnLite[]) || [];
    col = cols.find((c) => c.slug === params.slug || c.id === params.slug);
  } catch {
    col = undefined;
  }
  const title = col?.title || 'クスリノコンパス コラム';
  const tag = col?.tag || 'コラム';
  const policy = tag === '上乗せ料金' || tag === '制度解説';
  return ogImage({
    tag,
    kicker: policy ? '2027年3月から・OTC類似薬の上乗せ料金' : '市販薬の選び方・安全な使い方',
    title,
    subtitle: col?.summary ? (col.summary.length > 60 ? `${col.summary.slice(0, 60)}…` : col.summary) : undefined,
  });
}
