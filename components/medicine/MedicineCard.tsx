import Link from 'next/link';
import type { Medicine } from '@/types';
import { getCategoryLabel } from '@/lib/categories';
import { formIconKey } from '@/lib/icon-map';
import { Icon } from '@/components/icons/Icon';

// 配置先: components/medicine/MedicineCard.tsx
//
// 薬のカード（症状・成分・分類・検索など、すべての一覧で使う）。
//
// 2026-11-22 作り直し: 以前は1枚に 製品名・メーカー・分類・効能2行・症状タグ4つ・区分 が入り、
//   製品名以外は12pxの灰色、区分の色帯・黄色の「眠気あり」・緑のタグで色も多かった。
//   お年寄りが読みやすいよう、中身を3行に絞る:
//     1行目 製品名（大きく）
//     2行目 何の薬か（症状3つまで。無ければ効能か分類）
//     3行目 メーカー（＋眠くなる成分あり）
//   色は区分のバッジだけ。左の色帯・タグ・分類の札はやめた。
//   アイコンの枠は全カードに同じ大きさで置く（形がわからない薬は「薬の箱」）ので、一覧の高さが揃う。

function riskClass(risk: number, itype?: string): string {
  if (itype === 'functional') return 'risk-functional';
  if (itype === 'designated_quasi') return 'risk-dquasi';
  if (itype === 'quasi') return 'risk-quasi';
  if (risk === 1) return 'risk-1';
  if (risk === 2) return 'risk-2';
  if (risk === 2.5) return 'risk-2-5';
  if (risk === 3) return 'risk-3';
  return 'risk-none';
}

/** 区分の短い名前。区分が取れていない薬は null（バッジを出さない。区分は製品ページで案内） */
function riskLabel(risk: number, itype?: string): string | null {
  if (itype === 'functional') return '機能性';
  if (itype === 'designated_quasi') return '指定医薬部外品';
  if (itype === 'quasi') return '医薬部外品';
  if (risk === 1) return '第1類';
  if (risk === 2) return '第2類';
  if (risk === 2.5) return '指定第2類';
  if (risk === 3) return '第3類';
  return null;
}

/** 何の薬か（1行）。症状3つまで → 無ければ効能 → 無ければ分類 */
function whatFor(med: Medicine): string {
  const symptoms = med.symptoms || [];
  if (symptoms.length > 0) {
    return symptoms.slice(0, 3).join('・') + (symptoms.length > 3 ? ' など' : '');
  }
  if (med.effect) return med.effect;
  return getCategoryLabel(med.cat);
}

export function MedicineCard({
  med,
  badge,
}: {
  med: Medicine;
  badge?: string;
}) {
  // 剤形アイコン（錠剤・目薬・貼り薬など）。名前から形がわからない薬は「薬の箱」
  const icon = formIconKey(med) ?? 'hako';
  const risk = riskLabel(med.risk, med.itype);

  return (
    <Link
      href={`/medicines/${med.slug}/`}
      className="card flex h-full items-center gap-4 p-4"
    >
      <span className="flex flex-none rounded-xl bg-brand-light p-2 text-brand">
        <Icon name={icon} size={32} />
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-bold leading-snug text-gray-900">{med.name}</h3>
        <div className="mt-1 truncate text-sm text-gray-800">{whatFor(med)}</div>
        <div className="mt-0.5 truncate text-sm text-gray-500">
          {med.maker}
          {med.drowsy && (med.maker ? '・' : '') + '眠くなる成分あり'}
        </div>
      </div>

      {(badge || risk) && (
        <div className="flex flex-none flex-col items-end gap-1">
          {badge && <span className="pill-brand">{badge}</span>}
          {risk && <span className={riskClass(med.risk, med.itype)}>{risk}</span>}
        </div>
      )}
    </Link>
  );
}
