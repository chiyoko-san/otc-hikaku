import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllMedicines } from '@/lib/medicines';
import { buildMetadata, buildWebsiteJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/layout/JsonLd';

// 配置先: app/page.tsx（トップページ）
// 高齢者向けに「用件を選ぶ」から始める。検索フォームは /search/?q= に送る（旧トップの絞り込みUIは
// /medicines/ 側に残る想定。残っていなければ教えてください）。

export const metadata: Metadata = buildMetadata({
  title: '市販薬を成分・リスク区分で比較|クスリノコンパス',
  description:
    '市販薬(OTC医薬品)1万品以上をPMDA公開情報から成分・症状・リスク区分で比較。2027年3月からの「上乗せ料金」の対象かどうかも、お薬手帳を撮るだけで調べられます。広告・案件なしの中立情報サイト。',
  path: '/',
});

export default function HomePage() {
  const total = getAllMedicines().length;

  return (
    <>
      <JsonLd data={buildWebsiteJsonLd()} />
      <div className="mx-auto max-w-5xl px-4 py-8 text-lg leading-relaxed text-gray-900">
        <h1 className="text-3xl font-bold leading-snug md:text-4xl">
          薬のこと、何を調べますか？
        </h1>
        <p className="mt-2 text-base text-gray-700">
          市販薬{total.toLocaleString('ja-JP')}品を、国（PMDA・厚生労働省）の公開情報から整理しています。広告はありません。
        </p>

        {/* 用件を選ぶ */}
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Link href="/otc-similar/" className="block rounded-2xl bg-[#b42318] p-6 text-white">
            <span className="inline-block rounded-md bg-white px-2 py-0.5 text-sm font-bold text-[#b42318]">2027年3月から</span>
            <span className="mt-2 block text-2xl font-bold leading-snug">病院の薬の「上乗せ料金」を調べる</span>
            <span className="mt-2 block text-base">お薬手帳を撮るだけで、対象の薬といくら増えるかがわかります</span>
          </Link>
          <Link href="/symptoms/" className="block rounded-2xl border-2 border-[#1f4d3a] bg-[#f3f9f5] p-6">
            <span className="block text-2xl font-bold leading-snug text-[#1f4d3a]">症状から市販薬を探す</span>
            <span className="mt-2 block text-base text-gray-800">頭痛、胃の痛み、鼻水、かゆみ…。困っている症状から選びます</span>
          </Link>
          <Link href="/switch/" className="block rounded-2xl border-2 border-[#1f4d3a] bg-[#f3f9f5] p-6">
            <span className="block text-2xl font-bold leading-snug text-[#1f4d3a]">処方薬と同じ成分の市販薬を探す</span>
            <span className="mt-2 block text-base text-gray-800">ロキソニン、アレグラ、ヒルドイドなど、病院の薬の名前から</span>
          </Link>
        </div>

        {/* 名前で検索 */}
        <section className="mt-10 rounded-2xl border-2 border-gray-300 bg-white p-5">
          <h2 className="text-2xl font-bold">薬の名前や成分で探す</h2>
          <p className="mt-1 text-base text-gray-700">箱に書いてある商品名でも、成分名でも探せます。</p>
          <form action="/search/" method="get" className="mt-3 flex flex-wrap gap-2">
            <label className="flex-1">
              <span className="sr-only">薬の名前や成分名</span>
              <input
                type="search"
                name="q"
                inputMode="search"
                placeholder="例：バファリン、ロキソプロフェン"
                className="w-full min-w-[240px] rounded-lg border-2 border-gray-500 px-4 py-3 text-xl focus:border-[#1f4d3a] focus:outline-none focus:ring-2 focus:ring-[#1f4d3a]"
              />
            </label>
            <button type="submit" className="min-h-[56px] rounded-lg bg-[#1f4d3a] px-6 text-xl font-bold text-white">
              探す
            </button>
          </form>
          <p className="mt-3 text-base">
            分類や眠気の有無などで細かく絞り込むなら
            <Link href="/medicines/" className="font-bold text-[#1f4d3a] underline">薬の一覧</Link>へ。
          </p>
        </section>

        {/* その他の入口 */}
        <section className="mt-10">
          <h2 className="text-2xl font-bold">ほかの調べ方</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            <li>
              <Link href="/ingredients/" className="block rounded-xl border-2 border-gray-300 bg-white p-4 hover:bg-[#e8f3ec]">
                <span className="block text-xl font-bold text-[#1f4d3a]">成分辞典</span>
                <span className="block text-base text-gray-700">成分の名前から、はたらきと、それを含む市販薬を見る</span>
              </Link>
            </li>
            <li>
              <Link href="/akinator/" className="block rounded-xl border-2 border-gray-300 bg-white p-4 hover:bg-[#e8f3ec]">
                <span className="block text-xl font-bold text-[#1f4d3a]">質問に答えて薬を探す</span>
                <span className="block text-base text-gray-700">いくつかの質問に答えると、候補を絞り込みます</span>
              </Link>
            </li>
            <li>
              <Link href="/columns/" className="block rounded-xl border-2 border-gray-300 bg-white p-4 hover:bg-[#e8f3ec]">
                <span className="block text-xl font-bold text-[#1f4d3a]">コラム</span>
                <span className="block text-base text-gray-700">市販薬の選び方、安全な使い方、上乗せ料金の解説</span>
              </Link>
            </li>
            <li>
              <Link href="/damage-reports/" className="block rounded-xl border-2 border-gray-300 bg-white p-4 hover:bg-[#e8f3ec]">
                <span className="block text-xl font-bold text-[#1f4d3a]">被害報告を見る・報告する</span>
                <span className="block text-base text-gray-700">市販薬や健康食品で困ったことがあれば</span>
              </Link>
            </li>
          </ul>
        </section>

        {/* 信頼 */}
        <section className="mt-10 rounded-xl bg-gray-50 p-5 text-base text-gray-700">
          <p>
            当サイトは個人が運営する無料の情報サイトです。広告や企業からの依頼で製品をすすめることはありません。
            情報はPMDA（医薬品医療機器総合機構）と厚生労働省の公開資料をもとに整理しています。
            薬を使う前には添付文書（箱に入っている説明書）を確認し、薬剤師や登録販売者に相談してください。
          </p>
          <p className="mt-2">
            <Link href="/about/" className="underline">当サイトについて</Link>
            <span className="mx-2">／</span>
            <Link href="/contact/" className="underline">お問い合わせ</Link>
          </p>
        </section>
      </div>
    </>
  );
}
