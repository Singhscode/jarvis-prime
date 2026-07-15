# Changelog

All notable changes to JARVIS PRIME are documented in this file.

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
