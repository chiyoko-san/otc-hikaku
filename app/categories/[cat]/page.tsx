import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getMedicinesByCategory } from '@/lib/medicines';
import { CATEGORIES, getCategoryLabel } from '@/lib/categories';
import { MedicineCard } from '@/components/medicine/MedicineCard';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { JsonLd } from '@/components/layout/JsonLd';
import { buildMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ cat: c.id }));
}

type Props = { params: { cat: string } };

export function generateMetadata({ params }: Props): Metadata {
  const label = getCategoryLabel(params.cat);
  const meds = getMedicinesByCategory(params.cat);
  return buildMetadata({
    title: `${label}の市販薬 ${meds.length}種 比較一覧`,
    description: `${label}カテゴリの市販薬 ${meds.length}種を成分・リスク区分別に比較。PMDA公開情報ベース。`,
    path: `/categories/${params.cat}/`,
  });
}

export default function CategoryPage({ params }: Props) {
  const label = getCategoryLabel(params.cat);
  const meds = getMedicinesByCategory(params.cat);

  if (meds.length === 0) notFound();

  const breadcrumbs = [
    { name: 'ホーム', href: '/' },
    { name: '薬品一覧', href: '/medicines/' },
    { name: label },
  ];

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd(
          breadcrumbs.map((b) => ({
            name: b.name,
            url: b.href || `/categories/${params.cat}/`,
          }))
        )}
      />

      <div className="container-wide py-6 md:py-10">
        <Breadcrumb items={breadcrumbs} />

        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold md:text-4xl">
            {label}の市販薬
          </h1>
          <p className="text-gray-600">
            {label}カテゴリに該当する市販薬 {meds.length} 種類を成分・リスク区分別に一覧表示しています。
          </p>
        </header>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {meds.map((m) => (
            <MedicineCard key={m.id} med={m} />
          ))}
        </div>
      </div>
    </>
  );
}
