import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/lab/',           // 試験公開は未インデックス
          '/admin/',         // 管理画面は未インデックス
          '/api/',
          '/search/',        // 検索結果ページはインデックス不要
          '/medicines/redirect-by-id/',  // リダイレクタはインデックス不要
        ],
      },
    ],
    // 目次（sitemapindex）1本と、中身の4本。どちらからでも辿れる
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      `${SITE_URL}/sitemap/0.xml`,
      `${SITE_URL}/sitemap/1.xml`,
      `${SITE_URL}/sitemap/2.xml`,
      `${SITE_URL}/sitemap/3.xml`,
    ],
  };
}
