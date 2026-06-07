'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { scoreChoices } from '@/lib/akinator-score';
import type { AkCategory, AkChoice } from '@/types';

type Phase = 'category' | 'questions' | 'result';

export function Akinator({ categories }: { categories: AkCategory[] }) {
  const [phase, setPhase] = useState<Phase>('category');
  const [pickedCats, setPickedCats] = useState<string[]>([]);
  // questionId -> Set(choiceId)
  const [answers, setAnswers] = useState<Record<string, Set<string>>>({});
  const [qIndex, setQIndex] = useState(0);

  // STAGE1 で選んだカテゴリの質問を順に並べる
  const activeQuestions = useMemo(() => {
    const cats = categories.filter((c) => pickedCats.includes(c.id));
    return cats.flatMap((c) => c.questions);
  }, [categories, pickedCats]);

  const baseWeights = useMemo(
    () =>
      categories
        .filter((c) => pickedCats.includes(c.id))
        .map((c) => c.baseWeights || {}),
    [categories, pickedCats]
  );

  const allChosen: AkChoice[] = useMemo(() => {
    const byId = new Map<string, AkChoice>();
    for (const c of categories) {
      for (const q of c.questions) {
        for (const ch of q.choices) byId.set(ch.id, ch);
      }
    }
    const out: AkChoice[] = [];
    for (const set of Object.values(answers)) {
      for (const id of set) {
        const ch = byId.get(id);
        if (ch) out.push(ch);
      }
    }
    return out;
  }, [answers, categories]);

  const result = useMemo(
    () => scoreChoices(allChosen, baseWeights),
    [allChosen, baseWeights]
  );

  // ---- handlers ----
  const toggleCat = (id: string) =>
    setPickedCats((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id]
    );

  const toggleChoice = (qId: string, choiceId: string, multi: boolean) => {
    setAnswers((prev) => {
      const next = { ...prev };
      const cur = new Set(next[qId] ?? []);
      if (multi) {
        cur.has(choiceId) ? cur.delete(choiceId) : cur.add(choiceId);
      } else {
        cur.clear();
        cur.add(choiceId);
      }
      next[qId] = cur;
      return next;
    });
  };

  const startQuestions = () => {
    if (pickedCats.length === 0) return;
    setPhase('questions');
    setQIndex(0);
  };

  const nextQuestion = () => {
    if (qIndex + 1 < activeQuestions.length) setQIndex(qIndex + 1);
    else setPhase('result');
  };
  const prevQuestion = () => {
    if (qIndex > 0) setQIndex(qIndex - 1);
    else setPhase('category');
  };

  const reset = () => {
    setPhase('category');
    setPickedCats([]);
    setAnswers({});
    setQIndex(0);
  };

  // 空データ時のフォールバック
  if (!categories || categories.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-600">
        現在アキネーターを準備中です。お手数ですが
        <Link href="/symptoms/" className="text-brand underline">症状一覧</Link>
        からお探しください。
      </div>
    );
  }

  // ===== STAGE 1: カテゴリ選択（複数可） =====
  if (phase === 'category') {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-1 text-sm text-gray-500">ステップ 1 / 2</div>
        <h2 className="mb-1 text-xl font-bold">気になる症状の分野を選んでください</h2>
        <p className="mb-5 text-sm text-gray-600">複数選んでもOKです。</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((c) => {
            const on = pickedCats.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleCat(c.id)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-left font-medium transition ${
                  on
                    ? 'border-brand bg-brand-light text-brand-dark'
                    : 'border-gray-200 bg-white text-gray-800 hover:border-brand hover:bg-brand-light'
                }`}
              >
                <span className="text-lg">{c.emoji}</span>
                <span>{c.label}</span>
                {on && <span className="ml-auto text-brand">✓</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-6">
          <button
            onClick={startQuestions}
            disabled={pickedCats.length === 0}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            次へ（{pickedCats.length}分野を選択中）
          </button>
        </div>
      </div>
    );
  }

  // ===== STAGE 2: 深掘り質問（カテゴリ別・複数選択） =====
  if (phase === 'questions') {
    const q = activeQuestions[qIndex];
    if (!q) {
      setPhase('result');
      return null;
    }
    const total = activeQuestions.length;
    const progress = Math.round(((qIndex + 1) / total) * 100);
    const selectedSet = answers[q.id] ?? new Set<string>();

    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 h-1 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="mb-1 text-sm text-gray-500">
          ステップ 2 / 2 ・ 質問 {qIndex + 1} / {total}
        </div>
        <h2 className="mb-1 text-xl font-bold">{q.q}</h2>
        <p className="mb-5 text-sm text-gray-600">
          {q.multi ? '当てはまるものをすべて選んでください。' : '1つ選んでください。'}
        </p>

        <div className="grid gap-3">
          {q.choices.map((ch) => {
            const on = selectedSet.has(ch.id);
            return (
              <button
                key={ch.id}
                onClick={() => toggleChoice(q.id, ch.id, q.multi)}
                className={`rounded-lg border px-4 py-3 text-left font-medium transition ${
                  on
                    ? 'border-brand bg-brand-light text-brand-dark'
                    : 'border-gray-200 bg-white text-gray-800 hover:border-brand hover:bg-brand-light'
                } ${ch.redcard ? 'border-red-300' : ''}`}
              >
                {ch.redcard && <span className="mr-1">⚠️</span>}
                {ch.label}
                {on && <span className="float-right text-brand">✓</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex justify-between">
          <button onClick={prevQuestion} className="text-sm text-gray-500 underline">
            ← 戻る
          </button>
          <button onClick={nextQuestion} className="btn-primary">
            {qIndex + 1 < total ? '次へ' : '結果を見る'}
          </button>
        </div>
      </div>
    );
  }

  // ===== 結果 =====
  return (
    <div className="rounded-lg border border-brand bg-brand-light p-6">
      <h2 className="mb-3 text-xl font-bold">診断結果</h2>

      {result.redcards.length > 0 ? (
        <div className="mb-5 rounded-lg border border-red-300 bg-red-50 p-4">
          <div className="mb-1 font-bold text-red-700">⚠️ 受診をおすすめします</div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-red-800">
            {result.redcards.map((r, i) => (
              <li key={i}>{r.msg}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.topTags.length > 0 ? (
        <>
          <p className="mb-4 text-gray-800">
            あなたの回答から、関連性の高い症状は次のとおりです。
            各タグから市販薬を探せます。
          </p>
          <div className="mb-4">
            <div className="mb-2 text-sm font-bold">関連する症状（関連度順）:</div>
            <div className="flex flex-wrap gap-2">
              {result.topTags.map((tag, i) => (
                <span
                  key={tag}
                  className="rounded bg-white px-3 py-1 text-sm text-brand-dark"
                >
                  {i === 0 && '★ '}
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <div className="mb-2 text-sm font-bold">症状から薬を探す:</div>
            <div className="flex flex-wrap gap-2">
              {result.topTags.map((tag) => (
                <Link
                  key={tag}
                  href={`/search/?q=${encodeURIComponent(tag)}`}
                  className="btn-outline text-sm"
                >
                  「{tag}」で薬を探す
                </Link>
              ))}
            </div>
          </div>
        </>
      ) : result.redcards.length === 0 ? (
        <p className="mb-4 text-gray-800">
          はっきりした傾向が出ませんでした。
          <Link href="/symptoms/" className="text-brand underline">症状一覧</Link>
          から直接お探しください。
        </p>
      ) : null}

      <div className="border-t border-brand/20 pt-4">
        <button onClick={reset} className="text-sm text-brand underline">
          最初からやり直す
        </button>
      </div>

      <aside className="mt-4 rounded bg-yellow-50 p-3 text-xs text-gray-700">
        ⚠️ 本診断は一般的な情報提供であり、診断・治療ではありません。症状が強い・長引く場合は医療機関を受診してください。
      </aside>
    </div>
  );
}
