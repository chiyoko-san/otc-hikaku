import Link from 'next/link';
import type { Medicine } from '@/types';
import { getCategoryLabel } from '@/lib/categories';

function riskClass(risk: number, itype?: string): string {
  if (itype === 'functional') return 'risk-functional';
  if (itype === 'quasi') return 'risk-quasi';
  if (risk === 1) return 'risk-1';
  if (risk === 2) return 'risk-2';
  if (risk === 2.5) return 'risk-2-5';
  return 'risk-3';
}

function riskLabel(risk: number, itype?: string): string {
  if (itype === 'functional') return '機能性';
  if (itype === 'quasi') return '医薬部外品';
  if (risk === 1) return '第1類';
  if (risk === 2) return '第2類';
  if (risk === 2.5) return '指定第2類';
  if (risk === 3) return '第3類';
  return '不明';
}

export function MedicineCard({
  med,
  badge,
}: {
  med: Medicine;
  badge?: string;
}) {
  return (
    <Link
      href={`/medicines/${med.slug}/`}
      className="block rounded-lg border border-gray-200 bg-white p-4 transition hover:border-brand hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-base font-bold leading-tight text-gray-900">
          {med.name}
        </h3>
        <span className="flex flex-shrink-0 items-center gap-1">
          {badge && (
            <span className="rounded bg-brand-light px-1.5 py-0.5 text-xs font-semibold text-brand-dark">
              {badge}
            </span>
          )}
          <span className={riskClass(med.risk, med.itype)}>{riskLabel(med.risk, med.itype)}</span>
        </span>
      </div>
      <div className="mb-2 text-xs text-gray-500">{med.maker}</div>
      <div className="mb-2 flex flex-wrap gap-1">
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
          {getCategoryLabel(med.cat)}
        </span>
        {med.drowsy && (
          <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
            眠気あり
          </span>
        )}
      </div>
      {med.effect && (
        <p className="line-clamp-2 text-xs text-gray-600">{med.effect}</p>
      )}
      {med.symptoms && med.symptoms.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {med.symptoms.slice(0, 4).map((s) => (
            <span
              key={s}
              className="rounded-full bg-brand-light px-2 py-0.5 text-xs text-brand-dark"
            >
              #{s}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
