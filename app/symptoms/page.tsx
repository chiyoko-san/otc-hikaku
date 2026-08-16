import Link from 'next/link';
import type { Metadata } from 'next';
import { getAllSymptoms } from '@/lib/medicines';
import { SYMPTOM_GROUPS } from '@/lib/symptom-groups';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { SymptomPicker } from '@/components/symptom/SymptomPicker';
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
  const countMap = new Map(symptoms.map((s) => [s.name, s.medicineIds.length]));
  const slugMap = new Map(symptoms.map((s) => [s.name, s.slug]));

  // グループ → 実在する症状だけに絞ったプルダウン用データ
  const groups = SYMPTOM_GROUPS.map((g) => ({
    group: g.group,
    symptoms: g.symptoms
      .filter((s) => symSet.has(s))
      .map((s) => ({
        name: s,
        slug: slugMap.get(s)!,
        count: countMap.get(s) || 0,
      })),
  })).filter((g) => g.symptoms.length > 0);

  return (
    <div className="container-narrow py-6 md:py-10">
      <Breadcrumb
        items={[{ name: 'ホーム', href: '/' }, { name: '症状から選ぶ' }]}
      />

      <header className="mb-10 text-center">
        <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-brand-ink md:text-4xl">
          症状から市販薬を探す
        </h1>
        <p className="text-gray-600">
          いくつかの質問に答えるだけで、症状に合った市販薬の候補がわかります。
        </p>
      </header>

      {/* ===== メイン: 症状アキネーター ===== */}
      <section className="mb-10 rounded-2xl border border-gray-200 bg-white p-8 text-center md:p-12">
        <div className="mx-auto max-w-md">
          <div className="mb-4 text-4xl" aria-hidden="true">
            💊
          </div>
          <h2 className="mb-2 text-xl font-bold text-brand-ink">
            症状アキネーター
          </h2>
          <p className="mb-6 text-sm leading-relaxed text-gray-600">
            「どこが・いつから・どんなふうに」——
            質問に順番に答えると、あなたの症状に適応のある市販薬を絞り込みます。
          </p>
          <Link
            href="/akinator/"
            className="btn-primary inline-block w-full max-w-xs px-8 py-4 text-base"
          >
            質問に答えて探す
          </Link>
          <p className="mt-3 text-xs text-gray-400">
            所要1〜2分・登録不要
          </p>
        </div>
      </section>

      {/* ===== サブ: 症状を直接選ぶ ===== */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8">
        <h2 className="mb-1 text-base font-bold text-brand-ink">
          症状がはっきりしている方は
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          部位・種類を選ぶと、その症状に適応のある市販薬一覧へ移動します。
        </p>
        <SymptomPicker groups={groups} />
      </section>

      {/* 免責 */}
      <aside className="mt-10 rounded bg-gray-50 p-4 text-xs leading-relaxed text-gray-600">
        <p>
          本ページは受診の代替を目的としたものではありません。症状が長引く場合や強い場合は、医師・薬剤師にご相談ください。
        </p>
      </aside>
    </div>
  );
}
