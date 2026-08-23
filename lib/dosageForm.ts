// lib/dosageForm.ts
// 剤形の正規化ユーティリティ
// 用途: 代替品マッチングで「同じ剤形どうし」だけを比較対象にする
//       (点眼薬と内服薬が同一成分を共有していても、代替品としては提示しない)
//
// 【設計方針】
// 1. 判定順は「取り違えたときの被害が大きい剤形」ほど先に評価する。
//    膣錠・坐剤は商品名に「錠」「剤」を含むため、内服より先に確定させないと
//    内服薬として誤分類される。
// 2. 判定材料の優先順位は form(PMDA添付文書由来) > cat(カテゴリ) > name(商品名)。
//    商品名は最も当てにならないので最後に使う。
// 3. 判定できないものは 'other' にする。'other' は比較表から除外される想定なので、
//    無理に内服へ寄せるより安全側に倒す。

export type DosageFormKey =
  | 'oral' // 内服
  | 'topical' // 外用（塗る・貼る）
  | 'eye' // 点眼
  | 'nasal' // 点鼻
  | 'ear' // 点耳
  | 'inhalation' // 吸入
  | 'oralCavity' // 口腔・うがい
  | 'rectal' // 坐剤・浣腸
  | 'vaginal' // 腟剤
  | 'other';

export const DOSAGE_FORM_LABELS: Record<DosageFormKey, string> = {
  oral: '内服薬',
  topical: '外用薬',
  eye: '点眼薬',
  nasal: '点鼻薬',
  ear: '点耳薬',
  inhalation: '吸入薬',
  oralCavity: '口腔・うがい薬',
  rectal: '坐剤・浣腸',
  vaginal: '腟剤',
  other: 'その他',
};

/**
 * カテゴリID(cat)から一意に剤形が決まるもの。商品名判定より優先する。
 *
 * lib/categories.ts のIDに合わせて埋めるほど判定精度が上がる。
 * 特に漢方(〜湯・〜散・〜料)は商品名からの判定が困難なため、
 * カテゴリで内服と確定させるのが最も確実。
 */
const CAT_TO_FORM: Record<string, DosageFormKey> = {
  eye: 'eye',
  // 以下は lib/categories.ts の実際のIDに置き換えて有効化する
  // nose: 'nasal',
  // skin: 'topical',
  // kampo: 'oral',
  // gargle: 'oralCavity',
};

// 判定は上から順に評価する（先に来るものほど優先）
// 順序に意味があるため、並べ替えるときは下のコメントを読むこと
const RULES: { key: DosageFormKey; pattern: RegExp }[] = [
  // --- 内服と取り違えると危険なもの: 必ず oral より先に置く ---

  // 「腟」(U+8154 医学用語・PMDA表記) と「膣」(U+8193 商品名表記) は別の文字。
  // 片方だけだと「メンソレータムフレディCC膣錠」が oral に落ちる。
  { key: 'vaginal', pattern: /腟|膣/ },

  // 「注入軟膏」は topical の「軟膏」より先に評価する必要がある
  { key: 'rectal', pattern: /坐剤|坐薬|座剤|座薬|浣腸|注入軟膏|直腸/ },

  // --- 局所適用: 部位が違えば代替にならない ---
  { key: 'eye', pattern: /点眼|目薬|眼科用|洗眼|アイ.?ドロップ|コンタクト/ },
  { key: 'ear', pattern: /点耳|耳科用|耳浴/ },
  { key: 'nasal', pattern: /点鼻|鼻炎スプレー|鼻用|鼻腔|ノーズ.?スプレー/ },
  { key: 'inhalation', pattern: /吸入/ },

  // 「口中錠」は oral の「錠」より先に評価する必要がある
  {
    key: 'oralCavity',
    pattern:
      /うがい|含嗽|トローチ|ドロップ剤|口中錠|口腔用|口内炎パッチ|マウスウォッシュ/,
  },

  // --- 外用 ---
  // 「入浴剤」は oral に「湯」を追加した場合の誤爆(例:「きき湯」)を防ぐため先に置く
  {
    key: 'topical',
    pattern:
      /外用|軟膏|クリーム|ゲル|ジェル|ローション|外用液|パップ|カタプラズマ|テープ|貼付|パッチ|プラスター|スプレー|エアゾール|絆創膏|チンキ|育毛|養毛|入浴剤|浴用/,
  },

  // --- 内服(最後) ---
  {
    key: 'oral',
    pattern:
      /錠|カプセル|顆粒|細粒|散剤|散$|シロップ|内服液|内用液|ドリンク|飲料|エキス|丸$|ゼリー|チュアブル/,
  },
];

/** 1つの文字列に対してルールを順に当て、最初に一致した剤形を返す */
function matchRules(text: string | null | undefined): DosageFormKey {
  if (!text) return 'other';
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.key;
  }
  return 'other';
}

/**
 * 商品名（＋カテゴリ、あれば剤形カラム）から剤形グループを判定する
 *
 * 判定材料の優先順位は form > cat > name。
 * 旧実装は form と name を連結して判定していたため、
 * 商品名側の文字列が正しい剤形情報を上書きし得た。
 *
 * @param name 商品名
 * @param cat  カテゴリID（medicines.cat）
 * @param form DBに剤形カラムがある場合はその値（PMDA添付文書由来を推奨）
 */
export function normalizeDosageForm(
  name: string,
  cat?: string | null,
  form?: string | null
): DosageFormKey {
  // 1. 添付文書由来の剤形が最も信頼できる
  const byForm = matchRules(form);
  if (byForm !== 'other') return byForm;

  // 2. カテゴリで一意に決まるもの
  if (cat && CAT_TO_FORM[cat]) return CAT_TO_FORM[cat];

  // 3. 商品名からの推定（最も当てにならない）
  return matchRules(name);
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
