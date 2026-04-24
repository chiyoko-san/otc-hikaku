import type { Metadata } from 'next';

export const SITE_URL = 'https://kusuri-compass.com';
export const SITE_NAME = 'クスリノコンパス';
export const SITE_DESCRIPTION =
  '市販薬7,500品を成分・効能・リスク区分から無料で比較。広告なし・PMDA公開情報ベース。';
export const DEFAULT_OGP = `${SITE_URL}/ogp.png`;

export function buildMetadata(opts: {
  title: string;
  description?: string;
  path: string;
  image?: string;
  noindex?: boolean;
  type?: 'website' | 'article';
}): Metadata {
  const { title, description, path, image, noindex, type = 'website' } = opts;
  const url = `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const fullTitle = title.includes(SITE_NAME) ? title : `${title}|${SITE_NAME}`;
  const desc = description || SITE_DESCRIPTION;
  const img = image || DEFAULT_OGP;

  return {
    title: fullTitle,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      title: fullTitle,
      description: desc,
      url,
      siteName: SITE_NAME,
      images: [{ url: img, width: 1200, height: 630 }],
      locale: 'ja_JP',
      type,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: desc,
      images: [img],
    },
    robots: noindex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}

// JSON-LD 生成ヘルパー

export function buildBreadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${SITE_URL}${item.url}`,
    })),
  };
}

export function buildDrugJsonLd(med: {
  name: string;
  maker: string;
  ings: string[];
  effect: string;
  slug: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Drug',
    name: med.name,
    activeIngredient: med.ings,
    manufacturer: {
      '@type': 'Organization',
      name: med.maker,
    },
    description: med.effect,
    url: `${SITE_URL}/medicines/${med.slug}/`,
  };
}

export function buildArticleJsonLd(col: {
  title: string;
  summary: string | null;
  date: string | null;
  updated_at: string;
  slug: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: col.title,
    description: col.summary || '',
    datePublished: col.date || col.updated_at,
    dateModified: col.updated_at,
    author: { '@type': 'Organization', name: SITE_NAME },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: DEFAULT_OGP },
    },
    mainEntityOfPage: `${SITE_URL}/columns/${col.slug}/`,
  };
}

export function buildWebsiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}
