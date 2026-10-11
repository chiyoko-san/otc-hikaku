import type { Config } from 'tailwindcss';

// 2026-10 スマホ向け見直し:
//   色数を減らすため、ブランド色を「深緑1色 + 上乗せ料金の赤1色」に統一した。
//   以前はヘッダー(#0B4A40)・ボタン(#1f4d3a)・リンク(#0FAE96 ティール)と緑が3種類あり、
//   ページ内で文字色が散らばる原因になっていた。ページ側の text-[#1f4d3a] などの直書きも
//   ここで同じ値を使うことで、見た目が一致する。ティールはロゴの「コンパス」だけに残す。
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // タッチ端末では hover: を効かせない(カードがタップ後に浮いたままになるのを防ぐ)
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1f4d3a',   // メイン(深緑): リンク・ボタン・見出しアクセント
          dark: '#163a2c',      // ホバー
          deep: '#1f4d3a',      // ヘッダー(メインと同じ色)
          bright: '#5CE0C9',    // ロゴの「コンパス」だけに使うティール
          light: '#e8f3ec',     // 淡い緑の背景(囲み・タグ)
          ink: '#132A26',       // 本文
        },
        alert: {
          DEFAULT: '#b42318',   // 上乗せ料金まわりの赤。CTAと「増える額」にだけ使う
          light: '#fff5f4',
        },
        surface: '#F4F6F5',     // ページ背景(白カードを浮かせる土台)
        risk: {
          // 白抜き文字でWCAG AA(4.5:1)を満たす濃度に設定
          1: '#B91C1C',    // 第1類(赤)
          '2x': '#C2410C', // 指定第2類(オレンジ)
          2: '#B45309',    // 第2類(アンバー)
          3: '#166534',    // 第3類(緑)
          none: '#64748B', // 不明(グレー)
        },
      },
      fontFamily: {
        sans: ['Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Meiryo', 'sans-serif'],
        serif: ['Hiragino Mincho ProN', 'Yu Mincho', 'serif'],
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
