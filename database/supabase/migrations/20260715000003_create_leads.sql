-- Creates the table used by the existing website booking, health, dashboard, and enrichment flows.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  company text,
  phone text,
  title text,
  linkedin_url text,
  revenue text,
  message text,
  icp_score integer,
  data_quality text,
  source text not null default 'website',
  status text not null default 'new',
  last_contact_at timestamptz,
  next_action text,
  enriched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_created_at_idx on public.leads (created_at desc);

alter table public.leads enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'leads' and policyname = 'service_all_leads') then
    create policy "service_all_leads" on public.leads for all using (true) with check (true);
  end if;
end $$;

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at before update on public.leads
  for each row execute procedure public.handle_updated_at();
