import Link from 'next/link';
import { getOtcSimilarByNo } from '@/lib/otc-similar-77';

// 配置先: components/OtcSimilarBanner.tsx
//
// 使い方
//  - 処方薬一覧 app/switch/page.tsx の見出し直下:      <OtcSimilarBanner />
//  - 各切替ページ app/switch/[slug]/page.tsx の見出し直下: <OtcSimilarBanner otcSimilarNo={drug.otcSimilarNo} />
//      number → 「この薬は上乗せ料金の対象（案）」＋用途ページの該当カードへ
//      null   → 「この薬は今回の対象外（案）」＋制度説明へ
//      省略   → 一般向けの案内（薬の名前で探すページへ）

const HUB = '/otc-similar/';
const NAME = '/otc-similar/name/';

export default function OtcSimilarBanner({ otcSimilarNo }: { otcSimilarNo?: number | null }) {
  if (otcSimilarNo === undefined) {
    return (
      <aside className="my-6 rounded-xl border-2 border-[#1f4d3a] bg-[#f3f9f5] p-5 text-lg leading-relaxed text-gray-900">
        <p className="text-xl font-bold leading-snug md:text-2xl">
          2027年3月から、病院の薬の一部に「上乗せ料金」が始まります
        </p>
        <p className="mt-2">
          ロキソニン・アレグラ・ヒルドイドなど77成分が対象（厚労省案）。お薬手帳の名前で、自分の薬が対象か調べられます。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={NAME}
            className="inline-block min-h-[52px] rounded-lg bg-[#1f4d3a] px-5 py-3 text-xl font-bold text-white"
          >
            薬の名前で調べる
          </Link>
          <Link
            href={HUB}
            className="inline-block min-h-[52px] rounded-lg border-2 border-[#1f4d3a] bg-white px-5 py-3 text-xl font-bold text-[#1f4d3a]"
          >
            なぜ上乗せ？を読む
          </Link>
        </div>
      </aside>
    );
  }

  if (otcSimilarNo === null) {
    return (
      <aside className="my-6 rounded-xl border-2 border-gray-400 bg-white p-5 text-lg leading-relaxed text-gray-900">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-block rounded-md border-2 border-gray-500 px-2.5 py-1 text-base font-bold text-gray-800">対象外</span>
          <p className="text-xl font-bold leading-snug">この薬は、2027年3月からの「上乗せ料金」の対象に入っていません（厚労省案）</p>
        </div>
        <Link href={HUB} className="mt-3 inline-block text-lg font-bold text-[#1f4d3a] underline">
          上乗せ料金の説明と対象成分を見る
        </Link>
      </aside>
    );
  }

  const ing = getOtcSimilarByNo(otcSimilarNo);
  const cardHref = ing ? `/otc-similar/use/${ing.group}/#ing-${ing.no}` : HUB;

  return (
    <aside className="my-6 rounded-xl border-2 border-[#b42318] bg-[#fff5f4] p-5 text-lg leading-relaxed text-gray-900">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-block rounded-md bg-[#b42318] px-2.5 py-1 text-base font-bold text-white">上乗せ対象</span>
        <p className="text-xl font-bold leading-snug">この薬は、2027年3月から薬代の4分の1が上乗せされる見込みです（厚労省案）</p>
      </div>
      <p className="mt-2">
        お子さん、がん・難病の方、収入の少ない方、入院中の方、医師が長期使用を必要と判断した方などは対象外の方向で検討されています。
      </p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        <Link href={HUB} className="inline-block text-lg font-bold text-[#1f4d3a] underline">
          なぜ上乗せ？いくら増える？
        </Link>
        <Link href={cardHref} className="inline-block text-lg font-bold text-[#1f4d3a] underline">
          同じ用途のほかの対象薬
        </Link>
      </div>
    </aside>
  );
}
