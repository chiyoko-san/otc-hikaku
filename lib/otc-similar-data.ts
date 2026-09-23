import { getEnrichedMedicines } from './medicines';
import { normalizeIngredientName } from './slug';
import { SWITCH_DRUGS } from './switch-data';
import {
  OTC_SIMILAR_77,
  OTC_SIMILAR_GROUPS,
  matchesOtcSimilar,
  type OtcSimilarGroup,
} from './otc-similar-77';

// 配置先: lib/otc-similar-data.ts
// /otc-similar/ 配下の各ページが共通で使う、表示用データの組み立て。

export const OTC_SIMILAR_PATHS = {
  hub: '/otc-similar/',
  name: '/otc-similar/name/',
  use: '/otc-similar/use/',
  simulator: '/otc-similar/simulator/',
  photo: '/otc-similar/photo/',
  group: (key: string) => `/otc-similar/use/${key}/`,
} as const;

export type OtcSimilarMedicine = { name: string; slug: string };
export type OtcSimilarGuide = { slug: string; rxName: string };

export type OtcSimilarRow = {
  no: number;
  name: string; // 成分名（厚労省表記）
  use: string; // 用途
  group: OtcSimilarGroup;
  rxExamples: string[]; // 代表的な処方薬
  otcCount: number;
  otcTop: OtcSimilarMedicine[];
  guides: OtcSimilarGuide[];
};

export type OtcSimilarName = {
  label: string; // 処方薬名
  kana: string; // あ〜わ / 英
  target: boolean; // 上乗せ料金の対象か
  no: number | null; // 対象成分の番号（対象外は null）
  group: OtcSimilarGroup | null;
  guideSlug?: string; // 切替ガイドの slug
};

export function getOtcSimilarGroup(key: string) {
  return OTC_SIMILAR_GROUPS.find((g) => g.key === key) || null;
}

export function getOtcSimilarRows(): OtcSimilarRow[] {
  const normed = getEnrichedMedicines().map((m) => ({
    m,
    ings: (m.ings || []).map((i) => normalizeIngredientName(i)),
  }));

  return OTC_SIMILAR_77.map((ing) => {
    const otc = normed.filter(({ ings }) => matchesOtcSimilar(ing, ings)).map((x) => x.m);
    const guides = SWITCH_DRUGS.filter((d) => d.otcSimilarNo === ing.no).map((d) => ({
      slug: d.slug,
      rxName: d.rxName,
    }));
    return {
      no: ing.no,
      name: ing.name,
      use: ing.use,
      group: ing.group,
      rxExamples: ing.rxExamples ?? [],
      otcCount: otc.length,
      otcTop: otc.slice(0, 3).map((m) => ({ name: m.name, slug: m.slug })),
      guides,
    };
  });
}

export function getOtcSimilarRowsByGroup(group: string): OtcSimilarRow[] {
  return getOtcSimilarRows().filter((r) => r.group === group);
}

// 頭文字の判定（あ〜わ行 / 英）。漢字始まりの名前は個別に指定する
const KANA_OVERRIDES: Record<string, string> = {
  亜鉛華軟膏: 'あ',
  重曹: 'さ',
  白色ワセリン: 'は',
  '冷感湿布（MS冷シップなど）': 'ら',
  '葛根湯(医療用)': 'か',
};

export function kanaRow(label: string): string {
  if (KANA_OVERRIDES[label]) return KANA_OVERRIDES[label];
  const c = label.charCodeAt(0);
  const ranges: [number, number, string][] = [
    [0x30a1, 0x30aa, 'あ'], [0x30f4, 0x30f4, 'あ'],
    [0x30ab, 0x30b4, 'か'],
    [0x30b5, 0x30be, 'さ'],
    [0x30bf, 0x30c9, 'た'],
    [0x30ca, 0x30ce, 'な'],
    [0x30cf, 0x30dd, 'は'],
    [0x30de, 0x30e2, 'ま'],
    [0x30e3, 0x30e8, 'や'],
    [0x30e9, 0x30ed, 'ら'],
    [0x30ef, 0x30f3, 'わ'],
  ];
  const hit = ranges.find(([lo, hi]) => c >= lo && c <= hi);
  return hit ? hit[2] : '英';
}

/** 名前さくいん: 対象成分の代表薬 ＋ 切替ガイドにある対象外の薬 */
export function getOtcSimilarNames(): OtcSimilarName[] {
  const names: OtcSimilarName[] = [];
  for (const ing of OTC_SIMILAR_77) {
    const guide = SWITCH_DRUGS.find((d) => d.otcSimilarNo === ing.no);
    for (const label of ing.rxExamples ?? []) {
      names.push({
        label,
        kana: kanaRow(label),
        target: true,
        no: ing.no,
        group: ing.group,
        guideSlug: guide?.slug,
      });
    }
  }
  for (const d of SWITCH_DRUGS) {
    if (d.otcSimilarNo == null) {
      names.push({
        label: d.rxName,
        kana: kanaRow(d.rxName),
        target: false,
        no: null,
        group: null,
        guideSlug: d.slug,
      });
    }
  }
  names.sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  return names;
}
