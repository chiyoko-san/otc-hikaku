import type { Medicine } from '@/types';
import { getEnrichedMedicines } from './medicines';
import { normalizeIngredientName } from './slug';

/**
 * 処方薬 → 市販薬 切替データ
 *
 * 2026年度からのOTC類似薬 保険適用見直しで急増する
 * 「(処方薬名) 市販 同じ」系の検索需要の受け皿。
 * 市販薬リストは medicines.json から成分マッチで動的に生成するため、
 * ここには処方薬側の情報と解説のみを持つ。
 */
export type SwitchDrug = {
  slug: string;
  rxName: string;          // 処方薬名(先発名)
  genericName: string;     // 一般名
  ingredientKeys: string[]; // 正規化済み成分名にマッチさせるキー(部分一致)
  categoryLabel: string;   // 表示用カテゴリ
  doseNote: string;        // 処方薬と市販薬の用量・剤形の違い
  caution: string;         // 切替時の注意
  altNote?: string;        // 同成分の市販薬が見つからない場合の案内
};

export const SWITCH_DRUGS: SwitchDrug[] = [
  {
    slug: 'allegra',
    rxName: 'アレグラ',
    genericName: 'フェキソフェナジン塩酸塩',
    ingredientKeys: ['フェキソフェナジン'],
    categoryLabel: 'アレルギー用薬',
    doseNote:
      '医療用は1回60mgを1日2回が一般的です。市販のフェキソフェナジン製剤(アレグラFXなど)も1回60mg・1日2回で、含有量は同等です。',
    caution:
      '7日間程度服用しても症状が良くならない場合は、服用を中止して医師・薬剤師に相談してください。',
  },
  {
    slug: 'loxonin',
    rxName: 'ロキソニン',
    genericName: 'ロキソプロフェンナトリウム水和物',
    ingredientKeys: ['ロキソプロフェン'],
    categoryLabel: '解熱鎮痛薬',
    doseNote:
      '医療用の錠剤は1錠60mgで、市販のロキソプロフェン製剤(ロキソニンSなど)も1錠60mgと含有量は同等です。テープ・パップなどの外用剤も市販されています。',
    caution:
      '内服は第1類医薬品のため、購入時に薬剤師からの情報提供が必要です。胃腸障害のリスクがあるため空腹時の服用は避け、ぜんそくの既往がある方は購入前に必ず相談してください。',
  },
  {
    slug: 'gaster',
    rxName: 'ガスター',
    genericName: 'ファモチジン',
    ingredientKeys: ['ファモチジン'],
    categoryLabel: '胃腸薬(H2ブロッカー)',
    doseNote:
      '医療用は1回10〜20mgですが、市販のガスター10は1回10mgです。処方で20mgを服用していた場合、市販薬では1回あたりの含有量が異なります。自己判断で倍量を服用しないでください。',
    caution:
      '第1類医薬品のため薬剤師からの情報提供が必要です。2週間を超えて続けて服用しないでください。胃の症状が続く場合は受診が必要です。',
  },
  {
    slug: 'calonal',
    rxName: 'カロナール',
    genericName: 'アセトアミノフェン',
    ingredientKeys: ['アセトアミノフェン'],
    categoryLabel: '解熱鎮痛薬',
    doseNote:
      '医療用は1錠200〜500mgの規格があります。市販薬は製品ごとに1回量あたりの含有量が異なるため(300mg等)、パッケージの用法用量を必ず確認してください。',
    caution:
      '解熱鎮痛成分としてアセトアミノフェンを含む市販薬は多数あります。総合感冒薬などとの重複服用による過量摂取(肝障害リスク)に注意してください。',
  },
  {
    slug: 'mucodyne',
    rxName: 'ムコダイン',
    genericName: 'カルボシステイン',
    ingredientKeys: ['カルボシステイン'],
    categoryLabel: '去痰薬',
    doseNote:
      '医療用は1錠250mg/500mgの規格があります。市販の同成分製剤は製品により1回量が異なるため、用法用量を確認してください。',
    caution:
      'せき・たんが2週間以上続く場合は、他の疾患の可能性があるため受診してください。',
  },
  {
    slug: 'alesion',
    rxName: 'アレジオン',
    genericName: 'エピナスチン塩酸塩',
    ingredientKeys: ['エピナスチン'],
    categoryLabel: 'アレルギー用薬',
    doseNote:
      '医療用は1回10〜20mgを1日1回。市販のアレジオン20は1回20mg・1日1回(就寝前)で、20mg処方と同等の含有量です。',
    caution:
      '眠気が出ることがあるため、服用後の車の運転は避けてください。',
  },
  {
    slug: 'claritin',
    rxName: 'クラリチン',
    genericName: 'ロラタジン',
    ingredientKeys: ['ロラタジン'],
    categoryLabel: 'アレルギー用薬',
    doseNote:
      '医療用・市販(クラリチンEXなど)ともに1回10mg・1日1回で、含有量は同等です。',
    caution:
      '眠気が出にくい第二世代抗ヒスタミン薬ですが、体質により眠気が出る場合があります。',
  },
  {
    slug: 'zyrtec',
    rxName: 'ジルテック',
    genericName: 'セチリジン塩酸塩',
    ingredientKeys: ['セチリジン'],
    categoryLabel: 'アレルギー用薬',
    doseNote:
      '医療用・市販(ストナリニZなど)ともに1回10mgの製剤があり、含有量は同等です。',
    caution:
      '眠気が出ることがあるため、服用後の車の運転は避けてください。',
  },
  {
    slug: 'xyzal',
    rxName: 'ザイザル',
    genericName: 'レボセチリジン塩酸塩',
    ingredientKeys: ['レボセチリジン'],
    categoryLabel: 'アレルギー用薬',
    doseNote: '',
    caution:
      '症状が続く場合は自己判断で類似薬に切り替えず、医師・薬剤師に相談してください。',
    altNote:
      'レボセチリジンを配合した市販薬は現在流通が確認できません。近い成分としてはセチリジン(ジルテックの市販版)配合の製品がありますが、同一成分ではないため、切替は薬剤師に相談してください。',
  },
  {
    slug: 'hirudoid',
    rxName: 'ヒルドイド',
    genericName: 'ヘパリン類似物質',
    ingredientKeys: ['ヘパリン類似物質'],
    categoryLabel: '保湿・血行促進(外用)',
    doseNote:
      '医療用は0.3%製剤が中心で、市販のヘパリン類似物質製剤にも0.3%配合の製品が多数あります。剤形(クリーム/ローション/フォーム)の選択肢も豊富です。',
    caution:
      '出血性血液疾患のある方は使用できません。傷口には使用しないでください。',
  },
  {
    slug: 'voltaren',
    rxName: 'ボルタレン(外用)',
    genericName: 'ジクロフェナクナトリウム',
    ingredientKeys: ['ジクロフェナク'],
    categoryLabel: '外用鎮痛消炎薬',
    doseNote:
      '市販のジクロフェナク外用剤(ゲル・テープ)は1%配合の製品が中心で、医療用外用剤と同等の濃度帯です。',
    caution:
      'ぜんそくの既往がある方は使用前に相談してください。長期連用は避け、2週間使用しても改善しない場合は受診してください。',
  },
  {
    slug: 'rinderon-vg',
    rxName: 'リンデロンVG',
    genericName: 'ベタメタゾン吉草酸エステル・ゲンタマイシン',
    ingredientKeys: ['ベタメタゾン'],
    categoryLabel: 'ステロイド外用薬',
    doseNote:
      '市販のリンデロンVsはステロイド(ベタメタゾン吉草酸エステル)は同じですが、抗生物質ゲンタマイシンを配合していません。化膿を伴う症状には医療用と同じ効果は期待できません。',
    caution:
      'ステロイド外用薬は長期・広範囲の使用を避けてください。5〜6日使用しても改善しない場合は受診してください。',
  },
  {
    slug: 'pl',
    rxName: 'PL配合顆粒',
    genericName: '非ピリン系感冒剤配合薬',
    ingredientKeys: ['サリチルアミド'],
    categoryLabel: 'かぜ薬',
    doseNote:
      '市販のパイロンPL顆粒は医療用PL配合顆粒と同じ4成分(サリチルアミド・アセトアミノフェン・無水カフェイン・プロメタジン)の配合設計です。',
    caution:
      '眠気が出るため服用後の運転は避けてください。他の解熱鎮痛薬・かぜ薬との併用はしないでください。',
  },
  {
    slug: 'lopemin',
    rxName: 'ロペミン',
    genericName: 'ロペラミド塩酸塩',
    ingredientKeys: ['ロペラミド'],
    categoryLabel: '止瀉薬',
    doseNote:
      '医療用は1カプセル1mgですが、市販のロペラミド製剤は1回0.5mgの製品が中心で、含有量が異なります。',
    caution:
      '食あたり・水あたりによる下痢や発熱を伴う下痢には使用しないでください(症状悪化のおそれ)。2〜3日服用しても改善しない場合は受診してください。',
  },
  {
    slug: 'nauzelin',
    rxName: 'ナウゼリン',
    genericName: 'ドンペリドン',
    ingredientKeys: ['ドンペリドン'],
    categoryLabel: '消化管運動改善薬',
    doseNote: '',
    caution:
      '吐き気・嘔吐が続く場合は原因の特定が重要です。市販薬で対処せず受診してください。',
    altNote:
      'ドンペリドンを配合した市販薬は現在流通が確認できません。吐き気・胃部不快感に対しては作用の異なる市販の胃腸薬が選択肢になりますが、同一成分ではないため薬剤師に相談してください。',
  },
  {
    slug: 'kakkonto',
    rxName: '葛根湯(医療用)',
    genericName: '葛根湯エキス',
    ingredientKeys: ['葛根湯'],
    categoryLabel: '漢方製剤',
    doseNote:
      '医療用と市販の葛根湯は同じ処方(葛根湯)ですが、1日あたりのエキス量(満量処方かどうか)が製品により異なります。',
    caution:
      '体力が中程度以上の方向けの処方です。胃腸の弱い方・発汗の多い方は不向きな場合があります。',
  },
  {
    slug: 'mohrus',
    rxName: 'モーラステープ',
    genericName: 'ケトプロフェン',
    ingredientKeys: ['ケトプロフェン'],
    categoryLabel: '外用鎮痛消炎薬',
    doseNote:
      'ケトプロフェン配合の市販外用剤は流通が限られています。市販ではジクロフェナク・フェルビナク・インドメタシンなど別のNSAIDs外用剤が中心です。',
    caution:
      'ケトプロフェンは光線過敏症(貼付部を日光に当てるとかぶれる)の報告が多い成分です。貼付部の遮光を徹底し、はがした後も4週間程度は直射日光を避けてください。',
  },
];

export function getSwitchDrugBySlug(slug: string): SwitchDrug | null {
  return SWITCH_DRUGS.find((d) => d.slug === slug) || null;
}

/**
 * 切替エントリに対応する同成分の市販薬を medicines.json から抽出
 */
export function getOtcMatchesForSwitch(entry: SwitchDrug, limit = 12): Medicine[] {
  const enriched = getEnrichedMedicines();
  const result: Medicine[] = [];
  for (const med of enriched) {
    const normIngs = (med.ings || []).map((i) => normalizeIngredientName(i));
    const hit = entry.ingredientKeys.some((key) =>
      normIngs.some((n) => n.includes(key))
    );
    if (hit) {
      result.push(med);
      if (result.length >= limit) break;
    }
  }
  return result;
}

/**
 * 薬品詳細ページ用: この市販薬に関連する処方薬切替エントリを逆引き
 */
export function findSwitchDrugsForMedicine(med: Medicine): SwitchDrug[] {
  const normIngs = (med.ings || []).map((i) => normalizeIngredientName(i));
  return SWITCH_DRUGS.filter((entry) =>
    entry.ingredientKeys.some((key) => normIngs.some((n) => n.includes(key)))
  );
}
