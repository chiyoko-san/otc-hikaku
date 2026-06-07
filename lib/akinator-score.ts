import type { AkChoice } from '@/types';

export type ScoreResult = {
  topTags: string[];                 // 閾値以上のタグ（スコア降順）
  scores: Record<string, number>;    // タグ→合計スコア
  redcards: { msg: string }[];       // 緊急受診フラグ
};

const DEFAULT_THRESHOLD = 2; // primary(3) は必ず通る。共起のみ(1)は単独では拾わない
const MAX_TAGS = 6;

/**
 * 選択された全 choice の weights を合算してスコア化する。
 * - redcard 選択肢があれば redcards に積む（結果表示で最優先）
 * - 閾値以上のタグを降順で最大 MAX_TAGS 件返す
 */
export function scoreChoices(
  selected: AkChoice[],
  baseWeights: Record<string, number>[] = [],
  threshold = DEFAULT_THRESHOLD
): ScoreResult {
  const scores: Record<string, number> = {};
  const redcards: { msg: string }[] = [];

  const addWeights = (w: Record<string, number>) => {
    for (const tag in w) {
      scores[tag] = (scores[tag] ?? 0) + w[tag];
    }
  };

  for (const bw of baseWeights) addWeights(bw);

  for (const c of selected) {
    if (c.redcard) {
      redcards.push({ msg: c.redcardMsg || '至急、医療機関を受診してください。' });
      continue; // 赤信号選択肢はスコア加算しない
    }
    addWeights(c.weights);
  }

  const topTags = Object.entries(scores)
    .filter(([, w]) => w >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TAGS)
    .map(([tag]) => tag);

  return { topTags, scores, redcards };
}
