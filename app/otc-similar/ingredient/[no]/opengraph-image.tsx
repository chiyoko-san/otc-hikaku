import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';
import { getOtcSimilarByNo } from '@/lib/otc-similar-77';
import { getItemsByNo, getRepresentativeItems, unitLabel, yen } from '@/lib/otc-similar-items';

// 配置先: app/otc-similar/ingredient/[no]/opengraph-image.tsx
export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: { no: string } }) {
  const ing = getOtcSimilarByNo(Number(params.no));
  if (!ing) return ogImage({ tag: '上乗せ対象', title: '上乗せ料金の対象成分' });
  const rep = getRepresentativeItems(ing.no, 1)[0];
  const n = getItemsByNo(ing.no).length;
  const name = ing.rxExamples?.length ? `${ing.rxExamples[0]}（${ing.name}）` : ing.name;
  return ogImage({
    tag: '上乗せ対象',
    title: `${name}の上乗せ料金`,
    subtitle: `対象の処方薬${n}品目の薬価と、同じ成分の市販薬`,
    big: rep ? `+${yen(rep.surcharge)}` : undefined,
    bigLabel: rep ? `${rep.name}／${unitLabel(rep.spec)}` : undefined,
  });
}
