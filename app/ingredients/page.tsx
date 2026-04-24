import Link from 'next/link';
import type { Metadata } from 'next';
import { getAllIngredients } from '@/lib/medicines';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: '市販薬の成分辞典|配合量・作用・注意点',
  description:
    'ロキソプロフェン・イブプロフェン・アセトアミノフェンなど、市販薬に含まれる有効成分を検索。含有薬品一覧と成分の特徴を確認できます。',
  path: '/ingredients/',
});

export default function IngredientsIndexPage() {
  const ingredients = getAllIngredients();

  // 五十音順グループ化(先頭1文字の頭文字)
  const byInitial = new Map<string, typeof ingredients>();
  for (const ing of ingredients) {
    const init = ing.name[0] || '#';
    if (!byInitial.has(init)) byInitial.set(init, []);
    byInitial.get(init)!.push(ing);
  }
  const initials = Array.from(byInitial.keys()).sort();

  return (
    <div className="container-wide py-6 md:py-10">
      <Breadcrumb items={[{ name: 'ホーム', href: '/' }, { name: '成分辞典' }]} />

      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold md:text-4xl">成分辞典</h1>
        <p className="text-gray-600">
          市販薬に含まれる有効成分 {ingredients.length} 種類。各成分をクリックすると、その成分を含む市販薬の一覧と成分の特徴を確認できます。
        </p>
      </header>

      {/* 上位20成分を「よく見る成分」として先頭に */}
      <section className="mb-10">
        <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
          よく見る成分 TOP20
        </h2>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {ingredients.slice(0, 20).map((ing) => (
            <Link
              key={ing.slug}
              href={`/ingredients/${ing.slug}/`}
              className="flex items-center justify-between rounded border border-gray-200 bg-white px-4 py-3 hover:border-brand"
            >
              <span className="font-semibold">{ing.name}</span>
              <span className="text-xs text-gray-500">
                {ing.medicineIds.length}品
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* 全成分を五十音順 */}
      <section>
        <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
          全成分(五十音順)
        </h2>
        <div className="space-y-6">
          {initials.map((init) => (
            <div key={init}>
              <h3 className="mb-2 text-lg font-bold text-brand">{init}</h3>
              <div className="flex flex-wrap gap-2">
                {byInitial.get(init)!.map((ing) => (
                  <Link
                    key={ing.slug}
                    href={`/ingredients/${ing.slug}/`}
                    className="chip hover:border-brand"
                  >
                    {ing.name}({ing.medicineIds.length})
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
