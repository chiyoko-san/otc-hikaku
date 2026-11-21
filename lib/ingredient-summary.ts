// 配置先: lib/ingredient-summary.ts
//
// 成分ページ（/ingredients/<slug>/）の「まず結論」・題名・よくある質問に使う集計。
// 数字はすべて掲載データ（data/medicines.json）から数える。データに無いこと（副作用など）は書かない。
//
// 成分がずれている疑いのある取り込み分（lib/indexable.ts の隔離対象）は「確認中」として分け、
// 結論・題名・質問の数字には入れない（確認できた製品だけで数える）。
// 確認できた製品が1つも無い成分は、結論の箱も質問も出さず、これまでどおりの表示にする。

import type { Ingredient, Medicine } from '@/types';
import { getAllIngredients, getAllMedicines } from './medicines';
import { normalizeIngredientName } from './slug';
import { isQuarantinedMedicine, isIndexableMedicine } from './indexable';

const RISK_ORDER = ['1', '2.5', '2', '3'] as const;
const RISK_NAMES: Record<string, string> = {
  '1': '第1類',
  '2.5': '指定第2類',
  '2': '第2類',
  '3': '第3類',
};

export type Summary = {
  meds: Medicine[]; // 成分を確認できた製品（検索に出している製品が先）
  pending: Medicine[]; // 成分データを確認中の製品（隔離対象）。数字には入れない
  medicineCount: number; // 医薬品・医薬部外品
  foodCount: number; // 機能性表示食品
  riskParts: string[]; // 「第2類 12品」
  topSymptoms: string[]; // 多い順に3つまで
  topProducts: string[]; // 代表的な製品名3つまで
  partners: { name: string; slug: string; count: number }[]; // 一緒に配合されることが多い成分
};

export function summarize(ing: Ingredient): Summary {
  const medMap = new Map(getAllMedicines().map((m) => [m.id, m]));
  const everything = ing.medicineIds.map((id) => medMap.get(id)!).filter(Boolean);
  const listed = everything.filter((m) => !isQuarantinedMedicine(m));
  const pending = everything.filter((m) => isQuarantinedMedicine(m));

  // 検索に出している製品を先に（並び順はそれ以外変えない）
  const meds = [
    ...listed.filter((m) => isIndexableMedicine(m)),
    ...listed.filter((m) => !isIndexableMedicine(m)),
  ];

  const foods = meds.filter((m) => m.itype === 'functional');
  const drugs = meds.filter((m) => m.itype !== 'functional');

  const riskCount = new Map<string, number>();
  for (const m of drugs) {
    const k = String(m.risk);
    if (RISK_NAMES[k]) riskCount.set(k, (riskCount.get(k) || 0) + 1);
  }
  const riskParts = RISK_ORDER.filter((k) => riskCount.get(k)).map(
    (k) => `${RISK_NAMES[k]} ${riskCount.get(k)}品`
  );

  // どんな薬に入っているか: この成分を含む製品の適応症状を数える（2割以上の製品に出てくるものだけ）。
  // 製品全体の効能なので「この成分が〇〇に効く」とは書かない
  const symCount = new Map<string, number>();
  for (const m of meds) {
    for (const sname of m.symptoms || []) {
      symCount.set(sname, (symCount.get(sname) || 0) + 1);
    }
  }
  const minShare = Math.max(1, Math.ceil(meds.length * 0.2));
  const topSymptoms = [...symCount.entries()]
    .filter(([, c]) => c >= minShare)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([n]) => n);

  const topProducts = meds.slice(0, 3).map((m) => m.name);

  // 一緒に配合されることが多い成分（成分ページ同士をつなぐ）
  const slugOf = new Map(getAllIngredients().map((i) => [i.name, i.slug]));
  const partnerCount = new Map<string, number>();
  for (const m of meds) {
    const seen = new Set<string>();
    for (const raw of m.ings || []) {
      const n = normalizeIngredientName(raw);
      if (!n || n === ing.name || seen.has(n)) continue;
      seen.add(n);
      partnerCount.set(n, (partnerCount.get(n) || 0) + 1);
    }
  }
  const partners = [...partnerCount.entries()]
    .filter(([n, c]) => c >= 2 && slugOf.has(n))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, slug: slugOf.get(name)!, count }));

  return {
    meds,
    pending,
    medicineCount: drugs.length,
    foodCount: foods.length,
    riskParts,
    topSymptoms,
    topProducts,
    partners,
  };
}

/** 「何品あるか」の言い方（医薬品と機能性表示食品を混ぜて「市販薬」と呼ばない） */
export function countLabel(sum: Summary): string {
  if (sum.medicineCount > 0 && sum.foodCount > 0)
    return `市販薬${sum.medicineCount}品・機能性表示食品${sum.foodCount}品`;
  if (sum.foodCount > 0) return `機能性表示食品${sum.foodCount}品`;
  return `市販薬${sum.medicineCount}品`;
}

export function buildFaqs(ing: Ingredient, sum: Summary) {
  const faqs: { q: string; a: string }[] = [];
  const names = sum.topProducts.join('、');

  if (sum.medicineCount > 0) {
    faqs.push({
      q: `${ing.name}は市販薬で買えますか?`,
      a:
        `はい。${ing.name}を含む市販薬は、当サイトの掲載データで成分を確認できたものだけで${sum.medicineCount}品あります` +
        (names ? `(${names}など)。` : '。') +
        (sum.riskParts.length > 0 ? `区分の内訳は${sum.riskParts.join('、')}です。` : '') +
        '区分や使える年齢は製品ごとに違うため、購入前に各製品の添付文書を確認してください。',
    });
  } else if (sum.foodCount > 0) {
    faqs.push({
      q: `${ing.name}を含む製品はありますか?`,
      a: `当サイトの掲載データでは、${ing.name}を含む機能性表示食品が${sum.foodCount}品あります。機能性表示食品は医薬品ではなく、病気の治療や予防を目的としたものではありません。`,
    });
  }

  if (sum.topSymptoms.length > 0 && sum.medicineCount > 0) {
    faqs.push({
      q: `${ing.name}はどんな市販薬に入っていますか?`,
      a:
        `${ing.name}は、効能に「${sum.topSymptoms.join('」「')}」を含む市販薬に多く入っています。` +
        'これは製品全体の効能で、この成分だけの働きではありません。' +
        (ing.description ? `成分としての特徴: ${ing.description}` : '') +
        '製品ごとの効能・効果は各製品ページと添付文書で確認してください。',
    });
  }
  return faqs;
}
