import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata, buildBreadcrumbJsonLd, SITE_URL } from '@/lib/seo';
import { OTC_SIMILAR_77, OTC_SIMILAR_GROUPS } from '@/lib/otc-similar-77';
import { SWITCH_DRUGS } from '@/lib/switch-data';
import { OTC_SIMILAR_PATHS } from '@/lib/otc-similar-data';
import PharmacyKit from './PharmacyKit';

// 配置先: app/otc-similar/pharmacy/page.tsx  →  /otc-similar/pharmacy/
// 薬局・クリニック向け。薬局名入りのA4 POP（QR付き）と、薬剤師向けの対象77成分早見表を
// ブラウザの印刷機能でPDF/紙にする。サーバー側の処理は不要。

export const metadata: Metadata = buildMetadata({
  title: '薬局・医療機関の方へ｜上乗せ料金の患者説明キット（無料・A4 POP／対象77成分早見表）',
  description:
    '2027年3月からのOTC類似薬「上乗せ料金」について、患者さんへの説明に使えるA4 POP（薬局名入り・QRコード付き）と、対象77成分の早見表を無料で印刷できます。広告なし・厚労省公開情報ベース。',
  path: OTC_SIMILAR_PATHS.pharmacy,
});

export default function PharmacyPage() {
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: '/' },
    { name: 'OTC類似薬の上乗せ料金', url: OTC_SIMILAR_PATHS.hub },
    { name: '薬局・医療機関の方へ', url: OTC_SIMILAR_PATHS.pharmacy },
  ]);

  const groups = OTC_SIMILAR_GROUPS.map((g) => ({
    label: g.label,
    ingredients: OTC_SIMILAR_77.filter((i) => i.group === g.key).map((i) => ({
      no: i.no,
      name: i.name,
      rx: i.rxExamples?.[0] ?? '',
    })),
  }));
  const notTargets = SWITCH_DRUGS.filter((d) => d.otcSimilarNo == null).map((d) => d.rxName);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-lg leading-relaxed text-gray-900 print:max-w-none print:px-0 print:py-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <div className="print:hidden">
        <nav className="text-base text-gray-700" aria-label="パンくず">
          <Link href="/" className="underline">ホーム</Link>
          <span className="mx-1">/</span>
          <Link href={OTC_SIMILAR_PATHS.hub} className="underline">上乗せ料金</Link>
          <span className="mx-1">/</span>
          <span>薬局・医療機関の方へ</span>
        </nav>

        <h1 className="mt-4 text-3xl font-bold leading-snug md:text-4xl">
          薬局・医療機関の方へ
          <span className="mt-1 block text-xl font-normal text-gray-700">上乗せ料金の患者説明キット（無料）</span>
        </h1>
        <p className="mt-3">
          2027年3月の実施が近づくと、窓口で「私の薬は対象？」「いくら増える？」という質問が集中します。
          患者さんがご自身のスマートフォンで調べられるように、薬局名入りのA4 POPと、薬剤師向けの対象77成分早見表を用意しました。
          印刷・掲示・配布は自由です。広告はありません。
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-6 text-base text-gray-700">
          <li>POPのQRコードは「お薬手帳を撮るだけ」ページ（{SITE_URL}{OTC_SIMILAR_PATHS.photo}）につながります</li>
          <li>対象品目は厚労省の案（77成分・約1,100品目）をもとにした当サイトの推計です。告示後に更新します</li>
          <li>当サイトは市販薬への切替を推奨する立場ではなく、判断材料の提供と薬剤師・医師への相談を促す内容です</li>
        </ul>
      </div>

      <PharmacyKit
        siteUrl={SITE_URL}
        photoPath={OTC_SIMILAR_PATHS.photo}
        hubPath={OTC_SIMILAR_PATHS.hub}
        groups={groups}
        notTargets={notTargets}
      />
    </div>
  );
}
