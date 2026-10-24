import type { Medicine } from '@/types';
import { normalizeIngredientName } from './slug';
import { getOtcSimilarByNo, type OtcSimilarIngredient } from './otc-similar-77';
import { estimate, findItemByName, type OtcSimilarItem } from './otc-similar-items';
import { getAllMedicines, getEnrichedMedicines } from './medicines';

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
  /** ページ本文を最後に見直した日（サイトマップの lastModified に使う）。無ければ薬価データの日付 */
  updated?: string;
  /**
   * 2026-10 作り直し: 冒頭1画面に「同じ成分の市販薬・ネットで買える区分・上乗せ額・処方薬との違い」の
   * 4点を出す新レイアウト用のデータ。これが入っている薬だけ新レイアウトで表示する（無い薬は従来どおり）。
   * 30ページに広げるときは、各薬にこの answer を書き足していく。
   */
  answer?: SwitchAnswer;
};

export type SwitchAnswer = {
  /** 同じ成分の市販薬の区分（代表的なもの）。1=第1類 2=第2類 2.5=指定第2類 3=第3類 */
  otcRisk: 1 | 2 | 2.5 | 3;
  /** 区分が製品で分かれるときの一言（例: 飲み薬は第1類、湿布は第2類）。あれば区分の定型文の代わりに出す */
  otcRiskNote?: string;
  /** 処方薬と「同じ」点（成分・1回の量・用法）。添付文書と照合済みの文章を入れる */
  same: string;
  /** 処方薬と「違う」点（対象年齢・使える症状の範囲など） */
  differs: string;
  /** 「1か月でいくら増えるか」の計算に使う処方薬（品名の前方一致。/otc-similar/quick/ と同じ流儀）と量。対象外の薬は不要 */
  monthly?: { itemPrefix: string; qty: number; qtyLabel: string };
  /** PMDAデータの成分欄が空で成分検索に引っかからない市販薬を、製品名で足す（例: アレルビ） */
  extraOtcNames?: string[];
  /** 別の成分が足された製品を一覧から外す（正規化済み成分名の部分一致。例: プソイドエフェドリン） */
  excludeOtcKeys?: string[];
  /** 製品名で一覧から外す（部分一致。データ上おかしい製品など） */
  excludeOtcNames?: string[];
  /** true なら有効成分が1つだけの製品に絞る（総合感冒薬など配合剤を除く） */
  singleIngredientOnly?: boolean;
  /** 一覧の分け方。age=大人用/子ども用（既定）、route=飲み薬/貼り薬・塗り薬、none=分けない */
  groupBy?: 'age' | 'route' | 'none';
  /** 「同じ組み合わせの市販薬は無いが、一部の成分が同じものはある」ときの一覧の見出し（例: ステロイドだけ同じ市販薬） */
  partialMatchLabel?: string;
  /** 外した製品についての一言（「鼻づまり用の別の薬です」など） */
  variantNote?: string;
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
      '7日間程度服用しても症状が良くならない場合は、服用を中止して医師・薬剤師に相談してください。市販薬は15歳未満には使えません（ジュニア製品は7歳から14歳）。',
    otcSimilarNo: 51,
    updated: '2026-10-18',
    // 出典: アレグラFX 添付文書（久光製薬／PMDA）、アレグラ錠 添付文書（サノフィ／PMDA）
    answer: {
      otcRisk: 2,
      same:
        '有効成分（フェキソフェナジン塩酸塩）も1回の量も同じです。処方のアレグラ錠60mgは1回1錠を1日2回、市販のアレグラFXやアレルビも1回60mg（1錠）を1日2回です。',
      differs:
        '市販薬が使えるのは15歳以上（ジュニア製品は7歳から14歳）で、効能は花粉症・ハウスダストによる鼻の症状（くしゃみ・鼻水・鼻づまり）だけです。処方薬にある「じんましん・皮膚のかゆみ」には市販薬は使えません。',
      monthly: { itemPrefix: 'アレグラ錠60mg', qty: 60, qtyLabel: '1日2錠×30日分（60錠）' },
      // アレルビ（皇漢堂製薬）は PMDA データの成分欄が空で成分検索に出ないため、名前で足す。
      // pmda_backfill で成分が埋まれば二重には出ない（同じ製品は1回しか数えない）。
      extraOtcNames: ['アレルビ'],
      excludeOtcKeys: ['プソイドエフェドリン'],
      variantNote:
        'アレグラFXプレミアム（鼻づまり用）はフェキソフェナジンにプソイドエフェドリンが加わった別の薬で、処方薬ではディレグラにあたります。上の一覧には入れていません。',
    },
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
    updated: '2026-10-19',
    // 出典: ロキソニンS 添付文書（第一三共ヘルスケア／PMDA）、ロキソニン錠60mg 添付文書（第一三共）
    answer: {
      otcRisk: 1,
      otcRiskNote:
        '飲み薬（ロキソニンSなど）は第1類医薬品で、ネットでも買えますが薬剤師の確認があります。テープ・パップ・ゲルなどの外用剤は第2類医薬品で、ドラッグストアでもネットでも普通に買えます。',
      same:
        '飲み薬は1錠60mgで、処方のロキソニン錠60mgと同じ量です。市販のロキソニンSも1回1錠（60mg）です。テープ・パップ・ゲルも同じロキソプロフェンNa配合の製品があります。',
      differs:
        '市販の飲み薬は15歳以上で、1日2回まで（症状が再び出たときに3回目まで、4時間以上あける）。処方薬のように関節リウマチなどで毎日続けて飲む使い方はできず、5〜6回飲んでも痛みが続くなら受診が必要です。',
      monthly: { itemPrefix: 'ロキソニン錠60mg', qty: 42, qtyLabel: '1日3錠×14日分（42錠）' },
      groupBy: 'route',
    },
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
    updated: '2026-10-19',
    // 出典: ガスター10 添付文書（第一三共ヘルスケア／PMDA）、ガスター錠 添付文書（LTLファーマ）
    answer: {
      otcRisk: 1,
      same:
        '有効成分は同じファモチジンです。市販のガスター10は1錠10mgで、処方のガスター錠10mg・D錠10mgと同じ量です。',
      differs:
        '処方では1回20mgを1日2回が一般的ですが、市販は1回10mg・1日2回まで（8時間以上あける）で、2週間を超えて続けて飲めません。15歳未満と80歳以上は使えず、処方薬にある胃潰瘍・逆流性食道炎などの治療には使えません。',
      extraOtcNames: ['ガスター１０'],
    },
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
    updated: '2026-10-19',
    // 出典: タイレノールA 添付文書（ジョンソン・エンド・ジョンソン／PMDA）、カロナール錠 添付文書（あゆみ製薬）
    // 一覧はアセトアミノフェン単剤だけに絞る（かぜ薬など配合剤は「同じ成分」とは言えないため）
    answer: {
      otcRisk: 2,
      same:
        '有効成分は同じアセトアミノフェンです。市販のタイレノールAは1錠300mgで、処方のカロナール錠300と同じ量です。',
      differs:
        '処方では体重に合わせて1回500mgなどに増やし1日4,000mgまで使えますが、市販のタイレノールAは1回1錠（300mg）・1日3回までです。15歳未満は子ども用の製品（小児用バファリンなど）を使います。処方薬にある関節リウマチなどの適応はありません。',
      singleIngredientOnly: true,
    },
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
    updated: '2026-10-19',
    // 出典: ムコダイン去たん錠Pro500 添付文書（シオノギヘルスケア／PMDA）、ムコダイン錠 添付文書（杏林製薬）
    // 2026-10-22 添付文書で確認: 第2類、成人（15才以上）1回1錠・1日3回（4時間以上あける）、効能「たん」
    answer: {
      otcRisk: 2,
      same:
        '有効成分は同じカルボシステインです。市販のムコダイン去たん錠Pro500は1錠500mgで、処方のムコダイン錠500mgと同じ量・同じ1日3回です。',
      differs:
        '市販薬は15歳以上で、効能は「たん」です（4時間以上あけて1日3回まで。ほかの鎮咳去痰薬・かぜ薬とは併用できません）。処方薬にある副鼻腔炎（蓄膿症）や滲出性中耳炎の治療には使えません。子ども用のシロップは市販にはありません。',
      monthly: { itemPrefix: 'ムコダイン錠500mg', qty: 42, qtyLabel: '1日3錠×14日分（42錠）' },
      singleIngredientOnly: true,
      // id 52「ムコダインS（カルボシステイン）各社」は実在しない製品名（初期の手入力データ）。削除されるまで名前で外す
      excludeOtcNames: ['ムコダインS'],
    },
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
    updated: '2026-10-19',
    // 出典: アレジオン20 添付文書（エスエス製薬／PMDA）、アレジオン錠 添付文書（日本ベーリンガーインゲルハイム）
    answer: {
      otcRisk: 2,
      same:
        '有効成分も量も同じです。市販のアレジオン20は1回1錠（20mg）を1日1回就寝前で、処方のアレジオン錠20と同じです。',
      differs:
        '市販薬は15歳以上で、効能は花粉症などの鼻の症状（くしゃみ・鼻水・鼻づまり）だけです。処方薬にあるじんましん・皮膚のかゆみ・気管支ぜんそくには使えません。目のかゆみには同じ成分の点眼薬（アレジオン眼科用クリアLなど）が別にあります。',
      monthly: { itemPrefix: 'アレジオン錠20', qty: 30, qtyLabel: '1日1錠×30日分（30錠）' },
      // 飲み薬を点眼薬より先に出す（名前の順位付けにだけ効く）
      extraOtcNames: ['アレナスチン'],
    },
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
    updated: '2026-10-19',
    // 出典: クラリチンEX 添付文書（大正製薬／PMDA）、クラリチン錠 添付文書（バイエル薬品）
    answer: {
      otcRisk: 2,
      same:
        '有効成分も量も同じです。市販のクラリチンEXは1回1錠（10mg）を1日1回食後で、処方のクラリチン錠10mgと同じです。',
      differs:
        '市販薬は15歳以上（クラリチンEXジュニアは7歳から14歳）で、効能は花粉症などの鼻の症状だけです。処方薬にあるじんましん・皮膚のかゆみには使えません。',
      monthly: { itemPrefix: 'クラリチン錠10mg', qty: 30, qtyLabel: '1日1錠×30日分（30錠）' },
    },
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
    updated: '2026-10-19',
    // 出典: ストナリニZ 添付文書（佐藤製薬／PMDA）、ジルテック錠 添付文書（ユーシービージャパン）
    answer: {
      otcRisk: 2,
      same:
        '有効成分も量も同じです。市販のストナリニZ・新コンタック鼻炎Zは1回1錠（10mg）を1日1回就寝前で、処方のジルテック錠10と同じです。',
      differs:
        '市販薬は15歳以上で、効能は花粉症などの鼻の症状だけです。処方薬にあるじんましん・皮膚のかゆみには使えません。眠気が出ることがあるので服用後の運転はできません。',
    },
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
    updated: '2026-10-19',
    answer: {
      otcRisk: 2,
      same:
        'レボセチリジンを含む市販薬は販売されていません。',
      differs:
        '近い成分として、ジルテック（セチリジン）の市販版であるストナリニZ・新コンタック鼻炎Zがあります。セチリジンはレボセチリジンのもとになった成分ですが同じ薬ではないため、切り替えるかどうかは医師・薬剤師に相談してください。',
    },
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
    updated: '2026-10-19',
    // 出典: ヒルドイド 添付文書（マルホ）、ピアソンHPクリーム 添付文書（新新薬品工業／PMDA）
    answer: {
      otcRisk: 2,
      same:
        '有効成分は同じヘパリン類似物質で、市販品の多くは処方のヒルドイドと同じ0.3%です。クリーム・ローション・乳液・泡スプレーなど剤形も選べます。',
      differs:
        '市販薬の効能は手指のあれ・ひじひざかかとの角化症・乾燥性皮膚・打ち身やねんざ後の腫れなどで、処方薬にあるケロイドの治療や血行障害による痛みの治療とは範囲が違います。対象年齢は製品ごとに違うのでパッケージで確認してください。',
      monthly: { itemPrefix: 'ヒルドイドソフト軟膏0.3%', qty: 50, qtyLabel: '25g×2本（50g）' },
      // 代表製品を先頭に出すため（名前の順位付けにだけ効く）
      extraOtcNames: ['ピアソンHP', 'ビーソフテン', 'アットノン'],
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: ボルタレンEXテープ・ACゲル 添付文書（同仁医薬化工／PMDA）、ボルタレンテープ・ゲル 添付文書（同仁医薬化工）
    answer: {
      otcRisk: 2,
      same:
        '有効成分は同じジクロフェナクナトリウムです。市販のボルタレンACゲルは1%で、処方のボルタレンゲル1%と同じ濃度です。テープも1日1回貼る製品があります。',
      differs:
        '市販薬は15歳以上で、2週間使っても良くならなければ受診が必要です。テープ1枚あたりの含有量は製品ごとに違うため、処方のテープ30mg・15mgとそのまま同じとは限りません。飲み薬のボルタレンには市販版がありません。',
      monthly: { itemPrefix: 'ボルタレンテープ30mg', qty: 63, qtyLabel: '63枚（1回の処方上限）' },
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: リンデロンVs 添付文書（シオノギヘルスケア／PMDA）、ベトネベートN軟膏AS 添付文書（グラクソ・スミスクライン／PMDA）
    answer: {
      otcRisk: 2.5,
      same:
        'リンデロンVGと同じ「ベタメタゾン吉草酸エステル＋ゲンタマイシン」の市販薬はありません。ステロイド成分だけが同じ市販薬（リンデロンVsなど、0.12%）はあります。',
      differs:
        '化膿を伴う湿疹には、同じステロイドに別の抗生物質（フラジオマイシン）を加えたベトネベートN軟膏ASという市販薬がありますが、ゲンタマイシンとは別の抗生物質です。化膿している部位にステロイドだけの市販薬は使えません。',
      partialMatchLabel: 'ステロイド成分だけが同じ市販薬（抗生物質ゲンタマイシンなし）',
      // id 85「リンデロンVGクリーム 塩野義製薬」は医療用の製品で市販薬ではない（初期の手入力データ）。削除されるまで成分で外す
      excludeOtcKeys: ['ゲンタマイシン'],
      extraOtcNames: ['リンデロンVs軟膏', 'リンデロンVsローション'],
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: パイロンPL顆粒Pro・パイロンPL顆粒 添付文書（シオノギヘルスケア／PMDA）、PL配合顆粒 添付文書（塩野義製薬）
    // 2026-10-22 添付文書で確認: Pro は指定第2類、成人1回1包（1g）・1日4回、4包中 サリチルアミド1080mg・アセトアミノフェン600mg・
    //   無水カフェイン240mg・プロメタジンメチレンジサリチル酸塩54mg（＝医療用PL配合顆粒1gあたりと同じ）
    answer: {
      otcRisk: 2.5,
      same:
        '市販のパイロンPL顆粒Proは、医療用PL配合顆粒と同じ4成分（サリチルアミド・アセトアミノフェン・無水カフェイン・プロメタジン）を1包1gあたり同じ量で配合し、1回1包を1日4回という飲み方も同じです。通常のパイロンPL顆粒・錠も同じ4成分ですが、1回量が医療用より少なめです。',
      differs:
        '市販薬は15歳以上です。眠気の出る成分を含むため服用後の運転はできず、ほかのかぜ薬・解熱鎮痛薬との併用はできません。',
      monthly: { itemPrefix: 'PL配合顆粒', qty: 56, qtyLabel: '1回1g×1日4回×14日分（56g）' },
      extraOtcNames: ['パイロンPL'],
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: トメダインコーワ錠 添付文書（興和／PMDA）、ロペミンカプセル 添付文書（ヤンセンファーマ）
    // 2026-10-22 添付文書で確認: 指定第2類、2錠（2枚）中ロペラミド塩酸塩1.0mg＝1回0.5mg、1日2回、15歳以上
    answer: {
      otcRisk: 2.5,
      same:
        '有効成分は同じロペラミド塩酸塩です。',
      differs:
        '処方のロペミンは1カプセル1mgですが、市販薬は1回0.5mgの製品が中心で量が違います。市販薬は15歳以上で、2〜3日使っても止まらなければ受診が必要です。発熱・血便を伴う下痢、食あたり・水あたりの下痢には使えません。',
      // 代表製品を先頭に出すため（成分では既に引っかかる。名前の順位付けにだけ効く）
      extraOtcNames: ['トメダインコーワ', 'ロペラマックサット'],
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    answer: {
      otcRisk: 2,
      same:
        'ドンペリドンを含む市販薬は販売されていません。',
      differs:
        '市販の吐き気止め・胃腸薬は作用のしくみが違う薬です。吐き気・嘔吐が続く場合は原因を調べることが大切なので、市販薬で済ませず受診してください。',
    },
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
    updated: '2026-10-19',
    // 出典: 各社 葛根湯エキス製剤 添付文書（PMDA）、ツムラ葛根湯エキス顆粒（医療用）添付文書
    answer: {
      otcRisk: 2,
      same:
        '処方も市販も同じ処方（葛根湯）です。市販品には1日分のエキス量が医療用と同じ「満量処方」の製品もあります。',
      differs:
        '市販品は製品によって1日のエキス量（満量処方か、その3分の2かなど）と対象年齢が違います。体力が中程度以上の人向けで、胃腸の弱い人・汗をかきやすい人は向かないことがあります。',
      excludeOtcKeys: ['加川', '辛夷'],
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: モーラステープL20mg（一般用）添付文書（久光製薬／PMDA）、モーラステープ 添付文書（久光製薬）
    answer: {
      otcRisk: 2,
      same:
        '市販のモーラステープL20mgは1枚ケトプロフェン20mgで、処方のモーラステープ20mgと同じ量です。1日1回貼るのも同じです。',
      differs:
        '市販薬は15歳以上で、処方のモーラステープL40mgにあたる市販薬はありません。貼った部分に日光が当たるとかぶれる光線過敏症の注意は処方薬と同じで、はがしたあとも4週間は遮光が必要です。',
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: リンデロンVs 添付文書（シオノギヘルスケア／PMDA）、リンデロン-V 添付文書（塩野義製薬）
    answer: {
      otcRisk: 2.5,
      same:
        '有効成分も濃度も同じです。市販のリンデロンVs（軟膏・クリーム・ローション）はベタメタゾン吉草酸エステル0.12%で、処方のリンデロン-Vと同じです。',
      differs:
        '市販薬の効能は湿疹・皮膚炎・あせも・かぶれ・虫さされなどで、処方薬にある乾癬・薬疹・円形脱毛症などには使えません。顔や陰部など皮膚の薄い部位、広い範囲、長期の使用は避け、5〜6日使っても良くならなければ受診してください。',
      monthly: { itemPrefix: 'リンデロン-V軟膏0.12%', qty: 10, qtyLabel: '5g×2本（10g）' },
      // 抗生物質入り（ベトネベートN軟膏AS）と、医療用なのに市販薬として登録されている id 85 リンデロンVGクリームを外す
      excludeOtcKeys: ['ゲンタマイシン', 'フラジオマイシン'],
      extraOtcNames: ['リンデロンVs軟膏', 'リンデロンVsローション'],
      variantNote:
        'ベトネベートN軟膏ASは同じステロイドに抗生物質フラジオマイシンを加えた薬で、化膿を伴う湿疹向けです。処方薬ではベトネベートN軟膏にあたります。',
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: フルナーゼ点鼻薬＜季節性アレルギー専用＞ 添付文書（Haleonジャパン／PMDA）、フルチカゾン点鼻液 添付文書
    answer: {
      otcRisk: 2.5,
      same:
        '有効成分も1噴霧の量も同じです。市販のフルナーゼ点鼻薬は1噴霧50µgで、処方のフルナーゼ・フルチカゾン点鼻液50µgと同じです。1回各鼻に1噴霧・1日2回も同じです。',
      differs:
        '市販薬は18歳以上で、花粉症（季節性アレルギー性鼻炎）専用です。ハウスダストなどの通年性の鼻炎には使えず、1シーズン3か月を超えて使えません。',
      monthly: { itemPrefix: 'フルチカゾンプロピオン酸エステル点鼻液50μg「日本臓器」112噴霧用', qty: 1, qtyLabel: '1本（112噴霧・約1か月）' },
      extraOtcNames: ['フルナーゼ'],
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: タリオンAR 添付文書（田辺三菱製薬／PMDA）、タリオン錠 添付文書（田辺三菱製薬）
    answer: {
      otcRisk: 2,
      same:
        '有効成分も量も同じです。市販のタリオンARは1回1錠（10mg）を1日2回で、処方のタリオン錠10mgと同じです。',
      differs:
        '市販薬は15歳以上で、効能は花粉症などの鼻の症状だけです。処方薬にあるじんましん・皮膚のかゆみには使えません。眠気が出ることがあるので服用後の運転はできません。',
      monthly: { itemPrefix: 'タリオン錠10mg', qty: 60, qtyLabel: '1日2錠×30日分（60錠）' },
    },
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
    updated: '2026-10-19',
    // 出典: ザジテンAL鼻炎カプセル・点鼻薬・点眼薬 添付文書（グラクソ・スミスクライン／PMDA）、ザジテン 添付文書
    // 注: ザジテンAL（鼻炎カプセル・点鼻・点眼）は medicines.json に未収載。PMDAバックフィルで入れば一覧に自動で出る
    answer: {
      otcRisk: 2,
      same:
        '市販のザジテンAL鼻炎カプセル（1回1mg・1日2回）、ザジテンAL点鼻スプレー、ザジテンAL点眼薬は、処方薬と同じ成分・同じ濃度です。',
      differs:
        '市販の鼻炎カプセルは15歳以上（点鼻薬・点眼薬の対象年齢は製品で確認）で、鼻炎・アレルギー性結膜炎向けです。処方薬の飲み薬にある気管支ぜんそく・じんましんには使えません。眠気が出やすい成分なので服用後の運転はできません。',
      monthly: { itemPrefix: 'ザジテン点鼻液0.05%', qty: 1, qtyLabel: '1本（8mL）' },
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: 酸化マグネシウムE便秘薬 添付文書（健栄製薬／PMDA）、マグミット錠 添付文書（マグミット製薬）
    // 一覧は酸化マグネシウム単剤だけに絞る（鎮痛薬などに制酸成分として少量入っている製品を除く）
    answer: {
      otcRisk: 3,
      same:
        '有効成分は同じ酸化マグネシウムです。市販の便秘薬の多くは1錠330mgで、処方のマグミット錠330mgと同じ量です。',
      differs:
        '処方では1日3回に分けることが多いですが、市販薬は1日1回（就寝前）が基本で、1日の上限は2,000mgです。処方薬にある胃炎の制酸や尿路結石の予防の目的では使えません。腎臓の働きが落ちている人・高齢の人は長く続ける前に相談が必要です。',
      monthly: { itemPrefix: 'マグミット錠330mg', qty: 90, qtyLabel: '1日3錠×30日分（90錠）' },
      singleIngredientOnly: true,
    },
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
    updated: '2026-10-19',
    // 出典: ラミシールAT 添付文書（全薬工業／PMDA）、ラミシールクリーム・外用液 添付文書（サンファーマ）
    // 2026-10-22 添付文書で確認: 指定第2類、1g中テルビナフィン塩酸塩10mg（1%）、1日1回
    answer: {
      otcRisk: 2.5,
      same:
        '有効成分も濃度も同じです。市販のラミシールAT（クリーム・液・スプレー）はテルビナフィン塩酸塩1%で、処方のラミシールクリーム・外用液と同じです。',
      differs:
        '市販薬の効能は水虫（足白癬）・いんきんたむし・ぜにたむしで、処方薬にあるカンジダ症・癜風には使えません。爪の水虫（爪白癬）は塗り薬では治らず、飲み薬の市販版もありません。',
      monthly: { itemPrefix: 'ラミシールクリーム1%', qty: 10, qtyLabel: '1本（10g）' },
      extraOtcNames: ['ラミシールＡＴ液', 'ラミシールプラス液', 'ラミシールＤＸ'],
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: アクチビア軟膏・ヘルペシアクリーム 添付文書（PMDA）、ゾビラックス軟膏 添付文書（グラクソ・スミスクライン）
    answer: {
      otcRisk: 1,
      same:
        '有効成分も濃度も同じです。市販のアクチビア軟膏・ヘルペシアクリームはアシクロビル5%で、処方のゾビラックス軟膏と同じです。',
      differs:
        '市販薬が使えるのは「過去に医師の診断・治療を受けた口唇ヘルペスの再発」だけです。初めての症状、性器ヘルペス、目の周りには使えません。第1類医薬品なので購入時に薬剤師の確認があります。',
      monthly: { itemPrefix: 'ゾビラックス軟膏5%', qty: 5, qtyLabel: '1本（5g）' },
      extraOtcNames: ['アクチビア軟膏'],
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: イソジンうがい薬 添付文書（塩野義製薬／PMDA）、イソジンガーグル液7% 添付文書
    // 一覧はポビドンヨード単剤だけ（うがい薬のほか、きず薬・のどスプレーも同じ成分として出る）
    answer: {
      otcRisk: 3,
      same:
        '市販のイソジンうがい薬は処方のイソジンガーグルと同じポビドンヨード7%で、薄め方も同じ（1回2〜4mLを水約60mLに）です。',
      differs:
        '市販のポビドンヨード製品には、うがい薬のほかに濃度の違うきず薬（10%）やのどスプレーがあります。うがいには7%のうがい薬を選んでください。ヨウ素過敏症の人は使えず、甲状腺の病気がある人は続けて使う前に相談が必要です。',
      monthly: { itemPrefix: 'ポピヨドンガーグル7%', qty: 30, qtyLabel: '1本（30mL）' },
      singleIngredientOnly: true,
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: 日本薬局方 白色ワセリン、プロペト ピュアベール 添付文書（丸石製薬／PMDA）
    answer: {
      otcRisk: 3,
      same:
        '市販の白色ワセリンは処方の白色ワセリンと同じものです。プロペト ピュアベールは処方のプロペトと同じ高い精製度のワセリンです。',
      differs:
        '市販品は製品によって精製度が違います。目の周りや傷口、赤ちゃんに使う場合は、プロペトのような精製度の高い製品を選んでください。',
      monthly: { itemPrefix: 'プロペト', qty: 50, qtyLabel: '50g（1か月分の目安）' }, // 薬価は10gあたり31.6円。qty は g で渡す
      // 代表製品を先頭に出すため（名前の順位付けにだけ効く）
      extraOtcNames: ['プロペト'],
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: ケラチナミンコーワ20%尿素配合クリーム 添付文書（興和／PMDA）、ケラチナミンコーワクリーム20% 添付文書（興和）
    // 「尿素」は鎮静成分（アリルイソプロピルアセチル尿素・ブロムワレリル尿素）にも部分一致するため除外する
    answer: {
      otcRisk: 3,
      same:
        '有効成分も濃度も同じです。市販のケラチナミンコーワ20%尿素配合クリームは尿素20%で、処方のケラチナミンコーワクリームと同じです。10%の製品もあります。',
      differs:
        '市販薬の効能は手指のあれ・ひじひざかかとの角化症・乾燥した肌向けです。処方薬にあるアトピー皮膚の乾燥・魚鱗癬などには使えません。ひび割れやただれた部分に塗るとしみることがあります。',
      monthly: { itemPrefix: 'ケラチナミンコーワクリーム20%', qty: 50, qtyLabel: '25g×2本（50g）' },
      // 尿素を角質軟化目的で少量足した水虫薬（テルビナフィン＋尿素など）も「同じ成分」とは言えないので外す
      excludeOtcKeys: ['アセチル尿素', 'ワレリル尿素', 'バレリル尿素', 'テルビナフィン', 'ミコナゾール', 'ウンデシレン酸', 'ブテナフィン', 'ラノコナゾール'],
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: フェイタス5.0 添付文書（久光製薬／PMDA）、セルタッチテープ70 添付文書（帝國製薬）
    answer: {
      otcRisk: 2,
      same:
        '有効成分は同じフェルビナクです。市販のテープにも5%の製品があり、処方のセルタッチと同じ1日2回貼る使い方です。',
      differs:
        '市販薬は15歳以上で、2週間使っても良くならなければ受診が必要です。テープ1枚あたりの含有量は製品ごとに違います。ぜんそくを起こしたことがある人は使えません。',
      monthly: { itemPrefix: 'セルタッチテープ70', qty: 63, qtyLabel: '63枚（1回の処方上限）' },
      // 代表製品を先頭に出すため（名前の順位付けにだけ効く）
      extraOtcNames: ['フェイタス5.0'],
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: ピコラックス 添付文書（佐藤製薬／PMDA）、ラキソベロン錠・内用液 添付文書（帝人ファーマ）
    answer: {
      otcRisk: 2,
      same:
        '有効成分は同じピコスルファートナトリウムです。市販のピコラックスは1錠2.5mgで、処方のラキソベロン錠2.5mgと同じ量です。1日1回就寝前に飲むのも同じです。',
      differs:
        '処方では滴数で量を調節できる内用液がありますが、市販には液のタイプがありません。市販薬の対象年齢は製品ごとに違うのでパッケージで確認してください。',
      monthly: { itemPrefix: 'ラキソベロン内用液0.75%', qty: 10, qtyLabel: '1本（10mL）' },
      extraOtcNames: ['ピコラックス'],
      groupBy: 'none',
    },
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
    updated: '2026-10-19',
    // 出典: コーラック・コーラック坐薬タイプ 添付文書（大正製薬／PMDA）、テレミンソフト坐薬 添付文書（EAファーマ）
    answer: {
      otcRisk: 2,
      same:
        '有効成分は同じビサコジルです。市販のコーラック坐薬タイプは1個10mgで、処方のテレミンソフト坐薬10mgと同じ量です。',
      differs:
        '市販の錠剤（コーラックなど）は1錠5mgで1回2〜3錠と、処方薬とは量の数え方が違います。腸を直接刺激する薬なので連用は避け、腹痛・吐き気があるときは使わず受診してください。',
      monthly: { itemPrefix: 'ビサコジル坐剤', qty: 10, qtyLabel: '10個' },
      extraOtcNames: ['コーラック坐薬タイプ'],
      singleIngredientOnly: true,
      groupBy: 'none',
    },
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
 *
 * answer がある薬は、
 *   - excludeOtcKeys に当たる製品（別成分が足された製品）・excludeOtcNames の製品を外す
 *   - singleIngredientOnly なら有効成分1つの製品だけに絞る
 *   - extraOtcNames の製品（成分欄が空で引っかからない製品）を名前で足す
 *   - 処方薬名で始まる製品（アレグラFX など）→ 名前で足した製品 → その他 の順に並べる
 */
export function getOtcMatchesForSwitch(entry: SwitchDrug, limit = 12): Medicine[] {
  const a = entry.answer;
  const exclude = a?.excludeOtcKeys ?? [];
  const excludeNames = a?.excludeOtcNames ?? [];
  const extra = a?.extraOtcNames ?? [];
  const brand = entry.rxName.replace(/[(（].*$/, '');

  const hits: Medicine[] = [];
  const seen = new Set<number>();
  for (const med of getEnrichedMedicines()) {
    const rawIngs = (med.ings || []).filter((i) => typeof i === 'string' && i.trim().length > 0);
    const normIngs = rawIngs.map((i) => normalizeIngredientName(i));
    const hit = entry.ingredientKeys.some((key) => normIngs.some((n) => n.includes(key)));
    if (!hit) continue;
    if (exclude.length > 0 && normIngs.some((n) => exclude.some((x) => n.includes(x)))) continue;
    if (excludeNames.length > 0 && excludeNames.some((x) => med.name.includes(x))) continue;
    if (a?.singleIngredientOnly && rawIngs.length !== 1) continue;
    hits.push(med);
    seen.add(med.id);
  }
  if (extra.length > 0) {
    for (const med of getAllMedicines()) {
      if (seen.has(med.id)) continue;
      if (extra.some((name) => med.name.includes(name))) {
        hits.push(med);
        seen.add(med.id);
      }
    }
  }
  if (a) {
    const rank = (m: Medicine) =>
      m.name.startsWith(brand) ? 0 : extra.some((name) => m.name.includes(name)) ? 1 : 2;
    hits.sort((x, y) => rank(x) - rank(y)); // 同順位は元の並び（安定ソート）
  }
  return hits.slice(0, limit);
}

/** answer.excludeOtcKeys で一覧から外した製品（「別の薬です」と注記するために返す） */
export function getOtcVariantsForSwitch(entry: SwitchDrug): Medicine[] {
  const exclude = entry.answer?.excludeOtcKeys ?? [];
  if (exclude.length === 0) return [];
  return getEnrichedMedicines().filter((med) => {
    const normIngs = (med.ings || []).map((i) => normalizeIngredientName(i));
    const hit = entry.ingredientKeys.some((key) => normIngs.some((n) => n.includes(key)));
    return hit && normIngs.some((n) => exclude.some((x) => n.includes(x)));
  });
}

export type SwitchMonthly = {
  item: OtcSimilarItem;
  qty: number;
  qtyLabel: string;
  /** 1割・2割・3割負担それぞれの「これまで／これから／増える額」 */
  e1: ReturnType<typeof estimate>;
  e2: ReturnType<typeof estimate>;
  e3: ReturnType<typeof estimate>;
};

/** 「1か月分でいくら増えるか」。薬価データに品名が無ければ null（ページ側で非表示にする） */
export function getSwitchMonthly(entry: SwitchDrug): SwitchMonthly | null {
  const a = entry.answer;
  if (!a || !a.monthly || entry.otcSimilarNo == null) return null;
  const item = findItemByName(a.monthly.itemPrefix);
  if (!item) return null;
  const { qty, qtyLabel } = a.monthly;
  return {
    item,
    qty,
    qtyLabel,
    e1: estimate(item, qty, 0.1),
    e2: estimate(item, qty, 0.2),
    e3: estimate(item, qty, 0.3),
  };
}

/** 同じ用途のほかの処方薬（同じ表示カテゴリ、または対象77成分で同じグループ） */
export function getSwitchSiblings(entry: SwitchDrug, limit = 8): SwitchDrug[] {
  const group = entry.otcSimilarNo != null ? getOtcSimilarByNo(entry.otcSimilarNo)?.group ?? null : null;
  return SWITCH_DRUGS.filter((d) => {
    if (d.slug === entry.slug) return false;
    if (d.categoryLabel === entry.categoryLabel) return true;
    if (group && d.otcSimilarNo != null) return getOtcSimilarByNo(d.otcSimilarNo)?.group === group;
    return false;
  }).slice(0, limit);
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
