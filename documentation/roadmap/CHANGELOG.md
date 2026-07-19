# Changelog

All notable changes to JARVIS PRIME are documented in this file.

## [0.10.0] — 2026-07-19

**Release:** Client Portal
**Git Tag:** `v0.10.0-client-portal`

### Added

- Client authentication through the existing login, JWT access-token, HttpOnly refresh-cookie, and logout lifecycle.
- Account-bound invitation issue, resend, revocation, and authenticated activation.
- Read-only Client Workspace with client-safe projects, tasks, and approved private-document downloads.
- Additive Client Portal membership, invitation, private-document, Storage, RLS, index, and lifecycle-RPC database boundary.

### Security and accessibility

- Exactly-one, server-derived Client Scope isolation for every protected portal request.
- Hash-only, single-use, expiring invitations; generic activation failures; safe lifecycle auditing; and private 60-second document URLs.
- Explicit credentialed CORS allowlists with wildcard configuration rejection.
- Memory-only client state and accessible, responsive, keyboard-operable sign-in, activation, workspace, loading, error, empty, and download controls.

### Testing and CI

- Focused API authorization and scope-tampering coverage.
- Disposable PostgreSQL integration coverage for lifecycle, isolation, and RPC behavior.
- Route-local frontend testing for session handling, activation URL cleanup, workspace states, downloads, and accessibility.
- CI additions for Client Portal PostgreSQL integration, web lint, type-check, frontend tests, and production build.

## [0.9.0] — 2026-07-18

**Git Tag:** `v0.9.0-employee-portal`

### Added

- Employee Portal with a database-scoped portal snapshot.
- Directly assigned employee task completion and reopening.
- Atomic completion audit records through a PostgreSQL RPC.
- Employee task isolation by active employee, owner scope, and assignment.

### Improved

- Employee authentication lifecycle with fresh-install validation.
- Controlled employee provisioning for development and production bootstrap.
- Login rate limiter behavior, refresh concurrency handling, and logout reliability.
- PostgreSQL and endpoint lifecycle integration coverage.

### Security

- Database-derived owner scope and validated employee assignment.
- `SECURITY DEFINER` task-completion RPC with a restricted search path.
- Least-privilege `service_role` permissions for the Phase 6 lifecycle.
- Hardened refresh rotation and server-side logout revocation behavior.

### Tests

- API and focused Employee Portal tests passed.
- PostgreSQL RPC and Employee lifecycle integration tests passed.
- Build, lint, diagnostics, and diff checks passed.

## [0.8.0] — 2026-07-15

### Added

- Owner-scoped Task Management nested under `/api/projects/:projectId/tasks`.
- Task list, creation, rename, completion/reopening, and deletion operations.
- `crm_tasks` with a required owner, project relationship, nonblank name, and minimal `completed` lifecycle state.

### Improved

- Project deletion now returns `409 PROJECT_HAS_TASKS` while tasks exist.
- The implemented customer lifecycle now extends through Task Management: Website Lead → CRM Lead → Client → Project → Task.

### Security

- Task access uses existing JWT authentication and direct `owner_user_id` plus `project_id` scoping.
- Every task operation verifies ownership of the parent project before access or mutation.

### Architecture

- Extended the existing CRM repository, service, and route files.
- Added no separate Tasks module, generic CRUD, generic repository, generic service, or unnecessary abstraction.
- Kept the API project-nested and the schema limited to the current runtime requirements.

## [0.7.0] — 2026-07-15

### Added

- Owner-scoped Project Management at `/api/projects`.
- Project list, create, rename, and delete operations.
- `crm_projects` with required CRM client ownership.

### Improved

- CRM client deletion now returns `409 CLIENT_HAS_PROJECTS` while projects exist.

### Security

- Project access uses existing JWT authentication and direct `owner_user_id` scoping.
- Project creation verifies ownership of the selected CRM client.

### Architecture

- Reused the existing CRM repository, service, and route module.
- Kept explicit methods and avoided generic CRUD, generic repositories, and unnecessary abstractions.
- Kept Projects separate from Tasks.

## [0.6.0] — 2026-07-15

### Added

- Owner-scoped Client Management at `/api/crm`.
- CRM Lead → Client conversion that preserves CRM lead history.
- Client-contact operations and atomic PostgreSQL conversion.

### Security

- Client and client-contact access requires JWT authentication and owner scoping.

[0.7.0]: https://github.com/Singhscode/jarvis-prime/releases/tag/v0.7.0-project-management
[0.6.0]: https://github.com/Singhscode/jarvis-prime/releases/tag/v0.6.0-client-management
