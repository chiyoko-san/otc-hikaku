import type { MetadataRoute } from 'next';
import {
  getAllMedicines,
  getAllIngredients,
  getAllSymptoms,
} from '@/lib/medicines';
import { CATEGORIES } from '@/lib/categories';
import { SWITCH_DRUGS } from '@/lib/switch-data';
import { getAllColumnSlugs, getPublishedColumns } from '@/lib/supabase/columns';
import { SITE_URL } from '@/lib/seo';

export const revalidate = 3600; // 1時間ごとに再生成

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();

  // 固定ページ
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, priority: 1.0, changeFrequency: 'daily' },
    { url: `${SITE_URL}/medicines/`, lastModified: now, priority: 0.9, changeFrequency: 'weekly' },
    { url: `${SITE_URL}/switch/`, lastModified: now, priority: 0.9, changeFrequency: 'weekly' },
    { url: `${SITE_URL}/symptoms/`, lastModified: now, priority: 0.9, changeFrequency: 'weekly' },
    { url: `${SITE_URL}/ingredients/`, lastModified: now, priority: 0.9, changeFrequency: 'weekly' },
    { url: `${SITE_URL}/columns/`, lastModified: now, priority: 0.8, changeFrequency: 'daily' },
    { url: `${SITE_URL}/damage-reports/`, lastModified: now, priority: 0.7, changeFrequency: 'daily' },
    { url: `${SITE_URL}/damage-reports/submit/`, lastModified: now, priority: 0.5, changeFrequency: 'monthly' },
    { url: `${SITE_URL}/akinator/`, lastModified: now, priority: 0.7, changeFrequency: 'monthly' },
    { url: `${SITE_URL}/about/`, lastModified: now, priority: 0.4, changeFrequency: 'monthly' },
    { url: `${SITE_URL}/privacy/`, lastModified: now, priority: 0.3, changeFrequency: 'yearly' },
    { url: `${SITE_URL}/contact/`, lastModified: now, priority: 0.3, changeFrequency: 'yearly' },
  ];

  // 処方薬→市販薬 切替ページ (制度変更で伸びる新規需要の主力)
  const switchPages: MetadataRoute.Sitemap = SWITCH_DRUGS.map((d) => ({
    url: `${SITE_URL}/switch/${d.slug}/`,
    lastModified: now,
    priority: 0.9,
    changeFrequency: 'weekly' as const,
  }));

  // カテゴリページ
  const categoryPages: MetadataRoute.Sitemap = CATEGORIES.map((c) => ({
    url: `${SITE_URL}/categories/${c.id}/`,
    lastModified: now,
    priority: 0.7,
    changeFrequency: 'weekly' as const,
  }));

  // 薬品詳細ページ (SEO 主力 622件)
  const medicinePages: MetadataRoute.Sitemap = getAllMedicines().map((m) => ({
    url: `${SITE_URL}/medicines/${m.slug}/`,
    lastModified: now,
    priority: 0.9,
    changeFrequency: 'weekly' as const,
  }));

  // 成分ページ
  const ingredientPages: MetadataRoute.Sitemap = getAllIngredients().map((i) => ({
    url: `${SITE_URL}/ingredients/${i.slug}/`,
    lastModified: now,
    priority: 0.8,
    changeFrequency: 'weekly' as const,
  }));

  // 症状ページ
  const symptomPages: MetadataRoute.Sitemap = getAllSymptoms().map((s) => ({
    url: `${SITE_URL}/symptoms/${s.slug}/`,
    lastModified: now,
    priority: 0.8,
    changeFrequency: 'weekly' as const,
  }));

  // コラム(最新の日付を利用)
  const columns = await getPublishedColumns(500);
  const columnPages: MetadataRoute.Sitemap = columns.map((c) => ({
    url: `${SITE_URL}/columns/${c.slug || c.id}/`,
    lastModified: c.updated_at || c.date || now,
    priority: 0.6,
    changeFrequency: 'monthly' as const,
  }));

  return [
    ...staticPages,
    ...switchPages,
    ...categoryPages,
    ...medicinePages,
    ...ingredientPages,
    ...symptomPages,
    ...columnPages,
  ];
}
