import raw from '@/data/switch-drugs.json';
import textRaw from '@/data/switch-text.json';
import type { SwitchDrug, SwitchAnswer } from './switch-data';

// 配置先: lib/switch-generated.ts
//
// NDBオープンデータ（処方数量）から機械的に選んだ処方薬（scripts/build_switch_candidates.py → data/switch-drugs.json）を、
// 手書きの30薬（lib/switch-data.ts の SWITCH_DRUGS）と同じ SwitchDrug の形に変換する。
//   - 市販薬の照合は生成時に済ませてあるので、ページ側は otcIds / otcComboIds をそのまま使う（成分名の部分一致による誤爆を避ける）
//   - 「処方薬との違い」の文章は data/switch-text.json に承認済みのものがあれば入れる（Phase2）。無ければ空（Phase1）
//   - index: 同じ成分を含む市販薬がある、または上乗せ料金の対象、の薬だけ検索エンジンに出す（それ以外は noindex）

export type GeneratedRxItem = {
  code: string;
  name: string;
  spec: string;
  maker: string;
  price: number;
  kind: '先発' | '後発' | 'その他' | string;
  route: string;
  qty: number;
};

type GeneratedDrug = {
  slug: string;
  rxName: string;
  genericName: string;
  ingredientKeys: string[];
  categoryLabel: string;
  catCode: string;
  routes: string[];
  otcSimilarNo: number | null;
  otcRisk: number | null;
  otcSingleIds: number[];
  otcComboIds: number[];
  index: boolean;
  rank: number;
  rxItems: GeneratedRxItem[];
  phase: number;
};

export type SwitchText = {
  same: string;
  differs: string;
  caution?: string;
  sources?: string[];
  /** 下書きした日（PRがマージされた＝承認） */
  drafted?: string;
  approved?: string | null;
};

type Dataset = { generated_from: string; total: number; drugs: GeneratedDrug[] };
type TextFile = { _note?: string; _entries: Record<string, SwitchText> };

const DATA = raw as Dataset;
const TEXT = (textRaw as TextFile)._entries ?? {};

/** 薬効分類（3桁）→ サイトの市販薬カテゴリ。「同じ成分の市販薬が無い薬」で似た用途の市販薬へ案内するときに使う */
const CAT_TO_SITE: Record<string, string> = {
  '114': 'cold', '222': 'cough', '223': 'cough', '226': 'cough', '229': 'cough',
  '231': 'stomach', '232': 'stomach', '233': 'stomach', '234': 'stomach', '235': 'stomach', '236': 'stomach', '239': 'stomach',
  '131': 'eye', '132': 'nose', '264': 'ext_pain', '263': 'ext_skin', '265': 'ext_skin', '266': 'ext_skin', '269': 'ext_skin',
  '449': 'allergy', '441': 'allergy', '313': 'vitamin', '311': 'vitamin', '312': 'vitamin', '317': 'vitamin',
  '259': 'women', '255': 'anal', '333': 'circu', '339': 'circu', '217': 'circu', '218': 'circu', '214': 'circu',
  '620': 'foot', '629': 'foot', '261': 'disinfect', '279': 'oral', '271': 'oral',
};

const toRisk = (r: number | null): SwitchAnswer['otcRisk'] =>
  r === 1 || r === 2 || r === 2.5 || r === 3 ? r : 2;

export const GENERATED_SOURCE_LABEL = DATA.generated_from;

export function generatedSwitchDrugs(): SwitchDrug[] {
  return DATA.drugs.map((d) => {
    const text = TEXT[d.slug];
    const answer: SwitchAnswer = {
      otcRisk: toRisk(d.otcRisk),
      same: text?.same ?? '',
      differs: text?.differs ?? '',
      otcIds: d.otcSingleIds,
      otcComboIds: d.otcComboIds,
      groupBy: 'none',
      sources: text?.sources,
    };
    return {
      slug: d.slug,
      rxName: d.rxName,
      genericName: d.genericName,
      ingredientKeys: d.ingredientKeys,
      categoryLabel: d.categoryLabel,
      doseNote: '',
      altNote:
        d.otcSingleIds.length + d.otcComboIds.length === 0
          ? `${d.genericName}を含む市販薬は販売されていません。同じ用途の市販薬は成分が違うため、切り替えるかどうかは医師・薬剤師に相談してください。`
          : undefined,
      caution: text?.caution ?? '市販薬は製品ごとに対象年齢・使える症状・1回の量が違います。購入の前にパッケージの「使用上の注意」を読み、迷ったら薬剤師・登録販売者に相談してください。',
      otcSimilarNo: d.otcSimilarNo,
      updated: text?.approved ?? text?.drafted,
      answer,
      source: 'generated',
      index: d.index,
      catCode: d.catCode,
      siteCategory: CAT_TO_SITE[d.catCode],
      rxItems: d.rxItems,
      rank: d.rank,
    } satisfies SwitchDrug;
  });
}
