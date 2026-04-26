-- ====================================
-- damage_reports テーブルに URL 欄を追加
-- ====================================
-- Supabase Studio → SQL Editor で実行してください

ALTER TABLE damage_reports
  ADD COLUMN IF NOT EXISTS purchase_url TEXT,
  ADD COLUMN IF NOT EXISTS ad_url TEXT;

-- 確認用クエリ
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'damage_reports'
-- ORDER BY ordinal_position;
