# Production Migration Rehearsal Report

## Final Decision: NO-GO

A disposable local Supabase rehearsal completed successfully for fresh installation, original-main upgrade, migration idempotency, schema/RLS/ACL checks, and direct database functional checks. However, the required application-level PostgreSQL integration suites were not executed against the disposable stack. The repository integration configuration could not be safely reused without inspecting or redirecting environment credentials, which could risk a remote connection. Under the approval rule, incomplete integration verification requires **NO-GO**.

## 1. Docker and isolation status
- Docker Engine verified healthy: `29.6.2`; no pre-existing containers were running before rehearsal.
- Supabase CLI verified: `2.109.1`.
- Rehearsals used two uniquely named, temporary local Supabase projects: a fresh-install workdir and a detached worktree at the original `main` base commit `cfd6da0b35557facbf89a8f5aa225fbdb75679cb`.
- Both temporary stacks were stopped and the temporary workdirs/worktree removed. No remote database, staging, preview, or production infrastructure was contacted.

## 2. Fresh-install results
- `supabase start` applied the complete ordered chain of 19 migrations through `20260805000014` with no migration error.
- `migration list --local` showed every expected version once, from `20260715000000` through `20260805000014`.
- A second `db reset --local` successfully reapplied the full chain, confirming clean fresh-install repeatability.

## 3. Original-history upgrade results
- The original-main database was created from the exact base history through `20260718000010` (11 migrations).
- Only the approved forward migration files were then added to the disposable worktree. `migration up --local` applied the bridge, reconciliation, cleanup, Direct Client, and Owner Workspace migrations in chronological order.
- The resulting history contained all 19 versions once. A second `migration up --local` reported the database up to date; no duplicate migration execution or ordering failure occurred.

## 4. Forward-only reconciliation and rollback safety
- `20260722000011_prepare_original_main_legacy_leads`, `20260723000011`–`13`, and `20260730000013_cleanup_leads_bridge_unique_index` all applied successfully in the original-history upgrade.
- No historical source migration was edited during rehearsal. The tested rollback posture remains forward-only: application rollback plus an approved compensating migration after backup/PITR and migration-record review; never rewrite applied migration history.

## 5. Schema, RLS, and ACL verification
- `supabase db lint --local` passed for both fresh and upgraded schemas.
- Verified migration-specific tables, columns, indexes, unique constraints, check constraints, foreign keys, and functions. This included `employee_invitations`, `owner_automation_runs`, employee contact/ownership columns, invitation/automation indexes, and owner/idempotency uniqueness.
- Verified all eight Owner invitation/automation RPCs exist. Both new tables have RLS enabled; table ACLs grant only the service role required privileges; new RPC ACLs showed execution only for the database owner and `service_role`.

## 6. Functional and integrity verification
- Fresh and upgraded schemas both verified: invitation create, resend on the same invitation row, token rotation, pending employee activation, invitation acceptance, idempotent second acceptance, and Owner-attributed `create`, `resend`, and `accept` audit events.
- Direct Client insertion generated `JP-CLI-000001`; duplicate owner/email insertion was rejected by `crm_clients_owner_email_unique_idx`.
- Automation run creation, atomic claim, completion, persisted result, three safe status logs, and request/complete audit events passed.
- Functional checks used only disposable test records and confirmed one invitation per employee, correct foreign-key relationships, and no duplicate Direct Client record.

## 7. Application tests and remaining risks
- Passed in this session: `npm run lint`; `npm run type-check --workspace=apps/web`; `npm run test` (API 87/87, web 26/26, ICP scorer 16/16); `npm run build`; `git diff --check`.
- The standalone PostgreSQL integration files for Client Portal and Employee Portal, plus a live API Owner Workspace flow, were **not run** against the disposable stack. They remain required before production approval.
- Existing remote migration-record mismatch, backup/PITR evidence, deployment approval, production runtime smoke tests, and the documented non-durable in-memory automation queue remain outside this local rehearsal and are production blockers.

## Production recommendation
**NO-GO.** Re-run the isolated local rehearsal with safely injected local-only application configuration and execute the Client Portal, Employee Portal, and Owner Workspace PostgreSQL integration suites. Then obtain the pre-existing migration-record, backup/PITR, queue, review, and deployment evidence before requesting production migration approval.
