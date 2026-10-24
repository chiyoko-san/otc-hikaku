import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { ShareCard } from '@/components/ShareCard';
import { notFound } from 'next/navigation';
import { buildMetadata, buildBreadcrumbJsonLd, buildFaqJsonLd, SITE_URL } from '@/lib/seo';
import { getOtcSimilarByNo, OTC_SIMILAR_META } from '@/lib/otc-similar-77';
import {
  getOtcSimilarGroup,
  getOtcMatchesForNo,
  OTC_SIMILAR_PATHS,
} from '@/lib/otc-similar-data';
import {
  estimate,
  getAllItemCodes,
  getItemByCode,
  getItemsByNo,
  getYakkaDateLabel,
  quantityPresets,
  unitLabel,
  yen,
  unitPrice,
  unitSurcharge,
  priceLabel,
} from '@/lib/otc-similar-items';
import { getSwitchDrugsByOtcSimilarNo } from '@/lib/switch-data';

// 配置先: app/otc-similar/item/[code]/page.tsx  →  /otc-similar/item/<薬価基準収載医薬品コード>/
// 医療用品目ごとに1ページ（688件）。「ロキソニン錠60mg 上乗せ いくら」「〇〇 薬価」を受ける。

type Params = { code: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getAllItemCodes().map((code) => ({ code }));
}

export async function generateMetadata({ params }: { params: Params | Promise<Params> }): Promise<Metadata> {
  const { code } = await params;
  const item = getItemByCode(code);
  if (!item) return {};
  const unit = unitLabel(item.spec);
  return buildMetadata({
    title: `${item.name}の上乗せ料金はいくら？｜${unit}あたり+${yen(unitSurcharge(item))}（2027年3月〜）`,
    description: `${item.name}（${item.ingredient}、${item.maker}）は2027年3月からのOTC類似薬「上乗せ料金」の対象（厚労省案）。${priceLabel(item)}なので上乗せ額は+${yen(unitSurcharge(item))}／${unit}。処方量と負担割合別の金額、ジェネリックとの差、同じ成分の市販薬を掲載。`,
    path: OTC_SIMILAR_PATHS.item(item.code),
    type: 'article',
  });
}

export default async function OtcSimilarItemPage({ params }: { params: Params | Promise<Params> }) {
  const { code } = await params;
  const item = getItemByCode(code);
  if (!item) notFound();
  const ing = getOtcSimilarByNo(item.no);
  const group = ing ? getOtcSimilarGroup(ing.group) : null;
  const unit = unitLabel(item.spec);
  const presets = quantityPresets(item.spec);
  const typical = presets[1] ?? presets[0];
  const siblings = getItemsByNo(item.no)
    .filter((i) => i.code !== item.code)
    .sort((a, b) => unitPrice(a) - unitPrice(b))
    .slice(0, 10);
  const cheapest = getItemsByNo(item.no).reduce((m, i) => (unitPrice(i) < unitPrice(m) ? i : m), item);
  const otc = getOtcMatchesForNo(item.no, 6);
  const guides = getSwitchDrugsByOtcSimilarNo(item.no);
  const dateLabel = getYakkaDateLabel();
  const e3 = estimate(item, typical, 0.3);
  const e1 = estimate(item, typical, 0.1);

  const faqs = [
    {
      q: `${item.name}は上乗せ料金（OTC類似薬の特別料金）の対象ですか？`,
      a: `厚生労働省の案では対象です。成分「${item.ingredient}」は対象77成分（案）に含まれ、2027年3月から処方時に薬剤費の4分の1が上乗せされる見込みです。最終的な対象は国の告示で確定します。`,
    },
    {
      q: `${item.name}の上乗せ料金はいくらですか？`,
      a: `${priceLabel(item)}の4分の1で、${unit}あたり約${yen(unitSurcharge(item))}です。${typical}${unit.replace(/^1/, '')}なら上乗せ額は約${yen(e3.surcharge)}。3割負担の方は薬代が約${yen(e3.before)}から約${yen(e3.after)}（+約${yen(e3.diff)}）、1割負担の方は約${yen(e1.before)}から約${yen(e1.after)}（+約${yen(e1.diff)}）になります。診察料・調剤料は別です。`,
    },
    ...(cheapest.code !== item.code
      ? [{
          q: `ジェネリックに変えると上乗せ料金は減りますか？`,
          a: `同じ成分で薬価が最も安いのは${cheapest.name}（${priceLabel(cheapest)}、上乗せ+${yen(unitSurcharge(cheapest))}／${unitLabel(cheapest.spec)}）です。上乗せ額は薬価の4分の1なので、薬価が安い薬ほど上乗せも小さくなります。変更は医師・薬剤師に相談してください。`,
        }]
      : []),
    ...(otc.count > 0
      ? [{
          q: `${item.name}と同じ成分の市販薬はありますか？`,
          a: `${item.ingredient}を含む市販薬が${otc.count}件あります（${otc.items.slice(0, 3).map((m) => m.name).join('、')}など）。含有量・剤形・適応が異なる場合があるため、購入前に薬剤師・登録販売者に相談してください。`,
        }]
      : []),
  ];

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: '/' },
    { name: 'OTC類似薬の上乗せ料金', url: OTC_SIMILAR_PATHS.hub },
    ...(group ? [{ name: group.label, url: OTC_SIMILAR_PATHS.group(group.key) }] : []),
    ...(ing ? [{ name: ing.name, url: OTC_SIMILAR_PATHS.ingredient(ing.no) }] : []),
    { name: item.name, url: OTC_SIMILAR_PATHS.item(item.code) },
  ]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 text-lg leading-relaxed text-brand-ink md:px-6 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqJsonLd(faqs)) }} />

      <Breadcrumb
        items={[
          { name: 'ホーム', href: '/' },
          { name: '上乗せ料金', href: OTC_SIMILAR_PATHS.hub },
          ...(group ? [{ name: group.label, href: OTC_SIMILAR_PATHS.group(group.key) }] : []),
          ...(ing ? [{ name: ing.name, href: OTC_SIMILAR_PATHS.ingredient(ing.no) }] : []),
          { name: item.name },
        ]}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="inline-block rounded-md bg-alert px-2.5 py-1 text-sm font-bold text-white">上乗せ対象（案）</span>
        <span className="pill-muted">{item.route}</span>
        {item.kind === '先発' && <span className="pill-muted">先発品</span>}
        {item.kind === '後発' && <span className="pill-muted">ジェネリック</span>}
      </div>
      <h1 className="mt-3 text-2xl font-bold leading-snug md:text-4xl">
        {item.name}
        <span className="mt-2 block text-base font-normal text-gray-600 md:text-xl">上乗せ料金はいくら？（2027年3月から）</span>
      </h1>
      <p className="mt-3 text-sm text-gray-600 md:text-base">
        成分：{item.ingredient}　規格：{item.spec}　製造販売：{item.maker}
      </p>

      {/* 大きな数字 */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="panel">
          <div className="text-sm text-gray-600 md:text-base">薬価（{unit}あたり）</div>
          <div className="mt-1 text-3xl font-bold md:text-4xl">{yen(unitPrice(item))}</div>
          {unitPrice(item) !== item.price && (
            <div className="mt-1 text-sm text-gray-600">薬価基準では{item.spec}で{yen(item.price)}</div>
          )}
        </div>
        <div className="rounded-2xl bg-alert p-5 text-white">
          <div className="text-sm md:text-base">上乗せ額（{unit}あたり・薬価の4分の1）</div>
          <div className="mt-1 text-3xl font-bold md:text-4xl">+{yen(unitSurcharge(item))}</div>
        </div>
      </div>

      {/* 処方量別の表 */}
      <section className="mt-12">
        <h2 className="text-xl font-bold leading-snug md:text-2xl">処方量ごとの負担額（薬代の部分だけ）</h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-base md:text-lg">
            <thead className="bg-gray-50 text-sm text-gray-600 md:text-base">
              <tr>
                <th className="px-3 py-2 font-bold">数量</th>
                <th className="px-3 py-2 font-bold">上乗せ額</th>
                <th className="px-3 py-2 font-bold">3割の人</th>
                <th className="px-3 py-2 font-bold">1割の人</th>
              </tr>
            </thead>
            <tbody>
              {presets.map((q) => {
                const a = estimate(item, q, 0.3);
                const b = estimate(item, q, 0.1);
                return (
                  <tr key={q} className="border-t border-gray-200">
                    <td className="whitespace-nowrap px-3 py-2 font-bold">{q}{unit.replace(/^1/, '')}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-bold text-alert">+{yen(a.surcharge)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{yen(a.before)} → {yen(a.after)}<span className="ml-1 text-sm text-alert">（+{yen(a.diff)}）</span></td>
                    <td className="whitespace-nowrap px-3 py-2">{yen(b.before)} → {yen(b.after)}<span className="ml-1 text-sm text-alert">（+{yen(b.diff)}）</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-gray-600 md:text-base">
          これから＝上乗せ額＋残りの薬代×負担割合。診察料・調剤料などは別です。薬価は{dateLabel}時点。
        </p>
        <Link
          href={`${OTC_SIMILAR_PATHS.simulator}?item=${item.code}`}
          className="mt-5 flex min-h-[56px] items-center justify-center rounded-xl bg-alert px-6 py-3 text-lg font-bold text-white sm:inline-flex"
        >
          自分の量・負担割合で計算する
        </Link>
      </section>

      <ShareCard
        heading={`${item.name}を使っている人に知らせる`}
        lead="薬の名前と増える額が入った文章です。本人や家族に送ると、同じページが開きます。"
        message={
          `${item.name}（${item.ingredient}）は、2027年3月から病院でもらうと「上乗せ料金」がかかる薬です（厚労省案）。\n` +
          `${typical}${unit.replace(/^1/, '')}なら +約${yen(e3.surcharge)}。3割負担の薬代：${yen(e3.before)} → ${yen(e3.after)}`
        }
        url={`${SITE_URL}${OTC_SIMILAR_PATHS.item(item.code)}`}
        xText={`${item.name}、2027年3月から上乗せ料金の対象。${typical}${unit.replace(/^1/, '')}で +約${yen(e3.surcharge)}（薬価の4分の1）。自分の薬は対象？`}
        hashtags={['上乗せ料金', 'OTC類似薬']}
      />

      {/* ジェネリックなど */}
      {siblings.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold leading-snug md:text-2xl">同じ成分のほかの処方薬（安い順）</h2>
          <p className="mt-2 text-base text-gray-600">上乗せ額は薬価の4分の1なので、薬価が安い薬ほど上乗せも小さくなります。変更は医師・薬剤師に相談してください。</p>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-[520px] text-left text-base md:text-lg">
              <thead className="bg-gray-50 text-sm text-gray-600 md:text-base">
                <tr>
                  <th className="px-3 py-2 font-bold">処方薬</th>
                  <th className="px-3 py-2 font-bold">薬価</th>
                  <th className="px-3 py-2 font-bold">上乗せ額</th>
                </tr>
              </thead>
              <tbody>
                {siblings.map((s) => (
                  <tr key={s.code} className="border-t border-gray-200">
                    <td className="px-3 py-2">
                      <Link href={OTC_SIMILAR_PATHS.item(s.code)} className="font-bold text-brand underline underline-offset-4">{s.name}</Link>
                      <span className="ml-2 text-sm text-gray-600">{s.spec}{s.kind === '後発' ? '・ジェネリック' : s.kind === '先発' ? '・先発' : ''}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{yen(unitPrice(s))}<span className="text-sm text-gray-600">／{unitLabel(s.spec)}</span></td>
                    <td className="whitespace-nowrap px-3 py-2 font-bold text-alert">+{yen(unitSurcharge(s))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ing && (
            <p className="mt-3">
              <Link href={OTC_SIMILAR_PATHS.ingredient(ing.no)} className="text-base font-bold text-brand underline underline-offset-4 md:text-lg">
                {ing.name}の処方薬をすべて見る ›
              </Link>
            </p>
          )}
        </section>
      )}

      {/* 市販薬 */}
      <section className="mt-12">
        <h2 className="text-xl font-bold leading-snug md:text-2xl">同じ成分の市販薬</h2>
        {otc.count === 0 ? (
          <p className="mt-3 text-base md:text-lg">当サイトのデータでは、同じ成分の市販薬が見つかりませんでした。薬局で薬剤師に相談してください。</p>
        ) : (
          <>
            <p className="mt-3 text-base md:text-lg">{item.ingredient}を含む市販薬は{otc.count}件あります。含有量・剤形・適応が処方薬と異なる場合があります。</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {otc.items.map((m) => (
                <li key={m.slug}>
                  <Link href={`/medicines/${m.slug}/`} className="inline-flex min-h-[44px] items-center rounded-full border border-brand bg-brand-light px-4 py-2 text-base font-bold text-brand">
                    {m.name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        {guides.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {guides.map((g) => (
              <Link key={g.slug} href={`/switch/${g.slug}/`} className="inline-flex min-h-[48px] items-center rounded-xl bg-brand px-4 py-2.5 text-base font-bold text-white">
                {g.rxName}を市販薬に替えるときの注意
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* FAQ */}
      <section className="mt-12">
        <h2 className="text-xl font-bold leading-snug md:text-2xl">よくある質問</h2>
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
          <li>こども、がん・難病の方、収入の少ない方、入院中の方、医師が長期使用を必要と判断した方などは上乗せ料金がかからない方向で検討されています。</li>
          <li>当サイトは市販薬への切替をすすめるものではありません。薬の変更は医師・薬剤師に相談してください。</li>
        </ul>
      </section>

      <p className="mt-8 text-base md:text-lg">
        制度の説明は<Link href={OTC_SIMILAR_PATHS.hub} className="font-bold text-brand underline underline-offset-4">こちら</Link>。
        お薬手帳を撮って全部まとめて調べるなら<Link href={OTC_SIMILAR_PATHS.photo} className="font-bold text-brand underline underline-offset-4">撮るだけ</Link>。
      </p>
    </div>
  );
}
