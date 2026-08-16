import type { Metadata } from 'next';
import { getAllIngredients } from '@/lib/medicines';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { IngredientFinder } from './IngredientFinder';
import { buildMetadata } from '@/lib/seo';

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

  return (
    <div className="container-narrow py-6 md:py-10">
      <Breadcrumb
        items={[{ name: 'ホーム', href: '/' }, { name: '成分辞典' }]}
      />

      <header className="mb-10 text-center">
        <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-brand-ink md:text-4xl">
          成分辞典
        </h1>
        <p className="text-gray-600">
          市販薬に含まれる有効成分 {items.length.toLocaleString()} 種類。
          成分名から、それを含む市販薬と特徴を確認できます。
        </p>
      </header>

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
