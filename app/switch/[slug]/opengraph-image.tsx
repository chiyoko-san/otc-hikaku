import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';
import { getSwitchDrugBySlug, getOtcMatchesForSwitch, getSwitchMonthly } from '@/lib/switch-data';
import { yen } from '@/lib/otc-similar-items';

// 配置先: app/switch/[slug]/opengraph-image.tsx
// 切替ページ30本のOG画像（LINE・Xで共有したときのカード）。/otc-similar/ 配下と同じ lib/og.tsx を使う。
export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: { slug: string } }) {
  const entry = getSwitchDrugBySlug(params.slug);
  if (!entry) return ogImage({ title: '処方薬と同じ成分の市販薬', kicker: '処方薬から探す' });
  const n = getOtcMatchesForSwitch(entry, 9999).length;
  const monthly = getSwitchMonthly(entry);
  const target = entry.otcSimilarNo != null;
  return ogImage({
    tag: target ? '上乗せ対象' : '対象外',
    kicker: target ? '2027年3月から' : '2027年3月の上乗せ料金は',
    title: `${entry.rxName}と同じ成分の市販薬`,
    subtitle: n > 0 ? `市販薬${n}品・${entry.genericName}` : `${entry.genericName}・同じ成分の市販薬はありません`,
    big: monthly ? `+約${yen(monthly.e3.diff)}` : undefined,
    bigLabel: monthly ? `${monthly.qtyLabel.replace(/（.*$/, '')}・3割負担で増える額` : undefined,
  });
}
