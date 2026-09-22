import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata, buildBreadcrumbJsonLd, buildFaqJsonLd } from '@/lib/seo';
import { SWITCH_DRUGS } from '@/lib/switch-data';
import { OTC_SIMILAR_GROUPS, OTC_SIMILAR_META } from '@/lib/otc-similar-77';
import { OTC_SIMILAR_PATHS } from '@/lib/otc-similar-data';
import { estimate, findItemByName, getYakkaDateLabel, yen } from '@/lib/otc-similar-items';

// 配置先: app/otc-similar/page.tsx  →  https://www.kusuri-compass.com/otc-similar/
// 想定読者: 60〜80代。このページは「制度の説明」と「探し方の入口」だけを持ち、
// 一覧そのものは /otc-similar/name/ と /otc-similar/use/<用途>/ に分けている。

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

export default function OtcSimilarHubPage() {
  const notTargets = SWITCH_DRUGS.filter((d) => d.otcSimilarNo == null);
  const examples = REAL_EXAMPLES.map((e) => {
    const item = findItemByName(e.prefix);
    return item ? { ...e, item, est: estimate(item, e.qty, 0.3) } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: '/' },
    { name: '処方薬から探す', url: '/switch/' },
    { name: 'OTC類似薬の上乗せ料金', url: OTC_SIMILAR_PATHS.hub },
  ]);
  const faq = buildFaqJsonLd(FAQS);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-lg leading-relaxed text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />

      <nav className="text-base text-gray-700" aria-label="パンくず">
        <Link href="/" className="underline">ホーム</Link>
        <span className="mx-1">/</span>
        <Link href="/switch/" className="underline">処方薬から探す</Link>
        <span className="mx-1">/</span>
        <span>上乗せ料金</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold leading-snug md:text-4xl">
        病院でもらう薬の一部に、「上乗せ料金」が始まります
      </h1>
      <p className="mt-3 text-xl leading-relaxed">
        <strong>{OTC_SIMILAR_META.effectiveLabel}</strong>から。市販薬と同じ成分の処方薬（OTC類似薬）が対象で、
        いつもの負担に加えて<strong>薬代の4分の1</strong>を追加で支払います。
      </p>

      {/* なぜ？ */}
      <section className="mt-8">
        <h2 className="text-2xl font-bold leading-snug md:text-3xl">なぜ上乗せ料金がかかるの？</h2>
        <ul className="mt-4 space-y-4">
          <li className="rounded-xl border-2 border-gray-300 bg-white p-5">
            <p className="text-xl font-bold">同じ薬なのに、払う人と払わない人がいたから</p>
            <p className="mt-2">
              たとえばロキソニンやアレグラは、薬局では自分のお金で買えます。ところが病院で処方してもらうと、
              薬代の7〜9割はみんなが払っている保険料でまかなわれます。
              「同じ薬なのに不公平」という指摘を受けて、処方でもらう場合に一部を上乗せすることになりました。
            </p>
          </li>
          <li className="rounded-xl border-2 border-gray-300 bg-white p-5">
            <p className="text-xl font-bold">保険料を払う働く世代の負担を軽くするため</p>
            <p className="mt-2">
              国は、この仕組みで医療費が年に約900億円減ると見込んでいます。
            </p>
          </li>
          <li className="rounded-xl border-2 border-gray-300 bg-white p-5">
            <p className="text-xl font-bold">対象になるのは「市販薬とまったく同じ成分・同じ使い方」の薬だけ</p>
            <p className="mt-2">
              厚生労働省の案で{OTC_SIMILAR_META.ingredientCount}成分・{OTC_SIMILAR_META.itemCountLabel}。
              診察そのものや、それ以外の薬の負担は変わりません。
            </p>
          </li>
        </ul>
      </section>

      {/* 探す入口 */}
      <section className="mt-10">
        <h2 className="text-2xl font-bold leading-snug md:text-3xl">自分の薬が対象か調べる</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link
            href={OTC_SIMILAR_PATHS.name}
            className="block rounded-xl bg-[#1f4d3a] px-5 py-5 text-white"
          >
            <span className="block text-2xl font-bold">薬の名前で探す</span>
            <span className="mt-1 block text-base">お薬手帳や薬袋の名前から。頭文字を押すだけ</span>
          </Link>
          <Link
            href={OTC_SIMILAR_PATHS.use}
            className="block rounded-xl border-2 border-[#1f4d3a] bg-white px-5 py-5 text-[#1f4d3a]"
          >
            <span className="block text-2xl font-bold">用途で探す</span>
            <span className="mt-1 block text-base text-gray-800">花粉症、湿布、保湿剤など12の用途から</span>
          </Link>
        </div>
        <ul className="mt-4 flex flex-wrap gap-2">
          {OTC_SIMILAR_GROUPS.map((g) => (
            <li key={g.key}>
              <Link
                href={OTC_SIMILAR_PATHS.group(g.key)}
                className="inline-block min-h-[48px] rounded-lg border-2 border-gray-400 bg-white px-4 py-2.5 text-lg font-bold text-gray-900 hover:bg-[#e8f3ec]"
              >
                {g.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* いくら増える？ */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold leading-snug md:text-3xl">いくら増える？</h2>
        <p className="mt-2">薬代（薬そのものの値段）が1,000円の薬の場合。</p>
        <div className="mt-4 overflow-hidden rounded-xl border-2 border-gray-300">
          <table className="w-full text-left text-xl">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 font-bold">窓口負担</th>
                <th className="px-4 py-3 font-bold">これまで</th>
                <th className="px-4 py-3 font-bold">これから</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t-2 border-gray-300">
                <td className="px-4 py-4">3割の人</td>
                <td className="px-4 py-4">300円</td>
                <td className="px-4 py-4 font-bold">約480円<span className="ml-2 text-lg font-normal text-[#b42318]">（+約180円）</span></td>
              </tr>
              <tr className="border-t-2 border-gray-300">
                <td className="px-4 py-4">2割の人</td>
                <td className="px-4 py-4">200円</td>
                <td className="px-4 py-4 font-bold">400円<span className="ml-2 text-lg font-normal text-[#b42318]">（+200円）</span></td>
              </tr>
              <tr className="border-t-2 border-gray-300">
                <td className="px-4 py-4">1割の人</td>
                <td className="px-4 py-4">100円</td>
                <td className="px-4 py-4 font-bold">約330円<span className="ml-2 text-lg font-normal text-[#b42318]">（+約230円）</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-base text-gray-700">
          これから＝上乗せ料金250円（薬代の4分の1）＋残り750円のいつもの負担分。診察料や調剤料は変わりません。
        </p>

        {examples.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xl font-bold">実際の薬だといくら？（3割負担の場合）</h3>
            <div className="mt-2 overflow-x-auto rounded-xl border-2 border-gray-300">
              <table className="w-full min-w-[520px] text-left text-lg">
                <thead className="bg-gray-100 text-base">
                  <tr>
                    <th className="px-3 py-2 font-bold">薬と量</th>
                    <th className="px-3 py-2 font-bold">これまで</th>
                    <th className="px-3 py-2 font-bold">これから</th>
                    <th className="px-3 py-2 font-bold text-[#b42318]">増える額</th>
                  </tr>
                </thead>
                <tbody>
                  {examples.map((e) => (
                    <tr key={e.prefix} className="border-t-2 border-gray-200 align-top">
                      <td className="px-3 py-2">
                        <div className="font-bold">{e.label}</div>
                        <div className="text-base text-gray-600">{e.qtyLabel}・薬価{yen(e.item.price)}×{e.qty}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">約{yen(e.est.before)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-bold">約{yen(e.est.after)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-bold text-[#b42318]">+約{yen(e.est.diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-base text-gray-700">
              薬価は厚生労働省の薬価基準収載品目リスト（{getYakkaDateLabel()}時点）。数量は一般的な処方量の目安で、実際の処方量・薬価・負担割合により変わります。ジェネリックは薬価が安いぶん上乗せ額も小さくなります。
            </p>
          </div>
        )}

        <div className="mt-6 rounded-xl border-2 border-[#1f4d3a] bg-[#f3f9f5] p-5">
          <h3 className="text-xl font-bold">上乗せ料金がかからない人（検討中）</h3>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>お子さん</li>
            <li>がん・難病など、続けて治療が必要な病気のある方</li>
            <li>収入の少ない方</li>
            <li>入院中の方</li>
            <li>医師が「長く使う必要がある」と判断した方</li>
          </ul>
          <p className="mt-3 text-base text-gray-700">自分が当てはまるかは、受診先の窓口や薬局で確認してください。</p>
        </div>
      </section>

      {/* 対象外の薬 */}
      {notTargets.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold leading-snug md:text-3xl">よく聞かれる「対象外」の薬</h2>
          <p className="mt-2">次の薬は、今回の77成分の案には入っていません（上乗せ料金はかかりません）。</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {notTargets.map((d) => (
              <li key={d.slug} className="rounded-xl border-2 border-gray-300 bg-white p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-block rounded-md border-2 border-gray-500 bg-white px-2.5 py-1 text-base font-bold text-gray-800">対象外</span>
                  <span className="text-xl font-bold">{d.rxName}</span>
                </div>
                <p className="mt-1 text-base text-gray-700">成分：{d.genericName}</p>
                <Link href={`/switch/${d.slug}/`} className="mt-3 inline-block text-lg font-bold text-[#1f4d3a] underline">
                  同じ成分の市販薬を見る
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 注意 */}
      <section className="mt-12 rounded-xl bg-[#fff4d6] p-5">
        <h2 className="text-xl font-bold">ご注意</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>対象の一覧は{OTC_SIMILAR_META.listStatus}です。最終的な対象は国の告示で決まります。</li>
          <li>当サイトは、処方薬から市販薬への切替をすすめるものではありません。</li>
          <li>続けて使っている薬は、自己判断でやめたり変えたりせず、医師・薬剤師に相談してください。</li>
        </ul>
      </section>

      {/* FAQ */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold leading-snug md:text-3xl">よくある質問</h2>
        <dl className="mt-4 divide-y-2 divide-gray-200">
          {FAQS.map((f) => (
            <div key={f.q} className="py-4">
              <dt className="text-xl font-bold">Q. {f.q}</dt>
              <dd className="mt-2">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 出典 */}
      <section className="mt-12 text-base text-gray-700">
        <h2 className="text-xl font-bold text-gray-900">出典（厚生労働省）</h2>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          {OTC_SIMILAR_META.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
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
