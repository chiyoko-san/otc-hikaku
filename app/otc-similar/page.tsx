import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata, buildBreadcrumbJsonLd, buildFaqJsonLd } from '@/lib/seo';
import { getEnrichedMedicines } from '@/lib/medicines';
import { normalizeIngredientName } from '@/lib/slug';
import { SWITCH_DRUGS } from '@/lib/switch-data';
import {
  OTC_SIMILAR_77,
  OTC_SIMILAR_GROUPS,
  OTC_SIMILAR_META,
  matchesOtcSimilar,
} from '@/lib/otc-similar-77';
import OtcSimilarFinder, {
  type FinderName,
  type FinderRow,
} from './OtcSimilarFinder';

// 配置先: app/otc-similar/page.tsx  →  https://www.kusuri-compass.com/otc-similar/
// 想定読者: 60〜80代。医療用語より薬の名前、成分より「対象かどうか」「いくら増えるか」を先に。

const PATH = '/otc-similar/';

export const metadata: Metadata = buildMetadata({
  title: 'OTC類似薬「特別料金」対象77成分一覧｜2027年3月から薬剤費の1/4を追加負担',
  description:
    'ロキソニン・アレグラ・ヒルドイドなど、2027年3月から処方時に薬剤費の4分の1が上乗せされるOTC類似薬77成分（厚労省案）を、薬の名前から探せる一覧に。同じ成分の市販薬も成分データベースから表示します。',
  path: PATH,
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
    a: 'お薬手帳か薬袋に書いてある薬の名前で、このページの「名前で探す」から探せます。一覧は厚生労働省の案で、最終的な対象は国の告示で決まります。',
  },
  {
    q: '市販薬に替えたほうがいいですか？',
    a: 'このページは判断材料を提供するもので、切替をすすめるものではありません。続けて使っている薬は、自己判断で中止・変更せず、医師や薬剤師に相談してください。',
  },
];

// 頭文字の判定（あ〜わ行 / 英）。漢字始まりの名前は個別に指定する
const KANA_OVERRIDES: Record<string, string> = {
  亜鉛華軟膏: 'あ',
  重曹: 'さ',
  白色ワセリン: 'は',
  '冷感湿布（MS冷シップなど）': 'ら',
  '葛根湯(医療用)': 'か',
};
function kanaRow(label: string): string {
  if (KANA_OVERRIDES[label]) return KANA_OVERRIDES[label];
  const c = label.charCodeAt(0);
  const ranges: [number, number, string][] = [
    [0x30a1, 0x30aa, 'あ'], [0x30f4, 0x30f4, 'あ'],
    [0x30ab, 0x30b4, 'か'],
    [0x30b5, 0x30be, 'さ'],
    [0x30bf, 0x30c9, 'た'],
    [0x30ca, 0x30ce, 'な'],
    [0x30cf, 0x30dd, 'は'],
    [0x30de, 0x30e2, 'ま'],
    [0x30e3, 0x30e8, 'や'],
    [0x30e9, 0x30ed, 'ら'],
    [0x30ef, 0x30f3, 'わ'],
  ];
  const hit = ranges.find(([lo, hi]) => c >= lo && c <= hi);
  return hit ? hit[2] : '英';
}

function buildData(): { rows: FinderRow[]; names: FinderName[] } {
  const meds = getEnrichedMedicines();
  const normed = meds.map((m) => ({
    m,
    ings: (m.ings || []).map((i) => normalizeIngredientName(i)),
  }));

  const rows: FinderRow[] = OTC_SIMILAR_77.map((ing) => {
    const otc = normed.filter(({ ings }) => matchesOtcSimilar(ing, ings)).map((x) => x.m);
    const guides = SWITCH_DRUGS.filter((d) => d.otcSimilarNo === ing.no).map((d) => ({
      slug: d.slug,
      rxName: d.rxName,
    }));
    return {
      no: ing.no,
      name: ing.name,
      use: ing.use,
      group: ing.group,
      rxExamples: ing.rxExamples ?? [],
      otcCount: otc.length,
      otcTop: otc.slice(0, 3).map((m) => ({ name: m.name, slug: m.slug })),
      guides,
    };
  });

  // 名前さくいん: 対象成分の代表薬 ＋ 切替ガイドにある対象外の薬
  const names: FinderName[] = [];
  for (const ing of OTC_SIMILAR_77) {
    const guide = SWITCH_DRUGS.find((d) => d.otcSimilarNo === ing.no);
    for (const label of ing.rxExamples ?? []) {
      names.push({ label, kana: kanaRow(label), target: true, no: ing.no, guideSlug: guide?.slug });
    }
  }
  for (const d of SWITCH_DRUGS) {
    if (d.otcSimilarNo == null) {
      names.push({ label: d.rxName, kana: kanaRow(d.rxName), target: false, no: null, guideSlug: d.slug });
    }
  }
  names.sort((a, b) => a.label.localeCompare(b.label, 'ja'));

  return { rows, names };
}

export default function OtcSimilarPage() {
  const { rows, names } = buildData();
  const notTargets = SWITCH_DRUGS.filter((d) => d.otcSimilarNo == null);

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: '/' },
    { name: '処方薬から探す', url: '/switch/' },
    { name: 'OTC類似薬 上乗せ料金の対象77成分', url: PATH },
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
        <span>上乗せ料金の対象77成分</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold leading-snug md:text-4xl">
        病院でもらう薬の一部に、「上乗せ料金」が始まります
      </h1>
      <p className="mt-3 text-xl leading-relaxed">
        <strong>{OTC_SIMILAR_META.effectiveLabel}</strong>から。
        市販薬と同じ成分の処方薬（OTC類似薬）が対象で、いつもの負担に加えて
        <strong>薬代の4分の1</strong>を追加で支払います。
      </p>
      <p className="mt-2 text-base text-gray-700">
        対象は厚生労働省の案で{OTC_SIMILAR_META.ingredientCount}成分・{OTC_SIMILAR_META.itemCountLabel}。
        ロキソニン、アレグラ、ヒルドイドなど、よく処方される薬が含まれています。
      </p>

      {/* 目次: このページは3ステップ */}
      <ol className="mt-6 grid gap-3 sm:grid-cols-3">
        <li>
          <a href="#find-by-name" className="block min-h-[64px] rounded-xl bg-[#1f4d3a] px-4 py-3 text-xl font-bold text-white">
            1. 自分の薬は対象？
          </a>
        </li>
        <li>
          <a href="#how-much" className="block min-h-[64px] rounded-xl bg-[#1f4d3a] px-4 py-3 text-xl font-bold text-white">
            2. いくら増える？
          </a>
        </li>
        <li>
          <a href="#find-by-use" className="block min-h-[64px] rounded-xl bg-[#1f4d3a] px-4 py-3 text-xl font-bold text-white">
            3. 市販薬に替えるなら
          </a>
        </li>
      </ol>

      {/* いくら増える？ */}
      <section id="how-much" className="mt-12 scroll-mt-24">
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

      {/* 名前で探す・用途で探す（クライアント側） */}
      <OtcSimilarFinder rows={rows} groups={OTC_SIMILAR_GROUPS} names={names} />

      {/* よく聞かれる対象外の薬 */}
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
          <li>この一覧は{OTC_SIMILAR_META.listStatus}です。最終的な対象は国の告示で決まります。</li>
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
