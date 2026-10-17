// 配置先: lib/sitemap-ids.ts
// サイトマップの分割番号。app/sitemap.ts（中身）と app/sitemap.xml/route.ts（目次）が共有する。
//   0 = 固定ページ・切替・分類・成分・症状・50音一覧
//   1 = 上乗せ料金（成分77・用途12・処方薬688）
//   2 = 薬ページ（中身がそろっている約7,300品）
//   3 = コラム
export const SITEMAP_IDS = [0, 1, 2, 3] as const;
