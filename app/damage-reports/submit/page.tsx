import type { Metadata } from 'next';
import { DamageReportForm } from '@/components/damage-report/DamageReportForm';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: '市販薬・健康食品の被害を報告する',
  description:
    '市販薬・健康食品の副作用・定期購入トラブル・広告表現の問題など、利用者の声を集めています。匿名投稿可能。',
  path: '/damage-reports/submit/',
});

export default function DamageReportSubmitPage() {
  return (
    <div className="container-narrow py-6 md:py-10">
      <Breadcrumb
        items={[
          { name: 'ホーム', href: '/' },
          { name: '被害報告', href: '/damage-reports/' },
          { name: '報告する' },
        ]}
      />
      <header className="mb-6">
        <h1 className="mb-2 text-3xl font-bold md:text-4xl">
          被害を報告する
        </h1>
        <p className="text-gray-600">
          市販薬・健康食品について、副作用・定期購入トラブル・広告表現との差異など、あなたの体験を教えてください。匿名で投稿できます。
        </p>
      </header>
      <DamageReportForm />

      <aside className="mt-6 rounded bg-yellow-50 p-4 text-sm text-gray-700">
        <strong className="block mb-1">⚠️ 重要なお願い</strong>
        <ul className="ml-4 list-disc space-y-1 text-xs">
          <li>深刻な健康被害の場合は、まず医療機関への受診を優先してください。</li>
          <li>契約トラブルで困っている場合は、消費者ホットライン「188」(局番なし)にご相談いただけます。</li>
          <li>個人が特定できる情報(実名・電話番号など)は入力しないでください。</li>
        </ul>
      </aside>
    </div>
  );
}
