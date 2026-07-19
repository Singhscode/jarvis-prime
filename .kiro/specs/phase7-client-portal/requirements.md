# Requirements Document

## Introduction
Phase 7 adds a minimal, browser-based Client Portal for external client members to securely view their own CRM client, projects, tasks, and approved documents. It reuses the existing password, JWT access token, refresh-token cookie, logout, CRM records, audit logging, and Employee Portal security principles. It does not redesign authentication, CRM, or the Employee Portal; it does not expose internal CRM tools, employee data, leads, owner data, or administrative functions.

## Glossary
- **Client_Member**: An active authenticated user with the existing `client` role and an active server-side membership bound to exactly one CRM_Client.
- **CRM_Client**: The existing `crm_clients` record that owns a client-visible project set.
- **Client_Scope**: The CRM_Client identifier resolved by the server from the JWT subject's active Client_Member record; never from client input.
- **Client_Portal_API**: Dedicated authenticated routes for the Client Portal; it does not reuse owner CRM list routes or Employee_Portal_API routes.
- **Client_Snapshot**: The minimal client-scoped dashboard response containing safe client identity, projects, tasks, and approved document metadata.
- **Portal_Document**: A private document explicitly linked to a CRM_Client and made available through a short-lived server-authorized download URL.
- **Invitation**: A single-use, expiring, hashed onboarding credential bound to one pending Client_Member and CRM_Client.

## Requirements

### Requirement 1: Establish Client Membership and Authorization
**Classification:** Functional, security, permission model.
**User Story:** As a Client_Member, I want access derived from my authenticated identity, so that I can never select or discover another client's data.
#### Acceptance Criteria
1. WHEN a valid JWT whose subject identifies a user with the existing `client` role is presented, THE Client_Portal_API SHALL load exactly one active Client_Member bound to that JWT subject and derive its Client_Scope solely from server-side data before processing any portal-resource read or write.
2. IF JWT validation fails, the JWT role is not `client`, or the JWT subject has zero or more than one active Client_Member binding, THEN THE Client_Portal_API SHALL reject the request before portal-resource processing using the existing applicable authentication or authorization failure behavior, return no Client_Snapshot or resource metadata, and make no portal-resource write.
3. THE Client_Portal_API SHALL derive Client_Scope only from the active Client_Member bound to the JWT subject and SHALL not use a client, owner, membership, or user identifier supplied in a header, query parameter, route parameter, or body to select Client_Scope or authorize access. It MAY use a supplied project, task, or document identifier only to locate that resource after applying the resolved Client_Scope as a server-side authorization predicate.
4. Existing internal `client`-role users without exactly one active Client_Member binding SHALL receive no external Client Portal data; membership, not role alone, establishes portal entitlement.

### Requirement 2: Onboard and Activate Client Members Safely
**Classification:** Functional, security, audit.
**User Story:** As an authorized internal CRM owner, I want to invite a client contact into one CRM_Client scope, so that external access is created deliberately and safely.
#### Acceptance Criteria
1. WHEN an authenticated internal CRM owner whose JWT subject equals the target CRM_Client's existing `owner_user_id` initiates an invitation, THE Client_Onboarding_API SHALL create a pending Client_Member bound to that CRM_Client and exactly one target account, and issue one Invitation expiring 24 hours after issuance. Its raw value SHALL be displayed or delivered only for that operation and never persisted or logged.
2. WHEN an authorized internal CRM owner resends an Invitation for a pending Client_Member, THE Client_Onboarding_API SHALL revoke every unconsumed Invitation previously issued for that Client_Member before issuing exactly one replacement Invitation. IF that owner revokes an Invitation, THEN the API SHALL prevent its redemption.
3. WHEN an unexpired, unconsumed, unrevoked Invitation is redeemed by its bound target account, THE Client_Onboarding_API SHALL reuse the existing password/account, JWT, refresh-token, and session lifecycle and SHALL atomically activate only the invited Client_Member while consuming that Invitation. Client_Scope remains server-derived and is not added to JWT claims or a separate token/session mechanism.
4. IF an Invitation is expired, consumed, revoked, malformed, or redeemed by another account, THEN THE Client_Onboarding_API SHALL return the same generic activation-failure result, leave the Client_Member inactive, create no Client_Scope entitlement, and reveal no CRM_Client, membership, account, or invitation details.
5. THE Client_Onboarding_API SHALL audit invitation creation, resend, revocation, activation success, and activation failure, including the authenticated internal actor for internal operations and the target Client_Member, without raw invitation values, password material, JWTs, refresh tokens, or session secrets.

### Requirement 3: Preserve Existing Login, Refresh, and Logout
**Classification:** Functional, security.
**User Story:** As a Client_Member, I want a familiar secure session flow, so that I can access the portal without a separate authentication system.
#### Acceptance Criteria
1. THE Client Portal SHALL reuse existing `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, password policy, lockout, rate limiting, JWT claims, in-memory access token, HttpOnly refresh cookie, rotation, and session revocation behavior.
2. THE portal SHALL retain no access token, refresh token, password, invitation value, Client_Snapshot, or Client_Scope in persistent browser storage or a shared client-side cache.
3. IF refresh, logout, or authenticated portal loading fails, THEN the UI SHALL clear in-memory client data, present an accessible generic recovery state, and never display stale client-scoped data.

### Requirement 4: Provide One Read-Only Client Dashboard
**Classification:** Functional, privacy, accessibility.
**User Story:** As a Client_Member, I want a concise view of my active work, so that I can understand progress without access to internal CRM operations.
#### Acceptance Criteria
1. WHEN an authorized Client_Member loads the Client Portal, THE Client_Portal_API SHALL return one Client_Snapshot containing only safe fields from the resolved CRM_Client, its projects, its tasks, and approved Portal_Documents.
2. THE dashboard SHALL provide clear loading, error, empty, and refreshed states; an empty state SHALL explain that no client-visible projects, tasks, or documents are available.
3. THE dashboard SHALL show no CRM leads, prospects, companies, contacts, campaigns, employee identities, employee assignments, internal notes, internal audit records, owner identifiers, revenue data, automation data, or administrative controls.
4. Client-scoped responses SHALL not be persisted, prefetched into a shared cache, or reused after logout, membership revocation, scope change, or another user login.


### Requirement 5: Limit Project and Task Visibility to the Client Scope
**Classification:** Functional, security, permission model.
**User Story:** As a Client_Member, I want to view only projects and tasks for my CRM_Client, so that I can track work without changing internal delivery operations.
#### Acceptance Criteria
1. THE Client_Portal_API SHALL list and retrieve only projects whose existing `client_id` equals the resolved Client_Scope, using combined server-side scope predicates for every query.
2. THE Client_Portal_API SHALL return only tasks belonging to an in-scope project and SHALL expose explicit client-safe fields only; it SHALL not expose assignment, employee, owner, internal workflow, audit, or hidden task fields.
3. Client_Members SHALL have read-only access to their visible projects and tasks; they SHALL not create, edit, complete, reopen, delete, assign, or reassign projects or tasks.
4. IF a project or task is missing, outside Client_Scope, malformed, or inaccessible, THEN the API SHALL return the same non-disclosing resource response and no existence, ownership, count, or timing information.

### Requirement 6: Provide Private Read-Only Document Access
**Classification:** Functional, security, privacy.
**User Story:** As a Client_Member, I want to download documents explicitly approved for my CRM_Client, so that I can access deliverables without access to storage internals.
#### Acceptance Criteria
1. A Portal_Document SHALL be visible only when it is explicitly linked to the resolved Client_Scope and marked client-visible by an authorized internal workflow.
2. THE Client_Portal_API SHALL authorize the Client_Member and Portal_Document scope before issuing a short-lived download URL; Storage buckets/objects SHALL not be public and raw object paths/keys SHALL never be trusted from the browser.
3. Client_Members SHALL not upload, replace, delete, relink, enumerate, or access documents belonging to another client, project, employee, owner, or internal process.
4. Missing, expired, revoked, malformed, and out-of-scope document requests SHALL have the same non-disclosing response. Successful document access and denied access attempts SHALL be audited without logging document content or signed URLs.

### Requirement 7: Constrain Communication and Notifications
**Classification:** Functional, scope boundary, privacy.
**User Story:** As a Client_Member, I want clear portal scope, so that I do not mistake internal operational tools for a client communication channel.
#### Acceptance Criteria
1. Phase 7 SHALL provide transactional onboarding, invitation, activation, password-reset, and security-session email only through approved server-side delivery paths.
2. Phase 7 SHALL provide no client-to-owner messaging, client-to-employee messaging, comments, chat, shared inbox, public notification feed, read receipts, push notifications, or notification preferences.
3. Existing prospect outreach, internal notifications, Telegram, Slack, WhatsApp, campaign messages, and operational notification logs SHALL remain inaccessible to Client_Members.
4. The dashboard empty state SHALL direct a Client_Member to the approved out-of-portal support contact when no portal communication function is available.

### Requirement 8: Preserve Privacy, Ownership, and Audit Boundaries
**Classification:** Non-functional, security, privacy, audit.
**User Story:** As a CRM owner, I want client data ownership and portal actions to remain accountable, so that external access does not weaken tenant isolation.
#### Acceptance Criteria
1. CRM_Client ownership remains with the existing internal `owner_user_id`; Client_Members receive client-scoped read access only and gain no owner, employee, CRM administration, analytics, automation, or Employee Workspace capability.
2. THE system SHALL retain the distinction between website `public.leads`, normalized `crm_leads`, CRM_Client data, and Client Portal data; none becomes client-visible unless explicitly required by this specification.
3. THE system SHALL audit client membership lifecycle actions, invitation lifecycle actions, client authentication outcomes already captured by auth, successful document downloads, and denied cross-scope access attempts with actor, action, safe resource type/identifier, outcome, and timestamp.
4. Audit records and operational logs SHALL redact passwords, raw invitations, JWTs, refresh tokens, signed URLs, document contents, and personally sensitive content beyond what is necessary for the approved audit event.

### Requirement 9: Preserve Session Security and Error Handling
**Classification:** Non-functional, security, reliability.
**User Story:** As a Client_Member, I want secure and understandable failures, so that I can recover without learning sensitive system details.
#### Acceptance Criteria
1. Client Portal authorization SHALL be re-evaluated server-side for every protected request; a previously loaded snapshot does not authorize a later request.
2. IF membership is revoked, disabled, changed, or no longer resolves to one Client_Scope, THEN the next protected request SHALL return no client data and the browser SHALL clear its in-memory state.
3. Invalid input SHALL return the existing applicable validation response; unexpected failures SHALL return a generic internal error and log safe diagnostic context server-side.
4. The Client Portal SHALL distinguish accessible recovery guidance from sensitive denial detail: it may direct a user to sign in again, retry, or contact support, but SHALL not reveal other-client data or permission topology.

### Requirement 10: Support Accessible, Responsive, Performant Use
**Classification:** Non-functional, accessibility, performance.
**User Story:** As a Client_Member, I want the portal to work on desktop and mobile with assistive technology, so that I can access my work reliably.
#### Acceptance Criteria
1. THE Client Portal SHALL support current mobile, tablet, and desktop browsers with responsive layouts and no feature loss caused by viewport size.
2. Interactive controls, navigation, loading/error/empty states, document links, and authentication forms SHALL be keyboard-operable, have accessible names, preserve visible focus, and communicate state changes to assistive technology.
3. The portal SHALL request only the minimal Client_Snapshot and load document URLs on demand; it SHALL avoid client-scoped persistent caching, background polling without a user-visible purpose, and unnecessary full-page reloads.
4. Under normal supported network conditions, initial authenticated snapshot rendering SHALL target completion within 2.5 seconds at the 75th percentile, excluding a user-initiated document download.

### Requirement 11: Preserve a Small, Extensible Boundary
**Classification:** Non-functional, future extensibility, scope boundary.
**User Story:** As a maintainer, I want a small portal boundary that can grow safely, so that later invoices, messaging, and collaboration do not compromise Phase 7 isolation.
#### Acceptance Criteria
1. THE Client_Portal_API SHALL remain separate from owner CRM routes and Employee_Portal_API routes, with explicit minimal projections and server-derived Client_Scope.
2. The first release SHALL not include invoices, payments, billing, files uploads, task edits, project edits, messaging, analytics, settings beyond existing auth behavior, user management, owner tools, employee tools, or generic portal abstractions.
3. Future invoices, messages, uploads, notification preferences, and multi-client membership SHALL require separately approved requirements, permission review, data model, API, audit, and isolation tests before implementation.
4. The implementation SHALL reuse existing auth/session and CRM semantics where possible; it SHALL not change existing endpoint behavior or broaden existing internal CRM endpoint visibility to serve external clients.

### Requirement 12: Validate the Client Portal Security Boundary
**Classification:** Non-functional, testing, security.
**User Story:** As a maintainer, I want focused evidence of client isolation, so that portal changes remain auditable.
#### Acceptance Criteria
1. Focused tests SHALL cover unauthenticated access, non-client roles, inactive/pending/revoked membership, multiple active memberships, invitation expiry/replay, activation success/failure, refresh/logout, and client-scoped snapshot loading.
2. Focused tests SHALL cover cross-client project, task, document, invitation, membership, route-identifier, query-parameter, header, and storage-key tampering attempts, asserting the same non-disclosing response for missing and inaccessible resources.
3. Focused tests SHALL cover zero client data before successful activation, zero persisted client data after logout/revocation, safe empty/error states, keyboard operation, and responsive layout behavior.
4. Existing API, auth, CRM, and Employee Portal test suites SHALL remain passing without changed behavior.

## Permission Model
| Actor | May access | Must never access |
|---|---|---|
| Unauthenticated visitor | Client Portal sign-in, invitation activation, password-reset entry points | Any Client_Snapshot, document, project, task, invitation state, membership state, or internal record |
| Pending or revoked Client_Member | Activation/recovery guidance only | Any client-scoped portal data or signed document URL |
| Active Client_Member | One resolved CRM_Client's safe dashboard, projects, tasks, approved documents, existing session/logout controls | Other clients, CRM internals, leads, prospects, contacts, employee data, assignments, internal notes, owner tools, Employee Workspace, admin functions, writes, uploads, messaging, invoices until future approval |
| Internal owner/employee | Existing internal functionality only, unchanged by Phase 7 | Client Portal authorization by client-supplied scope or any new external capability not separately authorized |

## User Journeys
1. **Invitation and activation:** Internal operator initiates an invitation for one client contact → contact receives a generic secure invitation → contact activates an account through the existing session model → active membership resolves one Client_Scope → the initial Client_Snapshot is available.
2. **Returning client:** Client visits Client Portal → refresh obtains an in-memory access token when a valid session exists, otherwise login is shown → snapshot loads → client views projects/tasks and downloads an approved document → client logs out → portal clears in-memory data.
3. **No available work:** Client signs in successfully → snapshot contains no visible projects/tasks/documents → accessible empty state explains that no client-visible items are available and provides the approved support route.
4. **Denied/tampered request:** Client alters an identifier, header, query, path, or storage reference → server resolves Client_Scope from membership, not input → combined-scope query returns the generic non-disclosing response → safe denial audit event is recorded.
5. **Revoked access:** Operator revokes membership → next portal request fails closed → browser clears its snapshot and presents generic sign-in/support guidance.

## Risks
- **Tenant isolation failure:** Mitigated by an explicit membership-to-CRM_Client relation, server-derived scope on every request, combined predicates, uniform denial responses, and negative authorization tests.
- **Role ambiguity:** The existing `client` role alone cannot establish external access; an active membership is mandatory and internal users without one are denied.
- **Invitation compromise or replay:** Mitigated by hashed, single-use, expiring invitations, atomic activation, rate limits, safe audit records, and generic failures.
- **Document disclosure:** Mitigated by private Storage, metadata-to-scope validation, short-lived signed URLs, no public object paths, and download auditing.
- **Stale browser data:** Mitigated by in-memory-only state, no client-scoped cache, clearing on logout/errors, and scope checks per request.
- **Scope growth:** Messaging, invoices, uploads, and multi-client accounts are excluded rather than introduced through generic abstractions.

## Assumptions
1. The existing `users` role value `client` can be retained for Client_Members without changing JWT/session behavior; membership, rather than the role alone, binds external access to CRM_Client data.
2. One Client_Member is bound to one CRM_Client for the initial release; multi-client access is deferred.
3. Existing CRM projects retain their `client_id` relationship and tasks remain project-scoped.
4. Document metadata and private Storage access do not currently exist and will require a later, approved implementation design; no existing Storage object is assumed client-visible.
5. Invitation delivery uses an approved server-side transactional email path; no raw invitation is placed in logs or client-visible configuration.

## Default Decisions Applied
1. Empty and error states direct Client_Members to their account owner through the existing approved out-of-portal support channel; Phase 7 adds no portal messaging or contact-directory feature.
2. The initial client-visible document classes are approved deliverables and reports only. Proposals, internal workpapers, personnel files, invoices, messages, and unclassified objects are not client-visible.
3. Invitations use the existing approved transactional sender identity and a minimal generic activation message; sender branding/copy remains presentation content and does not change authentication or authorization.
4. No unresolved architectural decision blocks the requirements phase. The Technical Design phase will specify the smallest membership, invitation, document-metadata, route, and UI implementation consistent with these requirements.