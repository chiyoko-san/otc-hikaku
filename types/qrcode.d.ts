// 配置先: types/qrcode.d.ts
// npm パッケージ "qrcode" は型定義を同梱していないため、最小限の宣言で TypeScript を通す
declare module 'qrcode' {
  export function toDataURL(
    text: string,
    options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; margin?: number; width?: number }
  ): Promise<string>;
}
