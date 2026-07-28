# JARVIS PRIME Roadmap

## Current release

✅ **Phase 7 — Client Portal Complete**
**Version:** `v0.10.0`
**Git Tag:** `v0.10.0-client-portal`
**Status:** Complete
**Completion Date:** July 19, 2026

## Implemented business workflow

```text
Website Lead → CRM Lead → Client → Project → Task → Employee Portal → Client Portal
```

This workflow now includes a dedicated, read-only external Client Portal.

## Phase 7 delivery

- Client authentication through existing login, JWT access-token, HttpOnly refresh-cookie, and logout behavior.
- Account-bound invitation activation for one active client membership and one CRM client scope.
- Client Workspace with read-only client-safe projects, tasks, and approved private-document downloads.
- Owner invitation/document publication lifecycle controls kept inside the CRM boundary.

## Architecture, security, and accessibility decisions

- Client Scope is derived only from exactly one active server-side membership for the JWT subject; request-supplied identifiers never authorize access.
- Invitations are hashed, single-use, 24-hour, account-bound, and atomically activated or revoked; private documents use short-lived signed URLs after combined scope authorization.
- Client data, tokens, invitations, and signed URLs are transient in browser memory; the UI clears state on logout and access failure.
- Credentialed CORS requires exact allowed origins, with wildcard credentialed configuration rejected.
- Responsive, keyboard-operable sign-in, activation, workspace, download, loading, error, and empty states include accessible names and announcements.

## Testing and CI

- Added focused API security coverage, disposable PostgreSQL integration coverage, and route-local frontend tests.
- CI now runs the Client Portal integration target alongside web lint, type-check, frontend tests, and production build.

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
✅ Phase 7 Client Portal
⏳ Phase 8 Owner Workspace (Dashboard)
⏳ Phase 9 Finance & Billing
⏳ Phase 10 Communication Hub
⏳ Phase 11 Automation Platform
⏳ Phase 12 Analytics & Reporting
⏳ Phase 13 Production & DevOps
⏳ Phase 14 AI Foundation
⏳ Phase 15 AI Sales Agents
⏳ Phase 16 AI Operations
⏳ Phase 17 Enterprise Security
🚀 Version 1.0 Release
