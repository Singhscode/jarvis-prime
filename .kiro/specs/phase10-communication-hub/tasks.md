# Phase 10 — Communication Hub Implementation Plan

## Status

**SPECIFICATION COMPLETE. IMPLEMENTATION NOT STARTED.** Every task below is unchecked. This plan does not authorize code, migration, runtime, provider, webhook, CI, deployment, production, infrastructure, commit, or push changes.

## Invariants

- Keep legacy outreach tables, routes, campaigns, replies, suppression, public webhooks, and founder alerts unchanged and separate.
- Reuse existing JWT/session and Owner/Employee/Client identity relationships; add no parallel auth or generic permission framework.
- Derive Owner Scope server-side and require active participant membership for every thread/message/attachment operation.
- Use one Communication Hub data model and API for Owner, Employee, and Client surfaces.
- Use the generic email provider and Resend only behind the Communication-specific delivery layer.
- Add no advanced realtime, omnichannel routing, helpdesk, AI support, campaign messaging, or speculative framework.
- Recheck the canonical migration ledger before assigning the proposed post-`20260810000021` migration version.

## Dependency order

```text
1. Approval and migration rehearsal
2. Authorization/read model
3. Atomic threads/messages/notifications
4. Attachments
5. Provider delivery and signed webhooks
6. Owner/Employee/Client frontend
7. Full verification and release evidence
```

No later milestone begins until the earlier milestone's scope/security tests pass.

## Milestone 0 — Approval and implementation preflight

- [ ] Obtain explicit approval to start Phase 10 implementation.
- [ ] Recheck the current migration ledger and reserve the next canonical version; do not assume `20260810000022` if the ledger changed.
- [ ] Confirm the exact existing Owner Workspace admission method, Employee owner relation, and Client Portal active-membership scope used by the implementation.
- [ ] Confirm Resend's current webhook signature specification, raw-body requirements, event IDs, delivery-state vocabulary, timestamp tolerance, outbound idempotency support, and ambiguous-send reconciliation capability from official documentation before coding.
- [ ] Confirm the deployment supports a bounded database-backed delivery worker timer. If not, disable external email notification delivery and retain in-app functionality rather than adding an in-memory retry queue.
- [ ] If Resend cannot guarantee a stable outbound idempotency/reconciliation contract, keep external email notification delivery disabled; do not silently implement at-least-once duplicate-prone sends.
- [ ] Confirm attachment content-signature validation can meet the approved PDF/PNG/JPEG/plain-text boundary. If not, keep attachments disabled until that requirement can be met.

## Milestone 1 — Additive database foundation

- [ ] Create one additive migration defining `communication_threads`, `communication_participants`, `communication_messages`, `communication_attachments`, `communication_notifications`, `communication_preferences`, `communication_deliveries`, and `communication_delivery_events` exactly within the approved design.
- [ ] Add explicit Owner Scope, composite foreign keys, uniqueness, status checks, timestamp consistency checks, bounded field lengths, and indexes for participant inbox, message pagination, notifications, and due deliveries.
- [ ] Add durable create-thread idempotency authority on `(owner, creator, key)` with a canonical request hash; add send-message request hashes for conflicting-key detection.
- [ ] Define participant `active → revoked` internal lifecycle and revocation timestamp so stale Employee/Client eligibility cannot continue receiving access or deliveries.
- [ ] Create private `communication-private` storage bucket without public policies.
- [ ] Enable RLS on every Communication table; revoke table/function access from `PUBLIC`, `anon`, and `authenticated`; grant only required service-role privileges.
- [ ] Add service-role-only atomic RPCs for create-thread, send-message, mark-read, notification state, and preference update.
- [ ] Ensure no migration object references legacy outreach `prospects`, `messages`, `events`, `campaigns`, `suppression`, `webhook_events`, or `notifications`.
- [ ] Rehearse reset and rollback against disposable local Supabase/PostgreSQL only; do not apply to production at this milestone.

## Milestone 2 — Communication authorization and read API

- [ ] Add `communications.repository.js`, `communications.service.js`, and `communications.routes.js` using existing Repository → Service → Route conventions.
- [ ] Implement one actor-scope resolver for existing Owner admission, active Employee owner relation, and exact active Client Portal membership; revalidate authoritative eligibility on every caller request and recipient fan-out, internally revoking stale participant rows.
- [ ] Add participant-scoped `GET /api/communications/threads` with `view=inbox|sent`, opaque cursor, stable ordering, fixed projection, and maximum 50.
- [ ] Add participant-scoped `GET /api/communications/threads/:threadId` with bounded message history and sequence cursor.
- [ ] Add caller-only notification list and preferences reads.
- [ ] Mount user routes under existing JWT middleware before shared-secret engine middleware; use `private, no-store` responses.
- [ ] Add unit and PostgreSQL tests for unauthenticated, inactive, revoked, ambiguous, non-participant, guessed-ID, and cross-owner denial before adding mutations.

## Milestone 3 — Atomic thread, message, read, notification, and preference mutations

- [ ] Add Owner-only thread creation using active Employee user locators and active Client Portal membership locators, resolving Client users server-side; persist fixed participants, initial message, request hash, required idempotency key, rate limit, and preference-eligible notifications atomically.
- [ ] Add participant send-message operation with plain-text validation, required idempotency key/request hash, authoritative sender/recipient revalidation, atomic per-thread sequence allocation, and no edit/delete path.
- [ ] Add monotonic mark-read and recipient-only notification read/dismiss operations.
- [ ] Add caller-only in-app/email preference update with defaults `true/false`; suppress future notification rows when in-app is disabled and future delivery rows when email is disabled, without changing thread unread state or historical records.
- [ ] Add redacted audit writes for important state changes without content, addresses, filenames, provider data, or secrets.
- [ ] Add concurrent PostgreSQL tests proving unique sequence allocation, create/send idempotent replay, conflicting key rejection, rollback, immutable message grant paths, authoritative recipient revocation, notification uniqueness/preference behavior, and read-state monotonicity.

## Milestone 4 — Bounded private attachments

- [ ] Add a Communication-specific multipart parser for one message body and at most five files, each at most 10 MiB.
- [ ] Validate extension, declared MIME, content signature, filename, size, and SHA-256 for PDF, PNG, JPEG, and plain text.
- [ ] Generate private storage paths server-side; upload only to `communication-private`; pass validated metadata to the send-message RPC.
- [ ] Before upload, perform scoped idempotency/request-hash lookup; use stable server-derived no-overwrite operation paths; after created or replayed RPC results, remove only newly created paths that are not referenced by committed attachments.
- [ ] Add participant-authorized attachment download with short-lived URL or forced server stream; never expose bucket/path authority.
- [ ] Add parser, storage compensation, response-loss replay, concurrent idempotent retry, cross-owner, non-participant, limit, signature mismatch, and download-expiry tests.

## Milestone 5 — Email notification delivery and signed provider events

- [ ] Add `communications.delivery.js` as the only Communication path to `getEmailProvider()` and the Resend adapter.
- [ ] Implement safe notification-email template construction, current recipient eligibility/preference checks, durable idempotency, accepted/provider-ID mapping, and sanitized errors.
- [ ] Implement bounded delivery claims with database lease, `FOR UPDATE SKIP LOCKED`, maximum three known-failure attempts, backoff, and terminal failure audit.
- [ ] Pass the stable key through the verified provider idempotency contract. Treat timeout/crash/lost-response after dispatch as `outcome_unknown`, never automatic retry; reconcile by stable key/provider message ID or leave email delivery disabled if safe reconciliation is unavailable.
- [ ] Add the approved small lifecycle timer only if deployment reliability was confirmed in Milestone 0; never use an in-memory retry queue.
- [ ] Add a separate raw-body `POST /api/communications/webhooks/email/resend` boundary with current official signature verification.
- [ ] Normalize and durably store provider event ID/type, payload hash, safe timestamps, and bounded metadata; do not persist or expose raw payloads.
- [ ] Enforce replay idempotency and the documented transition matrix: accepted→delivered; retryable failures only before accepted; bounded permanent failures; bounced/complained terminal override; no late generic regression; `outcome_unknown` only through reconciliation.
- [ ] Add provider, retry, lease, crash-after-dispatch, outcome reconciliation, signature, stale timestamp, malformed/oversized payload, replay, unknown delivery, out-of-order precedence, and redaction tests.
- [ ] Leave SendGrid, public legacy `/webhooks`, founder alerts, inbound email replies, Slack, Telegram, WhatsApp, and SMS unchanged.

## Milestone 6 — Shared frontend capability in existing portal shells

- [ ] Add shared Communication contracts/API client and a focused `CommunicationWorkspace` presentation component without creating a new app or authentication boundary.
- [ ] Add `/dashboard/communications` within the Owner Workspace shell, including Owner-only new-thread creation.
- [ ] Add `/employee/communications` within the Employee Portal shell and `/client/communications` within the Client Portal shell; both use the same API/data model and support only authorized read/reply behavior.
- [ ] Add inbox/sent filter, paged thread list, ordered thread detail, load-older history, plain-text composer, bounded attachment picker, unread indicators, notifications, and two preference toggles.
- [ ] Implement refresh after mutation, on focus/navigation, and conservative visible-only polling; merge by immutable IDs/sequences and add no WebSocket/Realtime dependency.
- [ ] Keep scoped data memory-only and clear on logout, terminal 401, denial, or user transition.
- [ ] Add Owner/Employee/Client UI isolation, composer, unread/read, notifications, preferences, polling merge, loading/empty/error/denied, accessibility, responsive, and browser-storage tests.

## Milestone 7 — Regression, security review, and release evidence

- [ ] Run focused API/unit, PostgreSQL integration, webhook, provider, attachment, and frontend tests.
- [ ] Run existing auth, CRM, Owner Workspace, Employee Portal, Client Portal, Finance, outreach, provider/webhook regression, lint, type-check, root tests, build, migration reset, and `git diff --check`.
- [ ] Verify all Communication tables/RPCs are service-role-only with RLS enabled and no browser/public grants.
- [ ] Verify Owner/Employee/Client cross-scope isolation, raw webhook/provider/storage redaction, idempotency, deterministic ordering, retry bounds, and no persistent scoped browser state.
- [ ] Verify no legacy outreach table, route, webhook, founder alert, suppression record, campaign, or reply-classification behavior changed.
- [ ] Verify no Slack/WhatsApp/SMS/helpdesk/AI/campaign/realtime scope was introduced.
- [ ] Perform read-only authenticated smoke coverage for each approved Owner, Employee, and Client Communication surface without creating production test data unless separately approved.
- [ ] Prepare implementation verification documentation; do not mark Phase 10 implemented until every approved gate passes.

## Explicitly deferred — do not pull into implementation tasks

- [ ] Slack chat replacement.
- [ ] WhatsApp conversational platform.
- [ ] SMS platform.
- [ ] Full helpdesk/ticketing, SLA, assignment, escalation, or queue system.
- [ ] AI customer support, message summarization, suggested replies, or moderation.
- [ ] CRM campaign messaging or legacy outreach-history migration.
- [ ] Email reply-to-thread ingestion.
- [ ] Advanced realtime infrastructure, presence, typing indicators, or push notifications.
- [ ] Enterprise omnichannel routing.
- [ ] Message edit/delete/reactions, post-creation participant administration, export, configurable retention, or legal hold.

These are future approved specifications, not Phase 10 completion tasks.

## Roadmap update plan — not executed

After this specification is approved, a separate documentation-only task should change Phase 10 status to:

```text
Phase 10 — Communication Hub
SPECIFICATION COMPLETE
IMPLEMENTATION NOT STARTED
```

Do not edit `MASTER_ROADMAP.md` during this specification gate.