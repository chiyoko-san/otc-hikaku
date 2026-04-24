import { createServerClient } from './server';
import type { Column } from '@/types';

export async function getPublishedColumns(limit = 50): Promise<Column[]> {
  const sb = createServerClient();
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

export async function getColumnBySlugOrId(key: string): Promise<Column | null> {
  const sb = createServerClient();
  // slug カラム優先、なければ id カラムで引く
  let { data } = await sb
    .from('columns')
    .select('*')
    .eq('slug', key)
    .eq('status', 'published')
    .maybeSingle();

  if (!data) {
    const res = await sb
      .from('columns')
      .select('*')
      .eq('id', key)
      .eq('status', 'published')
      .maybeSingle();
    data = res.data;
  }

  return (data as Column | null) || null;
}

export async function getAllColumnSlugs(): Promise<string[]> {
  const sb = createServerClient();
  const { data } = await sb
    .from('columns')
    .select('id, slug')
    .eq('status', 'published');
  if (!data) return [];
  return data.map((c) => c.slug || c.id).filter(Boolean);
}

export async function getColumnsByTag(tag: string, limit = 10): Promise<Column[]> {
  const sb = createServerClient();
  const { data } = await sb
    .from('columns')
    .select('*')
    .eq('status', 'published')
    .eq('tag', tag)
    .order('date', { ascending: false })
    .limit(limit);
  return (data || []) as Column[];
}
