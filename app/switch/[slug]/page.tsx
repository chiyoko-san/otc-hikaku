import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  SWITCH_DRUGS,
  getSwitchDrugBySlug,
  getOtcMatchesForSwitch,
} from '@/lib/switch-data';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { MedicineCard } from '@/components/medicine/MedicineCard';
import { JsonLd } from '@/components/layout/JsonLd';
import OtcSimilarBanner from '@/components/OtcSimilarBanner';
import OtcSimilarPriceTable from '@/components/OtcSimilarPriceTable';
import {
  buildMetadata,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
} from '@/lib/seo';

// ISR: 1日に1回再生成
export const revalidate = 86400;

export async function generateStaticParams() {
  return SWITCH_DRUGS.map((d) => ({ slug: d.slug }));
}

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entry = getSwitchDrugBySlug(params.slug);
  if (!entry) return { title: 'ページが見つかりません' };

  const matches = getOtcMatchesForSwitch(entry, 9999);
  const feeNote =
    entry.otcSimilarNo != null
      ? `${entry.rxName}は2027年3月からの上乗せ料金(OTC類似薬の特別料金)の対象(厚労省案)。`
      : `${entry.rxName}は2027年3月からの上乗せ料金(OTC類似薬の特別料金)の対象外(厚労省案)。`;
  const desc =
    matches.length > 0
      ? `${feeNote}${entry.rxName}(${entry.genericName})と同じ成分を含む市販薬${matches.length}件の一覧と、処方薬との用量・剤形の違い、購入時の注意点を解説。PMDA公開情報ベース。`
      : `${feeNote}${entry.rxName}(${entry.genericName})の市販薬での代替可否と、購入前に知っておくべき注意点を解説。PMDA公開情報ベース。`;

  return buildMetadata({
    title: `${entry.rxName}と同じ成分の市販薬はある?|上乗せ料金の対象と処方薬との違い`,
    description: desc,
    path: `/switch/${entry.slug}/`,
    type: 'article',
  });
}

export default function SwitchDetailPage({ params }: Props) {
  const entry = getSwitchDrugBySlug(params.slug);
  if (!entry) notFound();

  const allMatches = getOtcMatchesForSwitch(entry, 9999);
  const matches = allMatches.slice(0, 12);
  const hasOtc = allMatches.length > 0;
  const isFeeTarget = entry.otcSimilarNo != null;

  const breadcrumbs = [
    { name: 'ホーム', href: '/' },
    { name: '処方薬から探す', href: '/switch/' },
    { name: entry.rxName },
  ];

  const faqs = [
    {
      q: `${entry.rxName}は上乗せ料金(OTC類似薬の特別料金)の対象ですか?`,
      a: isFeeTarget
        ? `厚生労働省の案では対象です。2027年3月から、通常の1〜3割負担に加えて薬代の4分の1を上乗せで負担する見込みです。お子さん、がん・難病など配慮が必要な方、低所得の方、入院中の方、医師が長期使用を必要と判断した方などは対象外の方向で検討されています。最終的な対象は国の告示で決まります。`
        : `厚生労働省の案(77成分)には含まれていないため、現時点では対象外です。ただし令和9年度以降に対象範囲の拡大が検討されており、今後変わる可能性があります。`,
    },
    {
      q: `${entry.rxName}と同じ成分の市販薬はありますか?`,
      a: hasOtc
        ? `${entry.rxName}の有効成分(${entry.genericName})を含む市販薬が販売されています。ただし含有量・剤形・適応が処方薬と異なる場合があるため、購入前に薬剤師または登録販売者に相談してください。`
        : entry.altNote ||
          `${entry.genericName}を含む市販薬は現在確認できません。`,
    },
    {
      q: '処方薬と市販薬で何が違いますか?',
      a:
        entry.doseNote ||
        '同じ成分でも、含有量・剤形・適応範囲が異なる場合があります。パッケージの用法用量を必ず確認してください。',
    },
    {
      q: '購入時に気をつけることはありますか?',
      a: `${entry.caution} 症状が続く場合や判断に迷う場合は、自己判断せず医師・薬剤師に相談してください。`,
    },
  ];

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd(
          breadcrumbs.map((b) => ({
            name: b.name,
            url: b.href || `/switch/${entry.slug}/`,
          }))
        )}
      />
      <JsonLd data={buildFaqJsonLd(faqs)} />

      <article className="container-narrow py-6 md:py-10">
        <Breadcrumb items={breadcrumbs} />

        <header className="mb-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="pill-brand">
              処方薬からの切替
            </span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-sm text-gray-700">
              {entry.categoryLabel}
            </span>
          </div>
          <h1 className="mb-2 text-3xl font-bold leading-tight md:text-4xl">
            {entry.rxName}と同じ成分の市販薬
          </h1>
          <p className="text-lg text-gray-600">有効成分: {entry.genericName}</p>
        </header>

        {/* 上乗せ料金: 対象/対象外 */}
        <OtcSimilarBanner otcSimilarNo={entry.otcSimilarNo} />

        {/* 対象なら: 薬価と上乗せ額 */}
        {isFeeTarget && entry.otcSimilarNo != null && (
          <section className="mb-8">
            <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
              いくら上乗せされる？（薬価から計算）
            </h2>
            <OtcSimilarPriceTable no={entry.otcSimilarNo} />
          </section>
        )}

        {/* 結論 */}
        <section className="mb-8">
          <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
            結論
          </h2>
          {hasOtc ? (
            <p className="text-lg leading-relaxed text-gray-800">
              {entry.rxName}の有効成分({entry.genericName}
            )を含む市販薬は<strong>{allMatches.length}件</strong>
              確認できます。ただし、処方薬と市販薬は含有量・剤形・適応が異なる場合があります。以下の違いを確認のうえ、購入時は薬剤師・登録販売者に相談してください。
            </p>
          ) : (
            <div className="callout-warn">
              <div className="callout-title">同じ成分の市販薬は確認できません</div>
              <p className="text-base">{entry.altNote}</p>
            </div>
          )}
        </section>

        {/* 処方薬との違い */}
        {entry.doseNote && (
          <section className="mb-8">
            <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
              処方薬との違い(用量・剤形)
            </h2>
            <p className="text-lg leading-relaxed text-gray-800">{entry.doseNote}</p>
          </section>
        )}

        {/* 同成分の市販薬一覧 */}
        {hasOtc && (
          <section className="mb-8">
            <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
              同じ成分を含む市販薬
              {allMatches.length > matches.length && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  (全{allMatches.length}件中 上位{matches.length}件を表示)
                </span>
              )}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {matches.map((m) => (
                <MedicineCard key={m.id} med={m} badge="同成分" />
              ))}
            </div>
          </section>
        )}

        {/* 注意事項 */}
        <section className="mb-8">
          <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
            切替時の注意
          </h2>
          <div className="callout-warn">
            <p className="text-base leading-relaxed">{entry.caution}</p>
          </div>
        </section>

        {/* 制度背景 */}
        <section className="mb-8 rounded-xl bg-gray-50 p-4 ring-1 ring-black/[0.04]">
          <h2 className="mb-2 text-base font-bold">
            なぜ市販薬への切替が話題になっているのか
          </h2>
          <p className="text-base leading-relaxed text-gray-700">
            市販薬と同じ成分の処方薬(OTC類似薬)について、2027年3月から通常の負担に加えて薬代の4分の1を「上乗せ料金」として負担する制度が始まる予定です(改正健康保険法、2026年5月成立)。
            対象は厚生労働省の案で77成分・約1,100品目で、最終的な対象品目は国の告示で確定します。
          </p>
          <p className="mt-2 text-base">
            <Link href="/otc-similar/" className="font-bold text-brand underline">
              なぜ上乗せ？いくら増える？かからない人は？
            </Link>
          </p>
        </section>

        {/* 相談導線(全切替ページ共通の定型文) */}
        <aside className="mt-10 rounded bg-gray-50 p-4 text-sm leading-relaxed text-gray-600">
          <p>
            当ページは処方薬から市販薬への切替を保証・推奨するものではなく、PMDA等の公開情報を整理した参考情報です。同じ成分でも効果・安全性が同一であることを意味しません。購入・使用の前に必ず薬剤師または登録販売者に相談し、症状が続く場合・悪化する場合は医療機関を受診してください。
          </p>
        </aside>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/switch/" className="text-base text-brand hover:underline">
            ← 他の処方薬から探す
          </Link>
          <Link href="/otc-similar/name/" className="text-base text-brand hover:underline">
            薬の名前で上乗せ対象か調べる →
          </Link>
        </div>
      </article>
    </>
  );
}
