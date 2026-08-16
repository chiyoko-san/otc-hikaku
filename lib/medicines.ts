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
  // 出典: 厚生労働省「試験問題の作成に関する手引き」（令和8年4月一部改訂）
// 第3章 Ⅰ 精神神経に作用する薬（1 かぜ薬 / 2 解熱鎮痛薬）の範囲
// 既存 INGREDIENT_DICT に存在する成分は原則として除外（末尾に表記ゆれメモあり）
// ── 解熱鎮痛成分（サリチル酸系） ──
  'アスピリン': 'サリチル酸系NSAIDs。解熱・鎮痛・抗炎症。胃腸障害が出やすい。15歳未満は使用不可(ライ症候群)。出産予定日12週以内は回避。',
  'アセチルサリチル酸': 'アスピリンの別名。サリチル酸系NSAIDs。解熱・鎮痛・抗炎症。15歳未満は使用不可。',
  'アスピリンアルミニウム': 'アスピリンの胃粘膜への悪影響を軽減した製剤。作用・注意点はアスピリンと同じ。15歳未満は使用不可。',
  'サザピリン': 'サリチル酸系解熱鎮痛成分(非ピリン系)。解熱・鎮痛。15歳未満はいかなる場合も使用不可。',
  'サリチル酸ナトリウム': 'サリチル酸系解熱鎮痛成分。解熱・鎮痛。15歳未満はいかなる場合も使用不可。',
  'エテンザミド': 'サリチル酸系。痛みが神経を伝わるのを抑える働きが強く、他成分と併用(ACE処方)。水痘・インフルエンザの15歳未満は回避。',
  'サリチルアミド': 'サリチル酸系解熱鎮痛成分。解熱・鎮痛。水痘・インフルエンザの15歳未満は回避。',

  // ── 解熱鎮痛成分（その他） ──
  'イソプロピルアンチピリン': '一般用医薬品で唯一のピリン系。解熱・鎮痛は比較的強いが抗炎症は弱い。ピリン疹の既往者は使用不可。',

  // ── 抗ヒスタミン成分 ──
  'カルビノキサミンマレイン酸塩': '第一世代抗ヒスタミン薬。鼻水・くしゃみを抑える。眠気・口渇・排尿困難に注意。運転不可。',
  'クレマスチンフマル酸塩': '第一世代抗ヒスタミン薬。作用が持続しやすい。鼻水・くしゃみ改善。眠気あり・運転不可。',
  'メキタジン': '抗ヒスタミン薬。鼻炎・アレルギー症状を抑える。まれにショック・肝機能障害・血小板減少。眠気に注意。',

  // ── 抗コリン成分 ──
  'ベラドンナ総アルカロイド': '抗コリン成分。鼻汁分泌・くしゃみを抑える。排尿困難・口渇・緑内障の悪化に注意。',
  'ヨウ化イソプロパミド': '抗コリン成分。鼻汁分泌・くしゃみを抑える。排尿困難・口渇に注意。前立腺肥大・緑内障は要注意。',

  // ── アドレナリン作動成分（鼻粘膜充血・気管支拡張） ──
  'メチルエフェドリン塩酸塩': 'アドレナリン作動成分。鼻粘膜の充血を和らげ気管・気管支を拡げる。依存性あり。心臓病・高血圧・糖尿病・甲状腺機能障害は注意。',
  'メチルエフェドリンサッカリン塩': 'メチルエフェドリンの塩違い。気管支拡張・鼻閉改善。依存性あり。心臓病・高血圧・糖尿病は注意。',
  'プソイドエフェドリン塩酸塩': 'アドレナリン作動成分。鼻閉(鼻づまり)への効果が高い。依存性あり。心臓病・高血圧・糖尿病・前立腺肥大は使用不可。',
  'マオウ': '生薬(マオウ科)。エフェドリン類を含み気管支拡張・発汗・利尿。依存性あり。他のアドレナリン作動成分との重複に注意。',

  // ── 鎮咳成分 ──
  'コデインリン酸塩水和物': '中枢性鎮咳薬(麻薬性)。強力な咳止め。依存性あり・12歳未満禁忌・便秘・眠気。',
  'デキストロメトルファン臭化水素酸塩水和物': '非麻薬性の中枢性鎮咳薬。咳中枢を抑制。依存性は低いが眠気に注意。',
  'ノスカピン': '非麻薬性の中枢性鎮咳薬。咳中枢に作用して咳を鎮める。',
  'チペピジンヒベンズ酸塩': '中枢性鎮咳薬。咳を抑えるとともに気道分泌を促し痰も出しやすくする。',
  'クロペラスチン塩酸塩': '非麻薬性の中枢性鎮咳薬。咳中枢を抑制。依存性は低い。',
  'ナンテンジツ': '生薬(ナンテンの果実)。鎮咳作用を期待して配合される。',

  // ── 去痰成分 ──
  'グアヤコールスルホン酸カリウム': '去痰薬。気道分泌を促し痰を出しやすくする。',
  'ブロムヘキシン塩酸塩': '去痰薬。分泌促進・粘性低下・線毛運動促進の3作用で痰を排出しやすくする。',
  'エチルシステイン塩酸塩': '去痰薬。痰のタンパク質を分解して粘性を低下させる。',
  'シャゼンソウ': '生薬(オオバコの花期の全草)。去痰作用。',
  'セネガ': '生薬(セネガの根)。去痰作用。糖尿病の尿糖検査値に影響することがある。',
  'キキョウ': '生薬(キキョウの根)。痰・痰を伴う咳に用いられる去痰成分。',
  'セキサン': '生薬(ヒガンバナの鱗茎)。去痰作用。',
  'オウヒ': '生薬(ヤマザクラ等の樹皮)。去痰作用。',

  // ── 抗炎症成分 ──
  'グリチルリチン酸二カリウム': '抗炎症成分。粘膜の炎症・腫れを和らげる。1日40mg以上は長期連用回避、200mg上限。偽アルドステロン症に注意。',
  'グリチルレチン酸': 'グリチルリチン酸の代謝物型。抗炎症作用。偽アルドステロン症に注意。',
  'カンゾウ': '生薬(甘草)。グリチルリチン酸を含み抗炎症・去痰。多くの漢方処方に配合。重複摂取で偽アルドステロン症に注意。',
  'カミツレ': '生薬(カミツレの頭花)。発汗・抗炎症作用。',
  'アズレンスルホン酸ナトリウム': 'カミツレ由来アズレンの水溶性誘導体。粘膜の炎症を和らげる。',

  // ── 鎮静成分 ──
  'ブロモバレリル尿素': '鎮静補助成分(ブロムワレリル尿素と同一)。鎮痛作用を補助。依存性あり・眠気必発・連用禁忌。',
  'カノコソウ': '生薬(カノコソウの根茎)。神経の興奮・緊張を緩和する鎮静作用。',

  // ── 制酸成分（解熱鎮痛成分の胃腸障害軽減目的） ──
  'ケイ酸アルミニウム': '制酸成分。解熱鎮痛成分による胃腸障害を軽減。透析中の人は使用不可(アルミニウム脳症)。',
  '水酸化アルミニウムゲル': '制酸成分。胃酸を中和。透析中の人は使用不可。腎臓病は要相談。',
  'メタケイ酸アルミン酸マグネシウム': '制酸成分。胃酸中和と胃粘膜保護。透析中の人は使用不可。',
  '酸化マグネシウム': '制酸成分(瀉下作用も持つ)。胃酸を中和。腎臓病がある人は高マグネシウム血症に注意。',

  // ── カフェイン類 ──
  'カフェイン': '中枢神経興奮成分。鎮痛作用の補助、眠気・倦怠感の緩和。過量で不眠・動悸。依存性あり。',
  '無水カフェイン': 'カフェインの無水物。鎮痛補助・眠気覚まし。1回200mg・1日500mgが上限の目安。',
  '安息香酸ナトリウムカフェイン': 'カフェインの溶解性を高めた塩。鎮痛作用の補助・中枢刺激。',

  // ── ビタミン・栄養成分 ──
  'アスコルビン酸': 'ビタミンC。粘膜の健康維持・回復、抗酸化作用。かぜ時の消耗を補う。',
  'アスコルビン酸カルシウム': 'ビタミンCのカルシウム塩。粘膜の健康維持・回復。',
  'リボフラビン': 'ビタミンB2。皮膚・粘膜の健康維持。服用後に尿が黄色くなることがある。',
  'ヘスペリジン': 'ビタミン様物質(フラボノイド)。毛細血管の保護、ビタミンCの働きを助ける。',
  'チアミン硝化物': 'ビタミンB1。糖質代謝と神経機能の維持。疲労回復。',
  'チアミンジスルフィド': 'ビタミンB1誘導体。吸収性を高めたタイプ。疲労回復・神経機能維持。',
  'ビスベンチアミン': 'ビタミンB1誘導体。体内でB1に変換され疲労回復・神経機能を助ける。',
  'ビスイブチアミン': 'ビタミンB1誘導体。疲労回復・エネルギー代謝促進。',
  'ベンフォチアミン': '脂溶性ビタミンB1誘導体。吸収がよく持続的。疲労回復・神経機能維持。',
  'アミノエチルスルホン酸': 'タウリン。肝機能を助け、滋養強壮・疲労回復に用いられる。',
  'ニンジン': '生薬(オタネニンジンの根)。滋養強壮・新陳代謝促進。',
  'チクセツニンジン': '生薬(トチバニンジンの根茎)。強壮・鎮咳去痰作用。',

  // ── 解熱鎮痛薬の生薬成分 ──
  'ジリュウ': '生薬(フトミミズ科)。古くから「熱さまし」として使用。エキス製剤は「感冒時の解熱」が効能。',
  'シャクヤク': '生薬(シャクヤクの根)。鎮痛鎮痙・鎮静作用。内臓の痛みにも用いられる。',
  'ボタンピ': '生薬(ボタンの根皮)。鎮痛鎮痙・鎮静作用。',
  'ボウイ': '生薬(オオツヅラフジの茎・根茎)。鎮痛・利尿。煎薬は筋肉痛・神経痛・関節痛に。',
  'ショウキョウ': '生薬(ショウガの根茎)。発汗を促して解熱を助ける。健胃作用も。',
  'ケイヒ': '生薬(ケイの樹皮)。発汗・解熱を助ける。健胃作用も。',
  'ゴオウ': '生薬(ウシの胆嚢中の結石)。強心作用のほか、末梢血管拡張による解熱作用。',
  'カッコン': '生薬(クズの根)。解熱・鎮痙作用。葛根湯の主薬。',
  'サイコ': '生薬(ミシマサイコの根)。抗炎症・鎮痛・解熱作用。',
  'ボウフウ': '生薬(セリ科ボウフウの根・根茎)。発汗・解熱・鎮痛・鎮痙作用。',
  'ショウマ': '生薬(サラシナショウマ等の根茎)。発汗・解熱・解毒・消炎作用。',
  'センキュウ': '生薬(センキュウの根茎)。血行を改善し血色不良や冷えを緩和、鎮痛作用。',
  'コウブシ': '生薬(ハマスゲの根茎)。鎮静・鎮痛、女性の滞っている月経を促す。',
  'コンドロイチン硫酸ナトリウム': '軟骨成分。関節痛・肩こり痛の改善を促す目的で解熱鎮痛成分と併用。',

  // ── 骨格筋弛緩成分 ──
  'メトカルバモール': '骨格筋の緊張をもたらす脊髄反射を抑制。腰痛・肩こり・筋肉痛・関節痛・神経痛・打撲・捻挫に。眠気・めまいのため運転不可。',

// 漢方処方製剤（かぜ薬・解熱鎮痛薬の範囲）
  '葛根湯': '体力中等度以上。感冒の初期(汗をかいていないもの)、鼻かぜ、鼻炎、頭痛、肩こり、筋肉痛、手や肩の痛み。カンゾウ・マオウ含有。まれに肝機能障害・偽アルドステロン症。',
  '麻黄湯': '体力充実。寒気・発熱・頭痛・咳・ふしぶしの痛みがあり汗が出ないものの感冒、鼻かぜ、気管支炎、鼻づまり。マオウ含有量が多く体の虚弱な人は使用回避。',
  '小柴胡湯': '体力中等度。脇腹からみぞおちが苦しく食欲不振・口の苦味。食欲不振、吐きけ、胃炎、胃痛、胃腸虚弱、疲労感、かぜの後期。インターフェロン製剤使用中は禁忌。まれに間質性肺炎・肝機能障害。',
  '柴胡桂枝湯': '体力中等度〜やや虚弱。腹痛を伴い微熱・寒気・頭痛・吐きけのあるものの胃腸炎、かぜの中期〜後期。まれに間質性肺炎・肝機能障害。',
  '小青竜湯': '体力中等度〜やや虚弱。うすい水様の痰を伴う咳や鼻水。気管支炎、気管支喘息、鼻炎、アレルギー性鼻炎、むくみ、感冒、花粉症。カンゾウ・マオウ含有。',
  '桂枝湯': '体力虚弱で汗が出るもののかぜの初期。カンゾウ含有。',
  '香蘇散': '体力虚弱で神経過敏、気分がすぐれず胃腸の弱いもののかぜの初期、血の道症。カンゾウ含有。',
  '芍薬甘草湯': '体力に関わらず使用可。筋肉の急激な痙攣を伴う痛みのこむらがえり、筋肉の痙攣、腹痛、腰痛。症状があるときのみの服用とし連用は避ける。まれに肝機能障害・間質性肺炎・うっ血性心不全・心室頻拍。',

// ── 既存 INGREDIENT_DICT との表記ゆれメモ ──
// ・'ブロムワレリル尿素' … 手引きの正式表記は「ブロモバレリル尿素」。キーの統一またはエイリアス化を推奨
// ・'コンドロイチン硫酸エステルNa' … 手引き(解熱鎮痛薬)では「コンドロイチン硫酸ナトリウム」表記
// ・'フルスルチアミン' … 手引きでは「フルスルチアミン塩酸塩」としてビタミンB1誘導体に分類
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
