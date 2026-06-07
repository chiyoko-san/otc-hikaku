import { createServerClient } from './supabase/server';
import type { AkCategory, AkQuestion, AkChoice } from '@/types';

/**
 * Supabase から症状アキネーターの全カテゴリ/質問/選択肢を取得し、
 * フロントが扱いやすいネスト構造に組み立てて返す。
 * 失敗時は空配列（呼び出し側でフォールバック表示）。
 */
export async function getAkinatorData(): Promise<AkCategory[]> {
  const sb = createServerClient();
  if (!sb) return [];

  const [catsRes, qsRes, chsRes] = await Promise.all([
    sb.from('ak_categories').select('*').eq('active', true).order('sort'),
    sb.from('ak_questions').select('*').eq('active', true).order('sort'),
    sb.from('ak_choices').select('*').eq('active', true).order('sort'),
  ]);

  if (catsRes.error || qsRes.error || chsRes.error) {
    console.error('[getAkinatorData]', catsRes.error || qsRes.error || chsRes.error);
    return [];
  }

  const choicesByQ = new Map<string, AkChoice[]>();
  for (const c of chsRes.data || []) {
    const arr = choicesByQ.get(c.question_id) || [];
    arr.push({
      id: c.id,
      label: c.label,
      weights: (c.weights || {}) as Record<string, number>,
      redcard: !!c.redcard,
      redcardMsg: c.redcard_msg || '',
    });
    choicesByQ.set(c.question_id, arr);
  }

  const qsByCat = new Map<string, AkQuestion[]>();
  for (const q of qsRes.data || []) {
    const arr = qsByCat.get(q.category_id) || [];
    arr.push({
      id: q.id,
      q: q.q,
      multi: !!q.multi,
      choices: choicesByQ.get(q.id) || [],
    });
    qsByCat.set(q.category_id, arr);
  }

  return (catsRes.data || []).map((cat): AkCategory => ({
    id: cat.id,
    label: cat.label,
    emoji: cat.emoji || '',
    baseWeights: (cat.base_weights || {}) as Record<string, number>,
    questions: qsByCat.get(cat.id) || [],
  }));
}
