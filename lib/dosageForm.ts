// lib/dosageForm.ts
// 剤形の正規化ユーティリティ
// 用途: 代替品マッチングで「同じ剤形どうし」だけを比較対象にする
//       (点眼薬と内服薬が同一成分を共有していても、代替品としては提示しない)

export type DosageFormKey =
  | 'oral' // 内服
  | 'topical' // 外用（塗る・貼る）
  | 'eye' // 点眼
  | 'nasal' // 点鼻
  | 'oralCavity' // 口腔・うがい
  | 'rectal' // 坐剤・浣腸
  | 'other';

export const DOSAGE_FORM_LABELS: Record<DosageFormKey, string> = {
  oral: '内服薬',
  topical: '外用薬',
  eye: '点眼薬',
  nasal: '点鼻薬',
  oralCavity: '口腔・うがい薬',
  rectal: '坐剤・浣腸',
  other: 'その他',
};

/** カテゴリID(cat)から一意に剤形が決まるもの。名前判定より優先する */
const CAT_TO_FORM: Record<string, DosageFormKey> = {
  eye: 'eye',
  // 必要に応じて lib/categories.ts のIDに合わせて追加
  // 例: nose: 'nasal', skin: 'topical',
};

// 判定は上から順に評価する（先に来るものほど優先）
const RULES: { key: DosageFormKey; pattern: RegExp }[] = [
  { key: 'eye', pattern: /点眼|目薬|眼科用|洗眼|アイ.?ドロップ|コンタクト/ },
  { key: 'nasal', pattern: /点鼻|鼻炎スプレー|鼻用|ノーズ.?スプレー/ },
  {
    key: 'oralCavity',
    pattern: /うがい|含嗽|トローチ|ドロップ剤|口中錠|口腔用|マウスウォッシュ/,
  },
  { key: 'rectal', pattern: /坐剤|坐薬|座薬|浣腸|注入軟膏/ },
  {
    key: 'topical',
    pattern:
      /軟膏|クリーム|ゲル|ジェル|ローション|外用液|パップ|テープ|貼付|パッチ|スプレー|エアゾール|絆創膏|チンキ|育毛剤|養毛/,
  },
  {
    key: 'oral',
    pattern:
      /錠|カプセル|顆粒|細粒|散剤|散$|シロップ|内服液|内用液|ドリンク|飲料|エキス|丸$|ゼリー/,
  },
];

/**
 * 商品名（＋カテゴリ、あれば剤形カラム）から剤形グループを判定する
 * @param name 商品名
 * @param cat  カテゴリID（medicines.cat）
 * @param form DBに剤形カラムがある場合はその値（PMDA添付文書由来を推奨）
 */
export function normalizeDosageForm(
  name: string,
  cat?: string | null,
  form?: string | null
): DosageFormKey {
  if (cat && CAT_TO_FORM[cat]) return CAT_TO_FORM[cat];
  const target = `${form ?? ''} ${name ?? ''}`;
  for (const rule of RULES) {
    if (rule.pattern.test(target)) return rule.key;
  }
  return 'other';
}

type FormSource = {
  name: string;
  cat?: string | null;
  form?: string | null;
};

/**
 * 代替品マッチング用: 同一剤形グループかどうか
 * 判定不能(other)が絡む場合は false を返し、誤った代替提示を防ぐ
 */
export function isSameDosageGroup(a: FormSource, b: FormSource): boolean {
  const ka = normalizeDosageForm(a.name, a.cat, a.form);
  const kb = normalizeDosageForm(b.name, b.cat, b.form);
  if (ka === 'other' || kb === 'other') return false;
  return ka === kb;
}
