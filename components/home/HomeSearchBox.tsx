'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function HomeSearchBox() {
  const [q, setQ] = useState('');
  const router = useRouter();

  const submit = () => {
    if (!q.trim()) return;
    router.push(`/search/?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="商品名・成分・症状・メーカーで検索…"
        className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light"
      />
      <button onClick={submit} className="btn-primary px-6">
        検索
      </button>
    </div>
  );
}
