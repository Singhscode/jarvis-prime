# Production Log Fix Report

## Scope
This report documents source and local validation for the reported Owner Workspace production-log defects. No remote database, Railway service, deployment, commit, merge, or push was accessed or performed.

## Root causes and corrections

### Generated Client ID passed as a UUID
`client_code` is a database-generated, display-only value such as `JP-CLI-000001`, defined by `20260730000011_add_direct_client_creation.sql`; it is not a UUID.

- `crm.service.createProject()` now validates `client_id` as a UUID before the owner-scoped ownership lookup or database operation. Display IDs are rejected with `VALIDATION_ERROR`; they are not cast or resolved as UUIDs.
- The New Project dialog now loads Owner-scoped clients from the existing clients endpoint. Its selector displays `name (JP-CLI-…)` and submits the underlying client UUID.

### Employee `department` query mismatch
The Owner employee list/detail contract and `employeeView()` use only `id`, `full_name`, and `email`. The repository projections now request precisely those columns, removing unused `department`, `phone`, and `status` selections.

The approved forward-only migration `20260805000014_add_owner_employee_and_automation_workflows.sql` already adds `users.department` and `users.phone`, and the invitation RPC legitimately uses them. If that migration is absent in a target environment, it must be applied through the approved production migration process; no migration was changed or added.

### Document upload Client ID
The document publish form now uses the same Owner-scoped client selector, displaying generated Client IDs while placing the selected underlying UUID in multipart `client_id`.

## Invitation workflow and security invariants
The correction does not change JWT-subject-derived Owner scope, Owner authorization, RLS, service-role-only invitation RPCs, 24-hour expiry, hashed setup tokens, owner-keyed rate limiting, or owner-attributed create, delivery, resend, and accept audit events. Existing source-level invitation route tests retain a successful `201` path and verify redaction of token and password material.

## Validation evidence
- Focused API tests: 72/72 passed.
- Focused web tests: 5/5 passed.
- `npm run lint`: passed.
- `npm run type-check --workspace=apps/web`: passed.
- `npm run test`: passed (API 88/88, web 26/26, ICP scorer 16/16).
- `npm run build`: passed.
- `git diff --check`: passed before this report was created; it is rerun after creation.

## Limitations
Verification is source-level and local only. No live Railway smoke test, deployment, production migration inspection, or remote database operation occurred. A successful live employee invitation requires the approved migration `20260805000014` to already be applied in the target database.
