# Phase 11 Automation Worker — Staging Azure Container Apps

This directory holds the **staging-only** infrastructure definition for running the
separately supervised Phase 11 automation worker on Azure Container Apps (ACA).

The API continues to run unchanged on Azure App Service. The worker is a distinct,
ingress-disabled ACA workload and must never be co-hosted inside the API process.

## Artifacts

| File | Purpose |
| --- | --- |
| `../../Dockerfile` | Root-context OCI image for the worker (`npm run worker:automation --workspace=apps/api`). |
| `../../.dockerignore` | Keeps secrets, caches, tests, and unrelated files out of the build context. |
| `../../.github/workflows/06-deploy-aca-staging.yml` | Manual staging deploy: build image from a reviewed SHA, push to staging ACR, update the staging worker Container App image only. |
| `staging.bicep` | Declarative staging ACA environment + worker Container App. |
| `staging.parameters.json` | Non-secret staging placeholders. No secret values. |

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

## Required GitHub configuration (staging Environment)

Secrets:

- `AZURE_STAGING_CLIENT_ID`
- `AZURE_STAGING_TENANT_ID`
- `AZURE_STAGING_SUBSCRIPTION_ID`

Variables:

- `STAGING_ACR_LOGIN_SERVER`
- `STAGING_ACR_NAME`
- `STAGING_RESOURCE_GROUP`
- `STAGING_WORKER_CONTAINER_APP`
- `STAGING_WORKER_IMAGE_REPOSITORY`

The workflow fails fast if any are missing and refuses values that look like production.

## Human decisions still required (HUMAN DECISION REQUIRED)

1. Staging ACR, ACA environment, region, compute size, and image-retention policy.
2. User-assigned managed identity, its ACR pull role, and its least-privilege Key Vault secret-read access.
3. Staging Key Vault and the two Supabase secret entries (`supabase-url`, `supabase-service-role-key`).
4. Log Analytics workspace (customer ID + shared key provided as a secure deploy input, never committed).
5. Alert thresholds and on-call ownership for probe failures, restarts, stale leases, and queue growth — not defined here.
6. Staging Supabase project + migration-ledger and backup/restore confirmation before the worker connects.

## One-time provisioning (human-approved, outside CI)

```sh
# Example only. Run against a STAGING resource group with approved values.
az deployment group create \
  --resource-group <STAGING_RESOURCE_GROUP> \
  --template-file infrastructure/aca/staging.bicep \
  --parameters @infrastructure/aca/staging.parameters.json \
  --parameters logAnalyticsSharedKey=<secure-input> \
               workerImage=<acr>/<repo>:sha-<reviewed-sha>
```

Then deploy new images via the `06-deploy-aca-staging.yml` workflow.
