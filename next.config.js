/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 画像最適化: 外部画像ドメイン許可
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'glxhggfxxwpfmwqoulyy.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  // 末尾スラッシュを統一(SEO的に重要)
  trailingSlash: true,

  // 旧URL → 新URL 301リダイレクト (SEO評価引き継ぎ)
  async redirects() {
    return [
      // --- コラム ---
      {
        source: '/',
        has: [
          { type: 'query', key: 'pg', value: 'column' },
          { type: 'query', key: 'col', value: '(?<slug>.+)' },
        ],
        destination: '/columns/:slug/',
        permanent: true,
      },
      {
        source: '/',
        has: [{ type: 'query', key: 'pg', value: 'column' }],
        destination: '/columns/',
        permanent: true,
      },

      // --- 薬品(ID→slug解決用の中間ページ) ---
      {
        source: '/',
        has: [{ type: 'query', key: 'med', value: '(?<id>\\d+)' }],
        destination: '/medicines/redirect-by-id/:id/',
        permanent: true,
      },

      // --- 被害報告 ---
      {
        source: '/',
        has: [{ type: 'query', key: 'pg', value: 'damage-list' }],
        destination: '/damage-reports/',
        permanent: true,
      },
      {
        source: '/',
        has: [{ type: 'query', key: 'pg', value: 'damage-report' }],
        destination: '/damage-reports/submit/',
        permanent: true,
      },

      // --- 症状ガイド ---
      {
        source: '/',
        has: [{ type: 'query', key: 'pg', value: 'guide' }],
        destination: '/symptoms/',
        permanent: true,
      },

      // --- 検索 ---
      {
        source: '/',
        has: [
          { type: 'query', key: 'pg', value: 'search' },
          { type: 'query', key: 'q', value: '(?<q>.+)' },
        ],
        destination: '/search/?q=:q',
        permanent: true,
      },

      // --- 固定ページ ---
      {
        source: '/',
        has: [{ type: 'query', key: 'pg', value: 'privacy' }],
        destination: '/privacy/',
        permanent: true,
      },
      {
        source: '/',
        has: [{ type: 'query', key: 'pg', value: 'about' }],
        destination: '/about/',
        permanent: true,
      },
      {
        source: '/',
        has: [{ type: 'query', key: 'pg', value: 'contact' }],
        destination: '/contact/',
        permanent: true,
      },
    ];
  },

  // /lab/* は静的ファイルとして既存配信を継続(Next.jsの対象外)
  // public/lab/ に配置すれば自動で配信される
};

module.exports = nextConfig;
