# Phase 11 Automation — Production Rollout and Operations

## Scope and authority
PostgreSQL/Supabase `automation_work_items`, leases, controls, reservations, runs, and immutable events are the sole Phase 11 execution authority. The API and worker are deployed independently. `owner_automation_runs` remains a **legacy, Owner-scoped, user-initiated workspace-summary refresh**: it is not Phase 11 automation, has no scheduler/provider/external-effect path, and must not be migrated into Phase 11.

This repository does not define an approved production worker host. Do not co-host the worker inside the API App Service or invent a hosting manifest. Before production rollout, an approved platform owner must provision a separately supervised worker service.

## Required worker deployment contract
Run exactly `npm run worker:automation --workspace=apps/api` from the same tested API artifact version as the API release, but in a separate service/process group.

- **Replica policy:** begin with one replica; horizontal replicas are safe only after the staging restart/scale/fairness rehearsal. Never run an unsupervised duplicate process on the API host.
- **Restart policy:** restart on non-zero exit with bounded exponential backoff. A configuration or compatibility failure must remain non-ready and alert rather than loop silently.
- **Graceful drain:** send `SIGTERM`, retain the process for at least `AUTOMATION_WORKER_DRAIN_GRACE_MS` (default 30 seconds), and do not force-clear leases. The next compatible worker recovers expired leases from PostgreSQL.
- **Required secrets/configuration:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; the service-role key is server-only and must not appear in browser/API responses. Worker tuning may use `AUTOMATION_WORKER_ID`, `AUTOMATION_WORKER_CLAIM_BATCH`, `AUTOMATION_WORKER_CONCURRENCY`, `AUTOMATION_WORKER_ACTION_CONCURRENCY`, `AUTOMATION_WORKER_LEASE_SECONDS`, `AUTOMATION_WORKER_HEARTBEAT_MS`, `AUTOMATION_WORKER_POLL_MS`, `AUTOMATION_SCHEDULE_INTERVAL_MS`, `AUTOMATION_SCHEDULE_BATCH`, and `AUTOMATION_WORKER_DRAIN_GRACE_MS`.
- **Probes:** set `AUTOMATION_WORKER_HEALTH_PORT` and probe `GET /live` for process liveness and `GET /ready` for worker readiness. `/ready` is 200 only after database compatibility and startup stale recovery succeed, and becomes 503 while draining. It exposes no work, owner, provider, credential, or raw-result data.
- **Alerts:** alert on a missing worker-ready probe, stale leases, growing eligible queue age/depth, `FAILED`/`BLOCKED`/`HUMAN_REVIEW` growth, and startup compatibility failures. Use the Owner health projection for Owner-scoped durable queue evidence; do not infer worker liveness from it.

## Production migration authorization: 20260810000023 through 20260810000031, then 20260810000035, then 20260810000036
Historical migrations `20260810000023`–`20260810000031` are immutable. The only approved forward production sequence is `20260810000023` → `…00031` → `20260810000035_complete_phase11_local_candidate_controls.sql` → `20260810000036_harden_phase11_p0_controls.sql`. Migration 35 supplies the idempotent eight-argument control RPC, immutable audit evidence, and controlled `INTERNAL_FAKE` future-trigger path; migration 36 supplies globally keyed control idempotency receipts, UTC-day DAILY reservation rebinding, and request-bound future-trigger replay protection.

`20260810000037_add_phase11_internal_fake_canary.sql` remains pinned repository/staging integrity evidence but is **staging-only**. It is not executable through the production gate. If it appears in the production ledger, the gate stops and reports `20260810000037 present-stop`; it must be absent before any production API deployment. The static manifest still freezes the complete repository candidate chain as 23–31, 35–37 and the production subset as exactly `31 → 35 → 36`.

### Dedicated production gate
The repository-owned gate is `database/scripts/phase11-production-migration-gate.mjs`, invoked only by manual workflow `.github/workflows/09-phase11-production-migration-gate.yml`. It has no filesystem migration discovery path and no call to `npm run db:push`. Its immutable execution allowlist is:

- `20260810000035_complete_phase11_local_candidate_controls.sql` — `ca8c92f8883f68cdc9654b3233e71050e65bdb9e33253931e44148ed0ccd3df0`
- `20260810000036_harden_phase11_p0_controls.sql` — `b35bb3aed105ddfd9cdd053877b0f95d228ba262bd2f5a1bd71a58d092e0812b`

Before opening a database client, the gate reads only those two committed files and verifies the listed SHA-256 values. It also requires the direct, TLS-verified `db.<project-ref>.supabase.co:5432` hostname derived from the protected `PHASE11_PRODUCTION_PROJECT_REF` Environment variable, and `sslmode=verify-full`. The connection string exists only as protected Environment secret `PHASE11_PRODUCTION_DATABASE_URL`; neither value is stored in source or printed. Pooler, preview, staging, loopback, and arbitrary hosts fail closed before connection.

The workflow is manual, runs only from `main`, checks out an operator-supplied SHA that must be reachable from `main`, and uses the existing protected `jarvis-prime-api / production` GitHub Environment. Its Environment approval protects every database-capable step. It never deploys API or worker artifacts and never enables a provider.

### Required production sequence
1. **Production ledger read-only preflight:** manually dispatch the gate with `operation=inspect` and `confirmation=INSPECT_ONLY`. The runner opens `BEGIN READ ONLY`, reads `supabase_migrations.schema_migrations`, then rolls back the read-only transaction. Output contains migration IDs/status only, including 35, 36, and 37.
2. **Verify contiguous predecessors:** require every ledger version 23 through 31. Any missing predecessor stops the gate.
3. **Verify hashes and ledger records:** require the committed 35/36 source hashes above before connection. For an existing 35 or 36 ledger row, require its Supabase `name` and parsed `statements` record to exactly match the verified committed source; the Supabase ledger has no native file-checksum column, so this is the fail-closed recorded-content checksum check. A mismatch stops; a correct completed migration is never reapplied.
4. **Apply 35 only:** manually dispatch with `operation=apply` and `confirmation=APPLY_35_THEN_36`. The workflow first runs the same read-only preflight. The runner repeats preflight under a transaction advisory lock and applies only 35, recording its existing-ledger row before the migration transaction commits.
5. **Verify 35:** the runner reopens a read-only ledger transaction and requires 35 to be recorded with the verified content before it can consider 36. A failed 35 stops delivery and prevents 36.
6. **Apply 36 only:** after successful 35 verification, apply exactly 36 using the same transaction-and-ledger-record behavior.
7. **Verify 36:** the runner reopens a read-only ledger transaction and requires the verified 36 ledger record. It never replays an already-correct migration.
8. **Verify 37 is absent:** a final read-only workflow inspection must show 37 as `absent`. Migration 32, 33, 34, 37, any other post-31/unrelated version, duplicate ledger version, out-of-order 36, or a hash/content mismatch is a stop condition.
9. **Only after the gate succeeds:** record the maintenance/backup approval, durable queue state, provider-disabled state (`PHASE11_APOLLO_READ_ENABLED=false`), and successful final ledger report. Only then may the separately authorized production API deployment proceed. The paired worker image may follow only under its independent worker deployment contract. No production canary or provider call is authorized by this gate.

**Never use** unqualified `npm run db:push` for this release: CLI filesystem discovery could include staging-only migration 37. Do not repair a mismatch by editing migration history or ledger rows; stop and use the incident/forward-fix process.

## Operational response
- **Emergency stop:** Owner uses the authenticated Phase 11 emergency-stop control. It stops new eligible work in that Owner scope; preserve history and investigate before clearing it.
- **Drain/restart:** remove the worker instance from traffic, send `SIGTERM`, wait through the configured drain grace, then start a compatible replacement. Do not delete work or clear leases manually.
- **Stale lease recovery:** a compatible worker performs bounded recovery at startup and before claims. `CLAIMED` stale work becomes retryable when safe; dispatched/uncertain work becomes `HUMAN_REVIEW`. Inspect durable events and result summaries before resolving review.
- **Blocked or human review:** inspect the Owner-safe run history, policy reason, control state, quota, and immutable timeline. Only an authorized Owner may apply the audited retry/review action. Never retry an ambiguous outcome blindly.
- **Database outage:** keep the worker non-ready; do not substitute an in-memory queue or complete work outside PostgreSQL. Restore database connectivity, run the compatible worker, and let bounded stale recovery classify outstanding leases.

## Recovery and forward fixes
Schema changes are forward-only. Do **not** roll back an applied Phase 11 migration by dropping durable state or editing history. If a release must be withdrawn, roll back the API/worker artifact, leave controls/providers disabled as needed, and create a reviewed forward-fix migration for any database defect. Restore from backup only under the platform incident process after assessing data-loss and audit consequences.

## Provider separation
Provider activation is not part of worker deployment. Apollo remains disabled/deferred: `PHASE11_APOLLO_READ_ENABLED=false`, no enabled owner Apollo configuration, and no live provider call. Hunter, Outreach, Calendar, and webhooks remain disabled. A later activation needs its own approval, quota, credential, reconciliation, and operational acceptance record.
