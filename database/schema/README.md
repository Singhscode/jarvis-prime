# Database Schema

Run these schemas in Supabase SQL Editor in order.

## Files

### 1. leads-schema.sql
**Tables**: `leads`, `outreach_log`  
**Used by**: `apps/website/src/app/api/book/route.ts` — captures website "Book a Call" form submissions.  
**Run first.**

### 2. engine-schema.sql
**Tables**: `clients`, `prospects`, `messages`, `events`, `suppression`, `campaigns`, `campaign_steps`, `linkedin_actions`, `scheduled_jobs`, `ab_tests`, `webhook_events`, `notifications`  
**Used by**: `services/automation-engine` — the core outbound automation pipeline.  
**Run second.**

### 3. auth-schema.sql
**Tables**: `users`, `sessions`, `refresh_tokens`, `email_verification_tokens`, `password_resets`, `mfa_secrets`, `mfa_recovery_codes`, `oauth_accounts`, `audit_logs`, `security_events`, `password_history`  
**Used by**: `services/automation-engine/src/auth` — enterprise identity & authentication.  
**Run third.**

## Migrations
Incremental schema changes are in `../migrations/`. Run via:
```bash
cd services/automation-engine && npm run migrate
```
