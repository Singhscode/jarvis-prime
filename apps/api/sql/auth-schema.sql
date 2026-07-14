-- ============================================================
-- JARVIS PRIME — Authentication Schema
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times (uses "if not exists").
-- ============================================================

-- 1. USERS
create table if not exists public.users (
  id                          uuid primary key default gen_random_uuid(),
  email                       text not null unique,
  email_normalized            text not null unique,
  username                    text unique,
  full_name                   text,
  password_hash               text,
  status                      text not null default 'pending_verification',
  role                        text not null default 'client',
  email_verified_at           timestamptz,
  email_verification_attempts int not null default 0,
  failed_login_attempts       int not null default 0,
  last_failed_login_at        timestamptz,
  account_locked_until        timestamptz,
  mfa_enabled                 boolean not null default false,
  organization_id             uuid,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- 2. SESSIONS
create table if not exists public.sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  device_id        text,
  device_name      text,
  device_type      text,
  ip_address       text not null,
  user_agent       text,
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  revoked_reason   text
);

-- 3. REFRESH_TOKENS
create table if not exists public.refresh_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  session_id      uuid references public.sessions(id) on delete cascade,
  token_hash      text not null unique,
  device_id       text,
  token_family_id uuid,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  revoked_at      timestamptz
);

-- 4. EMAIL_VERIFICATION_TOKENS
create table if not exists public.email_verification_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  token_hash      text not null,
  attempts        int not null default 0,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  verified_at     timestamptz,
  verification_ip text
);

-- 5. PASSWORD_RESETS
create table if not exists public.password_resets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  token_hash text not null,
  attempts   int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_ip    text
);

-- 6. AUDIT_LOGS
create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users(id) on delete set null,
  event_type    text not null,
  action        text not null,
  resource_type text,
  resource_id   uuid,
  success       boolean not null default true,
  error_message text,
  ip_address    text,
  user_agent    text,
  details       jsonb default '{}',
  created_at    timestamptz not null default now()
);

-- 7. PASSWORD_HISTORY
create table if not exists public.password_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- 8. OAUTH_ACCOUNTS
create table if not exists public.oauth_accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  provider         text not null,
  provider_user_id text not null,
  email            text,
  name             text,
  picture_url      text,
  raw_data         jsonb default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (provider, provider_user_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_users_email_normalized on public.users(email_normalized);
create index if not exists idx_sessions_user_id on public.sessions(user_id);
create index if not exists idx_sessions_expires_at on public.sessions(expires_at);
create index if not exists idx_refresh_tokens_user_id on public.refresh_tokens(user_id);
create index if not exists idx_refresh_tokens_token_hash on public.refresh_tokens(token_hash);
create index if not exists idx_email_verifications_user_id on public.email_verification_tokens(user_id);
create index if not exists idx_password_resets_user_id on public.password_resets(user_id);
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_password_history_user_id on public.password_history(user_id);
create index if not exists idx_oauth_accounts_user_id on public.oauth_accounts(user_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.refresh_tokens enable row level security;
alter table public.email_verification_tokens enable row level security;
alter table public.password_resets enable row level security;
alter table public.audit_logs enable row level security;
alter table public.password_history enable row level security;
alter table public.oauth_accounts enable row level security;

-- Service-role policies (server-side access only, no public access)
do $$ begin
  if not exists (select 1 from pg_policies where tablename='users' and policyname='service_all_users') then
    create policy "service_all_users" on public.users for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='sessions' and policyname='service_all_sessions') then
    create policy "service_all_sessions" on public.sessions for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='refresh_tokens' and policyname='service_all_refresh_tokens') then
    create policy "service_all_refresh_tokens" on public.refresh_tokens for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='email_verification_tokens' and policyname='service_all_email_verification_tokens') then
    create policy "service_all_email_verification_tokens" on public.email_verification_tokens for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='password_resets' and policyname='service_all_password_resets') then
    create policy "service_all_password_resets" on public.password_resets for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='audit_logs' and policyname='service_all_audit_logs') then
    create policy "service_all_audit_logs" on public.audit_logs for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='password_history' and policyname='service_all_password_history') then
    create policy "service_all_password_history" on public.password_history for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='oauth_accounts' and policyname='service_all_oauth_accounts') then
    create policy "service_all_oauth_accounts" on public.oauth_accounts for all using (true) with check (true);
  end if;
end $$;
