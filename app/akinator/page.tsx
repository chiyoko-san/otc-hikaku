import type { Metadata } from 'next';
import { Akinator } from '@/components/akinator/Akinator';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: '症状アキネーター|質問に答えて最適な市販薬を見つける',
  description:
    '症状の特徴を選んでいくだけで、最適な市販薬の成分・選び方がわかる対話型ガイド。',
  path: '/akinator/',
});

export default function AkinatorPage() {
  return (
    <div className="container-narrow py-6 md:py-10">
      <Breadcrumb
        items={[{ name: 'ホーム', href: '/' }, { name: '症状アキネーター' }]}
      />
      <header className="mb-6">
        <h1 className="mb-2 text-3xl font-bold md:text-4xl">
          症状アキネーター
        </h1>
        <p className="text-gray-600">
          質問に答えていくだけで、あなたの症状に適した市販薬の成分がわかります。
        </p>
      </header>
      <Akinator />
    </div>
  );
}
