'use client';

import { useState } from 'react';

// 配置先: app/otc-similar/pharmacy/PharmacyKit.tsx
// QRコードは固定URL（撮るだけページ ?ref=pharmacy）なので、public/qr/otc-similar-photo.svg に
// 静的に置いてある。npm依存なし。URLを変えるときは画像も作り直すこと。
const QR_SRC = '/qr/otc-similar-photo.svg';

type Group = { label: string; ingredients: { no: number; name: string; rx: string }[] };

export default function PharmacyKit({
  siteUrl,
  photoPath,
  hubPath,
  groups,
  notTargets,
}: {
  siteUrl: string;
  photoPath: string;
  hubPath: string;
  groups: Group[];
  notTargets: string[];
}) {
  const [pharmacy, setPharmacy] = useState('');
  const [sheet, setSheet] = useState<'pop' | 'list'>('pop');

  return (
    <div className="mt-8">
      {/* 操作部（印刷時は非表示） */}
      <div className="print:hidden rounded-xl border-2 border-[#1f4d3a] bg-[#f3f9f5] p-5">
        <label className="block">
          <span className="text-xl font-bold">薬局・医療機関名（POPに印字されます。空欄でも可）</span>
          <input
            type="text"
            value={pharmacy}
            onChange={(e) => setPharmacy(e.target.value)}
            placeholder="例：○○薬局 △△店"
            className="mt-2 w-full rounded-lg border-2 border-gray-500 px-4 py-3 text-xl focus:border-[#1f4d3a] focus:outline-none focus:ring-2 focus:ring-[#1f4d3a]"
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="印刷するもの">
          <button
            type="button"
            onClick={() => setSheet('pop')}
            aria-pressed={sheet === 'pop'}
            className={'min-h-[52px] rounded-lg border-2 px-4 text-lg font-bold ' + (sheet === 'pop' ? 'border-[#1f4d3a] bg-[#1f4d3a] text-white' : 'border-gray-400 bg-white')}
          >
            患者さん向けPOP（A4）
          </button>
          <button
            type="button"
            onClick={() => setSheet('list')}
            aria-pressed={sheet === 'list'}
            className={'min-h-[52px] rounded-lg border-2 px-4 text-lg font-bold ' + (sheet === 'list' ? 'border-[#1f4d3a] bg-[#1f4d3a] text-white' : 'border-gray-400 bg-white')}
          >
            薬剤師向け 対象77成分早見表（A4）
          </button>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="mt-4 min-h-[56px] rounded-xl bg-[#b42318] px-6 py-3 text-xl font-bold text-white"
        >
          印刷する／PDFで保存する
        </button>
        <p className="mt-2 text-base text-gray-700">印刷画面で「PDFに保存」を選ぶとファイルになります。用紙はA4・縦・余白「標準」を推奨。</p>
      </div>

      {/* 印刷対象 */}
      <div id="print-area" className="mt-8 print:mt-0">
        {sheet === 'pop' ? (
          <section className="mx-auto w-full max-w-[210mm] rounded-xl border-2 border-gray-300 bg-white p-8 print:rounded-none print:border-0 print:p-0" style={{ minHeight: '270mm' }}>
            <p className="inline-block rounded-md bg-[#b42318] px-3 py-1 text-lg font-bold text-white">2027年3月から</p>
            <h2 className="mt-3 text-4xl font-bold leading-tight text-gray-900" style={{ fontSize: '2.4rem' }}>
              病院の薬の一部に<br />「上乗せ料金」が始まります
            </h2>
            <p className="mt-3 text-2xl leading-relaxed">
              市販薬と同じ成分の処方薬（ロキソニン、アレグラ、ヒルドイドなど）は、
              いつもの負担に加えて<strong>薬代の4分の1</strong>を追加でお支払いいただく予定です。
            </p>

            <div className="mt-6 flex items-center gap-6 rounded-xl border-4 border-[#1f4d3a] p-5">
              <div className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={QR_SRC} alt="QRコード（お薬手帳を撮るだけ）" style={{ width: '52mm', height: '52mm' }} />
              </div>
              <div>
                <p className="text-3xl font-bold leading-snug text-[#1f4d3a]">お薬手帳を<br />撮るだけ</p>
                <p className="mt-2 text-xl leading-relaxed">
                  スマートフォンでQRコードを読み取り、お薬手帳の写真を撮ると、
                  <strong>あなたの薬が対象かどうか</strong>と<strong>いくら増えるか</strong>がその場でわかります。
                </p>
                <p className="mt-2 break-all text-base text-gray-700">{siteUrl}{photoPath}</p>
              </div>
            </div>

            <ul className="mt-6 space-y-2 text-xl">
              <li>・保険が使えなくなるわけではありません</li>
              <li>・お子さん、がん・難病の方、収入の少ない方、入院中の方、医師が長期使用を必要と判断した方などは対象外の方向で検討されています</li>
              <li>・薬をやめたり変えたりする前に、必ずご相談ください</li>
            </ul>

            <div className="mt-8 border-t-4 border-[#1f4d3a] pt-4">
              <p className="text-2xl font-bold">ご相談はこちら</p>
              <p className="mt-1 text-3xl font-bold" style={{ minHeight: '2.5rem' }}>{pharmacy || '　'}</p>
            </div>

            <p className="mt-6 text-sm leading-relaxed text-gray-600">
              情報提供：クスリノコンパス（広告なし・厚生労働省およびPMDAの公開情報に基づく市販薬比較サイト）。
              対象品目は厚生労働省の案（77成分・約1,100品目）に基づく推計で、最終的な対象は国の告示で確定します。
              本紙は市販薬への切替を推奨するものではありません。
            </p>
          </section>
        ) : (
          <section className="mx-auto w-full max-w-[210mm] rounded-xl border-2 border-gray-300 bg-white p-6 text-sm leading-snug print:rounded-none print:border-0 print:p-0">
            <h2 className="text-2xl font-bold">OTC類似薬「特別の料金」対象77成分 早見表（案）</h2>
            <p className="mt-1 text-xs text-gray-700">
              出典：厚生労働省 第209回社会保障審議会医療保険部会 参考資料3（2025年12月25日）。2027年3月実施予定。薬剤費の1/4を定率負担とは別に患者負担。
              最終的な対象品目は告示で確定。品目ごとの薬価・上乗せ額は {siteUrl}{hubPath} で検索できます。
            </p>
            <div className="mt-3 columns-2 gap-4">
              {groups.map((g) => (
                <div key={g.label} className="mb-3 break-inside-avoid">
                  <p className="border-l-4 border-[#1f4d3a] pl-2 text-base font-bold">{g.label}</p>
                  <ul className="mt-1">
                    {g.ingredients.map((i) => (
                      <li key={i.no} className="flex gap-1">
                        <span className="w-6 shrink-0 text-right text-gray-500">{i.no}</span>
                        <span>
                          {i.name}
                          {i.rx && <span className="text-gray-600">（{i.rx}）</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="mb-3 break-inside-avoid">
                <p className="border-l-4 border-gray-500 pl-2 text-base font-bold">よく聞かれる対象外の薬（案に含まれない）</p>
                <p className="mt-1">{notTargets.join('、')}、漢方薬全般</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-600">
              対象外の方向で検討中：こども、がん・難病など配慮が必要な慢性疾患、低所得者、入院患者、医師が長期使用等を医療上必要と判断した患者。詳細は厚労省の検討会で整理中。
              情報提供：クスリノコンパス
            </p>
          </section>
        )}
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
