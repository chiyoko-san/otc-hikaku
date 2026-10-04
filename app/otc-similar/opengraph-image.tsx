import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

// 配置先: app/otc-similar/opengraph-image.tsx
export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return ogImage({
    tag: '上乗せ料金',
    title: '病院でもらう薬の一部に、「上乗せ料金」が始まります',
    subtitle: 'なぜ？いくら増える？かからない人は？ 対象77成分・薬代の4分の1',
  });
}
