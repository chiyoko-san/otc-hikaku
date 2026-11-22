// 配置先: components/icons/Icon.tsx
//
// アイコン1個。絵の本体は components/icons/IconSprite.tsx が全ページに1回だけ埋め込んでいて、
// ここではそれを参照するだけ（1個あたり100バイトほど）。色は文字色（currentColor）に従う。
// 飾りなので読み上げ対象から外す（必ず横に文字の名前を置くこと）。

export function Icon({
  name,
  size = 24,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ? `flex-none ${className}` : 'flex-none'}
    >
      <use href={`#i-${name}`} />
    </svg>
  );
}
