# Implementation Plan: Phase 8 Owner Workspace (Dashboard)

## Overview
This plan implements the approved Owner Workspace as one route-local Next.js experience at `/dashboard` and a narrow additive `/api/owner-workspace` facade. It follows the existing Repository → Service → Route architecture, uses the existing authenticated-subject-to-CRM-owner-scope flow (`req.user.sub` → `owner_user_id`), and delegates CRM and Client Portal mutations to their current service methods.

This document authorizes no implementation. It creates no code, migration, authentication, Employee Portal, Client Portal, CI, deployment, infrastructure, commit, tag, or push change. Implementation begins only after explicit approval.

## Non-goals and Invariants
- Reuse the existing shared login, JWT, refresh token, HttpOnly refresh cookie, session, logout, password policy, lockout, and refresh lifecycle. Add no Owner role, session, cookie, claim, membership, or entitlement mechanism.
- Derive `ownerUserId` only on the server from `req.user.sub`; browser-provided IDs are locators only and never authorize scope.
- Preserve existing CRM business logic, Employee Portal behavior, Client Portal behavior, database schema, deployment, and infrastructure.
- Add no generic admin framework, generic CRUD engine, generic dashboard framework, browser-side secret, direct database access, or persistent owner-scoped browser cache.
- Keep employee credential lifecycle, archive/deactivation semantics, rich pipeline/task/project fields, document versioning, persistent notifications, Finance, Communication, Automation controls, Analytics, AI, and RBAC expansion as future scope.

## Task Dependency Graph
```json
{
  "waves": [
    { "wave": 1, "tasks": ["owner-workspace-shell", "dashboard-overview"], "dependsOn": [] },
    { "wave": 2, "tasks": ["crm-clients", "client-portal-invitations"], "dependsOn": ["owner-workspace-shell", "dashboard-overview"] },
    { "wave": 3, "tasks": ["projects-tasks-assignments"], "dependsOn": ["crm-clients"] },
    { "wave": 4, "tasks": ["employee-directory-workload"], "dependsOn": ["projects-tasks-assignments"] },
    { "wave": 5, "tasks": ["documents-audit-settings-search"], "dependsOn": ["client-portal-invitations", "employee-directory-workload"] },
    { "wave": 6, "tasks": ["validation-accessibility-release-verification"], "dependsOn": ["owner-workspace-shell", "crm-clients", "projects-tasks-assignments", "employee-directory-workload", "documents-audit-settings-search"] }
  ]
}
```

## Notes
- This plan is implementation planning only; it does not approve code, migrations, authentication changes, portal changes, CI changes, or release actions.
- Employee credential and lifecycle work remains **Future approved implementation required** and is excluded from every milestone.
- Existing `/employee`, `/client`, `/client/activate`, auth, deployment, infrastructure, and legacy `/leads`/`/tasks` behavior remain outside this implementation plan.

## Tasks

### Milestone 1 — Owner Workspace shell, navigation, dashboard overview, and KPIs
**Dependencies:** none. **Scope:** existing shared session transport, route-local presentation, bounded dashboard read model. **No business mutation.**

1. [ ] Add the `owner-workspace` Repository → Service → Route module and mount its JWT-authenticated router before shared-secret `/api` middleware in `apps/api/src/app.js`.
   - Derive `ownerUserId` from `req.user.sub` in the route layer; pass it to every service/repository method.
   - Add only fixed projections, bounded aggregate queries, and the existing response/error envelopes.
   - Do not modify auth modules, token claims, login, refresh, logout, cookies, sessions, or role logic.
2. [ ] Add `GET /api/owner-workspace/bootstrap` and `GET /api/owner-workspace/dashboard`.
   - Bootstrap returns safe display identity and route capability metadata only.
   - Dashboard returns source-backed, owner-scoped active-client/employee/project/task counts, completed-task count, attention items, attributable recent activity, safe health statuses, `asOf`, and section availability.
   - Revenue, meetings, finance, AI, analytics, and unsupported status values return `unavailable` or `not_configured`; never fabricated zeroes or trends.
3. [ ] Replace the simulated `/dashboard` presentation with the nested Owner Workspace shell, preserving the root layout and leaving legacy `/leads`, `/tasks`, and `/portal-auth` behavior untouched.
   - Use one memory-only route-local API client with refresh-cookie transport and one 401 retry.
   - Render skip link, sidebar, top bar, mobile drawer, route breadcrumb, refresh, in-memory logout, source/freshness labels, loading skeletons, empty/all-clear states, and recoverable errors.
4. [ ] Implement route-local dashboard panels for KPI cards, attention queue, recent activity, transient notifications, and quick actions.
   - Quick actions enable only Create Project, Create Task, Invite Client, and Upload Document when their required in-scope context exists.
   - Create Employee and Run Automation remain visibly unavailable with a future-scope explanation.
5. [ ] Add focused owner shell/dashboard tests for authentication transport, memory-only state, source fidelity, navigation, responsive drawer behavior, accessible landmarks, and keyboard focus.

### Milestone 2 — CRM, clients, and Client Portal invitations
**Dependencies:** Milestone 1. **Scope:** bounded CRM reads plus existing CRM/Client Portal service reuse. **Excluded:** pipeline stages/tags/merge/archive/restore, finance, client deactivation.

1. [ ] Add explicit paged/detail CRM repository methods with owner predicates, fixed projections, cursor pagination, allowlisted sort/filter values, and no `select('*')` in new Owner Workspace reads.
2. [ ] Add Owner Workspace service methods that delegate existing company/contact/lead/client create/update/conversion and client-contact operations to `crm.service.js`.
   - Do not call legacy CRM routes from the browser.
   - Do not duplicate field validation, duplicate/FK translation, ownership checks, or lead-to-client conversion logic.
3. [ ] Add owner facade routes for company, contact, lead, client, client-detail, and client-contact list/detail/create/update operations as specified in the API inventory.
   - Physical DELETE endpoints are excluded from the facade.
   - Missing and out-of-scope records return the same non-disclosing resource response.
4. [ ] Add `GET /api/owner-workspace/clients/:clientId/portal` as a fixed safe portal-administration snapshot.
   - Reuse existing invitation, resend, revoke, document publication, and document revocation services behind the facade.
   - Never return raw invitation values/hashes, JWTs, refresh tokens, signed URLs, storage paths, or client-scoped document content.
5. [ ] Add route-local `/dashboard/crm`, `/dashboard/clients`, and `/dashboard/clients/[clientId]` pages using the shared owner shell and record-view components.
   - Include bounded filters/search, pagination, detail state, source-aware empty states, forms for already-approved existing operations, and portal invitation controls.
6. [ ] Add API/repository/frontend coverage for scope tampering, cursor/filter validation, non-disclosure, conversion reuse, invitation lifecycle facade behavior, and client/Employee Portal regression boundaries.

### Milestone 3 — Projects, tasks, assignments, and project overview
**Dependencies:** Milestone 2. **Scope:** existing project/task fields and current assignment semantics. **Excluded:** archive, milestones, timeline, budget, priority, deadline, dependency, bulk action, calendar, and new task status models.

1. [ ] Add bounded owner-scoped project detail/list reads and cross-project task list/detail reads with fixed projections, stable ordering, pagination, and in-scope client/project predicates.
2. [ ] Delegate project/task creation, name updates, completion changes, and assignment validation to existing CRM service methods.
   - Reuse `getActiveEmployeeById(employeeId, ownerUserId)` for assignment eligibility.
   - Do not alter Employee Portal’s justified completion/reopening RPC or its route behavior.
3. [ ] Add project/task owner facade routes listed in the API inventory, including `GET /projects/:projectId`, cross-project `GET /tasks`, and `GET /tasks/:taskId`.
4. [ ] Add `/dashboard/projects`, `/dashboard/projects/[projectId]`, and `/dashboard/tasks` pages.
   - Show client association, task summary, assigned employee, and completion state only from current sources.
   - Present unavailable states instead of implementing unsupported project/task fields.
5. [ ] Add focused tests for cross-project scope isolation, owner-only assignment predicates, employee eligibility, missing/out-of-scope equality, and no regression in Employee Portal task completion.

### Milestone 4 — Employee directory, assignments, workload, and availability boundary
**Dependencies:** Milestone 3. **Scope:** read-only owner oversight built from existing employee-owner and task-assignment relations.

1. [ ] Add read-only employee list/detail repository/service methods using `users.portal_owner_user_id`, active employee status, directly assigned tasks, referenced projects, and bounded aggregate counts.
2. [ ] Add `GET /api/owner-workspace/employees` and `GET /api/owner-workspace/employees/:employeeId` with fixed safe projections, owner predicates, pagination, search, and no employee credential fields.
3. [ ] Add `/dashboard/employees` and `/dashboard/employees/[employeeId]` pages.
   - Show assignment workload as defined counts with `asOf` and source information.
   - Render availability and performance as unavailable unless a current authoritative field and approved definition exist.
   - Display Employee creation, deactivation, password reset, credential handoff, role changes, and lifecycle as **Future approved implementation required**; create no routes, controls, scripts, or data changes for them.
4. [ ] Add tests proving employee records, task assignments, and workload aggregates are owner-scoped and that Employee Portal routes/components/authentication remain untouched.

### Milestone 5 — Documents, audit, settings, and global search
**Dependencies:** Milestones 2 and 4. **Scope:** safe read models plus existing Client Portal publication/revocation reuse. **Excluded:** document versioning/approval/replacement/retention/deletion, persistent notifications, settings mutation, keys, integration edits, and full-text indexing.

1. [ ] Add owner-scoped document inventory reads over existing `client_portal_documents` joined through owned clients/projects.
   - Permit existing publish/revoke facade operations only; do not create owner document download, unrestricted Storage listing, signed URL persistence, or general document lifecycle.
2. [ ] Add a bounded attributable audit read service.
   - Include only event classes whose actor/resource can be tied to `ownerUserId` by an explicit safe rule.
   - Redact raw audit `details`, secrets, tokens, invitation values, signed URLs, request bodies, document content, and provider error details.
3. [ ] Add a redacted settings/status service using existing safe booleans and health/configuration state only.
   - Return configured/not-configured and available/unavailable labels, never environment variable names/values, API keys, provider credentials, role management, or infrastructure mutation.
4. [ ] Add one global search service that fans out to explicit scoped searches for companies, contacts, clients, employees, projects, tasks, and documents.
   - Require a bounded query length; enforce result caps, fixed safe projections, stable grouping, and owner scope before matching/counting/ranking.
5. [ ] Add `documents`, `audit`, `settings`, and `search` owner facade routes; add `/dashboard/documents`, `/dashboard/audit`, and `/dashboard/settings` pages; add global search to the shared top bar.
6. [ ] Add tests for document/client scope, audit redaction/attribution, status redaction, search tampering/caps, and source-unavailable display states.

### Milestone 6 — Testing, accessibility, regression, and release verification
**Dependencies:** Milestones 1–5.

1. [ ] Complete API route and service/repository tests using the existing Node `node:test`, native-fetch, Express-listener, and mocked-Supabase conventions.
2. [ ] Add PostgreSQL/Supabase integration coverage using disposable CI data only; do not reset, delete, or recreate preserved local data.
3. [ ] Add route-local frontend tests using the existing Vitest/React Testing Library pattern; expand the test include only to the `/dashboard` route tree.
4. [ ] Verify keyboard navigation, focus movement and return, visible focus, accessible names, live announcements, loading/error/empty/unavailable states, reduced motion, high contrast, 200% zoom, and desktop/tablet/mobile layouts.
5. [ ] Run existing auth, CRM, Employee Portal, Client Portal, API, frontend, lint, type-check, production build, secret scan, and affected integration checks without changing their behavior or CI workflow.
6. [ ] Record release evidence: pagination/search bounds, no persistent owner-scoped browser state, safe error redaction, no browser automation secret, no Client/Employee permission broadening, and `git diff --check`.

## Additive API Inventory
All endpoints below use existing `createAuthMiddleware()`. The route layer derives `ownerUserId` from `req.user.sub`; no request-supplied owner/client/membership/project/task/document/employee ID authorizes scope.

| Route | Method | Purpose | Authorization | Existing service/repository reuse | Additive work |
|---|---|---|---|---|---|
| `/api/owner-workspace/bootstrap` | GET | Safe display identity and capability metadata | Existing JWT; server-derived owner scope | Auth middleware; CRM owner-scope convention | Owner workspace service/repository bootstrap projection |
| `/api/owner-workspace/dashboard` | GET | KPIs, attention, activity, safe health | Same | Existing CRM relations, safe health/config booleans | Bounded dashboard aggregate methods |
| `/api/owner-workspace/search` | GET | Grouped owner-scoped global search | Same | CRM owner predicates; employee ownership relation | Type-specific bounded search methods |
| `/api/owner-workspace/employees` | GET | Paged read-only employee directory/workload | Same | `portal_owner_user_id`, assigned-task relation | Employee list/read model |
| `/api/owner-workspace/employees/:employeeId` | GET | Employee assignment/workload detail | Same + employee locator predicate | `getActiveEmployeeById`, task/project relations | Employee detail/read model |
| `/api/owner-workspace/documents` | GET | Paged client-portal document inventory | Same + owned client/project predicate | Client Portal document metadata | Bounded document inventory method |
| `/api/owner-workspace/audit` | GET | Attributable redacted audit history | Same + event attribution predicate | Existing `audit_logs` writes | Safe audit projection/query |
| `/api/owner-workspace/settings/status` | GET | Redacted system/capability status | Same | `providerStatus`, safe health/config state | Fixed status projection |
| `/api/owner-workspace/crm/companies` | GET | Paged company list | Same | `listCompanies` ownership semantics | Paged safe projection |
| `/api/owner-workspace/crm/companies` | POST | Create company | Same | `createCompany` | Facade delegation only |
| `/api/owner-workspace/crm/companies/:id` | GET | Company detail | Same + owner/resource predicate | `ownedCompanyExists` | Detail projection |
| `/api/owner-workspace/crm/companies/:id` | PATCH | Update permitted company fields | Same | `updateCompany` | Facade delegation only |
| `/api/owner-workspace/crm/contacts` | GET | Paged contact list | Same | `listContacts` ownership semantics | Paged safe projection |
| `/api/owner-workspace/crm/contacts` | POST | Create contact | Same | `createContact` | Facade delegation only |
| `/api/owner-workspace/crm/contacts/:id` | GET | Contact detail | Same + owner/resource predicate | `ownedContactExists` | Detail projection |
| `/api/owner-workspace/crm/contacts/:id` | PATCH | Update permitted contact fields | Same | `updateContact` | Facade delegation only |
| `/api/owner-workspace/crm/leads` | GET | Paged unconverted lead list | Same | `listLeads` ownership semantics | Paged safe projection |
| `/api/owner-workspace/crm/leads` | POST | Create lead from owned contact | Same | `createLead` | Facade delegation only |
| `/api/owner-workspace/crm/leads/:id` | GET | Lead detail | Same + owner/resource predicate | Existing lead ownership pattern | Detail projection |
| `/api/owner-workspace/clients` | GET | Paged client list | Same | `listClients` ownership semantics | Paged safe projection |
| `/api/owner-workspace/clients` | POST | Convert owned lead to client | Same | `createClient` / `convertLeadToClient` | Facade delegation only |
| `/api/owner-workspace/clients/:clientId` | GET | Client detail and related safe summaries | Same + owner/client predicate | `ownedClientExists`, contacts/projects/portal relations | Client detail aggregate |
| `/api/owner-workspace/clients/:clientId` | PATCH | Update permitted client fields | Same | `updateClient` | Facade delegation only |
| `/api/owner-workspace/clients/:clientId/contacts` | GET/POST | List/create client contacts | Same + owner/client predicate | Existing client-contact services | Facade delegation only |
| `/api/owner-workspace/clients/:clientId/contacts/:contactId` | PATCH/DELETE | Update/detach client contact | Same + nested predicate | `updateClientContact` / `deleteClientContact` | Facade delegation only |
| `/api/owner-workspace/clients/:clientId/portal` | GET | Membership/invitation/document status snapshot | Same + owner/client predicate | Existing portal membership/document metadata | Safe portal-status projection |
| `/api/owner-workspace/clients/:clientId/portal-invitations` | POST | Invite active client contact | Same | `inviteClientPortalMember` | Facade delegation only |
| `/api/owner-workspace/clients/:clientId/portal-members/:membershipId/resend` | POST | Resend invitation | Same + nested predicate | `resendClientPortalInvitation` | Facade delegation only |
| `/api/owner-workspace/clients/:clientId/portal-members/:membershipId` | DELETE | Revoke membership | Same + nested predicate | `revokeClientPortalMembership` | Facade delegation only |
| `/api/owner-workspace/clients/:clientId/portal-documents` | POST | Publish approved private document | Same + owner/client/project predicate | `publishClientPortalDocument`, existing bounded parser | Facade delegation only |
| `/api/owner-workspace/clients/:clientId/portal-documents/:documentId` | DELETE | Revoke client visibility | Same + nested predicate | `revokeClientPortalDocument` | Facade delegation only |
| `/api/owner-workspace/projects` | GET | Paged project list | Same | `listProjects` ownership semantics | Paged safe projection |
| `/api/owner-workspace/projects` | POST | Create project for owned client | Same | `createProject` | Facade delegation only |
| `/api/owner-workspace/projects/:projectId` | GET | Project detail and task summary | Same + owner/project predicate | `ownedProjectExists`, task relation | Project detail aggregate |
| `/api/owner-workspace/projects/:projectId` | PATCH | Update permitted project fields | Same | `updateProject` | Facade delegation only |
| `/api/owner-workspace/projects/:projectId/tasks` | GET/POST | List/create project tasks | Same + owner/project predicate | `listTasks` / `createTask` | Facade delegation only |
| `/api/owner-workspace/projects/:projectId/tasks/:taskId` | PATCH | Update permitted task fields/assignment | Same + nested predicate | `updateTask`, `getActiveEmployeeById` | Facade delegation only |
| `/api/owner-workspace/tasks` | GET | Paged cross-project task list | Same | Existing owner/task/project relations | Cross-project task read |
| `/api/owner-workspace/tasks/:taskId` | GET | Task detail | Same + owner/task predicate | Existing task ownership pattern | Detail projection |

No delete, archive, deactivation, employee lifecycle, finance, automation-control, AI, analytics-management, notification persistence, or settings-mutation endpoint is added.

## File Plan

### Backend — create
| File | Purpose |
|---|---|
| `apps/api/src/modules/owner-workspace/owner-workspace.repository.js` | Fixed projections, scoped aggregates, paged/detail reads, employee workload, document/audit/status/search queries. |
| `apps/api/src/modules/owner-workspace/owner-workspace.service.js` | Source/freshness wrapping, facade orchestration, redaction, CRM/Client Portal service delegation. |
| `apps/api/src/modules/owner-workspace/owner-workspace.routes.js` | Existing JWT middleware, route validation, server-derived `ownerUserId`, explicit owner facade routes. |

### Backend — modify
| File | Minimal change |
|---|---|
| `apps/api/src/app.js` | Mount only the new owner workspace router before shared-secret `/api` middleware. |
| `apps/api/src/modules/crm/crm.repository.js` | Add bounded owner-safe list/detail reads needed by the facade; retain existing methods/contracts. |
| `apps/api/src/modules/crm/crm.service.js` | Add bounded read contracts only; retain existing mutation validation and lifecycle methods. |

### Frontend — create
| File | Purpose |
|---|---|
| `apps/web/src/app/dashboard/layout.tsx` | Route-local Owner Workspace session boundary and shell. |
| `apps/web/src/app/dashboard/loading.tsx` | Accessible dashboard route skeleton. |
| `apps/web/src/app/dashboard/error.tsx` | Route-local recoverable error boundary. |
| `apps/web/src/app/dashboard/crm/page.tsx` | Companies, contacts, and leads. |
| `apps/web/src/app/dashboard/clients/page.tsx` | Paged client list. |
| `apps/web/src/app/dashboard/clients/[clientId]/page.tsx` | Client, contacts, portal lifecycle, and document context. |
| `apps/web/src/app/dashboard/projects/page.tsx` | Paged project list. |
| `apps/web/src/app/dashboard/projects/[projectId]/page.tsx` | Project detail and tasks. |
| `apps/web/src/app/dashboard/tasks/page.tsx` | Cross-project task list. |
| `apps/web/src/app/dashboard/employees/page.tsx` | Read-only employee directory. |
| `apps/web/src/app/dashboard/employees/[employeeId]/page.tsx` | Assignment and workload detail. |
| `apps/web/src/app/dashboard/documents/page.tsx` | Owner document inventory. |
| `apps/web/src/app/dashboard/audit/page.tsx` | Redacted attributable audit history. |
| `apps/web/src/app/dashboard/settings/page.tsx` | Read-only safe status inventory. |
| `apps/web/src/app/dashboard/components/OwnerWorkspaceShell.tsx` | Sidebar, topbar, responsive drawer, breadcrumbs, logout, and shell landmarks. |
| `apps/web/src/app/dashboard/components/OwnerDashboardPanels.tsx` | KPI, attention, activity, status, and unavailable panels. |
| `apps/web/src/app/dashboard/components/OwnerRecordView.tsx` | Route-local table, filter, pagination, loading/error/empty/unavailable states. |
| `apps/web/src/app/dashboard/components/OwnerWorkspaceControls.tsx` | Search, quick actions, transient notifications, and confirmations. |
| `apps/web/src/app/dashboard/lib/owner-api-client.ts` | Memory-only existing login/refresh/logout transport and owner request helper. |
| `apps/web/src/app/dashboard/lib/owner-contracts.ts` | Frontend-only response and view-model types. |

### Frontend — modify
| File | Minimal change |
|---|---|
| `apps/web/src/app/dashboard/page.tsx` | Replace simulated data fetch/presentation with source-backed route-local overview composition. |
| `apps/web/src/components/PortalNav.tsx` | Suppress duplicate global navigation only within `/dashboard/**`. |

### Tests — create
| File | Purpose |
|---|---|
| `apps/api/test/owner-workspace.test.js` | Route/service/repository security, contract, redaction, pagination, and delegation coverage. |
| `apps/api/integration/owner-workspace.postgres.integration.js` | Disposable PostgreSQL/Supabase owner-scope, portal lifecycle, audit, and query integration coverage. |
| `apps/web/src/app/dashboard/dashboard.test.tsx` | Session, shell, overview, source-state, and accessibility behavior. |
| `apps/web/src/app/dashboard/records.test.tsx` | CRM/client/project/task filters, pagination, and safe detail states. |
| `apps/web/src/app/dashboard/employees.test.tsx` | Employee read-only workload boundary and future-scope control behavior. |
| `apps/web/src/app/dashboard/workspace-controls.test.tsx` | Search, quick actions, notification, confirmation, and keyboard behavior. |

### Tests — modify
| File | Minimal change |
|---|---|
| `apps/web/vitest.config.ts` | Include `src/app/dashboard/**/*.test.tsx` alongside existing Client Portal tests. |

### Configuration — unchanged
| File/group | Reason |
|---|---|
| `apps/api/src/modules/auth/**` | Existing authentication platform is reused exactly. |
| `database/supabase/migrations/**` | No migration or schema change is approved. |
| `.github/workflows/**`, deployment, infrastructure, secrets | Existing release checks are reused; no CI/deployment/infrastructure change is approved. |

### Frontend and portal boundaries — unchanged
| File/group | Reason |
|---|---|
| `apps/web/src/app/employee/**` | Employee Portal behavior and credentials are unchanged. |
| `apps/web/src/app/client/**` | Client Portal behavior, membership/session flow, and privacy boundary are unchanged. |
| `apps/api/src/modules/crm/crm.routes.js` existing CRM/portal routes | Existing endpoint contracts remain unchanged; new owner routes live in the additive facade. |
| `apps/web/src/app/api/dashboard/stats/route.ts` | It is not an Owner Workspace data source; removal is outside this plan. |

### Documentation — create/unchanged
| File | Status | Reason |
|---|---|---|
| `.kiro/specs/phase8-owner-workspace-dashboard/tasks.md` | Create | This implementation plan. |
| `.kiro/specs/phase8-owner-workspace-dashboard/requirements.md` | Unchanged | Approved requirements remain authoritative. |
| `.kiro/specs/phase8-owner-workspace-dashboard/design.md` | Unchanged | Approved technical design remains authoritative. |

## Frontend Implementation Plan

### Route hierarchy
```text
/dashboard
/dashboard/crm
/dashboard/clients
/dashboard/clients/[clientId]
/dashboard/projects
/dashboard/projects/[projectId]
/dashboard/tasks
/dashboard/employees
/dashboard/employees/[employeeId]
/dashboard/documents
/dashboard/audit
/dashboard/settings
```

All routes inherit `dashboard/layout.tsx`, which provides the route-local shell. The root layout remains the single application layout. Route modules own their data loading, view-specific controls, and empty/error/unavailable states; shared Owner components are reused only inside `/dashboard/**`.

### State, loading, errors, and empty states
- `owner-api-client.ts` holds the access token in memory, sends `credentials: 'include'`, deduplicates refresh, retries one protected 401, and clears owner data on refresh failure, scope denial, logout, or identity transition.
- URL state may contain allowlisted filters, sort, pagination cursor, and selected route tab. It never stores tokens, snapshots, invitation values, signed URLs, or sensitive search data.
- Each route uses `loading`, `ready`, `empty`, `unavailable`, and `error` states. Tables use server pagination and route-local skeleton rows; dashboard sections may be partially unavailable without hiding successful sections.
- The dashboard never polls every 30 seconds. It loads one bounded snapshot, provides manual refresh, and may add visibility-aware health refresh only if supported by the implementation design.

### Accessibility
- Preserve keyboard navigation, visible focus, semantic landmarks, one `h1` per route, accessible icon labels, focus-managed drawer/dialogs, and focus return.
- Announce route async state through restrained live regions; use `aria-busy` for loading sections.
- Test desktop, tablet, and mobile layouts, 200% zoom, high contrast, and reduced motion.

## Test and Verification Plan

### API tests
- Missing/invalid JWT, server-derived scope, guessed IDs, nested resource tampering, malformed IDs, invalid filters/sorts/cursors, capped limits, uniform missing/out-of-scope behavior, and safe error envelopes.
- Dashboard source availability/freshness, no fake metrics, portal-status redaction, status/config redaction, and no browser automation secret.
- Existing CRM and Client Portal service delegation, including invitations/resends/revocation/publication/revocation, without altered legacy route contracts.

### Repository and service tests
- Verify every new query applies `owner_user_id` and relationship predicates before select/count/search/rank.
- Assert fixed projections, stable ordering, cursor behavior, bounded result sizes, query-length limits, and no new `select('*')` read path.
- Verify employee task/project associations, document-to-owned-client filtering, attributable audit filtering/redaction, safe unavailable source mapping, and no signed URL/storage path exposure.

### Integration tests
- Use disposable CI PostgreSQL/Supabase fixtures only; never reset preserved local data.
- Test two-owner isolation for dashboard, CRM, client, project, task, employee, document, audit, and search reads.
- Test existing Client Portal membership/document lifecycle facade reuse and confirm no Client Portal route behavior changes.
- Test employee assignment scope without invoking or changing Employee Portal completion behavior.

### Frontend tests
- Existing refresh/login/logout transport, memory-only data, one 401 retry, state clearing, and no persistent storage.
- Responsive shell navigation, search dialog, quick-action enablement, unavailable future controls, filters/cursors, pagination, loading/empty/error states, safe retry, and accessible confirmations.
- Source/freshness display, partial dashboard availability, no fake zero values, no eager document URL request, and no automation secret header.

### Accessibility and regression tests
- Keyboard-only navigation, focus trap/return, visible focus, accessible names, live updates, table semantics, mobile drawer behavior, high contrast, reduced motion, and zoom.
- Retain existing auth, CRM, Employee Portal, Client Portal, lint, type-check, frontend test, production build, secret scan, and integration coverage.

### Production/release verification
1. Run affected API tests and Owner Workspace PostgreSQL integration with disposable data.
2. Run web lint, type-check, dashboard/frontend tests, and production build.
3. Run existing API/auth/CRM/Employee Portal/Client Portal regressions and secret scan.
4. Manually smoke owner overview, scoped navigation, client invitation/document publication, employee read-only views, search, keyboard navigation, responsive layouts, and sign-out state clearing.
5. Run Markdown diagnostics and `git diff --check`; record all outputs before any release decision.

## Security Checklist
- [ ] Existing login, JWT, refresh token, HttpOnly cookie, session, logout, password policy, lockout, and refresh lifecycle are reused with no changes.
- [ ] Every owner facade request derives `ownerUserId` server-side from `req.user.sub`; no browser-provided scope value is trusted.
- [ ] Every repository query combines owner scope with resource/relationship predicates before reading, counting, searching, ranking, or mutating.
- [ ] Fixed allowlist projections prevent raw database rows, audit details, provider errors, secrets, tokens, credentials, signed URLs, and storage paths from reaching the browser.
- [ ] Existing Client Portal invitation, membership, private Storage, signed-download, and document visibility rules are reused without expanding client permissions.
- [ ] Existing Employee Portal middleware, session behavior, task completion/reopening RPC, and response projection remain unchanged.
- [ ] The Owner API client never imports the shared-secret API client or sends `NEXT_PUBLIC_AUTOMATION_SECRET`, `x-automation-secret`, or caller-controlled `x-client-id`.
- [ ] Owner-scoped responses use private no-store semantics and clear memory on logout, denial, refresh failure, or identity transition.
- [ ] Every newly approved mutation has safe actor/action/target/outcome audit behavior; unsupported audit classes are excluded.

## Implementation Estimates
| Workstream | Files | Estimated lines |
|---|---:|---:|
| Owner Workspace backend module, bounded CRM reads, and app mount | 6 | 900–1,400 |
| Route-local shell, pages, components, and in-memory client | 20–24 | 1,400–2,200 |
| API, repository, integration, frontend, accessibility, and regression tests | 6–8 | 900–1,400 |
| **Total** | **24–32 created; 5–7 modified** | **3,200–5,000** |

The estimate stays within the approved range because the plan reuses current auth, CRM validation, Client Portal lifecycle services, employee assignment validation, shared app layout, and existing test tooling. It excludes every future-scope data model and workflow.

## Final Approval Boundary
`tasks.md` is complete as an implementation plan only. Do not write implementation code, migrations, authentication changes, Employee Portal changes, Client Portal changes, CI changes, deployment changes, infrastructure changes, commits, tags, or pushes until explicit implementation approval is granted.
