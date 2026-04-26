'use client';

import { useEffect, useRef, useState } from 'react';

type SearchItem = {
  id: string;
  source: 'medicine' | 'ad_product';
  medicine_id?: number;
  ad_product_id?: string;
  name: string;
  maker: string | null;
  category?: string;
};

type SelectedValue = {
  name: string;
  maker?: string | null;
  medicine_id?: number | null;
  ad_product_id?: string | null;
  isFreeText: boolean; // 候補にない自由入力かどうか
};

type Props = {
  value: SelectedValue;
  onChange: (v: SelectedValue) => void;
};

export function MedicineAutocomplete({ value, onChange }: Props) {
  const [query, setQuery] = useState(value.name || '');
  const [items, setItems] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // デバウンス検索
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.trim().length < 1) {
      setItems([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/medicine-search?q=${encodeURIComponent(query.trim())}`
        );
        if (!res.ok) throw new Error('search failed');
        const data = await res.json();
        setItems(data.items || []);
        setHighlight(-1);
      } catch (e) {
        console.error(e);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // 候補から選択
  const pickItem = (it: SearchItem) => {
    onChange({
      name: it.name,
      maker: it.maker,
      medicine_id: it.medicine_id ?? null,
      ad_product_id: it.ad_product_id ?? null,
      isFreeText: false,
    });
    setQuery(it.name);
    setOpen(false);
    setHighlight(-1);
  };

  // 自由入力(候補にない場合)
  const pickFreeText = () => {
    onChange({
      name: query.trim(),
      maker: null,
      medicine_id: null,
      ad_product_id: null,
      isFreeText: true,
    });
    setOpen(false);
    setHighlight(-1);
  };

  // キーボード操作
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    const total = items.length + (query.trim() ? 1 : 0); // +1 = 自由入力
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % Math.max(total, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + total) % Math.max(total, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight >= 0 && highlight < items.length) {
        pickItem(items[highlight]);
      } else if (highlight === items.length || items.length === 0) {
        pickFreeText();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // 選択済み・自由入力済みかつ何も触ってないなら表示
  const isLockedSelection = !!value.name && !open && !loading;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // 入力変更したら未選択状態に戻す
          if (value.name && e.target.value !== value.name) {
            onChange({
              name: e.target.value,
              maker: null,
              medicine_id: null,
              ad_product_id: null,
              isFreeText: true,
            });
          }
        }}
        onFocus={() => {
          if (query.trim().length >= 1) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder="例: ロキソニンS、◯◯サプリ など"
        className="w-full rounded border border-gray-300 px-3 py-2 focus:border-brand focus:outline-none"
        autoComplete="off"
      />

      {/* 選択済み表示 */}
      {value.name && !open && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {value.medicine_id && (
            <span className="rounded bg-brand-light px-2 py-0.5 text-brand-dark">
              💊 登録薬品から選択
            </span>
          )}
          {value.ad_product_id && (
            <span className="rounded bg-orange-100 px-2 py-0.5 text-orange-700">
              📦 広告商品DBから選択
            </span>
          )}
          {value.isFreeText && (
            <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
              ✏️ 新規入力
            </span>
          )}
          {value.maker && (
            <span className="text-gray-500">{value.maker}</span>
          )}
        </div>
      )}

      {/* ドロップダウン候補 */}
      {open && query.trim().length >= 1 && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {loading && (
            <div className="px-4 py-3 text-sm text-gray-500">検索中…</div>
          )}

          {!loading && items.length === 0 && (
            <div className="px-4 py-3 text-sm text-gray-500">
              該当する商品が見つかりませんでした
            </div>
          )}

          {!loading &&
            items.map((it, i) => (
              <button
                key={it.id}
                type="button"
                onClick={() => pickItem(it)}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full items-start gap-2 border-b border-gray-100 px-4 py-2 text-left text-sm last:border-b-0 ${
                  highlight === i ? 'bg-brand-light' : 'hover:bg-gray-50'
                }`}
              >
                <span className="mt-0.5 text-base">
                  {it.source === 'medicine' ? '💊' : '📦'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-900">{it.name}</div>
                  {it.maker && (
                    <div className="truncate text-xs text-gray-500">
                      {it.maker}
                    </div>
                  )}
                </div>
              </button>
            ))}

          {/* 自由入力フォールバック(常に末尾) */}
          {query.trim() && (
            <button
              type="button"
              onClick={pickFreeText}
              onMouseEnter={() => setHighlight(items.length)}
              className={`flex w-full items-start gap-2 border-t-2 border-gray-200 px-4 py-3 text-left text-sm ${
                highlight === items.length ? 'bg-yellow-50' : 'hover:bg-gray-50'
              }`}
            >
              <span className="mt-0.5 text-base">✏️</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-gray-900">
                  「{query.trim()}」として入力する
                </div>
                <div className="text-xs text-gray-500">
                  候補にない場合はこちら
                </div>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
