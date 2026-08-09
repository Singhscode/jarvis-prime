# Initial Owner Activation Implementation Report

**Date:** 2026-08-09
**Status:** Source implementation and required repository validation complete; corrected migration runtime rehearsal pending because local Docker is unavailable; production action not performed.

## Why this mechanism was required

The canonical `POST /api/auth/register` flow already created securely hashed accounts in `pending_verification`, but it did not issue or deliver an email-verification capability and there was no supported endpoint that could activate a newly registered client account. A pending account cannot log in, while Owner Workspace authorization requires an active `client` user with no `client_portal_memberships`. The implementation therefore adds only the missing registration-verification bridge and preserves normal login as the sole way to obtain a JWT and session.

## What was implemented

- Added one forward-only migration: `20260809000016_add_registration_email_verification.sql`.
- Added service-role repository wrappers for issuing and consuming registration verification hashes.
- Extended registration so only the exact server-configured `INITIAL_OWNER_EMAIL` can receive a 256-bit opaque activation token; all other public registrations remain `pending_verification` and receive no Owner activation capability.
- Bound both token issuance and token consumption to that normalized server-configured email in the service and database RPCs.
- Persisted only the token's SHA-256 hash and used a fragment-only `/activate#token=...` transactional email link.
- Added only `POST /api/auth/activate`, accepting exactly `{ "token": string }`.
- Added `/activate`, which reads the token from the URL fragment, immediately removes the fragment from browser history, posts the capability to the API, and returns generic failure text.
- Restricted password-reset invitation activation to `role === 'employee'`; resetting a pending client password no longer activates that client.
- Added focused API and web tests and included the new web test directory in Vitest.

## Security controls

- Tokens are generated with 32 cryptographically random bytes and represented as 43-character base64url capabilities.
- Only a lowercase 64-character SHA-256 hash is sent to PostgreSQL or persisted; plaintext tokens are used only transiently to construct the transactional email.
- Activation links use a URL fragment, so the capability is not sent in the initial HTTP request, query string, or normal referrer data. The page strips the fragment before calling the API.
- Token issuance and consumption require the database user's normalized email to equal the server-provided `INITIAL_OWNER_EMAIL`; a person registering an arbitrary email cannot self-provision Owner access.
- Activation is limited to five attempts per IP per 15-minute window using the existing process-local rate-limiter factory. This is enforced per API process, not across multiple replicas or restarts.
- The endpoint rejects extra fields and does not accept email, user ID, role, status, `owner_user_id`, permissions, or membership data.
- Invalid, malformed, expired, reused, wrong-state, non-client, suspended, deleted, and membership-bound capabilities receive the same public invalid/expired response.
- Database consumption locks the token and user rows, requires an unused unexpired token, requires `role='client'`, `status='pending_verification'`, no prior email verification, and no Client Portal membership.
- Successful consumption atomically marks the token verified, changes only the eligible user to `active`, sets `email_verified_at`, removes other unused verification tokens, and writes an `email.verified` audit event.
- Issuance writes `email.verification_issued` in the database transaction; delivery writes `email.verification_sent` with only delivery status and expiry metadata. No token, password, hash, or activation URL is placed in audit details.
- Both new `SECURITY DEFINER` functions set an empty search path, fully qualify objects, revoke execution from `PUBLIC`, `anon`, and `authenticated`, and grant execution only to `service_role`.
- Passwords continue through the existing Argon2id/scrypt hashing implementation. No plaintext password is stored or added to a migration.
- Activation issues no JWT, refresh token, cookie, or session. The user must log in normally after activation, preserving refresh rotation, logout, JWT claims, and session binding.
- Owner scope remains derived exclusively from authenticated JWT `sub`. The existing database-derived Owner predicate remains `client` + `active` + no Client Portal membership.
- Existing RLS, strict server-only service-role access, Client Portal boundaries, Employee Portal boundaries, routing, and TLS expectations were not weakened.

## Migration requirement

Exactly one new migration is required. No historical migration was edited. The migration adds a unique verification-token-hash index and two narrow service-only RPCs. An earlier revision was applied only to local Supabase; after the pre-commit review added the required `INITIAL_OWNER_EMAIL` database binding, Docker became unavailable, so the corrected migration has not yet received a fresh PostgreSQL execution rehearsal.

It has not been applied to any remote, staging, preview, or production database. Before commit/release, start disposable local Supabase and execute the corrected migration from the historical chain. Production must then use the normal reviewed forward-only migration pipeline; no reset, repair, direct SQL account mutation, or history rewrite is required or permitted.

## First permanent Owner activation procedure

After a later explicit production-action approval:

1. Confirm the migration and matching API/web release are deployed through normal controls.
2. Set server-only `INITIAL_OWNER_EMAIL` to the approved normalized Owner email. Confirm transactional email is configured and not in dry-run mode, `WEB_APP_URL` points to the HTTPS web origin, and `NEXT_PUBLIC_ENGINE_URL` points to the HTTPS API origin.
3. Securely supply the real Owner email and password at execution time. Do not put either in source, shell history, migrations, reports, or logs.
4. Safely check whether the normalized email already exists. If it exists, stop and report its state rather than creating a duplicate.
5. Register through the existing canonical registration flow. The caller supplies only normal registration fields; database defaults retain `role='client'` and `status='pending_verification'`.
6. Open the one-time email link. `/activate` strips the fragment and submits only the opaque capability to `POST /api/auth/activate`.
7. After successful activation, sign in normally at `/dashboard`. Normal login creates the session and JWT, whose `sub` remains the only Owner scope.
8. Verify only login, access-token issuance, refresh rotation, Owner bootstrap/dashboard access, and logout. Do not create unrelated production records.

## Why this is not an unrestricted backdoor

The public endpoint cannot select or look up an account: it accepts only an unguessable one-time capability, while the service and both database RPCs independently bind the operation to the exact server-configured `INITIAL_OWNER_EMAIL`. Ordinary public registrations receive no activation capability and remain pending. The endpoint cannot assign roles, owners, permissions, statuses, or memberships; it can perform one fixed transition only for the pre-authorized, already registered, pending, unverified client with no Client Portal membership. The database performs the authoritative checks and atomic transition. The endpoint cannot mint authentication artifacts, and its RPCs are unavailable to browser database roles. Reuse, expiry, disabled states, employee accounts, active accounts, portal-bound accounts, and non-authorized emails are denied. After successful bootstrap, `INITIAL_OWNER_EMAIL` should be removed so the endpoint fails closed.

## Production prerequisites and remaining limitation

- Explicit approval for the production migration, deployment, and later account-creation action.
- Reviewed backups/change controls and successful migration execution through the established release workflow.
- Correct server-only service-role configuration, strict TLS certificate verification, JWT secret, cookie settings, CORS/origin settings, and HTTPS URLs.
- A configured transactional email provider with verified sender/domain and successful delivery monitoring; production `DRY_RUN` must be false.
- The real Owner email must be configured server-side as `INITIAL_OWNER_EMAIL`; the same email and a strong password must be supplied through an approved secure mechanism, followed by a duplicate-account check and final execution summary.
- Remove `INITIAL_OWNER_EMAIL` after successful bootstrap so future activation attempts fail closed.
- The account must remain a standard `client`, become `active` only through capability consumption, and have no Client Portal membership.
- This minimal change intentionally adds no resend endpoint. If initial delivery fails, the account remains safely pending and the registration request fails generically; production bootstrap must not proceed until email delivery is confirmed. A separate reviewed recovery mechanism would be required for a stranded pending account rather than direct database activation.

## Validation results

- Focused API activation suite: **8/8 passed**, including a regression proving arbitrary public registration remains pending and receives no activation capability.
- Focused web activation suite: **2/2 passed**.
- The initial migration revision was previously applied through local migration `20260809000016`, and its common one-time/state controls passed rollback-only PostgreSQL rehearsals.
- The corrected email-bound migration source was not re-executed in PostgreSQL during the final review because local Docker was unavailable. Diagnostics and source-level migration assertions pass, but a fresh local migration execution remains required before commit/release.
- `npm run lint`: **passed**.
- `npm run type-check --workspace=apps/web`: **passed**.
- `npm run test`: **passed** — API 98 tests, web 28 tests, and ICP scorer 16 tests passed.
- `npm run build`: **passed**; Next.js built `/activate` successfully.
- `git diff --check`: **passed**.

## Files changed for this implementation

- `database/supabase/migrations/20260809000016_add_registration_email_verification.sql`
- `apps/api/src/modules/auth/repository.js`
- `apps/api/src/modules/auth/auth-service.js`
- `apps/api/src/modules/auth/auth.routes.js`
- `apps/api/test/auth-activation.test.js`
- `apps/web/src/app/activate/page.tsx`
- `apps/web/src/app/activate/page.test.tsx`
- `apps/web/vitest.config.ts`
- `INITIAL_OWNER_ACTIVATION_IMPLEMENTATION_REPORT.md`

## Safety confirmation

No production Owner account was created. No production/staging/preview credentials, service keys, database URLs, passwords, password hashes, cookies, or customer data were accessed or exposed. No remote database or infrastructure was contacted or modified. No deployment, commit, merge, push, migration repair, database reset, historical migration edit, Owner bootstrap rerun, or unrelated working-tree cleanup was performed. Existing unrelated changes, reports, generated artifacts, and the untracked root `supabase/` directory were preserved.
