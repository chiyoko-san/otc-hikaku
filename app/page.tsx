import type { Metadata } from 'next';
import { getAllMedicines } from '@/lib/medicines';
import { CATEGORIES } from '@/lib/categories';
import { MedicineBrowser } from '@/components/medicine/MedicineBrowser';
import { FindByLinks } from '@/components/medicine/FindByLinks';
import { PageHero } from '@/components/layout/PageHero';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: '市販薬を成分・リスク区分で比較',
  description:
    '市販薬(OTC医薬品)1万品以上をPMDA公開情報から成分・症状・リスク区分で比較。広告・案件なしの中立情報サイトです。',
  path: '/',
});

export default function HomePage() {
  const all = getAllMedicines();

  // カテゴリ別の件数(絞り込みプルダウンで使用)
  const byCategory = new Map<string, number>();
  for (const m of all) {
    byCategory.set(m.cat, (byCategory.get(m.cat) || 0) + 1);
  }

  // 件数の多いカテゴリから並べる
  const sortedCats = CATEGORIES.filter((c) => byCategory.has(c.id)).sort(
    (a, b) => (byCategory.get(b.id) || 0) - (byCategory.get(a.id) || 0)
  );

  return (
    <div className="container-wide py-6 md:py-10">
      {/* トップページなのでパンくずは出さない(自分自身へのパンくずは誤り) */}

      <PageHero title="市販薬を探す">
        PMDA公開情報をもとに整理した市販薬 {all.length.toLocaleString()} 品を、
        成分・リスク区分から比較できます。
      </PageHero>

      {/* 検索・絞り込み。条件を入れると結果がここに表示される */}
      <MedicineBrowser
        categories={sortedCats.map((c) => ({
          id: c.id,
          label: c.label,
          count: byCategory.get(c.id) || 0,
        }))}
      >
        {/* 未検索時の案内 */}
        <section className="rounded-2xl border border-gray-200 bg-white p-8 text-center md:p-12">
          <p className="mb-2 text-base font-bold text-brand-ink">
            商品名・成分名で検索するか、分類・症状から絞り込んでください
          </p>
          <p className="mb-8 text-sm text-gray-500">
            成分・リスク区分・眠気の有無をもとに、同じ成分の薬を比較できます。
          </p>

          <FindByLinks />
        </section>
      </MedicineBrowser>
    </div>
  );
}
