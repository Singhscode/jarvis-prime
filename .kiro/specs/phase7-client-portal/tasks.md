# Implementation Plan: Phase 7 Client Portal

## Overview
This corrected plan implements the approved read-only Client Portal through one additive migration, focused additions inside the existing CRM module, a minimal route-local UI, and executable test/CI coverage. It preserves existing authentication implementation, JWT claims, HttpOnly refresh-cookie behavior, CRM routes, Employee Portal behavior, deployment, and infrastructure.

This document is planning only. No code, migration, dependency, API, authentication implementation, infrastructure, deployment, commit, tag, or push is authorized by this document.

## Tasks
The work remains blocked until explicit implementation authorization. It proceeds in four dependency-ordered waves: additive data boundary; CRM-module backend and CORS/email support; dedicated portal/UI; then executable validation and release checks.

## Task Dependency Graph
```json
{
  "waves": [
    { "wave": 1, "tasks": ["database-migration"], "dependsOn": [] },
    { "wave": 2, "tasks": ["crm-repository-service-routes", "cors", "transactional-invitation-email"], "dependsOn": ["database-migration"] },
    { "wave": 3, "tasks": ["client-frontend", "api-and-postgresql-tests", "frontend-test-harness"], "dependsOn": ["crm-repository-service-routes", "cors"] },
    { "wave": 4, "tasks": ["ci-regression-accessibility-and-acceptance-validation"], "dependsOn": ["client-frontend", "api-and-postgresql-tests", "frontend-test-harness"] }
  ]
}
```

## Notes
- The interactive `npm run employee:create` tool is not reused or modified by Phase 7.
- Client Members receive documents only; client uploads are excluded.
- The planned migration must not be applied to preserved local data, staging, or production without separate authorization.

## 1. Approved Architectural Decisions

### 1.1 Onboarding: Option B — existing active client accounts only
Phase 7 selects **Option B**: invitations are restricted to an already-existing, active `client`-role account whose normalized email matches the invited CRM contact.

This is the smallest maintainable solution because it:
- preserves the existing registration, verification, login, JWT, session, password, lockout, refresh, and logout implementation without adding an authentication endpoint or a second activation mechanism;
- binds the pending membership to one known active account at invitation creation, removing deferred account-creation and verification states from the invitation flow;
- keeps invitation redemption as a narrow, authenticated, atomic membership activation; and
- fails closed when a contact has no matching active `client` account.

The owner invitation operation verifies eligibility inside its atomic RPC. It creates no account, changes no account status or role, and returns a uniform owner-side ineligible/not-found result when the contact, ownership relation, or eligible account cannot be resolved. Invitation activation accepts only a valid JWT for that already-bound active account and never runs the normal active-membership resolver before activation.

### 1.2 Credentialed CORS
Credentialed browser access uses the existing bearer access token and the existing `HttpOnly` refresh cookie. The API must emit a concrete allowed origin, never `*`, whenever `Access-Control-Allow-Credentials: true` is present.

The implementation will retain `credentials: 'include'` for login, refresh, logout, and Client Portal requests and use the existing `CORS_ORIGINS` configuration surface with one exact allowlist per deployment environment:
- development: `http://localhost:3000` only;
- staging: the exact deployed staging web origin only, set during staging deployment configuration;
- production: `https://www.jarvisprime.me` only.

The CORS middleware will echo an origin only when it exactly matches that environment's configured allowlist, reject every other origin without a permissive CORS response, and reject wildcard CORS configuration whenever credentials are enabled. Existing `HttpOnly`, `Secure` in production, scoped `/api/auth`, and `SameSite` cookie behavior remains unchanged; frontend JavaScript never accesses the refresh cookie.

### 1.3 Executable testing and CI
Client Portal tests become explicit runnable targets, not a documentation-only strategy. API and local PostgreSQL integration coverage run independently from the existing Employee Portal integration target. Route-local frontend tests use an exact-pinned Vitest + jsdom and React Testing Library stack, configured only for the Client Portal route; no shared portal test framework is introduced.

## 2. Revised Implementation Plan

### Wave 1 — additive data boundary
1. Create one canonical additive migration for memberships, invitations, private document metadata, a private Storage bucket, required indexes, RLS, and lifecycle RPCs.
2. Preserve the approved membership and document-to-project model. The invitation RPC requires a matching active client account before creating a pending membership and binds the membership to that account.
3. Keep lifecycle operations atomic: invite/reissue, activation, membership revocation, and document publication with audit insertion.
4. Apply no destructive SQL, no reset, and no change to existing auth, CRM, Employee Portal, session, or refresh-token objects.

### Wave 2 — focused CRM-module backend
1. Extend only `crm.repository.js`, `crm.service.js`, and `crm.routes.js`; mount the dedicated `clientPortalRouter` in `app.js`.
2. Reuse one invitation lifecycle RPC for initial issuance and resend. Do not add duplicate owner/contact precheck repository methods; lifecycle RPCs validate owner, contact, account eligibility, membership, and invitation state while locked.
3. Add a minimal transactional invitation-email adapter using the existing provider abstraction. It sends no outreach unsubscribe footer and never returns or logs invitation-bearing body content.
4. Add the smallest safe multipart parser dependency, pinned to an exact version, for owner-side document publication only.
5. Configure credentialed CORS using explicit origin allowlists per environment; wildcard origins are invalid whenever credentials are enabled.

### Wave 3 — dedicated portal boundary and minimal UI
1. Add the three dedicated Client Portal endpoints and the five additive internal owner operations described below. Existing endpoint behavior remains unchanged.
2. Create only four route-local frontend files:
   - `client/page.tsx`
   - `client/activate/page.tsx`
   - `client/components/ClientSignIn.tsx`
   - `client/components/ClientWorkspace.tsx`
3. Keep project/task/document sections, refresh/logout controls, loading/error/empty states, and on-demand downloads inside `ClientWorkspace`; do not create separate top-navigation, list, document, or activation components.
4. Keep access token, invitation, signed URL, scope, and snapshot in transient memory only. Clear the snapshot and token state immediately after logout, refresh failure, membership failure, portal denial, protected-request failure, or authenticated-user change.

### Wave 4 — executable validation
1. Add focused API and PostgreSQL integration test targets.
2. Add route-local Client Portal frontend tests through the pinned harness.
3. Update CI to run all existing checks plus the new client integration and frontend test targets.
4. Complete regression, accessibility, diagnostics, and non-destructive migration validation before release consideration.

## 3. Revised File List

### Files to create
| File | Purpose |
|---|---|
| `database/supabase/migrations/20260718000010_create_client_portal.sql` | Additive membership, invitation, document metadata, private Storage, indexes, RLS, and service-role lifecycle RPCs. |
| `apps/api/test/client-portal.test.js` | Focused API/security/contract tests. |
| `apps/api/integration/client-portal.postgres.integration.js` | Disposable local PostgreSQL tests for lifecycle atomicity, privileges, and nondisclosure. |
| `apps/web/src/app/client/page.tsx` | In-memory Client Portal controller using existing login/refresh/logout transport. |
| `apps/web/src/app/client/activate/page.tsx` | Transient invitation capture, URL cleanup, and authenticated redemption for the existing active account. |
| `apps/web/src/app/client/components/ClientSignIn.tsx` | Accessible existing-login form. |
| `apps/web/src/app/client/components/ClientWorkspace.tsx` | Dashboard, refresh/logout controls, project/task/document sections, and all portal states. |
| `apps/web/src/app/client/**/*.test.tsx` | Route-local frontend behavior, accessibility, and state-clearing coverage; exact filenames follow the selected harness convention. |

### Files to modify
| File | Minimal change |
|---|---|
| `apps/api/src/modules/crm/crm.repository.js` | Add client membership, safe snapshot/document queries, RPC wrappers, and private Storage operations only. |
| `apps/api/src/modules/crm/crm.service.js` | Add scope resolution, snapshot, activation, download, owner lifecycle, publication, validation, and redaction logic. |
| `apps/api/src/modules/crm/crm.routes.js` | Export `clientPortalRouter`; add additive owner invitation/document routes. |
| `apps/api/src/app.js` | Mount `clientPortalRouter` and retain credentialed CORS wiring. |
| `apps/api/src/middleware/cors.js` | Reject wildcard configuration with credentialed requests and emit only explicitly allowlisted origins. |
| `apps/api/src/integrations/email-sender.js` or a colocated narrow adapter | Add transactional invitation delivery through the existing email provider, without marketing footer or body-return logging. |
| `apps/api/package.json` | Add exact-pinned multipart dependency and explicit Client Portal integration test target. |
| `apps/web/package.json` | Add an exact-pinned DOM-capable frontend test harness and test script. |
| `.github/workflows/01-test.yml` | Run the Client Portal PostgreSQL integration target and frontend test script in CI. |

No existing auth route, auth service, auth schema, Employee Portal file, existing CRM endpoint contract, deployment artifact, or infrastructure resource is modified outside the explicitly required CORS configuration.

## 4. Revised Database Summary
1. Create `client_portal_memberships` with the approved CRM client/contact relationship, normalized contact email, a bound existing active `users` account, pending/active/revoked status, lifecycle timestamps, and creator audit reference. The invitation RPC creates a pending membership only after locking and matching the contact to one active `client` account.
2. Create `client_portal_invitations` with a membership reference, hash-only token storage, expiry, consumed/revoked timestamps, and creator reference. Initial invitation and resend share one reissue RPC that revokes prior usable invitations.
3. Create `client_portal_documents` with approved client/project linkage, private bucket/path metadata, deliverable/report type, client-visibility/revocation state, title, and creator audit reference.
4. Create only the required indexes: partial unique active membership per user, partial unique usable invitation per membership, CRM project client-scope lookup, client-visible/non-revoked document lookup, and unique storage bucket/path metadata.
5. Enable RLS with no browser-facing policies. Only the API service role accesses portal tables and the private Storage bucket.
6. Add fixed-search-path, service-role-only RPCs for invitation reissue, invitation activation, membership revocation, and document publication with audit insertion.
7. Do not alter `users`, authentication tables, existing CRM tables, sessions, refresh tokens, existing RLS policies, or Employee Portal objects.

## 5. Revised API Summary

### Dedicated Client Portal API
| Endpoint | Authorization and behavior |
|---|---|
| `GET /api/client-portal` | Existing JWT + `client` role + exactly one active membership; returns only the safe snapshot. |
| `POST /api/client-portal/activate` | Existing JWT + `client` role + existing active account; **does not require active membership**. Atomically redeems only an invitation bound to that account. All invalid invitation states return one generic failure. |
| `GET /api/client-portal/documents/:documentId/download` | Existing JWT + `client` role + exactly one active membership; returns a 60-second URL only after combined client/document authorization. |

### Additive owner CRM operations
| Endpoint | Behavior |
|---|---|
| `POST /api/crm/clients/:clientId/portal-invitations` | Locates an owned contact, requires its existing active client account, then creates/reissues one invitation. |
| `POST /api/crm/clients/:clientId/portal-members/:membershipId/resend` | Reuses invitation reissue lifecycle logic. |
| `DELETE /api/crm/clients/:clientId/portal-members/:membershipId` | Atomically revokes membership and usable invitations. |
| `POST /api/crm/clients/:clientId/portal-documents` | Owner-only bounded private document publication. |
| `DELETE /api/crm/clients/:clientId/portal-documents/:documentId` | Revokes client visibility and future signing. |

All routes use the existing response envelope and `AppError` behavior. No existing endpoint is broadened. Browser-supplied client, owner, membership, account, project, task, document, or Storage identities are locators only, never authority.

## 6. Revised Testing Plan

### Backend targets
- Retain `npm run test --workspace=apps/api` for existing API coverage.
- Retain the existing Employee Portal PostgreSQL target unchanged.
- Add `npm run test:integration:client-portal --workspace=apps/api` for `apps/api/integration/client-portal.postgres.integration.js`.
- The Client Portal integration target uses disposable local/CI PostgreSQL data only and verifies migration upgrade behavior without resetting preserved developer data.

### Frontend approach
- Add one exact-pinned DOM-capable frontend test harness and its minimal required React testing dependencies in `apps/web/package.json`.
- Add a workspace test script, for example `npm run test --workspace=apps/web`.
- Keep Client Portal tests route-local under `apps/web/src/app/client/`; do not create shared portal testing utilities or a cross-portal state layer.
- Test existing-login use, refresh, one retry after `401`, activation URL cleanup, memory-only state, immediate state clearing, loading/error/empty states, on-demand document download, keyboard operation, focus, and accessible names.

### CI sequence
1. Install locked dependencies with `npm ci`.
2. Start and prepare disposable Supabase/ PostgreSQL CI services using the existing CI process.
3. Run the existing Employee Portal integration target.
4. Run the Client Portal integration target with the same non-secret CI environment injection pattern.
5. Run API unit tests.
6. Run web lint, type-check, Client Portal frontend tests, and production build.
7. Retain secret scanning and existing regression gates.

### Accessibility verification
- Automated route-local tests verify semantic controls, accessible names, visible-focus hooks, alert/error announcements, keyboard navigation, and empty/loading/error state accessibility.
- Manual release acceptance verifies supported mobile, tablet, and desktop layouts, keyboard navigation, and screen-reader behavior before production exposure. This manual check supplements—not replaces—the automated tests.

## 7. Revised Security Checklist
- [ ] Authentication implementation, JWT claims, sessions, refresh rotation, password policy, lockout, login, refresh, and logout remain unchanged.
- [ ] Invitations are limited to existing active `client` accounts matched to the CRM contact’s normalized email; no Phase 7 account creation, verification, status change, or role change occurs.
- [ ] Activation is authenticated and role-gated but bypasses active-membership resolution until its atomic membership creation succeeds.
- [ ] Every other protected Client Portal request resolves exactly one active membership from `req.user.sub` before returning data.
- [ ] `createClientScope`, headers, query parameters, request bodies, and browser-provided Storage keys never establish authorization.
- [ ] Every project, task, and document lookup combines its identifier with the resolved client scope.
- [ ] Invitation values are random, hash-only at rest, single-use, 24-hour, revoked on resend/revocation, redacted, and never returned or logged after their one delivery operation.
- [ ] The transactional invitation adapter uses the existing provider without a marketing footer or invitation-body return value.
- [ ] Credentialed CORS uses explicit environment-specific origins only; wildcard origins are prohibited with credentials.
- [ ] Refresh cookies remain `HttpOnly`, scoped to `/api/auth`, and `Secure` in production; frontend code never reads them.
- [ ] Storage is private; generated object paths and 60-second download URLs are issued only after current authorization.
- [ ] Client state is memory-only and is immediately cleared after logout, refresh failure, membership failure, portal denial, protected-request failure, or user change.
- [ ] Missing and inaccessible client resources return the same non-disclosing result; audit records exclude secrets and sensitive contents.

## 8. Final Implementation Estimate
| Workstream | Estimate |
|---|---:|
| Canonical additive migration, indexes, RLS, and RPCs | 280–360 lines |
| CRM repository/service/routes, app mount, CORS, and transactional sender adapter | 620–780 lines |
| Focused API and local PostgreSQL integration tests | 650–850 lines |
| Minimal route-local Client Portal UI | 330–440 lines |
| Exact-pinned multipart and frontend-test configuration plus route-local frontend tests | 220–330 lines |
| **Total** | **2,100–2,800 lines** |

## 9. Remaining Blockers
None. The three approved architectural blockers are resolved in this plan:
- onboarding uses Option B and makes no authentication implementation change;
- credentialed CORS is explicit, environment-specific, and never wildcarded; and
- backend, frontend, accessibility, and CI execution are concrete implementation tasks.

The operational constraint of Option B is intentional: a CRM contact must already have an active `client` account before an owner can issue a Phase 7 invitation. No code, migration, or configuration is authorized until explicit implementation approval.

**Phase 7 Implementation is approved to begin.**
