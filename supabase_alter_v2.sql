-- ====================================
-- damage_reports テーブルに ad_product_id 追加
-- ====================================
-- Supabase Studio → SQL Editor で実行してください

ALTER TABLE damage_reports
  ADD COLUMN IF NOT EXISTS ad_product_id TEXT;

-- 既に追加済みの URL カラムも念のため(冪等)
ALTER TABLE damage_reports
  ADD COLUMN IF NOT EXISTS purchase_url TEXT,
  ADD COLUMN IF NOT EXISTS ad_url TEXT;

-- 確認
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'damage_reports'
-- ORDER BY ordinal_position;
