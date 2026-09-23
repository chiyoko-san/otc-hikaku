import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { buildMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';
import { OTC_SIMILAR_PATHS } from '@/lib/otc-similar-data';
import { getSlimItems, getYakkaDateLabel } from '@/lib/otc-similar-items';
import Simulator from './Simulator';

// 配置先: app/otc-similar/simulator/page.tsx  →  /otc-similar/simulator/
// 薬の名前（または成分名）で探して、数量と負担割合を選ぶと「これまで／これから／増える額」が出る。
// ?item=<薬価基準コード> で最初の薬を指定できる（薬価表の「自分の量で」ボタンから）。

export const metadata: Metadata = buildMetadata({
  title: '上乗せ料金シミュレーター｜自分の処方薬でいくら増えるか計算',
  description:
    'ロキソニン・アレグラ・ヒルドイドなど、2027年3月からのOTC類似薬「上乗せ料金」で自分の薬代がいくら増えるかを計算。薬の名前か成分名で探し、数量と負担割合（1〜3割）を選ぶだけ。薬価は厚生労働省の公開データ。',
  path: OTC_SIMILAR_PATHS.simulator,
});

export default function SimulatorPage() {
  const items = getSlimItems();
  const dateLabel = getYakkaDateLabel();
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: '/' },
    { name: '処方薬から探す', url: '/switch/' },
    { name: 'OTC類似薬の上乗せ料金', url: OTC_SIMILAR_PATHS.hub },
    { name: 'シミュレーター', url: OTC_SIMILAR_PATHS.simulator },
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-lg leading-relaxed text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <nav className="text-base text-gray-700" aria-label="パンくず">
        <Link href="/" className="underline">ホーム</Link>
        <span className="mx-1">/</span>
        <Link href={OTC_SIMILAR_PATHS.hub} className="underline">上乗せ料金</Link>
        <span className="mx-1">/</span>
        <span>シミュレーター</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold leading-snug md:text-4xl">
        上乗せ料金シミュレーター
        <span className="mt-1 block text-xl font-normal text-gray-700">自分の薬と量で、いくら増えるか計算します</span>
      </h1>
      <p className="mt-3 text-xl leading-relaxed">
        薬の名前（お薬手帳や薬袋に書いてある名前）か成分名で探してください。「湿布」「花粉症」のような言葉でも探せます。
      </p>

      <Suspense fallback={<p className="mt-6">読み込み中…</p>}>
        <Simulator items={items} />
      </Suspense>

      <section className="mt-12 rounded-xl bg-[#fff4d6] p-5">
        <p className="font-bold">この計算について</p>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-base">
          <li>上乗せ額＝薬価×数量÷4。「これから」＝上乗せ額＋残りの薬代×負担割合。診察料・調剤料などは含みません。</li>
          <li>薬価は厚生労働省の薬価基準収載品目リスト（{dateLabel}時点）。対象かどうかは厚労省の案（77成分）をもとにした当サイトの推計で、最終的には国の告示で確定します。</li>
          <li>お子さん、がん・難病の方、収入の少ない方、入院中の方、医師が長期使用を必要と判断した方などは上乗せ料金がかからない方向で検討されています。</li>
          <li>当サイトは市販薬への切替をすすめるものではありません。薬の変更は医師・薬剤師に相談してください。</li>
        </ul>
      </section>

      <p className="mt-6">
        制度の説明は<Link href={OTC_SIMILAR_PATHS.hub} className="font-bold text-[#1f4d3a] underline">こちら</Link>。
        同じ成分の市販薬は<Link href={OTC_SIMILAR_PATHS.use} className="font-bold text-[#1f4d3a] underline">用途で探す</Link>から。
      </p>
    </div>
  );
}
