# Phase 11 Worker Deployment Contract

This is a release contract, not a cloud-authorization record. The production API remains on Azure App Service; the Phase 11 worker must be a separately supervised, ingress-disabled service and must never be co-hosted in the API request runtime, Vercel, `queue.js`, or `/api/owner-workspace/automation-runs`.

## Required process, identity, and artifact pairing

Run exactly `npm run worker:automation --workspace=apps/api` from the same reviewed commit as the paired production API release. PostgreSQL remains the sole work/lease/recovery authority; worker-local state and probes are never an execution authority.

The production API workflow deploys the App Service artifact and then records `github.sha` in its protected workflow summary. The manual production worker workflow requires that exact SHA twice—`api_release_sha` and `git_sha`—rejects any mismatch, checks out the SHA, verifies `git rev-parse HEAD`, and uses read-only GitHub Actions workflow evidence to require a successful `04-deploy-azure-api.yml` run at that SHA before Azure login. It then records the verified API/worker pair in its protected summary. Retain both successful workflow records with the release approval; code compatibility alone is not artifact-pairing evidence.

The runtime platform assigns a unique non-secret `AUTOMATION_WORKER_ID`. Its user-assigned managed identity needs only ACR pull and Key Vault read access; the GitHub Environment OIDC identity needs only ACR push and Container App image-update permissions. No client, provider, or browser identity is allowed.

## Environment, probes, supervision, and scale

Inject only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from a production secret manager, plus non-secret bounded tuning (`AUTOMATION_WORKER_*`, `AUTOMATION_SCHEDULE_*`, and `AUTOMATION_WORKER_DRAIN_GRACE_MS`). `AUTOMATION_WORKER_HEALTH_PORT` is required for supervisor probes. Do not inject API JWT secrets, `APOLLO_API_KEY`, Hunter, Outreach, Calendar, webhook, or any other provider credential. `PHASE11_APOLLO_READ_ENABLED=false` is mandatory.

- `GET /live` must return HTTP 200 while the process can serve its local supervisor probe.
- `GET /ready` returns HTTP 200 only after durable compatibility verification and startup stale-lease recovery; it returns 503 before readiness, on compatibility failure, and while draining.
- Start at exactly one replica. ACA uses `activeRevisionsMode: 'Single'`, `minReplicas: 1`, and `maxReplicas: 1`; a scale-out decision requires a separate staging fairness/restart rehearsal.
- On `SIGTERM`, stop new materialization and claims. Retain the process for at least `AUTOMATION_WORKER_DRAIN_GRACE_MS` (30 seconds by default), and never clear leases manually. A compatible replacement recovers expired leases durably.
- The platform owner must configure bounded unexpected-exit restart/backoff and alert after repeated failures. The repository does not invent unsupported ACA Bicep restart/backoff properties.

## Manual migration release gate

`database/automation-rollout-contract.json` cryptographically pins the repository candidate chain 23–31, 35–37. Its literal **production-approved** subset is `20260810000023` through `20260810000031`, then `20260810000035`, then `20260810000036`. Migration 35 provides idempotent automation controls and immutable audit evidence; migration 36 adds global idempotency receipts and current-UTC-day DAILY reservation rebinding.

Migration `20260810000037_add_phase11_internal_fake_canary.sql` is unchanged, pinned staging-only canary evidence and is excluded from this production authorization. A local `db:reset` includes it solely to validate the clean repository source chain. Before any future remote database operation, the approved operator must compare the remote ledger. If 37 is pending remotely, stop: an unqualified `npm run db:push` would discover it after 36. This bundle does not authorize or provide a production migration application mechanism.

Before separate production authorization, run `npm run verify:automation:rollout-contract`, `npm run db:reset`, and the disposable-local automation integration suite; record the release SHA, approved subset, remote ledger comparison, providers-disabled confirmation, and backup/PITR restore responsibility. Unknown, absent, edited, reordered, or private migrations are stop conditions. Never edit historical migrations or migration-ledger rows; a correction is a reviewed forward migration.

## Deployment boundary

`production.bicep` is the one-time declarative owner of the production identity, Key Vault references, probes, ingress-disabled topology, single replica, and termination grace. The manual worker workflow is image-only: it builds `<acr>/<repository>:sha-<git_sha>` from the root `Dockerfile` and runs only `az containerapp update --image`. It never changes configuration, secrets, identity, ingress, probes, scale, or resources.

No production canary, migration, provider call, or customer-data operation is authorized by this contract. The fixed `ACT_INTERNAL_FAKE` canary remains staging-only and requires its separate staging execution authorization.

## CI boundary

CI validates repository evidence only: static manifest integrity, local template parsing, clean local migration reset, disposable PostgreSQL automation integration, and worker runtime tests. **CI never runs `npm run db:push`**, links a Supabase project, uses production credentials, deploys the API or worker, accesses production secrets, or activates providers.

## Legacy boundary

`/api/owner-workspace/automation-runs` remains a compatibility-only, Owner-scoped, user-initiated manual workspace-summary refresh. It has no Phase 11 queue, scheduler, provider, or external-side-effect authority, and must never be migrated or represented as Phase 11 execution.
