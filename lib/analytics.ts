/**
 * GA4 カスタムイベント計測ヘルパー
 *
 * 計測イベント設計(KPIツリーに対応):
 * - search_submit        : サイト内検索の実行 (params: q)
 * - search_suggest_click : 検索サジェストのクリック (params: q, name)
 * - switch_page_cta      : 切替ページ→薬品詳細への遷移 (params: rx, medicine)
 *
 * gtag 本体は app/layout.tsx で読み込み済み。
 */
export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean>
) {
  if (typeof window === 'undefined') return;
  const w = window as unknown as {
    gtag?: (...args: unknown[]) => void;
  };
  if (typeof w.gtag === 'function') {
    w.gtag('event', name, params || {});
  }
}
