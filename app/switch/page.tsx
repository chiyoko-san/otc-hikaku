import Link from 'next/link';
import type { Metadata } from 'next';
import { SWITCH_DRUGS, getOtcMatchesForSwitch } from '@/lib/switch-data';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { JsonLd } from '@/components/layout/JsonLd';
import OtcSimilarBanner from '@/components/OtcSimilarBanner';
import { buildMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: '処方薬から市販薬を探す|同じ成分の市販薬一覧',
  description:
    'アレグラ・ロキソニン・ヒルドイドなど、病院で処方されていた薬と同じ成分の市販薬(OTC)を探せます。2027年3月からのOTC類似薬「上乗せ料金」の対象・対象外も表示。PMDA公開情報ベースの中立情報。',
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

        <header className="mb-4">
          <h1 className="mb-3 text-3xl font-bold md:text-4xl">
            処方薬から市販薬を探す
          </h1>
          <p className="text-lg leading-relaxed text-gray-700">
            「病院でもらっていた薬、市販でも買えますよ」と言われた方へ。
            処方薬の名前から、同じ有効成分を含む市販薬(OTC医薬品)を探せます。
            2027年3月からは、市販薬と同じ成分の処方薬(OTC類似薬)に薬代の4分の1の「上乗せ料金」がかかる予定で、
            自分で市販薬を選ぶ場面が増えます。
          </p>
        </header>

        {/* 上乗せ料金ページへの動線 */}
        <OtcSimilarBanner />

        <div className="mb-8 grid gap-3 md:grid-cols-2">
          {SWITCH_DRUGS.map((d) => {
            const matchCount = getOtcMatchesForSwitch(d, 9999).length;
            const isTarget = d.otcSimilarNo != null;
            return (
              <Link
                key={d.slug}
                href={`/switch/${d.slug}/`}
                className="block rounded-lg border-2 border-gray-200 bg-white p-4 transition hover:border-brand hover:shadow-md"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h2 className="text-lg font-bold text-gray-900">
                    {d.rxName}
                  </h2>
                  <span className="whitespace-nowrap rounded bg-gray-100 px-2 py-0.5 text-sm text-gray-700">
                    {d.categoryLabel}
                  </span>
                </div>
                <p className="mb-2 text-sm text-gray-600">{d.genericName}</p>
                <div className="mb-2">
                  {isTarget ? (
                    <span className="inline-block rounded-md bg-[#b42318] px-2 py-0.5 text-sm font-bold text-white">
                      上乗せ対象
                    </span>
                  ) : (
                    <span className="inline-block rounded-md border-2 border-gray-500 bg-white px-2 py-0.5 text-sm font-bold text-gray-800">
                      対象外
                    </span>
                  )}
                </div>
                <p className="text-base text-brand">
                  {matchCount > 0
                    ? `同成分の市販薬 ${matchCount}件 →`
                    : '同成分の市販薬なし(詳細を見る) →'}
                </p>
              </Link>
            );
          })}
        </div>

        <aside className="rounded bg-gray-50 p-4 text-sm leading-relaxed text-gray-600">
          <p>
            当ページは処方薬から市販薬への切替を保証・推奨するものではありません。
            処方薬と市販薬は同じ成分でも含有量・剤形・適応が異なる場合があります。
            購入・使用の前に必ず薬剤師または登録販売者に相談し、症状が続く場合は受診してください。
            「上乗せ対象／対象外」は厚生労働省の案(2025年12月25日提示)に基づく表示で、最終的な対象は国の告示で決まります。
          </p>
        </aside>
      </div>
    </>
  );
}
