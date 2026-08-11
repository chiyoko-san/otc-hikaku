import { getAllMedicines } from '@/lib/medicines';
import { MedicineCard } from './MedicineCard';

export function SearchResults({ q }: { q: string }) {
  if (!q) {
    return (
      <p className="text-gray-500">
        検索キーワードを入力してください。
      </p>
    );
  }

  const all = getAllMedicines();
  const lower = q.toLowerCase();

  // 詳細あり(effect付き)を優先、なしは最後
  const scored = all
    .map((m) => {
      const hay = [
        m.name,
        m.maker,
        m.effect,
        (m.ings || []).join(' '),
        (m.symptoms || []).join(' '),
        m.note,
      ]
        .join(' ')
        .toLowerCase();
      let score = 0;
      if (m.name.toLowerCase().includes(lower)) score += 10;
      if (hay.includes(lower)) score += 1;
      if (!m.effect) score -= 5; // 詳細なしを後ろに
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return (
      <div className="card-static p-8 text-center text-gray-500">
        「{q}」に一致する市販薬は見つかりませんでした。
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-gray-600">
        {scored.length} 件ヒット(全 {all.length} 件中)
      </p>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {scored.slice(0, 60).map(({ m }) => (
          <MedicineCard key={m.id} med={m} />
        ))}
      </div>
      {scored.length > 60 && (
        <p className="mt-6 text-sm text-gray-500">
          上位60件のみ表示しています。検索キーワードを絞り込むとより正確に見つかります。
        </p>
      )}
    </div>
  );
}
