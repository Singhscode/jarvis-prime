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

## Migration rollout: 20260810000023 through 20260810000031
Historical migrations `20260810000023`–`20260810000030` are immutable. `20260810000031` adds only a read-only operational projection and indexes; it does not create metric storage or change execution behavior.

1. **Preflight:** record release SHA, `npm run db:status`, database capacity/maintenance window, current durable queue state, and that all providers remain disabled. Confirm `PHASE11_APOLLO_READ_ENABLED=false`; do not configure an enabled Apollo owner action. Ensure a tested backup/restore path exists before schema application.
2. **Backup decision:** take or confirm a platform-approved backup before applying a remote migration. If a backup cannot be made or the restore owner cannot be reached, stop; do not apply schema changes.
3. **Rehearse:** in a disposable local database run `npm run db:reset`, then `npm run test:integration:automation --workspace=apps/api`. This exercises the complete migration chain, leases, recovery, controls, compatibility, and the operational-health projection without production data.
4. **Apply in order:** use the approved operator identity to run `npm run db:push` once. Apply the lexical chain `20260810000023` → `...00031`; never manually skip an earlier migration or edit an applied migration.
5. **Verify schema:** rerun `npm run db:status`; record all versions through `20260810000031`. Verify the worker service-role can call compatibility and the operational-health projection, while browser roles cannot access service-only database functions.
6. **Deploy API then canary worker:** deploy compatible API code, then one separately supervised worker replica. Validate `/live`, `/ready`, compatibility, and a safe internal-action admission/control/recovery path. Do not use Apollo, Hunter, Outreach, Calendar, webhooks, or provider credentials as a canary.
7. **Post-release:** inspect Owner-scoped queue/lease/recovery health, immutable audit events, controls, quotas, and error logs. Keep external provider activation as a separately approved change.

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
