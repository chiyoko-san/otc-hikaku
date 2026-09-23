-- Supabase → SQL Editor に貼って Run（1回だけ）
-- 「撮るだけ」の1日の読み取り回数を数えるテーブルと関数。
-- anon キーからはこの関数しか触れず、テーブルの直接読み書きはできない設定。

create table if not exists public.api_daily_usage (
  key   text    not null,
  day   date    not null,
  count integer not null default 0,
  primary key (key, day)
);

alter table public.api_daily_usage enable row level security;
-- ポリシーは作らない（= anon から直接は読めない・書けない）

create or replace function public.bump_daily_counter(p_key text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.api_daily_usage (key, day, count)
  values (p_key, (now() at time zone 'Asia/Tokyo')::date, 1)
  on conflict (key, day) do update
    set count = api_daily_usage.count + 1
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

grant execute on function public.bump_daily_counter(text, integer) to anon, authenticated;

-- 動作確認（true が返ればOK。実行するたびに今日のカウントが1増えます）
-- select public.bump_daily_counter('read-handbook', 300);
