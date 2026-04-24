import { redirect, notFound } from 'next/navigation';
import { getMedicineById } from '@/lib/medicines';

// 旧URL /?med=2 → /medicines/redirect-by-id/2/ → /medicines/<slug>/
export const dynamic = 'force-static';

export function generateStaticParams() {
  // 全IDの旧URL互換 - detail あるもののみ(それ以外は404でOK)
  const { getEnrichedMedicines } = require('@/lib/medicines');
  return getEnrichedMedicines().map((m: any) => ({ id: String(m.id) }));
}

export default function RedirectById({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();

  const med = getMedicineById(id);
  if (!med || !med.effect) notFound();

  redirect(`/medicines/${med.slug}/`);
}
