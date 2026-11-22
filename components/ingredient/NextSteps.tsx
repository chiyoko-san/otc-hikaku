'use client';

// 配置先: components/ingredient/NextSteps.tsx
//
// 成分ページの「次に見る」。行き先は3つまで（lib/ingredient-next.ts が決める）。
// 押す場所は大きく、1枠＝1用件。クリックは GA4 の next_click で数える:
//   slot  … 1=選びたい方 / 2=病院でもらっている方 / 3=もっと知りたい方
//   kind  … single / symptom / switch / fee / akinator / column / partner
//   place … top（結論の直下）/ bottom（ページの最後）
//   page  … 押されたページのパス
// GA4 側で slot・kind・place をカスタムディメンションに登録すると内訳が見られる。

import Link from 'next/link';
import { trackEvent } from '@/lib/analytics';
import type { NextStep } from '@/lib/ingredient-next';

export function NextSteps({
  steps,
  place,
  heading = '次に見る',
}: {
  steps: NextStep[];
  place: 'top' | 'bottom';
  heading?: string;
}) {
  if (steps.length === 0) return null;

  return (
    <section className="mb-8" aria-label={heading}>
      <h2 className="mb-3 border-l-4 border-brand pl-3 text-xl font-bold">
        {heading}
      </h2>
      <ul className="grid gap-3 md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              onClick={() =>
                trackEvent('next_click', {
                  slot: s.slot,
                  kind: s.kind,
                  place,
                  page: typeof location !== 'undefined' ? location.pathname : '',
                })
              }
              className="card flex h-full min-h-[96px] flex-col justify-center gap-1 p-5 hover:border-brand"
            >
              <span className="text-sm text-gray-500">{s.who}</span>
              <span className="text-lg font-bold leading-snug text-brand-dark">
                {s.label} →
              </span>
              {s.note && (
                <span className="text-sm leading-relaxed text-gray-600">
                  {s.note}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
