import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';
import { OTC_SIMILAR_GROUPS } from '@/lib/otc-similar-77';
import { getOtcSimilarRows, OTC_SIMILAR_PATHS } from '@/lib/otc-similar-data';

// 配置先: app/otc-similar/use/page.tsx  →  /otc-similar/use/

export const metadata: Metadata = buildMetadata({
  title: '用途で探す｜上乗せ料金（OTC類似薬）の対象77成分',
  description:
    '花粉症、湿布、保湿剤など12の用途から、2027年3月からの上乗せ料金（OTC類似薬の特別料金）の対象成分と、同じ成分の市販薬を探せます。',
  path: OTC_SIMILAR_PATHS.use,
});

export default function OtcSimilarUseIndexPage() {
  const rows = getOtcSimilarRows();
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: '/' },
    { name: '処方薬から探す', url: '/switch/' },
    { name: 'OTC類似薬の上乗せ料金', url: OTC_SIMILAR_PATHS.hub },
    { name: '用途で探す', url: OTC_SIMILAR_PATHS.use },
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-lg leading-relaxed text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <nav className="text-base text-gray-700" aria-label="パンくず">
        <Link href="/" className="underline">ホーム</Link>
        <span className="mx-1">/</span>
        <Link href={OTC_SIMILAR_PATHS.hub} className="underline">上乗せ料金</Link>
        <span className="mx-1">/</span>
        <span>用途で探す</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold leading-snug md:text-4xl">用途で探す</h1>
      <p className="mt-3 text-xl leading-relaxed">
        薬の使いみちから、上乗せ料金の対象となる成分と、同じ成分の市販薬を探せます。
      </p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {OTC_SIMILAR_GROUPS.map((g) => {
          const count = rows.filter((r) => r.group === g.key).length;
          return (
            <li key={g.key}>
              <Link
                href={OTC_SIMILAR_PATHS.group(g.key)}
                className="block rounded-xl border-2 border-[#1f4d3a] bg-white px-5 py-4 hover:bg-[#e8f3ec]"
              >
                <span className="block text-2xl font-bold text-[#1f4d3a]">{g.label}</span>
                <span className="mt-1 block text-base text-gray-800">{g.lead}</span>
                <span className="mt-1 block text-base text-gray-600">対象 {count}成分</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-8">
        薬の名前がわかる場合は、
        <Link href={OTC_SIMILAR_PATHS.name} className="font-bold text-[#1f4d3a] underline">薬の名前で探す</Link>
        のほうが早く見つかります。
      </p>
    </div>
  );
}
