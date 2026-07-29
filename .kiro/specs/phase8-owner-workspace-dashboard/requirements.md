# Requirements Document

## Status
**Phase 8 — Owner Workspace (Dashboard). Requirements only.** This document authorizes no design, implementation, migration, API change, authentication change, deployment, commit, tag, or push. Phase 8 work begins only after explicit approval of these requirements and a subsequent technical design.

## Introduction
Phase 8 establishes the **Owner Workspace**: one professional, browser-based control plane for the day-to-day operation of JARVIS PRIME. An authorized owner can understand what needs attention, operate approved company workflows, and investigate safe business and security history without SQL, CLI commands, developer tools, or direct database access.

The workspace is a single experience within the existing Next.js application at `/dashboard`. It must feel focused and fast: a dense but readable operating system inspired by the organizational clarity of Linear, Notion, HubSpot, Stripe Dashboard, and GitHub Enterprise. It is not a separate application, domain, authentication system, CRM replacement, or generic admin framework.

## 2. Goals
1. Give an authorized owner an immediate answer to: **What needs attention, what happened today, what is blocked, and what is growing?**
2. Provide a safe owner-scoped operational surface for the approved Phase 8 core: dashboard oversight; CRM, client, project, task, and document administration; existing Client Portal lifecycle administration; scoped audit review; and the workspace shell that can safely host later approved capabilities.
3. Make the status of finance, communication, automation, analytics, AI, security, and other future modules visible only to the extent that an existing approved source can safely support it. Their substantive workflows remain governed by their respective roadmap phases.
4. Reuse the existing Repository → Service → Route architecture, authentication/session behavior, CRM semantics, Employee Portal, Client Portal, and audited business rules wherever they already exist.
5. Add capabilities incrementally through explicit, narrow requirements and additive endpoints/data only where existing behavior cannot safely serve the Owner Workspace.
6. Keep the workspace keyboard-accessible, responsive, observable, and safe for an owner operating the company without developer intervention.

## 3. Non-goals and Preserved Boundaries
Phase 8 SHALL NOT redesign or replace existing authentication, JWT access tokens, refresh-token cookies, sessions, password behavior, CRM architecture, Employee Portal, Client Portal, database schema, or existing API contracts.

Phase 8 SHALL NOT create a separate Next.js project, separate owner domain, duplicate data store, generic CRUD framework, generic permission framework, browser-side service credentials, direct SQL console, CLI replacement, or cross-tenant administration capability. Existing public, employee, and client route behavior remains unchanged unless separately approved as an additive integration.

Phase 8 SHALL NOT silently implement Finance & Billing (Phase 9), Communication Hub (Phase 10), Automation Platform (Phase 11), Analytics & Reporting (Phase 12), Production & DevOps (Phase 13), AI Foundation (Phase 14), AI Sales Agents (Phase 15), AI Operations (Phase 16), or Enterprise Security (Phase 17). Navigation placement, dashboard availability, or a future capability label SHALL NOT be treated as authorization to create its data model, workflow, integration, or write operation.

## Glossary
- **Owner**: An authenticated identity authorized by the existing server-side dashboard/ownership policy to operate a bounded company/CRM scope. Phase 8 introduces no literal `owner` role and does not alter role assignment.
- **Owner Workspace**: The `/dashboard` experience and its narrow owner-only APIs.
- **Workspace Scope**: The owner/company scope derived server-side from the authenticated identity; never selected from browser input.
- **Operational Record**: A business record such as a company, contact, lead, client, employee, project, task, document, invoice, job, agent, notification, or audit event.
- **Capability**: A separately authorized Owner Workspace module with a defined source of truth, permission rule, lifecycle, audit behavior, and delivery increment.
- **Attention Item**: A scoped, explainable summary of an existing operational condition that requires, blocks, or benefits from owner review.
- **Source of Truth**: The existing bounded repository/service and persistent record that authoritatively supplies an operational value. A dashboard summary never becomes a second source of truth.
- **Actionable Notification**: A permission-checked, scoped notification that links to an owner-authorized action or detail view; it is not a transport for secrets or unrestricted messaging.

## Requirements

### Requirement 1: Permission and Scope Model
#### Acceptance Criteria
1. Every Owner Workspace read and mutation SHALL require existing authentication and an existing server-derived owner authorization check.
2. Browser-supplied owner, company, client, employee, project, task, document, invoice, job, agent, or audit identifiers are locators only; they SHALL NEVER establish Workspace Scope or authorization.
3. Every query and mutation SHALL combine the resolved Workspace Scope with the requested record identifier before returning or changing data.
4. Missing, out-of-scope, disabled, archived, or unauthorized records SHALL use existing non-disclosing failure behavior and reveal no other-owner existence, ownership, count, or operational detail.
5. Client and employee users SHALL NOT obtain Owner Workspace access merely because they can access the Client Portal or Employee Portal.
6. The existing server-side identity-to-owner policy is the sole authority for Owner Workspace entitlement. Before implementation, the design SHALL identify the current policy and route guard precisely; Phase 8 SHALL not add, reinterpret, or broaden a role merely to expose `/dashboard`.
7. Authorization SHALL be re-evaluated on every protected request. A previously rendered dashboard card, search result, notification, or cached browser response SHALL NOT authorize later retrieval or mutation.
8. Owner Workspace state containing scoped operational records, access tokens, refresh tokens, signed URLs, credentials, or sensitive search results SHALL NOT be retained in persistent browser storage. Existing token and session handling remains authoritative.

## 6. Capability Classification and Delivery Gates
The following classification prevents Phase 8 from absorbing work assigned to later roadmap phases.

| Capability area | Phase 8 requirement | Boundary |
|---|---|---|
| Dashboard and navigation | Core workspace shell, owner attention, existing-data health summaries, safe navigation | No invented metrics or hidden operational source of truth |
| CRM, clients, projects, tasks | Core owner operations, subject to existing business rules and narrow additive behavior where approved | No generic CRUD or cross-scope access |
| Client Portal lifecycle and documents | Integrate and manage already approved Client Portal invitation/document lifecycle; document operations require explicit policy | Client Portal remains read-only and client-scoped |
| Employee oversight | Read-only, existing-data oversight where available | Creation, deactivation, password reset, lifecycle, or auth/data-model changes require separate approved decisions |
| Finance and billing | Optional read-only summary only from already approved authoritative records | Phase 9 owns invoice, subscription, payment, balance, and financial workflow implementation |
| Communication and notifications | Workspace-local notification presentation and existing delivery history only where safe | Phase 10 owns inbox, announcements, messaging, and communication workflow implementation |
| Automation | Status visibility only for existing safe job evidence | Phase 11 owns scheduling, retries, execution controls, failure queues, and automation writes |
| Analytics | Limited dashboard indicators with defined existing sources | Phase 12 owns reporting data models, analytical computation, exports, and KPI governance |
| AI | Health/usage status only from already approved safe sources | Phases 14–16 own agents, prompts, model configuration, token accounting, and AI task controls |
| Settings and security | Read-only configuration/status inventory where safe | Phase 17 owns permissions, security administration, keys, and privileged settings workflows |

A capability SHALL NOT move from visibility to mutation until its repository, service, route, authorization predicate, source of truth, audit event, validation rule, failure behavior, and dependency ownership have been explicitly identified and approved in the subsequent design.

## 7. Owner Dashboard and Attention Model
**User Story:** As an Owner, I want one trustworthy dashboard that identifies attention, today’s activity, blocked work, and growth signals, so I can prioritize company operations without developer tools.

### Acceptance Criteria
1. The `/dashboard` landing view SHALL provide an owner-scoped overview containing approved revenue, active-client, active-employee, open-project, open-task, completed-task, today’s-meeting, automation-health, AI-health, recent-activity, notification, and system-alert summaries only when each value has a defined Source of Truth.
2. Every displayed metric SHALL state or expose its time window, freshness, unit, and safe drill-down destination. If a source is unavailable, delayed, unauthorized, or not yet implemented, the UI SHALL show an explicit unavailable or not-configured state rather than zero, fabricated, stale, or misleading data.
3. An Attention Item SHALL identify its category, severity, safe timestamp, reason, source freshness, and owner-authorized next action or detail view. It SHALL not disclose another Workspace Scope through aggregate counts, labels, search suggestions, or links.
4. Dashboard indicators SHALL be derived from authoritative operational records or approved service health signals; they SHALL not introduce a parallel business state, modify records during read, or infer a business outcome from incomplete data.
5. The dashboard SHALL prioritize actionable blocked, overdue, failed, expiring, or security-relevant conditions ahead of passive aggregate metrics, with user-visible empty and all-clear states.
6. Existing future-phase sources may appear only as clearly labelled read-only availability/status cards. A card SHALL not imply that its underlying Phase 9–17 management workflow exists.

## 8. CRM Management
**User Story:** As an Owner, I want to manage companies, contacts, leads, and pipeline records within my Workspace Scope, so sales operations remain accurate and traceable.

### Acceptance Criteria
1. The CRM capability SHALL provide owner-authorized discovery and detail views for in-scope companies, contacts, leads, pipeline state, tags, relationship history, and activity history using existing CRM semantics and safe projections.
2. It SHALL support the explicitly approved lifecycle actions for companies, contacts, leads, pipeline stage, tags, and relationship links only when each action reuses an existing business rule or receives an additive, narrowly specified replacement rule.
3. CRM list and search views SHALL provide bounded pagination, stable ordering, scoped filters, filter reset, safe empty states, and clear indication of applied filters. Filter values and record identifiers SHALL never broaden Workspace Scope.
4. A CRM timeline SHALL distinguish actor, action, target, safe timestamp, outcome, and approved human-readable summary. It SHALL not expose raw request bodies, credentials, tokens, secret values, private internal notes not authorized for the Owner view, or other-scope events.
5. Create, edit, archive, restore, merge, conversion, and deletion behavior SHALL be separately specified for each record class before implementation. No generic “save any record” operation is permitted.
6. Conflicting or stale updates SHALL fail safely with an accessible recovery state and SHALL NOT silently overwrite a newer authoritative record.

## 9. Client Management and Client Portal Administration
**User Story:** As an Owner, I want a single scoped view of each client’s lifecycle and delivery context, so I can manage the client relationship without weakening Client Portal isolation.

### Acceptance Criteria
1. The capability SHALL present in-scope client identity, lifecycle state, project association, approved document association, safe activity, and Client Portal membership/invitation/portal status where an approved Source of Truth exists.
2. Client creation, editing, deactivation, archival, and restoration SHALL use existing CRM client business rules or a separately approved additive rule; the workspace SHALL not bypass validation by directly writing data or calling Storage/database administration interfaces.
3. Client invitation, resend, revocation, activation state, membership state, document publication, and document revocation SHALL preserve the Phase 7 account-bound membership, hashed invitation, server-derived Client Scope, private-document, auditing, and non-disclosure requirements.
4. Client Portal status views SHALL never show raw invitation values, password material, JWTs, refresh tokens, signed URLs, private object paths, or details that make a client member discoverable outside the Owner’s scope.
5. Invoice, subscription, payment, and outstanding-balance views may appear only as read-only references to existing approved financial sources. Creating, collecting, reconciling, changing, or exporting financial records is deferred to Phase 9.

## 10. Employee Oversight Boundary
**User Story:** As an Owner, I want visibility into authorized employee assignments and delivery activity, so I can coordinate work without changing the Employee Portal or authentication model accidentally.

### Acceptance Criteria
1. Where an approved existing source exists, the workspace SHALL provide scoped read-only views of employees, assigned projects/tasks, workload, availability, performance indicators, and activity history, including the source freshness and definition of each indicator.
2. Employee-facing `/employee` functionality, task-completion rules, session behavior, and existing portal data boundaries SHALL remain unchanged unless a separate additive integration is approved.
3. Browser-based employee creation, deactivation, password reset, credential handoff, role change, and account lifecycle operations SHALL NOT be implemented under these requirements until a separately approved security, authentication, data-model, delivery, and audit decision defines each workflow.
4. Assignment actions, if approved in a later Phase 8 increment, SHALL validate the Owner’s Workspace Scope, employee eligibility, project/task scope, assignment capacity rules, conflict behavior, notification behavior, and audit outcome before changing an assignment.
5. Performance and availability information SHALL have documented definitions, source freshness, access restrictions, retention, and correction/escalation pathways before it is presented as a management decision signal.

## 11. Project Management
**User Story:** As an Owner, I want to manage the lifecycle and delivery context of my projects, so company work stays organized and accountable.

### Acceptance Criteria
1. The project capability SHALL support safe in-scope project discovery and detail views with client association, authorized employee association, lifecycle status, timeline, milestones, progress, budget representation, files, and activity history where those attributes have approved sources and rules.
2. Project creation, editing, archival, restoration, assignment, milestone change, and client association SHALL use specific validation and lifecycle rules; each action SHALL identify required fields, permitted transitions, affected records, audit event, and failure behavior.
3. A project may be associated only with an in-scope client and authorized in-scope employees. Supplied identifiers SHALL be verified by combined-scope predicates before association or removal.
4. Progress, timeline, and budget displays SHALL show their calculation/authority and last-updated time. The workspace SHALL distinguish an unavailable value from zero and a manually supplied plan from an authoritative completed-work signal.
5. Project files and document links SHALL use the Document Management boundary in Section 13; the project view SHALL not expose direct object-store enumeration or public storage paths.

## 12. Task Management
**User Story:** As an Owner, I want to oversee and safely direct in-scope work, so priorities, deadlines, dependencies, and delivery blockers are visible.

### Acceptance Criteria
1. The capability SHALL provide in-scope task list and detail views with project association, assignment, status, priority, deadline, dependency, timeline, and activity information only where the applicable source supports it.
2. Task creation, edit, assignment, priority change, dependency change, completion/reopening, archival, and bulk actions SHALL be individually authorized, validated, audited, and protected against cross-project or cross-scope association.
3. Kanban, calendar, and timeline views SHALL be alternative presentations of the same authorized task state; they SHALL not create divergent status, ordering, or permission semantics.
4. Dependencies SHALL reject self-dependency, missing/out-of-scope predecessor records, and any dependency that violates the approved project/task lifecycle rule. A blocked state SHALL explain the safe in-scope cause without revealing restricted records.
5. Bulk actions SHALL require an explicit bounded selection, server-side per-record scope/eligibility validation, clear partial-success reporting, and one auditable outcome per affected record or a documented batch correlation identifier.
6. An Owner Workspace task action SHALL not bypass existing Employee Portal justified-completion/reopening requirements. Any cross-portal status rule difference requires separate approval.

## 13. Document Management
**User Story:** As an Owner, I want to manage approved company documents and their client visibility safely, so files are organized without exposing storage internals.

### Acceptance Criteria
1. Document discovery SHALL be owner-scoped and limited to approved metadata fields, client/project association, version relationship, classification, approval state, publication state, and audit history.
2. Upload, replacement, version creation, approval, publication, revocation, retention, and deletion SHALL each have a separately defined authorization, validation, malware/content-safety decision, immutable audit outcome, and failure/recovery state before implementation.
3. Document publication to a client SHALL reuse and preserve Phase 7 private Storage, metadata-to-client scope validation, client-visible classification, short-lived authorized download URL, revocation, and download-audit requirements.
4. The browser SHALL never receive service-role credentials, unrestricted storage listings, private bucket policy controls, raw object paths as authority, signed URL persistence, or a means to bypass server authorization.
5. Version history SHALL identify the safe version metadata, actor, timestamp, approval/publication status, and supersession relationship without exposing content to an unauthorized viewer. A revoked document SHALL not be newly accessible after revocation.
6. Download audit shall record actor, authorized scope, document identifier, version if applicable, outcome, and timestamp without recording document content, signed URLs, tokens, or sensitive file metadata beyond the approved audit need.

## 14. Communication, Automation, AI, Finance, Analytics, and Settings Reservations
**User Story:** As an Owner, I want the workspace to show the status and entry points for company functions, so the future operating model is coherent without prematurely implementing its later phases.

### Acceptance Criteria
1. Email history, invitation history, notification history, announcements, shared messaging, and communication preferences SHALL remain limited to currently approved, safe sources. Phase 10 is required before Communication Hub workflow creation or management is added.
2. Automation job status, execution history, retries, failure queues, schedules, logs, and manual runs SHALL be read-only and source-limited until Phase 11 separately approves automation control, retry, schedule, and failure-management behavior.
3. AI agent inventory, usage, health, task status, prompt management, token usage, and model configuration SHALL be read-only, redacted, and source-limited until the applicable Phase 14–16 specifications approve their data models and management actions.
4. Financial dashboard values, invoices, subscriptions, revenue, payments, and outstanding balances SHALL remain unavailable or clearly read-only when no Phase 9-approved authoritative source exists. No financial workflow, reconciliation, collection, tax behavior, pricing change, or payment action is included in Phase 8.
5. Sales, revenue, employee, client, project, automation, AI, and growth analytics SHALL disclose source, time range, freshness, definition, and caveats. Phase 12 is required before new analytic computation, reporting model, scheduled report, export, or KPI-governance workflow is added.
6. Company profile, branding, domains, roles, permissions, API keys, integrations, environment status, and security configuration SHALL remain read-only status/inventory information unless and until the applicable production/security requirements explicitly authorize management. The workspace SHALL never expose secret values, service credentials, or direct environment mutation.

## 15. Audit and Event History
**User Story:** As an Owner, I want to review accountable security and operational history, so I can investigate safe business events without raw logs or hidden data access.

### Acceptance Criteria
1. The audit view SHALL support bounded, scoped review of existing security events, login history, employee activity, client activity, owner actions, automation actions, and document/client-portal lifecycle events where those records are authorized and available.
2. Every new Owner Workspace mutation approved for implementation SHALL create an audit event containing actor, action, safe target type/identifier, Workspace Scope, timestamp, outcome, and a correlation identifier where available.
3. Audit search/filtering SHALL be scope constrained, paginated, time-bounded, and non-disclosing. Missing and inaccessible events SHALL not reveal their existence.
4. Audit views SHALL redact passwords, password reset material, invitation values, JWTs, refresh tokens, session identifiers, API keys, signed URLs, request/response bodies, document content, and secrets.
5. Audit records are evidence, not a general purpose communication channel or mutable business-data store. Retention, export, legal-hold, correction, and deletion policy require an approved data-governance decision before implementation.

## 16. Global Search
**User Story:** As an Owner, I want fast, scoped global search across company records, so I can locate authorized work without navigating every module.

### Acceptance Criteria
1. Global search SHALL support approved in-scope companies, clients, employees, projects, tasks, documents, and invoices only when each record type has an approved searchable source and permission predicate.
2. Search SHALL apply Workspace Scope and record-level authorization before matching, ranking, counting, highlighting, or returning a result. A client, employee, project, or document identifier supplied by the browser SHALL not expand the result set.
3. Results SHALL be bounded, paginated or progressively disclosed, rate limited where necessary, and return safe display projections only. Empty results, unavailable sources, and denied resources SHALL be non-disclosing.
4. Search terms and result telemetry SHALL avoid recording secrets and sensitive record content. Any retention or analytics of query data shall follow an approved privacy and retention policy.
5. Full-text indexing, cross-module ranking, synonym behavior, export, and search-result retention are design decisions; no generic search index or cross-scope discovery mechanism is authorized by this document.

## 17. Quick Actions and Notification Center
**User Story:** As an Owner, I want clear, safe shortcuts and notifications, so I can act on authorized work promptly without losing control of scope or auditability.

### Acceptance Criteria
1. The workspace SHALL reserve quick actions for Create Project, Create Task, Invite Client, Create Employee, Upload Document, and Run Automation, but each action SHALL remain disabled, hidden, or marked unavailable until its specific lifecycle, authorization, validation, audit, and dependency gate is approved.
2. Quick actions SHALL use the same server-side scope, business validation, idempotency, concurrency, and audit rules as the corresponding full workflow. A shortcut SHALL never become a privileged bypass.
3. The notification center SHALL present only owner-authorized, source-backed notifications with unread count, category, priority, timestamp, actionable destination, dismissal state, and accessible state announcements.
4. Dismissal, read/unread, retention, real-time delivery, retries, and notification preference behavior SHALL be defined per source before implementation. A notification action shall re-authorize access when opened or executed.
5. “Real-time” notification delivery is not assumed by these requirements. Any push, stream, polling, webhook, or background transport requires later design approval covering authentication, authorization, reconnection, ordering, duplicate handling, observability, cost, and privacy.

## 18. Accessibility, Responsive Design, and Interaction Quality
**User Story:** As an Owner, I want the workspace to be usable by keyboard, assistive technology, and current supported devices, so operational work is not blocked by the interface.

### Acceptance Criteria
1. All navigation, commands, filters, dialogs, tables, dashboards, forms, search, timelines, and notifications SHALL be keyboard-operable, have accessible names and instructions, preserve visible focus, and avoid keyboard traps.
2. Dynamic loading, successful changes, validation failures, attention changes, empty states, errors, and notification updates SHALL be announced appropriately to assistive technology without excessive interruption.
3. The workspace SHALL support current desktop, tablet, and mobile browser viewports with responsive layouts and no loss of authorization, core information, or safe recovery capability due solely to viewport size.
4. Every capability SHALL provide intentional loading skeletons or progress states, empty states, permission-aware unavailable states, validation states, recoverable error states, and retry guidance that does not expose operational secrets.
5. Color SHALL not be the only indicator of severity, completion, warning, blocked state, selection, or focus. The interface SHALL support high-contrast use and respect applicable reduced-motion preferences.

## 19. Reliability, Performance, and Observability
**User Story:** As an Owner, I want trustworthy and responsive operations, so I can tell whether a delay, error, or metric is actionable.

### Acceptance Criteria
1. Read views SHALL use bounded server-side queries, explicit pagination/limits, stable ordering, and incremental loading rather than unbounded record retrieval or browser-side aggregation of an entire workspace.
2. Each dashboard summary and operational view SHALL show data freshness or last successful update when meaningful. Stale, partial, failed, or unavailable source data SHALL not be represented as complete.
3. The design SHALL establish measurable page-load, interaction, mutation, search, and refresh service-level targets before implementation, including an explicit baseline for supported networks and realistic record volumes.
4. Protected requests, failed actions, source failures, slow operations, and client-side recoverable errors SHALL produce redacted, structured observability with correlation identifiers where available. User-visible messages shall be actionable but non-sensitive.
5. Retries for approved mutations SHALL be safe, bounded, and idempotent where the business operation permits. The UI SHALL prevent accidental duplicate submission and explain ambiguous completion states.

## 20. Security, Privacy, and Data Governance
**User Story:** As an Owner, I want the control plane to protect company and customer data, so broader operational access does not become broader data disclosure.

### Acceptance Criteria
1. Owner Workspace APIs SHALL enforce authentication, server-derived Workspace Scope, record-level authorization, input validation, rate limits where appropriate, safe error handling, and auditability for every protected operation.
2. The browser SHALL never receive database connection strings, service-role keys, API secrets, automation secrets, provider credentials, JWT signing secrets, raw session values, private object-store authority, or unrestricted audit/log data.
3. Sensitive fields SHALL use explicit allowlist projections per screen and operation. New views SHALL not expose a database row, event payload, log line, or third-party response by default.
4. Export, bulk download, printing, clipboard treatment, PII handling, retention, deletion, archival, legal hold, data correction, and data-subject workflows require separate approved data-governance requirements before implementation.
5. No browser-side authorization, hidden UI control, client route, query parameter, or cached response may be relied upon as a security boundary. Server-side authorization is mandatory for every read, mutation, download, action, and drill-down.

## 21. Incremental Delivery Boundaries and Dependencies
Phase 8 SHALL be implemented, if approved, as small independently reviewable increments. No increment may claim a capability is complete until its acceptance criteria and applicable existing regression suite pass.

1. **Increment A — Workspace foundation:** `/dashboard` authorization reuse, navigation shell, accessible loading/error/empty states, scoped dashboard framework, and source/freshness/unavailable conventions. No new business mutation is included.
2. **Increment B — Core operations:** Scoped CRM, client, project, and task read/detail workflows, followed only by individually approved owner mutations that preserve existing repository/service/route logic.
3. **Increment C — Client delivery administration:** Existing Client Portal invitation/membership and document publication/revocation lifecycle integration, with no relaxation of client scope, private Storage, or audit guarantees.
4. **Increment D — Document and owner audit workflows:** Only after document lifecycle, classification, storage, auditing, and retention requirements are technically designed and approved.
5. **Increment E — Employee oversight:** Read-only existing-data visibility only. Employee account lifecycle, passwords, role changes, or data-model changes require a separate explicitly approved feature before any implementation.
6. **Later-phase integrations:** Finance, communication, automation control, analytics, AI management, production configuration, and security management remain dependency-gated by Phases 9–17. Phase 8 may provide labelled status placeholders only, never a surrogate implementation.
7. Every increment SHALL document the source of truth, allowed actions, excluded actions, authorization rule, error behavior, audit events, dependency owner, migration/API impact, and rollback/compatibility consideration before design begins.

## 22. Validation Requirements
**User Story:** As a maintainer, I want objective evidence that the Owner Workspace adds value without weakening existing portals or company boundaries.

### Acceptance Criteria
1. The subsequent implementation plan SHALL include focused authorization tests for unauthenticated, client, employee, unauthorized internal, disabled, expired-session, out-of-scope, guessed-identifier, filter tampering, search tampering, and concurrent-update cases for every protected capability.
2. It SHALL include regression coverage demonstrating that existing authentication, JWT, refresh-cookie, session, login, refresh, logout, CRM, Employee Portal, and Client Portal behavior remains unchanged unless an additive approved integration explicitly requires otherwise.
3. It SHALL include accessibility validation for keyboard navigation, focus management, accessible names, announcements, responsive layouts, high-contrast indicators, loading, empty, unavailable, error, and recovery states.
4. It SHALL include performance/load validation for bounded list queries, dashboard refresh, search, and approved bulk actions at defined representative record volumes, without using production data for test fixtures.
5. It SHALL include observability and audit validation showing that safe actor/action/outcome context is recorded while secrets, tokens, credentials, document contents, and other prohibited sensitive values remain absent from logs and audit views.
6. It SHALL include migration, API, security, privacy, and dependency review only for increments that propose an additive change. No migration, endpoint, auth change, test, CI change, deployment change, commit, tag, or push is authorized by this requirements document itself.

## 23. Assumptions and Decision Gates
1. `/dashboard` is the single Owner Workspace route inside the existing Next.js application and inherits the existing application shell and deployment boundary.
2. The current server-side dashboard/ownership authorization policy remains authoritative. Its precise role and scope derivation shall be verified in the technical design before implementation; no new Owner role or role remapping is implied.
3. Existing CRM, Employee Portal, and Client Portal records and services are reused only where their present authorization and lifecycle rules safely satisfy a requirement. Absence of an existing capability is a dependency gate, not permission to bypass the architecture.
4. Dashboard availability, status labels, and navigation do not establish that a future-phase system, metric, integration, or write operation exists.
5. No unresolved decision in this document authorizes implementation. The next approved step, if requested, is a technical design that maps each approved increment to exact existing and additive boundaries.

## 24. Approval Boundary
This requirements document is complete for Phase 8 planning. It authorizes neither a design nor implementation. Phase 8 technical design, tasks, code, database/schema work, API changes, authentication changes, test/CI changes, deployment work, commits, tags, and pushes require explicit subsequent approval.

## Approved Direct Client Creation Addendum — July 30, 2026

This approved additive enhancement permits an authenticated Owner to create an in-scope `crm_clients` record directly from the Owner Workspace Clients page. The direct request requires client name, email, phone, and company, with optional notes; the server derives owner scope exclusively from `req.user.sub`. A server-generated display Client ID is returned, and no browser may supply the ID, status, or owner scope. The existing Website Lead → CRM Lead → Client conversion workflow, its API contract, its ownership checks, and its atomic contact/lead linkage remain unchanged. This addendum authorizes only the minimum additive client schema, owner-facade request branch, validation, client-list UI, and verification required for direct creation; it does not authorize profile, Client Portal, project, task, document, invoice, activity, authentication, authorization, or other workflow changes.