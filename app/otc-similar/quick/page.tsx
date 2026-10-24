import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata, buildBreadcrumbJsonLd, buildFaqJsonLd, SITE_URL } from '@/lib/seo';
import { OTC_SIMILAR_META } from '@/lib/otc-similar-77';
import { OTC_SIMILAR_PATHS } from '@/lib/otc-similar-data';
import {
  estimate,
  findItemByName,
  getItemsByNo,
  getYakkaDateLabel,
  unitLabel,
  yen,
  type OtcSimilarItem,
  unitPrice,
} from '@/lib/otc-similar-items';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { ShareCard } from '@/components/ShareCard';

// 配置先: app/otc-similar/quick/page.tsx  →  /otc-similar/quick/
// よく処方される薬21種の「1回の処方でいくら増えるか」早見表。
// 数量は一般的な処方量の目安。薬価データ(data/otc-similar-items.json)から計算するので、
// 薬価改定で数字は自動的に変わる。品名が見つからない行は表示しない(データ更新で名前が変わっても落ちない)。

export const metadata: Metadata = buildMetadata({
  title: '上乗せ料金 早見表｜ロキソニン・アレグラ・ヒルドイドなど、よく出る薬21種でいくら増える？',
  description:
    '2027年3月からのOTC類似薬「上乗せ料金」を、よく処方される21種（ロキソニン、アレグラ、ヒルドイド、ボルタレン、ムコダイン、ナゾネックスなど）で計算。1回の処方での上乗せ額と、3割・1割負担の薬代の変化、ジェネリックにした場合の額を一覧に。',
  path: OTC_SIMILAR_PATHS.quick,
});

type RowDef = { prefix: string; qty: number; qtyLabel: string; note?: string };

// 数量の目安: 錠は「1日○錠×日数」、湿布は1回の処方上限（63枚）、塗り薬は25gチューブ2本、点鼻・うがい薬は1本
const ROWS: RowDef[] = [
  { prefix: 'ロキソニン錠60mg', qty: 42, qtyLabel: '1日3錠×14日（42錠）' },
  { prefix: 'ロキソニンテープ100mg', qty: 63, qtyLabel: '63枚（1回の処方上限）' },
  { prefix: 'ロキソニンパップ100mg', qty: 63, qtyLabel: '63枚（1回の処方上限）' },
  { prefix: 'ロキソニンゲル1%', qty: 50, qtyLabel: '25g×2本（50g）' },
  { prefix: 'ボルタレンテープ30mg', qty: 63, qtyLabel: '63枚（1回の処方上限）' },
  { prefix: 'ボルタレンゲル1%', qty: 50, qtyLabel: '25g×2本（50g）' },
  { prefix: 'アレグラ錠60mg', qty: 60, qtyLabel: '1日2錠×30日（60錠）' },
  { prefix: 'アレジオン錠20', qty: 30, qtyLabel: '1日1錠×30日（30錠）' },
  { prefix: 'クラリチン錠10mg', qty: 30, qtyLabel: '1日1錠×30日（30錠）' },
  { prefix: 'タリオン錠10mg', qty: 60, qtyLabel: '1日2錠×30日（60錠）' },
  { prefix: 'ナゾネックス点鼻液50μg112噴霧用', qty: 1, qtyLabel: '1本（112噴霧・約1か月）' },
  { prefix: 'ザジテン点鼻液0.05%', qty: 1, qtyLabel: '1本（8mL）' },
  { prefix: 'ヒルドイドソフト軟膏0.3%', qty: 50, qtyLabel: '25g×2本（50g）' },
  { prefix: 'ヒルドイドローション0.3%', qty: 50, qtyLabel: '25g×2本（50g）' },
  { prefix: 'ヒルドイドクリーム0.3%', qty: 50, qtyLabel: '25g×2本（50g）' },
  { prefix: 'ロコイドクリーム0.1%', qty: 10, qtyLabel: '5g×2本（10g）' },
  { prefix: 'ムコダイン錠500mg', qty: 42, qtyLabel: '1日3錠×14日（42錠）' },
  { prefix: 'マグミット錠330mg', qty: 90, qtyLabel: '1日3錠×30日（90錠）' },
  { prefix: 'ラキソベロン内用液0.75%', qty: 10, qtyLabel: '1本（10mL）' },
  { prefix: 'イソジンガーグル液7%', qty: 30, qtyLabel: '1本（30mL）' },
  { prefix: 'ゾビラックス軟膏5%', qty: 5, qtyLabel: '1本（5g）' },
  { prefix: 'ラミシールクリーム1%', qty: 10, qtyLabel: '1本（10g）' },
];

/** 同じ成分・同じ単位・同じ経路で最も薬価が安い薬（自分自身より安いときだけ返す） */
function cheapestAlternative(item: OtcSimilarItem): OtcSimilarItem | null {
  const unit = unitLabel(item.spec);
  const c = getItemsByNo(item.no)
    .filter((i) => i.code !== item.code && i.route === item.route && unitLabel(i.spec) === unit && unitPrice(i) < unitPrice(item))
    .sort((a, b) => unitPrice(a) - unitPrice(b))[0];
  return c ?? null;
}

export default function OtcSimilarQuickPage() {
  const rows = ROWS.map((r) => {
    const item = findItemByName(r.prefix);
    if (!item) return null;
    const alt = cheapestAlternative(item);
    return {
      ...r,
      item,
      e3: estimate(item, r.qty, 0.3),
      e1: estimate(item, r.qty, 0.1),
      alt,
      altE3: alt ? estimate(alt, r.qty, 0.3) : null,
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const dateLabel = getYakkaDateLabel();

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: '/' },
    { name: 'OTC類似薬の上乗せ料金', url: OTC_SIMILAR_PATHS.hub },
    { name: '早見表', url: OTC_SIMILAR_PATHS.quick },
  ]);
  const first = rows[0];
  const faqs = [
    {
      q: '上乗せ料金はいくらですか？',
      a: first
        ? `薬代（薬価×数量）の4分の1です。たとえば${first.item.name}を${first.qtyLabel}もらうと、薬価${yen(unitPrice(first.item))}／${unitLabel(first.item.spec)}×${first.qty}＝約${yen(first.e3.drugCost)}の4分の1で、約${yen(first.e3.surcharge)}の上乗せです。3割負担の方の薬代は約${yen(first.e3.before)}から約${yen(first.e3.after)}（+約${yen(first.e3.diff)}）になります。`
        : '薬代（薬価×数量）の4分の1です。',
    },
    {
      q: '同じ薬でもジェネリックなら上乗せ料金は安くなりますか？',
      a: 'はい。上乗せ額は薬価の4分の1なので、薬価の安いジェネリックほど上乗せも小さくなります。早見表では、同じ成分・同じ剤形で最も安い薬に替えた場合の額も載せています。変更は医師・薬剤師に相談してください。',
    },
    {
      q: '早見表にない薬はどう調べればいいですか？',
      a: '「薬の名前で探す」で名前から探すか、「お薬手帳を撮るだけ」で写真から全部まとめて調べられます。シミュレーターでは自分の量と負担割合で計算できます。',
    },
  ];

  const top = rows.slice(0, 6);
  const shareMessage =
    `【上乗せ料金 早見表】2027年3月から、1回の処方でこれだけ増えます（3割負担・薬代のみ）\n` +
    top.map((r) => `・${r.item.name}（${r.qtyLabel}）：+約${yen(r.e3.diff)}`).join('\n') +
    `\nほか${rows.length - top.length}種の一覧はこちら`;

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 text-lg leading-relaxed text-brand-ink md:px-6 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqJsonLd(faqs)) }} />

      <Breadcrumb
        items={[
          { name: 'ホーム', href: '/' },
          { name: '上乗せ料金', href: OTC_SIMILAR_PATHS.hub },
          { name: '早見表' },
        ]}
      />

      <h1 className="mt-2 text-2xl font-bold leading-snug md:text-4xl">
        よく出る薬{rows.length}種の上乗せ料金 早見表
        <span className="mt-2 block text-base font-normal text-gray-600 md:text-xl">1回の処方で、薬代がいくら増えるか</span>
      </h1>
      <p className="mt-4 md:text-xl">
        <strong>{OTC_SIMILAR_META.effectiveLabel}</strong>から、病院でもらう薬の一部に薬代の4分の1が上乗せされます。
        よく処方される薬を、一般的な量でそれぞれ計算しました。
      </p>
      <p className="mt-3 text-sm text-gray-600 md:text-base">
        薬価は厚生労働省の薬価基準収載品目リスト（{dateLabel}時点）。金額は薬代の部分だけで、診察料・調剤料は含みません。
      </p>

      <ul className="mt-8 space-y-3">
        {rows.map((r, i) => (
          <li key={r.item.code} className="panel">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={OTC_SIMILAR_PATHS.item(r.item.code)} className="text-lg font-bold text-brand underline underline-offset-4 md:text-xl">
                  {r.item.name}
                </Link>
                <p className="mt-1 text-sm text-gray-600 md:text-base">
                  {r.item.ingredient}・{r.qtyLabel}
                </p>
              </div>
              <div className="shrink-0 rounded-xl bg-alert px-3 py-2 text-center text-white">
                <div className="text-xs">上乗せ</div>
                <div className="text-xl font-bold leading-tight md:text-2xl">+{yen(r.e3.surcharge)}</div>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm md:text-base">
              <div className="rounded-xl bg-gray-50 px-3 py-2">
                <dt className="text-gray-600">3割の人</dt>
                <dd>
                  {yen(r.e3.before)} → <span className="font-bold">{yen(r.e3.after)}</span>
                </dd>
              </div>
              <div className="rounded-xl bg-gray-50 px-3 py-2">
                <dt className="text-gray-600">1割の人</dt>
                <dd>
                  {yen(r.e1.before)} → <span className="font-bold">{yen(r.e1.after)}</span>
                </dd>
              </div>
            </dl>
            {r.alt && r.altE3 ? (
              <p className="mt-3 text-sm text-gray-600 md:text-base">
                同じ成分で最も安い
                <Link href={OTC_SIMILAR_PATHS.item(r.alt.code)} className="mx-1 text-brand underline underline-offset-4">
                  {r.alt.name}
                </Link>
                なら、上乗せは +{yen(r.altE3.surcharge)}（{yen(r.e3.surcharge - r.altE3.surcharge)}少ない）
              </p>
            ) : null}
            <span className="sr-only">{i + 1}番目</span>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-sm text-gray-600 md:text-base">
        数量は一般的な処方量の目安です。実際の処方量・薬価・負担割合で変わります。湿布の63枚は1回の処方で出せる上限枚数です。
      </p>

      <ShareCard
        heading="この早見表を家族に送る"
        lead="よく出る薬の「いくら増えるか」が入った文章です。処方薬をもらっている人に。"
        message={shareMessage}
        url={`${SITE_URL}${OTC_SIMILAR_PATHS.quick}`}
        xText={`2027年3月からの上乗せ料金、よく出る薬で計算すると：${top
          .slice(0, 3)
          .map((r) => `${r.item.name} +約${yen(r.e3.diff)}`)
          .join('、')}（3割負担・1回の処方）。自分の薬は？`}
        hashtags={['上乗せ料金', 'OTC類似薬']}
      />

      <section className="mt-12">
        <h2 className="text-xl font-bold md:text-2xl">自分の薬で計算する</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link
            href={OTC_SIMILAR_PATHS.photo}
            className="flex min-h-[72px] items-center justify-between gap-3 rounded-2xl bg-alert px-5 py-4 text-white"
          >
            <span className="block">
              <span className="block text-lg font-bold md:text-xl">お薬手帳を撮るだけ</span>
              <span className="mt-1 block text-sm md:text-base">写真1枚で、対象の薬と増える額が全部出ます</span>
            </span>
            <span className="shrink-0 text-2xl" aria-hidden="true">›</span>
          </Link>
          <Link
            href={OTC_SIMILAR_PATHS.simulator}
            className="flex min-h-[72px] items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 hover:border-brand"
          >
            <span className="block">
              <span className="block text-lg font-bold text-brand md:text-xl">シミュレーター</span>
              <span className="mt-1 block text-sm text-gray-600 md:text-base">薬の名前と量、負担割合を入れて計算</span>
            </span>
            <span className="shrink-0 text-2xl text-brand" aria-hidden="true">›</span>
          </Link>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-bold md:text-2xl">よくある質問</h2>
        <dl className="mt-3 divide-y divide-gray-200">
          {faqs.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="font-bold md:text-xl">Q. {f.q}</dt>
              <dd className="mt-2 text-base md:text-lg">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12 rounded-2xl border-l-4 border-amber-400 bg-amber-50 p-5 text-base">
        <p className="font-bold">ご注意</p>
        <ul className="mt-2 list-disc space-y-2 pl-6">
          <li>対象かどうかは{OTC_SIMILAR_META.listStatus}に基づく当サイトの推計で、最終的には国の告示で確定します。</li>
          <li>お子さん、がん・難病の方、収入の少ない方、入院中の方、医師が長期使用を必要と判断した方などは上乗せ料金がかからない方向で検討されています。</li>
          <li>当サイトは市販薬への切替をすすめるものではありません。薬の変更は医師・薬剤師に相談してください。</li>
        </ul>
      </section>

      <p className="mt-8 text-base md:text-lg">
        上乗せ額が大きい薬の
        <Link href={OTC_SIMILAR_PATHS.ranking} className="mx-1 font-bold text-brand underline underline-offset-4">ランキング</Link>
        も見られます。制度の説明は
        <Link href={OTC_SIMILAR_PATHS.hub} className="mx-1 font-bold text-brand underline underline-offset-4">こちら</Link>。
      </p>
    </div>
  );
}
