import Link from 'next/link';
import type { Metadata } from 'next';
import { getAllSymptoms } from '@/lib/medicines';
import { SYMPTOM_GROUPS } from '@/lib/symptom-groups';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: '症状から市販薬を探す|症状別の選び方ガイド',
  description:
    '頭痛・胃痛・花粉症など、症状から市販薬を探せます。成分別・リスク区分別の比較付き。',
  path: '/symptoms/',
});

export default function SymptomsIndexPage() {
  const symptoms = getAllSymptoms();
  const symSet = new Set(symptoms.map((s) => s.name));

  return (
    <div className="container-wide py-6 md:py-10">
      <Breadcrumb items={[{ name: 'ホーム', href: '/' }, { name: '症状から選ぶ' }]} />

      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold md:text-4xl">症状から市販薬を探す</h1>
        <p className="text-gray-600">
          気になる症状をクリックすると、その症状に適応のある市販薬一覧を確認できます。
        </p>
        <div className="mt-4">
          <Link href="/akinator/" className="btn-primary">
            💊 症状アキネーターで探す(質問に答えるだけ)
          </Link>
        </div>
      </header>

      {/* 症状グループ別に一覧表示 */}
      <div className="space-y-8">
        {SYMPTOM_GROUPS.map((g) => {
          const list = g.symptoms.filter((s) => symSet.has(s));
          if (list.length === 0) return null;
          return (
            <section key={g.slug}>
              <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
                {g.group}
              </h2>
              <div className="flex flex-wrap gap-2">
                {list.map((sName) => {
                  const sym = symptoms.find((x) => x.name === sName);
                  if (!sym) return null;
                  return (
                    <Link
                      key={sym.slug}
                      href={`/symptoms/${sym.slug}/`}
                      className="chip hover:border-brand"
                    >
                      {sym.name}
                      <span className="ml-1 text-xs text-gray-500">
                        ({sym.medicineIds.length})
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
