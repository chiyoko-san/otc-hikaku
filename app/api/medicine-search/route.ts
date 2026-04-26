import { NextRequest, NextResponse } from 'next/server';
import { getAllMedicines } from '@/lib/medicines';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchResultItem = {
  id: string;             // 内部ID(`med:1` or `ad:abc123`)
  source: 'medicine' | 'ad_product';
  medicine_id?: number;   // medicines の id
  ad_product_id?: string; // ad_products の id
  name: string;
  maker: string | null;
  category?: string;
  classification?: string;
};

const MAX_RESULTS = 12;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (!q || q.length < 1) {
    return NextResponse.json({ items: [] });
  }

  const lowerQ = q.toLowerCase();
  const items: SearchResultItem[] = [];

  // === 1. medicines (静的JSON) を検索 ===
  const medicines = getAllMedicines();
  // 完全一致先頭マッチ → 部分マッチの順でスコアリング
  const medMatches = medicines
    .map((m) => {
      const name = m.name.toLowerCase();
      let score = 0;
      if (name === lowerQ) score = 100;
      else if (name.startsWith(lowerQ)) score = 50;
      else if (name.includes(lowerQ)) score = 10;
      else if ((m.maker || '').toLowerCase().includes(lowerQ)) score = 3;
      // 詳細あり優先(SEOで重視)
      if (m.effect) score += 5;
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS);

  for (const { m } of medMatches) {
    items.push({
      id: `med:${m.id}`,
      source: 'medicine',
      medicine_id: m.id,
      name: m.name,
      maker: m.maker,
      category: m.cat,
    });
  }

  // === 2. ad_products (Supabase) を検索 ===
  // medicines の検索結果が少なければ補完する
  if (items.length < MAX_RESULTS) {
    const sb = createServerClient();
    if (sb) {
      const remaining = MAX_RESULTS - items.length;
      const { data } = await sb
        .from('ad_products')
        .select('id, name, maker, category, classification')
        .or(`name.ilike.%${q}%,maker.ilike.%${q}%`)
        .eq('is_published', true)
        .limit(remaining);

      for (const p of data || []) {
        items.push({
          id: `ad:${p.id}`,
          source: 'ad_product',
          ad_product_id: p.id,
          name: p.name,
          maker: p.maker,
          category: p.category,
          classification: p.classification,
        });
      }
    }
  }

  return NextResponse.json({ items });
}
