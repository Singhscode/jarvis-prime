# Phase 9 — Finance & Billing Tasks

## IMPLEMENTED

- [x] Add the Finance schema foundation: billing profiles, employee permissions, invoices/items, payments, expenses, documents, private storage, scoped constraints, RLS, and service-role table grants.
- [x] Add server-side Finance authorization, owner-scoped queries, validated invoice/payment/expense mutations, and audit writes.
- [x] Add Owner Workspace Finance overview, invoice, payment, and expense routes.
- [x] Add disposable PostgreSQL Finance integration coverage.
- [x] Add the existing Finance PostgreSQL integration command to the CI disposable Supabase integration block.

## VERIFIED

- [x] Confirm seven Finance tables and required RPCs through a read-only linked-production schema dump.
- [x] Confirm RLS on all Finance tables, no browser/public Finance grants, and intended service-role table/RPC grants.
- [x] Run `apps/api/integration/finance-billing.postgres.integration.js` locally: 7/7 passing.
- [x] Parse the CI workflow and run `git diff --check` after wiring the Finance command.

## Blocked release gate

- [ ] Perform read-only authenticated Owner smoke checks for `/dashboard/finance`, `/dashboard/finance/invoices`, `/dashboard/finance/payments`, and `/dashboard/finance/expenses` using an already authenticated approved Owner session.

**Blocker:** No approved existing Owner browser session is available to this verification session. Do not create a login/session or Finance data to clear this item.

## DEFERRED — not Phase 9 finalization work

- [ ] Client Finance portal.
- [ ] Payment gateway/webhooks.
- [ ] Reconciliation.
- [ ] Refunds and chargebacks.
- [ ] Subscriptions.
- [ ] Finance documents/receipts UI.
- [ ] Reports/exports.
- [ ] Accounting synchronization.
- [ ] Tax/legal automation.

These are explicitly deferred and require separate approved specifications; they are not follow-up tasks to perform under Phase 9 finalization.