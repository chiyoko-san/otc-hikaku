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
  const desc =
    matches.length > 0
      ? `${entry.rxName}(${entry.genericName})と同じ成分を含む市販薬${matches.length}件の一覧と、処方薬との用量・剤形の違い、購入時の注意点を解説。PMDA公開情報ベース。`
      : `${entry.rxName}(${entry.genericName})の市販薬での代替可否と、購入前に知っておくべき注意点を解説。PMDA公開情報ベース。`;

  return buildMetadata({
    title: `${entry.rxName}と同じ成分の市販薬はある?|処方薬との違いと注意点`,
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

  const breadcrumbs = [
    { name: 'ホーム', href: '/' },
    { name: '処方薬から探す', href: '/switch/' },
    { name: entry.rxName },
  ];

  const faqs = [
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

        <header className="mb-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="pill-brand">
              処方薬からの切替
            </span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
              {entry.categoryLabel}
            </span>
          </div>
          <h1 className="mb-2 text-3xl font-bold leading-tight md:text-4xl">
            {entry.rxName}と同じ成分の市販薬
          </h1>
          <p className="text-gray-600">有効成分: {entry.genericName}</p>
        </header>

        {/* 結論 */}
        <section className="mb-8">
          <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
            結論
          </h2>
          {hasOtc ? (
            <p className="leading-relaxed text-gray-800">
              {entry.rxName}の有効成分({entry.genericName}
            )を含む市販薬は<strong>{allMatches.length}件</strong>
              確認できます。ただし、処方薬と市販薬は含有量・剤形・適応が異なる場合があります。以下の違いを確認のうえ、購入時は薬剤師・登録販売者に相談してください。
            </p>
          ) : (
            <div className="callout-warn">
              <div className="callout-title">同じ成分の市販薬は確認できません</div>
              <p className="text-sm">{entry.altNote}</p>
            </div>
          )}
        </section>

        {/* 処方薬との違い */}
        {entry.doseNote && (
          <section className="mb-8">
            <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
              処方薬との違い(用量・剤形)
            </h2>
            <p className="leading-relaxed text-gray-800">{entry.doseNote}</p>
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
            <p className="text-sm leading-relaxed">{entry.caution}</p>
          </div>
        </section>

        {/* 制度背景 */}
        <section className="mb-8 rounded-xl bg-gray-50 p-4 ring-1 ring-black/[0.04]">
          <h2 className="mb-2 text-sm font-bold">
            なぜ市販薬への切替が話題になっているのか
          </h2>
          <p className="text-sm leading-relaxed text-gray-700">
            市販薬と効能が重なる処方薬(OTC類似薬)について、保険適用を見直す方針が示されており、2026年度から段階的な実施が進められています。対象品目や時期は今後変更される可能性があります。最新の情報は厚生労働省の発表をご確認ください。
          </p>
        </section>

        {/* 相談導線(全切替ページ共通の定型文) */}
        <aside className="mt-10 rounded bg-gray-50 p-4 text-xs leading-relaxed text-gray-600">
          <p>
            当ページは処方薬から市販薬への切替を保証・推奨するものではなく、PMDA等の公開情報を整理した参考情報です。同じ成分でも効果・安全性が同一であることを意味しません。購入・使用の前に必ず薬剤師または登録販売者に相談し、症状が続く場合・悪化する場合は医療機関を受診してください。
          </p>
        </aside>

        <div className="mt-6">
          <Link href="/switch/" className="text-sm text-brand hover:underline">
            ← 他の処方薬から探す
          </Link>
        </div>
      </article>
    </>
  );
}
