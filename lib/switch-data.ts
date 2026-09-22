import type { Medicine } from '@/types';
import { getEnrichedMedicines } from './medicines';
import { normalizeIngredientName } from './slug';
import { getOtcSimilarByNo, type OtcSimilarIngredient } from './otc-similar-77';

/**
 * 処方薬 → 市販薬 切替データ
 *
 * 2027年3月から始まるOTC類似薬の「特別の料金」（薬剤費の1/4を追加負担）で急増する
 * 「(処方薬名) 市販 同じ」「(処方薬名) 対象」系の検索需要の受け皿。
 * 市販薬リストは medicines.json から成分マッチで動的に生成するため、
 * ここには処方薬側の情報と解説のみを持つ。
 *
 * otcSimilarNo: lib/otc-similar-77.ts の通し番号。
 *   number → 特別料金の対象（案）
 *   null   → 77成分の案に含まれない（=対象外。「対象外です」と明示することにも検索価値がある）
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
  otcSimilarNo: number | null; // 特別料金 対象77成分（案）の番号。null=対象外
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
    otcSimilarNo: 51,
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
    otcSimilarNo: 76,
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
    otcSimilarNo: null,
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
    otcSimilarNo: null,
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
    otcSimilarNo: 13,
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
    otcSimilarNo: 12,
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
    otcSimilarNo: 77,
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
    otcSimilarNo: null,
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
    otcSimilarNo: null,
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
    otcSimilarNo: 62,
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
    otcSimilarNo: 33,
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
    altNote:
      'リンデロンVGは抗生物質ゲンタマイシンを配合しており、同じ組み合わせの市販薬はありません。ステロイド成分だけ同じ市販薬（リンデロンVsなど）はありますが、化膿を伴う症状には使えません。',
    // 77成分の案にあるのは「ベタメタゾン吉草酸エステル・フラジオマイシン硫酸塩」（ベトネベートN）で、
    // ゲンタマイシン配合のリンデロンVGは含まれない（薬価基準リストで確認済み）
    otcSimilarNo: null,
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
    otcSimilarNo: 25,
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
    otcSimilarNo: null,
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
    otcSimilarNo: null,
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
    otcSimilarNo: null,
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
    otcSimilarNo: null,
  },

  // ------------------------------------------------------------------
  // 2026-09 追加: 特別料金の対象77成分（案）のうち、処方頻度が高く
  // 同成分の市販薬が明確なもの。公開前に doseNote / caution の医薬情報を
  // 添付文書と照合すること（要レビュー）。
  // ------------------------------------------------------------------
  {
    slug: 'rinderon-v',
    rxName: 'リンデロンV',
    genericName: 'ベタメタゾン吉草酸エステル',
    ingredientKeys: ['ベタメタゾン吉草酸'],
    categoryLabel: 'ステロイド外用薬',
    doseNote:
      '市販のリンデロンVs(軟膏・クリーム・ローション)は医療用リンデロンVと同じベタメタゾン吉草酸エステル0.12%で、濃度は同等です。',
    caution:
      'ストロングクラスのステロイドです。顔・首・陰部など皮膚の薄い部位、広範囲、長期の使用は避けてください。化膿している部位には使えません。5〜6日使用しても改善しない場合は受診してください。',
    otcSimilarNo: 60,
  },
  {
    slug: 'flunase',
    rxName: 'フルナーゼ点鼻液',
    genericName: 'フルチカゾンプロピオン酸エステル',
    ingredientKeys: ['フルチカゾンプロピオン酸'],
    categoryLabel: 'アレルギー性鼻炎用点鼻薬(ステロイド)',
    doseNote:
      '医療用は現在フルチカゾン点鼻液(後発品)が中心です。市販のフルナーゼ点鼻薬(季節性アレルギー専用)は同じ成分・同じ1噴霧50µgの製剤です。',
    caution:
      '市販版は季節性アレルギー性鼻炎(花粉症)専用で、通年性の鼻炎や18歳未満には使えません。3か月を超える連続使用は避け、症状が続く場合は受診してください。',
    otcSimilarNo: 58,
  },
  {
    slug: 'talion',
    rxName: 'タリオン',
    genericName: 'ベポタスチンベシル酸塩',
    ingredientKeys: ['ベポタスチン'],
    categoryLabel: 'アレルギー用薬',
    doseNote:
      '医療用は1回10mgを1日2回。市販のタリオンAR/ARビジョンも1回10mg・1日2回で、含有量は同等です。',
    caution:
      '眠気が出ることがあるため、服用後の車の運転は避けてください。市販版は15歳以上が対象です。',
    otcSimilarNo: 63,
  },
  {
    slug: 'zaditen',
    rxName: 'ザジテン',
    genericName: 'ケトチフェンフマル酸塩',
    ingredientKeys: ['ケトチフェン'],
    categoryLabel: 'アレルギー用薬(内服・点鼻・点眼)',
    doseNote:
      '市販のザジテンAL鼻炎カプセル(1回1mg・1日2回)、点鼻薬、点眼薬はいずれも医療用と同成分で、含有量は同等です。',
    caution:
      '抗ヒスタミン薬の中でも眠気が出やすい成分です。服用後の車の運転は避けてください。',
    otcSimilarNo: 24,
  },
  {
    slug: 'magmitt',
    rxName: 'マグミット',
    genericName: '酸化マグネシウム',
    ingredientKeys: ['酸化マグネシウム'],
    categoryLabel: '便秘薬(塩類下剤)',
    doseNote:
      '市販の酸化マグネシウム便秘薬は医療用と同成分です。1日量の上限(2,000mg)の範囲で、便の状態を見ながら量を調節します。',
    caution:
      '腎機能が低下している方・高齢者は高マグネシウム血症のリスクがあるため、長期・大量の服用は避け、医師・薬剤師に相談してください。一部の抗菌薬などと吸収の相互作用があります。',
    otcSimilarNo: 30,
  },
  {
    slug: 'lamisil',
    rxName: 'ラミシール(外用)',
    genericName: 'テルビナフィン塩酸塩',
    ingredientKeys: ['テルビナフィン'],
    categoryLabel: 'みずむし薬(外用)',
    doseNote:
      '市販のラミシールAT(クリーム・液・スプレー)は医療用外用剤と同じテルビナフィン1%です。',
    caution:
      '対象は外用剤のみで、爪白癬などに使う内服薬の市販版はありません。症状が消えても再発防止のため4週間程度は塗り続け、2週間使っても改善しない場合は受診してください。',
    otcSimilarNo: 41,
  },
  {
    slug: 'zovirax',
    rxName: 'ゾビラックス軟膏',
    genericName: 'アシクロビル',
    ingredientKeys: ['アシクロビル'],
    categoryLabel: '口唇ヘルペス治療薬(外用)',
    doseNote:
      '市販のアクチビア軟膏・ヘルペシアクリームなどは医療用と同じアシクロビル5%です。',
    caution:
      '市販版は「過去に医師の診断を受けた口唇ヘルペスの再発」にのみ使えます。初めての発症、性器ヘルペス、目の周囲には使えません。',
    otcSimilarNo: 1,
  },
  {
    slug: 'isodine',
    rxName: 'イソジンガーグル',
    genericName: 'ポビドンヨード',
    ingredientKeys: ['ポビドンヨード'],
    categoryLabel: 'うがい薬・殺菌消毒',
    doseNote:
      '市販のイソジンうがい薬は医療用イソジンガーグルと同じポビドンヨード7%で、希釈方法も同じです。',
    caution:
      'ヨウ素過敏症の方は使えません。甲状腺疾患のある方は連用前に医師・薬剤師に相談してください。',
    otcSimilarNo: 69,
  },
  {
    slug: 'propeto',
    rxName: 'プロペト・白色ワセリン',
    genericName: '白色ワセリン',
    ingredientKeys: ['ワセリン'],
    categoryLabel: '保湿・皮膚保護',
    doseNote:
      '市販の白色ワセリンやプロペト ピュアベールは医療用と同じ白色ワセリンです。',
    caution:
      '目の周りや傷口に使う場合は、精製度の高い製品(プロペトなど)を選んでください。',
    otcSimilarNo: 45,
  },
  {
    slug: 'keratinamin',
    rxName: 'ケラチナミンコーワクリーム',
    genericName: '尿素',
    ingredientKeys: ['尿素'],
    categoryLabel: '保湿・角質軟化',
    doseNote:
      '市販のケラチナミンコーワ20%尿素配合クリームは医療用と同じ尿素20%です。10%の製品もあります。',
    caution:
      'ひび割れやただれた部位に塗るとしみることがあります。目の周りには使わないでください。',
    otcSimilarNo: 44,
  },
  {
    slug: 'seltouch',
    rxName: 'セルタッチ・ナパゲルン',
    genericName: 'フェルビナク',
    ingredientKeys: ['フェルビナク'],
    categoryLabel: '外用鎮痛消炎薬',
    doseNote:
      '市販のフェイタスなどフェルビナク外用剤は同成分ですが、濃度(3.5%・5%)や1枚あたりの含有量は製品ごとに異なります。',
    caution:
      'ぜんそくの既往がある方は使用前に相談してください。市販版は15歳未満には使えません。2週間使用しても改善しない場合は受診してください。',
    otcSimilarNo: 53,
  },
  {
    slug: 'laxoberon',
    rxName: 'ラキソベロン',
    genericName: 'ピコスルファートナトリウム水和物',
    ingredientKeys: ['ピコスルファート'],
    categoryLabel: '便秘薬',
    doseNote:
      '市販のピコラックスなどは1錠2.5mgで、医療用ラキソベロン錠と同じ含有量です。',
    caution:
      '連用すると効きにくくなることがあります。腹痛・吐き気を伴う場合は使用せず受診してください。',
    otcSimilarNo: 47,
  },
  {
    slug: 'teleminsoft',
    rxName: 'テレミンソフト坐薬',
    genericName: 'ビサコジル',
    ingredientKeys: ['ビサコジル'],
    categoryLabel: '便秘薬',
    doseNote:
      '市販のコーラック(錠剤)やコーラック坐薬タイプは医療用と同じビサコジルですが、1回量が製品により異なります。用法用量を確認してください。',
    caution:
      '腸を直接刺激する薬なので連用は避けてください。腹痛・吐き気がある場合は使用せず受診してください。',
    otcSimilarNo: 48,
  },
];

export function getSwitchDrugBySlug(slug: string): SwitchDrug | null {
  return SWITCH_DRUGS.find((d) => d.slug === slug) || null;
}

/** 特別料金 対象77成分（案）の番号から切替ガイドを引く */
export function getSwitchDrugsByOtcSimilarNo(no: number): SwitchDrug[] {
  return SWITCH_DRUGS.filter((d) => d.otcSimilarNo === no);
}

/** 切替ガイドに対応する対象成分（案）の情報。null なら対象外 */
export function getOtcSimilarForSwitch(entry: SwitchDrug): OtcSimilarIngredient | null {
  return entry.otcSimilarNo == null ? null : getOtcSimilarByNo(entry.otcSimilarNo);
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
