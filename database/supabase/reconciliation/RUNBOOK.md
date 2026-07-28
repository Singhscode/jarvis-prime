# Production reconciliation execution runbook — AWAITING EXPLICIT PRODUCTION APPROVAL

This document prepares a controlled change only. It does not authorize production execution.

## Control record
- Operator: Anuj Singh (Founder & CEO)
- Reviewer: Anuj Singh (Founder & CEO)
- Approver: Anuj Singh (Founder & CEO)
- Recovery Owner: Anuj Singh (Founder & CEO)
- Maintenance window (UTC): `[SCHEDULE REQUIRED — start]` to `[SCHEDULE REQUIRED — end]`
- Local timezone: Asia/Kolkata (IST, UTC+05:30)
- Production project: `fytnwpnnvqecjmyhrzcx`
- Expected PostgreSQL: major version 17 (captured production version 17.6.1.121)
- Expected legacy rows: `public.leads=0`, `public.outreach_log=0`
- Expected legacy fingerprint: `5917ae71c2ce1f9a80bbf3d5983afbb0`
- Production Change Record: `PRODUCTION_CHANGE_RECORD.md`

> JARVIS PRIME is currently operated by a single founder. Until an engineering operations team is established, the responsibilities of Operator, Reviewer, Approver, and Recovery Owner are assigned to the founder. This is an intentional and documented temporary governance model and will be separated as the company grows.

This founder-led assignment is the approved early-stage governance model and is not a release blocker. Anuj Singh records each approval/checklist action separately with a UTC timestamp in the execution evidence. Keep database credentials only in the approved secret manager/environment; never paste them into evidence or shell history.

## Maintenance window
- UTC start: `[SCHEDULE REQUIRED — YYYY-MM-DD HH:MM UTC]`
- UTC end: `[SCHEDULE REQUIRED — YYYY-MM-DD HH:MM UTC]`
- Local timezone: Asia/Kolkata (IST, UTC+05:30)
- Expected migration duration: up to 10 minutes
- Expected verification duration: 20 minutes
- Expected total maintenance duration: 45 minutes, including gates and contingency

Only the schedule remains intentionally unset. Record the final UTC and IST times in this runbook and the Production Change Record before activating the freeze.

## Required artifacts and checksum gate
- Backup archive: `backups/production/fytnwpnnvqecjmyhrzcx/20260723T135351Z/jarvis-prime-production-manual-backup-20260723T135351Z.tar.gz`
- Expected backup SHA-256: `e68a74d70b6c06a1677d8d7eaa29d3619a59c6aeb09c5cfa5b96d03562bf3ea7`
- Package manifest: `database/supabase/reconciliation/PACKAGE_SHA256SUMS.txt`
- Successful rehearsal: `database/supabase/reconciliation/evidence/20260723T182326Z/`

From repository root, before the window:
```sh
printf '%s  %s\n' 'e68a74d70b6c06a1677d8d7eaa29d3619a59c6aeb09c5cfa5b96d03562bf3ea7' \
  'backups/production/fytnwpnnvqecjmyhrzcx/20260723T135351Z/jarvis-prime-production-manual-backup-20260723T135351Z.tar.gz' | shasum -a 256 -c -
shasum -a 256 -c database/supabase/reconciliation/PACKAGE_SHA256SUMS.txt
test "$(supabase --version)" = '2.109.1'
database/supabase/reconciliation/rehearse_pg17.sh
```
Stop if any checksum or rehearsal differs. Never use a backup until it has first been restored and validated in an isolated target.

## Write freeze and evidence setup
1. Approver announces the write/deploy freeze. No application deploy, scheduler, outreach, schema change, credential change, or manual database write may overlap.
2. Keep `DRY_RUN=true` and the scheduler disabled.
3. Capture UTC start time, operator/reviewer/approver identities, repository commit, package manifest, backup verification, and preflight output in a new restricted evidence directory.
4. Export the production database URL into the approved ephemeral environment as `PRODUCTION_DATABASE_URL`; do not echo it. Verify its host/project identity out-of-band against `fytnwpnnvqecjmyhrzcx`.
5. Require Supabase CLI `2.109.1`. Use `psql --no-psqlrc --set ON_ERROR_STOP=1` for standalone gates and `supabase db push --db-url "$PRODUCTION_DATABASE_URL"` for versioned migrations. Never rely on ambient linked-project state.
6. Before containment, capture and have both operator and reviewer sign the exact dry-run migration plan. Stop unless it contains only the 14 expected files in order. The isolated rehearsal validates SQL/order/history expectations; this dry-run validates production-runner discovery against the same target that passes preflight.

## Exact controlled sequence
Run only after a separate explicit production approval:
```sh
psql "$PRODUCTION_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 \
  --set expected_leads_rows=0 --set expected_outreach_rows=0 \
  --set expected_schema_fingerprint=5917ae71c2ce1f9a80bbf3d5983afbb0 \
  --file database/supabase/reconciliation/00_read_only_preflight.sql
supabase db push --db-url "$PRODUCTION_DATABASE_URL" --workdir database \
  --include-all --dry-run
psql "$PRODUCTION_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 \
  --file database/supabase/reconciliation/01_contain_browser_access.sql
supabase db push --db-url "$PRODUCTION_DATABASE_URL" --workdir database \
  --include-all --yes
psql "$PRODUCTION_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 \
  --set expected_leads_rows=0 --set expected_outreach_rows=0 \
  --file database/supabase/reconciliation/05_verify_pg17.sql
```
Do not execute reconciliation mirrors `02`–`04` directly. Migrations `00011`–`00013` are their authoritative executable forms and must be applied/recorded by the migration runner.
## Expected migration evidence
The runner must apply exactly these versions, in order, and record each only after success:
1. `20260715000000`
2. `20260715000001`
3. `20260715000002`
4. `20260715000003`
5. `20260715000004`
6. `20260715000005`
7. `20260715000006`
8. `20260715000007`
9. `20260715000008`
10. `20260718000009`
11. `20260718000010`
12. `20260723000011`
13. `20260723000012`
14. `20260723000013`

Capture runner output and a read-only ordered query of migration versions. Never insert, delete, update, repair, or mark migration-history rows manually in production.

## Containment canary
Immediately after containment and before migrations, the operator and reviewer must confirm from captured output:
- `anon` and `authenticated` have no `public` schema usage/create, table grants, function execution, or default privileges.
- `service_role` has `USAGE` but not `CREATE` on `public`.
- Temporary service access is exactly `SELECT`, `INSERT`, `UPDATE` on `public.leads` plus `EXECUTE` on `handle_updated_at()`.
- `service_role` retains `BYPASSRLS`; all legacy public policies are gone.

Containment commits separately and intentionally. If a later step fails, the system remains server-only/restricted; do not restore broad browser grants.

## Stop conditions
Stop immediately on any of the following:
- Project, PostgreSQL major version, role, backup checksum, package checksum, row counts, migration history, schema fingerprint, table set, columns, defaults, constraints, indexes, triggers, functions, policies, grants, default ACLs, Storage baseline, or ownership differs.
- A lock wait reaches 5 seconds, a statement reaches its timeout, a connection drops, or any SQL/runner statement fails.
- A null/duplicate lead email, invalid/colliding index, partial reconciliation column set, missing dependency, unexpected owner, browser privilege, PUBLIC execution grant, or non-private bucket appears.
- Any lead/outreach row count or content hash changes, or `leads.notes`, its preservation comment, `outreach_log`, its FK/index/comment, or `leads_updated_at` is absent.
- The migration runner proposes anything other than the exact 14-version set above.

Never continue after a stop. Never rerun a non-idempotent migration blindly and never alter history to bypass a failure.

## Final database and application evidence
After `05_verify_pg17.sql` passes:
1. Capture schema-only dump, ordered migration versions, public table/column/constraint/index/trigger/function inventories, RLS/policies, direct grants, default ACLs, owners, function `prosecdef`/`proconfig`, Storage bucket metadata, and lead/outreach row counts.
2. Diff the schema against `BEFORE_AFTER_DIFF.md`; reviewer signs the diff.
3. Confirm `/health`, `/ready`, and `/health/deep` using approved non-secret evidence capture.
4. Run separately approved authenticated Owner, Employee, and Client smoke tests. Verify role/scope denial cases and exact CORS for `https://www.jarvisprime.me`.
5. Do not lift the freeze or declare Phase 8 Released/Frozen until all database and authenticated canaries pass.

## Go / No-Go checklist
GO requires every item: signed control record; explicit production approval; active freeze; verified backup/package; documented successful isolated restore test of the accepted backup; successful pinned PG17 rehearsal; pinned CLI; exact preflight; reviewed 14-file dry-run plan bound to the same database URL; containment canary; exact 14-version runner plan; final SQL verification; reviewed schema diff; `/ready` success; authenticated role/scope/security smoke success; evidence archived; recovery owner available.

NO-GO is any unchecked item, mismatch, timeout, error, unexpected data, security regression, missing reviewer, or unavailable isolated recovery target.

## Forward correction and recovery
- Failure before a migration commits: transaction rollback is automatic; stop and preserve evidence.
- Failure after containment: keep the restricted posture and freeze. Prepare a new reviewed forward-only correction; do not reintroduce broad browser access.
- Failure after one or more recorded migrations: retain successful history, diagnose from evidence, and create a new versioned corrective migration. Do not reset, delete objects to simulate rollback, or edit history.
- Invalid candidate index: inspect catalog state first. Remove/recreate it only through a separately reviewed forward migration.
- Missing server permission: add only repository-proven operations through a separately reviewed forward migration.
- Suspected integrity loss: stop traffic/writes, preserve logs and database state, and have the recovery owner restore the verified archive to an isolated target. Validate checksums, schema, row counts, authentication data, and application canaries there before seeking separate incident approval for any production recovery.

Forbidden recovery commands include `supabase db reset`, `npm run db:reset`, volume deletion/pruning, destructive Git operations, and manual production migration-history edits.

