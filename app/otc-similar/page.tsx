import type { Metadata } from 'next';
import Link from 'next/link';
import {
  buildMetadata,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
} from '@/lib/seo';
import { getEnrichedMedicines } from '@/lib/medicines';
import { normalizeIngredientName } from '@/lib/slug';
import { SWITCH_DRUGS } from '@/lib/switch-data';
import {
  OTC_SIMILAR_77,
  OTC_SIMILAR_GROUPS,
  OTC_SIMILAR_META,
  matchesOtcSimilar,
  type OtcSimilarIngredient,
} from '@/lib/otc-similar-77';
import type { Medicine } from '@/types';

// 配置先: app/otc-similar/page.tsx  →  https://www.kusuri-compass.com/otc-similar/

const PATH = '/otc-similar/';
const TITLE =
  'OTC類似薬「特別料金」対象77成分一覧｜2027年3月から薬剤費の1/4を追加負担';
const DESCRIPTION =
  'ロキソニン・アレグラ・ヒルドイドなど、2027年3月から処方時に薬剤費の4分の1が上乗せされるOTC類似薬77成分（厚労省案）を一覧化。各成分について同じ成分の市販薬を成分データベースから自動で表示します。';

export const metadata: Metadata = buildMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
});

const FAQS = [
  {
    q: 'OTC類似薬は保険が使えなくなるのですか？',
    a: 'いいえ。保険適用は残ります。通常の1〜3割負担とは別に、対象薬剤の薬剤費の4分の1を「特別の料金」として上乗せで負担する仕組みです。',
  },
  {
    q: 'いつから始まりますか？',
    a: `${OTC_SIMILAR_META.effectiveLabel}の実施予定です。改正健康保険法は2026年5月に成立しており、詳細な運用ルールは厚生労働省の検討会で整理が続いています。`,
  },
  {
    q: '追加負担は具体的にいくらですか？',
    a: '薬剤費100円の薬なら、特別料金25円に加えて残り75円の3割(約23円)を負担し合計約48円。これまでの30円から約18円増えます。技術料(診察料・調剤料など)は変わりません。',
  },
  {
    q: '追加負担を求められない人はいますか？',
    a: 'こども、がん患者・難病患者など配慮が必要な慢性疾患のある方、低所得の方、入院患者、医師が長期使用等を医療上必要と判断した方などは、特別料金を求めない方向で検討されています。',
  },
  {
    q: '自分の処方薬が対象か知るには？',
    a: 'このページの一覧で成分名を確認してください。処方薬の成分名はお薬手帳や薬情(薬の説明書)に記載されています。一覧は厚労省の案で、最終的な対象品目は告示で確定します。',
  },
];

type Row = {
  ing: OtcSimilarIngredient;
  otcCount: number;
  otcTop: Medicine[];
  guides: { slug: string; rxName: string }[];
};

function buildRows(): Row[] {
  const meds = getEnrichedMedicines();
  const normed = meds.map((m) => ({
    m,
    ings: (m.ings || []).map((i) => normalizeIngredientName(i)),
  }));
  return OTC_SIMILAR_77.map((ing) => {
    const otc = normed.filter(({ ings }) => matchesOtcSimilar(ing, ings)).map((x) => x.m);
    const guides = SWITCH_DRUGS.filter((d) => d.otcSimilarNo === ing.no).map((d) => ({
      slug: d.slug,
      rxName: d.rxName,
    }));
    return { ing, otcCount: otc.length, otcTop: otc.slice(0, 3), guides };
  });
}

export default function OtcSimilarPage() {
  const rows = buildRows();
  const totalOtc = rows.reduce((s, r) => s + r.otcCount, 0);

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: '/' },
    { name: '処方薬から探す', url: '/switch/' },
    { name: 'OTC類似薬 特別料金の対象77成分', url: PATH },
  ]);
  const faq = buildFaqJsonLd(FAQS);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }}
      />

      <nav className="mb-4 text-sm text-gray-600" aria-label="パンくず">
        <ol className="flex flex-wrap gap-1">
          <li><Link href="/" className="underline">ホーム</Link></li>
          <li>/</li>
          <li><Link href="/switch/" className="underline">処方薬から探す</Link></li>
          <li>/</li>
          <li>OTC類似薬 特別料金の対象77成分</li>
        </ol>
      </nav>

      <h1 className="text-2xl font-bold leading-snug md:text-3xl">
        OTC類似薬「特別料金」の対象77成分一覧
        <span className="mt-1 block text-base font-normal text-gray-700">
          {OTC_SIMILAR_META.effectiveLabel}から、処方時に薬剤費の4分の1が追加負担に
        </span>
      </h1>

      <p className="mt-4 leading-relaxed">
        市販薬と同じ成分・同じ使い方の処方薬（OTC類似薬）について、通常の自己負担とは別に
        <strong>{OTC_SIMILAR_META.feeRatioLabel}</strong>を「特別の料金」として患者が負担する仕組みが、
        {OTC_SIMILAR_META.lawLabel}により始まります。対象は厚生労働省の案で
        <strong>{OTC_SIMILAR_META.ingredientCount}成分・{OTC_SIMILAR_META.itemCountLabel}</strong>。
        このページでは77成分すべてを用途別に並べ、それぞれについて
        <strong>同じ成分を含む市販薬</strong>（当サイトの成分データベースから自動抽出、計{totalOtc}件）を表示します。
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border p-4">
          <h2 className="font-bold">制度の要点</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
            <li>保険適用は残る。定率負担（1〜3割）に加えて、対象薬剤の薬剤費の1/4を別途負担</li>
            <li>対象は「市販薬と成分・投与経路が同一で、1日最大用量が異ならない医療用医薬品」を機械的に選定した77成分</li>
            <li>実施は{OTC_SIMILAR_META.effectiveLabel}。令和9年度以降に対象拡大・料率引き上げを検討</li>
            <li>こども、がん・難病など配慮が必要な慢性疾患、低所得者、入院患者、医師が長期使用を必要と判断した方などは対象外の方向</li>
          </ul>
        </section>
        <section className="rounded-lg border p-4">
          <h2 className="font-bold">負担額の計算例（薬剤費100円あたり）</h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1">負担割合</th>
                <th className="py-1">これまで</th>
                <th className="py-1">実施後</th>
                <th className="py-1">増加</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b"><td className="py-1">3割</td><td>30円</td><td>約48円</td><td>+約18円</td></tr>
              <tr className="border-b"><td className="py-1">2割</td><td>20円</td><td>40円</td><td>+20円</td></tr>
              <tr><td className="py-1">1割</td><td>10円</td><td>約33円</td><td>+約23円</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-600">
            実施後＝特別料金25円＋残り75円×負担割合。診察料・調剤料などの技術料は変わりません。
          </p>
        </section>
      </div>

      <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm leading-relaxed">
        <strong>この一覧は{OTC_SIMILAR_META.listStatus}です。</strong>
        最終的な対象品目は厚生労働省の告示で確定します。また、当サイトは処方薬から市販薬への切替を推奨するものではありません。
        継続治療中の薬は、自己判断で中止・変更せず医師・薬剤師に相談してください。
      </p>

      <nav className="mt-8 rounded-lg border p-4 text-sm" aria-label="用途別リンク">
        <p className="font-bold">用途から探す</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {OTC_SIMILAR_GROUPS.map((g) => (
            <li key={g.key}>
              <a href={`#${g.key}`} className="rounded-full border px-3 py-1 hover:bg-gray-50">
                {g.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {OTC_SIMILAR_GROUPS.map((g) => {
        const groupRows = rows.filter((r) => r.ing.group === g.key);
        if (groupRows.length === 0) return null;
        return (
          <section key={g.key} id={g.key} className="mt-10 scroll-mt-20">
            <h2 className="text-xl font-bold">{g.label}</h2>
            <p className="mt-1 text-sm text-gray-700">{g.lead}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-2 py-2 w-10">No</th>
                    <th className="px-2 py-2">成分（厚労省表記）</th>
                    <th className="px-2 py-2">代表的な処方薬</th>
                    <th className="px-2 py-2">同じ成分の市販薬</th>
                    <th className="px-2 py-2">切替ガイド</th>
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map(({ ing, otcCount, otcTop, guides }) => (
                    <tr key={ing.no} className="border-b align-top">
                      <td className="px-2 py-2 text-gray-500">{ing.no}</td>
                      <td className="px-2 py-2">
                        <div className="font-medium">{ing.name}</div>
                        <div className="text-xs text-gray-600">{ing.use}</div>
                      </td>
                      <td className="px-2 py-2">
                        {ing.rxExamples?.length ? ing.rxExamples.join('、') : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-2 py-2">
                        {otcCount === 0 ? (
                          <span className="text-gray-400">該当なし</span>
                        ) : (
                          <>
                            <span className="text-xs text-gray-600">{otcCount}件</span>
                            <ul className="mt-1 space-y-0.5">
                              {otcTop.map((m) => (
                                <li key={m.slug}>
                                  <Link href={`/medicines/${m.slug}/`} className="underline">
                                    {m.name}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {guides.length === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {guides.map((gd) => (
                              <li key={gd.slug}>
                                <Link href={`/switch/${gd.slug}/`} className="underline">
                                  {gd.rxName} →
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <section className="mt-12">
        <h2 className="text-xl font-bold">よくある質問</h2>
        <dl className="mt-3 space-y-4">
          {FAQS.map((f) => (
            <div key={f.q}>
              <dt className="font-medium">Q. {f.q}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-gray-800">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12 text-sm text-gray-700">
        <h2 className="font-bold">出典（公的機関）</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {OTC_SIMILAR_META.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-gray-600">
          当ページの情報は厚生労働省の公開資料およびPMDA公開情報を元に整理したものです。
          市販薬の使用にあたっては添付文書を確認し、薬剤師・登録販売者に相談してください。
          本サイトは医療行為の代替を目的としていません。
        </p>
      </section>
    </div>
  );
}
