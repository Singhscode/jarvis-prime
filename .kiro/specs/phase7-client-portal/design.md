# Phase 7 Client Portal Technical Design

## Overview
Phase 7 adds an external, read-only Client Portal at `/client`. It reuses the existing user credentials, JWT access tokens, HttpOnly rotating refresh cookie, login/refresh/logout endpoints, `client` role, CRM client/project/task records, `AppError`, logger, response envelopes, validation, and Repository → Service → Route layering. It does not alter those subsystems or expose existing internal CRM/Employee Portal routes to external users.

The smallest safe addition is a server-derived **Client_Member → CRM_Client** membership relation. A JWT with `role = client` becomes eligible for the portal only when one active membership resolves its subject to one CRM client. Every client portal read, document download, invitation activation, and internal owner operation independently verifies this relationship.

## Architecture

### Component Diagram
```text
Client browser
  ├─ /client (in-memory token + existing refresh cookie)
  ├─ /client/activate (existing account/verification flow, then invitation redemption)
  └─ Authorization: Bearer access JWT + credentials: include
                         │
                         ▼
Express app
  ├─ existing auth router: login, refresh, logout, registration, verification
  ├─ CRM owner router: invitation/document publication controls
  └─ clientPortalRouter
       ├─ existing JWT middleware → existing `client` role middleware
       ├─ Client Portal service (resolves membership on every request)
       ├─ CRM repository additions (combined Client_Scope predicates)
       ├─ auth repository audit helpers
       └─ Supabase service-role client
             ├─ users / sessions / refresh tokens (unchanged)
             ├─ crm_clients / crm_projects / crm_tasks (read-only)
             ├─ client_portal_memberships / invitations / documents (additive)
             ├─ audit_logs (existing)
             └─ private client-portal Storage bucket (signed downloads only)
```

### Boundary Decisions
- `createClientScope` is not used: it accepts request-supplied IDs and is unsuitable for external authorization.
- Existing owner CRM routes and Employee Portal routes remain unchanged. Client portal routes are additive and return reduced projections only.
- Existing JWT claims remain unchanged. Client scope is database-derived each request and is never embedded in a token or accepted from client input.
- Client Portal performs no task/project mutations, storage uploads, messaging, notification feed, billing, or employee/owner operations.
- Onboarding reuses the existing public registration/email verification/login lifecycle. Invitation redemption requires a logged-in, active account whose normalized email matches the pending membership; it creates no separate account or session mechanism.

## Components and Interfaces

### Client Portal Interfaces
| Route | Consumer | Contract |
|---|---|---|
| `GET /api/client-portal` | Active Client_Member | Returns one minimal Client_Snapshot. |
| `POST /api/client-portal/activate` | Active authenticated `client` account | Consumes an invitation token and atomically activates its matching pending membership. |
| `GET /api/client-portal/documents/:documentId/download` | Active Client_Member | Returns a short-lived authorized download URL or a non-disclosing denial. |
| `POST /api/crm/clients/:clientId/portal-invitations` | Existing CRM owner | Creates/replaces an invitation for one client contact; delivers it server-side. |
| `POST /api/crm/clients/:clientId/portal-members/:membershipId/resend` | Existing CRM owner | Revokes prior usable invitation and sends one replacement. |
| `DELETE /api/crm/clients/:clientId/portal-members/:membershipId` | Existing CRM owner | Revokes pending/active external membership and its usable invitations. |
| `POST /api/crm/clients/:clientId/portal-documents` | Existing CRM owner | Server-controlled private document publication only. |
| `DELETE /api/crm/clients/:clientId/portal-documents/:documentId` | Existing CRM owner | Removes client visibility and revokes future signed downloads. |

All successful new routes retain `{ success: true, data }`; errors use existing `AppError` handling and response envelopes.

## Data Models


### Database Impact Analysis
Phase 7 requires one additive canonical migration under `database/supabase/migrations/`. It does not alter `users`, sessions, refresh tokens, existing CRM tables, Employee Portal tables/RPC, or existing endpoint behavior.

| Addition | Purpose and constraints |
|---|---|
| `client_portal_memberships` | Binds a CRM client contact and normalized invitation email to one future/active `users` row. Fields: `id`, `crm_client_id`, `contact_id`, nullable `user_id`, `email_normalized`, `status` (`pending`, `active`, `revoked`), `created_by_user_id`, timestamps, `activated_at`, and `revoked_at`. A partial unique index permits exactly one active membership per user; a client/contact cannot have competing usable memberships. |
| `client_portal_invitations` | Holds only `token_hash`, `membership_id`, `created_by_user_id`, `expires_at`, `consumed_at`, `revoked_at`, and timestamps. It stores no raw invitation value. One usable invitation exists per pending membership after create/resend. |
| `client_portal_documents` | Holds private document metadata: `id`, `crm_client_id`, optional `project_id`, `storage_bucket`, `storage_path`, `title`, `document_type` (`deliverable` or `report`), `client_visible`, `created_by_user_id`, `created_at`, `revoked_at`. Storage path is server-only and has a unique index per bucket/path. |
| Private Storage bucket | `client-portal-private` has no public access policy. Only the API service role publishes objects, generates 60-second download URLs, and deletes compensating objects after failed publication. |
| RPC functions | Security-definer functions with `set search_path = ''` implement invitation create/replace, invitation activation, membership revocation, and document metadata publication with related audit insertion. Execute privilege is restricted to `service_role`. |

All new tables enable RLS with no browser-facing policies; the API accesses them through the existing service-role client. Foreign keys ensure membership/document client references, contact-to-client ownership, project-to-client association where present, and audit actor references. The migration contains only additive tables, indexes, constraints, and functions; it includes no destructive operations, reset, trigger, or change to existing roles.

### Atomic Onboarding and Publication Operations
1. **Create/resend invitation RPC:** locks the target CRM client contact and existing usable invitation rows; verifies `crm_clients.owner_user_id = p_owner_user_id`; revokes prior usable invitations; upserts the pending membership; stores only the token hash; inserts the audit event; returns invitation metadata but not the raw token.
2. **Activate invitation RPC:** locks the invitation and membership; verifies token hash, expiry, non-revocation, unconsumed status, a matching active `users` record with `role = client`, normalized email equality, and absence of another active membership; sets `membership.user_id`, activates membership, consumes invitation, and writes audit in one transaction.
3. **Revoke membership RPC:** verifies CRM ownership, marks membership revoked, revokes all usable invitations, and writes audit atomically. Existing JWT/session behavior is not modified; the next portal request fails because it re-resolves membership.
4. **Publish document RPC:** verifies CRM owner and optional in-scope project; inserts client-visible metadata and audit after the service has uploaded a generated object key. If metadata publication fails, the service deletes the uploaded private object as compensation.

## Correctness Properties

### Property 1: Exactly-One Derived Client Scope
Every successful Client_Portal_API request has one active membership whose `user_id` equals the JWT subject and whose Client_Scope is its server-side `crm_client_id`; zero or multiple active memberships deny the request before any portal resource query.

**Validates: Requirements 1.1, 1.2, 1.4, 9.1**

### Property 2: Client-Scoped Resource Non-Disclosure
Every project, task, document, and signed-download lookup combines the resolved Client_Scope with the requested resource predicate. Missing and inaccessible resources return the same portal resource response without metadata.

**Validates: Requirements 1.3, 5.1, 5.4, 6.4**

### Property 3: Atomic Invitation Lifecycle
Invitation create/resend, activation, and revocation leave no observable partial state: active membership, invitation consumption/revocation, and audit outcome agree after each successful or failed operation.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 8.3**

### Property 4: Private Document Release
A document is downloadable only when the active Client_Member and the document share Client_Scope at signing time. Browser code receives a short-lived URL, never a storage key or service credential.

**Validates: Requirements 4.1, 6.1, 6.2, 6.3, 6.4**

## Security Model
- Existing JWT validation runs before the existing `client` role middleware. The Client Portal service still reloads membership for every request; a valid token alone grants no data.
- Client scope is not added to JWT claims, persisted in browser storage, accepted through `x-client-id`, inferred from a path/query/body parameter, or cached between users.
- Internal invitation/document actions verify `crm_clients.owner_user_id = req.user.sub` in the same server-side operation. An external member cannot use its `client` role to administer a CRM client.
- Activation accepts an invitation only after the user completed existing registration/email verification/login and presents a JWT whose normalized email matches the pending membership. Invalid token, expiry, reuse, mismatch, and revocation share one generic activation result.
- Raw invitations are generated with existing secure token generation, delivered only by server-side email, hashed before persistence, redacted in logs, captured from the activation URL into transient memory, and removed from the displayed URL before portal navigation.
- Private documents are uploaded to a generated server-side path, restricted to approved deliverable/report types and a server-enforced size/content-type allowlist, and issued as 60-second signed URLs only after combined scope authorization. Client browsers do not receive Storage credentials or public object URLs.
- Audit events record safe actor/resource/outcome metadata for membership, invitation, document, and denied cross-scope actions. They never contain passwords, raw invitations, tokens, signed URLs, or document contents.
- The portal retains existing CORS, credentialed fetch, HttpOnly/Secure/SameSite refresh cookie, rate-limiting, session revocation, and account-lockout behavior. It introduces no new authentication scheme.

## Permission Model
| Actor / state | Allowed | Denied |
|---|---|---|
| No JWT | Existing public registration, verification, login, password reset, activation guidance | Snapshot, activation redemption, document URL, membership/invitation state |
| Active `client` account with zero/multiple/revoked membership | Existing account/session actions only | All Client_Portal_API data, downloads, and client resource details |
| Exactly-one active Client_Member | Safe snapshot, own projects/tasks, own approved document URLs, existing logout/refresh | Any mutation, another client, owner/employee identity, assignment, notes, leads, CRM routes, Employee Workspace, Storage paths, messages, invoices, and administration |
| Existing CRM owner (`owner_user_id`) | Existing CRM behavior plus new invitation/document publish/revoke operations for owned CRM clients | Client data administration outside owned CRM clients, raw invitation persistence, client-supplied authorization |
| Employee | Existing Employee Portal behavior only | Client Portal data/administration unless separately a qualifying Client_Member; no role bypass |

## Repository Design
New repository functions remain in `apps/api/src/modules/crm/crm.repository.js`, keeping Client Portal backend behavior within the existing CRM module.

| Method group | Responsibilities |
|---|---|
| `getActiveClientPortalMembership(userId)` | Returns only one active membership projection (`id`, `crm_client_id`, `user_id`, status) or `null`; service rejects ambiguous results. |
| `getClientPortalSnapshot(clientId)` | Returns explicit safe CRM client, project, task, and visible document metadata projections scoped by `crm_client_id`; no `select('*')`. |
| `getClientPortalDocument(clientId, documentId)` | Combines client/document/visibility/revocation predicates and returns only server-side signing metadata. |
| `getOwnedClientContact(ownerId, clientId, contactId)` | Verifies existing client ownership and contact-to-client binding before invitations. |
| invitation/membership RPC wrappers | Invoke create/replace, activate, and revoke RPCs with service-generated token hashes; translate no raw provider errors. |
| document publication wrappers | Generate Storage object access through the service client, call metadata RPC, and delete the generated object if publication fails. |

No client portal repository method accepts an owner/client ID from browser input as its scope. Route identifiers are used only as resource locators after scope resolution.

## Service Design
`crm.service.js` gains focused Client Portal functions; existing CRM and Employee Portal methods remain unchanged.

- `getClientPortal(userId)`: resolves exactly one membership, obtains Client_Snapshot with safe projections, maps data failures to `INTERNAL_ERROR`.
- `activateClientPortalMembership(userId, values)`: validates the one allowed invitation field, hashes it with existing crypto, invokes the atomic activation RPC, and maps every invalid invitation state to one generic activation error.
- `getClientPortalDocumentDownload(userId, documentId)`: validates UUID, resolves membership, loads combined-scope document metadata, produces a 60-second signed URL, and audits success/failure safely.
- `inviteClientPortalMember(ownerUserId, clientId, values)`, `resendClientPortalInvitation(...)`, and `revokeClientPortalMembership(...)`: validate identifiers/allowlisted fields, call atomic RPCs, then use the existing server-side notification/email integration. Email delivery failure leaves the invitation state auditable and returns a generic operational error; retry occurs only through explicit resend.
- `publishClientPortalDocument(ownerUserId, clientId, file, values)` and `revokeClientPortalDocument(...)`: validate owner scope, metadata/type/size, publish private storage, compensate on metadata failure, and never return raw paths.

The service uses existing `AppError`, strict allowed-field helpers, UUID validation, `requiredText`, logger, and generic error translation. It introduces no generic portal framework or shared client-scope middleware.


## API Design

### Client-Facing API
| Endpoint | Request | Success response | Authorization |
|---|---|---|---|
| `GET /api/client-portal` | None | `{ client, projects, tasks, documents }` with safe fields only | Existing JWT + `client` role + exactly-one active membership |
| `POST /api/client-portal/activate` | `{ invitation: string }` exactly | `{ activated: true }` | Existing JWT + `client` role; atomic email-matched invitation redemption |
| `GET /api/client-portal/documents/:documentId/download` | UUID path parameter | `{ url, expiresAt }` | Existing JWT + `client` role + active membership + combined document scope |

`Client_Snapshot` fields are deliberately narrow:
```text
client:    { id, name }
projects:  [{ id, name }]
tasks:     [{ id, project_id, name, completed }]
documents: [{ id, project_id?, title, document_type, created_at }]
```
No endpoint returns `owner_user_id`, `assigned_user_id`, contact data, internal status, storage path, audit data, email addresses, or other client records.

### Internal CRM Owner API
| Endpoint | Request | Response | Server-side check |
|---|---|---|---|
| `POST /api/crm/clients/:clientId/portal-invitations` | `{ contact_id }` exactly | `{ membership: { id, status, expires_at } }` | CRM client exists and is owned by `req.user.sub`; contact belongs to that CRM client |
| `POST /api/crm/clients/:clientId/portal-members/:membershipId/resend` | Empty body | Same safe membership metadata | Membership belongs to owned CRM client and remains pending |
| `DELETE /api/crm/clients/:clientId/portal-members/:membershipId` | None | `{ success: true }` | Membership belongs to owned CRM client |
| `POST /api/crm/clients/:clientId/portal-documents` | Narrow multipart metadata/file request | Safe document metadata | CRM client ownership; generated storage key; allowed type/size |
| `DELETE /api/crm/clients/:clientId/portal-documents/:documentId` | None | `{ success: true }` | Document belongs to owned CRM client |

These are additive routes only. Existing `GET /api/crm/clients`, `GET /api/projects`, task routes, `/api/employee-portal`, and authentication routes retain their contracts and visibility.

## Route Design
`crm.routes.js` remains the sole CRM module route file, matching Phase 6. It exports one additional `clientPortalRouter` mounted by `app.js` at `/api/client-portal`; the existing default CRM router continues at `/api/crm` and receives the owner-only invitation/document endpoints.

```text
clientPortalRouter
  use(existing createAuthMiddleware())
  use(existing createAuthorizationMiddleware('client'))
  GET    /                         → crm.getClientPortal(req.user.sub)
  POST   /activate                 → crm.activateClientPortalMembership(req.user.sub, req.body)
  GET    /documents/:documentId/download → crm.getClientPortalDocumentDownload(req.user.sub, req.params.documentId)

existing CRM router
  POST   /clients/:clientId/portal-invitations
  POST   /clients/:clientId/portal-members/:membershipId/resend
  DELETE /clients/:clientId/portal-members/:membershipId
  POST   /clients/:clientId/portal-documents
  DELETE /clients/:clientId/portal-documents/:documentId
```

The owner routes continue to use existing JWT middleware; the service/RPC performs the authoritative `owner_user_id` check rather than trusting the router role or path. Request validators reject every unlisted field. The upload route is the only new multipart surface; it is bounded by one file, generated file name, fixed document types, file-size limit, and no caller-supplied Storage path.

## Frontend Architecture

### Route-Local Structure
```text
apps/web/src/app/client/
  page.tsx                         # controller: in-memory token, refresh, request/retry, snapshot, logout
  activate/page.tsx                # captures invitation transiently; guides existing registration/login/verification then redemption
  components/
    ClientSignIn.tsx               # accessible existing-login form
    ClientWorkspace.tsx            # dashboard shell, states, client project/task/document sections
    ClientTopNav.tsx               # refresh/logout/theme controls
    ClientProjectList.tsx          # read-only project/task rendering
    ClientDocumentList.tsx         # on-demand signed-download action
    ClientActivation.tsx           # activation/recovery states only
```

`page.tsx` mirrors the Employee Portal controller: access token in a `useRef`, one refresh promise, `credentials: 'include'`, `Authorization` bearer header, exactly one retry on 401, snapshot held only in React state, and a final logout/error path that clears all client data. It calls only the new Client_Portal_API endpoints.

`activate/page.tsx` reads the invitation from the initial URL into component memory, removes it from the address bar with browser history replacement, and never writes it to local/session storage. It sends the value only in the authenticated activation POST body. Registration, email verification, login, refresh, and logout continue to call the existing auth endpoints; the page introduces no custom token handling.

`ClientWorkspace` renders safe project/task/document data, skeletal loading, `role="alert"` error state, accessible empty guidance to the account owner, and responsive layouts. Document download is a user-initiated action that first requests a URL, immediately navigates to it, and does not retain the URL in component state. There is no shared portal framework, state library, cached data layer, message UI, upload UI, or mutation UI.

## Error Handling
| Condition | Result |
|---|---|
| Missing/invalid JWT | Existing `401` authentication response. |
| Valid JWT with non-`client` role or invalid membership cardinality/status | Existing non-disclosing `403 INSUFFICIENT_PERMISSIONS`; no snapshot. |
| Missing/inaccessible project, task, or document | Same `404` client portal resource response, with no ownership/existence detail. |
| Invalid/replayed/expired/revoked/mismatched invitation | Same generic `400 INVALID_ACTIVATION`; no membership/account/client detail. |
| Invalid route/body/file metadata | Existing `400 VALIDATION_ERROR`, `INVALID_FIELDS`, or `EMPTY_UPDATE`, without sensitive state. |
| Owner route for unowned CRM client/contact/member/document | Existing non-disclosing `404` resource response. |
| Storage/database/email unexpected error | Logged with redacted safe context; client receives `500 INTERNAL_ERROR`; no raw provider/database error. |

The service logs denied cross-scope actions using safe IDs only. It never logs request authorization headers, cookies, raw invitation strings, signed URLs, password material, document contents, or full browser request bodies.

## Testing Strategy
- **Focused API unit tests:** auth/role gates; exact-one membership resolution; snapshot projections; no client input scope; combined client/project/task/document queries; generic missing-vs-inaccessible errors; strict validation; invitation replay/expiry/revocation/mismatch; owner isolation; audit redaction.
- **Focused PostgreSQL integration tests:** partial uniqueness/cardinality; invitation create/resend/revoke/activate atomicity; activation rollback on audit failure; owner/contact/project/document scope checks; private RPC execution privilege; generic cross-client errors; document metadata rollback/compensating storage deletion.
- **Focused frontend tests:** login/refresh/logout behavior; no persistent client cache; activation URL removal; loading/error/empty states; on-demand document link; keyboard/focus/accessible-name behavior; mobile/tablet/desktop layout.
- **Regression gates:** existing API, auth, CRM, Employee Portal, root lint/test/build, diagnostics, and `git diff --check` remain required and unchanged.

## Risks and Mitigations
| Risk | Mitigation |
|---|---|
| Existing `client` role represents both internal owners and external clients | Treat membership as the sole external entitlement; no membership means no Client Portal data. |
| Request-supplied client IDs cause IDOR | Never use `createClientScope`; derive membership from JWT subject and combine scope predicates in every query/RPC. |
| Supabase JS lacks multi-step transactions | Use narrowly scoped service-role security-definer RPCs for invitation/membership/audit state; compensate private object upload if metadata publication fails. |
| Invitation link leakage/replay | Hash at rest, 24-hour expiry, one-time use, resend revocation, generic failure, URL cleanup, no logging, and audit outcome. |
| Signed download URL remains usable briefly after membership revocation | Limit it to 60 seconds, issue only after current membership validation, and disable future signing immediately. |
| New multipart upload parser adds attack surface | Keep one owner-only upload endpoint, pin and review one parser dependency before implementation, stream with size/type limits, and generate storage keys server-side. |
| Existing email delivery integration may fail | Persist/audit invitation state before sending; return generic operational error; require explicit resend instead of exposing a raw token. |
| Scope creep into collaboration/billing | Explicitly exclude it; any future scope needs separate approved requirements/design. |

## Implementation Boundary and Estimated Size
Implementation begins only after explicit approval. It will create one canonical additive migration, one focused Client Portal API test file, one focused local PostgreSQL integration test file, and route-local client frontend files. It will modify only the existing CRM repository/service/routes, app router mounting, and any narrowly necessary server-side email/Storage adapter. The existing auth routes/services, Employee Portal files, CRM endpoint behavior, migrations, infrastructure, and deployment workflows remain unchanged.

| Area | Estimated lines |
|---|---:|
| Additive SQL migration: memberships, invitations, documents, indexes, RLS, four RPCs | 280–360 |
| CRM repository/service/routes and app mount | 520–680 |
| Focused API and PostgreSQL integration tests | 650–850 |
| Route-local Client Portal frontend | 450–600 |
| Small pinned multipart parsing adapter/configuration, if no existing parser can safely serve owner publication | 80–130 |
| **Total** | **1,980–2,620** |

This is intentionally larger than Phase 6 because it establishes external membership isolation, invitation lifecycle, private Storage authorization, and the negative test coverage needed before customer data is exposed. No implementation code, migration, API change, infrastructure change, deployment, commit, tag, or push is made by this design activity.
