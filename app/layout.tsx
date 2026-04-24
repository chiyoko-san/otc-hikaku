import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { JsonLd } from '@/components/layout/JsonLd';
import { buildWebsiteJsonLd, SITE_URL, SITE_NAME, SITE_DESCRIPTION, DEFAULT_OGP } from '@/lib/seo';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}|市販薬・成分比較サイト`,
    template: `%s|${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    locale: 'ja_JP',
    type: 'website',
    url: SITE_URL,
    images: [{ url: DEFAULT_OGP, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@kusuri_compass',
  },
  icons: { icon: '/favicon.ico' },
  verification: {
    // Google Search Console の認証コードを入れる場所
    // google: 'your-verification-code',
  },
};

const GA_ID = 'G-2G7T178ZNY';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <JsonLd data={buildWebsiteJsonLd()} />
      </head>
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />

        {/* Google Analytics */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
