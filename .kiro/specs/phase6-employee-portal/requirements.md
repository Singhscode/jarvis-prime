# Requirements Document

## Introduction
Phase 6 provides a minimal Employee Portal at `/employee` for authenticated internal employees to view assigned CRM work and complete or reopen directly assigned tasks. It reuses existing authentication and CRM behavior without adding HR, profiles, dashboards, analytics, settings, assignments, or generic abstractions.

## Glossary
- **Employee_Portal_API**: The two routes mounted at `/api/employee-portal` from the existing CRM route file.
- **Employee**: An active `users` row with `role = 'employee'`.
- **Portal_Owner_Scope**: The employee's database-derived `portal_owner_user_id`.
- **Assigned_Task**: A task with matching `owner_user_id` and `assigned_user_id` values for the current Employee.
- **Portal_Snapshot**: `{ projects, tasks, clients, leads }`.
- **Completion_Update**: Exactly `{ completed: boolean, justification: string }`, where justification trims to 1–1000 characters.

## Requirements

### Requirement 1: Authenticate and Scope the Employee
**User Story:** As an Employee, I want my portal access scoped from my authenticated identity, so that I cannot choose another owner's data.

#### Acceptance Criteria
1. WHEN a valid JWT identifies an active Employee, THE Employee_Portal_API SHALL load the current employee with `getActiveEmployeeById` and derive Portal_Owner_Scope from the database.
2. IF authentication fails, THEN THE Employee_Portal_API SHALL return the existing `401` response.
3. IF the user is not an active Employee, THEN THE Employee_Portal_API SHALL return `403 INSUFFICIENT_PERMISSIONS`.
4. IF Portal_Owner_Scope is null, THEN THE Employee_Portal_API SHALL return `403 EMPLOYEE_SCOPE_MISSING`.

### Requirement 2: Return One Scoped Snapshot
**User Story:** As an Employee, I want one read-only view of my assigned work, so that I need no separate CRM calls.

#### Acceptance Criteria
1. WHEN an authorized Employee requests `GET /api/employee-portal`, THE Employee_Portal_API SHALL return one Portal_Snapshot and no profile, session, audit, or security data.
2. THE Employee_Portal_API SHALL return only owner-scoped clients and unconverted leads, directly Assigned_Tasks, and distinct projects referenced by those tasks.
3. THE Employee_Portal_API SHALL return explicit safe fields only and treat all snapshot resources as read-only.

### Requirement 3: Complete an Assigned Task Atomically
**User Story:** As an Employee, I want to complete or reopen my assigned task with a justification, so that the change is accountable.

#### Acceptance Criteria
1. WHEN an Employee submits a valid Completion_Update to `PATCH /api/employee-portal/tasks/:taskId`, THE Atomic_Task_Update_Function SHALL verify employee status, Portal_Owner_Scope, task ownership, and direct assignment.
2. THE Atomic_Task_Update_Function SHALL update only `completed` and create exactly one audit record with the trimmed justification and old/new values in one transaction.
3. IF validation, ownership, assignment, update, or audit insertion fails, THEN THE operation SHALL roll back with no task or audit change.
4. IF the task is missing or inaccessible, THEN THE Employee_Portal_API SHALL return `404 TASK_NOT_FOUND` without task data.

### Requirement 4: Reject Forbidden Input
**User Story:** As a CRM owner, I want employee mutations limited to the approved state change, so that ownership and task data remain protected.

#### Acceptance Criteria
1. IF a completion body is empty, incomplete, malformed, blank, oversized, or includes any field other than `completed` and `justification`, THEN THE Employee_Portal_API SHALL return the applicable existing `400` error.
2. IF a portal request supplies owner, scope, role, assignment, project, or task-name input, THEN THE Employee_Portal_API SHALL reject it and make no state change.

### Requirement 5: Preserve Boundaries
**User Story:** As a maintainer, I want the portal constrained to the approved schema and API, so that Phase 6 remains small and auditable.

#### Acceptance Criteria
1. THE Employee_Portal_API SHALL expose exactly `GET /api/employee-portal` and `PATCH /api/employee-portal/tasks/:taskId`.
2. THE two routes SHALL live in `apps/api/src/modules/crm/crm.routes.js`; a second Router instance in that file is permitted solely for root-path mounting.
3. THE feature SHALL create no assignment endpoint and SHALL leave existing CRM owner operations unchanged.
4. THE feature SHALL add only `portal_owner_user_id`, `assigned_user_id`, one assignment index, and one completion/audit RPC; it SHALL add zero tables, extra indexes, or extra functions.

### Requirement 6: Provide One Small Page
**User Story:** As an Employee, I want one simple page for my assigned work, so that the portal has no unnecessary UI layers.

#### Acceptance Criteria
1. WHEN an Employee visits `/employee`, THE single `apps/web/src/app/employee/page.tsx` page SHALL use existing login, refresh, logout, and in-memory access-token behavior.
2. THE page SHALL fetch Portal_Snapshot, render projects, tasks, clients, and leads, submit completion/reopen changes, and refresh the snapshot.
3. THE page SHALL be 100–140 lines and SHALL provide zero profiles, settings, dashboards, analytics, widgets, layouts, state libraries, or component abstractions.

### Requirement 7: Constrain Files and Validation
**User Story:** As a maintainer, I want focused implementation and tests, so that Phase 6 remains easy to audit.

#### Acceptance Criteria
1. THE feature SHALL create only the migration, employee page, and focused employee API test file.
2. THE feature SHALL modify only `crm.repository.js`, `crm.service.js`, `crm.routes.js`, and `app.js`.
3. Focused tests SHALL cover authentication, employee authorization, owner isolation, assignment isolation, forbidden fields, and completion RPC behavior.
