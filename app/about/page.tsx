import type { Metadata } from 'next';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'クスリノコンパスについて',
  description:
    '広告・案件なしで運営する、市販薬・OTC医薬品の中立的な比較情報サイト。データソースはPMDA公開情報。',
  path: '/about/',
});

export default function AboutPage() {
  return (
    <div className="container-narrow py-10">
      <Breadcrumb
        items={[{ name: 'ホーム', href: '/' }, { name: 'サイトについて' }]}
      />

      <h1 className="mb-6 text-3xl font-bold md:text-4xl">
        クスリノコンパスについて
      </h1>

      <div className="space-y-6 leading-relaxed">
        <section>
          <h2 className="mb-2 border-l-4 border-brand pl-3 text-xl font-bold">
            サイトの目的
          </h2>
          <p>
            クスリノコンパスは、市販薬(OTC医薬品)を「成分」や「症状」から中立的に比較できることを目指した情報サイトです。
          </p>
          <p>
            日本のOTC医薬品は7,500品目以上ありますが、消費者が自身で成分や効能を比較検討するのは容易ではありません。広告色の強い比較サイトやアフィリエイト中心の情報源に依存せず、
            <strong>PMDA(医薬品医療機器総合機構)の公開情報をベース</strong>に整理しています。
          </p>
        </section>

        <section>
          <h2 className="mb-2 border-l-4 border-brand pl-3 text-xl font-bold">
            特徴
          </h2>
          <ul className="ml-6 list-disc space-y-2">
            <li><strong>広告・案件ゼロ</strong>:アフィリエイトリンクを設置していません。</li>
            <li><strong>成分ベースの比較</strong>:「商品名」ではなく「成分」から検索・比較できます。</li>
            <li><strong>リスク区分の明示</strong>:第1類〜第3類の区分と薬剤師相談の要否を明確に表示。</li>
            <li><strong>被害報告の共有</strong>:利用者から寄せられた副作用・トラブル情報を可視化。</li>
            <li><strong>症状アキネーター</strong>:対話形式で症状に合った成分を見つけられます。</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 border-l-4 border-brand pl-3 text-xl font-bold">
            データの出典
          </h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>医薬品基本情報: PMDA(独立行政法人 医薬品医療機器総合機構)一般用医薬品データベース</li>
            <li>景品表示法関連情報: 消費者庁</li>
            <li>特定商取引法関連情報: 消費者庁・国民生活センター</li>
          </ul>
          <p className="mt-3 text-sm text-gray-600">
            情報は随時更新していますが、最新の添付文書・成分情報は必ず公式サイトでもご確認ください。
          </p>
        </section>

        <section>
          <h2 className="mb-2 border-l-4 border-brand pl-3 text-xl font-bold">
            免責事項
          </h2>
          <p>
            本サイトは医療行為を提供するものではなく、特定の治療法・薬剤の選択を指示するものでもありません。服用・購入前には必ず添付文書を確認し、不明点は薬剤師・医師に相談してください。
          </p>
          <p>
            また、掲載内容に誤りを発見された場合は、
            <a href="/contact/" className="text-brand underline">
              お問い合わせフォーム
            </a>
            よりお知らせください。
          </p>
        </section>
      </div>
    </div>
  );
}
