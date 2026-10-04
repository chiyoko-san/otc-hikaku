import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';

// 配置先: app/otc-similar/photo/opengraph-image.tsx
export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return ogImage({
    tag: '撮るだけ',
    title: 'お薬手帳を撮るだけ',
    subtitle: '対象の薬と、いくら増えるかが全部わかる。名前を打つ必要なし',
  });
}
