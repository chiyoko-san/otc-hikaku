'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AKINATOR_TREE } from '@/lib/akinator-tree';
import type { AkinatorNode, AkinatorChoice } from '@/types';

export function Akinator() {
  const [path, setPath] = useState<string[]>([]);
  const [current, setCurrent] = useState<AkinatorNode>(AKINATOR_TREE);
  const [result, setResult] = useState<{ kw: string[]; adv: string } | null>(
    null
  );

  const depth = path.length;
  const progress = Math.min(100, 20 * (depth + 1));

  const chose = (c: AkinatorChoice) => {
    const newPath = [...path, c.l];
    setPath(newPath);
    if (c.result) {
      setResult(c.result);
    } else if (c.next) {
      setCurrent(c.next);
    }
  };

  const reset = () => {
    setPath([]);
    setCurrent(AKINATOR_TREE);
    setResult(null);
  };

  if (result) {
    return (
      <div className="rounded-lg border border-brand bg-brand-light p-6">
        <h2 className="mb-3 text-xl font-bold">診断結果</h2>
        <p className="mb-4 text-gray-800">{result.adv}</p>

        <div className="mb-4">
          <div className="mb-2 text-sm font-bold">関連する症状:</div>
          <div className="flex flex-wrap gap-2">
            {result.kw.map((k) => (
              <span
                key={k}
                className="rounded bg-white px-3 py-1 text-sm text-brand-dark"
              >
                {k}
              </span>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <div className="mb-2 text-sm font-bold">症状から薬を探す:</div>
          <div className="flex flex-wrap gap-2">
            {result.kw.map((k) => (
              <Link
                key={k}
                href={`/search/?q=${encodeURIComponent(k)}`}
                className="btn-outline text-sm"
              >
                「{k}」で薬を探す
              </Link>
            ))}
          </div>
        </div>

        <div className="border-t border-brand/20 pt-4">
          <button onClick={reset} className="text-sm text-brand underline">
            最初からやり直す
          </button>
        </div>

        <aside className="mt-4 rounded bg-yellow-50 p-3 text-xs text-gray-700">
          ⚠️ 本診断は一般的な情報提供です。症状が強い・長引く場合は医療機関を受診してください。
        </aside>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      {/* プログレスバー */}
      <div className="mb-4 h-1 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full bg-brand transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mb-1 text-sm text-gray-500">ステップ {depth + 1}</div>

      {/* パンくず */}
      {path.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-gray-600">
          {path.map((p, i) => (
            <span
              key={i}
              className="rounded bg-gray-100 px-2 py-0.5"
            >
              {p}
            </span>
          ))}
        </div>
      )}

      <h2 className="mb-5 text-xl font-bold">{current.q}</h2>

      <div className="grid gap-3">
        {current.choices.map((c, i) => (
          <button
            key={i}
            onClick={() => chose(c)}
            className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-left font-medium text-gray-800 transition hover:border-brand hover:bg-brand-light"
          >
            {c.l}
          </button>
        ))}
      </div>

      {path.length > 0 && (
        <div className="mt-4 text-right">
          <button
            onClick={reset}
            className="text-xs text-gray-500 underline"
          >
            最初からやり直す
          </button>
        </div>
      )}
    </div>
  );
}
