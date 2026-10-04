'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 配置先: components/AssistBar.tsx
// app/template.tsx から全ページに差し込む。layout.tsx やヘッダーを触らずに追加できる。
//  - 上部: 「上乗せ料金」への案内帯（/otc-similar/ 配下では出さない）
//  - 右下に固定: 文字サイズ切替（標準→大→特大）と「上へ」
//  - 本文の最後: 「ホームへ」「上乗せ料金を調べる」の大きなボタン

const SIZES = [
  { key: 'std', label: '標準', px: '' },
  { key: 'lg', label: '大', px: '118%' },
  { key: 'xl', label: '特大', px: '136%' },
] as const;
type SizeKey = (typeof SIZES)[number]['key'];
const STORAGE_KEY = 'kc-font';

function applySize(key: SizeKey) {
  const s = SIZES.find((x) => x.key === key)!;
  document.documentElement.style.fontSize = s.px;
  try {
    if (s.px) localStorage.setItem(STORAGE_KEY, s.px);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function NoticeBar() {
  const pathname = usePathname() || '';
  if (pathname.startsWith('/otc-similar')) return null;
  return (
    <div className="bg-[#fff5f4] print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <p className="text-base font-bold text-[#b42318] md:text-lg">
          2027年3月から、病院の薬の一部に「上乗せ料金」が始まります
        </p>
        <Link
          href="/otc-similar/"
          className="inline-block min-h-[44px] rounded-lg bg-[#b42318] px-4 py-2 text-base font-bold text-white md:text-lg"
        >
          自分の薬は対象？調べる
        </Link>
      </div>
    </div>
  );
}

export function FloatingTools() {
  const [size, setSize] = useState<SizeKey>('std');
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const hit = SIZES.find((x) => x.px === saved);
      if (hit) setSize(hit.key);
    } catch {
      /* ignore */
    }
    const onScroll = () => setShowTop(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const next = () => {
    const i = SIZES.findIndex((x) => x.key === size);
    const n = SIZES[(i + 1) % SIZES.length].key;
    setSize(n);
    applySize(n);
  };

  const current = SIZES.find((x) => x.key === size)!;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 print:hidden">
      {showTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="min-h-[52px] min-w-[52px] rounded-full border-2 border-[#1f4d3a] bg-white px-3 text-lg font-bold text-[#1f4d3a] shadow-md"
          aria-label="ページの上へ"
        >
          ▲ 上へ
        </button>
      )}
      <button
        type="button"
        onClick={next}
        className="min-h-[52px] rounded-full bg-[#1f4d3a] px-4 text-lg font-bold text-white shadow-md"
        aria-label={`文字の大きさを変える（今は${current.label}）`}
      >
        文字 {current.label}
      </button>
    </div>
  );
}

export function BottomNav() {
  const pathname = usePathname() || '';
  const inOtc = pathname.startsWith('/otc-similar');
  if (pathname === '/') return null;
  return (
    <nav className="mx-auto max-w-5xl px-4 pb-24 pt-6 print:hidden" aria-label="ページ下のご案内">
      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-block min-h-[56px] rounded-xl border-2 border-[#1f4d3a] bg-white px-5 py-3 text-xl font-bold text-[#1f4d3a]"
        >
          ホームへ戻る
        </Link>
        {inOtc ? (
          pathname !== '/otc-similar/' && (
            <Link
              href="/otc-similar/"
              className="inline-block min-h-[56px] rounded-xl bg-[#1f4d3a] px-5 py-3 text-xl font-bold text-white"
            >
              上乗せ料金のトップへ
            </Link>
          )
        ) : (
          <Link
            href="/otc-similar/"
            className="inline-block min-h-[56px] rounded-xl bg-[#b42318] px-5 py-3 text-xl font-bold text-white"
          >
            上乗せ料金を調べる
          </Link>
        )}
      </div>
    </nav>
  );
}
