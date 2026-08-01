'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '@/lib/analytics';

type SuggestItem = {
  id: string;
  source: 'medicine' | 'ad_product';
  medicine_id?: number;
  name: string;
  maker: string | null;
};

export function HomeSearchBox() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<SuggestItem[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 入力に応じてサジェストを取得(250msデバウンス)
  useEffect(() => {
    const query = q.trim();
    if (query.length < 1) {
      setItems([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        const res = await fetch(
          `/api/medicine-search?q=${encodeURIComponent(query)}`,
          { signal: ctrl.signal }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { items: SuggestItem[] };
        const meds = (data.items || [])
          .filter((i) => i.source === 'medicine')
          .slice(0, 8);
        setItems(meds);
        setOpen(meds.length > 0);
        setActive(-1);
      } catch {
        /* 中断・失敗時は無視 */
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  // 外側クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const submit = () => {
    const query = q.trim();
    if (!query) return;
    trackEvent('search_submit', { q: query });
    setOpen(false);
    router.push(`/search/?q=${encodeURIComponent(query)}`);
  };

  const goSuggest = (item: SuggestItem) => {
    trackEvent('search_suggest_click', { q: q.trim(), name: item.name });
    setOpen(false);
    if (item.medicine_id != null) {
      router.push(`/medicines/redirect-by-id/${item.medicine_id}/`);
    } else {
      router.push(`/search/?q=${encodeURIComponent(item.name)}`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      setActive((v) => Math.min(v + 1, items.length - 1));
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setActive((v) => Math.max(v - 1, -1));
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && items[active]) {
        goSuggest(items[active]);
      } else {
        submit();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="flex gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => items.length > 0 && setOpen(true)}
          placeholder="商品名・成分・症状・メーカーで検索…"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="search-suggest-list"
          className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light"
        />
        <button onClick={submit} className="btn-primary px-6">
          検索
        </button>
      </div>

      {open && items.length > 0 && (
        <ul
          id="search-suggest-list"
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {items.map((item, i) => (
            <li key={item.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  goSuggest(item);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left ${
                  i === active ? 'bg-brand-light' : 'hover:bg-gray-50'
                }`}
              >
                <span className="text-sm font-medium text-gray-900">
                  {item.name}
                </span>
                {item.maker && (
                  <span className="whitespace-nowrap text-xs text-gray-500">
                    {item.maker}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
