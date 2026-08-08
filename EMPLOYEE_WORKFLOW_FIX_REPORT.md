# Employee Workflow Fix Report

## Root cause
The valid invitation path was:

`OwnerEmployeeInvitationDialog` → `POST /api/owner-workspace/employees` → JWT authentication and Owner authorization → owner-keyed rate limiter → invitation validation → `createEmployeeInvitation` → `create_owner_employee_invitation` RPC → transactional email delivery → delivery-status RPC → HTTP response.

The PostgreSQL creation RPC completed first, persisting the Owner-scoped pending employee, 24-hour expiry, hashed setup token, password-reset record, and create audit event. The release-blocking HTTP 500 came from the following post-RPC delivery operations being outside effective exception handling:

- transactional email provider acquisition/initialization occurred before `sendTransactionalEmail` entered its `try/catch`;
- activation URL construction occurred before the service handled delivery failure.

Either exception escaped to Express as `INTERNAL_ERROR` after the invitation had already been persisted. Provider acquisition and the complete delivery-setup segment are now safely handled. A failure is recorded through the existing Owner-scoped delivery RPC as `failed`, producing its existing failed audit event and controlled `EMPLOYEE_INVITATION_DELIVERY_FAILED` response instead of a raw HTTP 500. Successful delivery retains the existing `201` response contract.

## Employee business identifier
No approved persisted human-readable employee identifier existed. Internal user and invitation UUIDs were not reused or exposed as business IDs.

One forward-only migration was added: `database/supabase/migrations/20260807000015_add_employee_business_identifier.sql`.

It adds and backfills stable `JP-EMP-000001`-style `employee_code` values, enforces format and uniqueness, and updates the existing invitation creation/resend RPCs to return the database-generated value. The browser never generates the identifier. Existing UUID routing and ownership checks remain unchanged.

## Files changed
- `apps/api/src/integrations/email-sender.js`
- `apps/api/src/modules/owner-workspace/owner-workspace.repository.js`
- `apps/api/src/modules/owner-workspace/owner-workspace.service.js`
- `apps/api/test/owner-workspace.test.js`
- `apps/web/src/app/dashboard/components/OwnerEmployeeInvitationDialog.tsx`
- `apps/web/src/app/dashboard/components/OwnerEmployeesWorkspace.tsx`
- `apps/web/src/app/dashboard/lib/owner-contracts.ts`
- `apps/web/src/app/dashboard/employees.test.tsx`
- `database/supabase/migrations/20260807000015_add_employee_business_identifier.sql`

## Preserved controls
JWT-subject-derived Owner scope, Owner authorization, RLS boundaries, service-role-only RPC access, validation, 24-hour expiry, setup-token hashing, invitation lifecycle, duplicate handling, owner-keyed rate limiting, and create/delivery/resend/accept audit behavior remain intact. No credential, token, hash, invitation UUID, raw database error, or provider detail was added to responses.

## Validation
- Focused invitation/employee API tests: passed.
- Focused employee UI tests: 4/4 passed.
- Duplicate invitation, authorization, validation, response redaction, failed-delivery audit payload, Employee ID generation/response, list rendering, and forward-only migration assertions: passed.
- `npm run lint`: passed.
- `npm run type-check --workspace=apps/web`: passed.
- `npm run test`: passed (API 90/90, web 26/26, ICP scorer 16/16).
- `npm run build`: passed.
- `git diff --check`: passed.

## Remaining limitations
The new migration was source-checked and regression-tested but was not applied to any remote or production database. It must run through the approved migration process before deploying code that selects `employee_code`. No live production/Railway smoke test was performed.

No commit, merge, push, deployment, remote access, or unrelated-file cleanup was performed.
