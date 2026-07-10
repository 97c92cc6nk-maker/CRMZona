create table if not exists public.app_kv (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.app_kv is
  'CRMZona application key-value storage. Server code reads and writes through the Supabase service role key.';

alter table public.app_kv enable row level security;

drop policy if exists "service role app_kv access" on public.app_kv;
create policy "service role app_kv access"
  on public.app_kv
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

insert into public.app_kv (key, value)
values
  ('users.json', '[]'::jsonb),
  ('sessions.json', '{}'::jsonb),
  ('schedules.json', '{}'::jsonb),
  ('repairs.json', '[]'::jsonb),
  ('audit.json', '[]'::jsonb)
on conflict (key) do nothing;
