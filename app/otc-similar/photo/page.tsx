import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata, buildBreadcrumbJsonLd } from '@/lib/seo';
import { OTC_SIMILAR_PATHS } from '@/lib/otc-similar-data';
import PhotoReader from './PhotoReader';

// 配置先: app/otc-similar/photo/page.tsx  →  /otc-similar/photo/

export const metadata: Metadata = buildMetadata({
  title: 'お薬手帳を撮るだけ｜上乗せ料金の対象と増える金額がわかる',
  description:
    'お薬手帳や薬袋の写真を撮るだけで、2027年3月からのOTC類似薬「上乗せ料金」の対象かどうかと、いくら増えるかがわかります。薬の名前を打つ必要はありません。写真は保存しません。',
  path: OTC_SIMILAR_PATHS.photo,
});

export default function PhotoPage() {
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'ホーム', url: '/' },
    { name: '処方薬から探す', url: '/switch/' },
    { name: 'OTC類似薬の上乗せ料金', url: OTC_SIMILAR_PATHS.hub },
    { name: 'お薬手帳を撮るだけ', url: OTC_SIMILAR_PATHS.photo },
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-lg leading-relaxed text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <nav className="text-base text-gray-700" aria-label="パンくず">
        <Link href="/" className="underline">ホーム</Link>
        <span className="mx-1">/</span>
        <Link href={OTC_SIMILAR_PATHS.hub} className="underline">上乗せ料金</Link>
        <span className="mx-1">/</span>
        <span>撮るだけ</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold leading-snug md:text-4xl">
        お薬手帳を撮るだけ
        <span className="mt-1 block text-xl font-normal text-gray-700">上乗せ料金の対象かどうかと、いくら増えるかがわかります</span>
      </h1>
      <p className="mt-3 text-xl leading-relaxed">
        薬の名前を打つ必要はありません。何種類あっても1枚の写真で読み取ります。
        離れて住むご家族が代わりに撮って調べることもできます。
      </p>

      <PhotoReader />

      <section className="mt-12 rounded-xl bg-[#fff4d6] p-5">
        <p className="font-bold">写真の扱いについて</p>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-base">
          <li>写真は当サイトのサーバーに保存しません。読み取りが終わると破棄されます</li>
          <li>読み取りにはAI（Anthropic社のClaude）を使います。薬の名前だけを書き出し、氏名・生年月日・保険証番号などは読み取らないよう指示しています。心配な方はお名前の部分を隠して撮ってください</li>
          <li>読み取り結果は必ず確認画面で見直してください。似た名前の薬を取り違えることがあります</li>
          <li>対象かどうかは厚労省の案（77成分）をもとにした当サイトの推計で、最終的には国の告示で確定します</li>
        </ul>
      </section>

      <p className="mt-6">
        写真が使えない場合は
        <Link href={OTC_SIMILAR_PATHS.name} className="font-bold text-[#1f4d3a] underline">薬の名前で探す</Link>
        か
        <Link href={OTC_SIMILAR_PATHS.simulator} className="font-bold text-[#1f4d3a] underline">シミュレーター</Link>
        をご利用ください。
      </p>
    </div>
  );
}
