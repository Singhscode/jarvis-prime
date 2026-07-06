-- ============================================================
-- JARVIS PRIME ENGINE — Database Schema
-- Run in: Supabase Dashboard -> SQL Editor -> New Query
-- Safe to run multiple times (uses "if not exists").
-- ============================================================

-- 1. CLIENTS — the agencies/companies you deliver campaigns FOR.
create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_email text,
  -- Ideal Customer Profile config (who we hunt on their behalf)
  icp_titles    text[] default '{}',      -- e.g. {Founder, "Head of Sales"}
  icp_industries text[] default '{}',     -- e.g. {Marketing, SaaS}
  icp_locations text[] default '{}',      -- e.g. {India, "United States"}
  icp_keywords  text[] default '{}',      -- intent keywords for scoring
  status        text not null default 'active',  -- active | paused
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 2. PROSPECTS — people we source and reach out to FOR a client.
create table if not exists public.prospects (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references public.clients(id) on delete cascade,
  full_name     text,
  first_name    text,
  title         text,
  company       text,
  email         text,
  linkedin_url  text,
  industry      text,
  location      text,
  source        text default 'apollo',   -- apollo | hunter | manual | mock
  icp_score     int default 0,
  qualified     boolean default false,
  hot           boolean default false,
  score_reasons text[],
  -- pipeline state
  stage         text not null default 'new', -- new | queued | contacted | replied | booked | disqualified | unsubscribed
  step          int not null default 0,      -- which email in the sequence was last sent
  next_action_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, email)
);

-- 3. MESSAGES — every outreach email we send (or would send in dry-run).
create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid references public.prospects(id) on delete cascade,
  client_id     uuid references public.clients(id) on delete cascade,
  channel       text not null default 'email',
  step          int not null default 1,
  subject       text,
  body          text,
  status        text not null default 'pending', -- pending | sent | dry_run | failed
  provider_id   text,                              -- id returned by Resend
  error         text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- 4. EVENTS — opens, clicks, replies, bounces (for reporting).
create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid references public.prospects(id) on delete cascade,
  message_id    uuid references public.messages(id) on delete set null,
  type          text not null,   -- sent | open | click | reply | bounce | unsubscribe
  meta          jsonb,
  created_at    timestamptz not null default now()
);

-- 5. SUPPRESSION — emails we must never contact (unsubscribes, bounces, complaints).
create table if not exists public.suppression (
  email         text primary key,
  reason        text not null default 'unsubscribe',
  created_at    timestamptz not null default now()
);

-- ============================================================
-- NEW TABLES — Multi-channel campaigns, LinkedIn, scheduling,
--              A/B testing, webhooks, and notifications.
-- ============================================================

-- 6. CAMPAIGNS — multi-channel campaign definitions.
create table if not exists public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references public.clients(id) on delete cascade,
  name          text not null,
  status        text not null default 'draft', -- draft | active | paused | completed
  channels      text[] default '{email}',      -- {email, linkedin}
  daily_limit   int default 50,
  ab_test_id    uuid,                          -- optional: linked A/B test
  settings      jsonb default '{}',            -- campaign-level overrides
  stats         jsonb default '{}',            -- cached aggregate stats
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 7. CAMPAIGN_STEPS — sequence steps within a campaign.
create table if not exists public.campaign_steps (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid references public.campaigns(id) on delete cascade,
  step_number   int not null,
  channel       text not null default 'email', -- email | linkedin_visit | linkedin_connect | linkedin_dm
  delay_days    int not null default 0,        -- days to wait after previous step
  template_key  text,                          -- template identifier
  variant       text default 'A',              -- A/B test variant label
  subject       text,                          -- for email steps
  body_template text,                          -- template with {{placeholders}}
  settings      jsonb default '{}',
  created_at    timestamptz not null default now(),
  unique (campaign_id, step_number, variant)
);

-- 8. LINKEDIN_ACTIONS — LinkedIn activity log.
create table if not exists public.linkedin_actions (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid references public.prospects(id) on delete cascade,
  campaign_id   uuid references public.campaigns(id) on delete set null,
  action_type   text not null,   -- profile_visit | connection_request | direct_message
  status        text not null default 'pending', -- pending | sent | dry_run | failed | accepted
  message       text,
  error         text,
  provider_id   text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- 9. SCHEDULED_JOBS — scheduler job registry.
create table if not exists public.scheduled_jobs (
  id            text primary key,              -- human-readable job id (e.g. 'daily-source')
  name          text not null,
  cron          text not null,                 -- cron expression (e.g. '0 9 * * *')
  task          text not null,                 -- task identifier to run
  enabled       boolean not null default true,
  last_run_at   timestamptz,
  last_status   text,                          -- success | failed
  last_error    text,
  run_count     int default 0,
  config        jsonb default '{}',            -- task-specific config
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 10. AB_TESTS — A/B test definitions and results.
create table if not exists public.ab_tests (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references public.clients(id) on delete cascade,
  name          text not null,
  status        text not null default 'running', -- running | paused | completed
  test_type     text not null default 'subject', -- subject | body | full_email | linkedin_note
  variants      jsonb not null,                  -- {A: {subject: "...", body: "..."}, B: {...}}
  results       jsonb default '{}',              -- {A: {sent: 100, opens: 40, replies: 5}, B: {...}}
  winner        text,                            -- null until determined, then 'A' or 'B'
  min_sample    int default 50,                  -- minimum sends per variant before declaring winner
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 11. WEBHOOK_EVENTS — inbound webhook event log.
create table if not exists public.webhook_events (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,    -- resend | calcom | crm | n8n | zapier | custom
  event_type    text not null,    -- email.reply | meeting.created | lead.updated
  payload       jsonb not null,
  status        text not null default 'received', -- received | processed | failed
  error         text,
  processed_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- 12. NOTIFICATIONS — notification delivery log.
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  channel       text not null,    -- telegram | slack | whatsapp | email
  recipient     text,             -- channel id, phone, email
  message       text not null,
  status        text not null default 'pending', -- pending | sent | dry_run | failed
  error         text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- updated_at trigger (reuses function if it already exists)
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at before update on public.clients
  for each row execute procedure public.handle_updated_at();

drop trigger if exists prospects_updated_at on public.prospects;
create trigger prospects_updated_at before update on public.prospects
  for each row execute procedure public.handle_updated_at();

drop trigger if exists campaigns_updated_at on public.campaigns;
create trigger campaigns_updated_at before update on public.campaigns
  for each row execute procedure public.handle_updated_at();

drop trigger if exists scheduled_jobs_updated_at on public.scheduled_jobs;
create trigger scheduled_jobs_updated_at before update on public.scheduled_jobs
  for each row execute procedure public.handle_updated_at();

drop trigger if exists ab_tests_updated_at on public.ab_tests;
create trigger ab_tests_updated_at before update on public.ab_tests
  for each row execute procedure public.handle_updated_at();

-- Helpful indexes
create index if not exists prospects_client_idx  on public.prospects (client_id);
create index if not exists prospects_stage_idx   on public.prospects (stage);
create index if not exists prospects_next_idx    on public.prospects (next_action_at);
create index if not exists messages_prospect_idx on public.messages (prospect_id);
create index if not exists events_prospect_idx   on public.events (prospect_id);
create index if not exists campaigns_client_idx  on public.campaigns (client_id);
create index if not exists campaign_steps_campaign_idx on public.campaign_steps (campaign_id);
create index if not exists linkedin_actions_prospect_idx on public.linkedin_actions (prospect_id);
create index if not exists ab_tests_client_idx   on public.ab_tests (client_id);
create index if not exists webhook_events_source_idx on public.webhook_events (source);

-- Row Level Security: server-only (service role). No public access.
alter table public.clients    enable row level security;
alter table public.prospects  enable row level security;
alter table public.messages   enable row level security;
alter table public.events     enable row level security;
alter table public.suppression enable row level security;
alter table public.campaigns  enable row level security;
alter table public.campaign_steps enable row level security;
alter table public.linkedin_actions enable row level security;
alter table public.scheduled_jobs enable row level security;
alter table public.ab_tests   enable row level security;
alter table public.webhook_events enable row level security;
alter table public.notifications enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='clients' and policyname='service_all_clients') then
    create policy "service_all_clients" on public.clients for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='prospects' and policyname='service_all_prospects') then
    create policy "service_all_prospects" on public.prospects for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='messages' and policyname='service_all_messages') then
    create policy "service_all_messages" on public.messages for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='events' and policyname='service_all_events') then
    create policy "service_all_events" on public.events for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='suppression' and policyname='service_all_suppression') then
    create policy "service_all_suppression" on public.suppression for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='campaigns' and policyname='service_all_campaigns') then
    create policy "service_all_campaigns" on public.campaigns for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='campaign_steps' and policyname='service_all_campaign_steps') then
    create policy "service_all_campaign_steps" on public.campaign_steps for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='linkedin_actions' and policyname='service_all_linkedin_actions') then
    create policy "service_all_linkedin_actions" on public.linkedin_actions for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='scheduled_jobs' and policyname='service_all_scheduled_jobs') then
    create policy "service_all_scheduled_jobs" on public.scheduled_jobs for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='ab_tests' and policyname='service_all_ab_tests') then
    create policy "service_all_ab_tests" on public.ab_tests for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='webhook_events' and policyname='service_all_webhook_events') then
    create policy "service_all_webhook_events" on public.webhook_events for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='notifications' and policyname='service_all_notifications') then
    create policy "service_all_notifications" on public.notifications for all using (true) with check (true);
  end if;
end $$;
