# Owner Workspace Production Readiness Report

**Status:** Conditional **NO-GO** for production approval. Source work and application validation are complete; the required disposable-database migration rehearsal is blocked because Docker Desktop is manually paused. No migration, deployment, commit, merge, or remote service action occurred.

## 1. Invitation acceptance lifecycle
- Password setup now calls the service-role-only `activate_pending_employee_invitation` RPC.
- The RPC locks the employee and invitation rows, atomically activates a pending employee and transitions the same pending invitation to `accepted`, then writes an Owner-attributed acceptance audit event.
- A previously accepted invitation returns a successful `already_accepted` result without changing data. Pending employees without an invitation retain the prior activation behavior.
- The public password-reset response and Employee Portal boundaries remain unchanged; no invitation data or secrets are returned.

## 2. Invitation resend workflow
- Added `POST /api/owner-workspace/employees/:employeeId/resend-invitation` behind the existing JWT middleware, Owner guard, and Owner-keyed invitation limiter (5 attempts/hour shared with creation).
- The new `prepare_owner_employee_invitation_resend` RPC locks and verifies the authenticated Owner, employee ownership, employee pending state, and existing pending invitation before rotating the setup-token hash and expiry.
- It invalidates the prior invitation setup token, inserts one new password-reset token, preserves the existing employee and invitation rows, resets delivery state, records a resend audit event, and returns only safe delivery metadata.
- Raw setup tokens are never stored. Therefore, an active invitation is securely resent by rotating its one-time token while reusing the same invitation record; expired invitations follow the same path with a new 24-hour expiry.

## 3. Migration readiness and rehearsal
- `20260805000014_add_owner_employee_and_automation_workflows.sql` remains the only changed, forward-only source migration; no historical migration was changed.
- Static upgrade/fresh-install review passed: it follows the transaction/timeout convention; its prerequisites (`users`, `password_resets`, `audit_logs`, and Client Portal memberships) are created in earlier ordered migrations; changes are additive; table creation/columns/indexes are idempotent; functions use `SECURITY DEFINER SET search_path = ''`; RLS, revocations, and service-role-only grants cover the new tables/functions.
- The source contains the required employee invitation, automation, direct-client-compatible, and Owner Workspace schema paths. Existing-database upgrade relies on applying this next version after `20260730000013`; fresh install relies on the full ordered migration chain.
- Rehearsal attempt: Supabase CLI `2.109.1` is available, but Docker reported that Docker Desktop is manually paused. No isolated database was started and no `db reset` was issued, avoiding risk to the existing local workdir.
- Required completion: unpause Docker, create a separate temporary Supabase workdir/project/volumes (never use the repository `db:reset` workdir), apply the full chain for fresh install and apply `00014` after an `00013` baseline for upgrade, then verify schema, constraints, indexes, RPCs, RLS/ACLs, employee invite/resend/acceptance, automation run, Direct Client, and Owner Workspace flows.
- Rollback is forward-only: disable the new route at the application layer if necessary, restore the prior application release, and use an approved compensating migration only after backup/PITR and migration-record review. Do not delete or rewrite applied migration history.

## 4. Automation queue assessment
- The in-memory queue is **not acceptable** for a production release that requires durable execution. A restart loses queued jobs and can strand a persisted `pending` automation run; it has no recovery scanner, cross-instance coordination, or durable retry ledger. The current owner-run job explicitly uses `maxRetries: 0`.
- Database idempotency and the atomic run-claim RPC reduce duplicate execution, but they do not provide worker recovery. The reused request limiter is also process-local and is not a distributed multi-instance control.
- Recommendation only, not implemented: use PostgreSQL-backed queue semantics on the existing automation-run storage—atomic `FOR UPDATE SKIP LOCKED`/claim leases, retry count and `next_attempt_at`, lease-expiry recovery, bounded exponential retries, and a worker poller. The existing owner/idempotency key and claim transition can remain the deduplication foundation. A Redis/BullMQ or managed task queue is an alternative only if the operational dependency is approved.

## Files modified
- `apps/api/src/modules/auth/repository.js`
- `apps/api/src/modules/owner-workspace/{owner-workspace.routes.js,owner-workspace.service.js,owner-workspace.repository.js}`
- `apps/api/test/owner-workspace.test.js`
- `database/supabase/migrations/20260805000014_add_owner_employee_and_automation_workflows.sql`
- `OWNER_WORKSPACE_PRODUCTION_READINESS_REPORT.md`

## Validation and security review
- Passed: `npm run lint`; `npm run type-check --workspace=apps/web`; `npm run test` (API 87/87, web 26/26, ICP scorer 16/16); `npm run build`; `git diff --check`; diagnostics on changed source/test files.
- Focused tests cover resend scope/redaction/token hashing, acceptance RPC use, and acceptance during the successful password-reset flow. Existing authorization, validation, no-secret response, audit, and rate-limit behavior remain in place.
- Full local database integration/rehearsal tests are not executed because Docker is paused. This, the pre-existing remote migration-record mismatch, the required backup/PITR evidence, and the durable queue decision remain production release blockers.
