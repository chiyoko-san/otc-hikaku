import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata, buildBreadcrumbJsonLd, SITE_URL } from '@/lib/seo';
import { OTC_SIMILAR_77, OTC_SIMILAR_GROUPS, OTC_SIMILAR_META } from '@/lib/otc-similar-77';
import { OTC_SIMILAR_PATHS } from '@/lib/otc-similar-data';
import { getItemsByNo, getYakkaDateLabel, unitLabel, yen, type OtcSimilarItem } from '@/lib/otc-similar-items';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { ShareCard } from '@/components/ShareCard';

// 配置先: app/otc-similar/all/page.tsx  →  /otc-similar/all/
// 「OTC類似薬 一覧」「上乗せ料金 対象 一覧」で探す人のための1枚。
// 厚労省案の77成分を用途ごとに並べ、代表的な処方薬・1単位あたりの上乗せ額・処方薬の数を出す。
// 全成分ページ・全処方薬ページへの入口でもある（トップ → ここ → 成分 → 薬）。

export const metadata: Metadata = buildMetadata({
  title: 'OTC類似薬 対象77成分の一覧｜上乗せ料金（2027年3月〜）の対象薬を用途別に',
  description:
    '2027年3月から上乗せ料金の対象になるOTC類似薬77成分（厚生労働省案）の一覧。花粉症、湿布・鎮痛、保湿、ステロイド外用、みずむしなど用途別に、代表的な処方薬（ロキソニン・アレグラ・ヒルドイドなど）と1単位あたりの上乗せ額をまとめました。',
  path: OTC_SIMILAR_PATHS.all,
});

function perUnit(item: OtcSimilarItem): number {
  const m = item.spec.match(/(\d+(?:\.\d+)?)?(錠|カプセル|包|g|mL|枚|管|瓶|個|本|袋)$/);
  const n = m && m[1] ? Number(m[1]) : 1;
  return item.price / n / 4;
}

/** 成分の代表品: 先発品のうち薬価が高いもの。先発が無ければ一番高いもの */
function representative(items: OtcSimilarItem[]): OtcSimilarItem | null {
  if (items.length === 0) return null;
  const pool = items.some((i) => i.kind === '先発') ? items.filter((i) => i.kind === '先発') : items;
  return [...pool].sort((a, b) => b.price - a.price)[0];
}

export default function OtcSimilarAllPage() {
  const rows = OTC_SIMILAR_77.map((ing) => {
    const items = getItemsByNo(ing.no);
    const rep = representative(items);
    return { ing, items, rep, per: rep ? perUnit(rep) : null };
  });
  const groups = OTC_SIMILAR_GROUPS.map((g) => ({ g, rows: rows.filter((r) => r.ing.group === g.key) })).filter((x) => x.rows.length > 0);
  const otherRows = rows.filter((r) => !OTC_SIMILAR_GROUPS.some((g) => g.key === r.ing.group));
  const totalItems = rows.reduce((s, r) => s + r.items.length, 0);

  const crumbs = [
    { name: 'ホーム', href: '/' },
    { name: '上乗せ料金', href: OTC_SIMILAR_PATHS.hub },
    { name: '対象77成分の一覧' },
  ];
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: '/' },
    { name: 'OTC類似薬の上乗せ料金', url: OTC_SIMILAR_PATHS.hub },
    { name: '対象77成分の一覧', url: OTC_SIMILAR_PATHS.all },
  ]);

  const shareMessage =
    `【上乗せ料金の対象になる薬（厚労省案）】2027年3月から。${OTC_SIMILAR_META.ingredientCount}成分・処方薬${totalItems}品目\n` +
    groups
      .slice(0, 5)
      .map((x) => `・${x.g.label}：${x.rows.slice(0, 3).map((r) => r.rep?.name.replace(/「.*」/, '') ?? r.ing.name).join('、')} など`)
      .join('\n');

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 text-lg leading-relaxed text-brand-ink md:px-6 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <Breadcrumb items={crumbs} />

      <h1 className="mt-2 text-2xl font-bold leading-snug md:text-4xl">
        上乗せ料金の対象になる薬の一覧
        <span className="mt-2 block text-base font-normal text-gray-600 md:text-xl">OTC類似薬{OTC_SIMILAR_META.ingredientCount}成分（厚生労働省案）・処方薬{totalItems}品目</span>
      </h1>
      <p className="mt-4 md:text-xl">
        <strong>{OTC_SIMILAR_META.effectiveLabel}</strong>から、ここに載っている成分の処方薬には、いつもの負担に加えて薬代の4分の1が上乗せされる予定です。
        成分名を押すと、その成分の処方薬すべてと金額が見られます。
      </p>
      <p className="mt-3 text-sm text-gray-600 md:text-base">
        「代表的な薬」は各成分の先発品、「上乗せ」は1単位（1錠・1枚・1gなど）あたりの額。薬価は厚生労働省リスト（{getYakkaDateLabel()}時点）。
      </p>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="用途">
        {groups.map((x) => (
          <a key={x.g.key} href={`#g-${x.g.key}`} className="inline-flex min-h-[40px] items-center rounded-full border border-gray-300 bg-white px-4 text-base text-brand">
            {x.g.label}
          </a>
        ))}
      </nav>

      {[...groups, ...(otherRows.length ? [{ g: { key: 'other', label: 'その他', lead: '' }, rows: otherRows }] : [])].map((x) => (
        <section key={x.g.key} id={`g-${x.g.key}`} className="mt-12 scroll-mt-24">
          <h2 className="text-xl font-bold md:text-2xl">
            {x.g.label}
            <span className="ml-2 text-base font-normal text-gray-600">{x.rows.length}成分</span>
          </h2>
          <ul className="mt-4 space-y-3">
            {x.rows.map(({ ing, items, rep, per }) => (
              <li key={ing.no} className="panel">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={OTC_SIMILAR_PATHS.ingredient(ing.no)} className="text-base font-bold text-brand underline underline-offset-4 md:text-lg">
                      {ing.name}
                    </Link>
                    <p className="mt-1 text-sm text-gray-600 md:text-base">
                      {ing.use}・処方薬{items.length}品目
                    </p>
                    {rep ? (
                      <p className="mt-1 text-sm md:text-base">
                        代表的な薬：
                        <Link href={OTC_SIMILAR_PATHS.item(rep.code)} className="text-brand underline underline-offset-4">
                          {rep.name}
                        </Link>
                      </p>
                    ) : ing.rxExamples?.length ? (
                      <p className="mt-1 text-sm text-gray-600 md:text-base">例：{ing.rxExamples.join('、')}</p>
                    ) : null}
                  </div>
                  {rep && per !== null ? (
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-gray-600">上乗せ／{unitLabel(rep.spec)}</div>
                      <div className="text-lg font-bold text-alert md:text-xl">+{yen(per)}</div>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <ShareCard
        heading="この一覧を送る"
        lead="対象になる薬の種類が入った文章です。処方薬をもらっている家族に。"
        message={shareMessage}
        url={`${SITE_URL}${OTC_SIMILAR_PATHS.all}`}
        xText={`2027年3月からの上乗せ料金、対象は${OTC_SIMILAR_META.ingredientCount}成分・処方薬${totalItems}品目。花粉症薬、湿布、保湿剤、ステロイド外用薬、みずむし薬…。自分の薬は入ってる？`}
        hashtags={['上乗せ料金', 'OTC類似薬']}
      />

      <section className="mt-12 rounded-2xl border-l-4 border-amber-400 bg-amber-50 p-5 text-base">
        <p className="font-bold">ご注意</p>
        <ul className="mt-2 list-disc space-y-2 pl-6">
          <li>一覧は{OTC_SIMILAR_META.listStatus}です。最終的な対象は国の告示で確定します。</li>
          <li>同じ成分でも、市販薬と使い方（効能・用量）が異なる製剤は対象外になる場合があります。</li>
          <li>当サイトは市販薬への切替をすすめるものではありません。薬の変更は医師・薬剤師に相談してください。</li>
        </ul>
      </section>

      <p className="mt-8 text-base md:text-lg">
        自分の薬で金額を出すなら
        <Link href={OTC_SIMILAR_PATHS.photo} className="mx-1 font-bold text-brand underline underline-offset-4">お薬手帳を撮るだけ</Link>
        か
        <Link href={OTC_SIMILAR_PATHS.simulator} className="mx-1 font-bold text-brand underline underline-offset-4">シミュレーター</Link>
        へ。制度の説明は
        <Link href={OTC_SIMILAR_PATHS.hub} className="mx-1 font-bold text-brand underline underline-offset-4">こちら</Link>。
      </p>
    </div>
  );
}
