// 成分辞典の一覧ページ。個別成分は [slug]/page.tsx 側。params は受け取らない。
import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllIngredients } from '@/lib/medicines';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { IngredientFinder } from './IngredientFinder';
import { buildMetadata } from '@/lib/seo';

/** 上部に出す件数 */
const POPULAR_LIMIT = 10;

export const metadata: Metadata = buildMetadata({
  title: '市販薬の成分辞典|配合量・作用・注意点',
  description:
    'ロキソプロフェン・イブプロフェン・アセトアミノフェンなど、市販薬に含まれる有効成分を検索。含有薬品一覧と成分の特徴を確認できます。',
  path: '/ingredients/',
});

export default function IngredientsIndexPage() {
  const ingredients = getAllIngredients();

  // クライアントへ渡すのは表示に必要な項目だけ
  const items = ingredients.map((i) => ({
    name: i.name,
    slug: i.slug,
    count: i.medicineIds.length,
  }));

  // 配合されている市販薬が多い成分（データから自動算出。手動更新は不要）
  const popular = [...items]
    .sort((a, b) => b.count - a.count)
    .slice(0, POPULAR_LIMIT);

  return (
    <div className="container-narrow py-6 md:py-10">
      <Breadcrumb
        items={[{ name: 'ホーム', href: '/' }, { name: '成分辞典' }]}
      />

      <header className="mb-8 text-center">
        <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-brand-ink md:text-4xl">
          成分辞典
        </h1>
        <p className="text-gray-600">
          市販薬に含まれる有効成分 {items.length.toLocaleString()} 種類。
          成分名から、それを含む市販薬と特徴を確認できます。
        </p>
      </header>

      {/* 配合されている市販薬が多い成分 */}
      {popular.length > 0 && (
        <section className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-4 md:p-5">
          <h2 className="mb-1 text-sm font-bold text-gray-700">
            配合されている市販薬が多い成分
          </h2>
          <p className="mb-3 text-xs text-gray-500">
            多くの製品に使われている成分です。効果や安全性の優劣を示すものではありません。
          </p>
          <ul className="flex flex-wrap gap-2">
            {popular.map((i) => (
              <li key={i.slug}>
                <Link
                  href={`/ingredients/${i.slug}/`}
                  className="inline-flex items-baseline gap-1.5 rounded-full border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-brand-ink transition-colors hover:border-brand hover:text-brand"
                >
                  {i.name}
                  <span className="text-xs font-normal text-gray-500">
                    {i.count}品
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <IngredientFinder items={items} />

      {/* 免責 */}
      <aside className="mt-10 rounded bg-gray-50 p-4 text-xs leading-relaxed text-gray-600">
        <p>
          成分の解説はPMDA公開情報・添付文書をもとに整理した一般的な情報です。服用の可否は必ず添付文書と薬剤師・登録販売者にご確認ください。
        </p>
      </aside>
    </div>
  );
}
