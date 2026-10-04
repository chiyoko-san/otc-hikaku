import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';
import { getOtcSimilarGroup, getOtcSimilarRowsByGroup } from '@/lib/otc-similar-data';

// 配置先: app/otc-similar/use/[group]/opengraph-image.tsx
export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: { group: string } }) {
  const g = getOtcSimilarGroup(params.group);
  const rows = g ? getOtcSimilarRowsByGroup(g.key) : [];
  return ogImage({
    tag: '上乗せ対象',
    title: `${g?.label ?? '用途別'}の処方薬に上乗せ料金`,
    subtitle: g ? `対象${rows.length}成分と、同じ成分の市販薬。${g.lead}` : undefined,
  });
}
