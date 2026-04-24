import type { Category } from '@/types';

export const CATEGORIES: Category[] = [
  { id: 'cold', label: 'かぜ薬・解熱鎮痛' },
  { id: 'stomach', label: '消化器官用薬' },
  { id: 'allergy', label: 'アレルギー用薬' },
  { id: 'cough', label: '鎮咳・去痰・含嗽薬' },
  { id: 'nose', label: '鼻炎用薬' },
  { id: 'ext_pain', label: '外皮用薬(鎮痛)' },
  { id: 'ext_skin', label: '外皮用薬(皮膚)' },
  { id: 'eye', label: '眼科用薬' },
  { id: 'joint', label: '関節・筋肉(内服)' },
  { id: 'skin_oral', label: '皮膚科・シミ(内服)' },
  { id: 'hair', label: '育毛・発毛薬' },
  { id: 'women', label: '女性用薬' },
  { id: 'sleep', label: '催眠鎮静薬' },
  { id: 'vitamin', label: 'ビタミン・滋養強壮' },
  { id: 'kampo', label: '漢方製剤' },
  { id: 'foot', label: '水虫・皮膚感染' },
  { id: 'oral', label: '歯科口腔用薬' },
  { id: 'anal', label: '痔疾用薬' },
  { id: 'circu', label: '循環器・血液用薬' },
  { id: 'smoking', label: '禁煙補助剤' },
  { id: 'motion', label: '乗物酔い' },
  { id: 'test', label: '一般用検査薬' },
  { id: 'disinfect', label: '消毒薬' },
  { id: 'quasi_skin', label: '医薬部外品(スキンケア)' },
  { id: 'quasi_oral', label: '医薬部外品(オーラルケア)' },
  { id: 'quasi_hair', label: '医薬部外品(育毛)' },
  { id: 'func_gut', label: '機能性表示(腸内環境)' },
  { id: 'func_eye', label: '機能性表示(目の健康)' },
  { id: 'func_joint', label: '機能性表示(関節・骨)' },
  { id: 'func_stress', label: '機能性表示(ストレス・睡眠)' },
  { id: 'func_fat', label: '機能性表示(体脂肪・血糖)' },
];

export const CATEGORY_MAP: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label])
);

export function getCategoryLabel(id: string): string {
  return CATEGORY_MAP[id] || id;
}
