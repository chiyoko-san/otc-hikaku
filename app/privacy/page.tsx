import type { Metadata } from 'next';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'プライバシーポリシー',
  description: 'クスリノコンパスにおける個人情報の取扱いと、アクセス解析ツールの利用について。',
  path: '/privacy/',
});

export default function PrivacyPage() {
  return (
    <div className="container-narrow py-10">
      <Breadcrumb
        items={[{ name: 'ホーム', href: '/' }, { name: 'プライバシーポリシー' }]}
      />

      <h1 className="mb-6 text-3xl font-bold md:text-4xl">
        プライバシーポリシー
      </h1>

      <div className="space-y-6 leading-relaxed">
        <section>
          <h2 className="mb-2 border-l-4 border-brand pl-3 text-xl font-bold">
            個人情報の収集について
          </h2>
          <p>
            本サイトでは、お問い合わせフォーム・被害報告フォームの送信時に必要最小限の情報を収集します。これらの情報は、お問い合わせへの回答・統計情報の作成・サイト運営改善以外の目的には使用しません。
          </p>
        </section>

        <section>
          <h2 className="mb-2 border-l-4 border-brand pl-3 text-xl font-bold">
            アクセス解析について
          </h2>
          <p>
            本サイトでは、Google LLC が提供する「Google Analytics 4」を利用してアクセス状況を把握しています。Google Analytics は Cookie を使用して匿名の利用情報を収集します。個人を特定する情報は含まれません。
          </p>
          <p>
            Cookie を無効にすることで、情報収集を拒否することができます。
          </p>
        </section>

        <section>
          <h2 className="mb-2 border-l-4 border-brand pl-3 text-xl font-bold">
            第三者提供について
          </h2>
          <p>
            法令に基づく場合を除き、収集した情報を第三者に提供することはありません。
          </p>
        </section>

        <section>
          <h2 className="mb-2 border-l-4 border-brand pl-3 text-xl font-bold">
            本ポリシーの変更
          </h2>
          <p>
            本プライバシーポリシーの内容は、必要に応じて予告なく変更する場合があります。最新の内容は常に本ページにてご確認いただけます。
          </p>
        </section>

        <section>
          <h2 className="mb-2 border-l-4 border-brand pl-3 text-xl font-bold">
            お問い合わせ
          </h2>
          <p>
            本プライバシーポリシーに関するお問い合わせは、
            <a href="/contact/" className="text-brand underline">
              お問い合わせフォーム
            </a>
            よりお願いいたします。
          </p>
        </section>
      </div>
    </div>
  );
}
