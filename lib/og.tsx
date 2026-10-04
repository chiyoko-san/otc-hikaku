import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// 配置先: lib/og.tsx
// 各ページの opengraph-image.tsx から呼ぶ共通のOG画像（1200×630）。
// 日本語フォントは public/fonts/NotoSansJP-Bold-subset.otf（JIS第1・第2水準相当を同梱、約1.6MB）。
// ファイル規約の opengraph-image は buildMetadata の DEFAULT_OGP より優先される。

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

let fontCache: ArrayBuffer | null = null;
async function loadFont(): Promise<ArrayBuffer> {
  if (fontCache) return fontCache;
  const buf = await readFile(path.join(process.cwd(), 'public', 'fonts', 'NotoSansJP-Bold-subset.otf'));
  fontCache = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return fontCache;
}

function titleSize(t: string): number {
  if (t.length <= 16) return 72;
  if (t.length <= 26) return 60;
  if (t.length <= 40) return 50;
  return 42;
}

export async function ogImage(opts: {
  tag?: string; // 左上の赤いラベル（例: 上乗せ対象）
  kicker?: string; // ラベルの右の小さい文字（例: 2027年3月から）
  title: string;
  subtitle?: string;
  big?: string; // 右側の大きな数字（例: +2.7円）
  bigLabel?: string; // 数字の上の説明（例: 上乗せ額／1錠）
}) {
  const font = await loadFont();
  const { tag, kicker = '2027年3月から', title, subtitle, big, bigLabel } = opts;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#1f4d3a',
          color: '#ffffff',
          padding: '52px 64px',
          fontFamily: 'NotoSansJP',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {tag && (
            <div
              style={{
                display: 'flex',
                background: '#b42318',
                color: '#ffffff',
                fontSize: 28,
                padding: '8px 20px',
                borderRadius: 12,
                marginRight: 20,
              }}
            >
              {tag}
            </div>
          )}
          <div style={{ display: 'flex', fontSize: 28, color: '#cfe8da' }}>{kicker}</div>
        </div>

        <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: big ? 40 : 0 }}>
            <div style={{ display: 'flex', fontSize: titleSize(title), lineHeight: 1.25, fontWeight: 700 }}>{title}</div>
            {subtitle && (
              <div style={{ display: 'flex', fontSize: 30, color: '#cfe8da', marginTop: 20, lineHeight: 1.4 }}>{subtitle}</div>
            )}
          </div>
          {big && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#ffffff',
                color: '#b42318',
                borderRadius: 24,
                padding: '24px 36px',
                minWidth: 320,
              }}
            >
              {bigLabel && <div style={{ display: 'flex', fontSize: 26, color: '#555555' }}>{bigLabel}</div>}
              <div style={{ display: 'flex', fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>{big}</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 28, color: '#cfe8da' }}>
          <div style={{ display: 'flex' }}>クスリノコンパス　kusuri-compass.com</div>
          <div style={{ display: 'flex' }}>広告なし・厚労省公開情報ベース</div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [{ name: 'NotoSansJP', data: font, weight: 700, style: 'normal' }],
    }
  );
}
