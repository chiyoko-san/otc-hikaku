import Link from 'next/link';

export function Header() {
  const navItems = [
    { href: '/medicines/', label: '薬を探す' },
    { href: '/symptoms/', label: '症状から選ぶ' },
    { href: '/ingredients/', label: '成分辞典' },
    { href: '/columns/', label: 'コラム' },
    { href: '/damage-reports/submit/', label: '被害報告する' },
    { href: '/damage-reports/', label: '被害を見る' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="container-wide flex items-center justify-between gap-4 py-3">
        <Link href="/" className="flex-shrink-0 text-xl font-bold text-brand-ink">
          クスリノ<em className="not-italic text-brand">コンパス</em>
        </Link>
        <nav className="hidden md:flex items-center gap-1 overflow-x-auto">
          {navItems.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="whitespace-nowrap rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-brand-light hover:text-brand"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        {/* モバイル: ハンバーガーの代わりにシンプルな横スクロール */}
        <nav className="md:hidden flex items-center gap-1 overflow-x-auto -mr-4 pr-4">
          {navItems.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="whitespace-nowrap rounded px-2 py-1 text-xs text-gray-700"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
