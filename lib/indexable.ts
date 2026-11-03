/**
 * 医薬品ページを検索エンジンにインデックスさせてよいかの単一判定。
 *
 * 重要: この判定は generateMetadata と sitemap.ts の両方から必ずこれを使うこと。
 * 片方だけ直すと「noindex なのにサイトマップに載っている」という
 * Google に最も嫌われる矛盾状態になる。
 *
 * PMDA バックフィルで ings / effect が埋まったページは、
 * コードを一切変更しなくても自動的にインデックス対象へ復帰する。
 *
 * 2026-09 改訂:
 *   効能・効果は PMDA の正規表記でも「せき，たん」のように短いものが多く、
 *   旧しきい値(20文字)では成分表が埋まったページまで noindex のまま残っていた。
 *   ページの実質コンテンツは成分表(と、そこから生成される類似薬比較)なので、
 *   判定の主軸は「成分があるか」に置き、効能はプレースホルダ除外だけにする。
 *
 * 2026-11 改訂（隔離）:
 *   id 1,000,000 以上・source "pmda" の取り込み分（2026-08-15、約3,200品）は、
 *   成分が別の製品のものとずれている例が多数見つかった
 *   （例: ルグナン錠EXα に湿布の成分、葛根湯液SX にうがい薬の成分）。
 *   YMYL として誤った成分を検索に出さないため、成分を取り直すまで noindex にする。
 *   取り直しが済んだ製品は source を "pmda" 以外（例: "pmda_refetch"）にすれば自動で復帰する。
 */

export type IndexableMedicine = {
  id?: number | null;
  source?: string | null;
  ings?: string[] | null;
  effect?: string | null;
};

/** 効能・効果がこの文字数未満ならプレースホルダ相当とみなす */
export const MIN_EFFECT_LENGTH = 2;

/** 成分のずれが見つかった取り込み分（id がこれ以上 かつ source が "pmda"） */
export const QUARANTINE_MIN_ID = 1_000_000;

/** 効能・効果に入りうる「未取得」を意味する表記。長さに関係なく不可 */
const EFFECT_PLACEHOLDERS = new Set([
  '不明',
  '未定',
  '未登録',
  '準備中',
  '情報準備中',
  'なし',
  '—',
  '－',
  '―',
  '-',
]);

/** 成分データが信頼できない（取り直し待ちの）製品か */
export function isQuarantinedMedicine(
  med: IndexableMedicine | null | undefined
): boolean {
  if (!med) return false;
  return (
    typeof med.id === 'number' &&
    med.id >= QUARANTINE_MIN_ID &&
    med.source === 'pmda'
  );
}

export function isIndexableMedicine(
  med: IndexableMedicine | null | undefined
): boolean {
  if (!med) return false;
  if (isQuarantinedMedicine(med)) return false;

  const hasIngredients =
    Array.isArray(med.ings) &&
    med.ings.some((s) => typeof s === 'string' && s.trim().length > 0);

  const effect = (med.effect ?? '').trim();
  const hasEffect =
    effect.length >= MIN_EFFECT_LENGTH && !EFFECT_PLACEHOLDERS.has(effect);

  return hasIngredients && hasEffect;
}
