import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

// 配置先: app/otc-similar/name/opengraph-image.tsx
export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return ogImage({
    tag: '名前で探す',
    title: '自分の薬は上乗せ料金の対象？',
    subtitle: 'お薬手帳の名前から、頭文字を押すだけで探せます',
  });
}
