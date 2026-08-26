# Phase 9 — Finance & Billing Design

## Scope and status

**IMPLEMENTED** is limited to owner-scoped internal Finance operations. **VERIFIED** evidence is limited to read-only production schema/security inspection, disposable local PostgreSQL integration, and local CI workflow validation. **DEFERRED** capabilities remain excluded from the implementation.

The final release gate is partial: an authenticated Owner browser smoke requires an already authenticated, approved session. No such session is available to this verification session, and creating one solely for testing is prohibited.

## Architecture

### Dashboard surfaces

The Owner Workspace exposes four Finance routes:

- `/dashboard/finance` — overview and billing profile.
- `/dashboard/finance/invoices` — invoice and invoice-item workflow.
- `/dashboard/finance/payments` — manual payment records.
- `/dashboard/finance/expenses` — expense workflow.

UI requests use the protected Finance API. The UI must not fabricate records, infer authorization from browser identifiers, or silently convert an unavailable response into an empty or zero-value state.

### Authorization and data ownership

Finance scope is server-derived from the authenticated JWT subject. An eligible Owner operates within the Owner scope. An employee is limited to its active Owner relationship and exact permission: `finance.read`, `finance.invoices.write`, `finance.payments.write`, or `finance.expenses.write`.

Every Finance record is owner-scoped. Composite foreign keys and database triggers prevent cross-owner client, invoice, employee, and payment substitutions. The service verifies permission before it calls Finance repositories or mutation RPCs.

### Storage and database security

The Finance foundation includes billing profiles, employee permissions, invoices, invoice items, payments, expenses, and documents. All seven Finance tables have RLS enabled. Browser roles do not receive direct Finance table grants; intended table access is granted to `service_role`.

A private `finance-private` storage bucket and `finance_documents` table exist as a foundation. They do not expose document upload, download, receipt, or workflow functionality in this phase.

### Mutation model

Invoice, payment, and expense writes are delegated to service-role-only RPCs. The RPC layer validates owner scope, relationship integrity, totals, and allowed state transitions, performs writes atomically, and records Finance audit events with safe status-oriented metadata.

Manual payment records do not charge, collect, confirm, reconcile, or settle external funds.

## Verified design evidence

- The read-only linked production schema dump confirmed required tables, RPCs, RLS, public/browser privilege revocation, and service-role grants.
- The disposable-local PostgreSQL integration suite passed 7/7 tests covering security, scope, permissions, RPC/audit behavior, and rollback/error behavior.
- The CI workflow runs the same Finance suite within the existing disposable Supabase test environment.

## Deferred design boundaries

Not designed or implemented here: Client Finance portal, payment provider/webhook integration, reconciliation, refunds/chargebacks, subscriptions, document/receipt UI, reports/exports, accounting synchronization, and tax/legal automation. These require separately approved requirements, security review, and implementation work.