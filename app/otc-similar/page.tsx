import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata, buildBreadcrumbJsonLd, buildFaqJsonLd } from '@/lib/seo';
import { SWITCH_DRUGS } from '@/lib/switch-data';
import { OTC_SIMILAR_GROUPS, OTC_SIMILAR_META } from '@/lib/otc-similar-77';
import { OTC_SIMILAR_PATHS } from '@/lib/otc-similar-data';
import { estimate, findItemByName, getYakkaDateLabel, yen } from '@/lib/otc-similar-items';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

// 配置先: app/otc-similar/page.tsx  →  https://www.kusuri-compass.com/otc-similar/
// 想定読者: 60〜80代。このページは「制度の説明」と「探し方の入口」だけを持ち、
// 一覧そのものは /otc-similar/name/ と /otc-similar/use/<用途>/ に分けている。
//
// 2026-10 スマホ向け見直しの方針(他の /otc-similar/ 配下もこれに揃える):
//   - 色は「本文の墨色 + 緑(リンク・入口) + 赤(撮るだけCTAと増える額)」の3つだけ
//   - 太字は見出しと、覚えてほしい2つの事実(いつから・いくら)だけ
//   - 囲みは白地に薄いグレー1本線。濃い枠線・色文字の囲みは使わない
//   - 節と節の間は mt-12、囲みの内側は p-5 で統一

export const metadata: Metadata = buildMetadata({
  title: 'OTC類似薬「特別料金」とは｜2027年3月から病院の薬に上乗せ料金、対象77成分の探し方',
  description:
    'ロキソニン・アレグラ・ヒルドイドなど、2027年3月から処方時に薬代の4分の1が上乗せされるOTC類似薬77成分（厚労省案）。なぜ始まるのか、いくら増えるのか、自分の薬が対象かを薬の名前から調べられます。',
  path: OTC_SIMILAR_PATHS.hub,
});

const FAQS = [
  {
    q: '病院の薬に保険が使えなくなるのですか？',
    a: 'いいえ。保険は今までどおり使えます。対象の薬だけ、いつもの負担（1〜3割）に加えて薬代の4分の1を上乗せで支払う仕組みです。診察料や調剤料は変わりません。',
  },
  {
    q: 'いつから始まりますか？',
    a: `${OTC_SIMILAR_META.effectiveLabel}の予定です。法律（改正健康保険法）は2026年5月に成立し、細かい決まりは厚生労働省で検討が続いています。`,
  },
  {
    q: '上乗せ料金がかからない人はいますか？',
    a: 'お子さん、がん・難病などで継続治療が必要な方、収入の少ない方、入院中の方、医師が長く使う必要があると判断した方などは、上乗せ料金を求めない方向で検討されています。該当するかは受診先で確認してください。',
  },
  {
    q: '自分の薬が対象かどうか、どうやって調べますか？',
    a: 'お薬手帳か薬袋に書いてある薬の名前で、「薬の名前で探す」ページから探せます。一覧は厚生労働省の案で、最終的な対象は国の告示で決まります。',
  },
  {
    q: '市販薬に替えたほうがいいですか？',
    a: 'このサイトは判断材料を提供するもので、切替をすすめるものではありません。続けて使っている薬は、自己判断で中止・変更せず、医師や薬剤師に相談してください。',
  },
];

// 実際の薬での例（品名の前方一致で薬価データから引く。数量は一般的な処方量の目安）
const REAL_EXAMPLES: { prefix: string; label: string; qty: number; qtyLabel: string }[] = [
  { prefix: 'ロキソニン錠60mg', label: 'ロキソニン錠60mg', qty: 42, qtyLabel: '1日3錠×14日（42錠）' },
  { prefix: 'アレグラ錠60mg', label: 'アレグラ錠60mg', qty: 60, qtyLabel: '1日2錠×30日（60錠）' },
  { prefix: 'ヒルドイドソフト軟膏0.3%', label: 'ヒルドイドソフト軟膏', qty: 25, qtyLabel: '25gチューブ1本' },
  { prefix: 'ロキソニンテープ100mg', label: 'ロキソニンテープ100mg', qty: 70, qtyLabel: '70枚' },
];

// 「探す入口」の白いカード(緑の見出し + 右端の矢印)。赤い主役カードは別
function EntryCard({ href, title, note }: { href: string; title: string; note: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-[72px] items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 hover:border-brand"
    >
      <span className="block">
        <span className="block text-lg font-bold text-brand md:text-xl">{title}</span>
        <span className="mt-1 block text-sm text-gray-600 md:text-base">{note}</span>
      </span>
      <span className="shrink-0 text-2xl text-brand" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

export default function OtcSimilarHubPage() {
  const notTargets = SWITCH_DRUGS.filter((d) => d.otcSimilarNo == null);
  const examples = REAL_EXAMPLES.map((e) => {
    const item = findItemByName(e.prefix);
    return item ? { ...e, item, est: estimate(item, e.qty, 0.3) } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const breadcrumbs = [
    { name: 'ホーム', href: '/' },
    { name: '処方薬から探す', href: '/switch/' },
    { name: '上乗せ料金' },
  ];
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: '/' },
    { name: '処方薬から探す', url: '/switch/' },
    { name: 'OTC類似薬の上乗せ料金', url: OTC_SIMILAR_PATHS.hub },
  ]);
  const faq = buildFaqJsonLd(FAQS);

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 text-lg leading-relaxed text-brand-ink md:px-6 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />

      <Breadcrumb items={breadcrumbs} />

      {/* 見出しと、覚えてほしい2つの事実 */}
      <h1 className="mt-2 text-2xl font-bold leading-snug md:text-4xl">
        病院でもらう薬の一部に、「上乗せ料金」が始まります
      </h1>
      <p className="mt-5 md:text-xl">
        <strong>{OTC_SIMILAR_META.effectiveLabel}</strong>から。市販薬と同じ成分の処方薬（OTC類似薬）が対象で、
        いつもの負担に加えて<strong>薬代の4分の1</strong>を追加で支払います。
      </p>
      <p className="mt-5 rounded-xl border-l-4 border-brand bg-brand-light px-5 py-4 md:text-xl">
        保険は今までどおり使えます。薬がもらえなくなるわけではありません。
      </p>

      {/* なぜ？ */}
      <section className="mt-12">
        <h2 className="text-xl font-bold md:text-2xl">なぜ上乗せ料金がかかるの？</h2>
        <ul className="mt-5 space-y-4">
          <li className="panel">
            <p className="font-bold md:text-xl">同じ薬なのに、払う人と払わない人がいたから</p>
            <p className="mt-3 text-base md:text-lg">
              たとえばロキソニンやアレグラは、薬局では自分のお金で買えます。ところが病院で処方してもらうと、
              薬代の7〜9割はみんなが払っている保険料でまかなわれます。
              「同じ薬なのに不公平」という指摘を受けて、処方でもらう場合に一部を上乗せすることになりました。
            </p>
          </li>
          <li className="panel">
            <p className="font-bold md:text-xl">保険料を払う働く世代の負担を軽くするため</p>
            <p className="mt-3 text-base md:text-lg">
              国は、この仕組みで医療費が年に約900億円減ると見込んでいます。
            </p>
          </li>
          <li className="panel">
            <p className="font-bold md:text-xl">対象になるのは「市販薬とまったく同じ成分・同じ使い方」の薬だけ</p>
            <p className="mt-3 text-base md:text-lg">
              厚生労働省の案で{OTC_SIMILAR_META.ingredientCount}成分・{OTC_SIMILAR_META.itemCountLabel}。
              診察そのものや、それ以外の薬の負担は変わりません。
            </p>
          </li>
        </ul>
      </section>

      {/* 探す入口 */}
      <section className="mt-12">
        <h2 className="text-xl font-bold md:text-2xl">自分の薬が対象か調べる</h2>

        {/* 主役: 撮るだけ。このページで赤を塗るのはここだけ */}
        <Link
          href={OTC_SIMILAR_PATHS.photo}
          className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-alert px-5 py-5 text-white"
        >
          <span className="block">
            <span className="block text-xl font-bold md:text-2xl">お薬手帳を撮るだけ</span>
            <span className="mt-1 block text-sm md:text-base">写真1枚で、対象の薬といくら増えるかが全部出ます</span>
          </span>
          <span className="shrink-0 text-2xl" aria-hidden="true">
            ›
          </span>
        </Link>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <EntryCard href={OTC_SIMILAR_PATHS.simulator} title="いくら増える？" note="薬の名前と量を入れると金額が出ます" />
          <EntryCard href={OTC_SIMILAR_PATHS.name} title="薬の名前で探す" note="お薬手帳や薬袋の名前から。頭文字を押すだけ" />
          <EntryCard href={OTC_SIMILAR_PATHS.use} title="用途で探す" note="花粉症、湿布、保湿剤など12の用途から" />
        </div>

        <p className="mt-6 text-base text-gray-600">用途から直接えらぶ</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {OTC_SIMILAR_GROUPS.map((g) => (
            <li key={g.key}>
              <Link
                href={OTC_SIMILAR_PATHS.group(g.key)}
                className="inline-flex min-h-[44px] items-center rounded-full border border-gray-300 bg-white px-4 py-2 text-base text-brand-ink hover:border-brand hover:text-brand"
              >
                {g.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* いくら増える？ */}
      <section className="mt-12">
        <h2 className="text-xl font-bold md:text-2xl">いくら増える？</h2>
        <p className="mt-3 text-base md:text-lg">薬代（薬そのものの値段）が1,000円の薬の場合。</p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-left text-base md:text-lg">
            <thead className="bg-gray-50 text-sm text-gray-600 md:text-base">
              <tr>
                <th className="px-4 py-3 font-bold">窓口負担</th>
                <th className="px-4 py-3 font-bold">これまで</th>
                <th className="px-4 py-3 font-bold">これから</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-200">
                <td className="px-4 py-4">3割の人</td>
                <td className="px-4 py-4">300円</td>
                <td className="px-4 py-4">
                  <span className="font-bold">約480円</span>
                  <span className="ml-2 whitespace-nowrap text-sm text-alert md:text-base">+約180円</span>
                </td>
              </tr>
              <tr className="border-t border-gray-200">
                <td className="px-4 py-4">2割の人</td>
                <td className="px-4 py-4">200円</td>
                <td className="px-4 py-4">
                  <span className="font-bold">400円</span>
                  <span className="ml-2 whitespace-nowrap text-sm text-alert md:text-base">+200円</span>
                </td>
              </tr>
              <tr className="border-t border-gray-200">
                <td className="px-4 py-4">1割の人</td>
                <td className="px-4 py-4">100円</td>
                <td className="px-4 py-4">
                  <span className="font-bold">約330円</span>
                  <span className="ml-2 whitespace-nowrap text-sm text-alert md:text-base">+約230円</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-gray-600 md:text-base">
          これから＝上乗せ料金250円（薬代の4分の1）＋残り750円のいつもの負担分。診察料や調剤料は変わりません。
        </p>
        <Link
          href={OTC_SIMILAR_PATHS.simulator}
          className="mt-5 flex min-h-[56px] items-center justify-center rounded-xl border-2 border-brand bg-white px-6 py-3 text-lg font-bold text-brand sm:inline-flex"
        >
          自分の薬と量で計算する
        </Link>

        {examples.length > 0 && (
          <div className="mt-10">
            <h3 className="font-bold md:text-xl">実際の薬だといくら？（3割負担の場合）</h3>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
              <table className="w-full min-w-[520px] text-left text-base md:text-lg">
                <thead className="bg-gray-50 text-sm text-gray-600 md:text-base">
                  <tr>
                    <th className="px-4 py-3 font-bold">薬と量</th>
                    <th className="px-4 py-3 font-bold">これまで</th>
                    <th className="px-4 py-3 font-bold">これから</th>
                    <th className="px-4 py-3 font-bold">増える額</th>
                  </tr>
                </thead>
                <tbody>
                  {examples.map((e) => (
                    <tr key={e.prefix} className="border-t border-gray-200 align-top">
                      <td className="px-4 py-3">
                        <div className="font-bold">{e.label}</div>
                        <div className="text-sm text-gray-600">{e.qtyLabel}・薬価{yen(e.item.price)}×{e.qty}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">約{yen(e.est.before)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-bold">約{yen(e.est.after)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-bold text-alert">+約{yen(e.est.diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-gray-600 md:text-base">
              薬価は厚生労働省の薬価基準収載品目リスト（{getYakkaDateLabel()}時点）。数量は一般的な処方量の目安で、実際の処方量・薬価・負担割合により変わります。ジェネリックは薬価が安いぶん上乗せ額も小さくなります。
            </p>
          </div>
        )}

        <div className="panel mt-10">
          <h3 className="font-bold md:text-xl">上乗せ料金がかからない人（検討中）</h3>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-base md:text-lg">
            <li>お子さん</li>
            <li>がん・難病など、続けて治療が必要な病気のある方</li>
            <li>収入の少ない方</li>
            <li>入院中の方</li>
            <li>医師が「長く使う必要がある」と判断した方</li>
          </ul>
          <p className="mt-3 text-sm text-gray-600 md:text-base">自分が当てはまるかは、受診先の窓口や薬局で確認してください。</p>
        </div>
      </section>

      {/* 対象外の薬 */}
      {notTargets.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold md:text-2xl">よく聞かれる「対象外」の薬</h2>
          <p className="mt-3 text-base md:text-lg">次の薬は、今回の77成分の案には入っていません（上乗せ料金はかかりません）。</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {notTargets.map((d) => (
              <li key={d.slug} className="panel">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="pill-muted text-sm">対象外</span>
                  <span className="font-bold md:text-xl">{d.rxName}</span>
                </div>
                <p className="mt-1 text-sm text-gray-600 md:text-base">成分：{d.genericName}</p>
                <Link href={`/switch/${d.slug}/`} className="mt-3 inline-block text-base font-bold text-brand underline underline-offset-4 md:text-lg">
                  同じ成分の市販薬を見る ›
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 注意 */}
      <section className="mt-12 rounded-2xl border-l-4 border-amber-400 bg-amber-50 p-5">
        <h2 className="text-xl font-bold">ご注意</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-base md:text-lg">
          <li>対象の一覧は{OTC_SIMILAR_META.listStatus}です。最終的な対象は国の告示で決まります。</li>
          <li>当サイトは、処方薬から市販薬への切替をすすめるものではありません。</li>
          <li>続けて使っている薬は、自己判断でやめたり変えたりせず、医師・薬剤師に相談してください。</li>
        </ul>
      </section>

      {/* FAQ */}
      <section className="mt-12">
        <h2 className="text-xl font-bold md:text-2xl">よくある質問</h2>
        <dl className="mt-3 divide-y divide-gray-200">
          {FAQS.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="font-bold md:text-xl">Q. {f.q}</dt>
              <dd className="mt-2 text-base md:text-lg">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 薬局向け */}
      <section className="panel mt-12">
        <h2 className="text-xl font-bold">薬局・医療機関の方へ</h2>
        <p className="mt-2 text-base md:text-lg">
          患者さんへの説明に使えるA4 POP（薬局名入り・QRコード付き）と、対象77成分の早見表を無料で印刷できます。
        </p>
        <Link href={OTC_SIMILAR_PATHS.pharmacy} className="mt-3 inline-block text-base font-bold text-brand underline underline-offset-4 md:text-lg">
          説明キットを印刷する ›
        </Link>
      </section>

      {/* 出典 */}
      <section className="mt-12 text-sm text-gray-600 md:text-base">
        <h2 className="text-lg font-bold text-brand-ink">出典（厚生労働省）</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          {OTC_SIMILAR_META.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4">
          当ページは厚生労働省の公開資料とPMDA公開情報を元に整理しています。市販薬を使うときは添付文書を確認し、薬剤師・登録販売者に相談してください。本サイトは医療行為の代替を目的としていません。
        </p>
      </section>
    </div>
  );
}
