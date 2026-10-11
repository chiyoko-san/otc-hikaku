import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
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

  const crumbs = [
    { name: 'ホーム', href: '/' },
    { name: '上乗せ料金', href: OTC_SIMILAR_PATHS.hub },
    { name: '用途で探す' },
  ];

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 text-lg leading-relaxed text-brand-ink md:px-6 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <Breadcrumb items={crumbs} />

      <h1 className="mt-2 text-2xl font-bold leading-snug md:text-4xl">用途で探す</h1>
      <p className="mt-4 md:text-xl">
        薬の使いみちから、上乗せ料金の対象となる成分と、同じ成分の市販薬を探せます。
      </p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {OTC_SIMILAR_GROUPS.map((g) => {
          const count = rows.filter((r) => r.group === g.key).length;
          return (
            <li key={g.key}>
              <Link
                href={OTC_SIMILAR_PATHS.group(g.key)}
                className="flex min-h-[80px] items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 hover:border-brand"
              >
                <span className="block">
                  <span className="block text-lg font-bold text-brand md:text-xl">{g.label}</span>
                  <span className="mt-1 block text-sm text-gray-600 md:text-base">{g.lead}・対象{count}成分</span>
                </span>
                <span className="shrink-0 text-2xl text-brand" aria-hidden="true">›</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-10 text-base md:text-lg">
        薬の名前がわかる場合は、
        <Link href={OTC_SIMILAR_PATHS.name} className="font-bold text-brand underline underline-offset-4">薬の名前で探す</Link>
        のほうが早く見つかります。
      </p>
    </div>
  );
}
