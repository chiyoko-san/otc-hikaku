import Link from 'next/link';
import type { Metadata } from 'next';
import { getAllMedicines } from '@/lib/medicines';
import { CATEGORIES } from '@/lib/categories';
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
      <Breadcrumb items={[{ name: 'ホーム', href: '/' }, { name: '薬品一覧' }]} />

      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-brand-ink md:text-4xl">
          市販薬を探す
        </h1>
        <p className="text-gray-600">
          PMDA公開情報をもとに整理した市販薬 {all.length.toLocaleString()} 品を、
          成分・リスク区分から比較できます。
        </p>
      </header>

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

          <div className="mx-auto grid max-w-3xl gap-3 text-left sm:grid-cols-3">
            <Link
              href="/switch/"
              className="rounded-lg border border-gray-200 p-4 transition hover:border-brand"
            >
              <span className="mb-1 block text-sm font-bold text-brand-dark">
                処方薬から探す
              </span>
              <span className="block text-xs leading-relaxed text-gray-600">
                アレグラ・ロキソニン・ガスターなど、処方薬と同じ成分の市販薬
              </span>
            </Link>
            <Link
              href="/symptoms/"
              className="rounded-lg border border-gray-200 p-4 transition hover:border-brand"
            >
              <span className="mb-1 block text-sm font-bold text-brand-dark">
                症状から探す
              </span>
              <span className="block text-xs leading-relaxed text-gray-600">
                頭痛・胃痛・鼻水など、悩んでいる症状から絞り込む
              </span>
            </Link>
            <Link
              href="/ingredients/"
              className="rounded-lg border border-gray-200 p-4 transition hover:border-brand"
            >
              <span className="mb-1 block text-sm font-bold text-brand-dark">
                成分から探す
              </span>
              <span className="block text-xs leading-relaxed text-gray-600">
                有効成分の名前から、それを含む市販薬を一覧で確認する
              </span>
            </Link>
          </div>
        </section>
      </MedicineBrowser>
    </div>
  );
}
