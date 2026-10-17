import { SITE_URL } from '@/lib/seo';
import { SITEMAP_IDS } from '@/lib/sitemap-ids';

// 配置先: app/sitemap.xml/route.ts  →  /sitemap.xml
// 4本に分けたサイトマップ（/sitemap/0.xml〜3.xml）の目次。Search Console にはこのURLを1つ送ればよい。

export const revalidate = 3600;

export function GET() {
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    SITEMAP_IDS.map((id) => `  <sitemap><loc>${SITE_URL}/sitemap/${id}.xml</loc></sitemap>`).join('\n') +
    `\n</sitemapindex>\n`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
