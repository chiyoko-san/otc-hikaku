import type { Medicine } from '@/types';
import { MedicineCard } from './MedicineCard';

// 配置先: components/medicine/MedicineGrid.tsx
//
// 薬カードの並べ方を1か所で決める（2026-11-22）。
//   ・スマホは1列、パソコンは2列（以前は3列で文字が小さかった）
//   ・最初の12枚だけ見せて、残りは「残り◯品を見る」で開く
//     （頭痛は890枚が1ページに並んでいた。リンクはHTMLに残るので検索エンジンは辿れる）

const GRID = 'grid gap-3 md:grid-cols-2';

export function MedicineGrid({
  meds,
  first = 12,
  badge,
}: {
  meds: Medicine[];
  /** 最初から見せる枚数。0以下ならすべて見せる */
  first?: number;
  badge?: string;
}) {
  const shown = first > 0 ? meds.slice(0, first) : meds;
  const rest = first > 0 ? meds.slice(first) : [];

  return (
    <>
      <div className={GRID}>
        {shown.map((m) => (
          <MedicineCard key={m.id} med={m} badge={badge} />
        ))}
      </div>
      {rest.length > 0 && (
        <details className="mt-3">
          <summary className="card cursor-pointer p-4 text-center text-base font-bold text-brand-dark">
            残り {rest.length} 品を見る
          </summary>
          <div className={`mt-3 ${GRID}`}>
            {rest.map((m) => (
              <MedicineCard key={m.id} med={m} badge={badge} />
            ))}
          </div>
        </details>
      )}
    </>
  );
}
