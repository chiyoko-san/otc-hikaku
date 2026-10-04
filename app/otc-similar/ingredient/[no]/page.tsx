import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildMetadata, buildBreadcrumbJsonLd, buildFaqJsonLd } from '@/lib/seo';
import { OTC_SIMILAR_77, OTC_SIMILAR_META, getOtcSimilarByNo } from '@/lib/otc-similar-77';
import { getOtcSimilarGroup, getOtcMatchesForNo, OTC_SIMILAR_PATHS } from '@/lib/otc-similar-data';
import { getItemsByNo, getRepresentativeItems, getYakkaDateLabel, unitLabel, yen } from '@/lib/otc-similar-items';
import { getSwitchDrugsByOtcSimilarNo } from '@/lib/switch-data';
import OtcSimilarPriceTable from '@/components/OtcSimilarPriceTable';

// 配置先: app/otc-similar/ingredient/[no]/page.tsx  →  /otc-similar/ingredient/76/ など77ページ
// 成分ごとに1ページ。「ロキソプロフェン 上乗せ料金」「ヘパリン類似物質 対象」を受ける。

type Params = { no: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return OTC_SIMILAR_77.map((i) => ({ no: String(i.no) }));
}

export async function generateMetadata({ params }: { params: Params | Promise<Params> }): Promise<Metadata> {
  const { no } = await params;
  const ing = getOtcSimilarByNo(Number(no));
  if (!ing) return {};
  const rx = ing.rxExamples?.length ? `（${ing.rxExamples.join('・')}）` : '';
  const items = getItemsByNo(ing.no);
  const otc = getOtcMatchesForNo(ing.no, 1);
  return buildMetadata({
    title: `${ing.name}${rx}の上乗せ料金｜対象の処方薬${items.length}品目の薬価と同じ成分の市販薬${otc.count}件`,
    description: `${ing.name}は2027年3月からのOTC類似薬「上乗せ料金」の対象成分（厚労省案 No.${ing.no}・${ing.use}）。該当する処方薬${items.length}品目の薬価と上乗せ額、同じ成分を含む市販薬${otc.count}件、切替時の注意をまとめました。`,
    path: OTC_SIMILAR_PATHS.ingredient(ing.no),
  });
}

export default async function OtcSimilarIngredientPage({ params }: { params: Params | Promise<Params> }) {
  const { no } = await params;
  const ing = getOtcSimilarByNo(Number(no));
  if (!ing) notFound();
  const group = getOtcSimilarGroup(ing.group);
  const items = getItemsByNo(ing.no);
  const rep = getRepresentativeItems(ing.no, 1)[0] ?? null;
  const otc = getOtcMatchesForNo(ing.no, 12);
  const guides = getSwitchDrugsByOtcSimilarNo(ing.no);
  const dateLabel = getYakkaDateLabel();
  const prices = items.map((i) => i.price);
  const minP = prices.length ? Math.min(...prices) : 0;
  const maxP = prices.length ? Math.max(...prices) : 0;
  const title = ing.rxExamples?.length ? `${ing.rxExamples.join('・')}（${ing.name}）` : ing.name;

  const faqs = [
    {
      q: `${ing.name}は上乗せ料金（OTC類似薬の特別料金）の対象ですか？`,
      a: `厚生労働省の案（77成分、No.${ing.no}）に含まれており、2027年3月から処方時に薬剤費の4分の1が上乗せされる見込みです。市販薬として購入する場合は対象外です。最終的な対象は国の告示で確定します。`,
    },
    ...(rep
      ? [{
          q: `${ing.name}の処方薬は、いくら上乗せされますか？`,
          a: `例えば${rep.name}は薬価${yen(rep.price)}／${unitLabel(rep.spec)}なので、上乗せ額は約${yen(rep.surcharge)}／${unitLabel(rep.spec)}です。該当する処方薬${items.length}品目の薬価は${yen(minP)}〜${yen(maxP)}で、薬価が安い薬ほど上乗せも小さくなります。`,
        }]
      : []),
    ...(otc.count > 0
      ? [{
          q: `${ing.name}を含む市販薬はありますか？`,
          a: `当サイトのデータでは${otc.count}件あります（${otc.items.slice(0, 3).map((m) => m.name).join('、')}など）。含有量・剤形・適応が処方薬と異なる場合があるため、購入前に薬剤師・登録販売者に相談してください。`,
        }]
      : []),
  ];

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: '/' },
    { name: 'OTC類似薬の上乗せ料金', url: OTC_SIMILAR_PATHS.hub },
    ...(group ? [{ name: group.label, url: OTC_SIMILAR_PATHS.group(group.key) }] : []),
    { name: ing.name, url: OTC_SIMILAR_PATHS.ingredient(ing.no) },
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-lg leading-relaxed text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqJsonLd(faqs)) }} />

      <nav className="text-base text-gray-700" aria-label="パンくず">
        <Link href="/" className="underline">ホーム</Link>
        <span className="mx-1">/</span>
        <Link href={OTC_SIMILAR_PATHS.hub} className="underline">上乗せ料金</Link>
        {group && (
          <>
            <span className="mx-1">/</span>
            <Link href={OTC_SIMILAR_PATHS.group(group.key)} className="underline">{group.label}</Link>
          </>
        )}
      </nav>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-block rounded-md bg-[#b42318] px-2.5 py-1 text-base font-bold text-white">上乗せ対象（案）</span>
        <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-base text-gray-700">No.{ing.no}・{ing.use}</span>
      </div>
      <h1 className="mt-2 text-3xl font-bold leading-snug md:text-4xl">
        {title}
        <span className="mt-1 block text-xl font-normal text-gray-700">上乗せ料金の対象となる処方薬と、同じ成分の市販薬</span>
      </h1>

      <p className="mt-4">
        {ing.name}は、2027年3月から始まる「上乗せ料金」の対象成分です（厚生労働省案）。
        病院で処方薬として受け取ると、いつもの負担に加えて薬代の4分の1を追加で支払う見込みです。
        該当する処方薬は{items.length}品目（薬価{yen(minP)}〜{yen(maxP)}）、同じ成分の市販薬は{otc.count}件あります。
      </p>

      {rep && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border-2 border-gray-300 bg-white p-5">
            <div className="text-base text-gray-700">例：{rep.name}の薬価（{unitLabel(rep.spec)}あたり）</div>
            <div className="text-3xl font-bold">{yen(rep.price)}</div>
          </div>
          <div className="rounded-xl border-2 border-[#b42318] bg-[#fff5f4] p-5">
            <div className="text-base text-gray-700">上乗せ額（{unitLabel(rep.spec)}あたり）</div>
            <div className="text-3xl font-bold text-[#b42318]">+{yen(rep.surcharge)}</div>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={OTC_SIMILAR_PATHS.simulator} className="inline-block min-h-[52px] rounded-xl bg-[#b42318] px-5 py-3 text-xl font-bold text-white">
          自分の薬と量で計算する
        </Link>
        <Link href={OTC_SIMILAR_PATHS.photo} className="inline-block min-h-[52px] rounded-xl border-2 border-[#b42318] bg-white px-5 py-3 text-xl font-bold text-[#b42318]">
          お薬手帳を撮るだけ
        </Link>
      </div>

      {/* 全品目 */}
      <section className="mt-10">
        <h2 className="text-2xl font-bold leading-snug">対象の処方薬（{items.length}品目）</h2>
        <p className="mt-1 text-base text-gray-700">薬の名前を押すと、その薬の処方量ごとの金額が見られます。薬価は{dateLabel}時点。</p>
        <OtcSimilarPriceTable no={ing.no} compact />
      </section>

      {/* 市販薬 */}
      <section className="mt-10">
        <h2 className="text-2xl font-bold leading-snug">同じ成分の市販薬（{otc.count}件）</h2>
        {otc.count === 0 ? (
          <p className="mt-2">当サイトのデータでは見つかりませんでした。薬局で薬剤師に相談してください。</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {otc.items.map((m) => (
              <li key={m.slug}>
                <Link href={`/medicines/${m.slug}/`} className="inline-block min-h-[48px] rounded-lg border-2 border-[#1f4d3a] bg-[#e8f3ec] px-4 py-2.5 text-lg font-bold text-[#1f4d3a]">
                  {m.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {guides.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {guides.map((g) => (
              <Link key={g.slug} href={`/switch/${g.slug}/`} className="inline-block min-h-[48px] rounded-lg bg-[#1f4d3a] px-4 py-2.5 text-lg font-bold text-white">
                {g.rxName}を市販薬に替えるときの注意
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* FAQ */}
      <section className="mt-10">
        <h2 className="text-2xl font-bold leading-snug">よくある質問</h2>
        <dl className="mt-3 divide-y-2 divide-gray-200">
          {faqs.map((f) => (
            <div key={f.q} className="py-4">
              <dt className="text-xl font-bold">Q. {f.q}</dt>
              <dd className="mt-2">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-10 rounded-xl bg-[#fff4d6] p-5 text-base">
        <p className="font-bold">ご注意</p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>対象かどうかは{OTC_SIMILAR_META.listStatus}に基づく当サイトの推計で、最終的には国の告示で確定します。</li>
          <li>こども、がん・難病の方、収入の少ない方、入院中の方、医師が長期使用を必要と判断した方などは上乗せ料金がかからない方向で検討されています。</li>
          <li>当サイトは市販薬への切替をすすめるものではありません。薬の変更は医師・薬剤師に相談してください。</li>
        </ul>
      </section>

      {group && (
        <p className="mt-6">
          <Link href={OTC_SIMILAR_PATHS.group(group.key)} className="font-bold text-[#1f4d3a] underline">
            {group.label}のほかの対象成分を見る →
          </Link>
        </p>
      )}
    </div>
  );
}
