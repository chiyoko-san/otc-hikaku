import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAllIngredients, getIngredientBySlug, getAllMedicines } from '@/lib/medicines';
import { CATEGORIES } from '@/lib/categories';
import { MedicineBrowser } from '@/components/medicine/MedicineBrowser';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { JsonLd } from '@/components/layout/JsonLd';
import { buildMetadata, buildBreadcrumbJsonLd, SITE_URL } from '@/lib/seo';

// 一覧に無いページもアクセス時に生成する
export const dynamicParams = true;

// ビルド時に作るのは配合品数の多い成分のみ。残りは初回アクセス時に生成される
export async function generateStaticParams() {
  const priority = getAllIngredients()
    .filter((i) => i.medicineIds.length > 0)
    .sort((a, b) => b.medicineIds.length - a.medicineIds.length)
    .slice(0, 800);
  return priority.map((i) => ({ slug: i.slug }));
}

type Props = { params: { slug: string } };

export function generateMetadata({ params }: Props): Metadata {
  const ing = getIngredientBySlug(params.slug);
  if (!ing) return { title: '成分が見つかりません' };

  return buildMetadata({
    title: `${ing.name}|配合市販薬 ${ing.medicineIds.length}品・作用・注意点`,
    description: `${ing.name}の特徴と、この成分を含む市販薬 ${ing.medicineIds.length} 品の一覧。${ing.description || ''}`.slice(
      0,
      200
    ),
    path: `/ingredients/${ing.slug}/`,
  });
}

export default function IngredientDetailPage({ params }: Props) {
  const ing = getIngredientBySlug(params.slug);
  if (!ing) notFound();

  const allMedicines = getAllMedicines();
  const medMap = new Map(allMedicines.map((m) => [m.id, m]));
  const meds = ing.medicineIds.map((id) => medMap.get(id)!).filter(Boolean);

  // この成分を含む薬に限定したカテゴリ選択肢(件数の多い順)
  const byCat = new Map<string, number>();
  for (const m of meds) byCat.set(m.cat, (byCat.get(m.cat) || 0) + 1);
  const catOptions = CATEGORIES.filter((c) => byCat.has(c.id))
    .map((c) => ({ id: c.id, label: c.label, count: byCat.get(c.id)! }))
    .sort((a, b) => b.count - a.count);

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

        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold md:text-4xl">{ing.name}</h1>
          <p className="text-gray-600">
            配合市販薬 {ing.medicineIds.length} 品
          </p>
        </header>

        {ing.description && (
          <section className="mb-8">
            <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
              成分の特徴
            </h2>
            <div className="rounded border border-gray-200 bg-white p-4">
              <p className="leading-relaxed">{ing.description}</p>
            </div>
          </section>
        )}

        <section className="mb-8">
          <h2 className="mb-4 border-l-4 border-brand pl-3 text-xl font-bold">
            {ing.name}を含む市販薬({meds.length}件)
          </h2>

          {/* この成分を含む薬だけを対象に、キーワード・分類・症状・リスク区分で絞り込む */}
          <MedicineBrowser
            categories={catOptions}
            restrictTo={meds.map((m) => m.slug)}
            placeholder={`${ing.name}を含む市販薬から検索`}
            showResultsWithoutQuery
          >
            <div />
          </MedicineBrowser>
        </section>

        <aside className="mt-12 rounded bg-gray-50 p-4 text-xs text-gray-600">
          <p>
            当ページの情報は、PMDA(医薬品医療機器総合機構)の公開データおよび一般的な医薬品の情報を元に整理したものです。服用前には必ず添付文書・薬剤師への相談を行ってください。
          </p>
        </aside>
      </div>
    </>
  );
}
