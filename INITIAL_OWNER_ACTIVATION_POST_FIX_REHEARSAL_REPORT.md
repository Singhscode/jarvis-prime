# Initial Owner Activation Post-Fix Rehearsal Report

**Date:** 2026-08-09
**Scope:** local-only Docker/Supabase recovery and fresh PostgreSQL rehearsal for `20260809000016_add_registration_email_verification.sql`.

## A. Docker/environment diagnosis

- Both prior PostgreSQL containers had exit code `137`, but `OOMKilled=false`, no configured memory cap, clean PostgreSQL checkpoints, Docker VM memory of ~7.75 GiB, 611 GiB host disk free, and no Docker storage pressure.
- Multiple Supabase services across both local project stacks were terminated at the same periods. Evidence supports Docker Desktop/VM or host-level termination rather than a PostgreSQL database crash, OOM kill, or disk exhaustion.
- `supabase_db_jarvis-prime` restarted non-destructively and passed `pg_isready`; its volume was not deleted or reset.
- The preserved local database could not be proven disposable: it contained three users, including one non-test-pattern normalized email. It was therefore not reset.
- A separate temporary local Supabase project was created for the rehearsal, started from an empty database, then stopped non-destructively after testing. Its temporary configuration, SQL fixture, and migration symlink were removed; only harmless untracked Supabase CLI metadata remains under `database/.initial-owner-rehearsal/supabase/`. Its Docker volume was deliberately not deleted.

## B. Migration rehearsal result

**Passed.** The fresh temporary local Supabase startup applied the complete tracked chain through `20260809000016` with no failure. Schema lint reported no errors.

- Migration ledger: `total=21`, `distinct=21`, `20260809000016=1`.
- `supabase migration list --local` showed every tracked migration as applied exactly once.
- Corrected four-argument issue and three-argument consume RPC signatures exist.
- Execute is granted to `service_role` and denied to `anon`/`authenticated`.

## C. Activation security result

**Passed in rollback-only PostgreSQL fixtures.**

- Authorized-email issuance and activation returned `true`; resulting user was `client`, `active`, and email-verified.
- A different email was denied at issuance when the configured authorized email did not match.
- Expired, invalid, reused, and Client-Portal-member capabilities each returned `false`.
- The employee invitation RPC independently activated a pending employee and accepted its invitation.
- Activation created zero sessions and zero refresh tokens; the database activation RPC has no JWT, cookie, role, permission, or `owner_user_id` input/output path.
- Audit records for activation fixtures contained zero token, token-hash, password, or activation-link values.
- The focused activation test verified the existing five-attempt-per-IP/15-minute process-local rate limit; the full suite also passed the generic rate-limiter tests.
- Bootstrap prerequisite: `INITIAL_OWNER_EMAIL` must be supplied only in the server environment, match the intended bootstrap email, and be removed/unset after first activation so the mechanism fails closed.

## D. Application validation result

All passed:

- Targeted API activation, Owner Workspace, and Employee Portal tests: **46/46**.
- Targeted web activation tests: **5/5**.
- Cache-bypassed full suite: API **98**, web **28**, ICP scorer **16** tests passed.
- `npm run lint`, `npm run type-check --workspace=apps/web`, `npm run build`, and `git diff --check` passed.
- Owner Workspace tests confirm JWT-subject-derived scope; Client Portal and Employee Portal boundary suites passed unchanged.

## E. Remaining blockers

No Docker/PostgreSQL or corrected-migration blocker remains for local rehearsal. The implementation is commit-ready for the reviewed intended source changes, subject to a future explicit commit that excludes `LOCAL_OWNER_TEST_ACCOUNT_REPORT.md`, generated `apps/web/tsconfig.tsbuildinfo`, the untracked Supabase CLI metadata, and unrelated report deletions. The rate limiter remains intentionally process-local, so deployment-wide throttling would require separate infrastructure work and is not part of this task. No production account, remote Supabase, production credential, deployment, commit, push, merge, or migration edit occurred.
