import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  getAllMedicines,
  getMedicineBySlug,
  getSimilarMedicinesWithReason,
  INGREDIENT_DICT,
} from '@/lib/medicines';
import { findSwitchDrugsForMedicine } from '@/lib/switch-data';
import { getAllIngredients } from '@/lib/medicines';
import { getAllSymptoms } from '@/lib/medicines';
import { getDamageReportCountByMedicineId } from '@/lib/supabase/damage-reports';
import { getCategoryLabel } from '@/lib/categories';
import { normalizeIngredientName } from '@/lib/slug';
import {
  normalizeDosageForm,
  DOSAGE_FORM_LABELS,
  type DosageFormKey,
} from '@/lib/dosageForm';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { JsonLd } from '@/components/layout/JsonLd';
import {
  buildMetadata,
  buildDrugJsonLd,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  SITE_URL,
} from '@/lib/seo';

// ISR: 1日に1回再生成
export const revalidate = 86400;

// 一覧に無いページもアクセス時に生成する
export const dynamicParams = true;

// ビルド時に作るのは主要な製品のみ。
// 残りは初回アクセス時に生成され、以後キャッシュされる
export async function generateStaticParams() {
  const enriched = getAllMedicines();
  const priority = enriched
    .filter((m) => m.ings && m.ings.length > 0 && m.effect)
    .slice(0, 800);
  return priority.map((m) => ({ slug: m.slug }));
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

  const desc = `${med.name}(${med.maker})の成分・効能効果・リスク区分・類似薬との比較。${(med.effect || '').slice(0, 100)}`.trim();

  return buildMetadata({
    title: titleBase,
    description: desc,
    path: `/medicines/${med.slug}/`,
    type: 'article',
  });
}

function riskLabel(risk: number, itype?: string): string {
  if (itype === 'functional') return '機能性表示食品';
  if (itype === 'designated_quasi') return '指定医薬部外品';
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
  if (itype === 'designated_quasi')
    return '指定医薬部外品。かつて医薬品だった成分を含み、コンビニ等でも購入できる区分です';
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
  if (itype === 'designated_quasi') return 'risk-dquasi';
  if (itype === 'quasi') return 'risk-quasi';
  if (risk === 1) return 'risk-1';
  if (risk === 2) return 'risk-2';
  if (risk === 2.5) return 'risk-2-5';
  if (risk === 3) return 'risk-3';
  return 'risk-none';
}

export default async function MedicineDetailPage({ params }: Props) {
  const med = getMedicineBySlug(params.slug);
  if (!med) notFound();

  // ===== 類似薬を剤形で振り分ける =====
  // 点眼薬と内服薬が同じ成分を含んでいても、配合量を直接比較しても意味がないため、
  // 比較表は同一剤形のみで構成し、他剤形はリンク一覧として別途案内する。
  const formOf = (m: { name: string; cat?: string | null }): DosageFormKey =>
    normalizeDosageForm(m.name, m.cat ?? null, (m as { form?: string | null }).form ?? null);

  const baseForm = formOf(med);
  // 剤形で絞り込む分、候補は多めに取得する
  const similarAll = getSimilarMedicinesWithReason(med, 40);

  // 自分の剤形が判定できない製品では従来通り全件を対象にする(空表を出さないため)
  const similar =
    baseForm === 'other'
      ? similarAll.slice(0, 6)
      : similarAll.filter((s) => formOf(s.med) === baseForm).slice(0, 6);

  // 他剤形にある同成分の製品(剤形ごとにグループ化)
  const otherFormGroups =
    baseForm === 'other'
      ? []
      : (() => {
          const map = new Map<DosageFormKey, typeof similarAll>();
          for (const s of similarAll) {
            if (!s.sameIngredient) continue;
            const f = formOf(s.med);
            if (f === baseForm || f === 'other') continue;
            const list = map.get(f) || [];
            if (list.length >= 6) continue;
            map.set(f, [...list, s]);
          }
          return [...map.entries()];
        })();

  // ===== 成分量比較マトリクス用データ =====
  // 列: この薬 + 類似5製品 / 行: 出現順のユニーク成分(この薬の成分を先頭に)
  const compareCols = [
    { med, relation: null as null | boolean },
    ...similar.slice(0, 5).map((s) => ({ med: s.med, relation: s.sameIngredient })),
  ];
  const ingRowSeen = new Set<string>();
  const ingRows: string[] = [];
  for (const col of compareCols) {
    for (const ing of col.med.ings || []) {
      const n = normalizeIngredientName(ing);
      if (!ingRowSeen.has(n)) {
        ingRowSeen.add(n);
        ingRows.push(n);
      }
    }
  }
  const ingRowsCapped = ingRows.slice(0, 14);
  const amountOf = (m: typeof med, norm: string): string | null => {
    const hit = (m.ings || []).find(
      (i) => normalizeIngredientName(i) === norm
    );
    if (!hit) return null;
    const mm = hit.match(/[(（]([^)）]+)[)）]/);
    return mm ? mm[1] : '配合';
  };
  const relatedSwitch = findSwitchDrugsForMedicine(med);
  const damageCount = await getDamageReportCountByMedicineId(med.id);

  // 発売元(販売会社)。複数ある場合は「A / B」で入っている
  const sellers = (med.seller || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s !== med.maker);

  // FAQ 構造化データ (リッチリザルト対策)
  const sameIngNames = similar
    .filter((s) => s.sameIngredient)
    .slice(0, 3)
    .map((s) => s.med.name);
  const faqs = [
    {
      q: `${med.name}は${riskLabel(med.risk, med.itype)}ですか?`,
      a: `${med.name}は${riskLabel(med.risk, med.itype)}です。${riskDescription(med.risk, med.itype)}。`,
    },
    {
      q: `${med.name}を飲むと眠くなりますか?`,
      a: med.drowsy
        ? `${med.name}は眠気が出ることがある製品です。服用後の車の運転や機械の操作は避けてください。`
        : `${med.name}は眠気の注意表示がない製品です。ただし体質により眠気を感じる場合は運転を避けてください。`,
    },
    ...(sellers.length > 0
      ? [
          {
            q: `${med.name}はどこの製品ですか?`,
            a: `${med.name}は${med.maker}が製造販売し、${sellers.join('、')}が販売しています。`,
          },
        ]
      : []),
    ...(sameIngNames.length > 0
      ? [
          {
            q: `${med.name}と同じ成分の市販薬はありますか?`,
            a: `同じ有効成分を含む市販薬として${sameIngNames.join('、')}などがあります。含有量や剤形が異なる場合があるため、詳細は各製品ページをご確認ください。`,
          },
        ]
      : []),
  ];

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
      <JsonLd data={buildFaqJsonLd(faqs)} />
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
              className="pill-muted hover:bg-brand-light hover:text-brand-deep"
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

          {/* 製造販売元 / 発売元 */}
          <dl className="space-y-0.5 text-sm">
            {med.maker && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-gray-500">製造販売元</dt>
                <dd className="text-gray-700">{med.maker}</dd>
              </div>
            )}
            {sellers.length > 0 && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-gray-500">発売元</dt>
                <dd className="text-gray-700">{sellers.join(' / ')}</dd>
              </div>
            )}
          </dl>
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

        {/* 詳細情報が未整備の製品への注記 */}
        {!med.effect && (
          <div className="callout-info mb-8">
            <div className="callout-title">基本情報のみ掲載しています</div>
            <p className="text-sm">
              この製品は効能・詳細情報の整備を進めている段階です。使用にあたっては製品の添付文書をご確認ください。
            </p>
          </div>
        )}

        {/* 有効成分 */}
        {med.ings && med.ings.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
              有効成分
            </h2>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="bg-brand-light/60 text-left text-brand-deep">
                    <th className="px-4 py-2.5 font-bold">成分名</th>
                    <th className="w-32 px-4 py-2.5 font-bold">分量</th>
                    <th className="px-4 py-2.5 font-bold">はたらき</th>
                  </tr>
                </thead>
                <tbody>
                  {med.ings.map((ing, i) => {
                    const norm = normalizeIngredientName(ing);
                    const slug = ingSlugMap.get(norm);
                    const amountMatch = ing.match(/[(（]([^)）]+)[)）]/);
                    const amount = amountMatch ? amountMatch[1] : '—';
                    const desc =
                      INGREDIENT_DICT[norm] ||
                      INGREDIENT_DICT[ing.replace(/[(（][^)）]*[)）]/g, '').trim()] ||
                      '—';
                    return (
                      <tr
                        key={i}
                        className="border-t border-gray-100 align-top"
                      >
                        <td className="px-4 py-2.5">
                          {slug ? (
                            <Link
                              href={`/ingredients/${slug}/`}
                              className="font-semibold text-brand-dark hover:underline"
                            >
                              {norm}
                            </Link>
                          ) : (
                            <span className="font-semibold text-brand-ink">
                              {norm}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">
                          {amount}
                        </td>
                        <td className="px-4 py-2.5 leading-relaxed text-gray-600">
                          {desc}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 処方薬からの切替導線 */}
        {relatedSwitch.length > 0 && (
          <section className="hero-card mb-8">
            <h2 className="mb-2 text-sm font-bold text-brand-dark">
              処方薬からの切替をお考えの方へ
            </h2>
            <p className="mb-2 text-sm text-gray-700">
              この製品は、処方薬
              {relatedSwitch.map((s) => `「${s.rxName}」`).join('')}
              と同じ系統の有効成分を含みます。処方薬との用量・剤形の違いはこちら:
            </p>
            <ul className="space-y-1">
              {relatedSwitch.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/switch/${s.slug}/`}
                    className="text-sm font-semibold text-brand hover:underline"
                  >
                    → {s.rxName}と同じ成分の市販薬を見る
                  </Link>
                </li>
              ))}
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

        {/* 類似薬品(同じ剤形のみ) */}
        {similar.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-1 border-l-4 border-brand pl-3 text-xl font-bold">
              類似薬品・同成分の代替
            </h2>
            {baseForm !== 'other' && (
              <p className="mb-3 pl-3 text-sm text-gray-500">
                {DOSAGE_FORM_LABELS[baseForm]}どうしで比較しています
              </p>
            )}
            <div className="card overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-brand-light/60 text-brand-deep">
                    <th className="sticky left-0 z-10 min-w-[9rem] bg-brand-light px-3 py-2.5 text-left font-bold md:min-w-[11rem]">
                      成分(配合量)
                    </th>
                    {compareCols.map((col, i) => (
                      <th
                        key={col.med.id}
                        className={`min-w-[8rem] px-3 py-2.5 text-left align-top font-bold ${
                          i === 0 ? 'bg-brand-light' : ''
                        }`}
                      >
                        {i === 0 ? (
                          <span className="text-brand-ink">{col.med.name}</span>
                        ) : (
                          <Link
                            href={`/medicines/${col.med.slug}/`}
                            className="text-brand-dark hover:underline"
                          >
                            {col.med.name}
                          </Link>
                        )}
                        <span className="mt-1 block">
                          {i === 0 ? (
                            <span className="rounded bg-brand-dark px-1.5 py-0.5 text-xs font-semibold text-white">
                              この薬
                            </span>
                          ) : (
                            <span
                              className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                                col.relation
                                  ? 'bg-white text-brand-deep ring-1 ring-brand'
                                  : 'bg-white text-gray-500 ring-1 ring-gray-300'
                              }`}
                            >
                              {col.relation ? '同成分' : '同カテゴリ'}
                            </span>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* メタ行: 区分・眠気 */}
                  <tr className="border-t border-gray-100">
                    <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-gray-600">
                      リスク区分
                    </th>
                    {compareCols.map((col, i) => (
                      <td
                        key={col.med.id}
                        className={`px-3 py-2 ${i === 0 ? 'bg-brand-light/30' : ''}`}
                      >
                        <span className={riskClass(col.med.risk, col.med.itype)}>
                          {riskLabel(col.med.risk, col.med.itype)
                            .replace('医薬品', '')
                            .replace('分類', '')}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-gray-100">
                    <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-gray-600">
                      眠気成分
                    </th>
                    {compareCols.map((col, i) => (
                      <td
                        key={col.med.id}
                        className={`px-3 py-2 ${i === 0 ? 'bg-brand-light/30' : ''}`}
                      >
                        {col.med.drowsy ? (
                          <span className="font-semibold text-risk-2x">あり</span>
                        ) : (
                          <span className="text-gray-500">なし</span>
                        )}
                      </td>
                    ))}
                  </tr>
                  {/* 成分行 */}
                  {ingRowsCapped.map((norm) => {
                    const inBase = amountOf(med, norm) !== null;
                    return (
                      <tr
                        key={norm}
                        className={`border-t border-gray-100 ${
                          inBase ? '' : 'bg-gray-50/60'
                        }`}
                      >
                        <th className="sticky left-0 z-10 max-w-[13rem] bg-white px-3 py-2 text-left align-top text-xs font-semibold leading-snug text-brand-ink">
                          {norm}
                        </th>
                        {compareCols.map((col, i) => {
                          const amt = amountOf(col.med, norm);
                          return (
                            <td
                              key={col.med.id}
                              className={`whitespace-nowrap px-3 py-2 align-top text-xs ${
                                i === 0 ? 'bg-brand-light/30' : ''
                              } ${amt ? 'font-semibold text-brand-ink' : 'text-gray-300'}`}
                            >
                              {amt || '—'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              配合量は1回量・1日量など製品ごとに基準が異なる場合があります。
              {ingRows.length > ingRowsCapped.length &&
                `主要${ingRowsCapped.length}成分のみ表示しています。`}
              使用の可否は各製品ページと添付文書をご確認ください。
            </p>
          </section>
        )}

        {/* 他の剤形にある同成分の製品 */}
        {otherFormGroups.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-1 border-l-4 border-brand pl-3 text-xl font-bold">
              同じ成分を含む他の剤形
            </h2>
            <p className="mb-3 pl-3 text-sm text-gray-500">
              剤形が異なるため配合量の直接比較はできません。用途が異なる点にご注意ください。
            </p>
            <div className="space-y-4">
              {otherFormGroups.map(([form, list]) => (
                <div key={form} className="card p-4">
                  <div className="mb-2 text-sm font-bold text-brand-deep">
                    {DOSAGE_FORM_LABELS[form]}
                  </div>
                  <ul className="space-y-1.5">
                    {list.map((s) => (
                      <li
                        key={s.med.id}
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        <Link
                          href={`/medicines/${s.med.slug}/`}
                          className="font-semibold text-brand-dark hover:underline"
                        >
                          {s.med.name}
                        </Link>
                        <span className={riskClass(s.med.risk, s.med.itype)}>
                          {riskLabel(s.med.risk, s.med.itype)
                            .replace('医薬品', '')
                            .replace('分類', '')}
                        </span>
                        {s.med.maker && (
                          <span className="text-xs text-gray-500">
                            {s.med.maker}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* PMDA リンク */}
        {med.pmda_url && (
          <section className="card-static mb-8 p-4">
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
