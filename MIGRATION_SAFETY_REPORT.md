# Migration Safety Report — Direct Client Release

**Implementation:** `40b9601` on `release/direct-client-creation`  
**Decision:** Code-level original-history upgrade path validated locally. **Production deployment remains blocked** pending an authorized staging/production rehearsal and controlled handling of the linked project's two newly missing migration records.

## Historical schema differences
Original `20260715000003_create_leads.sql` created `leads.email text not null unique`, with no `notes`, `outreach_log`, or `leads_email_idx`. The rewritten source instead has plain non-null email, nullable `notes`, `outreach_log` (cascade FK, RLS, policy, and index), and a non-unique `leads_email_idx`. Existing `leads` columns, RLS, policy, trigger, and status/created indexes are otherwise unchanged.

`20260723000011` requires `notes`, `outreach_log`, its named cascade FK, and `outreach_lead_idx`. `...12` requires a non-unique `leads_email_idx` and no email unique constraint before it restores `leads_email_key`. An original-main database therefore stopped at those guards because its already-recorded historical migration would not be reapplied.

## Forward-only reconciliation strategy
Two new migrations were added; no historical migration was edited.
1. `20260722000011_prepare_original_main_legacy_leads.sql` recognizes original-main, pre-230 rewritten, and post-230 states. For original/pre-230 state it safely creates the missing compatibility objects, validates email data, creates a temporary unique bridge index plus the required non-unique legacy index, then removes only the original constraint. It is idempotent before `...12` and a verified no-op after `...12`.
2. `20260730000013_cleanup_leads_bridge_unique_index.sql` removes the temporary bridge index only after the canonical `leads_email_key` has been restored and the legacy index is absent.

The bridge uses transactional DDL, `postgres`-only checks, 5-second lock timeout, 120-second statement timeout, exact schema fingerprints, and fail-closed handling for unknown hybrid states. Uniqueness remains enforced throughout the migration sequence; null/duplicate lead emails abort before any constraint transition.

## Disposable production-like rehearsal evidence
- Reset a detached local worktree at original `main` (`cfd6da0`) through `20260718000010`.
- Seeded synthetic leads and pre-existing CRM clients; applied the bridge twice before release migrations, then applied `20260723000011`–`20260730000013` using local `db push`.
- Re-executed the bridge after `...12`; it was a no-op. Fresh current-release reset also passed.
- Verified all seven migration records, preserved seeded lead count/non-null/unique email data, final `leads_email_key`, no legacy/bridge index, outreach FK/index, RLS, removal of browser grants/policies, and service-role schema access.
- Upgraded-clone tests passed: Employee Portal integration **5/5**, Client Portal integration **6/6** (including direct/converted Client IDs and duplicate owner-email behavior), API suite **82/82**. SQL diagnostics and `git diff --check` passed.

## Linked-project boundary
Read-only migration metadata now shows remote has `20260723000011`–`20260730000012` but not new `20260722000011` or `20260730000013`. The bridge is designed to no-op against a verified post-230 schema, but its lower version must not be applied or history-repaired remotely without explicit authorization, a clone rehearsal, backup/PITR marker, and a reviewed Supabase migration-history plan. No remote database mutation occurred.

## Rollback and backup requirements
1. Before any production migration, capture backup/PITR, migration history, schema/ACL/policy manifest, row counts, and ordered lead ID/email hash.
2. If the bridge fails, its transaction rolls back; do not bypass guards or manually alter schema. Correct only a new forward migration after diagnosis.
3. Keep writes quiesced across the bridge and `...12`; retain the temporary unique index until the cleanup migration confirms final state.
4. If later DDL or ACL migration fails, preserve state, restore the approved ACL manifest or PITR when needed, and use reviewed forward remediation—never re-run non-idempotent Direct Client DDL blindly.

## Production recommendation
**Do not merge or deploy yet.** Require an authorized staging clone rehearsal using representative production data and caller inventory, explicit approval for the two remote-missing migration records, natural release PR CI, branch protections, and human migration sign-off. No production merge, deployment, infrastructure change, or historical migration rewrite was performed.
