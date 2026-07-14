-- ============================================================
-- JARVIS PRIME — Authentication Schema
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times (uses "if not exists").
-- ============================================================

-- 1. USERS
create table if not exists public.users (
  id                    uuid primary key default gen_random_uuid(),
  email                 text not null unique,
  email_normalized      text not null unique,
  username              text unique,
  full_name             text,
  password_hash         text,
  status                text not null default 'pending_verification',
  role                  text not null default 'client',
  email_verified_at     timestamptz,
  failed_login_attempts int not null default 0,
  last_failed_login_at  timestamptz,
  account_locked_until  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- 2. SESSIONS
create table if not exists public.sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  device_id        text,
  device_name      text,
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
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
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

-- ============================================================
-- INDEXES (only on FK columns used in WHERE clauses)
-- ============================================================

create index if not exists idx_sessions_user_id on public.sessions(user_id);
create index if not exists idx_refresh_tokens_user_id on public.refresh_tokens(user_id);
create index if not exists idx_email_verifications_user_id on public.email_verification_tokens(user_id);
create index if not exists idx_password_resets_user_id on public.password_resets(user_id);
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_password_history_user_id on public.password_history(user_id);

-- ============================================================
-- ROW LEVEL SECURITY (enabled, no policies = fail-secure)
-- Service role bypasses RLS automatically in Supabase.
-- ============================================================

alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.refresh_tokens enable row level security;
alter table public.email_verification_tokens enable row level security;
alter table public.password_resets enable row level security;
alter table public.audit_logs enable row level security;
alter table public.password_history enable row level security;
