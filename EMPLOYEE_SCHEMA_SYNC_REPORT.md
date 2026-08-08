# Employee Schema Synchronization Report

## Scope
This investigation used only the existing local Supabase PostgreSQL container. No remote database, deployment, provider, credential file, or production resource was accessed or modified.

## Verified root cause
The verified local database was behind the repository migration state: neither Owner Employee migration was recorded, the required `users` columns were absent, and the employee invitation RPCs did not exist. This is a missing/unexecuted local migration condition, not a migration applied to the wrong table.

The current repository no longer issues the reported read projection. `listOwnerEmployees` and `getOwnerEmployee` select `id,employee_code,full_name,email`. The tracked pre-fix projection selected `id,full_name,email,department,phone,status`, which is the exact query shape consistent with `column users.department does not exist` against the pre-migration schema.

A remote/deployed runtime was deliberately not inspected, so this report does not claim the remote target's migration state, deployment artifact, or runtime connection configuration.

## Evidence collected
- The existing local container `supabase_db_jarvis-prime` was restarted without a reset; it became healthy.
- Before repair, read-only catalog queries found zero rows for versions `20260805000014` and `20260807000015`.
- Before repair, `public.users` lacked `department`, `phone`, `employee_code`, and `employee_id`; the employee invitation RPCs were absent.
- Repository source confirms `20260805000014` adds `department`, `phone`, invitation/automation tables, RLS, and employee invitation RPCs.
- Repository source confirms `20260807000015` adds the server-generated `employee_code` and replaces the invitation/resend RPCs to return it.

## Local migration history after repair
`supabase migration up --local` applied exactly the existing forward-only migrations:

| Version | Recorded count |
| --- | ---: |
| `20260805000014` | 1 |
| `20260807000015` | 1 |

## Local `public.users` schema after repair
- Present: `department` (`text`), `phone` (`text`), `employee_code` (`text`), `portal_owner_user_id` (`uuid`), plus expected `id`, `email`, `email_normalized`, `full_name`, `status`, `role`, `failed_login_attempts`, `email_verified_at`, and `updated_at`.
- Absent: `employee_id`. This is expected: internal identity remains `users.id`, while the persisted, human-readable Employee ID is `users.employee_code` (`JP-EMP-…`).
- Present: `employee_invitations`, `owner_automation_runs`, and `employee_business_id_seq`; RLS is enabled on both workflow tables.
- Present: `create_owner_employee_invitation`, `record_owner_employee_invitation_delivery`, `prepare_owner_employee_invitation_resend`, and `activate_pending_employee_invitation` with the expected signatures.

## Fix performed
Applied the existing local forward-only migration chain with `supabase migration up --local`. No migration was edited or duplicated, and no reset was run.

## Configuration evidence
Source configuration constructs the database client only from `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; its HTTP startup validation requires both. Environment values and secret files were intentionally not read, so a running API process's target URL cannot be asserted from this investigation. No production configuration was consulted.

## Re-verification and validation
- API contract tests cover Owner-scoped employee list reads, a valid invitation returning HTTP 201, Employee ID response fields, authorization, validation, rate limiting, audit behavior, and migration compatibility: 90/90 passed.
- Web tests cover employee list rendering, Invite Employee dialog submission, and immediate Employee ID display: 26/26 passed.
- `npm run lint`: passed.
- `npm run type-check --workspace=apps/web`: passed.
- `npm run test`: passed (API 90/90, Web 26/26, ICP scorer 16/16).
- `npm run build`: passed.

No live remote or production smoke test was performed; the reported local schema mismatch is repaired and verified through read-only catalog queries plus the project test suite.
