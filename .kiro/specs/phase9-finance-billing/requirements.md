# Phase 9 — Finance & Billing Requirements

## Finalization status

- **IMPLEMENTED:** The Owner Workspace provides Finance overview, billing-profile, invoice, manual-payment, and expense surfaces at `/dashboard/finance`, `/dashboard/finance/invoices`, `/dashboard/finance/payments`, and `/dashboard/finance/expenses`.
- **VERIFIED:** Read-only production schema/RPC/RLS/ACL inspection and the disposable PostgreSQL Finance integration suite (7/7 passing) have completed. The existing Finance integration command is wired into CI.
- **BLOCKED:** The authenticated Owner browser smoke is not complete because no approved existing Owner session was available. No new login or production mutation may be used to clear this gate.

## IMPLEMENTED requirements

1. The system shall derive Finance scope from the authenticated server-side identity. Browser-supplied owner, employee, client, invoice, payment, and expense identifiers shall not establish authorization.
2. An eligible Owner shall access Finance data for only that Owner scope. An active employee shall require the exact Finance permission for read, invoice-write, payment-write, or expense-write access.
3. The system shall support owner-scoped billing profiles, invoices and invoice items, manual payment records, and expenses with validated state transitions.
4. Finance writes shall use service-role-only mutation RPCs with owner predicates, validation, atomic mutation behavior, and safe audit metadata.
5. Finance tables shall have RLS enabled, deny browser/public direct table access, and grant intended table access only to `service_role`.
6. Finance routes shall expose loading, empty, error, and denied states without fabricating Finance records or treating unavailable data as zero-value data.

## VERIFIED acceptance evidence

- The production read-only schema dump confirmed the seven Finance tables, required Finance RPCs, RLS enablement, service-role table grants, and absence of Finance grants to `anon`, `authenticated`, and `PUBLIC`.
- `apps/api/integration/finance-billing.postgres.integration.js` passed all seven disposable-local tests covering ACL/RLS, owner isolation, employee permissions, relationship constraints, mutation RPC/audit behavior, anonymous denial, and rollback/error behavior.
- `.github/workflows/01-test.yml` runs the existing Finance suite with the established local Supabase environment pattern.

## DEFERRED requirements

The following are explicitly out of scope for Phase 9 finalization and must not be represented as implemented:

- Client Finance portal.
- Payment gateway or webhook processing.
- Payment reconciliation.
- Refunds and chargebacks.
- Subscription billing.
- Finance document or receipt user interface and workflow.
- Financial reports or exports.
- Accounting-system synchronization.
- Tax or legal automation.

A private Finance document table and bucket are schema foundations only; they do not provide a document or receipt workflow.