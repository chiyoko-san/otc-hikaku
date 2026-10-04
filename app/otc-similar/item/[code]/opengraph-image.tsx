import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';
import { getItemByCode, unitLabel, yen } from '@/lib/otc-similar-items';

// 配置先: app/otc-similar/item/[code]/opengraph-image.tsx
export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: { code: string } }) {
  const item = getItemByCode(params.code);
  if (!item) return ogImage({ tag: '上乗せ対象', title: '上乗せ料金はいくら？' });
  const unit = unitLabel(item.spec);
  return ogImage({
    tag: '上乗せ対象',
    title: `${item.name}の上乗せ料金はいくら？`,
    subtitle: `薬価${yen(item.price)}／${unit} → 上乗せ額は薬価の4分の1。処方量別・ジェネリック・同成分の市販薬も`,
    big: `+${yen(item.surcharge)}`,
    bigLabel: `上乗せ額／${unit}`,
  });
}
