import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  getEnrichedMedicines,
  getMedicineBySlug,
  getSimilarMedicines,
} from '@/lib/medicines';
import { getAllIngredients } from '@/lib/medicines';
import { getAllSymptoms } from '@/lib/medicines';
import { getDamageReportCountByMedicineId } from '@/lib/supabase/damage-reports';
import { getCategoryLabel } from '@/lib/categories';
import { normalizeIngredientName } from '@/lib/slug';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { MedicineCard } from '@/components/medicine/MedicineCard';
import { JsonLd } from '@/components/layout/JsonLd';
import {
  buildMetadata,
  buildDrugJsonLd,
  buildBreadcrumbJsonLd,
  SITE_URL,
} from '@/lib/seo';

// ISR: 1日に1回再生成
export const revalidate = 86400;

// 全 622 件分の静的パスを事前生成(SSG)
export async function generateStaticParams() {
  const enriched = getEnrichedMedicines();
  return enriched.map((m) => ({ slug: m.slug }));
}

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const med = getMedicineBySlug(params.slug);
  if (!med) return { title: '薬品が見つかりません' };

  const firstIng = med.ings?.[0]
    ? normalizeIngredientName(med.ings[0])
    : '';
  const titleBase = firstIng
    ? `${med.name}(${firstIng}配合)|成分・効能・類似薬の比較`
    : `${med.name}|成分・効能・類似薬の比較`;

  const desc = `${med.name}(${med.maker})の成分・効能効果・リスク区分・類似薬との比較。${med.effect.slice(0, 100)}`;

  return buildMetadata({
    title: titleBase,
    description: desc,
    path: `/medicines/${med.slug}/`,
    type: 'article',
  });
}

function riskLabel(risk: number, itype?: string): string {
  if (itype === 'functional') return '機能性表示食品';
  if (itype === 'quasi') return '医薬部外品';
  if (risk === 1) return '第1類医薬品';
  if (risk === 2) return '第2類医薬品';
  if (risk === 2.5) return '指定第2類医薬品';
  if (risk === 3) return '第3類医薬品';
  return '分類不明';
}

function riskDescription(risk: number, itype?: string): string {
  if (itype === 'functional')
    return '事業者の責任で機能性が表示された食品(医薬品ではありません)';
  if (itype === 'quasi')
    return '医薬部外品。医薬品より作用が緩和な製品です';
  if (risk === 1) return '購入時に薬剤師への相談が必要です';
  if (risk === 2) return '登録販売者または薬剤師が説明義務のある薬です';
  if (risk === 2.5) return '指定第2類。薬剤師・登録販売者による情報提供の努力義務があります';
  if (risk === 3) return '比較的リスクが低いとされる区分の医薬品です';
  return '';
}

function riskClass(risk: number, itype?: string): string {
  if (itype === 'functional') return 'risk-functional';
  if (itype === 'quasi') return 'risk-quasi';
  if (risk === 1) return 'risk-1';
  if (risk === 2) return 'risk-2';
  if (risk === 2.5) return 'risk-2-5';
  return 'risk-3';
}

export default async function MedicineDetailPage({ params }: Props) {
  const med = getMedicineBySlug(params.slug);
  if (!med) notFound();

  const similar = getSimilarMedicines(med, 6);
  const damageCount = await getDamageReportCountByMedicineId(med.id);

  // 成分と症状の slug マップを取得(リンク用)
  const allIngredients = getAllIngredients();
  const allSymptoms = getAllSymptoms();
  const ingSlugMap = new Map(
    allIngredients.map((i) => [i.name, i.slug])
  );
  const symSlugMap = new Map(allSymptoms.map((s) => [s.name, s.slug]));

  const breadcrumbs = [
    { name: 'ホーム', href: '/' },
    { name: '薬品一覧', href: '/medicines/' },
    {
      name: getCategoryLabel(med.cat),
      href: `/categories/${med.cat}/`,
    },
    { name: med.name },
  ];

  return (
    <>
      <JsonLd data={buildDrugJsonLd(med)} />
      <JsonLd
        data={buildBreadcrumbJsonLd(
          breadcrumbs.map((b) => ({
            name: b.name,
            url: b.href || `/medicines/${med.slug}/`,
          }))
        )}
      />

      <article className="container-narrow py-6 md:py-10">
        <Breadcrumb items={breadcrumbs} />

        {/* タイトル */}
        <header className="mb-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={riskClass(med.risk, med.itype)}>
              {riskLabel(med.risk, med.itype)}
            </span>
            <Link
              href={`/categories/${med.cat}/`}
              className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 hover:bg-brand-light hover:text-brand"
            >
              {getCategoryLabel(med.cat)}
            </Link>
            {med.drowsy && (
              <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                眠気あり・運転不可
              </span>
            )}
          </div>
          <h1 className="mb-2 text-3xl font-bold leading-tight md:text-4xl">
            {med.name}
          </h1>
          <p className="text-gray-600">{med.maker}</p>
        </header>

        {/* 効能・効果 */}
        {med.effect && (
          <section className="mb-8">
            <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
              効能・効果
            </h2>
            <p className="leading-relaxed text-gray-800">{med.effect}</p>
          </section>
        )}

        {/* 有効成分 */}
        {med.ings && med.ings.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
              有効成分
            </h2>
            <ul className="space-y-2">
              {med.ings.map((ing, i) => {
                const norm = normalizeIngredientName(ing);
                const slug = ingSlugMap.get(norm);
                return (
                  <li
                    key={i}
                    className="rounded border border-gray-200 bg-white px-4 py-2"
                  >
                    {slug ? (
                      <Link
                        href={`/ingredients/${slug}/`}
                        className="font-semibold text-brand hover:underline"
                      >
                        {ing}
                      </Link>
                    ) : (
                      <span className="font-semibold">{ing}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* 適応症状 */}
        {med.symptoms && med.symptoms.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
              適応症状
            </h2>
            <div className="flex flex-wrap gap-2">
              {med.symptoms.map((s) => {
                const slug = symSlugMap.get(s);
                return slug ? (
                  <Link
                    key={s}
                    href={`/symptoms/${slug}/`}
                    className="chip hover:border-brand"
                  >
                    #{s}
                  </Link>
                ) : (
                  <span key={s} className="chip">
                    #{s}
                  </span>
                );
              })}
            </div>
          </section>
        )}

        {/* 注意事項 */}
        {med.note && (
          <section className="mb-8">
            <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
              注意事項
            </h2>
            <div
              className={
                med.noteType === 'danger'
                  ? 'callout-danger'
                  : med.noteType === 'warn'
                  ? 'callout-warn'
                  : 'callout-tip'
              }
            >
              <div className="callout-title">
                {riskLabel(med.risk, med.itype)} ー {riskDescription(med.risk, med.itype)}
              </div>
              <p className="text-sm">{med.note}</p>
            </div>
          </section>
        )}

        {/* 要注意成分 */}
        {med.warnIngs && med.warnIngs.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
              要注意成分
            </h2>
            <div className="callout-warn">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {med.warnIngs.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* 被害報告 */}
        <section className="mb-8">
          <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
            被害報告
          </h2>
          {damageCount > 0 ? (
            <div className="rounded border border-red-200 bg-red-50 p-4">
              <p className="mb-2">
                この薬品について、<strong>{damageCount}件</strong>
                の被害報告が寄せられています。
              </p>
              <Link
                href={`/damage-reports/?medicine=${encodeURIComponent(med.name)}`}
                className="text-sm text-red-700 underline"
              >
                → 被害報告を見る
              </Link>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              現在、この薬品に関する被害報告は登録されていません。
            </p>
          )}
          <div className="mt-3">
            <Link
              href="/damage-reports/submit/"
              className="btn-outline text-sm"
            >
              被害を報告する
            </Link>
          </div>
        </section>

        {/* 類似薬品 */}
        {similar.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
              類似薬品・同成分の代替
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {similar.map((s) => (
                <MedicineCard key={s.id} med={s} />
              ))}
            </div>
          </section>
        )}

        {/* PMDA リンク */}
        {med.pmda_url && (
          <section className="mb-8 rounded border border-gray-200 bg-gray-50 p-4">
            <h2 className="mb-2 text-sm font-bold">公式情報源</h2>
            <a
              href={med.pmda_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand hover:underline"
            >
              PMDA(医薬品医療機器総合機構)で詳細を見る ↗
            </a>
          </section>
        )}

        {/* 免責 */}
        <aside className="mt-12 rounded bg-gray-50 p-4 text-xs text-gray-600">
          <p>
            当ページの情報はPMDA公開情報を元に整理したものです。実際の服用・購入前には必ず添付文書・薬剤師への相談を行ってください。本サイトは医療行為の代替を目的としていません。
          </p>
        </aside>
      </article>
    </>
  );
}
