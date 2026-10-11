import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllMedicines } from '@/lib/medicines';
import { buildMetadata, buildWebsiteJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/layout/JsonLd';

// 配置先: app/page.tsx（トップページ）
// 高齢者向けに「用件を選ぶ」から始める。検索フォームは /search/?q= に送る。
// 2026-10 スマホ向け見直し: 色は緑1色＋赤（上乗せ料金だけ）、囲みは白地に薄線、余白を広く。

export const metadata: Metadata = buildMetadata({
  title: '市販薬を成分・リスク区分で比較|クスリノコンパス',
  description:
    '市販薬(OTC医薬品)1万品以上をPMDA公開情報から成分・症状・リスク区分で比較。2027年3月からの「上乗せ料金」の対象かどうかも、お薬手帳を撮るだけで調べられます。広告・案件なしの中立情報サイト。',
  path: '/',
});

function EntryCard({ href, title, note }: { href: string; title: string; note: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-[72px] items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 hover:border-brand"
    >
      <span className="block">
        <span className="block text-lg font-bold text-brand md:text-xl">{title}</span>
        <span className="mt-1 block text-sm text-gray-600 md:text-base">{note}</span>
      </span>
      <span className="shrink-0 text-2xl text-brand" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

export default function HomePage() {
  const total = getAllMedicines().length;

  return (
    <>
      <JsonLd data={buildWebsiteJsonLd()} />
      <div className="mx-auto max-w-5xl px-5 py-8 text-lg leading-relaxed text-brand-ink md:px-6 md:py-12">
        <h1 className="text-2xl font-bold leading-snug md:text-4xl">
          薬のこと、何を調べますか？
        </h1>
        <p className="mt-3 text-base text-gray-600 md:text-lg">
          市販薬{total.toLocaleString('ja-JP')}品を、国（PMDA・厚生労働省）の公開情報から整理しています。広告はありません。
        </p>

        {/* 用件を選ぶ */}
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          <Link
            href="/otc-similar/"
            className="flex items-center justify-between gap-3 rounded-2xl bg-alert px-5 py-5 text-white md:col-span-3"
          >
            <span className="block">
              <span className="inline-block rounded-md bg-white px-2 py-0.5 text-xs font-bold text-alert">2027年3月から</span>
              <span className="mt-2 block text-xl font-bold leading-snug md:text-2xl">病院の薬の「上乗せ料金」を調べる</span>
              <span className="mt-1 block text-sm md:text-base">お薬手帳を撮るだけで、対象の薬といくら増えるかがわかります</span>
            </span>
            <span className="shrink-0 text-2xl" aria-hidden="true">
              ›
            </span>
          </Link>
          <EntryCard href="/symptoms/" title="症状から市販薬を探す" note="頭痛、胃の痛み、鼻水、かゆみ…。困っている症状から" />
          <EntryCard href="/switch/" title="処方薬と同じ成分の市販薬" note="ロキソニン、アレグラ、ヒルドイドなど、病院の薬の名前から" />
          <EntryCard href="/akinator/" title="質問に答えて薬を探す" note="いくつかの質問に答えると、候補を絞り込みます" />
        </div>

        {/* 名前で検索 */}
        <section className="panel mt-12">
          <h2 className="text-xl font-bold md:text-2xl">薬の名前や成分で探す</h2>
          <p className="mt-2 text-sm text-gray-600 md:text-base">箱に書いてある商品名でも、成分名でも探せます。</p>
          <form action="/search/" method="get" className="mt-4 flex flex-col gap-2 sm:flex-row">
            <label className="flex-1">
              <span className="sr-only">薬の名前や成分名</span>
              <input
                type="search"
                name="q"
                inputMode="search"
                placeholder="例：バファリン、ロキソプロフェン"
                className="w-full rounded-xl border-2 border-gray-300 px-4 py-3 text-lg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand md:text-xl"
              />
            </label>
            <button
              type="submit"
              className="min-h-[56px] rounded-xl bg-brand px-6 text-lg font-bold text-white md:text-xl"
            >
              探す
            </button>
          </form>
          <p className="mt-4 text-sm text-gray-600 md:text-base">
            分類や眠気の有無で細かく絞り込むなら
            <Link href="/medicines/" className="font-bold text-brand underline underline-offset-4">薬の一覧</Link>へ。
          </p>
        </section>

        {/* その他の入口 */}
        <section className="mt-12">
          <h2 className="text-xl font-bold md:text-2xl">ほかの調べ方</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            <li>
              <EntryCard href="/ingredients/" title="成分辞典" note="成分の名前から、はたらきと、それを含む市販薬を見る" />
            </li>
            <li>
              <EntryCard href="/medicines/" title="薬の一覧" note="分類・リスク区分・眠気の有無で絞り込む" />
            </li>
            <li>
              <EntryCard href="/columns/" title="コラム" note="市販薬の選び方、安全な使い方、上乗せ料金の解説" />
            </li>
            <li>
              <EntryCard href="/damage-reports/" title="被害報告を見る・報告する" note="市販薬や健康食品で困ったことがあれば" />
            </li>
          </ul>
        </section>

        {/* 信頼 */}
        <section className="mt-12 rounded-2xl bg-gray-100 p-5 text-sm text-gray-600 md:text-base">
          <p>
            当サイトは個人が運営する無料の情報サイトです。広告や企業からの依頼で製品をすすめることはありません。
            情報はPMDA（医薬品医療機器総合機構）と厚生労働省の公開資料をもとに整理しています。
            薬を使う前には添付文書（箱に入っている説明書）を確認し、薬剤師や登録販売者に相談してください。
          </p>
          <p className="mt-3">
            <Link href="/about/" className="underline underline-offset-4">当サイトについて</Link>
            <span className="mx-2">／</span>
            <Link href="/contact/" className="underline underline-offset-4">お問い合わせ</Link>
          </p>
        </section>
      </div>
    </>
  );
}
