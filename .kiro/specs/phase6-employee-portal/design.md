# Phase 6 Employee Portal Technical Design

## Overview
Phase 6 adds a small, authenticated Employee Portal to the existing CRM lifecycle: Website Lead → CRM Lead → Client → Project → Task → Employee Portal. It is not HR, employee management, analytics, a dashboard platform, or task-assignment tooling.

## Architecture
All backend behavior remains in the existing CRM module. `crm.routes.js` contains the two portal routes and, only because the existing CRM router is mounted at `/api/crm`, one additional Express Router instance in that same file is mounted at `/api/employee-portal`. No router file, module, middleware, or generic abstraction is introduced. Existing JWT authentication, refresh flow, role middleware, `AppError`, async handler, logger, response envelope, and CRM layering remain unchanged.

## Components and Interfaces
`GET /api/employee-portal` returns exactly `{ projects, tasks, clients, leads }`. `PATCH /api/employee-portal/tasks/:taskId` accepts exactly `{ completed: boolean, justification: string }`. The page at `/employee` is the sole frontend file and fetches the snapshot, renders its four collections, submits completion/reopen changes, and refreshes the snapshot.

## Data Models
One additive migration adds nullable `users.portal_owner_user_id`, nullable `crm_tasks.assigned_user_id`, one `crm_tasks_assigned_user_id_idx`, and one atomic PostgreSQL RPC for task completion plus audit insertion. No table, profile, settings, permission, assignment API, extra index, trigger, policy, or additional SQL function is added. Assignment data is populated by the existing controlled administrative/database process, not by Employee Portal APIs.

## Correctness Properties
### Property 1: Scoped Snapshot
Every portal record belongs to the current employee's database-derived `portal_owner_user_id`, and every returned task additionally has `assigned_user_id` equal to the JWT subject.

**Validates: Requirements 1.1, 2.2**

### Property 2: Derived Work
Projects are derived only from directly assigned tasks.

**Validates: Requirements 2.2**

### Property 3: Atomic Completion
The completion RPC changes only `completed` and atomically inserts one audit record; failure rolls back both.

**Validates: Requirements 3.2, 3.3**

### Property 4: Non-Disclosure
Missing and inaccessible tasks share `404 TASK_NOT_FOUND` without disclosing ownership.

**Validates: Requirements 3.4, 4.2**

## Error Handling
Existing `401`, `403 INSUFFICIENT_PERMISSIONS`, `403 EMPLOYEE_SCOPE_MISSING`, `400 INVALID_FIELDS`, `400 VALIDATION_ERROR`, `400 EMPTY_UPDATE`, and `404 TASK_NOT_FOUND` responses are reused. The service translates RPC failures into these existing `AppError` contracts and logs rejected out-of-scope attempts without returning internal scope data.

## Testing Strategy
Focused production tests cover authentication, employee authorization, owner isolation, assignment isolation, forbidden fields, and completion RPC behavior only. Existing test, lint, type-check, build, diagnostics, and diff checks remain the release gates.

## Implementation Boundary
Create only the migration, `apps/web/src/app/employee/page.tsx`, and `apps/api/test/employee-portal.test.js`. Modify only `crm.repository.js`, `crm.service.js`, `crm.routes.js`, and `app.js`. Repository methods are explicit: `getActiveEmployeeById`, `listAssignedTasks`, `listEmployeeProjects`, `listEmployeeClients`, `listEmployeeLeads`, and `completeTask`. The page target is 100–140 lines; total implementation target is approximately 475 lines.
