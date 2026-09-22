/**
 * OTC類似薬「特別の料金」対象 77成分（案）
 *
 * 出典（すべて厚生労働省 公開資料）:
 *  - 成分一覧（案）: 第209回社会保障審議会医療保険部会 参考資料3（令和7年12月25日）
 *      https://www.mhlw.go.jp/content/12401000/001621851.pdf
 *  - 制度概要: 同 資料1-3
 *      https://www.mhlw.go.jp/content/12401000/001621875.pdf
 *
 * 制度の骨子:
 *  - OTC医薬品と成分・投与経路が同一で、一日最大用量が異ならない医療用医薬品を機械的に選定
 *  - 対象: 77成分・約1,100品目（案）
 *  - 特別の料金: 対象薬剤の薬剤費の 1/4（通常の定率負担とは別）
 *  - 実施: 令和8年度中（2027年3月予定）
 *  - 配慮: こども、がん・難病など配慮が必要な慢性疾患、低所得者、入院患者、
 *          医師が長期使用等を医療上必要と考える患者 等は対象外とする方向で検討
 *  - 令和9年度以降、対象範囲の拡大と料率の引き上げを検討
 *
 * 注意: 一覧は「案」。最終的な対象品目は厚労省の告示で確定するため、
 *       確定後は本ファイルを更新すること（listStatus を書き換える）。
 *
 * `ingredientKeys` は lib/slug の normalizeIngredientName() で正規化した
 * 成分名への部分一致キー。switch-data.ts と同じ流儀。
 */

export type OtcSimilarGroup =
  | 'allergy'
  | 'pain'
  | 'cold'
  | 'steroid'
  | 'skin'
  | 'antifungal'
  | 'antiviral'
  | 'gastro'
  | 'laxative'
  | 'mouth_eye'
  | 'antiseptic'
  | 'other';

/** ハブページの表示順。一般の人が「処方薬→市販薬」で探しやすい順 */
export const OTC_SIMILAR_GROUPS: { key: OtcSimilarGroup; label: string; lead: string }[] = [
  { key: 'allergy', label: '花粉症・アレルギー性鼻炎', lead: 'アレグラ・アレジオン・クラリチンなど、毎年処方を受けている人が最も多いグループです。' },
  { key: 'pain', label: '解熱鎮痛・湿布', lead: 'ロキソニン・ボルタレン・湿布類。腰痛・肩こりで定期的に処方されている人に影響します。' },
  { key: 'cold', label: 'かぜ・去痰', lead: 'ムコダインとPL配合顆粒。' },
  { key: 'steroid', label: 'ステロイド外用薬', lead: 'リンデロンV・ロコイド・フルナーゼ点鼻など。' },
  { key: 'skin', label: '保湿・皮膚', lead: 'ヒルドイド・ワセリン・尿素クリームなど、乾燥肌で長期処方されやすいグループです。' },
  { key: 'antifungal', label: 'みずむし・カンジダ', lead: 'ラミシール・エンペシドなどの外用抗真菌薬。' },
  { key: 'antiviral', label: '口唇ヘルペス', lead: 'ゾビラックス軟膏・アラセナ-A。' },
  { key: 'gastro', label: '胃腸薬', lead: 'ガナトン・重曹・下痢止め。' },
  { key: 'laxative', label: '便秘薬', lead: 'マグミット・ラキソベロン・テレミンソフト。' },
  { key: 'mouth_eye', label: '口内炎・のど・目', lead: '口内炎薬、ルゴール液、洗眼薬。' },
  { key: 'antiseptic', label: '殺菌・消毒', lead: 'イソジン・ヒビテン・消毒用エタノールなど。' },
  { key: 'other', label: 'ビタミン・その他', lead: 'ビタミン剤、痔の薬、頻尿薬など。' },
];

export type OtcSimilarIngredient = {
  /** 厚労省資料の通し番号 */
  no: number;
  /** 厚労省資料の成分表記 */
  name: string;
  /** 厚労省資料の用途表記 */
  use: string;
  group: OtcSimilarGroup;
  /** 正規化済み成分名への部分一致キー */
  ingredientKeys: string[];
  /** true のとき ingredientKeys すべてに一致する製品だけを同成分とみなす（配合剤用） */
  matchAll?: boolean;
  /** 製品の成分にこれらが含まれる場合は除外（誤マッチ防止） */
  excludeKeys?: string[];
  /** 代表的な処方薬（先発品）。検索されやすい名前を優先 */
  rxExamples?: string[];
};

export const OTC_SIMILAR_META = {
  listStatus: '案（2025年12月25日 厚労省提示）',
  ingredientCount: 77,
  itemCountLabel: '約1,100品目',
  feeRatioLabel: '薬剤費の4分の1',
  effectiveLabel: '2027年3月（令和8年度中）',
  lawLabel: '改正健康保険法（2026年5月成立）',
  sources: [
    {
      label: '厚生労働省｜特別料金の対象となる医薬品の成分一覧（案）',
      url: 'https://www.mhlw.go.jp/content/12401000/001621851.pdf',
    },
    {
      label: '厚生労働省｜OTC類似薬を含む薬剤自己負担の見直しの在り方について',
      url: 'https://www.mhlw.go.jp/content/12401000/001621875.pdf',
    },
  ],
} as const;

export const OTC_SIMILAR_77: OtcSimilarIngredient[] = [
  { no: 1, name: 'アシクロビル', use: '抗ウイルス薬', group: 'antiviral', ingredientKeys: ['アシクロビル'], rxExamples: ['ゾビラックス軟膏・クリーム'] },
  { no: 2, name: 'アシタザノラスト水和物', use: '抗アレルギー薬', group: 'allergy', ingredientKeys: ['アシタザノラスト'], rxExamples: ['ゼペリン点眼液'] },
  { no: 3, name: 'アスコルビン酸', use: 'ビタミン剤', group: 'other', ingredientKeys: ['アスコルビン酸'], rxExamples: ['アスコルビン酸（ビタミンC）製剤'] },
  { no: 4, name: 'アンモニア水', use: '鎮痛鎮痒収斂消炎剤', group: 'skin', ingredientKeys: ['アンモニア'] },
  { no: 5, name: 'イソコナゾール硝酸塩', use: '抗真菌薬', group: 'antifungal', ingredientKeys: ['イソコナゾール'], rxExamples: ['アデスタン'] },
  { no: 6, name: 'イソプロパノール', use: '殺菌消毒剤', group: 'antiseptic', ingredientKeys: ['イソプロパノール'] },
  { no: 7, name: 'イトプリド塩酸塩', use: '胃薬', group: 'gastro', ingredientKeys: ['イトプリド'], rxExamples: ['ガナトン'] },
  { no: 8, name: 'イブプロフェン', use: '非ステロイド性抗炎症薬（NSAIDs）', group: 'pain', ingredientKeys: ['イブプロフェン'], excludeKeys: ['ピコノール'], rxExamples: ['ブルフェン'] },
  { no: 9, name: 'イブプロフェンピコノール', use: '非ステロイド系消炎鎮痛剤', group: 'skin', ingredientKeys: ['イブプロフェンピコノール'], rxExamples: ['スタデルム', 'ベシカム'] },
  { no: 10, name: 'インドメタシン', use: '鎮痛消炎剤', group: 'pain', ingredientKeys: ['インドメタシン'], rxExamples: ['インテバン', 'イドメシン'] },
  { no: 11, name: 'エタノール', use: '殺菌消毒剤', group: 'antiseptic', ingredientKeys: ['エタノール'] },
  { no: 12, name: 'エピナスチン塩酸塩', use: '抗アレルギー薬', group: 'allergy', ingredientKeys: ['エピナスチン'], rxExamples: ['アレジオン'] },
  { no: 13, name: 'Ｌ－カルボシステイン', use: '去痰薬', group: 'cold', ingredientKeys: ['カルボシステイン'], rxExamples: ['ムコダイン'] },
  { no: 14, name: '塩酸テトラヒドロゾリン・プレドニゾロン', use: '点鼻用血管収縮剤', group: 'allergy', ingredientKeys: ['テトラヒドロゾリン', 'プレドニゾロン'], matchAll: true, rxExamples: ['コールタイジン点鼻液'] },
  { no: 15, name: 'オキシコナゾール硝酸塩', use: '抗真菌薬', group: 'antifungal', ingredientKeys: ['オキシコナゾール'], rxExamples: ['オキナゾール'] },
  { no: 16, name: 'オキシテトラサイクリン塩酸塩・ヒドロコルチゾン', use: '抗生物質・副腎皮質ホルモン配合剤', group: 'steroid', ingredientKeys: ['オキシテトラサイクリン', 'ヒドロコルチゾン'], matchAll: true, rxExamples: ['テラ・コートリル軟膏'] },
  { no: 17, name: 'オキシドール', use: '殺菌消毒剤', group: 'antiseptic', ingredientKeys: ['オキシドール'] },
  { no: 18, name: 'オリブ油', use: '皮膚保護剤', group: 'skin', ingredientKeys: ['オリブ油'] },
  { no: 19, name: '希ヨードチンキ', use: '殺菌消毒剤', group: 'antiseptic', ingredientKeys: ['ヨードチンキ'] },
  { no: 20, name: 'クロトリマゾール', use: '抗真菌薬', group: 'antifungal', ingredientKeys: ['クロトリマゾール'], rxExamples: ['エンペシド'] },
  { no: 21, name: 'クロラムフェニコール', use: '抗生物質', group: 'skin', ingredientKeys: ['クロラムフェニコール'], excludeKeys: ['フラジオマイシン'], rxExamples: ['クロロマイセチン軟膏'] },
  { no: 22, name: 'クロラムフェニコール・フラジオマイシン硫酸塩・プレドニゾロン', use: '抗生物質', group: 'steroid', ingredientKeys: ['クロラムフェニコール', 'フラジオマイシン', 'プレドニゾロン'], matchAll: true, rxExamples: ['クロマイ-P軟膏'] },
  { no: 23, name: 'クロルヘキシジングルコン酸塩', use: '殺菌消毒剤', group: 'antiseptic', ingredientKeys: ['クロルヘキシジン'], rxExamples: ['ヒビテン'] },
  { no: 24, name: 'ケトチフェンフマル酸塩', use: '抗アレルギー薬', group: 'allergy', ingredientKeys: ['ケトチフェン'], rxExamples: ['ザジテン'] },
  { no: 25, name: 'サリチルアミド・アセトアミノフェン・無水カフェイン・プロメタジンメチレンジサリチル酸塩', use: '総合感冒剤', group: 'cold', ingredientKeys: ['サリチルアミド', 'アセトアミノフェン', 'カフェイン', 'プロメタジン'], matchAll: true, rxExamples: ['PL配合顆粒'] },
  { no: 26, name: 'サリチル酸', use: '寄生性皮膚疾患剤', group: 'skin', ingredientKeys: ['サリチル酸'], excludeKeys: ['サリチル酸メチル', 'サリチル酸グリコール'], rxExamples: ['サリチル酸ワセリン'] },
  { no: 27, name: 'サリチル酸メチル・dl-カンフル・トウガラシエキス', use: '鎮痛消炎剤', group: 'pain', ingredientKeys: ['サリチル酸メチル', 'カンフル', 'トウガラシ'], matchAll: true, rxExamples: ['MS温シップ'] },
  { no: 28, name: 'サリチル酸メチル・l-メントール・dl-カンフル', use: '鎮痛消炎剤', group: 'pain', ingredientKeys: ['サリチル酸メチル', 'メントール', 'カンフル'], matchAll: true, excludeKeys: ['トウガラシ', 'グリチルレチン酸'], rxExamples: ['冷感湿布（MS冷シップなど）'] },
  { no: 29, name: 'サリチル酸メチル・l-メントール・dl-カンフル・グリチルレチン酸', use: '鎮痛消炎剤', group: 'pain', ingredientKeys: ['サリチル酸メチル', 'メントール', 'カンフル', 'グリチルレチン酸'], matchAll: true },
  { no: 30, name: '酸化マグネシウム', use: '制酸・緩下剤', group: 'laxative', ingredientKeys: ['酸化マグネシウム'], rxExamples: ['マグミット'] },
  { no: 31, name: '酸化亜鉛', use: '収れん・消炎・保護剤', group: 'skin', ingredientKeys: ['酸化亜鉛'], rxExamples: ['亜鉛華軟膏'] },
  { no: 32, name: '次亜塩素酸ナトリウム', use: '殺菌消毒剤', group: 'antiseptic', ingredientKeys: ['次亜塩素酸'] },
  { no: 33, name: 'ジクロフェナクナトリウム', use: '非ステロイド性抗炎症薬（NSAIDs）', group: 'pain', ingredientKeys: ['ジクロフェナク'], rxExamples: ['ボルタレン（外用）'] },
  { no: 34, name: '消毒用エタノール', use: '殺菌消毒剤', group: 'antiseptic', ingredientKeys: ['エタノール'] },
  { no: 35, name: '静脈血管叢エキス', use: '痔治療薬', group: 'other', ingredientKeys: ['静脈血管叢'], rxExamples: ['ヘモリンガル舌下錠'] },
  { no: 36, name: '精製水', use: '溶解剤', group: 'other', ingredientKeys: ['精製水'] },
  { no: 37, name: '炭酸水素ナトリウム', use: '胃腸薬', group: 'gastro', ingredientKeys: ['炭酸水素ナトリウム'], rxExamples: ['重曹'] },
  { no: 38, name: '沈降炭酸カルシウム・コレカルシフェロール・炭酸マグネシウム', use: 'カルシウム配合剤', group: 'other', ingredientKeys: ['沈降炭酸カルシウム', 'コレカルシフェロール'], matchAll: true, rxExamples: ['デノタスチュアブル配合錠'] },
  { no: 39, name: 'チンク油', use: '消炎薬', group: 'skin', ingredientKeys: ['チンク油'] },
  { no: 40, name: 'デキサメタゾン', use: 'ステロイド', group: 'steroid', ingredientKeys: ['デキサメタゾン'], rxExamples: ['アフタゾロン口腔用軟膏', 'デキサルチン軟膏'] },
  { no: 41, name: 'テルビナフィン塩酸塩', use: '抗真菌薬', group: 'antifungal', ingredientKeys: ['テルビナフィン'], rxExamples: ['ラミシール（外用）'] },
  { no: 42, name: 'トコフェロール酢酸エステル', use: 'ビタミン剤', group: 'other', ingredientKeys: ['トコフェロール酢酸'], rxExamples: ['ユベラ'] },
  { no: 43, name: 'トリアムシノロンアセトニド', use: '口内炎・舌炎薬', group: 'mouth_eye', ingredientKeys: ['トリアムシノロン'], rxExamples: ['アフタッチ', 'ケナログ口腔用軟膏'] },
  { no: 44, name: '尿素', use: '皮膚軟化剤', group: 'skin', ingredientKeys: ['尿素'], rxExamples: ['ケラチナミンコーワクリーム', 'ウレパール'] },
  { no: 45, name: '白色ワセリン', use: '軟膏基剤', group: 'skin', ingredientKeys: ['ワセリン'], rxExamples: ['プロペト', '白色ワセリン'] },
  { no: 46, name: 'ハチミツ', use: '矯味剤', group: 'other', ingredientKeys: ['ハチミツ'] },
  { no: 47, name: 'ピコスルファートナトリウム水和物', use: '緩下剤', group: 'laxative', ingredientKeys: ['ピコスルファート'], rxExamples: ['ラキソベロン'] },
  { no: 48, name: 'ビサコジル', use: '便秘薬', group: 'laxative', ingredientKeys: ['ビサコジル'], rxExamples: ['テレミンソフト坐薬'] },
  { no: 49, name: 'ビダラビン', use: '抗ウイルス薬', group: 'antiviral', ingredientKeys: ['ビダラビン'], rxExamples: ['アラセナ-A'] },
  { no: 50, name: 'ヒドロコルチゾン酪酸エステル', use: 'ステロイド', group: 'steroid', ingredientKeys: ['ヒドロコルチゾン酪酸'], rxExamples: ['ロコイド'] },
  { no: 51, name: 'フェキソフェナジン塩酸塩', use: '抗アレルギー薬', group: 'allergy', ingredientKeys: ['フェキソフェナジン'], excludeKeys: ['プソイドエフェドリン'], rxExamples: ['アレグラ'] },
  { no: 52, name: 'フェキソフェナジン塩酸塩・塩酸プソイドエフェドリン', use: '抗アレルギー薬', group: 'allergy', ingredientKeys: ['フェキソフェナジン', 'プソイドエフェドリン'], matchAll: true, rxExamples: ['ディレグラ配合錠'] },
  { no: 53, name: 'フェルビナク', use: '非ステロイド性抗炎症薬（NSAIDs）', group: 'pain', ingredientKeys: ['フェルビナク'], rxExamples: ['セルタッチ', 'ナパゲルン'] },
  { no: 54, name: 'ブテナフィン塩酸塩', use: '抗真菌薬', group: 'antifungal', ingredientKeys: ['ブテナフィン'], rxExamples: ['メンタックス', 'ボレー'] },
  { no: 55, name: '複方ヨード・グリセリン', use: '口腔用殺菌消毒剤', group: 'mouth_eye', ingredientKeys: ['ヨウ素', 'グリセリン'], matchAll: true, rxExamples: ['ルゴール液'] },
  { no: 56, name: 'ブドウ酒', use: '滋養強壮薬', group: 'other', ingredientKeys: ['ブドウ酒'] },
  { no: 57, name: 'フラボキサート塩酸塩', use: '頻尿・残尿感薬', group: 'other', ingredientKeys: ['フラボキサート'], rxExamples: ['ブラダロン'] },
  { no: 58, name: 'フルチカゾンプロピオン酸エステル', use: 'ステロイド', group: 'allergy', ingredientKeys: ['フルチカゾンプロピオン酸'], rxExamples: ['フルナーゼ点鼻液'] },
  { no: 59, name: 'プレドニゾロン吉草酸エステル酢酸エステル', use: 'ステロイド', group: 'steroid', ingredientKeys: ['プレドニゾロン吉草酸'], rxExamples: ['リドメックス'] },
  { no: 60, name: 'ベタメタゾン吉草酸エステル', use: 'ステロイド', group: 'steroid', ingredientKeys: ['ベタメタゾン吉草酸'], excludeKeys: ['フラジオマイシン', 'ゲンタマイシン'], rxExamples: ['リンデロンV'] },
  { no: 61, name: 'ベタメタゾン吉草酸エステル・フラジオマイシン硫酸塩', use: 'ステロイド', group: 'steroid', ingredientKeys: ['ベタメタゾン吉草酸', 'フラジオマイシン'], matchAll: true, rxExamples: ['リンデロンVG'] },
  { no: 62, name: 'ヘパリン類似物質', use: '血行促進・皮膚保湿剤', group: 'skin', ingredientKeys: ['ヘパリン類似物質'], rxExamples: ['ヒルドイド'] },
  { no: 63, name: 'ベポタスチンベシル酸塩', use: '抗アレルギー薬', group: 'allergy', ingredientKeys: ['ベポタスチン'], rxExamples: ['タリオン'] },
  { no: 64, name: 'ペミロラストカリウム', use: '抗アレルギー薬', group: 'allergy', ingredientKeys: ['ペミロラスト'], rxExamples: ['アレギサール', 'ペミラストン'] },
  { no: 65, name: 'ベルベリン塩化物水和物・ゲンノショウコエキス', use: '止瀉剤', group: 'gastro', ingredientKeys: ['ベルベリン', 'ゲンノショウコ'], matchAll: true, rxExamples: ['フェロベリン配合錠'] },
  { no: 66, name: 'ベンザルコニウム塩化物', use: '殺菌消毒剤', group: 'antiseptic', ingredientKeys: ['ベンザルコニウム'], rxExamples: ['オスバン'] },
  { no: 67, name: 'ホウ砂', use: '眼科用剤', group: 'mouth_eye', ingredientKeys: ['ホウ砂'] },
  { no: 68, name: 'ホウ酸', use: '眼洗浄・消毒薬', group: 'mouth_eye', ingredientKeys: ['ホウ酸'] },
  { no: 69, name: 'ポビドンヨード', use: '殺菌消毒剤', group: 'antiseptic', ingredientKeys: ['ポビドンヨード'], rxExamples: ['イソジン'] },
  { no: 70, name: 'ポリエンホスファチジルコリン', use: '高脂血症薬', group: 'other', ingredientKeys: ['ポリエンホスファチジルコリン'], rxExamples: ['EPLカプセル'] },
  { no: 71, name: 'マルツエキス', use: '乳幼児用便秘薬', group: 'laxative', ingredientKeys: ['マルツエキス'], rxExamples: ['マルツエキス'] },
  { no: 72, name: 'ミコナゾール硝酸塩', use: '抗真菌薬', group: 'antifungal', ingredientKeys: ['ミコナゾール'], rxExamples: ['フロリード'] },
  { no: 73, name: '無水エタノール', use: '殺菌消毒剤', group: 'antiseptic', ingredientKeys: ['エタノール'] },
  { no: 74, name: 'モメタゾンフランカルボン酸エステル水和物', use: 'アレルギー性鼻炎治療薬', group: 'allergy', ingredientKeys: ['モメタゾン'], rxExamples: ['ナゾネックス点鼻液'] },
  { no: 75, name: 'ヨウ素', use: '殺菌消毒剤', group: 'antiseptic', ingredientKeys: ['ヨウ素'], excludeKeys: ['グリセリン'] },
  { no: 76, name: 'ロキソプロフェンナトリウム水和物', use: '解熱消炎鎮痛剤', group: 'pain', ingredientKeys: ['ロキソプロフェン'], rxExamples: ['ロキソニン'] },
  { no: 77, name: 'ロラタジン', use: '抗アレルギー薬', group: 'allergy', ingredientKeys: ['ロラタジン'], excludeKeys: ['デスロラタジン'], rxExamples: ['クラリチン'] },
];

export function getOtcSimilarByNo(no: number): OtcSimilarIngredient | null {
  return OTC_SIMILAR_77.find((i) => i.no === no) || null;
}

/**
 * 正規化済み成分名の配列（1製品分）が、この対象成分に該当するか
 */
export function matchesOtcSimilar(entry: OtcSimilarIngredient, normIngs: string[]): boolean {
  if (normIngs.length === 0) return false;
  if (entry.excludeKeys?.some((x) => normIngs.some((n) => n.includes(x)))) return false;
  const hits = entry.ingredientKeys.map((key) => normIngs.some((n) => n.includes(key)));
  return entry.matchAll ? hits.every(Boolean) : hits.some(Boolean);
}

/**
 * 薬品詳細ページ用: この市販薬と同成分の「特別料金」対象成分を逆引き
 */
export function findOtcSimilarForIngredients(normIngs: string[]): OtcSimilarIngredient[] {
  return OTC_SIMILAR_77.filter((entry) => matchesOtcSimilar(entry, normIngs));
}
