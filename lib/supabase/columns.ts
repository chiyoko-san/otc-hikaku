import { createServerClient } from './server';
import type { Column } from '@/types';

export async function getPublishedColumns(limit = 50): Promise<Column[]> {
  const sb = createServerClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('columns')
    .select('*')
    .eq('status', 'published')
    .order('date', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    console.error('[getPublishedColumns]', error);
    return [];
  }
  return (data || []) as Column[];
}

/**
 * slug または id でコラムを取得
 * @param key スラッグまたはID
 * @param includeDrafts true なら下書きも含めて取得（プレビュー用）
 */
export async function getColumnBySlugOrId(
  key: string,
  includeDrafts = false
): Promise<Column | null> {
  const sb = createServerClient();
  if (!sb) return null;

  // slug カラム優先、なければ id カラムで引く
  let query = sb.from('columns').select('*').eq('slug', key);
  if (!includeDrafts) {
    query = query.eq('status', 'published');
  }
  let { data } = await query.maybeSingle();

  if (!data) {
    let query2 = sb.from('columns').select('*').eq('id', key);
    if (!includeDrafts) {
      query2 = query2.eq('status', 'published');
    }
    const res = await query2.maybeSingle();
    data = res.data;
  }
  return (data as Column | null) || null;
}

export async function getAllColumnSlugs(): Promise<string[]> {
  const sb = createServerClient();
  if (!sb) return [];
  const { data } = await sb
    .from('columns')
    .select('id, slug')
    .eq('status', 'published');
  if (!data) return [];
  return data.map((c) => c.slug || c.id).filter(Boolean);
}

export async function getColumnsByTag(tag: string, limit = 10): Promise<Column[]> {
  const sb = createServerClient();
  if (!sb) return [];
  const { data } = await sb
    .from('columns')
    .select('*')
    .eq('status', 'published')
    .eq('tag', tag)
    .order('date', { ascending: false })
    .limit(limit);
  return (data || []) as Column[];
}
