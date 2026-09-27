import { getPublishedColumns } from './supabase/columns';

// 配置先: lib/related-columns.ts
// 薬ページ・切替ページの下に出す「関連コラム」を選ぶ。
// 成分名・薬名・カテゴリ・症状がタイトル/要約に含まれるコラムを優先し、
// 足りなければ制度ネタ（上乗せ料金・制度解説）の新しいもので埋める。

export type ColumnLite = {
  id: string;
  slug?: string | null;
  title?: string | null;
  summary?: string | null;
  tag?: string | null;
  date?: string | null;
  updated_at?: string | null;
};

const SUFFIX_RE =
  /(塩酸塩|ナトリウム|カリウム|カルシウム|マグネシウム|水和物|フマル酸|ベシル酸|硫酸|酢酸|吉草酸|酪酸|プロピオン酸|フランカルボン酸|マレイン酸|臭化|塩化|エステル|グルコン酸|メチレンジサリチル酸|無水)/;

/** 「ロキソプロフェンナトリウム水和物」→ ["ロキソプロフェンナトリウム水和物", "ロキソプロフェン"] */
function stems(name: string): string[] {
  const out = [name];
  const m = name.match(SUFFIX_RE);
  if (m && m.index !== undefined && m.index >= 3) out.push(name.slice(0, m.index));
  return out;
}

export function columnHref(c: ColumnLite): string {
  return `/columns/${c.slug || c.id}/`;
}

export async function pickRelatedColumns(opts: {
  ingredients: string[]; // 正規化済み成分名
  keywords: string[]; // 薬名・カテゴリ・処方薬名・症状など
  limit?: number;
}): Promise<ColumnLite[]> {
  const limit = opts.limit ?? 3;
  let cols: ColumnLite[] = [];
  try {
    cols = ((await getPublishedColumns(300)) as unknown as ColumnLite[]) || [];
  } catch {
    return [];
  }
  if (cols.length === 0) return [];

  const kws = Array.from(
    new Set(
      [...opts.ingredients.flatMap(stems), ...opts.keywords]
        .map((k) => (k || '').trim())
        .filter((k) => k.length >= 2)
    )
  );

  const scored = cols
    .map((c) => {
      const hay = `${c.title || ''} ${c.summary || ''}`;
      let score = 0;
      for (const k of kws) {
        if (hay.includes(k)) score += k.length >= 4 ? 3 : 2;
      }
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || String(b.c.date || '').localeCompare(String(a.c.date || '')));

  const picked: ColumnLite[] = scored.slice(0, limit).map((x) => x.c);

  if (picked.length < limit) {
    const used = new Set(picked.map((c) => c.id));
    const policy = cols
      .filter((c) => !used.has(c.id) && (c.tag === '上乗せ料金' || c.tag === '制度解説'))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    for (const c of policy) {
      if (picked.length >= limit) break;
      picked.push(c);
    }
  }
  return picked;
}
