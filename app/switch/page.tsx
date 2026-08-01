import Link from 'next/link';
import type { Metadata } from 'next';
import { SWITCH_DRUGS, getOtcMatchesForSwitch } from '@/lib/switch-data';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { JsonLd } from '@/components/layout/JsonLd';
import { buildMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: '処方薬から市販薬を探す|同じ成分の市販薬一覧',
  description:
    'アレグラ・ロキソニン・ガスターなど、病院で処方されていた薬と同じ成分の市販薬(OTC)を探せます。OTC類似薬の保険適用見直しに対応。PMDA公開情報ベースの中立情報。',
  path: '/switch/',
});

export default function SwitchIndexPage() {
  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: 'ホーム', url: '/' },
          { name: '処方薬から探す', url: '/switch/' },
        ])}
      />
      <div className="container-narrow py-6 md:py-10">
        <Breadcrumb
          items={[{ name: 'ホーム', href: '/' }, { name: '処方薬から探す' }]}
        />

        <header className="mb-8">
          <h1 className="mb-3 text-3xl font-bold md:text-4xl">
            処方薬から市販薬を探す
          </h1>
          <p className="leading-relaxed text-gray-700">
            「病院でもらっていた薬、市販でも買えますよ」と言われた方へ。
            処方薬の名前から、同じ有効成分を含む市販薬(OTC医薬品)を探せます。
            2026年度から、市販薬と効能が重なる処方薬(OTC類似薬)の保険適用見直しが段階的に進められており、
            自分で市販薬を選ぶ場面が増えています。
          </p>
        </header>

        <div className="mb-8 grid gap-3 md:grid-cols-2">
          {SWITCH_DRUGS.map((d) => {
            const matchCount = getOtcMatchesForSwitch(d, 9999).length;
            return (
              <Link
                key={d.slug}
                href={`/switch/${d.slug}/`}
                className="block rounded-lg border border-gray-200 bg-white p-4 transition hover:border-brand hover:shadow-md"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h2 className="text-base font-bold text-gray-900">
                    {d.rxName}
                  </h2>
                  <span className="whitespace-nowrap rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                    {d.categoryLabel}
                  </span>
                </div>
                <p className="mb-2 text-xs text-gray-500">{d.genericName}</p>
                <p className="text-sm text-brand">
                  {matchCount > 0
                    ? `同成分の市販薬 ${matchCount}件 →`
                    : '同成分の市販薬なし(詳細を見る) →'}
                </p>
              </Link>
            );
          })}
        </div>

        <aside className="rounded bg-gray-50 p-4 text-xs leading-relaxed text-gray-600">
          <p>
            当ページは処方薬から市販薬への切替を保証・推奨するものではありません。
            処方薬と市販薬は同じ成分でも含有量・剤形・適応が異なる場合があります。
            購入・使用の前に必ず薬剤師または登録販売者に相談し、症状が続く場合は受診してください。
          </p>
        </aside>
      </div>
    </>
  );
}
