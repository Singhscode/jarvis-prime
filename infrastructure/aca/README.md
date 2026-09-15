# Phase 11 Automation Worker — Azure Container Apps

This directory holds **undeployed** Azure Container Apps declarations for the separately supervised Phase 11 worker. `staging.*` is staging-only; `production.*` is production-only. The API remains on Azure App Service. Neither worker may be co-hosted inside the API process.

## Artifacts

| File | Purpose |
| --- | --- |
| `../../Dockerfile` | Root-context OCI image for the worker (`npm run worker:automation --workspace=apps/api`). |
| `../../.dockerignore` | Keeps secrets, caches, tests, and unrelated files out of the build context. |
| `../../.github/workflows/06-deploy-aca-staging.yml` | Manual staging image-only worker update. |
| `../../.github/workflows/08-deploy-aca-production.yml` | Manual, protected-environment production image-only update; requires an exact API/worker SHA match. |
| `staging.bicep` / `staging.parameters.json` | Staging ACA environment + worker declaration and non-secret placeholders. |
| `production.bicep` / `production.parameters.json` | Production ACA environment + worker declaration and non-secret placeholders. It is not applied by this release bundle. |

## What this does NOT do

- Does not create or modify Azure resources by itself (deployment is a separate, human-approved step).
- Does not deploy the API App Service.
- Does not run remote migrations (`db:push`) or link a Supabase project.
- Does not activate or call Apollo, Hunter, Outreach, Calendar, or webhooks.
- Does not inject any provider credential. `PHASE11_APOLLO_READ_ENABLED` stays `false`.
- Contains no secret values. Supabase secrets are Key Vault references resolved by a managed identity.

## Runtime configuration

Injected at runtime only:

- `SUPABASE_URL` — Key Vault secret reference.
- `SUPABASE_SERVICE_ROLE_KEY` — Key Vault secret reference.
- `AUTOMATION_WORKER_HEALTH_PORT` — probe port (default `8080`).
- `AUTOMATION_WORKER_ID` — unique non-secret worker identity.
- `PHASE11_APOLLO_READ_ENABLED=false`.
- Optional bounded tuning (`AUTOMATION_WORKER_*`, `AUTOMATION_SCHEDULE_*`, `AUTOMATION_WORKER_DRAIN_GRACE_MS`).

## Health and lifecycle

- Liveness: `GET /live` on the health port.
- Readiness: `GET /ready` on the health port (200 only after durable compatibility and stale-lease recovery; 503 while draining).
- Ingress: disabled (background worker).
- Scale: `minReplicas: 1`, `maxReplicas: 1`. More replicas require a separate approved staging restart/scale/fairness rehearsal.
- Termination grace: derived as `AUTOMATION_WORKER_DRAIN_GRACE_MS / 1000 + 10` seconds, so ACA always allows the worker to finish draining (default worker drain grace is 30 seconds).

## Required GitHub configuration

The staging workflow uses the protected `staging` Environment and its existing `AZURE_STAGING_*` secrets plus `STAGING_*` variables. The production workflow uses the protected `jarvis-prime-api / production` Environment only:

Secrets: `AZURE_PRODUCTION_CLIENT_ID`, `AZURE_PRODUCTION_TENANT_ID`, `AZURE_PRODUCTION_SUBSCRIPTION_ID`.

Variables: `PRODUCTION_ACR_LOGIN_SERVER`, `PRODUCTION_ACR_NAME`, `PRODUCTION_RESOURCE_GROUP`, `PRODUCTION_WORKER_CONTAINER_APP`, `PRODUCTION_WORKER_IMAGE_REPOSITORY`.

The production workflow refuses a missing protected value, a staging-named production identifier, a non-lowercase-40 SHA, an API/worker SHA mismatch, the absence of a successful `04-deploy-azure-api.yml` deployment workflow for that exact SHA, or an ambiguous currently-ready ACA baseline. It checks out the requested SHA, verifies `git rev-parse HEAD`, records the existing ready worker revision/image, builds the root `Dockerfile`, tags `<acr>/<repository>:sha-<git_sha>`, and makes only `az containerapp update --image`. It then fails closed unless ACA reports the exact desired image as its latest ready revision within ten minutes. The summary records non-secret baseline and outcome evidence; it never performs automatic rollback, applies Bicep, or runs migrations.

## Production topology and pairing

`production.bicep` declares a separate, ingress-disabled worker with `activeRevisionsMode: 'Single'`, a production user-assigned identity, Key Vault references only for `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, `/live` and `/ready` probes, `minReplicas: 1`/`maxReplicas: 1`, and termination grace equal to drain grace plus ten seconds. `PHASE11_APOLLO_READ_ENABLED=false` is explicit and there are no provider credentials.

ACA does not have a repository-approved Bicep property for bounded restart/backoff, so this template intentionally does not invent one. Before provisioning, the production platform owner must bind ACA’s platform restart behavior to a bounded incident/alert policy as required by `phase11-worker-deployment-contract.md`.

For an artifact pair, the successful API deployment records its `github.sha` in the workflow summary. The worker dispatch must supply that exact value as both `api_release_sha` and `git_sha`; before Azure login, the workflow uses its read-only GitHub Actions permission to require a successful `04-deploy-azure-api.yml` run at that exact SHA. It then writes the verified pair to its protected workflow summary. Keep both successful workflow records with the release approval.

## Production prerequisites still requiring platform approval

1. Production ACR, ACA environment, region, compute size, image-retention policy, and Container App name.
2. Production user-assigned managed identity with only `AcrPull` and least-privilege Key Vault secret-read access.
3. Production Key Vault references for `supabase-url` and `supabase-service-role-key`; neither value belongs in Git, parameters, workflow logs, or this repository.
4. Production Log Analytics workspace customer ID plus its shared key supplied only as a secure provisioning input.
5. Protected GitHub Environment OIDC identity with only ACR push and Container App update rights, plus protected production resource variables.
6. Bounded restart/backoff and alert/on-call policy for failed probes, repeated exits, stale leases, and queue growth.
7. Recorded successful paired API/worker workflow summaries at the same reviewed SHA, a remote migration-ledger decision, and backup/restore ownership before any production authorization.

## One-time provisioning (human-approved, outside CI)

```sh
# Example only. Run against an approved environment with approved values.
az deployment group create \
  --resource-group <PRODUCTION_RESOURCE_GROUP> \
  --template-file infrastructure/aca/production.bicep \
  --parameters @infrastructure/aca/production.parameters.json \
  --parameters logAnalyticsSharedKey=<secure-input> \
               workerImage=<acr>/<repo>:sha-<reviewed-sha>
```

This command is documentation only; this release bundle does not run it. After separately authorized provisioning, use the matching protected manual worker workflow.
