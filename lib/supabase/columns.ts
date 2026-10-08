import { createServerClient } from './server';
import type { Column } from '@/types';

/**
 * 配置先: lib/supabase/columns.ts
 *
 * 2026-10 の障害(ビルド45分超・Supabase転送量超過)の原因と対策:
 *   以前の getPublishedColumns は select('*') で本文(body)込みの全件を返していた。
 *   公開記事が70本を超えて1回の応答が数MBになり、Next.js のデータキャッシュ上限(2MB)を
 *   超えてキャッシュされなくなった。その結果、薬ページ・切替ページ(約830ページ)を
 *   1枚作るたびに数MBをSupabaseから取り直していた。
 *
 *   本文が必要なのは記事ページ本体(getColumnBySlugOrId)だけなので、
 *   一覧・関連記事・サイトマップ・OG画像で使う一覧系は本文を外し、
 *   さらに取得結果を2分間メモリに持って使い回す。
 */

/** 一覧系で返す「本文なし」のコラム */
export type ColumnListItem = Omit<Column, 'body' | 'publish_at'>;

const LIST_FIELDS = 'id, slug, title, date, tag, summary, thumb, status, updated_at';
const LIST_MAX = 500;
const LIST_TTL_MS = 2 * 60 * 1000;

let listCache: { at: number; promise: Promise<ColumnListItem[]> } | null = null;

async function fetchPublishedList(): Promise<ColumnListItem[]> {
  const sb = createServerClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('columns')
      .select(LIST_FIELDS)
      .eq('status', 'published')
      .order('date', { ascending: false, nullsFirst: false })
      .limit(LIST_MAX);
    if (error) {
      console.error('[getPublishedColumns]', error);
      return [];
    }
    return (data || []) as unknown as ColumnListItem[];
  } catch (e) {
    console.error('[getPublishedColumns] fetch failed:', e);
    return [];
  }
}

/**
 * 公開中のコラム一覧(本文なし、新しい順)。
 * 最大500件を1回で取り、limit 件を返す。2分以内の再呼び出しは同じ結果を使い回すので、
 * ビルド中もサーバー稼働中もSupabaseへの問い合わせは数回で済む。
 * 取得に失敗した(0件だった)ときはキャッシュせず、次の呼び出しで取り直す。
 */
export async function getPublishedColumns(limit = 50): Promise<ColumnListItem[]> {
  const now = Date.now();
  let entry = listCache;
  if (!entry || now - entry.at > LIST_TTL_MS) {
    const promise = fetchPublishedList();
    entry = { at: now, promise };
    listCache = entry;
    promise.then(
      (rows) => {
        if (rows.length === 0 && listCache?.promise === promise) listCache = null;
      },
      () => {
        if (listCache?.promise === promise) listCache = null;
      }
    );
  }
  const rows = await entry.promise;
  return rows.slice(0, Math.min(limit, LIST_MAX));
}

/**
 * slug または id でコラムを本文込みで1件取得(記事ページ用)
 * @param key スラッグまたはID
 * @param includeDrafts true なら下書きも含めて取得(プレビュー用)
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

/** 公開中コラムの slug(なければ id)一覧。generateStaticParams 用 */
export async function getAllColumnSlugs(): Promise<string[]> {
  const cols = await getPublishedColumns(LIST_MAX);
  return cols.map((c) => c.slug || c.id).filter(Boolean);
}

export async function getColumnsByTag(tag: string, limit = 10): Promise<ColumnListItem[]> {
  const cols = await getPublishedColumns(LIST_MAX);
  return cols.filter((c) => c.tag === tag).slice(0, limit);
}
