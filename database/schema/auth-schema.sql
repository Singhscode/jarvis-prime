-- ============================================================
-- JARVIS PRIME — Authentication & Identity Schema
-- Run in: Supabase Dashboard -> SQL Editor -> New Query
-- Safe to run multiple times (uses "if not exists").
-- ============================================================

-- 1. USERS — Core user accounts
create table if not exists public.users (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique,
  email_normalized  text not null unique, -- lowercase, trimmed (for lookups)
  username          text unique,          -- optional
  full_name         text,
  password_hash     text,                 -- argon2id hash (NULL if OAuth-only)
  
  -- Account status & verification
  status            text not null default 'pending_verification', -- pending_verification | active | suspended | deleted
  email_verified_at timestamptz,
  email_verification_attempts int default 0,
  
  -- Security: failed login tracking
  failed_login_attempts int default 0,
  last_failed_login_at  timestamptz,
  account_locked_until  timestamptz,      -- NULL = not locked
  
  -- Multi-Factor Authentication
  mfa_enabled       boolean default false,
  mfa_method        text,                 -- 'totp' | 'sms' (future)
  
  -- OAuth & account linking
  requires_oauth    boolean default false, -- True if created via OAuth
  
  -- Organization & RBAC preparation
  organization_id   uuid,                 -- Links to organization/tenant
  role              text default 'member', -- member | admin | owner (RBAC foundation)
  
  -- Audit
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,         -- Soft delete
  
  -- Constraints
  constraint email_valid check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- 2. EMAIL_VERIFICATION_TOKENS — One-time verification links
create table if not exists public.email_verification_tokens (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  token_hash        text not null unique, -- Hash of the token sent to user (never store plaintext)
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  verified_at       timestamptz,         -- NULL until used, then populated
  attempts          int default 0,        -- Prevent brute-force on token
  max_attempts      int default 5,
  
  -- Audit
  verification_ip   text,                 -- IP that verified
  
  constraint token_not_expired check (expires_at > created_at)
);

-- 3. PASSWORD_RESETS — Secure password reset flow
create table if not exists public.password_resets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  token_hash        text not null unique, -- Hash of the reset token
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  used_at           timestamptz,         -- NULL until used
  used_ip           text,                 -- IP that completed reset
  attempts          int default 0,
  max_attempts      int default 3,
  
  constraint reset_not_expired check (expires_at > created_at)
);

-- 4. MFA_SECRETS — TOTP authenticator secrets (encrypted in storage)
create table if not exists public.mfa_secrets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  secret_encrypted  text not null,       -- Encrypted TOTP secret
  
  -- Recovery codes (comma-separated, hashed)
  recovery_codes_hash text not null,     -- Hash of recovery codes
  recovery_codes_count int default 10,
  
  -- Tracking
  enabled_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  
  -- Audit
  backup_codes_generated_count int default 0
);

-- 5. MFA_RECOVERY_CODES — Individual recovery codes for 2FA backup
create table if not exists public.mfa_recovery_codes (
  id                uuid primary key default gen_random_uuid(),
  mfa_secret_id     uuid not null references public.mfa_secrets(id) on delete cascade,
  code_hash         text not null unique, -- Hash of recovery code
  used_at           timestamptz,         -- NULL until used
  created_at        timestamptz not null default now()
);

-- 6. OAUTH_ACCOUNTS — OAuth provider linkages
create table if not exists public.oauth_accounts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  provider          text not null,       -- 'google' | 'microsoft' | 'github' etc
  provider_user_id  text not null,       -- User ID from provider
  email             text,                -- Email from provider (may differ from users.email)
  name              text,                -- Name from provider
  picture_url       text,                -- Avatar from provider
  raw_data          jsonb,               -- Full provider response (for future features)
  
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  
  -- Unique: one provider account per user, no duplicate provider accounts
  unique (provider, provider_user_id),
  constraint unique_provider_per_user unique (user_id, provider)
);

-- 7. SESSIONS — Device-based sessions (short-lived)
create table if not exists public.sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  
  -- Session metadata
  device_id         text,                -- Fingerprint of device (UA, IP hash, etc)
  device_name       text,                -- User-friendly name (Chrome on Mac)
  device_type       text,                -- 'web' | 'mobile' | 'desktop'
  
  -- Network info
  ip_address        text not null,
  user_agent        text,
  
  -- Tokens
  access_token_hash text,                -- Hash of JWT access token
  refresh_token_id  uuid,                -- FK to refresh_tokens table
  
  -- Timing
  created_at        timestamptz not null default now(),
  last_activity_at  timestamptz not null default now(),
  expires_at        timestamptz not null,
  
  -- Soft delete / revocation
  revoked_at        timestamptz,
  
  -- Audit
  revoked_reason    text                 -- 'user_logout' | 'mfa_enabled' | 'security_alert' etc
);

-- 8. REFRESH_TOKENS — Long-lived tokens for issuing new access tokens
create table if not exists public.refresh_tokens (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  session_id        uuid references public.sessions(id) on delete cascade,
  
  -- Token rotation
  token_hash        text not null unique, -- Hash of the token
  rotation_count    int default 0,        -- Track rotations for reuse detection
  
  -- Token family for reuse detection (if token replayed, rotate entire family)
  token_family_id   uuid,                -- Identifies related tokens (for detecting reuse)
  
  -- Device association
  device_id         text,
  
  -- Timing
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  revoked_reason    text,
  
  -- Audit
  last_used_at      timestamptz,
  last_used_ip      text,
  
  constraint refresh_not_expired check (expires_at > created_at)
);

-- 9. AUDIT_LOGS — Security event logging
create table if not exists public.audit_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.users(id) on delete set null,
  
  -- Event info
  event_type        text not null,       -- 'user.created' | 'user.login' | 'user.logout' | 'mfa.enabled' | 'password.changed' etc
  action            text not null,       -- 'create' | 'read' | 'update' | 'delete'
  resource_type     text,                -- 'user' | 'session' | 'mfa'
  resource_id       uuid,                -- ID of affected resource
  
  -- Outcome
  success           boolean not null default true,
  error_message     text,
  
  -- Context (never log secrets, tokens, secrets, or personally sensitive values)
  ip_address        text,
  user_agent        text,
  details           jsonb,               -- Additional context (sanitized)
  
  -- Timestamp
  created_at        timestamptz not null default now()
);

-- 10. SECURITY_EVENTS — Real-time security alerts for suspicious activity
create table if not exists public.security_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.users(id) on delete set null,
  
  -- Event classification
  event_type        text not null,       -- 'brute_force' | 'account_lockout' | 'mfa_failure' | 'suspicious_login' | 'token_reuse' etc
  severity          text not null,       -- 'low' | 'medium' | 'high' | 'critical'
  
  -- Context
  ip_address        text,
  country           text,                -- Geolocation (optional)
  device_fingerprint text,
  
  -- Action taken
  action_taken      text,                -- 'none' | 'account_locked' | 'mfa_required' | 'email_notification' etc
  
  -- Metadata
  details           jsonb,
  
  -- Timeline
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  
  constraint severity_valid check (severity in ('low', 'medium', 'high', 'critical'))
);

-- 11. PASSWORD_HISTORY — Prevent reuse of old passwords
create table if not exists public.password_history (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  password_hash     text not null,       -- Hash of previous password
  created_at        timestamptz not null default now()
);

-- ============================================================
-- INDEXES — Performance & Foreign Key Constraints
-- ============================================================

-- Users
create index if not exists idx_users_email on public.users(email_normalized);
create index if not exists idx_users_status on public.users(status);
create index if not exists idx_users_organization_id on public.users(organization_id);
create index if not exists idx_users_created_at on public.users(created_at desc);

-- Email Verification
create index if not exists idx_verification_tokens_user_id on public.email_verification_tokens(user_id);
create index if not exists idx_verification_tokens_expires_at on public.email_verification_tokens(expires_at);

-- Password Resets
create index if not exists idx_password_resets_user_id on public.password_resets(user_id);
create index if not exists idx_password_resets_expires_at on public.password_resets(expires_at);

-- OAuth
create index if not exists idx_oauth_accounts_user_id on public.oauth_accounts(user_id);
create index if not exists idx_oauth_accounts_provider_id on public.oauth_accounts(provider, provider_user_id);

-- Sessions
create index if not exists idx_sessions_user_id on public.sessions(user_id);
create index if not exists idx_sessions_device_id on public.sessions(device_id);
create index if not exists idx_sessions_expires_at on public.sessions(expires_at);
create index if not exists idx_sessions_revoked_at on public.sessions(revoked_at);

-- Refresh Tokens
create index if not exists idx_refresh_tokens_user_id on public.refresh_tokens(user_id);
create index if not exists idx_refresh_tokens_token_family_id on public.refresh_tokens(token_family_id);
create index if not exists idx_refresh_tokens_expires_at on public.refresh_tokens(expires_at);

-- Audit Logs
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_audit_logs_event_type on public.audit_logs(event_type);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);

-- Security Events
create index if not exists idx_security_events_user_id on public.security_events(user_id);
create index if not exists idx_security_events_event_type on public.security_events(event_type);
create index if not exists idx_security_events_created_at on public.security_events(created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — Tenant & User Isolation
-- ============================================================

-- Enable RLS on all auth tables
alter table public.users enable row level security;
alter table public.email_verification_tokens enable row level security;
alter table public.password_resets enable row level security;
alter table public.mfa_secrets enable row level security;
alter table public.mfa_recovery_codes enable row level security;
alter table public.oauth_accounts enable row level security;
alter table public.sessions enable row level security;
alter table public.refresh_tokens enable row level security;
alter table public.audit_logs enable row level security;
alter table public.security_events enable row level security;
alter table public.password_history enable row level security;

-- Service role (admin) bypasses RLS
-- Authenticated users can only see their own records
-- Policies are implemented in the application layer (see auth/policies.js)

-- ============================================================
-- CLEANUP: Auto-delete expired tokens & sessions
-- ============================================================

-- Function to clean up expired tokens (run via scheduled job or trigger)
create or replace function cleanup_expired_tokens()
returns void as $$
begin
  -- Delete expired email verification tokens (older than 7 days)
  delete from public.email_verification_tokens
  where expires_at < now() and verified_at is null;
  
  -- Delete expired password reset tokens (older than 24 hours)
  delete from public.password_resets
  where expires_at < now() and used_at is null;
  
  -- Delete expired refresh tokens (older than 30 days)
  delete from public.refresh_tokens
  where expires_at < now();
  
  -- Revoke expired sessions
  update public.sessions
  set revoked_at = now(), revoked_reason = 'expired'
  where expires_at < now() and revoked_at is null;
end;
$$ language plpgsql;

-- ============================================================
-- FUTURE: SSO & SAML (Schema Ready)
-- ============================================================

-- SAML provider configuration (for future implementation)
-- This schema is designed to support SAML without migration
-- Organizations can have SAML configuration linked to SSO

-- Note: Add these when implementing SSO/SAML:
-- - sso_configurations table (org-level SAML settings)
-- - saml_sessions table (SAML-specific session tracking)
-- - sso_audit_logs table (SSO-specific events)

comment on table public.users is 'Core user accounts with email, password, OAuth support, and RBAC preparation';
comment on table public.email_verification_tokens is 'One-time use verification tokens (hashed in storage)';
comment on table public.password_resets is 'Secure password reset flow with token rotation';
comment on table public.mfa_secrets is 'TOTP secrets (encrypted) with recovery codes';
comment on table public.oauth_accounts is 'OAuth provider account linkages (Google, Microsoft, etc)';
comment on table public.sessions is 'Device-based sessions with activity tracking';
comment on table public.refresh_tokens is 'Long-lived tokens with rotation & reuse detection';
comment on table public.audit_logs is 'Security audit trail (no sensitive data)';
comment on table public.security_events is 'Real-time alerts for suspicious activity';
