import Link from 'next/link';

const LINKS = [
  {
    href: '/switch/',
    title: '処方薬から探す',
    desc: 'アレグラ・ロキソニン・ガスターなど、処方薬と同じ成分の市販薬',
  },
  {
    href: '/symptoms/',
    title: '症状から探す',
    desc: '頭痛・胃痛・鼻水など、悩んでいる症状から絞り込む',
  },
  {
    href: '/ingredients/',
    title: '成分から探す',
    desc: '有効成分の名前から、それを含む市販薬を一覧で確認する',
  },
] as const;

/**
 * 「別の切り口から探す」導線カード3枚。
 * トップ(/)と薬品一覧(/medicines/)で同じ意匠にするため共通化。
 */
export function FindByLinks() {
  return (
    <div className="mx-auto grid max-w-3xl gap-3 text-left sm:grid-cols-3">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="rounded-lg border border-gray-200 p-4 transition hover:border-brand"
        >
          <span className="mb-1 block text-sm font-bold text-brand-dark">
            {l.title}
          </span>
          <span className="block text-xs leading-relaxed text-gray-600">
            {l.desc}
          </span>
        </Link>
      ))}
    </div>
  );
}
