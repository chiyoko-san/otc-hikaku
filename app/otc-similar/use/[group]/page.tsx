import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { notFound } from 'next/navigation';
import { buildMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';
import { OTC_SIMILAR_GROUPS, OTC_SIMILAR_META } from '@/lib/otc-similar-77';
import {
  getOtcSimilarGroup,
  getOtcSimilarRowsByGroup,
  OTC_SIMILAR_PATHS,
  type OtcSimilarRow,
} from '@/lib/otc-similar-data';
import OtcSimilarPriceTable from '@/components/OtcSimilarPriceTable';
import { getYakkaDateLabel } from '@/lib/otc-similar-items';

// 配置先: app/otc-similar/use/[group]/page.tsx  →  /otc-similar/use/allergy/ など12ページ
// 用途ごとに1ページ。ここに出るのはその用途の成分だけなので、スクロールは短い。

type Params = { group: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return OTC_SIMILAR_GROUPS.map((g) => ({ group: g.key }));
}

export async function generateMetadata({
  params,
}: {
  params: Params | Promise<Params>;
}): Promise<Metadata> {
  const { group } = await params;
  const g = getOtcSimilarGroup(group);
  if (!g) return {};
  return buildMetadata({
    title: `${g.label}の処方薬に上乗せ料金｜対象成分と同じ成分の市販薬`,
    description: `${g.lead} 2027年3月からの上乗せ料金（OTC類似薬の特別料金）の対象となる${g.label}の成分と、同じ成分を含む市販薬の一覧です。`,
    path: OTC_SIMILAR_PATHS.group(g.key),
  });
}

export default async function OtcSimilarGroupPage({
  params,
}: {
  params: Params | Promise<Params>;
}) {
  const { group } = await params;
  const g = getOtcSimilarGroup(group);
  if (!g) notFound();
  const rows = getOtcSimilarRowsByGroup(g.key);

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: '/' },
    { name: '処方薬から探す', url: '/switch/' },
    { name: 'OTC類似薬の上乗せ料金', url: OTC_SIMILAR_PATHS.hub },
    { name: '用途で探す', url: OTC_SIMILAR_PATHS.use },
    { name: g.label, url: OTC_SIMILAR_PATHS.group(g.key) },
  ]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 text-lg leading-relaxed text-brand-ink md:px-6 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <Breadcrumb
        items={[
          { name: 'ホーム', href: '/' },
          { name: '上乗せ料金', href: OTC_SIMILAR_PATHS.hub },
          { name: '用途で探す', href: OTC_SIMILAR_PATHS.use },
          { name: g.label },
        ]}
      />

      <h1 className="mt-2 text-2xl font-bold leading-snug md:text-4xl">
        {g.label}の薬
        <span className="mt-2 block text-base font-normal text-gray-600 md:text-xl">上乗せ料金の対象成分（{rows.length}成分）と、同じ成分の市販薬</span>
      </h1>
      <p className="mt-4 md:text-xl">{g.lead}</p>

      <ul className="mt-8 space-y-4">
        {rows.map((r) => (
          <IngredientCard key={r.no} row={r} />
        ))}
      </ul>

      <section className="mt-12 rounded-2xl border-l-4 border-amber-400 bg-amber-50 p-5">
        <p className="font-bold">ご注意</p>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-base">
          <li>一覧は{OTC_SIMILAR_META.listStatus}です。最終的な対象は国の告示で決まります。</li>
          <li>上乗せ額は薬価（厚生労働省 {getYakkaDateLabel()}時点）の4分の1として当サイトが計算したものです。実際の負担は上乗せ額＋残りの薬代×負担割合で、診察料・調剤料は別です。</li>
          <li>市販薬への切替をすすめるものではありません。続けて使っている薬は医師・薬剤師に相談してください。</li>
        </ul>
      </section>

      <section className="mt-12">
        <p className="text-xl font-bold">ほかの用途を見る</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {OTC_SIMILAR_GROUPS.filter((x) => x.key !== g.key).map((x) => (
            <li key={x.key}>
              <Link
                href={OTC_SIMILAR_PATHS.group(x.key)}
                className="inline-flex min-h-[44px] items-center rounded-full border border-gray-300 bg-white px-4 py-2 text-base text-brand-ink hover:border-brand hover:text-brand"
              >
                {x.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6">
          薬の名前がわかる場合は
          <Link href={OTC_SIMILAR_PATHS.name} className="font-bold text-brand underline underline-offset-4">薬の名前で探す</Link>
          が早いです。制度の説明は
          <Link href={OTC_SIMILAR_PATHS.hub} className="font-bold text-brand underline underline-offset-4">こちら</Link>。
        </p>
      </section>
    </div>
  );
}

function IngredientCard({ row: r }: { row: OtcSimilarRow }) {
  return (
    <li id={`ing-${r.no}`} className="panel scroll-mt-24">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-block rounded-md bg-alert px-2.5 py-1 text-sm font-bold text-white">上乗せ対象</span>
        <span className="text-xl font-bold leading-snug md:text-2xl">
          {r.rxExamples.length > 0 ? r.rxExamples.join('・') : r.name}
        </span>
      </div>
      <p className="mt-2 text-lg text-gray-800">
        成分：{r.name}
        <span className="text-gray-600">（{r.use}）</span>
      </p>

      <div className="mt-4">
        <p className="text-lg font-bold">処方薬の薬価と上乗せ額（代表例）</p>
        <OtcSimilarPriceTable no={r.no} limit={3} compact />
      </div>

      <div className="mt-4">
        <p className="text-lg font-bold">
          同じ成分の市販薬
          {r.otcCount > 0 && <span className="ml-2 font-normal text-gray-700">{r.otcCount}件</span>}
        </p>
        {r.otcCount === 0 ? (
          <p className="mt-1 text-lg text-gray-700">
            当サイトのデータでは、同じ成分の市販薬が見つかりませんでした。薬局で薬剤師に相談してください。
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {r.otcTop.map((m) => (
              <li key={m.slug}>
                <Link
                  href={`/medicines/${m.slug}/`}
                  className="inline-flex min-h-[44px] items-center rounded-full border border-brand bg-brand-light px-4 py-2 text-base font-bold text-brand"
                >
                  {m.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4">
        <Link href={OTC_SIMILAR_PATHS.ingredient(r.no)} className="text-base font-bold text-brand underline underline-offset-4 md:text-lg">
          この成分のすべての処方薬（薬価）と市販薬を見る →
        </Link>
      </p>

      {r.guides.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {r.guides.map((gd) => (
            <Link
              key={gd.slug}
              href={`/switch/${gd.slug}/`}
              className="inline-flex min-h-[48px] items-center rounded-xl bg-brand px-4 py-2.5 text-base font-bold text-white"
            >
              {gd.rxName}を市販薬に替えるときの注意
            </Link>
          ))}
        </div>
      )}
    </li>
  );
}
