'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 配置先: components/AssistBar.tsx
// app/template.tsx から全ページに差し込む。
//  - NoticeBar: 「上乗せ料金」への案内帯(/otc-similar/ 配下では出さない)。帯全体が1つのリンク
//  - FontSizeButton: 文字サイズ切替(標準→大→特大)。ヘッダー右側に置く(Header.tsx から使う)
//  - FloatingTools: 右下の「上へ」だけ。本文に重なる面積を小さくした
//  - BottomNav: 本文の最後の「ホームへ」「上乗せ料金を調べる」

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

/** 文字サイズ切替ボタン。ヘッダー(濃い背景)用の配色 */
export function FontSizeButton() {
  const [size, setSize] = useState<SizeKey>('std');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const hit = SIZES.find((x) => x.px === saved);
      if (hit) setSize(hit.key);
    } catch {
      /* ignore */
    }
  }, []);

  const next = () => {
    const i = SIZES.findIndex((x) => x.key === size);
    const n = SIZES[(i + 1) % SIZES.length].key;
    setSize(n);
    applySize(n);
  };

  const current = SIZES.find((x) => x.key === size)!;

  return (
    <button
      type="button"
      onClick={next}
      className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full border border-white/50 px-3 text-sm font-bold text-white hover:bg-white/10"
      aria-label={`文字の大きさを変える(今は${current.label})`}
    >
      <span aria-hidden="true">文字</span>
      <span>{current.label}</span>
    </button>
  );
}

export function NoticeBar() {
  const pathname = usePathname() || '';
  if (pathname.startsWith('/otc-similar')) return null;
  return (
    <Link
      href="/otc-similar/"
      className="block bg-alert-light print:hidden"
      aria-label="2027年3月から始まる病院の薬の上乗せ料金について調べる"
    >
      <div className="mx-auto flex min-h-[48px] max-w-5xl items-center justify-between gap-3 px-5 py-2 md:px-6">
        <p className="text-sm font-bold leading-snug text-alert md:text-base">
          <span className="mr-2 inline-block rounded bg-alert px-1.5 py-0.5 text-xs text-white">2027年3月</span>
          病院の薬の一部に「上乗せ料金」が始まります
        </p>
        <span className="shrink-0 text-sm font-bold text-alert md:text-base">
          調べる ›
        </span>
      </div>
    </Link>
  );
}

export function FloatingTools() {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!showTop) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden">
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-300 bg-white/95 text-lg font-bold text-brand shadow-md"
        aria-label="ページの上へ"
      >
        ↑
      </button>
    </div>
  );
}

export function BottomNav() {
  const pathname = usePathname() || '';
  const inOtc = pathname.startsWith('/otc-similar');
  if (pathname === '/') return null;
  return (
    <nav
      className="mx-auto max-w-5xl px-5 pb-16 pt-10 print:hidden md:px-6"
      aria-label="ページ下のご案内"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href="/"
          className="inline-flex min-h-[56px] items-center justify-center rounded-xl border-2 border-brand bg-white px-5 py-3 text-lg font-bold text-brand"
        >
          ホームへ戻る
        </Link>
        {inOtc ? (
          pathname !== '/otc-similar/' && (
            <Link
              href="/otc-similar/"
              className="inline-flex min-h-[56px] items-center justify-center rounded-xl bg-brand px-5 py-3 text-lg font-bold text-white"
            >
              上乗せ料金のトップへ
            </Link>
          )
        ) : (
          <Link
            href="/otc-similar/"
            className="inline-flex min-h-[56px] items-center justify-center rounded-xl bg-alert px-5 py-3 text-lg font-bold text-white"
          >
            上乗せ料金を調べる
          </Link>
        )}
      </div>
    </nav>
  );
}
