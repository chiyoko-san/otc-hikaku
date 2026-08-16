'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type SymptomOption = { name: string; slug: string; count: number };
type Group = { group: string; symptoms: SymptomOption[] };

const SELECT_CLASS =
  'w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-3 ' +
  'text-sm text-brand-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand ' +
  'disabled:bg-gray-50 disabled:text-gray-400';

/**
 * 「部位・種類 → 症状」の2段階プルダウン。
 * 症状を選ぶと該当ページへ遷移する。
 */
export function SymptomPicker({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const [groupName, setGroupName] = useState('');
  const [slug, setSlug] = useState('');

  const current = useMemo(
    () => groups.find((g) => g.group === groupName),
    [groups, groupName]
  );

  const go = (s: string) => {
    setSlug(s);
    if (s) router.push(`/symptoms/${s}/`);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold tracking-wide text-gray-500">
          部位・種類
        </span>
        <select
          value={groupName}
          onChange={(e) => {
            setGroupName(e.target.value);
            setSlug('');
          }}
          aria-label="症状の部位・種類を選ぶ"
          className={SELECT_CLASS}
        >
          <option value="">選択してください</option>
          {groups.map((g) => (
            <option key={g.group} value={g.group}>
              {g.group}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold tracking-wide text-gray-500">
          症状
        </span>
        <select
          value={slug}
          onChange={(e) => go(e.target.value)}
          disabled={!current}
          aria-label="症状を選ぶ"
          className={SELECT_CLASS}
        >
          <option value="">
            {current ? '症状を選ぶと一覧へ移動します' : '先に部位を選択'}
          </option>
          {current?.symptoms.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}({s.count})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
