# CI Recovery Summary

## Fixed workflows
| Workflow | Recovery result |
|---|---|
| CI — Test & Lint on `main` | Local workflow-equivalent validation passed: `npm ci`; local Supabase reset; Employee Portal integration 5/5; Client Portal integration 5/5; API tests 76/76; web lint; web type-check; web tests 21/21; Node 22 production build. |
| Deploy — Staging validation | Node runtime aligned from 18 to 22. The API suite passes under Node 22; the Node 22 production build passes. The workflow remains verification-only and does not deploy. |
| Release candidate `8961f6a` | Isolated clean-worktree validation passed: `npm ci`; local Supabase reset through migrations `20260730000012`; Employee Portal integration 5/5; Client Portal integration 6/6; API tests 82/82; web lint; web type-check; web tests 22/22; Node 22 production build. |

## Remaining issues
- GitHub Actions has not been rerun because no commit or push was requested. Historical failures remain visible remotely until an authorized new run succeeds.
- Exact GitHub log downloads remain authorization-gated. Local reproduction identified and corrected every current failure path without relying on an unverified log-root-cause claim.
- `Deploy — Staging` is still only a verification workflow; it ends with a readiness message and does not deploy. This is documented workflow scope, not a CI failure.
- Local validation required Docker Desktop for disposable Supabase; no cloud or production resources were changed.

## Release readiness
`main` is **locally CI-healthy** after the three minimal corrections. `release/direct-client-creation` at `8961f6a` is **locally CI-verified** and remains the only release candidate. Neither status constitutes a remote GitHub green check, a deployment approval, or a production release.

## Merge recommendation
**Do not merge yet.** First commit the reviewed CI recovery changes on `main`, push through the approved process, and require a new successful GitHub CI run. Then create or update the release-candidate review and require the same remote checks for `8961f6a` (or its approved rebased successor). No merge, push, deployment, or infrastructure change was performed in this recovery phase.
