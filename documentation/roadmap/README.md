# JARVIS PRIME Roadmap

## Current release

✅ **Phase 6 — Employee Portal Complete**
**Version:** `v0.9.0`
**Git Tag:** `v0.9.0-employee-portal`
**Status:** Complete
**Completion Date:** July 18, 2026

## Implemented business workflow

```text
Website Lead → CRM Lead → Client → Project → Task → Employee Portal
```

This workflow is fully implemented through the Employee Portal.

## Phase 6 delivery

- Employee Portal snapshot for active employees and directly assigned owner-scoped work.
- Existing JWT/session authentication with HttpOnly refresh cookies.
- Employee task completion and reopening with justification and an atomic completion audit.
- Controlled employee provisioning and validated owner task assignment.
- Fresh-install lifecycle coverage for login, refresh, portal access, task completion, logout, and re-login.

## Architecture and database decisions

- Extended the existing CRM module; no HR, employee-management, assignment, generic CRUD, or generic service module was created.
- Kept exactly two Employee Portal endpoints: `GET /api/employee-portal` and `PATCH /api/employee-portal/tasks/:taskId`.
- Added employee owner scope and task assignment fields plus one atomic PostgreSQL RPC.
- Derived owner scope, employee role, active status, and assignment eligibility from the database.

## Phase 6.1 stabilization

- Least-privilege server-role database permissions.
- Response-aware login rate limiting and single-flight refresh handling.
- Truthful logout revocation errors and lifecycle integration coverage.

## Delivery roadmap

✅ Phase 0 Repository Cleanup
✅ Phase 0.5 Database Audit
✅ Phase 0.6 Runtime Stabilization
✅ Phase 1 Core User Platform
✅ Phase 2 CRM Foundation
✅ Phase 3 Client Management
✅ Phase 4 Project Management
✅ Phase 5 Task Management
✅ Phase 6 Employee Portal
⏳ Phase 7 Client Portal
⏳ Phase 8 Finance & Billing
⏳ Phase 9 Communication Hub
⏳ Phase 10 Automation Platform
⏳ Phase 11 Analytics & Reporting
⏳ Phase 12 Production & DevOps
⏳ Phase 13 AI Foundation
⏳ Phase 14 AI Sales Agents
⏳ Phase 15 AI Operations
⏳ Phase 16 Enterprise Security
🚀 Version 1.0 Release
