import type { Metadata } from 'next';
import { ContactForm } from '@/components/common/ContactForm';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'お問い合わせ',
  description:
    'クスリノコンパスへのご意見・情報訂正依頼・取材申込など、お問い合わせフォームよりお送りください。',
  path: '/contact/',
});

export default function ContactPage() {
  return (
    <div className="container-narrow py-10">
      <Breadcrumb
        items={[{ name: 'ホーム', href: '/' }, { name: 'お問い合わせ' }]}
      />
      <h1 className="mb-4 text-3xl font-bold md:text-4xl">お問い合わせ</h1>
      <p className="mb-6 text-gray-600">
        サイトに関するご意見・掲載情報の訂正依頼・取材の申し込みなど、お気軽にご連絡ください。
      </p>
      <ContactForm />
    </div>
  );
}
