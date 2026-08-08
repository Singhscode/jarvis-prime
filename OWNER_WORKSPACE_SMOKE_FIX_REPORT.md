# Owner Workspace Smoke Fix Report

## Scope
All investigation, service restarts, database reads, and smoke actions used only `localhost` and the disposable local Supabase environment. No production, remote Supabase project, migration, deployment, commit, merge, push, or provider send occurred.

## Documents 500: root cause and resolution
The original API stderr was not persistently captured, so the historical exception text cannot be recovered honestly. It was not reproduced after local recovery: the exact page request, `GET /api/owner-workspace/documents?limit=20&sort=created_at:desc&visibility=all`, now returns `200 OK`.

Local evidence identifies a transient local PostgREST schema-cache readiness condition, not a source/schema defect:
- Every tracked migration through `20260807000015` is applied locally.
- `client_portal_documents`, its client/project foreign keys, service-role SELECT grant, private-bucket publication RPC, and RLS are present.
- Historical local PostgREST logs show an initial cache with zero relations followed by a successful cache reload with 32 relations and 28 relationships.
- The Owner-scoped Documents query, publication, list refresh, and audit lookup all succeed after that cache is ready.

No migration or Documents source change was required. The existing local PostgREST runtime recovered its schema cache; Storage was also started locally to exercise the separate private-PDF publication path.

## Tasks 400: confirmed root cause and fix
The task-specific `PATCH` received the displayed business identifier `JP-EMP-000001` as `assigned_user_id`. The existing backend correctly returned `400 VALIDATION_ERROR` because that field is required to be an internal UUID. UUID validation and Owner/project/active-employee checks remain unchanged.

The project detail workflow now loads the existing Owner-scoped employee list, displays `name (JP-EMP-…)`, submits only the selected internal UUID, and excludes `pending_verification` invitees. The safe employee `status` field is returned only to the Owner Workspace to make that eligibility explicit; password hashes, roles, portal-owner IDs, credentials, and tokens remain excluded.

## Refresh 401 determination
A valid local HttpOnly refresh cookie returns `200 OK` and issues an access token. The reported `401` is consistent with a stale or absent refresh cookie after local session recreation, not an authentication defect. No authentication, refresh rotation, cookie, rate-limit, or JWT code was changed.

## Files changed
- `apps/api/src/modules/owner-workspace/owner-workspace.repository.js`
- `apps/api/src/modules/owner-workspace/owner-workspace.service.js`
- `apps/api/test/owner-workspace.test.js`
- `apps/web/src/app/dashboard/lib/owner-contracts.ts`
- `apps/web/src/app/dashboard/components/OwnerProjectDetail.tsx`
- `apps/web/src/app/dashboard/projects.test.tsx`

## Database and local runtime actions
- No migration was created, edited, or applied.
- Restarted the local API process and started the existing local Supabase Storage container.
- Created local smoke-only project/task, pending dry-run employee invitation, and private PDF document. The invitation returned `201` with a generated `JP-EMP-…` identifier and was dry-run only; no email was sent.

## Local smoke verification
- `/dashboard`, login, refresh, Owner dashboard, Clients, Projects, Employees, Documents, Audit, and logout: `200 OK`.
- `JP-CLI-000001` is visible through the Owner client list.
- Project creation: `201`; task creation: `201`.
- Documents list: `200`; private test-PDF publish: `201`; the document appears in the list and its response contains no storage path, bucket, signed URL, or secret.
- Document metadata remains owner-scoped; a non-owned client filter returns `404 CLIENT_NOT_FOUND`.
- Audit includes the published-document event.
- A business ID sent directly to the task endpoint remains correctly rejected with `400 VALIDATION_ERROR`.

## Security invariants preserved
JWT-subject Owner scope, ownership checks, RLS, service-role-only storage/RPC controls, strict UUID validation, active-employee assignment enforcement, audit logging, redacted document metadata, Client Portal isolation, and authentication error semantics are unchanged.

## Validation
- Focused web projects test: 3/3 passed.
- Focused Owner Workspace API test: 6/6 passed.
- `npm run lint`, `npm run type-check --workspace=apps/web`, `npm run test` (API 90/90, Web 26/26, ICP scorer 16/16), and `npm run build`: passed.
- `git diff --check`: passed.

## Remaining blocker
The local Owner currently has zero active employees and two pending invitations, so assignment to an active employee cannot be live-tested until one invitee completes the existing activation flow. The UI now prevents selecting those pending accounts rather than producing a 400/404. No authorization bypass was used.
