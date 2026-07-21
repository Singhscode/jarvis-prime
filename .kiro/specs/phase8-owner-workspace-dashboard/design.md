# Phase 8 Owner Workspace (Dashboard) Technical Design

## Status and Approval Boundary
**Technical design only.** This document creates no implementation, migration, API, authentication, portal, test, CI, deployment, infrastructure, commit, tag, or push change. Implementation planning requires explicit approval.

## Overview
The Owner Workspace remains inside the existing `apps/web` Next.js application at `/dashboard`. It adds a route-local shell and a narrow authenticated Workspace API facade while preserving the existing Repository → Service → Route architecture.

The Owner, Employee, and Client use one existing authentication platform: login, JWT access token, refresh token, HttpOnly refresh cookie, session, logout, password policy, lockout, and refresh lifecycle. Phase 8 creates no Owner login, token, cookie, session, role, membership, claim, or entitlement mechanism. Authorization differs by route and continues to use existing server-side scope. The browser never sends `NEXT_PUBLIC_AUTOMATION_SECRET`, `x-automation-secret`, or browser-selected owner/client scope.

The backend is split by responsibility:

- **CRM remains the domain owner** for companies, contacts, leads, clients, projects, tasks, assignments, Client Portal invitations, memberships, and publication/revocation.
- **Owner Workspace is an orchestration/read-model boundary** for bootstrap, overview, attention, global search, employee oversight, safe audit history, and redacted system status.
- **Employee Portal and Client Portal remain unchanged.** Their routes, permissions, response projections, session behavior, and user journeys are not reused as owner endpoints.
- **Later roadmap capabilities remain unavailable or read-only.** Finance, communication, automation control, analytics, AI management, production configuration, and enterprise security are not implemented by Phase 8.

## 2. Current-State Integration
The current `/dashboard` presentation uses a legacy HMAC `portal_token` route gate and a simulated Next.js BFF. Phase 8 does not extend that token, create another Owner authentication path, or treat it as Owner authorization. The Owner Workspace uses the existing shared login, JWT, refresh-cookie, session, and logout lifecycle.

For business-data scope, existing CRM and project routes derive the server-side owner key from `req.user.sub` after JWT verification and repositories apply `owner_user_id` predicates. The Owner Workspace reuses that authenticated-subject-to-owner-scope flow: the authenticated Owner’s `req.user.sub` is passed server-side to CRM and Owner Workspace service methods; the browser never selects it. The Owner is not modeled as a Client Portal member and Client Portal membership is never used to grant or deny Owner access.

Future RBAC expansion, new roles, owner membership tables, settings-based entitlements, token claims, or a new authorization framework are out of scope for Phase 8 and require separate approved future work.

## 3. Design Principles
1. **Reuse before addition:** call existing CRM services and Client Portal lifecycle methods; do not reimplement business rules in React or Owner Workspace services.
2. **Existing trust boundary:** the dedicated `/api/owner-workspace` router uses existing JWT middleware, derives the existing CRM owner scope from `req.user.sub`, and passes only that server-derived value downstream.
3. **Explicit APIs, not a generic admin framework:** each route has a fixed projection, filter allowlist, validation contract, and resource-specific service method.
4. **Source-backed UI:** every metric contains availability, source label, time window, and freshness. Missing data is unavailable, never fabricated or coerced to zero.
5. **Additive compatibility:** existing `/api/crm`, `/api/projects`, `/api/employee-portal`, and `/api/client-portal` contracts remain unchanged.
6. **Memory-only browser state:** access tokens and owner-scoped data are not stored in localStorage, sessionStorage, IndexedDB, service-worker caches, or shared persistent client caches.
7. **Progressive capability exposure:** navigation may identify deferred modules, but unavailable capabilities cannot issue hidden requests or offer enabled actions.

## Architecture

### Overall Application Architecture

```text
Browser: existing Next.js application
┌──────────────────────────────────────────────────────────────────────┐
│ /dashboard nested layout                                             │
│ OwnerSessionBoundary → OwnerWorkspaceShell                           │
│ Sidebar / Topbar / Search / Notifications / Main route outlet        │
│                                                                      │
│ Route-local pages and components                                     │
│ Overview · CRM · Clients · Projects · Tasks · Employees · Documents  │
│ Audit · Settings                                                     │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTPS, credentials: include
                               │ Bearer access token held in memory
                               ▼
Express API
┌──────────────────────────────────────────────────────────────────────┐
│ /api/auth              existing login/refresh/logout, unchanged      │
│ /api/owner-workspace   existing JWT middleware → routes              │
│                               │                                      │
│            ┌──────────────────┴───────────────────┐                  │
│            ▼                                      ▼                  │
│ Owner Workspace Service                    CRM Service                │
│ overview/search/audit/status               existing mutations +      │
│ employee read model                        additive bounded reads     │
│            │                                      │                  │
│            ▼                                      ▼                  │
│ Owner Workspace Repository                CRM Repository              │
│ explicit scoped aggregates/search         existing scoped methods +  │
│                                            explicit paged methods     │
└──────────────────────────────┬───────────────────────────────────────┘
                               ▼
                Existing Supabase/PostgreSQL/Storage
```

The Owner Workspace router is mounted before shared-secret `/api` middleware, next to the JWT-authenticated CRM and portal routers. Automation shared-secret middleware remains separate and is never considered owner authentication.

## 5. Route Hierarchy

| Browser route | Purpose | Initial Phase 8 state |
|---|---|---|
| `/dashboard` | Overview, attention queue, KPIs, recent activity, safe health | Core |
| `/dashboard/crm` | Companies, contacts, leads, relationship views | Core within existing fields |
| `/dashboard/clients` | Client list, conversion/create path, portal status | Core |
| `/dashboard/clients/[clientId]` | Client detail, contacts, projects, portal lifecycle, documents | Core |
| `/dashboard/projects` | Project list, filters, creation | Core within existing fields |
| `/dashboard/projects/[projectId]` | Project detail and project tasks | Core |
| `/dashboard/tasks` | Cross-project owner task list and approved quick changes | Core read; bounded existing writes |
| `/dashboard/employees` | Read-only employee oversight | Core read-only |
| `/dashboard/employees/[employeeId]` | Assignments, workload, safe activity | Core read-only |
| `/dashboard/documents` | Owner-scoped Client Portal document inventory | Core read; publishing via client context |
| `/dashboard/audit` | Safely attributable owner-scope audit events | Core, limited by attributable sources |
| `/dashboard/settings` | Redacted capability and environment status | Read-only |

No separate top-level owner routes are added. Existing `/leads` and `/tasks` are not silently redirected or redesigned by this phase. Migration or retirement of those legacy pages is a separate approval decision.

## Components and Interfaces

### Route-Local Frontend Architecture

```text
apps/web/src/app/dashboard/
├── layout.tsx                         # nested Owner Workspace boundary
├── page.tsx                           # overview composition
├── loading.tsx                        # route-shell skeleton
├── error.tsx                          # route-level recoverable error
├── crm/page.tsx
├── clients/page.tsx
├── clients/[clientId]/page.tsx
├── projects/page.tsx
├── projects/[projectId]/page.tsx
├── tasks/page.tsx
├── employees/page.tsx
├── employees/[employeeId]/page.tsx
├── documents/page.tsx
├── audit/page.tsx
├── settings/page.tsx
├── components/
│   ├── OwnerSessionBoundary.tsx
│   ├── OwnerWorkspaceShell.tsx
│   ├── OwnerSidebar.tsx
│   ├── OwnerTopbar.tsx
│   ├── MobileNavigation.tsx
│   ├── GlobalOwnerSearch.tsx
│   ├── QuickActions.tsx
│   ├── NotificationCenter.tsx
│   ├── PageHeader.tsx
│   ├── DataTable.tsx
│   ├── FilterBar.tsx
│   ├── PaginationControls.tsx
│   ├── LoadingState.tsx
│   ├── ErrorState.tsx
│   ├── EmptyState.tsx
│   └── UnavailableState.tsx
└── lib/
    ├── owner-api-client.ts
    ├── owner-contracts.ts
    └── owner-route-state.ts
```

Module-specific components remain beside their routes or under `components/<module>/` only when reused by more than one owner route. Nothing is moved into global `apps/web/src/components` unless it is demonstrably shared outside the Owner Workspace.

### 6.1 Owner Session Boundary
`OwnerSessionBoundary` reuses the existing `/api/auth/login`, `/api/auth/refresh`, and `/api/auth/logout` lifecycle exactly. It follows the proven Client Portal transport behavior:

- access token in a React ref/memory only;
- refresh cookie sent with `credentials: 'include'`;
- one shared in-flight refresh promise;
- one retry after a protected 401;
- clear all owner state after refresh failure, scope denial, or logout;
- no persistent scoped data or token storage;
- no automation secret or client-selected owner ID.

It first requests `GET /api/owner-workspace/bootstrap` through the existing authenticated session. The bootstrap response establishes only route capability and safe display metadata; it does not create, alter, or duplicate Owner authentication. Login, password policy, lockout, token rotation, refresh, sessions, and logout are not reimplemented.

### 6.2 Shared Owner Workspace Shell
The nested `layout.tsx` owns the persistent shell: skip link, sidebar, top bar, route breadcrumb, global search trigger, quick-action trigger, notification trigger, session menu, and main content outlet. The shell remains mounted across owner navigation; route data does not.

The global `PortalNav` must not render inside `/dashboard/**` once the nested shell exists. This is presentation isolation only. The global root layout remains the single application layout, and Employee/Client Portal rendering is unchanged.

### 6.3 Navigation
Primary navigation order:

1. Overview
2. CRM
3. Clients
4. Projects
5. Tasks
6. Employees
7. Documents
8. Audit
9. Settings

Each item uses exact-path or segment-aware active state, icon plus text, visible focus, and `aria-current="page"`. Capability metadata from bootstrap controls whether an item is enabled, read-only, or unavailable. Authorization is never inferred from hidden navigation.

Deferred Finance, Communication, Automation, Analytics, and AI modules are omitted from primary navigation in the baseline. If product approval requires discoverability, they appear only in Settings → Capabilities with a clear future-phase label.

### 6.4 Dashboard Layout
Desktop uses a 12-column grid:

- top row: page title, freshness, refresh action;
- KPI row: 3–6 source-backed cards;
- main left (8 columns): attention queue and recent activity;
- main right (4 columns): notifications/status and system health;
- lower row: client/project/task operational summaries.

Cards never animate continuously, use color as the sole status indicator, or show fake trends. Each card exposes a definition, time window, `asOf`, availability state, and permission-checked drill-down.

### 6.5 Responsive Behavior
- **≥1280px:** persistent 240–280px sidebar, full top bar, multi-column overview.
- **768–1279px:** compact sidebar, two-column cards, search as expandable dialog.
- **<768px:** sidebar becomes a modal drawer; cards and panels stack; tables use priority columns plus an accessible row-detail disclosure rather than horizontal information loss.
- Opening a drawer/dialog moves focus inside; closing returns focus to its trigger. Background content is inert while a modal surface is active.
- No owner capability is removed solely because of viewport size.

## 7. Frontend State Strategy
Every route renders one of five explicit states: `loading`, `ready`, `empty`, `unavailable`, or `error`.

- **Loading:** shell appears immediately; route-level skeleton matches final geometry; controls that require data remain disabled.
- **Empty:** confirms successful, authorized loading and explains how records enter that view; it does not suggest unavailable actions.
- **Unavailable:** source/capability is not configured, not approved, or lacks a safe source; this is distinct from zero.
- **Error:** includes safe recovery guidance, request correlation ID when supplied, and a bounded retry action.
- **Ready:** can contain partial section availability; failed sections do not erase successfully loaded sections.

Filter, sort, cursor, and selected tab state may be encoded in the URL. Sensitive query content, access tokens, snapshots, invitation values, signed URLs, and record bodies are never persisted. Mutations use disabled-while-submitting controls and do not automatically retry unless the operation is explicitly idempotent.

## 8. Permission and Scope Model

### 8.1 Request Pipeline
Every `/api/owner-workspace/**` request follows this existing pattern:

1. `createAuthMiddleware()` verifies the existing access JWT and sets `req.user`.
2. The route derives `ownerUserId` server-side from `req.user.sub`, matching existing CRM and project scope handling.
3. Route validation parses only allowlisted fields, filters, cursors, and resource locators.
4. Service methods receive the server-derived `ownerUserId`, never a value from headers, query, route body, cookies, or client state.
5. Repository queries combine `owner_user_id = ownerUserId` with every requested resource relationship.

The browser may supply a resource ID only as a locator. Nested resources require all parent and child scope predicates. Missing and out-of-scope records return the same resource-specific 404. Aggregate counts, search matches, audit events, and notifications are scoped before counting or ranking.

### 8.2 Shared Authentication Platform
There is one authentication platform shared by Owner, Employee, and Client: existing login, JWT, refresh token, HttpOnly refresh cookie, session, logout, password policy, lockout, and refresh lifecycle. Owner Workspace does not add a separate authentication concept or reinterpret Client Portal membership as Owner access.

Authorization differs by existing route and data scope. The Owner Workspace uses the same authenticated-subject-to-CRM-owner-scope convention as existing CRM services. Any future RBAC expansion is future scope and does not alter this Phase 8 design.

### 8.3 Legacy Route Constraint
The legacy `portal_token` is not Owner identity, Owner scope, or Owner API authorization. The Owner Workspace browser session uses the existing shared JWT/refresh lifecycle; legacy `/leads`, `/tasks`, and `/portal-auth` behavior stays outside Phase 8.

### 8.4 Least Privilege
- Owner APIs expose fixed field projections, never `select('*')` responses.
- Employee and client users cannot access owner routes even if they guess IDs.
- Service-role database credentials stay server-side.
- Signed document URLs remain on-demand and transient.
- Shared-secret automation routes are never called by browser owner code.
- Deferred module controls are absent or disabled at both UI and API layers.

## Correctness Properties
### Property 1: Owner Isolation
Every protected read, count, search, audit event, association, and mutation is constrained by the server-resolved Workspace Scope before data is returned or changed.

**Validates: Requirements 1.1, 1.3, 20.1**

### Property 2: No Authority From Input
Changing a header, cookie, query, route parameter, request body, filter, cursor, or resource ID cannot change server-derived Workspace Scope or authorize access beyond the existing authenticated subject’s records.

**Validates: Requirements 1.2, 20.5**

### Property 3: Non-disclosure
A missing record and an out-of-scope record produce equivalent resource behavior without cross-owner counts, timing detail, search suggestions, or metadata.

**Validates: Requirements 1.4, 16.2, 16.3**

### Property 4: Source Fidelity
Unavailable, stale, partial, or unsupported data can never be represented as a current zero, success, healthy state, trend, or completed workflow.

**Validates: Requirements 7.2, 7.4, 19.2**

### Property 5: Portal Invariance
Owner Workspace behavior cannot broaden Client Portal or Employee Portal projections, permissions, session behavior, routes, or user actions.

**Validates: Requirements 9.3, 10.2, 22.2**

### Property 6: Bounded Retrieval
Every new collection, search, dashboard section, and activity feed has a server-enforced projection, stable order, and maximum result bound.

**Validates: Requirements 8.3, 16.3, 19.1**

### Property 7: Transient Browser Scope
Logout, denied entitlement, failed refresh, or identity transition clears owner-scoped browser memory before another state is rendered.

**Validates: Requirements 1.7, 1.8, 20.5**

### Property 8: Single-sourced Business Rules
Owner facade routes delegate CRM and Client Portal mutations to their existing services; duplicated browser or owner-service validation never becomes authoritative.

**Validates: Requirements 9.2, 9.3, 21.2, 21.3**

## Data Models

### API Contracts and Snapshot Strategy
All successful responses retain the project convention:

```json
{ "success": true, "data": {} }
```

Errors retain the centralized shape:

```json
{ "error": { "code": "RESOURCE_NOT_FOUND", "message": "Resource not found.", "requestId": "optional" } }
```

Paged collections use:

```json
{
  "items": [],
  "pageInfo": { "nextCursor": null, "hasNextPage": false },
  "applied": { "sort": "created_at:desc", "filters": {} },
  "asOf": "2026-07-21T12:00:00.000Z"
}
```

Source-backed values use:

```json
{
  "status": "available",
  "value": 12,
  "source": "crm_clients",
  "window": "current",
  "asOf": "2026-07-21T12:00:00.000Z"
}
```

Allowed statuses are `available`, `stale`, `unavailable`, and `not_configured`. A reason code may be returned, but provider exceptions, SQL details, environment values, and secret names are not.

### Snapshot Policy
- `GET /dashboard` is one bounded aggregate snapshot for above-the-fold data, not a dump of every module.
- Independent repository calls run in parallel and return section-level availability.
- Maximum recent activity and attention items are fixed (recommended 10 each).
- Full lists load from their module routes only after navigation.
- No automatic 30-second polling. Manual refresh is always available; an optional visibility-aware refresh interval of at least 60 seconds may be approved later for health-only sections.
- Snapshot responses use `Cache-Control: private, no-store`; no service-worker or shared CDN caching of owner data.

## 10. Backend Module Placement

```text
apps/api/src/modules/
├── crm/
│   ├── crm.repository.js      # existing + explicit bounded/detail reads
│   ├── crm.service.js         # existing + bounded/detail contracts
│   └── crm.routes.js          # existing routes unchanged
└── owner-workspace/
    ├── owner-workspace.repository.js
    ├── owner-workspace.service.js
    └── owner-workspace.routes.js
```

`owner-workspace.repository.js` contains only owner orchestration/read-model queries: dashboard aggregates, employee oversight, search, safely attributable audit, and redacted status. It does not recreate CRM mutations.

`owner-workspace.service.js` coordinates those reads, attaches source/freshness metadata, builds safe partial-availability responses, and delegates CRM mutations to exported `crm.service.js` methods.

`owner-workspace.routes.js` owns the JWT + owner-scope middleware chain and explicit owner facade endpoints. It is mounted in `app.js` before shared-secret middleware. Existing CRM and portal routers remain mounted exactly as they are.

## 11. Existing Backend Reuse Inventory

### 11.1 CRM and Core Delivery
| Domain | Existing endpoint | Existing service/repository reuse | Design treatment |
|---|---|---|---|
| Companies | `GET/POST /api/crm/companies`, `PATCH/DELETE /api/crm/companies/:id` | `listCompanies`, `createCompany`, `updateCompany`, `deleteCompany` | Reuse create/update rules; add bounded safe list/detail reads. Physical delete is not presented as archive. |
| Contacts | `GET/POST /api/crm/contacts`, `PATCH/DELETE /api/crm/contacts/:id` | `listContacts`, `createContact`, `updateContact`, `deleteContact`, ownership checks | Reuse create/update and duplicate/FK error semantics; add bounded safe list/detail. |
| Leads | `GET/POST /api/crm/leads`, `DELETE /api/crm/leads/:id` | `listLeads`, `createLead`, `deleteLead`, `ownedContactExists` | Reuse current lead creation; add bounded/detail reads. Pipeline, tags, stage, merge, and archive are future scope. |
| Clients | `GET/POST /api/crm/clients`, `PATCH/DELETE /api/crm/clients/:id` | `listClients`, `createClient`/`convertLeadToClient`, `updateClient`, `deleteClient` | Preserve conversion-only creation and name-only update. Add bounded/detail read. Deactivation/archive remain future scope. |
| Client contacts | `/api/crm/clients/:clientId/contacts` | `listClientContacts`, `createClientContact`, `updateClientContact`, `detachClientContact` | Reuse all current semantics behind owner facade. |
| Projects | `GET/POST /api/projects`, `PATCH/DELETE /api/projects/:id` | `listProjects`, `createProject`, `updateProject`, `deleteProject`, ownership checks | Reuse create/name update; add bounded/detail read. Archive/status/budget/milestones are future scope. |
| Tasks | `/api/projects/:projectId/tasks` | `listTasks`, `createTask`, `updateTask`, `deleteTask`, `getActiveEmployeeById` | Reuse create/name/completed/assignment rules; add cross-project bounded owner read. Priority/deadline/dependency/bulk/archive are future scope. |

The browser does not call legacy routes directly because the Owner Workspace facade centralizes its fixed projections, pagination, and route-local HTTP contract. The facade delegates to the same exported service methods, so validation, ownership checks, error translation, and RPC usage remain single-sourced.

### 11.2 Client Portal Administration
| Operation | Existing endpoint | Existing service/repository reuse | Additive need |
|---|---|---|---|
| Invite | `POST /api/crm/clients/:clientId/portal-invitations` | `inviteClientPortalMember`, `reissueClientPortalInvitation` | Secure owner facade only |
| Resend | `POST /api/crm/clients/:clientId/portal-members/:membershipId/resend` | `resendClientPortalInvitation` | Secure owner facade only |
| Revoke membership | `DELETE /api/crm/clients/:clientId/portal-members/:membershipId` | `revokeClientPortalMembership` service/RPC | Secure owner facade only |
| Publish document | `POST /api/crm/clients/:clientId/portal-documents` | existing Busboy bounds, `publishClientPortalDocument`, private Storage/RPC | Reuse parser as a shared route helper or equivalent single implementation; secure facade |
| Revoke document | `DELETE /api/crm/clients/:clientId/portal-documents/:documentId` | `revokeClientPortalDocument` | Secure owner facade only |
| Portal snapshot/download | `/api/client-portal/**` | Client-only scope resolver and safe projections | Never reused as owner routes |

The missing read is one owner-scoped portal administration snapshot listing safe membership status, current invitation status/expiry, portal status, and owner-visible published/revoked document metadata. Raw token hashes, invitation values, emails outside the owned client context, storage paths, signed URLs, and document content are excluded.

### 11.3 Employee Portal
Existing `GET /api/employee-portal` and `PATCH /api/employee-portal/tasks/:taskId` remain employee-only. Their service methods `getEmployeePortal` and `completeEmployeeTask` are not called to build owner views because their projection and authorization are employee-specific.

The owner employee view reuses only the underlying ownership relation (`users.portal_owner_user_id`) and current task assignment relation (`crm_tasks.assigned_user_id`) through new read-only, owner-scoped repository methods. Existing `getActiveEmployeeById(employeeId, ownerId)` continues to validate assignment writes.

**Employee creation, deactivation, password reset, credential handoff, role change, availability editing, and performance scoring: Future approved implementation required.**

### 11.4 Existing Capabilities Not Reused Directly
- `/api/analytics/**` is shared-secret authenticated, accepts caller-selected `clientId`, and contains incomplete/cross-scope computations. It is not a safe Owner Workspace source.
- `/api/scheduler/**` supports run/toggle actions and process-local status. Only a future redacted read adapter may use `listJobs`; no control is exposed in Phase 8.
- Public `/health` and `/health/deep` reveal more deployment/provider detail than the Owner Workspace needs. A dedicated redacted status projection is used instead.
- `notify`/`alertEvent` dispatch externally but do not persist notification state. They are not a notification-center repository.
- `apps/web/src/app/api/dashboard/stats/route.ts` is simulated and is retired from the Owner Workspace data path.
- `apps/web/src/lib/api-client.ts` uses browser-visible automation credentials and is not used by the Owner Workspace.

## 12. Minimum Additive Owner API
All paths below are under `/api/owner-workspace` and use the owner request pipeline. “Facade” means a thin route that delegates to existing CRM service logic; it does not duplicate domain logic.

### 12.1 Workspace Reads
| Method and path | Purpose | Backing |
|---|---|---|
| `GET /bootstrap` | Safe display identity and capability states | Existing authenticated subject and CRM owner scope |
| `GET /dashboard?window=today` | KPI cards, attention, recent activity, safe health | New bounded owner read model |
| `GET /search?q=&types=&limit=` | One scoped global search | New explicit type-specific search service |
| `GET /employees?cursor=&limit=&sort=&q=` | Read-only employee oversight | Existing users owner relation + assignments |
| `GET /employees/:employeeId` | Employee assignment/workload detail | New bounded owner read model |
| `GET /documents?cursor=&limit=&clientId=&projectId=&status=` | Client Portal document inventory | Existing portal document metadata, owned-client predicate |
| `GET /audit?cursor=&limit=&actorType=&eventType=&from=&to=` | Safely attributable audit history | Existing audit records with explicit scope attribution |
| `GET /settings/status` | Redacted capability/provider status | Existing config/provider checks, boolean/status projection only |

No `/notifications` mutation endpoint is added in the baseline because there is no persisted notification source, unread state, dismissal model, or retention rule. `NotificationCenter` presents current attention items and an explicit “notification history not configured” state. Persistent notifications remain a Phase 10 approval.

### 12.2 CRM Facade and Bounded Reads
| Method and path | Treatment |
|---|---|
| `GET/POST /crm/companies`, `GET/PATCH /crm/companies/:id` | New paged/detail reads; existing create/update service methods |
| `GET/POST /crm/contacts`, `GET/PATCH /crm/contacts/:id` | New paged/detail reads; existing create/update methods |
| `GET/POST /crm/leads`, `GET /crm/leads/:id` | New paged/detail reads; existing create method |
| `GET/POST /clients`, `GET/PATCH /clients/:clientId` | New paged/detail reads; existing lead-conversion/name-update methods |
| `GET/POST /clients/:clientId/contacts`, `PATCH/DELETE /clients/:clientId/contacts/:contactId` | Existing client-contact services |
| `GET/POST /projects`, `GET/PATCH /projects/:projectId` | New paged/detail reads; existing create/name-update methods |
| `GET /tasks`, `GET /tasks/:taskId` | New owner-scoped cross-project paged/detail reads |
| `GET/POST /projects/:projectId/tasks`, `PATCH /projects/:projectId/tasks/:taskId` | Existing project task services |

Physical DELETE routes for companies, contacts, leads, clients, projects, and tasks are intentionally not added to the Owner Workspace facade. Existing deletion behavior is destructive and cannot satisfy approved archive/deactivate requirements. Archive, restore, and retention are future approved data-lifecycle scope; physical DELETE is never relabelled as archive.

### 12.3 Client Portal Facade
| Method and path | Treatment |
|---|---|
| `GET /clients/:clientId/portal` | New safe owner portal-administration snapshot |
| `POST /clients/:clientId/portal-invitations` | Existing invitation service |
| `POST /clients/:clientId/portal-members/:membershipId/resend` | Existing resend service |
| `DELETE /clients/:clientId/portal-members/:membershipId` | Existing revoke service |
| `POST /clients/:clientId/portal-documents` | Existing bounded upload/publication service |
| `DELETE /clients/:clientId/portal-documents/:documentId` | Existing revoke service |

Invitation and publication responses retain existing minimal projections. The new portal snapshot uses fixed fields such as membership ID, contact display identity, status, invitation expiry, activation timestamp if safely available, document ID/title/type/project/publication/revocation timestamps. It never returns invitation/token hashes or storage authority.

### 12.4 Quick Action Mapping
| Quick action | Backing | Baseline state |
|---|---|---|
| Create Project | `POST /projects` facade → existing `createProject` | Enabled after client selection |
| Create Task | `POST /projects/:projectId/tasks` → existing `createTask` | Enabled after project selection |
| Invite Client | Existing Client Portal invitation method | Enabled in owned client context |
| Create Employee | None | **Future approved implementation required.** |
| Upload Document | Existing Client Portal publication flow | Enabled only with owned client and approved type |
| Run Automation | Existing shared-secret scheduler route is not owner-safe | Disabled; Phase 11 |

## 13. Module Designs

### 13.1 Dashboard
The dashboard service returns independent sections so one unavailable source does not fail the whole page:

- **Overview cards:** active clients, active employees, open projects, open tasks, completed tasks. Revenue and today’s meetings are `unavailable` until approved authoritative sources exist.
- **Attention queue:** unassigned incomplete tasks, degraded database/API status, pending/expiring Client Portal invitations where safely derivable. Overdue, dependency-blocked, invoice, and AI alerts remain unavailable without source fields.
- **Recent activity:** only audit events that can be proven to belong to Workspace Scope.
- **Notifications:** current attention items rendered as transient actionable notices; no persisted read/dismiss semantics.
- **Business KPIs:** current operational counts only, not Phase 12 trends or inferred growth.
- **System health:** database reachability, scheduler configured/active state, and provider configured states through redacted labels. “Configured” is never labelled “healthy.”

Counts use database count queries with owner predicates, not full-list loading. All sections include `asOf`; failures map to section-level `unavailable` plus server-side redacted logs.

### 13.2 CRM
The page uses tabs or segmented navigation for Companies, Contacts, and Leads. Each has server-side search, allowlisted filters, stable sorting, cursor pagination, and a detail drawer/page. Existing fields define the baseline. Pipeline stages, tags, merges, relationship history beyond attributable audit, archive, and restore are labelled unavailable.

Create/edit forms use module-specific schemas and existing service validation. The UI does not generate a generic record editor. Lead-to-client conversion remains the only client creation path because that is the current approved service behavior.

### 13.3 Projects
The baseline project view contains identity, owned client association, task summary, and current name edit/create behavior. Timeline, milestones, budget, files, progress models, archive/restore, and employee-project association beyond task assignment remain future scope because no confirmed authoritative fields support them.

### 13.4 Tasks
The global task view is an additive bounded read over owned tasks with project/client context. Existing mutations support name, completion, and active employee assignment. Kanban may group by `completed` only; calendar/timeline, priority, dependency, deadline, bulk changes, and richer statuses remain unavailable until their models are approved. Owner completion does not alter Employee Portal’s justified completion RPC.

### 13.5 Clients
Client list/detail reuses current CRM ownership and conversion semantics. Detail composes contacts, projects, portal state, published documents, and attributable activity. “Deactivate” and “archive” are not aliases for physical deletion.

### 13.6 Employees
Employee list/detail is read-only and shows active existing employees linked through `portal_owner_user_id`, directly assigned tasks, referenced projects, completed/open assignment counts, and source freshness. Availability and performance are not inferred from task count. Employee Portal routes and components are not imported.

**All employee lifecycle and credential-management controls display: “Future approved implementation required.”**

### 13.7 Documents
The baseline inventory is limited to `client_portal_documents` that can be joined to an owned CRM client. Publishing and revocation reuse Phase 7. Versioning, approval workflow, replacement, general internal documents, retention, deletion, malware scanning, and owner download require separate document-lifecycle approval. Revoked metadata may remain visible to an owner for history but never produces a client download URL.

### 13.8 Audit
The audit service returns only events whose actor/resource can be attributed to Workspace Scope by an explicit event-specific rule. It does not return arbitrary `audit_logs` rows or raw `details`. Unsupported event classes are excluded, not guessed. Broader audit coverage requires future approved data-model work and is not part of the Phase 8 baseline.

### 13.9 Global Search
One endpoint fans out in parallel to seven explicit scoped search functions: companies, contacts, clients, employees, projects, tasks, and documents. Each applies owner scope before `ILIKE`, uses a fixed safe projection, and returns at most five results by default (20 maximum per type). Results are grouped by type with stable ordering. Empty or unsupported types do not leak counts.

No generic external index is introduced. If query plans exceed the performance target, type-specific indexes require a separately approved migration; until then minimum query length, strict caps, and debounce provide the smallest mitigation.

### 13.10 Settings
Settings is read-only. It can display company capability states, database reachable/unavailable, selected providers configured/not configured, scheduler active/disabled, application mode, and source timestamp only if approved safe. It never returns environment variable names/values, API keys, domains administration, permission editing, role editing, integration secrets, or infrastructure mutation.

### 13.11 Notifications
There is no current persisted notification domain. The baseline panel presents attention items and source status from the dashboard snapshot only. Unread counts, dismissal, history, announcements, delivery preferences, and real-time transport are deferred to Phase 10. No fake localStorage-backed notification state is introduced.

## 14. Query, Pagination, Filtering, and Sorting Design

### Cursor Pagination
Default page size is 25; maximum is 100. Cursors are opaque, URL-safe encodings of the last stable sort tuple, normally `(created_at, id)`. The server validates cursor shape and that its sort matches the current request. Lists sort by an allowlist only; arbitrary column names are rejected.

### Filter Allowlist
- CRM: safe text query, company/client relation, created date.
- Clients: text query and portal-status availability where derivable.
- Projects: text query and owned client ID.
- Tasks: text query, owned project/client ID, completion, assigned employee ID.
- Employees: text query and active status only.
- Documents: owned client/project ID, approved document type, publication/revocation state.
- Audit: bounded date range, event type, outcome, attributable actor type.

Every supplied relation ID is combined with `owner_user_id`; it is never used to choose owner scope.

### Server-Side Search
Search input is trimmed, length-bounded (recommended 2–100 characters), escaped through the database client, debounced by 250–350ms in the browser, and canceled when superseded. The server enforces result limits regardless of browser input. Search terms are not written to normal logs.

### Snapshot and Lazy Loading
The shell and bootstrap load first. The overview snapshot then loads once. Secondary tables, detail panels, audit, documents, and search load only when their route or dialog opens. Detail routes do not preload signed URLs or full related collections. Pagination and filters execute server-side.

### Performance Targets
Measured against representative local/staging data of at least 10,000 tasks, 2,000 contacts, 1,000 clients/projects, 500 employees, and 10,000 attributable audit rows:

- bootstrap p75 ≤ 500ms server response;
- dashboard p75 ≤ 1.5s server response and ≤ 2.5s usable render on supported broadband;
- paged list/search p75 ≤ 750ms;
- mutation p75 ≤ 1s excluding email and document upload provider latency;
- route interaction feedback ≤ 100ms;
- no endpoint returns an unbounded collection.

These are design targets, not claims about current performance. Index changes are not included in this design and require migration approval if query evidence shows they are necessary.

## Error Handling
| Condition | API behavior | UI behavior |
|---|---|---|
| Missing/expired access token | Existing 401 code | Attempt one refresh; otherwise clear memory and show sign-in |
| Authenticated request outside existing server-derived scope | Generic 403 or non-disclosing resource response | Clear owner data or show safe recovery guidance |
| Missing/out-of-scope resource | Uniform resource 404 | Non-disclosing not-found state |
| Invalid fields/filter/cursor | 400 with stable code | Associate safe message with field/control |
| Duplicate/FK/business conflict | Existing or additive 409 code | Preserve form state and explain recovery |
| Stale update | 409 conflict when concurrency field is available | Reload/compare prompt; no silent overwrite |
| Rate limit | 429 and retry metadata when available | Disable immediate retry and explain delay |
| Provider/internal failure | Redacted 500 with request ID | Generic retry/support state; no provider details |
| Partial dashboard source failure | 200 with section `unavailable` when core authenticated request succeeds | Keep successful sections and label unavailable section |

Existing records do not consistently expose a concurrency version. Baseline mutations therefore refresh the authoritative record after success and disable duplicate submission. Strict `updated_at` preconditions, version columns, or idempotency storage are future scope; the UI must not claim strong optimistic concurrency.

Invitation resend and document publication are not automatically retried by the browser because retry may send another email or create another object. Ambiguous outcomes direct the owner to refresh portal status.

## 16. Loading and Empty-State Strategy
- Nested `loading.tsx` provides shell-safe initial structure.
- Each table uses 5–10 skeleton rows matching visible columns.
- Dashboard sections load independently with `aria-busy` on the affected region.
- Empty lists state what was successfully searched and offer only an enabled approved quick action.
- Filtered-empty states offer “Clear filters,” not “Create,” unless creation is independently allowed.
- Unavailable states name the capability category and approval/configuration status without exposing internal topology.
- Error boundaries preserve the shell, navigation, logout, and retry path.
- Previous sensitive route data is cleared before a new identity, denied scope, or logout state can render.

## 17. Accessibility Design
1. A skip link targets the owner route main landmark.
2. Sidebar is a labelled `nav`; top bar, search, notification, and main content landmarks are distinct.
3. One logical `h1` per route; cards and panels use ordered headings.
4. All icon controls have accessible names; status icons include text equivalents.
5. Tables use headers, captions or accessible names, sortable-state announcements, and row action labels containing safe record names.
6. Validation uses programmatic field association and a focused error summary for multi-field forms.
7. Dialogs trap focus, support Escape where safe, announce title/description, and return focus on close.
8. Route changes and async success/failure are announced through restrained live regions.
9. Loading uses `aria-busy`; decorative skeletons are hidden from assistive technology.
10. Severity never depends on color alone; focus contrast, high contrast, reduced motion, and 200% zoom are supported.
11. Mobile table transformations preserve labels and logical reading order.
12. Destructive or revocation actions require explicit confirmation that names the target and consequence.

## 18. Observability and Audit Design
The existing request logger/error handler remain authoritative. Owner Workspace adds structured context only: request ID, route name, safe owner ID, safe resource type/ID, duration, status, and outcome. It must redact query search text where sensitive, bodies, auth headers, cookies, invitations, tokens, signed URLs, file content, storage paths, and environment values.

Each newly approved owner mutation records actor, action, target type/ID, owner scope, outcome, and timestamp through one service-level audit helper. Audit failure policy is operation-specific:

- security-sensitive lifecycle mutations should fail closed or use an atomic approved RPC;
- low-risk name edits may complete only if the approved audit policy permits asynchronous/failure-tolerant audit;
- the implementation plan cannot decide this implicitly.

Existing invitation/publication RPC audit guarantees must be verified before implementation. No claim is made that every existing CRM mutation currently has an audit event.

## Testing Strategy

### API Route Tests
Using existing `node:test`, ephemeral Express listeners, and native `fetch`:

- 401 without JWT; safe scope-denial behavior for employee/client portal routes and cross-scope resource attempts;
- owner scope ignores headers/query/body owner IDs;
- malformed filters/cursors/IDs and bounded limits;
- facade response/status parity with reused CRM services;
- safe 404 equality for missing and out-of-scope records;
- dashboard partial source failure and redaction;
- Client Portal facade preserves invite/resend/revoke/publish behavior.

### Repository and Service Tests
Using existing mocked Supabase fetch conventions:

- exact `owner_user_id` plus nested resource predicates;
- explicit projections (no `select('*')` in new reads);
- cursor ordering, filter/sort allowlists, maximum limits;
- search scoping before matching/counting;
- employee relation and task assignment boundaries;
- audit event attribution/redaction;
- unavailable source mapping without fabricated zero values.

### PostgreSQL Integration Tests
Against disposable CI PostgreSQL/Supabase only:

- real owner-vs-other-owner isolation for every new read;
- external client and employee denial;
- portal membership/document lifecycle reuse;
- audit attribution and non-disclosure;
- representative pagination/search query behavior.

No preserved local data is reset to run these tests.

### Frontend Tests
Vitest/jsdom/React Testing Library/user-event:

- refresh/login/logout and memory-only state;
- shell navigation, active states, mobile drawer, focus return;
- loading, empty, unavailable, partial, error, retry, and access-denied states;
- URL filter/cursor behavior and cancellation of stale search;
- quick-action capability gates;
- no automation secret, scope ID authority, persistent owner data, or eager signed URL fetch;
- route-local forms and confirmation flows.

`vitest.config.ts` must include dashboard tests in a later approved implementation; this design does not change it.

### Accessibility Tests
Automated axe-compatible checks if an already approved dependency exists, plus required manual keyboard, screen-reader smoke, 200% zoom, reduced-motion, and high-contrast checks. Automated tests do not replace manual focus and announcement verification.

### Regression Tests
Existing auth, CRM, Employee Portal, Client Portal, API, frontend, lint, type-check, and production build suites remain passing. Specific assertions verify that `/employee`, `/client`, `/client/activate`, their response projections, and their authorization middleware are unchanged.

## 20. Risks and Smallest Acceptable Mitigations

| Category | Risk | Smallest acceptable mitigation |
|---|---|---|
| Security | Owner scope is derived incorrectly | Reuse `createAuthMiddleware()` and server-derived `req.user.sub`; apply owner/resource predicates in every repository query and negative isolation tests |
| Security | Current CRM routers accept any valid JWT | Owner UI uses only the guarded owner facade; never treat legacy router authentication as owner authorization |
| Security | Browser automation secret and caller `x-client-id` | Owner API client never imports existing shared-secret client or sends either value |
| Security | Service-role database access bypasses RLS | Fixed projections and combined owner/resource predicates with negative repository/integration tests |
| Security | Search/aggregates leak other-owner counts | Apply owner predicate before match, rank, count, and limit; uniform empty/404 behavior |
| Security | Audit/log/document disclosure | Event allowlists, redaction, transient signed URLs, no raw `details` or storage paths |
| Technical | CRM fields do not support promised rich workflows | Render only confirmed fields; keep pipeline/tags/archive/milestones and related advanced workflows as future scope |
| Technical | Thin owner facade may look duplicative | Facade owns authorization/HTTP only and delegates all domain validation/mutations to existing CRM services |
| Technical | Current dashboard and BFF contain fake data | Remove them from the Owner Workspace data path; unavailable values remain unavailable |
| Performance | Existing lists use `select('*')` and no limits | New owner reads use explicit projections, cursor pagination, capped search, and count queries |
| Performance | Parallel overview queries increase DB load | Fixed bounded query set, parallel execution, section timeouts, no aggressive polling |
| Performance | `ILIKE` degrades at scale | Minimum query length and caps first; approve indexes only from measured plans |
| Scalability | Process-local scheduler/health/rate limit state | Label status as instance-local where applicable; no control or enterprise claim in Phase 8 |
| Scalability | Audit attribution without owner column is expensive/ambiguous | Include only provably attributable events; broader audit history is future scope |
| Operational | Email/upload retry creates duplicate effects | No automatic mutation retry; refresh status after ambiguous result; reuse atomic RPCs/compensation |
| Operational | Legacy dashboard gate and JWT session must not diverge | Owner Workspace uses the existing shared session path; legacy `/leads` and `/tasks` remain unchanged |
| Privacy | Employee “performance” inferred incorrectly | Show defined assignment counts only; performance/availability remain unavailable |
| Product | Later phases leak into Phase 8 | Capability manifest defaults deferred modules to unavailable and exposes no API controls |
| Accessibility | Dense shell/table navigation becomes unusable | Semantic landmarks, focus-managed drawer/dialogs, responsive row details, manual assistive testing |

## 21. Expected Implementation File Impact
This is an estimate for a later approved implementation, not a change made by this design.

### Expected New Backend Files
- `apps/api/src/modules/owner-workspace/owner-workspace.repository.js`
- `apps/api/src/modules/owner-workspace/owner-workspace.service.js`
- `apps/api/src/modules/owner-workspace/owner-workspace.routes.js`
- `apps/api/test/owner-workspace.test.js`
- `apps/api/integration/owner-workspace.postgres.integration.js`

### Expected New Frontend Files
- `apps/web/src/app/dashboard/layout.tsx`
- `apps/web/src/app/dashboard/loading.tsx`
- `apps/web/src/app/dashboard/error.tsx`
- route pages listed in Section 5 (approximately 8–10 files)
- route-local components listed in Section 6 (approximately 8–12 focused files)
- `apps/web/src/app/dashboard/lib/owner-api-client.ts`
- `apps/web/src/app/dashboard/lib/owner-contracts.ts`
- focused dashboard tests (approximately 5–7 files)

### Expected Modified Files
- `apps/api/src/app.js` — mount owner router before shared-secret API auth
- `apps/api/src/modules/crm/crm.repository.js` — additive bounded/detail reads only
- `apps/api/src/modules/crm/crm.service.js` — additive bounded/detail validation/contracts only
- `apps/web/src/app/dashboard/page.tsx` — replace simulated dashboard presentation
- `apps/web/src/components/PortalNav.tsx` — avoid duplicate navigation on nested dashboard routes
- `apps/web/vitest.config.ts` — include Owner Workspace tests
- optionally `apps/web/src/components/ChatWidget.tsx` — only if current route suppression does not already cover `/dashboard/**`

### Files Explicitly Not Expected to Change
- `apps/web/src/app/employee/**`
- `apps/web/src/app/client/**`
- existing Employee Portal and Client Portal route behavior
- existing auth service, JWT format, refresh cookie, login, refresh, logout, and session tables
- database migrations in the no-migration baseline
- CI, deployment, infrastructure, domains, and secrets

The simulated `apps/web/src/app/api/dashboard/stats/route.ts` should become unused and may be removed only with explicit implementation approval after reference verification. It must not remain an owner data source.

## 22. Estimated Implementation Size
| Measure | Estimate |
|---|---:|
| Files created | 24–32 |
| Files modified | 5–7 |
| Backend production code | 900–1,400 lines |
| Frontend production code | 1,400–2,200 lines |
| Tests and fixtures | 900–1,400 lines |
| Total | approximately 3,200–5,000 lines |

This reduced estimate is achievable because the design reuses the existing authentication lifecycle, CRM service validation, Client Portal lifecycle services, existing task-assignment validation, and route-local component composition. It excludes future data-model work for archives, rich pipeline/task/project fields, document versioning, persistent notifications, employee lifecycle, and expanded RBAC. Any future approval of those excluded capabilities requires its own estimate.

## 23. Implementation Milestones
1. **Owner Workspace shell, navigation, dashboard overview, and KPIs:** route-local shell, existing shared session handling, navigation, source-backed overview cards, attention queue, recent activity, and unavailable states.
2. **CRM, clients, and invitations:** bounded CRM/client reads, existing create/edit/conversion behavior, client detail, Client Portal status, and reuse of invitation/resend/revoke operations.
3. **Projects and tasks:** paged project/task views, project detail, cross-project task read, and reuse of existing create/edit/assignment behavior.
4. **Employees, assignments, and workload:** read-only employee list/detail, assignment and workload views based on existing relations. **Employee credential lifecycle remains future approved work.**
5. **Documents, audit, and settings:** Client Portal document inventory and publish/revoke reuse, attributable audit subset, redacted settings/system status.
6. **Testing, accessibility, regression, and release verification:** API/repository/integration/frontend/accessibility coverage, existing portal/auth regression, lint, type-check, build, and release evidence.

Each milestone is independently reviewable and adds only the capabilities listed above. Future-scope capabilities do not delay the baseline.

## 24. Remaining Approval Gate
The only remaining gate is explicit approval to create the Phase 8 implementation plan. This design introduces no additional authorization, schema, lifecycle, or delivery gate.

Employee creation, deactivation, password reset, credential handoff, role change, and account lifecycle are **future approved implementation required**. They are excluded from the Phase 8 baseline and do not block its implementation.

## 25. Architecture Decision Summary
The implementation path is a single route-local Next.js Owner Workspace shell backed by a narrow Express facade that follows the existing Repository → Service → Route pattern. It reuses the one shared authentication platform and the existing CRM owner-scope convention, keeps CRM and Client Portal business rules single-sourced, and uses bounded source-backed reads for owner views. Employee Portal and Client Portal behavior remain unchanged. Unsupported capabilities remain future scope rather than fabricated. No implementation plan or code change occurs until explicitly approved.