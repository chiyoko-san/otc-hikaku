import Link from 'next/link';
import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'ページが見つかりません',
  description: 'お探しのページは見つかりませんでした。',
  path: '/404',
  noindex: true,
});

export default function NotFound() {
  return (
    <div className="container-narrow py-24 text-center">
      <div className="mb-4 text-6xl font-bold text-gray-300">404</div>
      <h1 className="mb-3 text-2xl font-bold">ページが見つかりません</h1>
      <p className="mb-8 text-gray-600">
        お探しのページは移動・削除されたか、URLが間違っている可能性があります。
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-primary">
          トップへ戻る
        </Link>
        <Link href="/medicines/" className="btn-outline">
          薬を探す
        </Link>
        <Link href="/symptoms/" className="btn-outline">
          症状から選ぶ
        </Link>
      </div>
    </div>
  );
}
