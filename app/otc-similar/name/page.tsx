import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { buildMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';
import { getOtcSimilarNames, OTC_SIMILAR_PATHS } from '@/lib/otc-similar-data';
import NameFinder from './NameFinder';

// 配置先: app/otc-similar/name/page.tsx  →  /otc-similar/name/

export const metadata: Metadata = buildMetadata({
  title: '薬の名前で探す｜上乗せ料金（OTC類似薬）の対象かどうか',
  description:
    'お薬手帳や薬袋の名前から、2027年3月からの上乗せ料金（OTC類似薬の特別料金）の対象かどうかを調べられます。頭文字を押すか、名前を入力してください。',
  path: OTC_SIMILAR_PATHS.name,
});

export default function OtcSimilarNamePage() {
  const names = getOtcSimilarNames();
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: '/' },
    { name: '処方薬から探す', url: '/switch/' },
    { name: 'OTC類似薬の上乗せ料金', url: OTC_SIMILAR_PATHS.hub },
    { name: '薬の名前で探す', url: OTC_SIMILAR_PATHS.name },
  ]);

  const crumbs = [
    { name: 'ホーム', href: '/' },
    { name: '上乗せ料金', href: OTC_SIMILAR_PATHS.hub },
    { name: '薬の名前で探す' },
  ];

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 text-lg leading-relaxed text-brand-ink md:px-6 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <Breadcrumb items={crumbs} />

      <h1 className="mt-2 text-2xl font-bold leading-snug md:text-4xl">薬の名前で探す</h1>
      <p className="mt-4 md:text-xl">
        お薬手帳や薬袋に書いてある薬の名前で、2027年3月からの「上乗せ料金」の対象かどうかを調べられます。
      </p>

      <NameFinder names={names} />

      <p className="mt-10 text-base text-gray-600">
        対象の一覧は厚生労働省の案（2025年12月25日提示）です。最終的な対象は国の告示で決まります。
        制度の説明は<Link href={OTC_SIMILAR_PATHS.hub} className="font-bold text-brand underline underline-offset-4">こちら</Link>。
      </p>
    </div>
  );
}
