import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0FAE96',   // メイン(ティール・ロゴ色)
          dark: '#0A8473',
          deep: '#0B4A40',      // ヘッダー・最強調(濃緑)
          bright: '#5CE0C9',    // 濃背景上のアクセント
          light: '#DCF3EE',
          ink: '#132A26',       // 本文(緑がかった濃色)
        },
        surface: '#F1F6F4',     // ページ背景(白カードを浮かせる土台)
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
