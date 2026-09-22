import {
  getItemsByNo,
  getRepresentativeItems,
  getYakkaDateLabel,
  unitLabel,
  yen,
} from '@/lib/otc-similar-items';

// 配置先: components/OtcSimilarPriceTable.tsx
//
// 使い方
//  <OtcSimilarPriceTable no={76} />              全品目（先発が先）
//  <OtcSimilarPriceTable no={76} limit={3} />    上位3件だけ（用途ページのカード用）
//  <OtcSimilarPriceTable no={76} compact />      見出しなし・注記なし（カード内に埋め込む）

export default function OtcSimilarPriceTable({
  no,
  limit,
  compact = false,
}: {
  no: number;
  limit?: number;
  compact?: boolean;
}) {
  const all = getItemsByNo(no);
  if (all.length === 0) return null;
  const items = limit ? getRepresentativeItems(no, limit) : [...all].sort((a, b) => {
    const k = (x: string) => (x === '先発' ? 0 : x === '後発' ? 1 : 2);
    return k(a.kind) - k(b.kind) || b.price - a.price || a.name.localeCompare(b.name, 'ja');
  });
  const dateLabel = getYakkaDateLabel();

  return (
    <div className={compact ? 'mt-3' : 'mt-6'}>
      {!compact && (
        <h3 className="text-xl font-bold">処方薬の薬価と上乗せ額（{limit ? `代表${items.length}品目` : `${all.length}品目`}）</h3>
      )}
      <div className="mt-2 overflow-x-auto rounded-xl border-2 border-gray-300">
        <table className="w-full min-w-[520px] text-left text-lg">
          <thead className="bg-gray-100 text-base">
            <tr>
              <th className="px-3 py-2 font-bold">処方薬</th>
              <th className="px-3 py-2 font-bold">薬価</th>
              <th className="px-3 py-2 font-bold text-[#b42318]">上乗せ額</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.code} className="border-t-2 border-gray-200 align-top">
                <td className="px-3 py-2">
                  <div className="font-bold">{i.name}</div>
                  <div className="text-base text-gray-600">
                    {i.spec}
                    {i.kind === '先発' && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-sm">先発</span>}
                    {i.kind === '後発' && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-sm">ジェネリック</span>}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {yen(i.price)}
                  <span className="text-base text-gray-600">／{unitLabel(i.spec)}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-bold text-[#b42318]">
                  +{yen(i.surcharge)}
                  <span className="text-base font-normal text-gray-600">／{unitLabel(i.spec)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!compact && (
        <p className="mt-2 text-base text-gray-700">
          上乗せ額＝薬価の4分の1（案）。実際の負担は「上乗せ額＋残りの薬代×負担割合」で、診察料・調剤料は別です。
          薬価は厚生労働省の薬価基準収載品目リスト（{dateLabel}時点）。対象品目は当サイトの推計で、最終的には国の告示で確定します。
        </p>
      )}
      {limit && all.length > items.length && !compact && (
        <p className="mt-1 text-base text-gray-600">ほかにジェネリックなど{all.length - items.length}品目があります。</p>
      )}
    </div>
  );
}
