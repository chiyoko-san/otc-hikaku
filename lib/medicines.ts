import type { Medicine, Ingredient, Symptom } from '@/types';
import {
  medicineNameToSlug,
  normalizeIngredientName,
  ingredientNameToSlug,
  symptomNameToSlug,
  uniquifySlug,
} from './slug';
import { SYMPTOM_GROUPS } from './symptom-groups';
import medicinesRaw from '@/data/medicines.json';

// 成分辞書(医学的な説明文)
export const INGREDIENT_DICT: Record<string, string> = {
  'アセトアミノフェン': '解熱・鎮痛。胃への刺激が少なく空腹時でも服用可能。過量服用で肝障害リスク。',
  'イブプロフェン': '消炎・鎮痛・解熱。NSAIDs。空腹時は胃腸障害に注意。喘息・妊娠後期禁忌。',
  'ロキソプロフェンNa': 'プロドラッグ型NSAIDs。強力な消炎鎮痛。第1類(薬剤師要相談)。',
  'ロキソプロフェンナトリウム': 'プロドラッグ型NSAIDs。強力な消炎鎮痛。第1類(薬剤師要相談)。',
  'クロルフェニラミンマレイン酸塩': '第一世代抗ヒスタミン薬。鼻水・くしゃみ改善。眠気強め・運転不可。',
  'ジフェンヒドラミン塩酸塩': '第一世代抗ヒスタミン薬。強い鎮静作用。運転不可。耐性が出やすい。',
  'フェキソフェナジン塩酸塩': '第二世代抗ヒスタミン薬。眠気が出にくい。花粉症・アレルギー性鼻炎に。',
  'ロラタジン': '第二世代抗ヒスタミン薬。1日1回。眠気少。アレルギー性鼻炎・蕁麻疹に。',
  'ジヒドロコデインリン酸塩': '中枢性鎮咳薬。強力な咳止め。依存性あり・12歳未満禁忌・眠気必発。',
  'アリルイソプロピルアセチル尿素': '鎮静補助成分。2023年AU全面規制・2025年KR麻薬類指定。依存性あり・眠気必発。',
  'ブロムワレリル尿素': '鎮静補助成分。海外規制済。依存性あり・眠気必発・連用禁忌。',
  'ファモチジン': 'H2ブロッカー。胃酸分泌抑制。胸やけ・胃痛に効果。第1類(薬剤師要相談)。',
  'ミノキシジル': '血管拡張で頭皮血流改善。発毛・育毛促進。要指導(薬剤師要相談)。4ヶ月以上継続必要。',
  'トラネキサム酸': '抗プラスミン薬。肝斑・シミの改善に特異的効果。炎症・アレルギー反応を抑制。',
  'フルスルチアミン': '脂溶性ビタミンB1誘導体。神経機能維持・エネルギー代謝促進。通常B1より吸収良好。',
  'シアノコバラミン': 'ビタミンB12。神経細胞修復・DNA合成に必須。末梢神経障害・しびれに有効。',
  'コンドロイチン硫酸エステルNa': '軟骨の主成分。関節軟骨保護・再生補助。膝・腰の関節痛緩和。',
  'ニコチン': 'ニコチン代替療法。禁煙補助。第1類(薬剤師要相談)。喫煙との併用禁忌。',
  'ポビドンヨード': 'ヨウ素系殺菌消毒。細菌・ウイルス・真菌に広範な効果。甲状腺疾患・妊婦注意。',
  'テルビナフィン塩酸塩': 'アリルアミン系抗真菌薬。白癬菌の細胞膜合成阻害。水虫・たむしに有効。',
  'グアイフェネシン': '去痰薬。気道分泌液を増やし痰を柔らかく排出促進。水分補給で効果UP。',
  'ビサコジル': '大腸刺激型下剤。就寝前服用で翌朝効果。連用で依存性・妊婦注意。',
  'センノシド': '刺激性下剤。大腸を刺激し排便促進。連用禁忌。腹痛を伴う便秘には禁忌。',
};

type RawMedicine = Omit<Medicine, 'slug'>;
type RawJson = { total: number; updated_at: string; medicines: RawMedicine[] };

let _medicines: Medicine[] | null = null;
let _ingredients: Ingredient[] | null = null;
let _symptoms: Symptom[] | null = null;
let _bySlug: Map<string, Medicine> | null = null;
let _byId: Map<number, Medicine> | null = null;

/**
 * 全医薬品データ (7554件) を取得
 * ビルド時に一度だけロードし、slug 付与して返す
 */
export function getAllMedicines(): Medicine[] {
  if (_medicines) return _medicines;

  const raw = (medicinesRaw as unknown as RawJson).medicines;
  const existing = new Set<string>();

  _medicines = raw.map((m) => {
    const baseSlug = medicineNameToSlug(m.name);
    const slug = uniquifySlug(baseSlug, existing);
    return { ...m, slug };
  });

  return _medicines;
}

/**
 * 詳細あり (effect が埋まっている) 薬品のみ取得 (622件想定)
 * SEO 対象
 */
export function getEnrichedMedicines(): Medicine[] {
  return getAllMedicines().filter((m) => m.effect && m.effect.length > 0);
}

/**
 * slug → 薬品 (Map化: 7,000件超×全ページ生成でも O(1))
 */
export function getMedicineBySlug(slug: string): Medicine | null {
  if (!_bySlug) {
    _bySlug = new Map(getAllMedicines().map((m) => [m.slug, m]));
  }
  return _bySlug.get(slug) || null;
}

/**
 * ID → 薬品 (旧URL互換, Map化)
 */
export function getMedicineById(id: number): Medicine | null {
  if (!_byId) {
    _byId = new Map(getAllMedicines().map((m) => [m.id, m]));
  }
  return _byId.get(id) || null;
}

/**
 * カテゴリ別 (詳細あり)
 */
export function getMedicinesByCategory(cat: string): Medicine[] {
  return getEnrichedMedicines().filter((m) => m.cat === cat);
}

/**
 * 症状別 (詳細あり)
 */
export function getMedicinesBySymptom(symptom: string): Medicine[] {
  return getEnrichedMedicines().filter((m) =>
    (m.symptoms || []).includes(symptom)
  );
}

/**
 * 成分一覧を集約 (詳細あり622件の ings から)
 * 表記ゆれを正規化した上で統合
 */
export function getAllIngredients(): Ingredient[] {
  if (_ingredients) return _ingredients;

  const enriched = getEnrichedMedicines();
  const map = new Map<string, Ingredient>();
  const slugSet = new Set<string>();

  for (const med of enriched) {
    for (const rawIng of med.ings || []) {
      const normalized = normalizeIngredientName(rawIng);
      if (!normalized) continue;

      if (!map.has(normalized)) {
        const slug = uniquifySlug(ingredientNameToSlug(normalized), slugSet);
        map.set(normalized, {
          name: normalized,
          slug,
          rawNames: [],
          description: INGREDIENT_DICT[normalized],
          medicineIds: [],
        });
      }
      const ing = map.get(normalized)!;
      if (!ing.rawNames.includes(rawIng)) ing.rawNames.push(rawIng);
      if (!ing.medicineIds.includes(med.id)) ing.medicineIds.push(med.id);
    }
  }

  _ingredients = Array.from(map.values()).sort(
    (a, b) => b.medicineIds.length - a.medicineIds.length
  );
  return _ingredients;
}

/**
 * slug → 成分
 */
export function getIngredientBySlug(slug: string): Ingredient | null {
  return getAllIngredients().find((i) => i.slug === slug) || null;
}

/**
 * 症状一覧を集約 (詳細あり622件の symptoms から)
 */
export function getAllSymptoms(): Symptom[] {
  if (_symptoms) return _symptoms;

  const enriched = getEnrichedMedicines();
  const map = new Map<string, Symptom>();
  const slugSet = new Set<string>();

  // 症状→グループのマップ作成
  const symToGroup = new Map<string, string>();
  for (const g of SYMPTOM_GROUPS) {
    for (const s of g.symptoms) {
      if (!symToGroup.has(s)) symToGroup.set(s, g.group);
    }
  }

  for (const med of enriched) {
    for (const sym of med.symptoms || []) {
      if (!map.has(sym)) {
        const slug = uniquifySlug(symptomNameToSlug(sym), slugSet);
        map.set(sym, {
          name: sym,
          slug,
          group: symToGroup.get(sym),
          medicineIds: [],
        });
      }
      map.get(sym)!.medicineIds.push(med.id);
    }
  }

  _symptoms = Array.from(map.values()).sort(
    (a, b) => b.medicineIds.length - a.medicineIds.length
  );
  return _symptoms;
}

/**
 * slug → 症状
 */
export function getSymptomBySlug(slug: string): Symptom | null {
  return getAllSymptoms().find((s) => s.slug === slug) || null;
}

/**
 * 類似薬品 (理由付き): 同成分か同カテゴリかを区別して返す
 */
export type SimilarMedicine = { med: Medicine; sameIngredient: boolean };

export function getSimilarMedicinesWithReason(
  med: Medicine,
  limit = 6
): SimilarMedicine[] {
  const all = getEnrichedMedicines();
  const seen = new Set<number>([med.id]);
  const result: SimilarMedicine[] = [];

  const myIngs = new Set(
    (med.ings || []).map((i) => normalizeIngredientName(i))
  );

  // 1) 同一成分を優先
  for (const other of all) {
    if (seen.has(other.id)) continue;
    const otherIngs = (other.ings || []).map((i) =>
      normalizeIngredientName(i)
    );
    if (otherIngs.some((i) => myIngs.has(i))) {
      result.push({ med: other, sameIngredient: true });
      seen.add(other.id);
      if (result.length >= limit) return result;
    }
  }

  // 2) 同一カテゴリで補完
  for (const other of all) {
    if (seen.has(other.id)) continue;
    if (other.cat === med.cat) {
      result.push({ med: other, sameIngredient: false });
      seen.add(other.id);
      if (result.length >= limit) return result;
    }
  }

  return result;
}

/**
 * 類似薬品 (同成分 → 同カテゴリの順で選ぶ)
 */
export function getSimilarMedicines(med: Medicine, limit = 6): Medicine[] {
  const all = getEnrichedMedicines();
  const seen = new Set<number>([med.id]);
  const result: Medicine[] = [];

  // 1) 同一成分を優先
  const myIngs = new Set(
    (med.ings || []).map((i) => normalizeIngredientName(i))
  );
  for (const other of all) {
    if (seen.has(other.id)) continue;
    const otherIngs = new Set(
      (other.ings || []).map((i) => normalizeIngredientName(i))
    );
    const overlap = Array.from(myIngs).filter((i) => otherIngs.has(i));
    if (overlap.length > 0) {
      result.push(other);
      seen.add(other.id);
      if (result.length >= limit) return result;
    }
  }

  // 2) 同一カテゴリで補完
  for (const other of all) {
    if (seen.has(other.id)) continue;
    if (other.cat === med.cat) {
      result.push(other);
      seen.add(other.id);
      if (result.length >= limit) return result;
    }
  }

  return result;
}
