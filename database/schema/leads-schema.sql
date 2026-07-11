-- ============================================================
-- JARVIS PRIME — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. LEADS TABLE
create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  company      text not null,
  email        text not null,
  phone        text,
  revenue      text,
  message      text,
  source       text not null default 'website_form',
  status       text not null default 'new',
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Auto-update updated_at on every row change
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_updated_at
  before update on public.leads
  for each row execute procedure public.handle_updated_at();

-- Index for fast queries
create index if not exists leads_status_idx     on public.leads (status);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_email_idx      on public.leads (email);

-- 2. ROW LEVEL SECURITY
alter table public.leads enable row level security;

-- Service role (server-side API) can do everything
create policy "service_role_all" on public.leads
  for all
  using (true)
  with check (true);

-- Public anon key can only INSERT (form submissions)
create policy "anon_insert_only" on public.leads
  for insert
  to anon
  with check (true);

-- 3. OPTIONAL: OUTREACH_LOG TABLE (track emails sent per lead)
create table if not exists public.outreach_log (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references public.leads(id) on delete cascade,
  channel     text not null,  -- 'email' | 'linkedin' | 'whatsapp'
  step        int not null default 1,
  subject     text,
  body        text,
  sent_at     timestamptz not null default now(),
  replied     boolean default false,
  reply_type  text  -- 'positive' | 'negative' | 'ooo' | 'question'
);

create index if not exists outreach_lead_idx on public.outreach_log (lead_id);

alter table public.outreach_log enable row level security;
create policy "service_role_all_outreach" on public.outreach_log
  for all using (true) with check (true);

-- ============================================================
-- VERIFY: Run this to confirm tables exist
-- ============================================================
-- select * from public.leads order by created_at desc limit 10;
