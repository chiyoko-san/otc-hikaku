import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  getAllSymptoms,
  getSymptomBySlug,
  getAllMedicines,
} from '@/lib/medicines';
import { MedicineCard } from '@/components/medicine/MedicineCard';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { JsonLd } from '@/components/layout/JsonLd';
import { buildMetadata, buildBreadcrumbJsonLd, SITE_URL } from '@/lib/seo';

// 一覧に無いページもアクセス時に生成する
export const dynamicParams = true;

// コラムの追加・更新を1日1回反映する
export const revalidate = 86400;

// ビルド時に作るのは主要製品のみ。残りは初回アクセス時に生成される
export async function generateStaticParams() {
  const enriched = getAllMedicines();
  const priority = enriched
    .filter((m) => m.ings && m.ings.length > 0 && m.effect)
    .slice(0, 800);
  return priority.map((m) => ({ slug: m.slug }));
}

type Props = { params: { slug: string } };

/* ------------------------------------------------------------------
   コラム取得
   columns.tag は編集カテゴリ（安全情報 / 基礎知識 など）が中心で、
   症状名と一致するタグは 花粉症・胃腸・育毛・漢方・美容・スキンケア のみ。
   症状グループ名とタグの言い方が違う場合だけ下の表に追記する。
   例: { 'アレルギー': '花粉症', '胃腸・便通': '胃腸' }
------------------------------------------------------------------- */
type ColumnRow = { slug: string; title: string; tag: string | null };

const SYMPTOM_TAG_MAP: Record<string, string> = {};

async function getPublishedColumns(): Promise<ColumnRow[]> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return [];

  const query = new URLSearchParams({
    select: 'slug,title,tag',
    status: 'eq.published',
    order: 'date.desc.nullslast,slug.asc',
    limit: '200',
  });

  try {
    const res = await fetch(`${base}/rest/v1/columns?${query.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as ColumnRow[];
    return Array.isArray(rows) ? rows.filter((r) => r?.slug && r?.title) : [];
  } catch {
    // 取得失敗時はセクションごと非表示にする（ビルドは落とさない）
    return [];
  }
}

// slug から決まる開始位置。ページごとに違う3本が出るが、同じページなら常に同じ
function pickRotating(rows: ColumnRow[], seed: string, n: number): ColumnRow[] {
  if (rows.length === 0) return [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const start = h % rows.length;
  const take = Math.min(n, rows.length);
  return Array.from({ length: take }, (_, i) => rows[(start + i) % rows.length]);
}

export function generateMetadata({ params }: Props): Metadata {
  const sym = getSymptomBySlug(params.slug);
  if (!sym) return { title: '症状が見つかりません' };

  return buildMetadata({
    title: `${sym.name}に効く市販薬 ${sym.medicineIds.length}種|成分比較`,
    description: `${sym.name}の症状に適応のある市販薬(OTC医薬品) ${sym.medicineIds.length}種類を成分・リスク区分別に比較。眠気・副作用情報も掲載。`,
    path: `/symptoms/${sym.slug}/`,
  });
}

export default async function SymptomDetailPage({ params }: Props) {
  const sym = getSymptomBySlug(params.slug);
  if (!sym) notFound();

  const allMedicines = getAllMedicines();
  const medMap = new Map(allMedicines.map((m) => [m.id, m]));
  const meds = sym.medicineIds
    .map((id) => medMap.get(id)!)
    .filter(Boolean);

  // タグが症状と一致するものを優先。無ければ全公開記事から振り分ける
  const columns = await getPublishedColumns();
  const wanted = [
    SYMPTOM_TAG_MAP[sym.group ?? ''],
    SYMPTOM_TAG_MAP[sym.name],
    sym.group,
    sym.name,
  ].filter(Boolean) as string[];
  const matched = columns
    .filter((c) => c.tag && wanted.includes(c.tag))
    .slice(0, 3);
  const isRelated = matched.length > 0;
  const columnLinks = isRelated ? matched : pickRotating(columns, sym.slug, 3);

  // リスク区分別に分類
  const byRisk: Record<string, typeof meds> = { '1': [], '2': [], '2.5': [], '3': [] };
  for (const m of meds) {
    const k = String(m.risk);
    if (byRisk[k]) byRisk[k].push(m);
  }

  const breadcrumbs = [
    { name: 'ホーム', href: '/' },
    { name: '症状から選ぶ', href: '/symptoms/' },
    ...(sym.group ? [{ name: sym.group }] : []),
    { name: sym.name },
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalCondition',
    name: sym.name,
    url: `${SITE_URL}/symptoms/${sym.slug}/`,
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd
        data={buildBreadcrumbJsonLd(
          breadcrumbs.map((b) => ({
            name: b.name,
            url: b.href || `/symptoms/${sym.slug}/`,
          }))
        )}
      />

      <div className="container-wide py-6 md:py-10">
        <Breadcrumb items={breadcrumbs} />

        <header className="mb-8">
          <div className="mb-2 text-sm text-gray-500">{sym.group}</div>
          <h1 className="mb-2 text-3xl font-bold md:text-4xl">
            {sym.name}に効く市販薬
          </h1>
          <p className="text-gray-600">
            {sym.name}の症状に適応のある市販薬 {meds.length} 種類を掲載しています。成分・リスク区分から選び分けの参考にしてください。
          </p>
        </header>

        {/* リスク区分別 */}
        {(['1', '2', '2.5', '3'] as const).map((rk) => {
          const list = byRisk[rk];
          if (list.length === 0) return null;
          const riskLabel =
            rk === '1'
              ? '第1類医薬品(薬剤師要相談)'
              : rk === '2'
              ? '第2類医薬品'
              : rk === '2.5'
              ? '指定第2類医薬品'
              : '第3類医薬品';
          return (
            <section key={rk} className="mb-10">
              <h2 className="mb-4 border-l-4 border-brand pl-3 text-xl font-bold">
                {riskLabel}({list.length}件)
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {list.map((m) => (
                  <MedicineCard key={m.id} med={m} />
                ))}
              </div>
            </section>
          );
        })}

        {/* 解説記事（0件なら非表示） */}
        {columnLinks.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 border-l-4 border-brand pl-3 text-xl font-bold">
              {isRelated ? '関連する解説記事' : 'ほかの解説記事'}
            </h2>
            <ul className="space-y-2">
              {columnLinks.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/columns/${c.slug}/`}
                    className="text-brand underline underline-offset-2 hover:no-underline"
                  >
                    {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
