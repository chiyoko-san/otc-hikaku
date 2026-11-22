// 配置先: components/icons/IconSprite.tsx
//
// 全アイコンの絵をまとめて1回だけ埋め込む（app/layout.tsx の <body> 先頭）。
// 画面には出ない。各ページの <Icon name="..."> がここを参照する。

import { ICON_PATHS } from '@/lib/icon-paths';

export function IconSprite() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        {Object.entries(ICON_PATHS).map(([key, body]) => (
          <symbol
            key={key}
            id={`i-${key}`}
            viewBox="0 0 48 48"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        ))}
      </defs>
    </svg>
  );
}
