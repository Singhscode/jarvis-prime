# Direct Client Release Synchronization Report

**Synchronized release head:** `a7ed7440bc8f6818c55cc24413ee16ae12daf34e`  
**Merged main parent:** `cfd6da0b35557facbf89a8f5aa225fbdb75679cb`

## Conflict resolution
`release/direct-client-creation` was updated with a normal merge commit; no rebase, history rewrite, merge to `main`, deployment, or infrastructure change occurred. The sole conflict was `apps/api/integration/client-portal.postgres.integration.js`.

The resolution retains Direct Client Creation integration coverage and the CI-recovery intent: scoped service-role cleanup, explicit `resend` audit selection, valid expired-invitation timestamps, and released failure savepoints. The release version uses a savepoint-scoped `SET ROLE` helper that resets the role after success and rolls back on failure, preserving isolation more strongly than the older helper. The release-only direct/converted Client ID test remains intact. The non-conflicting main CI recovery changes—including Node 22 staging verification and the current dashboard safe-network assertion—were merged unchanged.

## Migration verification
- `main` ended at `20260718000010` because its source branch does not contain the Direct Client release commits; it is not a missing-file checkout defect.
- The synchronized release contains the complete forward-version set that the linked remote reports: `20260723000011`, `20260723000012`, `20260723000013`, `20260730000011`, and `20260730000012`.
- A read-only `supabase migration list` confirms every local release migration version matches the linked remote. No forward migration file is missing locally or on the release branch.
- A verified historic-upgrade risk remains: release rewrites already-versioned `20260715000003_create_leads.sql`, while `20260723000011` and `...12` validate its revised prerequisites. A populated database created from the original `main` migration can fail those protective guards. No migration was modified in this phase; a separately approved, data-safe upgrade/reconciliation design, duplicate-email preflight, backup/rollback decision, and staging rehearsal remain required before production database work.

## Local validation
| Check | Result |
|---|---|
| Local Supabase reset through `20260730000012` | PASS |
| Employee Portal PostgreSQL integration | PASS — 5/5 |
| Client Portal PostgreSQL integration, including direct/converted client IDs | PASS — 6/6 |
| API test suite | PASS — 82/82 |
| Web lint | PASS |
| Web type-check | PASS |
| Web tests | PASS — 22/22 |
| Web production build | PASS |
| Diagnostics and `git diff --check` | PASS |

## Branch state and readiness
The synchronized release branch was pushed normally to `origin/release/direct-client-creation`. It is **0 behind / 3 ahead** of `origin/main`; the remote source head is `a7ed7440bc8f6818c55cc24413ee16ae12daf34e`.

**READY TO OPEN PULL REQUEST** — the branch is conflict-free and locally fully validated. This is not merge or deployment approval: the PR must still receive natural GitHub CI, configured repository approvals/protection checks, and human migration compatibility review. Production deployment remains blocked by the historic-upgrade migration gate.
