import Link from 'next/link';
import type { Metadata } from 'next';
import { getAllMedicines } from '@/lib/medicines';
import { CATEGORIES } from '@/lib/categories';
import { MedicineCard } from '@/components/medicine/MedicineCard';
import { MedicineBrowser } from '@/components/medicine/MedicineBrowser';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: '市販薬一覧|成分・リスク区分で比較',
  description:
    '市販薬(OTC医薬品)を成分・カテゴリ・リスク区分から比較。PMDA公開情報ベースの中立情報。',
  path: '/medicines/',
});

export default function MedicinesIndexPage() {
  const all = getAllMedicines();

  // カテゴリ別にグループ化
  const byCategory = new Map<string, typeof all>();
  for (const m of all) {
    if (!byCategory.has(m.cat)) byCategory.set(m.cat, []);
    byCategory.get(m.cat)!.push(m);
  }

  // 件数の多いカテゴリから表示
  const sortedCats = CATEGORIES.filter((c) =>
    byCategory.has(c.id)
  ).sort(
    (a, b) =>
      (byCategory.get(b.id)?.length || 0) -
      (byCategory.get(a.id)?.length || 0)
  );

  return (
    <div className="container-wide py-6 md:py-10">
      <Breadcrumb items={[{ name: 'ホーム', href: '/' }, { name: '薬品一覧' }]} />

      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-brand-ink md:text-4xl">市販薬一覧</h1>
        <p className="text-gray-600">
          詳細情報を整備した市販薬 {all.length} 品をカテゴリ別に掲載しています。
        </p>
      </header>

      {/* 絞り込み検索 + 結果表示 */}
      <MedicineBrowser
        categories={sortedCats.map((c) => ({
          id: c.id,
          label: c.label,
          count: byCategory.get(c.id)?.length || 0,
        }))}
      >
      {/* カテゴリリンク */}
      <nav className="mb-10 flex flex-wrap gap-2">
        {sortedCats.map((c) => (
          <Link
            key={c.id}
            href={`/categories/${c.id}/`}
            className="chip hover:border-brand"
          >
            {c.label}({byCategory.get(c.id)?.length || 0})
          </Link>
        ))}
      </nav>

      {/* カテゴリごとに薬品カードを表示 */}
      {sortedCats.map((c) => {
        const meds = byCategory.get(c.id) || [];
        if (meds.length === 0) return null;
        return (
          <section key={c.id} className="mb-12">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-2xl font-bold">{c.label}</h2>
              <Link
                href={`/categories/${c.id}/`}
                className="text-sm text-brand hover:underline"
              >
                すべて見る ({meds.length}件) →
              </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {meds.slice(0, 6).map((m) => (
                <MedicineCard key={m.id} med={m} />
              ))}
            </div>
          </section>
        );
      })}
      </MedicineBrowser>
    </div>
  );
}
