import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

// 配置先: app/otc-similar/simulator/opengraph-image.tsx
export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return ogImage({
    tag: 'シミュレーター',
    title: '上乗せ料金はいくら増える？',
    subtitle: '薬の名前と量、負担割合を選ぶだけ。何種類でも合計OK',
  });
}
