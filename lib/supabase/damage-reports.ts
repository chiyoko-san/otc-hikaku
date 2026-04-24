import { createServerClient } from './server';
import type { DamageReport } from '@/types';

export async function getPublicDamageReports(limit = 100): Promise<DamageReport[]> {
  const sb = createServerClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from('damage_reports')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[getPublicDamageReports]', error);
    return [];
  }
  return (data || []) as DamageReport[];
}

export async function getDamageReportCountByMedicineId(
  medicineId: number
): Promise<number> {
  const sb = createServerClient();
  if (!sb) return 0;

  const { count } = await sb
    .from('damage_reports')
    .select('*', { count: 'exact', head: true })
    .eq('medicine_id', medicineId)
    .eq('is_public', true);
  return count || 0;
}

export async function getDamageReportsByMedicineId(
  medicineId: number,
  limit = 10
): Promise<DamageReport[]> {
  const sb = createServerClient();
  if (!sb) return [];

  const { data } = await sb
    .from('damage_reports')
    .select('*')
    .eq('medicine_id', medicineId)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []) as DamageReport[];
}

export async function getDamageReportStats(): Promise<{
  total: number;
  byType: Record<string, number>;
}> {
  const sb = createServerClient();
  if (!sb) return { total: 0, byType: {} };

  const { data, count } = await sb
    .from('damage_reports')
    .select('damage_types', { count: 'exact' })
    .eq('is_public', true);

  const byType: Record<string, number> = {};
  for (const r of data || []) {
    for (const t of r.damage_types || []) {
      byType[t] = (byType[t] || 0) + 1;
    }
  }
  return { total: count || 0, byType };
}
