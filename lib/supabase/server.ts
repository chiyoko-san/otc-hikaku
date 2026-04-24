import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 環境変数が設定されているかを判定
export function hasSupabaseEnv(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

// サーバーコンポーネントで使用。RLS をバイパスして高速取得
// 環境変数がない場合は null を返す → 呼び出し側でフォールバック処理
export function createServerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (typeof window === 'undefined') {
      console.warn(
        '[supabase/server] NEXT_PUBLIC_SUPABASE_URL または KEY が設定されていません。Supabaseを利用する機能はスキップされます。'
      );
    }
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
