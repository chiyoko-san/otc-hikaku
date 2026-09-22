import type { Metadata } from 'next';
import Link from 'next/link';
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-lg leading-relaxed text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <nav className="text-base text-gray-700" aria-label="パンくず">
        <Link href="/" className="underline">ホーム</Link>
        <span className="mx-1">/</span>
        <Link href={OTC_SIMILAR_PATHS.hub} className="underline">上乗せ料金</Link>
        <span className="mx-1">/</span>
        <span>薬の名前で探す</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold leading-snug md:text-4xl">薬の名前で探す</h1>
      <p className="mt-3 text-xl leading-relaxed">
        お薬手帳や薬袋に書いてある薬の名前で、2027年3月からの「上乗せ料金」の対象かどうかを調べられます。
      </p>

      <NameFinder names={names} />

      <p className="mt-10 text-base text-gray-700">
        対象の一覧は厚生労働省の案（2025年12月25日提示）です。最終的な対象は国の告示で決まります。
        制度の説明は<Link href={OTC_SIMILAR_PATHS.hub} className="underline">こちら</Link>。
      </p>
    </div>
  );
}
