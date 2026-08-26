# Phase 10 — Communication Hub Design

## Design status

**Technical design complete; implementation not started.** This design creates no migration, code, runtime, provider, webhook, CI, production, infrastructure, commit, or push change.

## Design principles

1. **One new domain, not a renamed legacy system.** Communication Hub records are separate from prospect outreach, campaigns, founder alerts, Finance, audit logs, and the public ChatWidget.
2. **One authorization path.** Existing JWT authentication identifies the user; the service derives Owner Scope and then requires active thread participation.
3. **One data model for all participants.** Owner, Employee, and Client frontends use the same API, threads, participants, messages, notifications, and preferences.
4. **Append-only content.** Messages and normalized delivery events are immutable; read/dismiss/preferences and delivery job state are the only bounded mutable lifecycles.
5. **Server-only database authority.** Browser roles receive no direct access. The API authorizes first and then uses service-role repositories/RPCs.
6. **Keep it simple.** No generic event bus, generic template platform, generic permissions framework, duplicate inbox/outbox storage, advanced realtime, or omnichannel abstraction.

## Current repository integration

### New backend module

```text
apps/api/src/modules/communications/
├── communications.routes.js
├── communications.service.js
├── communications.repository.js
├── communications.delivery.js
└── communications.webhooks.js
```

- `routes` applies existing JWT middleware to user-facing routes, fixed validation, rate limits, `Cache-Control: private, no-store`, and consistent envelopes.
- `service` derives Owner/Employee/Client scope, enforces capabilities and participant membership, builds safe projections, and maps errors.
- `repository` contains fixed SQL/Supabase projections and calls service-role-only mutation RPCs.
- `delivery` owns Communication Hub email templates, preferences, durable retry claims, provider mapping, idempotency, and sanitized failures.
- `webhooks` verifies raw-body provider signatures and normalizes delivery events. It shares no handler or trust decision with existing `/webhooks`.

This is the minimum separation needed to keep provider/webhook concerns out of business authorization. No additional interfaces or framework package is introduced.

### Existing components reused

| Existing component | Treatment |
|---|---|
| `createAuthMiddleware()` and current JWT/session lifecycle | Reuse unchanged for user-facing routes. |
| Owner Workspace admission and Employee `portal_owner_user_id` relationship | Reuse as scope inputs; do not broaden roles. |
| Client Portal active membership and owned CRM client relationship | Reuse to derive Client Owner Scope; no second client identity model. |
| `getEmailProvider()` / `BaseEmailProvider` | Reuse behind `communications.delivery.js` only. |
| `ResendProvider` | Reuse after mapping its result to sanitized Communication delivery outcomes; do not expose raw adapter errors. |
| Existing multipart/Busboy and private-storage patterns | Reuse conventions, but use Communication-specific validation, bucket, metadata, and participant checks. |
| Existing `audit_logs` write boundary | Reuse for redacted state-change evidence only; audit is not a message store. |

### Existing components left untouched

- Legacy outreach tables and `20260715000000_create_outreach_schema.sql`.
- Shared-secret `/api/outreach`, campaigns, prospect reply flow, suppression, and campaign templates.
- Public `/webhooks` routes and in-memory webhook history.
- `integrations/notifications.js` Telegram/Slack/WhatsApp/founder email alerts.
- Finance invoice/payment/expense records and public ChatWidget.
- SendGrid for Phase 10 until separately validated.

## Authorization model

### Scope resolution

The service resolves one actor context on each request:

```text
Owner    → existing Owner Workspace admission → ownerUserId = actorUserId
Employee → active employee user                → ownerUserId = portal_owner_user_id
Client   → exactly one active Client Portal membership joined to an owned CRM client
```

An inactive, disabled, revoked, ambiguous, or unmatched actor is denied before Communication Hub queries execute.

### Capability matrix

| Operation | Owner | Employee | Client |
|---|---:|---:|---:|
| List own participant threads | Yes | Yes | Yes |
| Read/reply in active participant thread | Yes | Yes | Yes |
| Create thread with fixed participant set | Yes | No | No |
| Attach approved files while sending | Yes | Yes | Yes |
| Advance own read state | Yes | Yes | Yes |
| Read/dismiss own notifications | Yes | Yes | Yes |
| Update own in-app/email preferences | Yes | Yes | Yes |
| Add/remove participants after creation | No | No | No |
| Read another user's notification/preferences | No | No | No |
| Access provider/webhook/delivery internals | No | No | No |

An Owner is not automatically permitted to read a thread unless the Owner is an active participant. Thread creation always includes the creating Owner. This prevents owner-wide accidental discovery and keeps participant membership the record-level authority.

## Database design

### Migration boundary

The future implementation shall create one additive canonical migration after the current local migration ledger tail `20260810000021`, provisionally:

```text
20260810000022_add_communication_hub.sql
```

The filename/version is reserved in this design only; no migration is created by the specification gate. The implementation shall recheck the ledger before selecting the final version.

### Shared conventions

- UUID primary keys default to `gen_random_uuid()`.
- Every business row carries `owner_user_id`.
- Composite uniqueness such as `(owner_user_id, id)` supports owner/resource foreign keys.
- Timestamps are `timestamptz NOT NULL`; database time is authoritative.
- Status values use explicit `CHECK` constraints.
- All tables enable RLS and revoke all access from `PUBLIC`, `anon`, and `authenticated`.
- `service_role` receives only required table/function privileges.
- No browser RLS policies are added; authorization remains in the API/service layer.

### `communication_threads`

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `owner_user_id` | Required FK to `users`; immutable Owner Scope. |
| `created_by_user_id` | Required FK to `users`; must be the creating Owner participant. |
| `subject` | Trimmed text, 1–200 characters. |
| `create_idempotency_key` | Required 16–128 safe characters, scoped to Owner/creator. |
| `create_request_sha256` | Hash of canonical subject, participant locators, and initial body; used to detect conflicting key reuse. |
| `last_sequence` | Bigint, default 0, non-negative; incremented only by send RPC. |
| `last_message_at` | Timestamp updated atomically with message insertion. |
| `created_at`, `updated_at` | Required timestamps. |

Constraints/indexes:

- Unique `(owner_user_id, id)`.
- Unique `(owner_user_id, created_by_user_id, create_idempotency_key)` provides durable create-thread replay authority.
- Index `(owner_user_id, last_message_at DESC, id DESC)`. Thread-list cursors encode `(last_message_at, id)`; per-thread message sequence is never used to compare recency across threads.
- No archive/delete/status field in baseline; adding lifecycle without behavior would be speculative.

### `communication_participants`

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `owner_user_id` | Required Owner Scope. |
| `thread_id` | Composite FK `(owner_user_id, thread_id)` to thread. |
| `user_id` | Required FK to `users`. |
| `participant_kind` | `owner`, `employee`, or `client`; validated against current authoritative identity relation during creation. |
| `status` | `active` or `revoked`; only internal service-role eligibility synchronization may set `revoked`. There is no participant-management API. |
| `last_read_sequence` | Bigint default 0, non-negative; advances monotonically through RPC. |
| `joined_at`, `last_read_at`, `revoked_at` | Required join time; nullable lifecycle timestamps with status consistency checks. |

Constraints/indexes:

- Unique `(owner_user_id, thread_id, user_id)` and `(owner_user_id, thread_id, id)`.
- Composite FK to thread.
- Index `(owner_user_id, user_id, status, thread_id)` for inbox admission.
- Check `last_read_sequence >= 0`, RPC check `last_read_sequence <= thread.last_sequence`, and status/revocation timestamp consistency.
- Every caller admission and recipient fan-out rechecks the authoritative Owner/Employee/Client relationship. A failed check atomically marks that participant `revoked`; revoked participants receive no new notification or delivery and cannot read/reply/download.

### `communication_messages`

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `owner_user_id`, `thread_id` | Composite Owner/thread FK. |
| `sender_user_id` | Required; composite FK to `(owner_user_id, thread_id, user_id)` participant uniqueness. |
| `sequence` | Bigint > 0, allocated atomically per thread. |
| `body` | Plain text, 1–10,000 trimmed characters; no trusted HTML. |
| `idempotency_key` | 16–128 safe characters; supplied per send. |
| `request_sha256` | Hash of canonical body and ordered attachment metadata; conflicting key reuse returns 409. |
| `created_at` | Database timestamp; immutable. |

Constraints/indexes:

- Unique `(owner_user_id, thread_id, sequence)`.
- Unique `(owner_user_id, thread_id, sender_user_id, idempotency_key)`.
- Unique `(owner_user_id, thread_id, id)` for attachment FKs.
- Index `(owner_user_id, thread_id, sequence DESC, id DESC)`.
- No `updated_at`, edit status, or delete endpoint. Content rows are append-only.

### `communication_attachments`

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `owner_user_id`, `thread_id`, `message_id` | Composite FK to the message. |
| `storage_bucket` | Fixed check value `communication-private`. |
| `storage_path` | Server-generated; unique with bucket. |
| `display_filename` | Sanitized basename, 1–240 characters. |
| `media_type` | Allowlisted PDF/PNG/JPEG/plain text. |
| `size_bytes` | > 0 and <= 10 MiB. |
| `sha256` | Lowercase 64-character digest. |
| `created_at` | Required timestamp. |

Indexes/constraints:

- Unique `(storage_bucket, storage_path)`.
- Index `(owner_user_id, thread_id, message_id)`.
- Maximum five attachments enforced in parser/service and mutation RPC.
- Private bucket only; no public object policy.

### `communication_notifications`

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `owner_user_id` | Required Owner Scope. |
| `recipient_user_id` | Required FK to `users`. |
| `thread_id`, `message_id` | Composite FKs to authorized source records. |
| `kind` | Baseline fixed to `new_message`. |
| `state` | `unread`, `read`, or `dismissed`. |
| `created_at`, `read_at`, `dismissed_at` | Lifecycle timestamps. |

Constraints/indexes:

- Unique `(owner_user_id, recipient_user_id, message_id, kind)` prevents duplicate notification creation.
- Index `(owner_user_id, recipient_user_id, state, created_at DESC, id DESC)`.
- State/timestamp consistency checks.

### `communication_preferences`

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `owner_user_id`, `user_id` | Required scope/user pair. |
| `in_app_enabled` | Boolean default true. |
| `email_enabled` | Boolean default false. |
| `created_at`, `updated_at` | Required timestamps. |

Constraints/indexes:

- Unique `(owner_user_id, user_id)`.
- No provider-specific, SMS, Slack, WhatsApp, digest, or routing columns.
- Missing row resolves to `in_app_enabled=true`, `email_enabled=false` without creating a record during a read.
- `in_app_enabled=false` suppresses creation of future notification rows only; thread unread state remains available. `email_enabled=false` suppresses future delivery rows. Changes are non-retroactive.

### `communication_deliveries`

A separate delivery job is required because durable retries and provider callbacks cannot be represented safely by messages or notifications alone.

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `owner_user_id`, `notification_id` | Scoped source notification FK. |
| `recipient_user_id` | Required recipient identity. |
| `channel` | `email` only in baseline. |
| `provider` | `resend` only in baseline. |
| `status` | `pending`, `processing`, `accepted`, `delivered`, `failed_retryable`, `failed_permanent`, `outcome_unknown`. |
| `terminal_reason` | Nullable allowlisted `known_permanent_failure`, `attempts_exhausted`, `bounced`, or `complained`. |
| `idempotency_key` | Stable server-generated key unique per notification/channel. |
| `provider_message_id` | Nullable provider identifier; unique per provider when present. |
| `attempt_count`, `max_attempts` | Non-negative; baseline max 3. |
| `next_attempt_at`, `lease_until` | Durable retry and worker lease state. |
| `last_error_code` | Nullable allowlisted sanitized code, never raw provider text. |
| `created_at`, `updated_at`, `accepted_at`, `delivered_at` | Lifecycle timestamps. |

Indexes/constraints:

- Unique `(owner_user_id, idempotency_key)`.
- Partial unique `(provider, provider_message_id)` when present.
- Worker index `(status, next_attempt_at, lease_until)`.
- State transition and timestamp checks.

### `communication_delivery_events`

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `owner_user_id`, `delivery_id` | Composite delivery FK. |
| `provider`, `provider_event_id` | Provider identity and unique event ID. |
| `event_type` | Normalized `accepted`, `delivered`, `failed`, `bounced`, or `complained`. |
| `payload_sha256` | Hash of raw bytes for replay evidence; raw payload is not persisted. |
| `safe_metadata` | Bounded sanitized JSON object; no addresses, content, headers, or secrets. |
| `occurred_at`, `created_at` | Provider and receipt timestamps. |

Constraints/indexes:

- Unique `(provider, provider_event_id)` for replay safety.
- Index `(owner_user_id, delivery_id, occurred_at, id)`.
- Insert-only to `service_role`; no user API returns event rows.

### Atomic mutation functions

Future migration functions are service-role-only and revoked from all browser/public roles:

1. `communication_create_thread(actor_user_id, owner_user_id, subject, participant_locators, initial_body, idempotency_key, request_sha256)`
   - Accepts Employee user locators and Client Portal membership locators; resolves Client users server-side and exposes no general recipient directory.
   - Rechecks Owner actor and every participant's authoritative Owner/Employee/Client relation.
   - Uses unique `(owner, actor, idempotency_key)` plus request hash to return the original thread on identical replay or raise conflict on different reuse.
   - Creates thread, fixed participants, sequence 1 message, preference-eligible recipient notifications, and email-enabled deliveries atomically.
2. `communication_send_message(actor_user_id, owner_user_id, thread_id, body, idempotency_key, request_sha256, attachment_metadata)`
   - Locks thread; rechecks the sender and every recipient against current authoritative eligibility; internally revokes stale participants.
   - Increments `last_sequence`, inserts message/attachments, inserts notifications only for recipients whose effective `in_app_enabled` is true, inserts deliveries only for eligible recipients whose `email_enabled` is true, and returns the existing result on identical idempotent replay or conflict on different reuse.
3. `communication_mark_read(actor_user_id, owner_user_id, thread_id, sequence)`
   - Checks participant and advances read sequence only.
4. `communication_set_notification_state(actor_user_id, owner_user_id, notification_id, state)`
   - Checks recipient and applies monotonic read/dismiss lifecycle.
5. `communication_upsert_preferences(actor_user_id, owner_user_id, in_app_enabled, email_enabled)`
   - Allows only the actor's own preference row.

Before any attachment upload, the service performs an idempotency preflight using `(owner, thread, actor, key, request hash)` and returns an existing result before touching storage. New objects use a stable server-derived operation prefix and deterministic ordinal/checksum paths with no-overwrite behavior. Attachment metadata is passed only after validation/upload. After the RPC returns—created or replayed—the service compares operation paths with internally returned committed attachment paths and removes only paths newly created by this request that are not referenced. On RPC failure it performs the same bounded cleanup. Storage paths are stripped before the user response, and no path from the browser is accepted.

## Delivery worker design

Phase 10 needs durable bounded retry but not a generic job framework.

- `communications.delivery.js` exposes one internal `processDueDeliveries(limit)` operation.
- A small API-lifecycle timer invokes it only when the server is enabled for communication delivery. It polls at a conservative fixed interval and is `unref()`'d for clean shutdown.
- Each worker transaction claims due rows using `FOR UPDATE SKIP LOCKED`, sets a short lease, and increments the attempt count.
- Provider calls happen outside the claim transaction. Completion updates require matching delivery ID and lease.
- The provider request carries the stable delivery idempotency key only when the verified adapter/provider contract supports it.
- A known retryable rejection schedules bounded backoff; attempt 3 becomes `failed_permanent` with `attempts_exhausted`.
- A timeout, lost response, or crash after dispatch but before durable acceptance creates an `outcome_unknown` state and is not automatically retried. Reconciliation must locate the provider result by the stable key or provider message ID. If Resend cannot provide safe idempotency/reconciliation, email delivery remains disabled.
- State precedence is explicit: `pending → processing → accepted → delivered`; `processing → failed_retryable → processing`; known permanent pre-acceptance failure → `failed_permanent`; provider `bounced` or `complained` → `failed_permanent` with that terminal reason and may supersede `accepted`/`delivered`. Late generic accepted/delivered/failure events cannot regress `delivered` or bounced/complained terminal state. `outcome_unknown` changes only after reconciliation.
- The worker is Communication-specific; it does not modify the legacy scheduler or introduce a reusable queue abstraction.

Implementation must validate that the deployment permits this lifecycle. If reliable timer execution cannot be guaranteed, provider email notification delivery remains disabled while the in-app Hub ships; it must not fall back to an in-memory retry queue.

## Webhook trust boundary

`POST /api/communications/webhooks/email/:provider` is mounted as a narrow exception before the JWT-authenticated communications router because provider callbacks cannot carry user JWTs.

Processing order:

1. Capture bounded raw bytes before JSON parsing.
2. Select a supported provider from an allowlist (`resend` baseline).
3. Verify required signature headers, timestamp tolerance, and signature over exact raw bytes using a server-only secret.
4. Parse only after verification; reject oversized or malformed payloads.
5. Extract provider event ID, provider message ID, event type, and occurred time through a provider-specific parser.
6. Find an existing delivery by provider/provider message ID; never trust owner/user/thread IDs from payload.
7. Insert normalized event with unique provider event ID and payload hash.
8. Apply the documented precedence in the same transaction: accepted may advance to delivered; known retryable/permanent failures apply only before accepted; bounced/complained may set terminal failed state after accepted/delivered; late generic events cannot regress delivered or bounced/complained terminal state; and `outcome_unknown` changes only through explicit reconciliation. Duplicate events return 200 without a second transition.
9. Return a generic response; log correlation ID and outcome only.

The current `integrations/webhook.service.js`, in-memory history, and permissive `verifySignature()` are not imported or modified.

## API design

All user routes use JWT authentication and `Cache-Control: private, no-store`. Lists use opaque cursors and fixed maximums. Mutation routes use actor-based rate limits.

| Method and path | Purpose | Authorization and notes |
|---|---|---|
| `GET /api/communications/threads?view=inbox|sent&cursor=&limit=` | Participant inbox/outbox | Derived scope + active participant; maximum 50. |
| `POST /api/communications/threads` | Create thread with fixed participants and initial message | Owner only; `Idempotency-Key` required. Body uses Employee user locators and Client Portal membership locators; the service resolves current users and supports no attachments on initial thread creation. |
| `GET /api/communications/threads/:threadId?beforeSequence=&limit=` | Thread header, participants, and bounded messages | Active participant only; maximum 100 messages. |
| `POST /api/communications/threads/:threadId/messages` | Send plain-text message with 0–5 files | Active participant; multipart/form-data; `Idempotency-Key` required. |
| `PUT /api/communications/threads/:threadId/read` | Advance caller read sequence | Active participant; idempotent body `{ sequence }`. |
| `GET /api/communications/threads/:threadId/attachments/:attachmentId/download` | Authorized attachment download | Active participant; returns short-lived URL or stream only. |
| `GET /api/communications/notifications?state=&cursor=&limit=` | Caller notification list | Recipient only; maximum 50. |
| `PATCH /api/communications/notifications/:notificationId` | Set `read` or `dismissed` | Recipient only; idempotent body `{ state }`. |
| `GET /api/communications/preferences` | Caller defaults/current preferences | Caller only. |
| `PUT /api/communications/preferences` | Update in-app/email booleans | Caller only; exact-field validation. |
| `POST /api/communications/webhooks/email/:provider` | Signed provider delivery callback | No JWT; strict provider signature/raw-body boundary. |

No participant-management, message edit/delete, notification creation, delivery admin, template admin, broadcast, campaign, search-all-messages, export, or realtime endpoint is included.

### Response projections

- Thread list: thread ID, subject, safe participant display labels, latest message safe preview, latest sequence/time, caller unread count.
- Thread detail: same header plus fixed participant projections and message rows (`id`, `sequence`, sender safe label/kind, body, attachment safe metadata, created time).
- Notifications: ID, kind, thread/message locators, safe title, state/timestamps, authorized route target.
- Preferences: two booleans only.
- No response includes `owner_user_id`, provider IDs, recipient email, storage bucket/path, checksums, raw error details, webhook data, or service metadata.

## Frontend design

### Routes and reuse

```text
/dashboard/communications  # Owner Workspace shell
/employee/communications   # Employee Portal shell
/client/communications     # Client Portal shell
```

A shared `CommunicationWorkspace` component, contracts, and API client may be reused inside these route-local shells. Authentication/session boundaries remain owned by each existing portal. The API—not route visibility—authorizes every operation.

### Minimum interface

- Two filters: Inbox and Sent.
- Thread list with safe participants, preview, timestamp, unread count, cursor pagination, loading/empty/error states.
- Thread detail with deterministic ordered pages and “load older” behavior.
- Plain-text composer; Owner-only new-thread dialog; attachment picker constrained before upload.
- Notification panel with unread/read/dismiss actions.
- Preferences panel with in-app and email toggles.
- No rich text, templates, bulk send, recipient directory browsing, typing indicators, presence, reactions, editing, deletion, or delivery-debug UI.

### Refresh behavior

No advanced realtime is added. While visible, the workspace polls thread/notification summaries at a conservative interval (recommended 15 seconds), refreshes on focus and successful send/read action, pauses while hidden, and merges by immutable IDs/sequences. Thread detail requests only messages with sequence greater than the local maximum or older than a cursor. Reconnect cannot reorder canonical sequence.

## Attachment/storage design

- Create private bucket `communication-private` in the future migration.
- Paths are server-generated: `<owner>/<thread>/<message-or-operation>/<uuid>`; paths are never authorization.
- Validate filename basename, extension, declared MIME, content signature, size, count, and checksum before upload.
- Render metadata only; force downloads and never inline-render HTML/SVG/executable content.
- The download service rechecks active participation each time and uses a short expiry (recommended 60 seconds).
- Message creation performs idempotency preflight before upload; stable no-overwrite operation paths plus post-RPC reference comparison remove only newly created unreferenced objects on response-loss, replay, race, or failure.
- No attachment listing outside thread detail and no general file endpoint.

## Error, audit, and observability design

- Validation: 400 with stable `VALIDATION_ERROR` and no provider/database detail.
- Missing/out-of-scope: uniform non-disclosing 404 or established 403 policy.
- Authentication: existing 401/refresh behavior.
- Duplicate/idempotent mutation: return original success; conflicting reuse of an idempotency key returns 409.
- Rate limit: 429 with safe retry metadata.
- Provider/storage/internal failures: generic 503/500 with correlation ID; no raw provider body or path.

Audit event examples: `communication.thread.create`, `communication.message.send`, `communication.thread.read`, `communication.notification.dismiss`, `communication.preference.update`, `communication.delivery.permanent_failure`, `communication.webhook.reject`. Audit details contain only safe status, participant count, attachment count, sequence, and correlation ID where needed—never message body, subject, filenames, addresses, provider IDs, payloads, or signatures.

## Retention decision

Phase 10 adds no automatic purge, delete endpoint, export, legal hold, or configurable retention. Message and evidence records remain durable; notification dismissal does not delete. This is explicit rather than an accidental forever-policy: later physical deletion requires approved data-governance requirements, cross-table/object cleanup, audit treatment, and Client/Employee rights analysis.

## Test design

### API/unit

- Scope resolver for Owner, active/inactive Employee, active/revoked/ambiguous Client.
- Exact validation, projections, cursor bounds, message content, idempotency conflict/replay, error sanitization, and capability matrix.
- Delivery preference evaluation, template safety, lease claims, retries, max attempts, and provider error mapping.

### PostgreSQL integration

Disposable local database only:

- All tables/RPCs RLS-enabled and service-role-only.
- Cross-owner, non-participant, and authoritatively revoked Employee/Client reads/writes and recipient fan-out denied.
- Invalid participant relationships and Client membership locators rejected.
- Concurrent send operations allocate unique monotonic sequences.
- Idempotent create/send returns one thread/message/notification/delivery set; conflicting key reuse returns conflict.
- Message content cannot be updated/deleted through granted paths.
- Read sequence advances only and cannot exceed thread sequence.
- Recipient-only notification lifecycle and preference ownership.
- Delivery lease/retry transitions, crash-after-dispatch `outcome_unknown`, reconciliation, and normalized event precedence/replay.
- Transaction rollback leaves no partial thread/message/notification state.

### Webhook

- Exact raw-body signature success and invalid/missing/stale failure.
- Unsupported provider, oversized/malformed body, unknown provider message ID.
- Duplicate provider event, out-of-order event, terminal-state non-regression.
- No raw payload/header/signature leakage in responses, logs, audit, or normalized metadata.

### Attachments

- Count/size/type/signature mismatch, safe filename, checksum, private path.
- Upload compensation on RPC failure, response loss, identical replay, and concurrent idempotent retry.
- Participant download and cross-owner/non-participant denial.
- Short-lived URL and no path exposure.

### Frontend

- Owner new-thread flow; Employee/Client cannot create but can reply in participant threads.
- Inbox/sent filters, pagination, ordered merge, unread/read state, notifications, preferences.
- Loading, empty, denied, unavailable, retry, and logout/user-transition clearing.
- Keyboard, focus, announcements, responsive layouts, and no persistent scoped browser storage.

### Regression

Run auth, Owner Workspace, Employee Portal, Client Portal, CRM, Finance, outreach, provider, webhook, lint, type-check, tests, build, migration reset, and `git diff --check`. Confirm legacy outreach rows/routes and public webhook behavior are not changed by Communication Hub work.

## Architecture review checklist

- **Duplicate data models:** one Communication model; legacy outreach remains separate; outbox is a query, not a table.
- **Duplicate routes:** one `/api/communications` API shared by three portal surfaces.
- **Unnecessary abstractions:** one module and one email delivery wrapper; no generic messaging/event/template/permission framework.
- **Cross-owner leakage:** Owner Scope on every row/FK/query plus active participant checks and non-disclosing failures.
- **Realtime:** polling only; advanced infrastructure deferred.
- **Providers:** Resend baseline behind existing generic adapter; SendGrid and omnichannel providers deferred.
- **Legacy authority:** no Communication FK/query/RPC references legacy outreach tables or public webhook handlers.
- **Attachments:** bounded files attached during send; no general storage manager.

## Roadmap update plan

After specification approval, update the roadmap only in a separately approved task to:

- **Phase 10 — Communication Hub: SPECIFICATION COMPLETE**
- **Implementation: NOT STARTED**
