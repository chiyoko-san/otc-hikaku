/**
 * 医薬品ページを検索エンジンにインデックスさせてよいかの単一判定。
 *
 * 重要: この判定は generateMetadata と sitemap.ts の両方から必ずこれを使うこと。
 * 片方だけ直すと「noindex なのにサイトマップに載っている」という
 * Google に最も嫌われる矛盾状態になる。
 *
 * PMDA バックフィルで ings / effect が埋まったページは、
 * コードを一切変更しなくても自動的にインデックス対象へ復帰する。
 */

export type IndexableMedicine = {
  ings?: string[] | null;
  effect?: string | null;
};

/** 効能・効果としてこの文字数未満はプレースホルダ相当とみなす */
export const MIN_EFFECT_LENGTH = 20;

export function isIndexableMedicine(
  med: IndexableMedicine | null | undefined
): boolean {
  if (!med) return false;

  const hasIngredients = Array.isArray(med.ings) && med.ings.length > 0;
  const effect = (med.effect ?? '').trim();
  const hasEffect = effect.length >= MIN_EFFECT_LENGTH;

  return hasIngredients && hasEffect;
}
