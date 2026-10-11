import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata, buildBreadcrumbJsonLd, SITE_URL } from '@/lib/seo';
import { OTC_SIMILAR_77, OTC_SIMILAR_META } from '@/lib/otc-similar-77';
import { OTC_SIMILAR_PATHS } from '@/lib/otc-similar-data';
import {
  getAllItemCodes,
  getItemByCode,
  getYakkaDateLabel,
  yen,
  type OtcSimilarItem,
} from '@/lib/otc-similar-items';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { ShareCard } from '@/components/ShareCard';

// 配置先: app/otc-similar/ranking/page.tsx  →  /otc-similar/ranking/
// 688品目の薬価データから、「1回の処方で上乗せ額が大きい成分」と
// 「同じ成分で最安の薬に替えると上乗せが減る額」を並べる。順位は本当に順番なので番号を付ける。

export const metadata: Metadata = buildMetadata({
  title: '上乗せ料金が大きい薬ランキング｜2027年3月から1回の処方で最も増える成分20・ジェネリックで減る額20',
  description:
    '2027年3月からのOTC類似薬「上乗せ料金」を、厚労省の薬価データ688品目で計算。1回の処方で上乗せ額が大きい成分トップ20と、同じ成分の最安品に替えたときに減る額トップ20。点鼻薬・保湿剤・湿布など、どの薬が重いかが一目でわかります。',
  path: OTC_SIMILAR_PATHS.ranking,
});

/** 規格の末尾「<数>単位」を読む。価格はこの数量あたり（例: "10%10g" は10gあたり、"60mg1錠" は1錠あたり） */
function unitInfo(spec: string): { n: number; unit: string } {
  const m = spec.match(/(\d+(?:\.\d+)?)?(錠|カプセル|包|g|mL|枚|管|瓶|個|本|袋)$/);
  if (!m) return { n: 1, unit: '単位' };
  return { n: m[1] ? Number(m[1]) : 1, unit: m[2] };
}

/** 剤形ごとの「1回の処方の目安量」。同じ剤形の中で比べるための固定値 */
const FORMS = [
  { key: 'tab', label: '飲み薬', unitLabel: '1錠', units: ['錠', 'カプセル'], qty: 30, qtyLabel: '30錠' },
  { key: 'patch', label: '湿布・テープ', unitLabel: '1枚', units: ['枚'], qty: 63, qtyLabel: '63枚（1回の処方上限）' },
  { key: 'oint', label: '塗り薬', unitLabel: '1g', units: ['g'], qty: 25, qtyLabel: '25g（チューブ1本）' },
  { key: 'bottle', label: '点鼻・点眼など', unitLabel: '1本', units: ['瓶'], qty: 1, qtyLabel: '1本' },
] as const;

type RankRow = {
  item: OtcSimilarItem;
  perUnit: number; // 1単位あたりの上乗せ額
  typical: number; // 目安量での上乗せ額
};

function perUnitSurcharge(item: OtcSimilarItem): number {
  const { n } = unitInfo(item.spec);
  return item.price / n / 4;
}

export default function OtcSimilarRankingPage() {
  const items = getAllItemCodes().map((c) => getItemByCode(c)).filter((x): x is OtcSimilarItem => x !== null);
  const nameOf = new Map(OTC_SIMILAR_77.map((i) => [i.no, i.name]));
  const byNo = new Map<number, OtcSimilarItem[]>();
  for (const it of items) byNo.set(it.no, [...(byNo.get(it.no) ?? []), it]);

  // A. 剤形別: 成分ごとに先発品1つ（無ければ後発）を代表にして、1単位あたりの上乗せ額が大きい順。
  //    原末・局方品（kind その他）と腟錠は、量の前提が合わないので外す
  const formRankings = FORMS.map((f) => {
    const rows: RankRow[] = [];
    for (const list of byNo.values()) {
      const pool = list.filter((i) => {
        const u = unitInfo(i.spec).unit;
        if (!(f.units as readonly string[]).includes(u)) return false;
        if (i.kind === 'その他' || i.name.includes('腟')) return false;
        if (f.key === 'oint' && i.route !== '外用薬') return false;
        return true;
      });
      if (pool.length === 0) continue;
      const pri = pool.some((i) => i.kind === '先発') ? pool.filter((i) => i.kind === '先発') : pool;
      const best = pri.map((i) => ({ item: i, perUnit: perUnitSurcharge(i) })).sort((a, b) => b.perUnit - a.perUnit)[0];
      rows.push({ item: best.item, perUnit: best.perUnit, typical: best.perUnit * f.qty });
    }
    return { form: f, rows: rows.sort((a, b) => b.perUnit - a.perUnit).slice(0, 10) };
  });

  // B. 先発品 → 同じ成分・同じ規格（同じ量・同じ単位）の最安ジェネリックに替えたとき、目安量で減る上乗せ額が大きい順
  type SaveRow = { from: OtcSimilarItem; to: OtcSimilarItem; qtyLabel: string; fromS: number; toS: number; saving: number };
  const savings: SaveRow[] = [];
  for (const list of byNo.values()) {
    for (const b of list.filter((i) => i.kind === '先発' && !i.name.includes('腟'))) {
      const cheapest = list
        .filter((i) => i.code !== b.code && i.kind === '後発' && i.spec === b.spec && i.price < b.price)
        .sort((x, y) => x.price - y.price)[0];
      if (!cheapest) continue;
      const u = unitInfo(b.spec).unit;
      const f = FORMS.find((x) => (x.units as readonly string[]).includes(u));
      const qty = f ? f.qty : u === 'mL' ? (b.route === '内用薬' ? 10 : 5) : u === '包' ? 14 : 1;
      const qtyLabel = f ? f.qtyLabel : `${qty}${u}`;
      const fromS = perUnitSurcharge(b) * qty;
      const toS = perUnitSurcharge(cheapest) * qty;
      savings.push({ from: b, to: cheapest, qtyLabel, fromS, toS, saving: fromS - toS });
    }
  }
  const topSavings = savings.sort((a, b) => b.saving - a.saving).slice(0, 20);

  const dateLabel = getYakkaDateLabel();
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: '/' },
    { name: 'OTC類似薬の上乗せ料金', url: OTC_SIMILAR_PATHS.hub },
    { name: 'ランキング', url: OTC_SIMILAR_PATHS.ranking },
  ]);

  const leaders = formRankings.filter((f) => f.rows.length > 0).map((f) => ({ form: f.form, r: f.rows[0] }));
  const shareMessage =
    `【上乗せ料金が重い薬】2027年3月から。剤形ごとの1位（上乗せは薬価の4分の1）\n` +
    leaders.map((l) => `・${l.form.label}：${l.r.item.name} +約${yen(l.r.perUnit)}／${l.form.unitLabel}（${l.form.qtyLabel}なら +約${yen(l.r.typical)}）`).join('\n');

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 text-lg leading-relaxed text-brand-ink md:px-6 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <Breadcrumb
        items={[
          { name: 'ホーム', href: '/' },
          { name: '上乗せ料金', href: OTC_SIMILAR_PATHS.hub },
          { name: 'ランキング' },
        ]}
      />

      <h1 className="mt-2 text-2xl font-bold leading-snug md:text-4xl">
        上乗せ料金が大きい薬ランキング
        <span className="mt-2 block text-base font-normal text-gray-600 md:text-xl">対象{OTC_SIMILAR_META.ingredientCount}成分・{items.length}品目の薬価から計算</span>
      </h1>
      <p className="mt-4 md:text-xl">
        上乗せ額は薬価の4分の1。薬価が高い薬・量が多い薬ほど重くなります。
        剤形ごとに、1単位（1錠・1枚・1g・1本）あたりの上乗せ額で比べ、1回の処方の目安量（30錠・63枚・25g・1本）での額も添えました。
      </p>
      <p className="mt-3 text-sm text-gray-600 md:text-base">
        薬価は厚生労働省の薬価基準収載品目リスト（{dateLabel}時点）。金額は薬代の部分だけで、診察料・調剤料は含みません。
      </p>

      {/* A: 剤形別 */}
      {formRankings.map(({ form, rows }) =>
        rows.length === 0 ? null : (
          <section key={form.key} className="mt-12">
            <h2 className="text-xl font-bold md:text-2xl">
              {form.label}：{form.unitLabel}あたりの上乗せが大きい成分
            </h2>
            <p className="mt-2 text-sm text-gray-600 md:text-base">成分ごとに先発品1つを代表にしています。右の額は{form.qtyLabel}もらった場合の上乗せです。</p>
            <ol className="mt-4 space-y-3">
              {rows.map((r, i) => (
                <li key={r.item.code} className="panel flex items-start gap-4">
                  <span className="mt-0.5 w-8 shrink-0 text-center text-2xl font-bold text-gray-400" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={OTC_SIMILAR_PATHS.item(r.item.code)} className="text-base font-bold text-brand underline underline-offset-4 md:text-lg">
                          {r.item.name}
                        </Link>
                        <p className="mt-1 text-sm text-gray-600">
                          {nameOf.get(r.item.no) ?? r.item.ingredient}・薬価{yen(r.item.price)}／{r.item.spec}
                        </p>
                        <p className="mt-1 text-sm text-gray-600 md:text-base">
                          上乗せ <span className="font-bold text-brand-ink">+{yen(r.perUnit)}</span>／{form.unitLabel}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs text-gray-600">{form.qtyLabel.replace(/（.*）/, '')}なら</div>
                        <div className="text-xl font-bold text-alert md:text-2xl">+{yen(r.typical)}</div>
                      </div>
                    </div>
                  </div>
                  <span className="sr-only">{i + 1}位</span>
                </li>
              ))}
            </ol>
          </section>
        )
      )}

      <ShareCard
        heading="このランキングを送る"
        lead="トップ5が入った文章です。「うちの薬、入ってる？」の話題に。"
        message={shareMessage}
        url={`${SITE_URL}${OTC_SIMILAR_PATHS.ranking}`}
        xText={`2027年3月からの上乗せ料金、剤形ごとに一番重いのは ${leaders
          .slice(0, 3)
          .map((l) => `${l.form.label}：${l.r.item.name} +約${yen(l.r.perUnit)}／${l.form.unitLabel}`)
          .join('、')}。自分の薬は？`}
        hashtags={['上乗せ料金', 'OTC類似薬']}
      />

      {/* B */}
      <section className="mt-12">
        <h2 className="text-xl font-bold md:text-2xl">ジェネリックに替えると上乗せが減る額 トップ20</h2>
        <p className="mt-2 text-sm text-gray-600 md:text-base">
          先発品と、同じ成分・同じ規格で最も薬価の安いジェネリックとの差です。替えられるかは医師・薬剤師に相談してください。
        </p>
        <ol className="mt-4 space-y-3">
          {topSavings.map((s, i) => (
            <li key={s.from.code} className="panel flex items-start gap-4">
              <span className="mt-0.5 w-8 shrink-0 text-center text-2xl font-bold text-gray-400" aria-hidden="true">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-sm md:text-base">
                    <p>
                      <Link href={OTC_SIMILAR_PATHS.item(s.from.code)} className="font-bold text-brand underline underline-offset-4">
                        {s.from.name}
                      </Link>
                      <span className="text-gray-600">（上乗せ +{yen(s.fromS)}）</span>
                    </p>
                    <p className="mt-1">
                      →
                      <Link href={OTC_SIMILAR_PATHS.item(s.to.code)} className="ml-1 font-bold text-brand underline underline-offset-4">
                        {s.to.name}
                      </Link>
                      <span className="text-gray-600">（上乗せ +{yen(s.toS)}）</span>
                    </p>
                    <p className="mt-1 text-gray-600">{s.qtyLabel}あたり</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs text-gray-600">減る額</div>
                    <div className="text-xl font-bold text-brand md:text-2xl">−{yen(s.saving)}</div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

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
            href={OTC_SIMILAR_PATHS.quick}
            className="flex min-h-[72px] items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 hover:border-brand"
          >
            <span className="block">
              <span className="block text-lg font-bold text-brand md:text-xl">よく出る薬の早見表</span>
              <span className="mt-1 block text-sm text-gray-600 md:text-base">ロキソニン・アレグラ・ヒルドイドなど21種</span>
            </span>
            <span className="shrink-0 text-2xl text-brand" aria-hidden="true">›</span>
          </Link>
        </div>
      </section>

      <section className="mt-12 rounded-2xl border-l-4 border-amber-400 bg-amber-50 p-5 text-base">
        <p className="font-bold">ご注意</p>
        <ul className="mt-2 list-disc space-y-2 pl-6">
          <li>対象かどうかは{OTC_SIMILAR_META.listStatus}に基づく当サイトの推計で、最終的には国の告示で確定します。</li>
          <li>目安量は比べるための仮の量です。実際の処方量・負担割合で金額は変わります。</li>
          <li>当サイトは市販薬への切替や薬の変更をすすめるものではありません。変更は医師・薬剤師に相談してください。</li>
        </ul>
      </section>

      <p className="mt-8 text-base md:text-lg">
        制度の説明は
        <Link href={OTC_SIMILAR_PATHS.hub} className="mx-1 font-bold text-brand underline underline-offset-4">こちら</Link>。
      </p>
    </div>
  );
}
