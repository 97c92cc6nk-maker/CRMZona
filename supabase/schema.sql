create table if not exists public.app_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_kv enable row level security;

comment on table public.app_kv is
  'Key-value storage for Smart Work Schedule server data. Access is performed only from server code with the Supabase service role key.';
