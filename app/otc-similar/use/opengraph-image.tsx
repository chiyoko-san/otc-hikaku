import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

// 配置先: app/otc-similar/use/opengraph-image.tsx
export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return ogImage({
    tag: '用途で探す',
    title: '上乗せ料金の対象77成分',
    subtitle: '花粉症・湿布・保湿剤など12の用途から',
  });
}
