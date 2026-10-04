import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

// 配置先: app/otc-similar/pharmacy/opengraph-image.tsx
export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return ogImage({
    tag: '薬局・医療機関向け',
    title: '上乗せ料金の患者説明キット（無料）',
    subtitle: '薬局名入りA4 POP（QR付き）と対象77成分早見表を印刷',
  });
}
