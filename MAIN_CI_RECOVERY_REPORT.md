# Main CI Recovery Report

**Scope:** Local reproduction of current `main` (`a6511b0`) against the committed GitHub workflow definitions. No GitHub logs, push, merge, deployment, remote-database mutation, or production change was performed.

## Reproduced failures and fixes
| Workflow / failed job | Failed step | Exact local root cause | Minimal fix | Risk |
|---|---|---|---|---|
| CI — Test & Lint / `test-site` | `npm run test --workspace=apps/web` | `dashboard.test.tsx` asserted a retired backend-not-running message. `OwnerSessionBoundary` intentionally renders the current generic network/CORS guidance for `TypeError` fetch failures. | Update only the stale assertion to the component’s current safe message. | Low: test-contract alignment; no runtime behavior changed. |
| CI — Test & Lint / `test-engine` | Combined local-Supabase integration command reported by GitHub as beginning at `eval "$(supabase ... status -o env)"` | `eval` succeeds once local Supabase is available. The Client Portal integration helper left `SET LOCAL ROLE service_role` active for the test transaction; later fixture/assertion reads then lacked invitation-table privileges. It also relied on tied audit timestamps and created an expiry fixture violating `expires_at > created_at`. | Scope the test helper back to the session role after successful service-only calls; select the explicit resend audit action; make the expired fixture satisfy the database constraint. | Low: test isolation/determinism only; no privilege grant or schema change. |
| Deploy — Staging / `deploy-staging` | `npm run test --workspace=apps/api` | Reproduced under Node 18: the installed Supabase Realtime client rejects Node 18 because native WebSocket support is unavailable and requires Node 22+. Node 22 passes all 76 API tests. | Change the staging setup action from Node 18 to Node 22, matching CI and supported workspace runtime. | Low: supported runtime alignment; no application logic change. |

## Local reproduction evidence
- `npm ci` passed with npm 11.12.1.
- A local Supabase reset applied all `main` migrations. Docker Desktop was initially unavailable locally; after starting the local prerequisite, the workflow reset and `supabase status -o env` completed. This was an environment prerequisite, not a repository failure.
- Employee Portal PostgreSQL integration: 5/5 passed.
- Client Portal PostgreSQL integration: 5/5 passed after the test-only correction.
- API unit/integration suite: 76/76 passed.
- Web lint and type-check passed; Vitest: 21/21 passed.
- Node 22 production build passed.
- Workflow YAML for all three committed workflow files parsed successfully; diagnostics and `git diff --check` passed.

## Files changed
- `.github/workflows/02-deploy-staging.yml` — Node 18 → Node 22.
- `apps/web/src/app/dashboard/dashboard.test.tsx` — stale safe-error assertion corrected.
- `apps/api/integration/client-portal.postgres.integration.js` — service-role scope and deterministic fixture/assertion corrections.

## Remaining verification boundary
GitHub’s historic logs remain unavailable without authorized access, but all reported failure paths were reproduced or isolated locally. `main` is locally healthy; its GitHub status remains historical/red until these changes are committed, pushed, and a new remote run completes. That remote action is intentionally outside this task.
