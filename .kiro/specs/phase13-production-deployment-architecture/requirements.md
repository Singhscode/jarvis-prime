# Requirements Document

## Introduction
This design-only feature defines how JARVIS PRIME moves from laptop-local development to a secure managed production service. It covers the existing Next.js web app, long-running Node.js API, Supabase-backed data plane, authenticated owner and employee workflows, automation scheduling, and operational controls. It creates no infrastructure, changes no application behavior, and does not start Phase 8.

## Glossary
- **Production_System**: The managed services that deliver the existing application to real users.
- **Owner**: An active user with `role = client`; no literal `owner` role is introduced.
- **Employee**: An active user with `role = employee` who uses `/employee`.
- **Release_Candidate**: An immutable commit or version tag that passed required checks.
- **Deployment_Runbook**: The produced operating and recovery instructions.

## Requirements

### Requirement 1: Define a Managed Production Topology
**User Story:** As the company owner, I want a provider-backed production topology, so users never depend on a laptop, local Docker, or local Supabase.
#### Acceptance Criteria
1. THE architecture SHALL recommend one primary provider and service placement for web, persistent API hosting, managed PostgreSQL/auth/storage, transactional email, monitoring, log aggregation, DNS, and secret storage. 2. THE architecture SHALL document a cost-conscious startup baseline and compatible enterprise migration path for every service. 3. THE architecture SHALL preserve existing web, API, Supabase, JWT/session, CRM, Employee Portal, and business boundaries.

### Requirement 2: Separate Request Serving from Automation Scheduling
**User Story:** As an operator, I want API replicas and automation scheduling controlled independently, so scaling web traffic cannot duplicate outbound work.
#### Acceptance Criteria
1. THE architecture SHALL run the existing Node HTTP server as a managed, health-checked service using its current command and graceful shutdown behavior. 2. THE architecture SHALL define exactly one production scheduler execution path, singleton/concurrency guarantee, time zone, retries, and disable switch. 3. THE Deployment_Runbook SHALL define independent scaling, restart, and rollback for request-serving and scheduler workloads.

### Requirement 3: Establish Domain, TLS, and Browser Boundaries
**User Story:** As a user, I want secure production URLs that work with login and refresh cookies, so browser sessions are reliable.
#### Acceptance Criteria
1. THE architecture SHALL define canonical production URLs for marketing/owner web, API, `/employee`, public webhooks, and unsubscribe flow, plus staging equivalents. 2. THE architecture SHALL require managed TLS, HTTPS-only access, DNS ownership, and explicit redirects. 3. THE architecture SHALL define production CORS origins, cookie attributes, proxy trust, and cross-origin credential behavior without weakening authentication.

### Requirement 4: Define Environment and Secret Management
**User Story:** As an operator, I want environment-specific configuration managed outside the repository, so no secret is committed or copied into client builds.
#### Acceptance Criteria
1. THE architecture SHALL inventory required configuration by service and environment, including database/auth, JWT, API URL, email, AI, outreach, notifications, compliance, scheduler, and observability. 2. THE architecture SHALL specify secret ownership, least-privilege access, rotation, revocation, audit access, and managed-service injection. 3. THE architecture SHALL prohibit service-role keys, JWT secrets, refresh tokens, password hashes, provider keys, and connection strings in browser code, logs, CI output, and docs.

### Requirement 5: Define Remote Supabase Lifecycle and Data Protection
**User Story:** As the company owner, I want protected managed data with repeatable schema promotion and recovery, so production never depends on local volumes.
#### Acceptance Criteria
1. THE architecture SHALL select and document one staging-to-production isolation model: separate managed Supabase projects, or a single managed project with separately identified database, authentication, storage, credential, backup, and access-control boundaries; it SHALL state how the model prevents staging access from reading or modifying production data while retaining `database/supabase/migrations/` as the canonical schema source. 2. IF migration validation, approval, or production migration fails, THEN promotion SHALL stop, the active release/schema versions SHALL be recorded, retained data SHALL be preserved, and a forward-correction or verified-backup restoration decision path SHALL be defined; destructive reset of retained data is prohibited. 3. THE architecture SHALL specify backup frequency and retention, RPO and RTO in hours, restore-test cadence, protected database/object/backup data stores, success evidence, and separately reviewed/revoked human and service access categories for staging and production.

### Requirement 6: Preserve Owner and Employee Operations
**User Story:** As an Owner or Employee, I want simple browser-only workflows, so routine work requires no operational command line knowledge.
#### Acceptance Criteria
1. THE Owner workflow SHALL cover first-time bootstrap, secure initial credential handoff, login, CRM/dashboard access, internal operator employee creation through only `npm run employee:create`, task assignment, and outcome review. 2. THE Employee workflow SHALL cover production `/employee` navigation, login, session refresh, assigned-work viewing, justified completion/reopening, and logout. 3. THE architecture SHALL preserve database-derived owner scope, direct assignment, JWT/session behavior, and the distinction between website `public.leads` and CRM leads.

### Requirement 7: Define Production Delivery Controls
**User Story:** As a maintainer, I want a controlled path from commit to production, so a passing build becomes a verified reversible release.
#### Acceptance Criteria
1. WHEN a Release_Candidate is proposed for staging or production, THE architecture SHALL require successful API tests, database integration tests, web lint/build, migration compatibility, secret scanning, dependency/security review, and a pinned supported Node version before promotion; it SHALL define promotion-blocking findings and named, expiring exception approval. 2. WHEN staging verification succeeds, THE architecture SHALL define the authorized production approver, approved immutable Release_Candidate, ordered application deployment/schema promotion/post-deploy `/live`, `/ready`, and authenticated-smoke checks, and the rule that production uses the approved artifact without source changes; IF a required check fails, it SHALL define traffic rollback to a previously verified release, non-destructive schema handling, and incident-close evidence. 3. THE design SHALL compare current GitHub workflows with these controls and produce a design-only gap list identifying the workflow, risk, and remediation recommendation for every missing or incomplete control; it SHALL not modify workflows in this phase.

### Requirement 8: Provide Observable and Actionable Operations
**User Story:** As an operator, I want timely privacy-safe signals about health and business-critical failures, so I can resolve incidents before users are blocked.
#### Acceptance Criteria
1. THE architecture SHALL define uptime, readiness, database, scheduler, webhook, authentication, email-delivery, and error-rate monitoring with alert routing and escalation ownership. 2. THE architecture SHALL define structured logs, correlation identifiers, redaction rules, retention, dashboards, and access controls. 3. THE Deployment_Runbook SHALL include incident triage for web, API, Supabase, scheduler, email, and credential failures.

### Requirement 9: Define Security and Compliance Controls
**User Story:** As the business owner, I want production controls appropriate for customer data and outbound email, so the system is defensible as it grows.
#### Acceptance Criteria
1. THE architecture SHALL document least-privilege provider access, environment separation, auditability, rate limiting, edge protections where appropriate, webhook verification, dependency patching, and access-review cadence. 2. THE architecture SHALL require SPF, DKIM, DMARC, valid sender identity, postal address, unsubscribe handling, and pre-send safety verification before `DRY_RUN=false`. 3. THE architecture SHALL define what application, audit, and outreach data is retained, encrypted, deleted, and exportable.

### Requirement 10: Bound the Design Deliverables
**User Story:** As a maintainer, I want an executable plan before implementation, so operational decisions are reviewed without accidental production changes.
#### Acceptance Criteria
1. THE feature SHALL produce a technical design, provider decision matrix, environment/secret matrix with names only, deployment/rollback runbooks, bootstrap checklist, operational ownership model, cost assumptions, and phased implementation plan. 2. THE feature SHALL make zero application-code, authentication, API, database-schema, migration, deployment-workflow, infrastructure, provider-account, DNS, or secret changes. 3. THE subsequent implementation plan SHALL identify approvals required before production-impacting action and SHALL not commit, tag, or push unless explicitly requested.
