import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ブラウザ用 anon クライアント
// 環境変数がない場合は、実際に呼ばれた時点でエラーになるプレースホルダーを返す
// (ビルド時には呼ばれないので、ビルド自体は通る)
function createBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // 環境変数未設定時はダミー値を入れてインスタンス化(実行時に失敗)
    return createClient(
      url || 'https://placeholder.supabase.co',
      key || 'placeholder-anon-key',
      { auth: { persistSession: false } }
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export const supabase = createBrowserClient();
