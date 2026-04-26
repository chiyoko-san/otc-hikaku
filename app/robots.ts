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
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
