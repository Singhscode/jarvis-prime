 # JARVIS PRIME Master Roadmap

## Phase 13 — Production & DevOps

✅ **Complete**
**Completion date:** September 26, 2026
**Status:** Production Supabase cutover complete. Managed cloud project deleted; production now runs on self-hosted Supabase via Cloudflare Tunnel. All critical infrastructure and health checks verified.

### Major deliverables

- Production Supabase infrastructure migrated from deleted managed cloud project (`fytnwpnnvqecjmyhrzcx.supabase.co`) to self-hosted instance at `https://supabase.jarvisprime.me`.
- Azure App Service (`jarvis-prime-api`) configuration updated: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY now point to self-hosted Supabase credentials.
- Self-hosted production Supabase verified healthy: TLSv1.3 HTTPS, Cloudflare Tunnel active, Kong gateway operational, returns expected 401 for unauthenticated requests.
- Production application restarted and health checks passing: `/health` → 200, `/api/crm/prospects` → 401 (auth check indicating DB connectivity), `https://jarvisprime.me` → 200.
- Configuration backup created with rollback strategy documented: self-hosted only; old managed project is permanently deleted.
- CI/CD pipeline verified: 495/495 tests passing (246 API unit + 82 web unit + 56 integration Phase 10-12 + 111 gate/contract tests).
- Environment separation verified: production (Azure + self-hosted Supabase) and staging (self-hosted Supabase) both operational and isolated.
- Security posture verified: TLS/1.3, RLS policies, JWT authentication, service-role credential protection, no secrets exposed in logs or code.
- No active managed Supabase dependencies remain in production configuration, CI/CD workflows, or source code.

### Verification

- **Azure App Service:** `jarvis-prime-api` in RG `jarvis-prime-rg`; HTTPS only; Node 22 LTS; Running
- **SUPABASE_URL:** `https://supabase.jarvisprime.me` ✅ (updated from deleted `fytnwpnnvqecjmyhrzcx.supabase.co`)
- **SUPABASE_SERVICE_ROLE_KEY:** JWT format, 219 chars, self-hosted (updated from old 41-char managed format) ✅
- **Health endpoint:** `/health` HTTP 200 ✅
- **API connectivity:** `/api/crm/prospects` HTTP 401 (auth check, not DB error) ✅
- **Frontend:** `https://jarvisprime.me` HTTP 200 ✅
- **TLS:** TLSv1.3 verified ✅
- **Cloudflare Tunnel:** Healthy (cf-ray header present) ✅
- **Deleted project scan:** Only reference is in `.temp/linked-project.json` (Supabase CLI cache, non-functional) ✅
- **Tests:** 495/495 pass; no regression from cutover ✅

### Remaining operational items

Items that are best-practices and do not block production readiness:

- Full backup/restore testing in isolated environment (procedure documented; safe to defer).
- Comprehensive disaster recovery playbook (10 scenario procedures).
- Centralized monitoring dashboard wiring (health endpoints functional; dashboard not yet centralized).
- Scheduler enablement (currently `SCHEDULER_ENABLED=false` by design).
- Resource utilization tracking and trending.
- Formal release process documentation (implicit in CI/CD; explicit doc recommended).
- SLA and incident response procedures.

The system is stable, secure, and verified operational on self-hosted infrastructure. Production is ready for normal operations.

---

## Phase 12 — Analytics & Reporting

✅ **Complete**
**Completion date:** September 26, 2026
**Status:** All analytics infrastructure, RPC functions, dashboard API, scheduled snapshot job, reporting UI, and integration suite are implemented and verified in production.

### Major deliverables

- `analytics_daily_metrics` table with `UNIQUE (owner_user_id, metric_date)` composite key, non-negativity and date-floor CHECK constraints, RLS, and a nightly upsert path that is idempotent on re-run.
- Three SECURITY DEFINER RPC functions: `get_revenue_by_owner`, `get_monthly_revenue`, `get_expenses_by_owner`, all returning `bigint` (migration 43 corrected the numeric→bigint cast that was causing `structure of query does not match function result type`).
- Analytics service and repository wired to 11 GET endpoints under `/api/analytics` (JWT+owner required); the dashboard calls the three finance RPCs in parallel with CRM, communication, and automation sources.
- `analytics-daily-snapshot` scheduler job (cron `15 0 * * *`) calling `runDailySnapshotForAllOwners`; duplicate execution overwrites cleanly via the composite unique key.
- `OwnerAnalyticsWorkspace.tsx` component hitting the real `/api/analytics/dashboard` endpoint; route reachable from the owner shell navigation.
- Protected Phase 12 production migration workflow (`12-phase12-analytics-production-migration.yml`) with hash-pinned allowlist, confirmation token `APPLY_PHASE12_ANALYTICS_43`, mandatory preflight, independent post-apply ledger verification, and shared advisory lock with the Phase 11 gate.

### Verification

- 15/15 Postgres integration tests pass (fixture defect corrected: fixtures now use `public.users` consistent with other suites; `beforeEach` cleanup prevents UNIQUE collision; unscoped tenant-isolation count scoped to fixture owners).
- 47/47 Phase 12 migration gate unit tests pass.
- 246/246 API unit tests pass. 82/82 web tests pass.
- Migration 43 applied to production via the protected workflow (run 35652376007). `PHASE12_VERIFIED 20260810000043 fix_analytics_rpc_bigint_cast applied sha256=e815794c…`.
- Analytics integration suite wired into CI (`01-test.yml`); phase-12 gate unit tests wired into CI.

### Remaining operational notes

- `crm_leads_qualified` and `crm_leads_converted` snapshot columns have no current source and remain 0; no `crm_leads` qualification status field exists today.
- `getDashboard(null)` callers in the legacy scheduler report jobs always 403 (they predate the analytics auth model); not a regression.
- `get_prospect_stage_counts` RPC introduced by migration 42 is unscoped by owner; it is not called by the analytics module but should be reviewed before Phase 13 tightens the RPC grant surface.

---

## Phase 11 — Automation Platform

✅ **Complete**
**Completion date:** September 26, 2026
**Status:** Automation registry, execution engine, worker compatibility contract, governance RPCs, scheduler, retry/drain safety, UI, integration suite, and production ACA deployment are all verified.

### Major deliverables

- Action registry: `ACT_ASSIGN`, `ACT_TASK`, `ACT_NOTIFY` (INTERNAL); `ACT_APOLLO_SEARCH` (APOLLO, read-only, feature-gated). Resolver fails closed on any unregistered code.
- 14 automation migrations (23–31, 35, 36, 38, 39, 40) forming the durable work-item queue, recipe/governance system, and worker claim-drain hardening.
- Worker constants `AUTOMATION_REGISTRY_V1` / `AUTOMATION_WORKER_V2` agree across `automation.execution.validation.js`, `automation-rollout-contract.json`, and the `automation_execution_contract` singleton row (CHECK constraint pinned by migration 40).
- Lease tokens, heartbeats, `SKIP LOCKED` claiming, attempt phases, late-result suppression, advisory locks, and `automation_relinquish_unstarted_claim` make the queue safe under concurrent workers and graceful drain.
- Immutable audit trail: `automation_run_events`, `automation_policy_decisions`, `automation_control_operations`.
- Owner and employee web workspaces call 15+ real API endpoints; no mock data.
- Phase 11 production worker deployed to ACA (`ca-phase11-automation-wkr-prod`) at SHA `c2849b52220df355d9f6886529e06cbefc2a7b27`; `AUTOMATION_WORKER_V2`, `worker_ready` confirmed, 0 restarts.

### Verification

- 33/33 automation Postgres integration tests pass. 53/53 gate unit tests pass. 11/11 rollout-contract tests pass.
- Rollout-contract workflow 08 baseline-capture fix: bootstrap sentinel values now assigned to shell variables before `{ } >> $GITHUB_ENV` so the contract's scalar-write assertion passes.
- `verify:automation:rollout-contract` exits 0.

### Remaining operational notes

- The `worker.run()` idle-backoff path (`idleCycles`, `resetIdle`) is dead code in production; the deployed entrypoint uses its own fixed-interval loop. Low priority.
- Migration `20260810000037` (staging-only canary) falls outside the verifier's discovery regex — intentional but worth documenting for future verifier upgrades.

---

## Phase 10 — Communication Hub

✅ **Complete**
**Completion date:** September 26, 2026
**Status:** Communication schema, RPCs, service, routes, delivery webhook, three portal pages, and integration suite are implemented and verified.

### Major deliverables

- 8 tables (`communication_threads`, `_participants`, `_messages`, `_attachments`, `_notifications`, `_preferences`, `_deliveries`, `_delivery_events`) with composite FK chains, immutability triggers on messages/attachments/events, UNIQUE idempotency keys, and `SKIP LOCKED` + lease-based delivery claiming.
- 14 SECURITY DEFINER RPCs (all `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role`; writes accessible to `service_role` via the 8 mutating RPCs only).
- Private `communication-private` storage bucket. RLS enabled (deny-all by design; all access through service-role).
- `communication_write_audit` writes to `audit_logs` inside the same transaction as thread creation, message send, and permanent delivery failure; audit failure rolls back the parent operation.
- Actor scoping resolves owner → employee → client by business code, never raw UUID injection. Ownership enforced at service, RPC, and FK layers.
- Idempotency: `UNIQUE (owner_user_id, created_by_user_id, create_idempotency_key)` on threads; `UNIQUE (owner_user_id, thread_id, sender_user_id, idempotency_key)` on messages; conflict returns existing result, request-hash mismatch raises `COMMUNICATION_IDEMPOTENCY_CONFLICT`.
- Three web pages (`/dashboard/communications`, `/employee/communications`, `/client/communications`) with a shared `CommunicationWorkspace` component; all data calls hit real endpoints.
- Inbound Resend webhook with Svix-style HMAC + 5-minute timestamp tolerance; `communication_record_delivery_event` is idempotent on `UNIQUE (provider, provider_event_id)`.

### Verification

- 8/8 Postgres integration tests pass (RLS/grants, thread creation + idempotency, concurrent sequence allocation, cross-tenant isolation, stale revocation, delivery retry bounds, audit rollback).
- 13/13 API unit tests pass. 8/8 web tests pass.
- Communication integration suite wired into CI (`test:integration:communications` in `01-test.yml`).

### Known limitation (by design)

- Outbound email delivery (`communication_deliveries` → Resend) is a hard-disabled stub (`communicationEmailDeliveryEnabled = false`). The DB-side lease/claim/retry infrastructure is complete; a background job must be wired in when the feature is enabled.
- `COMMUNICATION_RESEND_WEBHOOK_SECRET` is now documented in `apps/api/.env.example` (was missing; added by PR #94).

---
## Phase 14 — AI Foundation

✅ **Complete**
**Status:** The reusable, controlled, API-only AI foundation is implemented and verified.

### Major deliverables

- Standardized Groq and OpenAI provider contracts with validated server-only configuration and preserved system/user message roles.
- Versioned personalization prompt definitions with Zod input/output schemas, deterministic policy checks, and reviewable evaluation fixtures.
- A structured execution runtime that enforces authorization, client scope, input/output validation, confidence, and safety before accepting AI output.
- Redacted allowlisted telemetry for provider, model, prompt version, request ID, latency, token usage, estimated cost, outcome, and classified errors.
- Explicit safe fallback handling for approved provider degradation, rate limits, invalid provider/output data, unsafe output, and low-confidence output; unknown and authorization failures fail closed.
- Persisted prospect and active-client resolution for mounted outreach actions so request-body identity cannot establish tenant scope.

### Verification and scope boundary

- Focused AI foundation tests pass 22/22; the complete API suite passes 134/134.
- Diagnostics, formatting checks, persisted-scope smoke tests, telemetry leak probes, and final semantic security review pass.
- No live provider request, production mutation, autonomous outreach capability, AI tool execution, deployment, commit, or push was added or performed. AI sales agents and operational tools remain Phase 15 and Phase 16 work.

## Phase 9 — Finance & Billing

✅ **Complete**
**Status:** Finance foundation, service surfaces, production schema/security verification, disposable local integration testing, CI wiring, and the authenticated Owner browser smoke are complete. The Owner smoke was manually confirmed in an existing authenticated Owner session for all four Finance routes; no login or production mutation was performed during automated verification.

### IMPLEMENTED

- Owner-scoped Finance Dashboard routes for overview, invoices, payments, and expenses.
- Owner-only billing-profile management; owner and exact-permission employee Finance access.
- Server-only Finance RPC mutations for invoices, manual payment records, and expenses, with validated status transitions and audit events.
- Finance schema foundation: billing profiles, employee permissions, invoices/items, payments, expenses, documents, a private `finance-private` bucket, owner-scoped constraints, RLS, and service-role-only table access.

### VERIFIED

- Read-only linked-production schema inspection confirmed all seven Finance tables, required RPCs, RLS, browser/public privilege revocation, and intended service-role grants.
- Disposable local PostgreSQL integration passed 7/7 tests for RLS/ACL, owner isolation, employee permissions, RPC/audit behavior, relationship constraints, and rollback/error cases.
- CI runs the existing Finance PostgreSQL suite through the established disposable Supabase integration block.
- An authenticated Owner manually confirmed that `/dashboard/finance`, `/dashboard/finance/invoices`, `/dashboard/finance/payments`, and `/dashboard/finance/expenses` load without page errors.

### DEFERRED

- Client Finance portal.
- Payment gateway integration and webhooks; reconciliation; refunds and chargebacks; subscriptions.
- Finance documents and receipts UI, reports and exports, accounting synchronization, and tax or legal automation.

### Finalization boundary

No production data, schema, migration, deployment, DNS, commit, or push action was performed during verification. Deferred Finance capabilities remain out of scope and must not be represented as implemented.

## Phase 8 — Owner Workspace

✅ **Complete**
**Version:** `v0.11.0`
**Git Tag:** `v0.11.0-owner-workspace`
**Status:** Complete
**Completion Date:** July 21, 2026

### Major deliverables

- One responsive `/dashboard` Owner Workspace for dashboard oversight, CRM, clients, projects, tasks, employees, documents, audit, settings, and global search.
- A narrow `/api/owner-workspace` façade that preserves Repository → Service → Route boundaries and reuses existing CRM domain rules.
- Client Portal membership and invitation administration plus document publication/revocation through existing lifecycle services.
- Fixed metadata projections, bounded list/search queries, unavailable-source states, accessible loading/error/empty states, and route-local navigation.

### Security, testing, and scope summary

- Existing JWT access tokens, refresh cookies, sessions, login, refresh, and logout behavior are reused.
- Every Owner Workspace request derives scope from `req.user.sub`; browser identifiers are locators only.
- Server-side Owner Workspace authorization denies Employee Portal and Client Portal identities before protected handlers execute.
- Owner responses do not expose storage paths, signed URLs, invitation values, raw audit contents, credentials, or persistent browser state.
- API, Owner Workspace, Employee Portal, Client Portal, frontend, lint, type-check, diagnostics, and production-build release validation passed.
- Phase 8 is frozen after release; only bug fixes are permitted, except the explicitly approved July 30, 2026 Direct Client Creation addendum.

## Phase 7 — Client Portal

✅ **Complete**
**Version:** `v0.10.0`
**Git Tag:** `v0.10.0-client-portal`
**Status:** Complete
**Completion Date:** July 19, 2026

## Implemented business workflow

```text
Website Lead → CRM Lead → Client → Project → Task → Employee Portal → Client Portal
```

The Client Portal gives an external client member a minimal, read-only view of one server-derived CRM client scope without exposing internal CRM, owner, or employee operations.

### Major deliverables

- `/client` workspace and `/client/activate` invitation flow using existing JWT access tokens, refresh cookies, login, and logout.
- Read-only client-safe projects and tasks plus on-demand, approved private-document downloads.
- Owner-controlled invitation issue/resend/revocation and document publication/revocation operations.
- Additive memberships, hashed single-use invitations, document metadata, private Storage, RLS, indexes, and lifecycle RPCs.

### Security and privacy summary

- Exactly one active membership derives Client Scope on every protected request; browser-supplied identifiers never establish authorization.
- Invitations are account-bound, hash-only at rest, single-use, 24-hour, and atomically activated or revoked.
- Private documents use current membership-plus-document scope authorization and 60-second signed URLs; audit records exclude raw tokens, signed URLs, and document contents.
- Client state stays in memory and clears on logout, refresh/protected-request failure, access denial, or user transition.
- Credentialed CORS accepts explicit origins only and rejects wildcard configuration.

### Accessibility, testing, and CI summary

- The workspace provides responsive, keyboard-operable sign-in, activation, refresh, logout, document-download, loading, error, and empty states with accessible announcements.
- Added focused API security coverage, disposable PostgreSQL integration coverage, and route-local frontend testing.
- CI now executes Client Portal PostgreSQL integration plus web lint, type-check, frontend tests, and production build.

### Deliberate scope limits

- No client writes, uploads, chat, comments, billing, analytics, employee tools, owner tools, or multi-client membership are included in Phase 7.

## Roadmap status

✅ Phase 0 Repository Cleanup
✅ Phase 0.5 Database Audit
✅ Phase 0.6 Runtime Stabilization
✅ Phase 1 Core User Platform
✅ Phase 2 CRM Foundation
✅ Phase 3 Client Management
✅ Phase 4 Project Management
✅ Phase 5 Task Management
✅ Phase 6 Employee Portal
✅ Phase 7 Client Portal
✅ Phase 8 Owner Workspace
✅ Phase 9 Finance & Billing
✅ Phase 10 Communication Hub
✅ Phase 11 Automation Platform
✅ Phase 12 Analytics & Reporting
✅ Phase 13 Production & DevOps
✅ Phase 14 AI Foundation
⏳ Phase 15 AI Sales Agents
⏳ Phase 16 AI Operations
⏳ Phase 17 Enterprise Security
🚀 Version 1.0 Release
