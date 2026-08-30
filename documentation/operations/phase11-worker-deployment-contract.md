# Phase 11 Worker Deployment Contract

This is a platform-neutral release contract, not a cloud manifest or authorization to provision infrastructure. The existing Azure workflow deploys the API only. A Phase 11 worker must be a separately supervised process and must **not** be co-hosted in the API request runtime, Vercel, the legacy `queue.js`, or `/api/owner-workspace/automation-runs`.

## Required process and identity

Run exactly:

```sh
npm run worker:automation --workspace=apps/api
```

Deploy the worker from the same reviewed API artifact SHA as the compatible API release. The deployment platform assigns a unique non-secret `AUTOMATION_WORKER_ID` per running process. PostgreSQL remains the sole work/lease/recovery authority; worker-local state and probes are not an execution authority.

## Environment and least privilege

Inject only server-side worker configuration from an approved secret manager or runtime configuration channel:

- Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Required operational setting: `AUTOMATION_WORKER_HEALTH_PORT` for the supervisor probe.
- Non-secret bounded tuning: `AUTOMATION_WORKER_ID`, `AUTOMATION_WORKER_CLAIM_BATCH`, `AUTOMATION_WORKER_CONCURRENCY`, `AUTOMATION_WORKER_ACTION_CONCURRENCY`, `AUTOMATION_WORKER_LEASE_SECONDS`, `AUTOMATION_WORKER_HEARTBEAT_MS`, `AUTOMATION_WORKER_POLL_MS`, `AUTOMATION_SCHEDULE_INTERVAL_MS`, `AUTOMATION_SCHEDULE_BATCH`, and `AUTOMATION_WORKER_DRAIN_GRACE_MS`.

Do not inject browser credentials, API JWT secrets, `APOLLO_API_KEY`, Hunter, Outreach, Calendar, webhook, or other provider credentials into this worker deployment. The service-role key is server-only, never logged, and must have access limited to the approved Supabase project. Startup fails before claiming work if database configuration or bounded worker configuration is invalid.

## Supervision and probes

- **Liveness:** `GET /live` must return HTTP 200 while the process can serve the local supervisor probe.
- **Readiness:** `GET /ready` returns HTTP 200 only after durable compatibility verification and startup stale-lease recovery. It returns HTTP 503 before readiness, on compatibility failure, and while draining.
- **Restart:** the approved platform must restart unexpected non-zero exits with bounded exponential backoff and alert after repeated failures. Do not use a tight restart loop.
- **Drain:** on `SIGTERM`, stop new materialization/claims and retain the process for at least `AUTOMATION_WORKER_DRAIN_GRACE_MS` (30 seconds by default). Do not clear leases manually; a compatible replacement handles expired leases through PostgreSQL recovery.
- **Replicas:** start with one worker replica. More replicas require a staging restart/scale/fairness rehearsal and remain safe only through durable PostgreSQL claims.

## Manual migration release gate

`database/automation-rollout-contract.json` pins the repository evidence for migrations `20260810000023` through `20260810000031`, including content hashes and compatibility versions. It detects source/history drift; it does not prove a remote migration ledger or authorize deployment.

### 1. Preflight — operator-owned, stop on any failure

1. Run `npm run verify:automation:rollout-contract`, `npm run db:reset`, and `npm run test:integration:automation --workspace=apps/api` against a disposable local database.
2. Record the release SHA, reviewed migration manifest, durable compatibility result, and that all external providers remain disabled.
3. An authorized production operator compares the approved remote migration ledger with the manifest. Any unknown, absent, edited, reordered, or privately held migration is a stop condition; do not edit migration history or ledger rows to repair it.
4. Make an explicit backup/PITR and restore-owner decision using the approved production backup procedure. Stop if restore responsibility or evidence is unavailable.
5. Confirm the target worker platform, secret-manager injection, supervisor probe routing, restart/backoff, drain grace, and alert ownership are approved. This document does not select those resources.

### 2. Canary — after platform and deployment approval only

Start one separate worker replica with conservative existing defaults. Require `/live` 200 and `/ready` 200; capture durable compatibility, queue/lease/recovery health, and a drain/stop rehearsal. Use only an approved internal-safe action for any smoke evidence. Do not use Apollo, Hunter, Outreach, Calendar, webhooks, or any provider as a canary.

### 3. Forward fix — never destructive rollback

If compatibility, readiness, migration ledger, queue/recovery evidence, backup decision, or provider separation fails, stop and drain workers. Roll back the application/worker artifact if needed, but never delete, edit, reorder, or manually alter applied migrations. A database correction must be a reviewed timestamped forward migration followed by fresh local validation, preflight, and canary evidence.

## CI boundary

CI validates repository evidence only: static manifest integrity, clean local migration reset, disposable PostgreSQL automation integration, and worker runtime tests. **CI never runs `npm run db:push`**, links a Supabase project, uses production credentials, deploys the API or worker, or activates providers. Remote migration preflight, backup/restore, and canary actions remain explicit human-approved operations.

## Legacy boundary

`/api/owner-workspace/automation-runs` remains a compatibility-only, Owner-scoped, user-initiated manual workspace-summary refresh. It has no Phase 11 queue, scheduler, provider, or external-side-effect authority, and must never be migrated or represented as Phase 11 execution.
