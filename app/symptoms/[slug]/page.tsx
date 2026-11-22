import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  getAllSymptoms,
  getSymptomBySlug,
  getAllMedicines,
  getLegacySymptomSlugMap,
} from '@/lib/medicines';
import { MedicineGrid } from '@/components/medicine/MedicineGrid';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { JsonLd } from '@/components/layout/JsonLd';
import { buildMetadata, buildBreadcrumbJsonLd, SITE_URL } from '@/lib/seo';
import { symptomIconKey } from '@/lib/icon-map';
import { Icon } from '@/components/icons/Icon';

// 一覧に無いページもアクセス時に生成する
export const dynamicParams = true;

// コラムの追加・更新を1日1回反映する
export const revalidate = 86400;

// ビルド時に作るのは薬の多い上位800件。残りは初回アクセス時に生成される
// 2026-10 修正: 以前は薬のスラッグを返していて（コピペ由来）、症状ページとしては存在しない
// URLを毎ビルド800件ぶん404として生成していた。症状自体のスラッグを、薬の多い順に800件まで返す。
export async function generateStaticParams() {
  const all = [...getAllSymptoms()].sort(
    (a, b) => (b.medicineIds?.length ?? 0) - (a.medicineIds?.length ?? 0)
  );
  return all.slice(0, 800).map((x) => ({ slug: x.slug }));
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

// 2026-11-21: 機能性表示食品は医薬品ではないので「効く市販薬」とは書かない。
//   「腸内環境」「血圧」「中性脂肪」などは掲載品がすべて機能性表示食品で、
//   以前は「腸内環境に効く市販薬 20種」という題名のまま、本文には1品も表示されていなかった
//   （区分1〜3類の薬だけを並べていたため）。
function splitByType(sym: { medicineIds: number[] }) {
  const medMap = new Map(getAllMedicines().map((m) => [m.id, m]));
  const all = sym.medicineIds.map((id) => medMap.get(id)!).filter(Boolean);
  const foods = all.filter((m) => m.itype === 'functional');
  const meds = all.filter((m) => m.itype !== 'functional');
  return { meds, foods, foodOnly: meds.length === 0 && foods.length > 0 };
}

export function generateMetadata({ params }: Props): Metadata {
  const sym = getSymptomBySlug(params.slug);
  if (!sym) return { title: '症状が見つかりません' };

  const { meds, foods, foodOnly } = splitByType(sym);
  if (foodOnly) {
    return buildMetadata({
      title: `${sym.name}が気になる方向けの機能性表示食品 ${foods.length}品|届出内容を比較`,
      description: `「${sym.name}」について機能性の届出がある機能性表示食品 ${foods.length}品を、成分と届出表示で比較。機能性表示食品は医薬品ではなく、病気の治療や予防を目的としたものではありません。`,
      path: `/symptoms/${sym.slug}/`,
    });
  }

  return buildMetadata({
    title: `${sym.name}に効く市販薬 ${meds.length}種|成分比較`,
    description: `${sym.name}の症状に適応のある市販薬(OTC医薬品) ${meds.length}種類を成分・リスク区分別に比較。眠気・副作用情報も掲載。`,
    path: `/symptoms/${sym.slug}/`,
  });
}

export default async function SymptomDetailPage({ params }: Props) {
  const sym = getSymptomBySlug(params.slug);
  if (!sym) {
    // 古いURL（/symptoms/unnamed-45/ など）は新しいURLへ恒久転送する
    const moved = getLegacySymptomSlugMap().get(params.slug);
    if (moved) permanentRedirect(`/symptoms/${moved}/`);
    notFound();
  }

  const { meds, foods, foodOnly } = splitByType(sym);
  const symIcon = symptomIconKey(sym.name);

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
  // 区分が取れていない薬（risk が 1〜3類以外）は「区分は製品で確認」としてまとめて出す
  const byRisk: Record<string, typeof meds> = { '1': [], '2': [], '2.5': [], '3': [] };
  const unknownRisk: typeof meds = [];
  for (const m of meds) {
    const k = String(m.risk);
    if (byRisk[k]) byRisk[k].push(m);
    else unknownRisk.push(m);
  }

  const breadcrumbs = [
    { name: 'ホーム', href: '/' },
    { name: '症状から選ぶ', href: '/symptoms/' },
    ...(sym.group ? [{ name: sym.group }] : []),
    { name: sym.name },
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': foodOnly ? 'CollectionPage' : 'MedicalCondition',
    name: foodOnly ? `${sym.name}が気になる方向けの機能性表示食品` : sym.name,
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
          <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold md:text-4xl">
            {symIcon && (
              <span className="flex flex-none rounded-xl bg-brand-light p-2 text-brand">
                <Icon name={symIcon} size={40} />
              </span>
            )}
            <span>
              {foodOnly
                ? `${sym.name}が気になる方向けの機能性表示食品`
                : `${sym.name}に効く市販薬`}
            </span>
          </h1>
          {foodOnly ? (
            <p className="text-gray-600">
              「{sym.name}」について機能性の届出がある機能性表示食品 {foods.length} 品を掲載しています。
              機能性表示食品は医薬品ではありません。病気の治療や予防を目的としたものではなく、
              治療中の方・薬を飲んでいる方は医師や薬剤師に相談してください。
            </p>
          ) : (
            <p className="text-gray-600">
              {sym.name}の症状に適応のある市販薬 {meds.length} 種類を掲載しています。成分・リスク区分から選び分けの参考にしてください。
            </p>
          )}
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
              <MedicineGrid meds={list} />
            </section>
          );
        })}

        {unknownRisk.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-1 border-l-4 border-brand pl-3 text-xl font-bold">
              区分は製品で確認({unknownRisk.length}件)
            </h2>
            <p className="mb-4 pl-3 text-sm text-gray-500">
              リスク区分のデータが取れていない製品です。区分は製品の外箱・添付文書で確認してください。
            </p>
            <MedicineGrid meds={unknownRisk} />
          </section>
        )}

        {foods.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-1 border-l-4 border-brand pl-3 text-xl font-bold">
              機能性表示食品({foods.length}件)
            </h2>
            {!foodOnly && (
              <p className="mb-4 pl-3 text-sm text-gray-500">
                機能性表示食品は医薬品ではありません。病気の治療や予防を目的としたものではありません。
              </p>
            )}
            <MedicineGrid meds={foods} />
          </section>
        )}

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
