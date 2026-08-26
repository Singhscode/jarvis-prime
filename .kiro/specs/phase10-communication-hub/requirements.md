# Phase 10 — Communication Hub Requirements

## Status and approval boundary

**SPECIFICATION COMPLETE. IMPLEMENTATION NOT STARTED.** This document defines the Phase 10 requirements only. It authorizes no application code, database migration, runtime, provider, webhook, CI, deployment, infrastructure, production, commit, or push change. Implementation starts only after explicit approval of this specification and its technical design/tasks.

## Goal

Build one authenticated internal Communication Hub for Owner, Employee, and Client participants. It shall provide durable participant-scoped threads, immutable messages, inbox/outbox views, durable notifications and preferences, optional email notification delivery, signed provider delivery webhooks, and bounded private attachments without reusing legacy outreach records as authority.

## Repository boundaries

Phase 10 shall be additive. It shall preserve the existing JWT/session platform, Owner Workspace, Employee Portal, Client Portal, CRM, Finance, legacy outreach engine, public legacy `/webhooks`, provider configuration, deployment, and infrastructure unless a later implementation task explicitly approves a narrow integration.

The following existing components may be reused only behind the new Communication Hub boundary:

- `apps/api/src/ai/providers/email/index.js` provider contract.
- `apps/api/src/ai/providers/email/resend.js` after Phase 10 wraps and sanitizes its result/error handling.
- Generic transactional delivery primitives from `apps/api/src/integrations/email-sender.js` where their current behavior satisfies these requirements.

The following shall not become Communication Hub authority:

- Legacy `prospects`, outreach `messages`, `events`, `campaigns`, `campaign_steps`, `suppression`, `webhook_events`, or `notifications` records.
- Shared-secret outreach/campaign APIs or prospect reply classification.
- The current public `/webhooks` trust boundary or its permissive signature behavior.
- `apps/api/src/integrations/notifications.js` founder alert transports.
- Finance records, audit logs, or public `ChatWidget` state.

## Glossary

- **Owner Scope:** The company scope derived server-side from the authenticated subject. It is never accepted from browser input.
- **Participant:** An authenticated Owner, active Employee, or active Client Portal user with an active membership row in a thread.
- **Thread:** One durable Owner-scoped conversation and its fixed participant set.
- **Message:** An append-only content record in one thread. Message content cannot be edited or physically deleted in Phase 10.
- **Inbox:** Threads in which the caller is an active participant, ordered by latest authorized message.
- **Outbox:** The same authorized thread set filtered to threads in which the caller has sent at least one message; it is not a duplicate data store.
- **Notification:** A durable user-scoped in-app notice generated from an authorized Communication Hub event.
- **Delivery:** An optional external notification-email attempt. It does not become the message source of truth.

## Requirements

### Requirement 1 — Authentication, scope, and authorization

1. Every user-facing `/api/communications` request shall use the existing JWT authentication middleware.
2. The service shall derive Owner Scope from `req.user.sub`: direct Owner Workspace admission for an Owner, `portal_owner_user_id` for an active Employee, and the existing active Client Portal membership/client ownership relationship for a Client.
3. Request-supplied owner, participant, thread, message, notification, delivery, and attachment identifiers shall be locators only and shall never establish authorization.
4. Every thread/message/attachment query and mutation shall require both the derived Owner Scope and an active participant membership for the caller.
5. An Owner may create a thread with active in-scope Employees and Client Portal users. The request shall identify Employees by their existing in-scope employee user locator and Clients by an existing active Client Portal membership locator; the server resolves each locator to a user and never accepts a browser-supplied Client user ID as authority. Participant membership is fixed after creation in the Phase 10 baseline.
6. An Employee may read and reply only to threads where that Employee is an active participant and still has the authoritative active Employee-to-Owner relationship. Employees cannot add participants, change scope, or create Client-facing threads in the baseline.
7. A Client may read and reply only to threads where that exact Client user is an active participant and still has the authoritative active Client Portal membership used to derive the thread's Owner Scope. Client membership in one CRM client shall never reveal another client user, CRM client, Owner scope, or thread.
8. Authoritative identity eligibility shall be revalidated for the caller on every request and for every recipient before notification or delivery creation. If an Employee or Client relationship has become inactive or revoked, an internal service-role operation shall transition that Communication participant from `active` to `revoked`, set `revoked_at`, deny subsequent access, and exclude the user from new notifications and deliveries. There is no user-facing participant-management endpoint.
9. Unauthorized, cross-owner, guessed, disabled, inactive, ambiguous, and revoked identities or resources shall use non-disclosing 403/404 behavior and reveal no counts, participants, addresses, or existence.
10. The browser shall never write directly to Supabase/PostgreSQL or receive service-role credentials.

### Requirement 2 — Threads and participants

1. Threads shall be durable, Owner-scoped, and created atomically with their complete initial participant set and initial message.
2. Thread creation shall reject duplicate participants, the creator's absence, inactive/out-of-scope users, unsupported participant combinations, an empty initial message, and cross-owner membership.
3. Each participant membership shall identify one authenticated user, participant kind, join time, `active` or internally `revoked` state, optional revocation time, and last-read sequence.
4. Thread visibility shall be determined exclusively by current authoritative identity eligibility, active participant membership, and Owner Scope.
5. Thread-list ordering shall be deterministic across threads by database-authored `(last_message_at, thread_id)`. Message ordering within a thread shall remain `(sequence, message_id)`. Pagination shall use the matching bounded opaque cursor.
6. Phase 10 shall not add participant invitation, participant removal, group administration, thread transfer, or arbitrary role-management endpoints. Those require later approval.

### Requirement 3 — Immutable messages

1. A message shall belong to exactly one Owner-scoped thread and one active sender participant.
2. Message creation shall atomically allocate a monotonically increasing sequence within the thread, validate active membership, persist content, update thread ordering state, and generate recipient notifications.
3. Ordering shall use `(sequence, id)`; client timestamps shall never determine canonical order.
4. Message body shall be plain text, trimmed, 1–10,000 characters, reject NUL/unsafe control characters, and be rendered as text rather than trusted HTML.
5. Message content, sender, thread, sequence, and creation timestamp shall be immutable. Phase 10 provides no edit, delete, recall, or reaction operation.
6. Create-thread shall require an idempotency key scoped to `(owner, actor)` plus a canonical request fingerprint; a durable unique authority shall return the original thread for an identical retry and return 409 if the key is reused with different participants, subject, or initial body. Send-message shall require an idempotency key scoped to `(owner, thread, actor)` with the same identical-retry/conflicting-reuse behavior.
7. Provider delivery state shall be separate from message state. A failed email notice shall not remove, duplicate, or mark the durable in-app message as failed.
8. Message APIs shall return fixed safe projections only and shall not expose raw database rows, provider payloads, storage paths, or other participants' private profile data.

### Requirement 4 — Inbox, outbox, and read lifecycle

1. The inbox shall list only threads with active caller participation, latest authorized message preview, participants' safe display names, unread count, and stable cursor ordering.
2. The outbox shall be a query over the same participant-scoped threads filtered by caller-authored messages. No separate outbox table shall be created.
3. Thread detail shall return bounded message pages ordered by sequence and support older-message cursor pagination.
4. Mark-read shall accept only a sequence that exists in the authorized thread, advance `last_read_sequence` monotonically, and be idempotent. It shall never move read state backward.
5. Thread/message read state and notification read/dismiss state are distinct. Dismissing a notification shall not hide or delete a thread or message.
6. Empty, loading, unavailable, denied, and recoverable error states shall be explicit and shall not fabricate messages, unread counts, participants, or delivery state.

### Requirement 5 — Notifications and preferences

1. If the recipient's effective `in_app_enabled` preference is true (default when no row exists), each relevant new message shall create one durable notification for each other currently eligible active participant; the sender shall not receive a notification for its own message. If false, the notification row is not created, but the participant's thread unread state still advances normally.
2. Notifications shall be Owner- and recipient-user-scoped and shall never be visible or mutable by another user, including another participant.
3. Notification lifecycle shall be `unread`, `read`, or `dismissed`, with monotonic timestamps. Dismissal shall not physically delete the record.
4. Notification list, read, and dismiss operations shall be bounded, idempotent, and authorized by recipient identity plus Owner Scope.
5. One preference record per Owner/user shall control only `in_app_enabled` and `email_enabled` in Phase 10. Missing rows resolve to `in_app_enabled=true` and `email_enabled=false`. Preference changes affect future notifications/deliveries only and do not create, delete, hide, or rewrite existing records. Slack, WhatsApp, SMS, push, digests, routing rules, and campaign preferences are excluded.
6. In-app thread messaging and unread counts remain available regardless of notification preferences. Email delivery records are created only when `email_enabled` is true and the recipient remains authoritatively eligible.
7. Email notifications shall contain a safe summary and authenticated link, not secrets, access tokens, raw provider errors, private attachment paths, or unrestricted message history.

### Requirement 6 — Communication-specific provider delivery

1. A new communication delivery service shall own recipient selection, preference enforcement, template construction, idempotency, retry state, normalized outcomes, and error sanitization.
2. The generic email provider contract and Resend adapter may be invoked only through that service. Existing outreach `sendEmail`, campaigns, suppression records, and founder alert routing shall not be used as Communication Hub authority.
3. A delivery shall have a durable idempotency key, recipient, channel, provider, attempt count, retry time, lease, current status, provider identifier where safe, and sanitized error code.
4. Delivery statuses shall be constrained to `pending`, `processing`, `accepted`, `delivered`, `failed_retryable`, `failed_permanent`, and `outcome_unknown`, with an allowlisted terminal reason where applicable.
5. Known retryable failures shall be durable across process restart, use bounded backoff and a database lease, and stop after three attempts. The service shall pass a stable delivery idempotency key through a provider-supported idempotency contract when available.
6. A timeout, process crash, or ambiguous provider response after send shall transition to `outcome_unknown` and shall not be retried automatically. It requires provider reconciliation by the same stable key or provider message identifier. If the selected provider/adapter cannot support safe idempotency or reconciliation, external email notification delivery shall remain disabled rather than claim duplicate-free retries; in-app messaging remains available.
7. Provider response bodies, credentials, secrets, stack traces, and recipient content shall not be returned to the browser or written to audit details.
8. SendGrid remains unsupported for Phase 10 until its adapter is separately validated to the same contract; its presence in the repository is not proof of approval.

### Requirement 7 — Signed provider webhooks

1. Phase 10 shall add a separate provider-delivery webhook route under `/api/communications/webhooks/email/:provider`; it shall not forward to or trust the current public `/webhooks` implementation.
2. The webhook route shall authenticate the provider request using the provider's documented signature scheme over the original raw request body and reject missing, invalid, stale, or unsupported signatures.
3. Processing shall persist only normalized event fields, a payload hash, provider event identifier, safe timestamps, and sanitized metadata. Raw webhook payloads and headers shall not be exposed through user APIs or audit views.
4. A unique provider/event identifier shall make webhook processing idempotent and replay-safe. Duplicate valid events shall return success without applying state twice.
5. Events shall be matched to an existing Communication Hub delivery without accepting Owner Scope, user IDs, or thread IDs directly from untrusted payload fields.
6. Delivery state precedence shall be explicit: `pending → processing → accepted → delivered`; `processing → failed_retryable → processing` is permitted until the attempt limit; a known permanent pre-acceptance failure becomes `failed_permanent`; and `bounced` or `complained` provider events set `failed_permanent` with a terminal reason and may supersede `accepted` or `delivered`. Late `accepted`, `delivered`, generic failure, or retry events shall never regress `delivered` or a `bounced`/`complained` terminal state. `outcome_unknown` changes only through provider reconciliation, not event-time guessing.
7. Email reply-to-thread ingestion is not included. The webhook baseline handles delivery events only.

### Requirement 8 — Attachments

1. Phase 10 may attach up to five files to a new message through the same authenticated send-message operation; it shall not create a general file manager.
2. Each file shall be at most 10 MiB and limited to PDF, PNG, JPEG, and plain text after extension, declared MIME, and content-signature validation.
3. Attachments shall use a dedicated private bucket, server-generated storage paths, an Owner/thread/message-scoped metadata row, a SHA-256 checksum, sanitized display filename, MIME type, byte size, and creation timestamp.
4. Before uploading, the service shall look up an existing message by the scoped idempotency key and request fingerprint and return it for an identical replay. Upload paths shall use a stable server-derived operation prefix and no-overwrite behavior. After the message RPC returns—whether it created or replayed a message—the service shall verify which operation paths are referenced and remove only newly created unreferenced objects. Failed database operations shall receive the same bounded compensation. No browser may choose a bucket or authoritative path.
5. Downloads shall require current active participant membership and return a short-lived authorized URL or server stream with forced safe download headers. URLs shall not be persisted by the browser.
6. Attachment metadata and objects follow their immutable message. Phase 10 has no attachment replace/delete endpoint and no automatic retention purge; a future approved governance policy is required before deletion or legal-hold behavior.
7. Unsupported, malformed, oversized, or content-mismatched files shall fail before a message is committed. If the approved implementation cannot provide content-signature validation safely, attachment delivery shall remain disabled rather than weakening this requirement.

### Requirement 9 — Frontend and portal integration

1. Owners shall use `/dashboard/communications` within the existing Owner Workspace shell.
2. Employees shall use `/employee/communications` within the existing Employee Portal session and identity boundary.
3. Clients shall use `/client/communications` within the existing Client Portal session and active membership boundary.
4. All three surfaces shall use the same `/api/communications` contracts, thread/message/notification records, authorization rules, and shared presentation components where practical. No second Client communication architecture or duplicate data model is permitted.
5. The UI shall provide thread list, inbox/outbox filter, thread detail, bounded history loading, plain-text composer, approved attachment input, unread indicators, notification panel, and in-app/email preferences.
6. Controls shall be capability-aware: only an Owner can create a baseline thread; Employee and Client users can reply only where active participants.
7. Scoped operational data shall remain memory-only in the browser and clear on logout, terminal authentication failure, denied access, or user transition.
8. All controls and states shall be keyboard accessible, responsive, visibly focused, and provide appropriate assistive announcements.

### Requirement 10 — Realtime decision

1. Advanced realtime infrastructure is **DEFERRED**. Phase 10 shall not add WebSockets, Supabase Realtime subscriptions, cross-region event buses, presence, typing indicators, or read receipts beyond durable last-read state.
2. The baseline shall refresh on navigation, window focus, successful mutation, and bounded polling while the Communication Hub is visible.
3. Polling responses shall use deterministic sequence ordering and idempotent merge rules so reconnect/refocus cannot duplicate or reorder messages.
4. Polling shall pause when the page is hidden and use a conservative interval configurable in code, not user-controlled infrastructure settings.

### Requirement 11 — Database, RLS, ACL, and service execution

1. Implementation shall use one additive canonical migration after the current `20260810000021` ledger entry; this specification does not create it.
2. Communication Hub tables shall use UUID primary keys, explicit Owner Scope, composite owner/resource foreign keys, constrained lifecycle values, timestamps, and indexes supporting participant inbox and message pagination.
3. RLS shall be enabled on every Communication Hub table. `PUBLIC`, `anon`, and `authenticated` shall receive no direct table/function access.
4. The server shall use `service_role` only after JWT and service-layer authorization. Security-definer mutation RPCs shall be service-role-only where atomic sequence allocation, thread creation, message/notification creation, or read-state advancement requires them.
5. No Communication Hub table, function, trigger, or policy shall reference legacy outreach `messages`, `events`, `prospects`, `campaigns`, `suppression`, `webhook_events`, or `notifications` as authority.
6. Important state changes shall create redacted audit events: thread created, message accepted, read advanced, notification dismissed, preference changed, delivery permanently failed, and webhook signature/replay failure. Message bodies, filenames, addresses, provider payloads, and secrets shall not be stored in audit details.

### Requirement 12 — Retention and privacy

1. Baseline threads, messages, attached objects, notification records, preferences, delivery records, and normalized delivery events shall have no automatic purge and no user delete endpoint.
2. Read and dismiss actions are lifecycle changes, not deletion. Physical deletion, exports, legal hold, data-subject requests, and configurable retention require separate approved governance work.
3. User-facing projections shall minimize participant identity and content. Provider payloads, internal storage metadata, email addresses not required for display, and delivery error internals shall remain server-only.
4. Logs shall use safe identifiers/correlation IDs and shall not contain message bodies, attachment content, raw webhook payloads, signatures, tokens, or provider secrets.

### Requirement 13 — Test and verification strategy

Implementation shall not be considered complete without:

1. API unit tests for validation, pagination, deterministic ordering, idempotency, sanitized errors, and fixed projections.
2. Authorization tests for unauthenticated, Owner, active/inactive Employee, active/revoked/ambiguous Client, recipient revoked after thread creation, non-participant, guessed ID, and cross-owner access.
3. Disposable PostgreSQL integration tests for RLS/ACL, composite scope constraints, safe Client membership locators, durable create/send idempotency and conflict detection, sequence allocation under concurrency, immutable message records, participant eligibility/revocation, monotonic read state, notification preference/lifecycle behavior, delivery leases/retries/unknown outcomes, explicit event precedence, and transaction rollback.
4. Webhook tests using raw request bytes for valid/invalid/missing/stale signatures, duplicate events, replay, unknown provider IDs, out-of-order events, terminal-state precedence, and payload redaction.
5. Provider tests proving the communication layer enforces current recipient eligibility, preferences, idempotency, known-failure retry limits, crash/timeout ambiguous-outcome handling, reconciliation, and sanitized failures while the generic adapter remains behind it.
6. Attachment tests for limits, signature/MIME mismatch, authorization, transaction-failure compensation, response-loss/idempotent replay cleanup, private paths, download expiry, and cross-owner denial.
7. Frontend tests for Owner/Employee/Client admission, inbox/outbox, thread history, composer, unread state, notifications, preferences, errors, empty states, keyboard behavior, and no persistent scoped browser state.
8. Regression tests proving legacy outreach tables, routes, provider behavior, public webhooks, founder alerts, Finance, Owner Workspace, Employee Portal, and Client Portal remain unchanged except for explicitly approved additive navigation/integration.

## Explicit deferrals

The following are not required Phase 10 implementation:

- Slack chat replacement.
- WhatsApp conversational platform.
- SMS platform.
- Full helpdesk/ticketing, assignments, SLAs, escalation, or queues.
- AI customer support, summarization, suggested replies, or moderation.
- CRM campaign messaging or migration of legacy outreach history.
- Email reply-to-thread ingestion.
- Advanced realtime infrastructure, presence, typing indicators, or push notifications.
- Enterprise omnichannel routing.
- Message edit/delete/reactions, participant administration after thread creation, export, configurable retention, or legal hold.

## Roadmap update plan

After explicit approval of this specification gate, the roadmap should state:

- **Phase 10 — Communication Hub: SPECIFICATION COMPLETE**
- **Implementation: NOT STARTED**

`MASTER_ROADMAP.md` is not modified by this specification task.