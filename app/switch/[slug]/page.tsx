import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAllSwitchDrugs, getSwitchDrugBySlug } from '@/lib/switch-data';
import { buildMetadata } from '@/lib/seo';
import SwitchAnswerPage, { switchAnswerSummary } from '@/components/switch/SwitchAnswerPage';
import { yen } from '@/lib/otc-similar-items';

// 配置先: app/switch/[slug]/page.tsx
//
// 切替ページ = 手書き30薬（lib/switch-data.ts）＋ NDBから生成した薬（data/switch-drugs.json → lib/switch-generated.ts）。
// 表示はすべて components/switch/SwitchAnswerPage.tsx。
// 生成薬のうち「同じ成分を含む市販薬が無く、上乗せ対象でもない」ページは、文章が承認されるまで noindex（サイトマップにも載せない）。

// ISR: 1日に1回再生成
export const revalidate = 86400;

export async function generateStaticParams() {
  return getAllSwitchDrugs().map((d) => ({ slug: d.slug }));
}

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entry = getSwitchDrugBySlug(params.slug);
  if (!entry || !entry.answer) return { title: 'ページが見つかりません' };

  const { matches, monthly, risk, riskLine, topNames } = switchAnswerSummary(entry);
  const n = matches.length;
  const partial = entry.answer.partialMatchLabel;
  const exact = n > 0 && !partial;
  const fee =
    entry.otcSimilarNo != null
      ? monthly
        ? `2027年3月からの上乗せ料金は${monthly.qtyLabel}で+約${yen(monthly.e3.diff)}（3割負担）。`
        : '2027年3月からの上乗せ料金の対象（厚労省案）。'
      : '2027年3月からの上乗せ料金は対象外（厚労省案）。';
  const meta = buildMetadata({
    title: exact
      ? `${entry.rxName}と同じ成分の市販薬${n}品｜ネットで買える？上乗せ料金はいくら？`
      : `${entry.rxName}と同じ成分の市販薬はある？｜上乗せ料金の対象と処方薬との違い`,
    description:
      (exact
        ? `${entry.rxName}（${entry.genericName}）と同じ成分の市販薬は${topNames.join('・')}など${n}品。${risk.label}なので${riskLine}`
        : partial
          ? `${entry.rxName}と同じ組み合わせの市販薬はありません。${partial}は${n}品（${risk.label}）。`
          : `${entry.rxName}（${entry.genericName}）と同じ成分の市販薬の有無と、代わりの選び方。`) +
      `${fee}処方薬との違い（対象年齢・使える症状）と購入時の注意も解説。PMDA・厚労省の公開情報ベース。`,
    path: `/switch/${entry.slug}/`,
    type: 'article',
  });
  if (entry.index === false) {
    return { ...meta, robots: { index: false, follow: true } };
  }
  return meta;
}

export default async function SwitchDetailPage({ params }: Props) {
  const entry = getSwitchDrugBySlug(params.slug);
  if (!entry || !entry.answer) notFound();
  return <SwitchAnswerPage entry={entry} />;
}
