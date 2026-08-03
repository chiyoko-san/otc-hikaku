import { NextResponse } from 'next/server';
import { getEnrichedMedicines } from '@/lib/medicines';

// ビルド時に静的生成し、CDNキャッシュで配信
export const dynamic = 'force-static';

/**
 * 一覧ページの絞り込み検索用スリムインデックス。
 * 詳細データは持たず、検索・フィルタに必要な最小フィールドのみ返す。
 * r: リスク区分 (1 / 2 / 2.5 / 3 / 0=不明, -1=機能性, -2=医薬部外品)
 */
export async function GET() {
  const items = getEnrichedMedicines().map((m) => ({
    n: m.name,
    s: m.slug,
    m: m.maker || '',
    c: m.cat,
    r: m.itype === 'functional' ? -1 : m.itype === 'quasi' ? -2 : m.risk ?? 0,
    d: m.drowsy ? 1 : 0,
    g: (m.symptoms || []).slice(0, 4),
    i: (m.ings || [])
      .slice(0, 3)
      .map((x) => x.replace(/[(（][^)）]*[)）]/g, '').trim()),
  }));

  return NextResponse.json(
    { items },
    {
      headers: {
        'Cache-Control':
          'public, max-age=86400, stale-while-revalidate=604800',
      },
    }
  );
}
