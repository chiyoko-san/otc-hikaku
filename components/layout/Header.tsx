'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/switch/', label: '処方薬から探す' },
  { href: '/medicines/', label: '薬を探す' },
  { href: '/symptoms/', label: '症状から選ぶ' },
  { href: '/ingredients/', label: '成分辞典' },
  { href: '/columns/', label: 'コラム' },
  { href: '/damage-reports/submit/', label: '被害報告する' },
  { href: '/damage-reports/', label: '被害を見る' },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // ページ遷移時にメニューを自動で閉じる
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // メニュー開いている間は body のスクロールを止める
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-40 bg-brand-deep shadow-md">
        <div className="container-wide flex items-center justify-between gap-4 py-3">
          <Link
            href="/"
            className="flex-shrink-0 text-xl font-bold tracking-tight text-white"
          >
            クスリノ<em className="not-italic text-brand-bright">コンパス</em>
          </Link>

          {/* PC: 横並びナビ */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          {/* スマホ: ハンバーガーボタン */}
          <button
            type="button"
            className="md:hidden -mr-2 inline-flex h-10 w-10 items-center justify-center rounded text-white hover:bg-white/10"
            aria-label={open ? 'メニューを閉じる' : 'メニューを開く'}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              // ✕ アイコン
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            ) : (
              // ハンバーガーアイコン
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* スマホ: フルスクリーンドロワー */}
      {open && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
        >
          {/* 背景オーバーレイ */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />

          {/* メニュー本体(右からスライドイン風) */}
          <nav
            id="mobile-nav"
            className="absolute right-0 top-0 h-full w-72 max-w-[85%] overflow-y-auto bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-gray-200 p-4">
              <span className="text-base font-bold text-brand-ink">
                メニュー
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="メニューを閉じる"
                className="-mr-2 inline-flex h-9 w-9 items-center justify-center rounded text-gray-700 hover:bg-gray-100"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <ul className="p-2">
              {NAV_ITEMS.map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    className="flex items-center justify-between rounded px-4 py-3 text-base text-gray-800 hover:bg-brand-light hover:text-brand"
                    onClick={() => setOpen(false)}
                  >
                    <span>{n.label}</span>
                    <span className="text-gray-400">›</span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="border-t border-gray-200 p-4">
              <Link
                href="/akinator/"
                className="btn-primary w-full justify-center"
                onClick={() => setOpen(false)}
              >
                💊 症状アキネーターを試す
              </Link>
            </div>

            <div className="border-t border-gray-200 px-4 py-3 text-xs text-gray-500">
              <Link
                href="/about/"
                className="block py-1 hover:text-brand"
                onClick={() => setOpen(false)}
              >
                サイトについて
              </Link>
              <Link
                href="/privacy/"
                className="block py-1 hover:text-brand"
                onClick={() => setOpen(false)}
              >
                プライバシーポリシー
              </Link>
              <Link
                href="/contact/"
                className="block py-1 hover:text-brand"
                onClick={() => setOpen(false)}
              >
                お問い合わせ
              </Link>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
