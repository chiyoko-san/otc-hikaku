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
          DEFAULT: '#0FAE96',   // メイン(ティール)
          dark: '#0A8473',
          light: '#E6F7F4',
          ink: '#1A2433',       // ネイビー
        },
        risk: {
          1: '#DC2626',  // 第1類(赤)
          2: '#EA580C',  // 第2類(オレンジ)
          3: '#16A34A',  // 第3類(緑)
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
