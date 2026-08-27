// lib/ingredientWeights.ts
//
// 類似薬品マッチングのための成分階層定義。
//
// 問題:
//   「無水カフェイン」のような補助成分が1つ一致しただけで
//   咳止めと頭痛薬が「同成分」と判定されていた。
//
// 方針:
//   成分を3階層に分類し、PRIMARY(主成分)の一致がある場合のみ
//   「同成分」ラベルを許可する。

export type IngredientTier = "primary" | "secondary" | "excluded";

/**
 * 成分名の正規化。
 * PMDAデータは全角/半角、中黒、光学異性体接頭辞の表記ゆれが多い。
 */
export function normalizeIngredientName(raw: string): string {
  if (!raw) return "";
  return raw
    .normalize("NFKC")           // 全角英数・記号を半角へ
    .replace(/[\s\u3000]/g, "")  // 空白除去
    .replace(/[・･]/g, "")        // 中黒除去
    .replace(/^(dl-|d-|l-|L-|DL-|D-)/i, "") // 光学異性体接頭辞を除去
    .toLowerCase();
}

/**
 * EXCLUDED: マッチングから完全に除外する成分。
 * ビタミン・アミノ酸・添加物的成分。多数の配合剤に横断的に含まれ、
 * 一致しても薬効の類似性を意味しない。
 */
const EXCLUDED_RAW = [
  // ビタミン類
  "チアミン塩化物塩酸塩", "チアミン硝化物", "ビスベンチアミン",
  "フルスルチアミン塩酸塩", "ベンフォチアミン", "ジベンゾイルチアミン",
  "リボフラビン", "リボフラビンリン酸エステルナトリウム",
  "ピリドキシン塩酸塩", "シアノコバラミン",
  "アスコルビン酸", "アスコルビン酸ナトリウム",
  "トコフェロール酢酸エステル", "コハク酸トコフェロールカルシウム",
  "ニコチン酸アミド", "パントテン酸カルシウム", "パンテノール",
  "ヘスペリジン", "ビオチン", "葉酸", "エルゴカルシフェロール",
  "レチノールパルミチン酸エステル",
  // アミノ酸・滋養成分
  "タウリン", "グリシン", "グルクロノラクトン",
  "アミノエチルスルホン酸", "システイン", "アルギニン塩酸塩",
  "コンドロイチン硫酸エステルナトリウム", "イノシトール",
  // 添加物的・賦形的
  "無水ケイ酸", "軽質無水ケイ酸", "乳糖水和物", "白糖", "l-メントール",
  "カルメロースカルシウム", "ステアリン酸マグネシウム",
];

/**
 * SECONDARY: 薬効はあるが、これ単独では製品を特徴づけない補助成分。
 * 一致してもスコアは加算するが、「同成分」判定の根拠にはしない。
 */
const SECONDARY_RAW = [
  // カフェイン類
  "無水カフェイン", "カフェイン", "カフェイン水和物",
  "安息香酸ナトリウムカフェイン",
  // 鎮静補助
  "アリルイソプロピルアセチル尿素", "ブロモバレリル尿素",
  // 制酸・胃粘膜保護(鎮痛薬・かぜ薬への添加的配合)
  "合成ヒドロタルサイト", "乾燥水酸化アルミニウムゲル",
  "酸化マグネシウム", "炭酸マグネシウム",
  "メタケイ酸アルミン酸マグネシウム", "水酸化アルミニウムゲル",
  "沈降炭酸カルシウム",
  // 去痰補助
  "グアヤコールスルホン酸カリウム", "クレゾールスルホン酸カリウム",
  // 生薬エキス(配合剤に広く含まれる)
  "カンゾウ", "カンゾウエキス", "甘草", "グリチルリチン酸二カリウム",
  "グリチルレチン酸", "ケイヒ", "ショウキョウ", "セネガ", "セネガ乾燥エキス",
  "キキョウ", "シャゼンソウ", "オウヒ", "ニンジン", "ゴオウ", "ローヤルゼリー",
];

const EXCLUDED_SET = new Set(EXCLUDED_RAW.map(normalizeIngredientName));
const SECONDARY_SET = new Set(SECONDARY_RAW.map(normalizeIngredientName));

/**
 * 部分一致で除外すべきパターン。
 * 「ビタミンB1」「ビタミンC」等の表記や、生薬エキスの派生表記に対応。
 */
const EXCLUDED_PATTERNS = [
  /^ビタミン[a-z]/i,
  /^生薬/,
];

const SECONDARY_PATTERNS = [
  /エキス$/,      // 「〇〇乾燥エキス」等の生薬系
  /乾燥エキス/,
  /^カフェイン/,
];

/**
 * 成分名から階層を判定する。
 */
export function getIngredientTier(name: string): IngredientTier {
  const n = normalizeIngredientName(name);
  if (!n) return "excluded";

  if (EXCLUDED_SET.has(n)) return "excluded";
  if (EXCLUDED_PATTERNS.some((p) => p.test(n))) return "excluded";

  if (SECONDARY_SET.has(n)) return "secondary";
  if (SECONDARY_PATTERNS.some((p) => p.test(n))) return "secondary";

  // 上記いずれにも該当しなければ主成分とみなす
  return "primary";
}

/**
 * 成分配列から、階層別の正規化済みSetを返す。
 */
export function partitionIngredients(names: string[]): {
  primary: Set<string>;
  secondary: Set<string>;
} {
  const primary = new Set<string>();
  const secondary = new Set<string>();

  for (const name of names ?? []) {
    const tier = getIngredientTier(name);
    if (tier === "excluded") continue;
    const n = normalizeIngredientName(name);
    if (!n) continue;
    if (tier === "primary") primary.add(n);
    else secondary.add(n);
  }

  return { primary, secondary };
}

export type MatchLabel = "same" | "similar" | "category" | "none";

export interface MatchResult {
  label: MatchLabel;
  score: number;
  sharedPrimary: string[];
}

/**
 * 2剤の類似度を判定する。
 *
 * ラベルの意味:
 *   same     … 同成分。主成分の大部分が共通(Jaccard >= 0.6)
 *   similar  … 類似。主成分が1つ以上共通
 *   category … 同カテゴリのみ。成分の重なりなし、または成分データ欠損
 *   none     … 表示しない
 *
 * 重要: 主成分が1つも共通しない場合、「同成分」ラベルは絶対に付けない。
 */
export function compareMedicines(
  baseIngredients: string[],
  otherIngredients: string[],
  opts: { sameCategory: boolean; sharedSymptom: boolean }
): MatchResult {
  const base = partitionIngredients(baseIngredients);
  const other = partitionIngredients(otherIngredients);

  // 成分データが欠損している場合はカテゴリ判定に落とす
  // (「同成分」と誤表示させないことが目的)
  if (base.primary.size === 0 || other.primary.size === 0) {
    return {
      label: opts.sameCategory ? "category" : "none",
      score: opts.sameCategory ? 0.1 : 0,
      sharedPrimary: [],
    };
  }

  const sharedPrimary = [...base.primary].filter((x) => other.primary.has(x));
  const sharedSecondary = [...base.secondary].filter((x) =>
    other.secondary.has(x)
  );

  // 主成分の共通がゼロなら、補助成分がいくら一致してもカテゴリ扱い
  if (sharedPrimary.length === 0) {
    return {
      label: opts.sameCategory ? "category" : "none",
      score: opts.sameCategory ? 0.1 : 0,
      sharedPrimary: [],
    };
  }

  // 主成分のJaccard係数
  const unionSize =
    new Set([...base.primary, ...other.primary]).size || 1;
  const jaccard = sharedPrimary.length / unionSize;

  // 補助成分の一致は微小な加点にとどめる
  const score = jaccard + sharedSecondary.length * 0.02;

  const label: MatchLabel = jaccard >= 0.6 ? "same" : "similar";

  return { label, score, sharedPrimary };
}

/**
 * 表示用ラベル文字列。
 */
export const MATCH_LABEL_TEXT: Record<MatchLabel, string> = {
  same: "同成分",
  similar: "一部同成分",
  category: "同カテゴリ",
  none: "",
};

/**
 * 類似薬候補の並べ替えと絞り込み。
 * 同成分 → 一部同成分 → 同カテゴリ の順に優先する。
 */
export function rankMatches<T>(
  candidates: Array<T & { match: MatchResult }>,
  limit = 5
): Array<T & { match: MatchResult }> {
  const order: Record<MatchLabel, number> = {
    same: 0,
    similar: 1,
    category: 2,
    none: 3,
  };

  return candidates
    .filter((c) => c.match.label !== "none")
    .sort((a, b) => {
      const d = order[a.match.label] - order[b.match.label];
      if (d !== 0) return d;
      return b.match.score - a.match.score;
    })
    .slice(0, limit);
}
