# CI Failure Report

**Audit date:** 2026-08-04. GitHub REST returned 72 workflow runs: **50 failed** and 22 succeeded. Job/step metadata is public; GitHub denied unauthenticated log download with HTTP 403, so an underlying root cause is marked **unverified** unless the evidence proves it. No code or workflow was changed.

## Current production-branch blockers
| Run | Workflow / SHA | Failing job and step | Root-cause status | Required fix | Risk |
|---|---|---|---|---|---|
| `30479627854` | CI — Test & Lint / `a6511b0` | `test-site`: `npm run test --workspace=apps/web`; `test-engine`: `eval "$(supabase --workdir database status -o env)"` | Exact failure points verified; log-level cause unavailable | Obtain log access, reproduce the two failures, make only proven fixes, then rerun all CI jobs | Critical: current main has no passing CI evidence |
| `30479627812` | Deploy — Staging / `a6511b0` | `deploy-staging`: `npm run test --workspace=apps/api` | Exact failure point verified; log-level cause unavailable. Node 18 conflicts with declared `>=20.9.0`, but is not log-proven root cause | Run with supported Node version and diagnose the API test failure from authorized logs | High: main staging verification is red |

## Exact-tip failures on audited retained/historical refs
| Ref / run(s) | Verified failing job / step | Required action / risk |
|---|---|---|
| `release/phase8-owner-workspace` / `29827585738` | `test-engine` / Supabase status environment export | Historical merged branch; preserve evidence, do not use as release baseline; Medium |
| `release/phase8-documentation` / `29828726643`, `29828726633` | CI and staging failed; individual job data not retrieved | Historical ancestor; archive after main recovery; Low |
| `refactor/repository-cleanup` / `29685861250` | `test-engine` / Supabase status environment export | Historical merged branch; archive after retention check; Low |
| `refactor/enterprise-v2` / `29170439785` | `test-engine` and `test-site` / dependency installation | Historical merged branch; do not revive without fresh dependency lock validation; Low |
| `refactor/enterprise-architecture` / `29168347588` | `Site CI` / Node setup; `Engine CI` / tests | Divergent, conflict-heavy ref; investigate only in a separately approved migration; High if revived |
| `security/phase-1-foundation` / `29166744449` | Gitleaks, Node setup, and engine tests | Divergent, conflict-heavy ref; do not merge; obtain logs before any security migration; High if revived |
| `origin/refactor/monorepo-structure` / `29276339655`, `29277736372`, `29277736786` | CI installation failures; staging failure | Historical merged remote ref; archive after retention check; Low |

## Complete failure inventory from GitHub Actions metadata
- **Current/main CI:** `30479627854`, `29828726643`, `29827597586`, `29685867800`, `29280539749`, `29280013495`, `29277736372`, `29170447894`, `29170002590`, `29169535819`, `29168606479`, `29165535479`, `29100974383`, `29098550831`, `29096435893`, `29049960930`, `29049936399`.
- **Current/main staging:** `30479627812`, `29828726633`, `29827597609`, `29685867806`, `29642380895`, `29640091113`, `29421134653`, `29417406045`, `29404329319`, `29368502120`, `29280539716`, `29280013526`, `29277736786`, `29170447886`, `29170002588`, `29169535869`, `29168606457`, `29165535496`, `29100974349`, `29098551176`, `29096435954`, `29049961769`, `29049936382`.
- **Other branches:** phase8-owner `29827585738`; repository-cleanup `29685861250`; monorepo-structure `29276339655`, `29276212761`; enterprise-v2 `29170439785`, `29169993746`, `29169452432`; enterprise-architecture `29168347588`, `29168192509`; security-foundation `29166744449`.

## Verified workflow-quality gaps (not inferred failure causes)
| Gap | Evidence | Required correction before maintained-branch CI can be considered healthy |
|---|---|---|
| Missing maintained-branch coverage | `01-test.yml` triggers only for `main` and `develop`; no `develop` ref exists | Add an approved CI policy for release and active feature branches/PR heads |
| Runtime mismatch | Root `package.json` requires Node `>=20.9.0`; staging selects Node 18 | Align staging with the supported CI/runtime version after current failure diagnosis |
| Staging is not deployment | Workflow ends with an `echo` readiness message | Either rename it to verification or implement an approved deployment handoff with rollback controls |
| Production verification is incomplete | Tag/manual workflow runs API unit tests and web build only, then declares external deployment | Define required integration, migration, health, and deployment evidence before release approval |

## Manual evidence still required
1. Authenticate through an authorized GitHub mechanism and download the failing job logs; record the exact emitted errors without copying secrets.
2. Rerun CI against `a6511b0` after log-proven repairs, then rerun the full suite against `8961f6a` before its release decision.
3. Do not interpret historical red runs as current-code causes; all recorded failures predate the direct-client release except the two current-main runs.
