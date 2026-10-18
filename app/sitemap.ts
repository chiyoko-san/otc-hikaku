import type { MetadataRoute } from 'next';
import { getAllMedicines, getAllIngredients, getAllSymptoms } from '@/lib/medicines';
import { CATEGORIES } from '@/lib/categories';
import { SWITCH_DRUGS } from '@/lib/switch-data';
import { getPublishedColumns } from '@/lib/supabase/columns';
import { SITE_URL } from '@/lib/seo';
import { isIndexableMedicine } from '@/lib/indexable';
import { OTC_SIMILAR_77, OTC_SIMILAR_GROUPS } from '@/lib/otc-similar-77';
import { getAllItemCodes } from '@/lib/otc-similar-items';
import { getIndexRows } from '@/lib/kana-index';
import medicinesRaw from '@/data/medicines.json';
import otcRaw from '@/data/otc-similar-items.json';
import { SITEMAP_IDS } from '@/lib/sitemap-ids';

// 配置先: app/sitemap.ts
//
// 2026-10 作り直し:
//   1) 4ファイルに分割（/sitemap/0.xml 〜 /sitemap/3.xml）。Search Console でサイトマップごとに
//      「送信/登録」の数が見えるので、上乗せ料金のページが何件登録されたかを追える。
//      0 = 固定ページ・切替・分類・成分・症状・50音一覧  1 = 上乗せ料金（成分77・用途12・処方薬688）
//      2 = 薬ページ（中身がそろっている約7,300品）     3 = コラム
//      /sitemap.xml は app/sitemap.xml/route.ts が4本をまとめた目次（sitemapindex）を返す。
//   2) lastModified を本当の更新日に。以前は全ページが「ビルドした日時」で、Google から見ると
//      毎日全ページが更新されたことになり、更新日を信用されなくなっていた。
//      薬・成分・症状・分類 → data/medicines.json の updated_at
//      上乗せ料金           → data/otc-similar-items.json の generated_at
//      コラム               → 各記事の updated_at（無ければ date）
//      固定ページ           → STATIC_UPDATED（ページの文言を変えたら日付を進める）
//   priority / changeFrequency は Google が使わないので外した。

export const revalidate = 3600;

/** 固定ページの最終更新日。トップや制度説明の文言を変えたらここを進める */
const STATIC_UPDATED = '2026-10-17';

const MEDICINES_UPDATED = ((medicinesRaw as { updated_at?: string }).updated_at ?? STATIC_UPDATED).slice(0, 10);
const OTC_UPDATED = ((otcRaw as { generated_at?: string }).generated_at ?? STATIC_UPDATED).slice(0, 10);

export function generateSitemaps() {
  return SITEMAP_IDS.map((id) => ({ id }));
}

function entry(path: string, lastModified: string): MetadataRoute.Sitemap[number] {
  return { url: `${SITE_URL}${path}`, lastModified };
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  if (id === 0) {
    const staticPaths = [
      '/', '/medicines/', '/medicines/index/', '/switch/', '/symptoms/', '/ingredients/', '/columns/',
      '/damage-reports/', '/damage-reports/submit/', '/akinator/', '/about/', '/privacy/', '/contact/',
      '/otc-similar/', '/otc-similar/all/', '/otc-similar/quick/', '/otc-similar/ranking/',
      '/otc-similar/name/', '/otc-similar/use/', '/otc-similar/simulator/', '/otc-similar/photo/', '/otc-similar/pharmacy/',
    ];
    return [
      ...staticPaths.map((p) => entry(p, p.startsWith('/otc-similar/') ? OTC_UPDATED : STATIC_UPDATED)),
      ...SWITCH_DRUGS.map((d) => entry(`/switch/${d.slug}/`, d.updated ?? OTC_UPDATED)),
      ...CATEGORIES.map((c) => entry(`/categories/${c.id}/`, MEDICINES_UPDATED)),
      ...getAllIngredients().map((i) => entry(`/ingredients/${i.slug}/`, MEDICINES_UPDATED)),
      ...getAllSymptoms().map((s) => entry(`/symptoms/${s.slug}/`, MEDICINES_UPDATED)),
      ...getIndexRows().map((r) => entry(`/medicines/index/${r.key}/`, MEDICINES_UPDATED)),
    ];
  }

  if (id === 1) {
    return [
      ...OTC_SIMILAR_GROUPS.map((g) => entry(`/otc-similar/use/${g.key}/`, OTC_UPDATED)),
      ...OTC_SIMILAR_77.map((i) => entry(`/otc-similar/ingredient/${i.no}/`, OTC_UPDATED)),
      ...getAllItemCodes().map((code) => entry(`/otc-similar/item/${code}/`, OTC_UPDATED)),
    ];
  }

  if (id === 2) {
    return getAllMedicines()
      .filter((m) => isIndexableMedicine(m))
      .map((m) => entry(`/medicines/${m.slug}/`, MEDICINES_UPDATED));
  }

  // id === 3: コラム
  const columns = await getPublishedColumns(500);
  return columns.map((c) =>
    entry(`/columns/${c.slug || c.id}/`, (c.updated_at || c.date || STATIC_UPDATED).slice(0, 10))
  );
}
