import type { ReactNode } from 'react';

type PageHeroProps = {
  title: string;
  children?: ReactNode;
};

/**
 * ページ上部の見出しブロック(H1 + リード文)。
 * トップ(/)と薬品一覧(/medicines/)で必ず同じ余白・字送りになるよう共通化。
 * 意匠を変えるときはこのファイルだけを直す。
 */
export function PageHero({ title, children }: PageHeroProps) {
  return (
    <header className="mb-8">
      <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-brand-ink md:text-4xl">
        {title}
      </h1>
      {children ? <p className="text-gray-600">{children}</p> : null}
    </header>
  );
}
