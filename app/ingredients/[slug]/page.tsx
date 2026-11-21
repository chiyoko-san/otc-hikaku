import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getAllIngredients, getIngredientBySlug } from '@/lib/medicines';
import { summarize, countLabel, buildFaqs } from '@/lib/ingredient-summary';
import { findOtcSimilarForIngredients } from '@/lib/otc-similar-77';
import { MedicineCard } from '@/components/medicine/MedicineCard';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { JsonLd } from '@/components/layout/JsonLd';
import {
  buildMetadata,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  SITE_URL,
} from '@/lib/seo';

// 一覧に無いページもアクセス時に生成する
export const dynamicParams = true;

// ビルド時に作るのは薬の多い上位800件。残りは初回アクセス時に生成される
// 2026-10 修正: 以前は薬のスラッグを返していて（コピペ由来）、成分ページとしては存在しない
// URLを毎ビルド800件ぶん404として生成していた。成分自体のスラッグを、薬の多い順に800件まで返す。
export async function generateStaticParams() {
  const all = [...getAllIngredients()].sort(
    (a, b) => (b.medicineIds?.length ?? 0) - (a.medicineIds?.length ?? 0)
  );
  return all.slice(0, 800).map((x) => ({ slug: x.slug }));
}

type Props = { params: { slug: string } };

/* ------------------------------------------------------------------
   2026-11-21: 検索語に答える形に作り直し
   Search Console（直近28日）で成分ページは 231種類の検索語・1,070表示・14クリック。
   多い型は「〇〇 市販」「〇〇 市販薬」「〇〇とは」「〇〇 効能」で、3〜10位にいるのにクリックがほぼ0だった。
   旧題名「〇〇|配合市販薬 N品・作用・注意点」は答えが見えず、本文も製品カードが並ぶだけだったので、
   題名と冒頭の「まず結論」で「市販で買えるか・何品あるか・何に使われるか・区分」を先に答える。

   数字はすべて掲載データからの集計（lib/ingredient-summary.ts）。副作用など、データに無いことは書かない。
   成分がずれている疑いのある取り込み分（lib/indexable.ts の隔離対象）は「成分データを確認中」として分け、
   結論・題名の数字には入れない。確認できた製品が無い成分は、これまでどおりの題名・表示のまま。
------------------------------------------------------------------- */

export function generateMetadata({ params }: Props): Metadata {
  const ing = getIngredientBySlug(params.slug);
  if (!ing) return { title: '成分が見つかりません' };

  const sum = summarize(ing);

  // 成分を確認できた製品が無い: これまでどおりの題名（数字を新しく言い切らない）
  if (sum.meds.length === 0) {
    return buildMetadata({
      title: `${ing.name}|配合市販薬 ${ing.medicineIds.length}品・作用・注意点`,
      description: `${ing.name}の特徴と、この成分を含む市販薬 ${ing.medicineIds.length} 品の一覧。${ing.description || ''}`.slice(
        0,
        200
      ),
      path: `/ingredients/${ing.slug}/`,
    });
  }

  const count = countLabel(sum);
  const title = ing.description
    ? `${ing.name}とは|働き・注意点と、含まれる${count}`
    : `${ing.name}を含む${count}|どんな薬に入っている?区分と製品一覧`;

  const uses =
    sum.topSymptoms.length > 0 && sum.medicineCount > 0
      ? `効能に「${sum.topSymptoms.join('」「')}」を含む製品に多い成分。`
      : '';
  const risk = sum.riskParts.length > 0 ? `区分は${sum.riskParts.join('、')}。` : '';
  const names = sum.topProducts.length > 0 ? `${sum.topProducts.join('・')}など。` : '';

  return buildMetadata({
    title,
    description: `${ing.name}を含む${count}を一覧で比較。${uses}${risk}${names}${ing.description || ''}`.slice(
      0,
      160
    ),
    path: `/ingredients/${ing.slug}/`,
  });
}

export default function IngredientDetailPage({ params }: Props) {
  const ing = getIngredientBySlug(params.slug);
  if (!ing) notFound();

  const sum = summarize(ing);
  const { meds, pending } = sum;
  const faqs = buildFaqs(ing, sum);
  const fee = findOtcSimilarForIngredients([ing.name]);

  const breadcrumbs = [
    { name: 'ホーム', href: '/' },
    { name: '成分辞典', href: '/ingredients/' },
    { name: ing.name },
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ChemicalSubstance',
    name: ing.name,
    description: ing.description || `${ing.name}を含む市販薬一覧`,
    url: `${SITE_URL}/ingredients/${ing.slug}/`,
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      {faqs.length > 0 && <JsonLd data={buildFaqJsonLd(faqs)} />}
      <JsonLd
        data={buildBreadcrumbJsonLd(
          breadcrumbs.map((b) => ({
            name: b.name,
            url: b.href || `/ingredients/${ing.slug}/`,
          }))
        )}
      />

      <div className="container-wide py-6 md:py-10">
        <Breadcrumb items={breadcrumbs} />

        <header className="mb-6">
          <h1 className="mb-2 text-3xl font-bold md:text-4xl">
            {meds.length === 0
              ? ing.name
              : `${ing.name}を含む${sum.medicineCount > 0 ? '市販薬' : '製品'}`}
          </h1>
          {meds.length === 0 && (
            <p className="text-gray-600">配合市販薬 {ing.medicineIds.length} 品</p>
          )}
        </header>

        {/* まず結論: 検索語（市販で買える? 何に使う? 区分は?）に1画面で答える */}
        {meds.length > 0 ? (
          <section className="panel mb-8">
            <h2 className="mb-3 text-lg font-bold md:text-xl">まず結論</h2>
            <dl className="space-y-3 text-base leading-relaxed">
              <div>
                <dt className="font-bold">市販で買える?</dt>
                <dd>
                  {sum.medicineCount > 0
                    ? `買えます。${ing.name}を含む市販薬は ${sum.medicineCount} 品あります(成分を確認できた製品)。`
                    : `市販薬(医薬品)の掲載はありません。機能性表示食品が ${sum.foodCount} 品あります。`}
                  {sum.medicineCount > 0 && sum.foodCount > 0 &&
                    `ほかに機能性表示食品が ${sum.foodCount} 品あります。`}
                </dd>
              </div>
              {sum.topSymptoms.length > 0 && sum.medicineCount > 0 && (
                <div>
                  <dt className="font-bold">どんな薬に入っている?</dt>
                  <dd>
                    効能に「{sum.topSymptoms.join('」「')}」を含む製品に多く入っています。
                    製品全体の効能で、この成分だけの働きではありません。
                  </dd>
                </div>
              )}
              {sum.riskParts.length > 0 && (
                <div>
                  <dt className="font-bold">区分は?</dt>
                  <dd>
                    {sum.riskParts.join('、')}。
                    {sum.riskParts.some((r) => r.startsWith('第1類')) &&
                      '第1類は薬剤師の説明を受けて買う薬です。'}
                  </dd>
                </div>
              )}
              {ing.description && (
                <div>
                  <dt className="font-bold">どんな成分?</dt>
                  <dd>{ing.description}</dd>
                </div>
              )}
            </dl>
            <p className="mt-4">
              <a
                href="#products"
                className="text-base font-semibold text-brand underline underline-offset-2"
              >
                ↓ {ing.name}を含む製品 {meds.length} 品を見る
              </a>
            </p>
          </section>
        ) : (
          ing.description && (
            <section className="mb-8">
              <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
                成分の特徴
              </h2>
              <div className="rounded border border-gray-200 bg-white p-4">
                <p className="leading-relaxed">{ing.description}</p>
              </div>
            </section>
          )
        )}

        {/* 処方薬でもらうと上乗せ料金の対象になる成分 */}
        {fee.length > 0 && (
          <section className="panel mb-8">
            <h2 className="mb-2 text-lg font-bold md:text-xl">
              病院でもらうと「上乗せ料金」の対象
            </h2>
            <p className="mb-3 text-base leading-relaxed">
              {fee.map((f) => f.name).join('、')}
              は、処方薬として受け取ると2027年3月から薬剤費の4分の1が上乗せされる対象成分(厚生労働省案)です。市販薬として買う場合は対象外です。
            </p>
            <ul className="space-y-1">
              {fee.map((f) => (
                <li key={f.no}>
                  <Link
                    href={`/otc-similar/ingredient/${f.no}/`}
                    className="text-base font-semibold text-brand underline underline-offset-2"
                  >
                    → {f.name}の処方薬と上乗せ額を見る
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {meds.length > 0 && (
          <section id="products" className="mb-8 scroll-mt-24">
            <h2 className="mb-4 border-l-4 border-brand pl-3 text-xl font-bold">
              {ing.name}を含む製品({meds.length}件)
            </h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {meds.map((m) => (
                <MedicineCard key={m.id} med={m} />
              ))}
            </div>
          </section>
        )}

        {/* 成分データを確認中の製品（数字には入れていない） */}
        {pending.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-1 border-l-4 border-brand pl-3 text-xl font-bold">
              {meds.length > 0
                ? `成分データを確認中の製品(${pending.length}件)`
                : `${ing.name}を含む市販薬(${pending.length}件)`}
            </h2>
            {meds.length > 0 && (
              <p className="mb-4 pl-3 text-sm text-gray-500">
                成分データを取り直している製品です。成分は各製品の添付文書で確認してください。
              </p>
            )}
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {pending.map((m) => (
                <MedicineCard key={m.id} med={m} />
              ))}
            </div>
          </section>
        )}

        {/* 一緒に配合されることが多い成分 */}
        {sum.partners.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
              一緒に配合されることが多い成分
            </h2>
            <ul className="grid gap-2 md:grid-cols-2">
              {sum.partners.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/ingredients/${p.slug}/`}
                    className="card flex min-h-[56px] items-center justify-between gap-2 p-4 hover:border-brand"
                  >
                    <span className="text-base font-semibold text-brand-dark">
                      {p.name}
                    </span>
                    <span className="text-sm text-gray-500">{p.count}品で一緒</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* よくある質問(構造化データと同じ文) */}
        {faqs.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
              よくある質問
            </h2>
            <dl className="space-y-4">
              {faqs.map((f) => (
                <div key={f.q} className="card-static p-4">
                  <dt className="mb-1 text-base font-bold">{f.q}</dt>
                  <dd className="text-base leading-relaxed">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <aside className="mt-12 rounded bg-gray-50 p-4 text-xs text-gray-600">
          <p>
            当ページの情報は、PMDA(医薬品医療機器総合機構)の公開データおよび一般的な医薬品の情報を元に整理したものです。服用前には必ず添付文書・薬剤師への相談を行ってください。
          </p>
        </aside>
      </div>
    </>
  );
}
