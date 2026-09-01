# How JARVIS PRIME Should Work

## Purpose

This is the canonical working guide for JARVIS PRIME. It explains what is
complete, what should be built next, and the engineering rules that apply to
every change.

Read this file before starting product work. It intentionally uses short
sections and checklists rather than wide tables, so it remains readable in
source control and narrow editor panes.

## Roadmap authority

Use the following documents in this order when they differ:

1. `documentation/roadmap/MASTER_ROADMAP.md` is the authoritative record of
   product-phase status and released scope.
2. This file defines the implementation order and mandatory working rules.
3. `docs/PROJECT_DELIVERY_ROADMAP.md` is the engineering-quality reference.
   Its checklists apply to all future work, but its generic phase numbers do
   not override the master roadmap's completion status.

Do not mark a feature complete because code exists. A feature is complete
only after its acceptance criteria, tests, security review, and relevant
release checks pass.

## Current project status

The master roadmap records the following phases as complete:

- Phase 0: Repository Cleanup
- Phase 0.5: Database Audit
- Phase 0.6: Runtime Stabilization
- Phase 1: Core User Platform
- Phase 2: CRM Foundation
- Phase 3: Client Management
- Phase 4: Project Management
- Phase 5: Task Management
- Phase 6: Employee Portal
- Phase 7: Client Portal
- Phase 8: Owner Workspace
- Phase 9: Finance & Billing foundation

The current product sequence begins with **Phase 10: Communication Hub**.
The finished phases are not open for feature expansion unless a roadmap
addendum explicitly approves it. Bug fixes, security fixes, and regressions
may be addressed when they are properly scoped and tested.

## System boundaries

Keep code in the location that owns its responsibility.

### Web application: `apps/web`

The web application owns browser-facing user interfaces:

- Public website and marketing pages
- Owner, employee, and client portal screens
- Forms, accessible UI states, and browser-side API calls
- Route-level UI tests and end-to-end workflows

Do not place service-role keys, private provider credentials, database admin
operations, or authorization decisions in browser code.

### API application: `apps/api`

The API owns trusted server-side behavior:

- HTTP endpoints and webhook handlers
- Authentication, authorization, and tenant/client scope checks
- Business rules, database writes, and audit events
- Third-party integrations, scheduled jobs, and background work
- AI provider calls, prompts, tools, and server-side safety controls

A browser-provided identifier is a locator, never proof of authorization.
Every protected request must derive its user and permitted scope on the
server.

### Shared packages: `packages/*`

Shared packages contain reusable, application-independent code. Examples:

- `types`: shared TypeScript models
- `validation`: reusable input and response schemas
- `logger`: structured logging helpers
- `config`: environment parsing and configuration helpers
- `database`: shared database utilities that do not bypass application rules
- `auth`: common session, permission, and guard helpers
- `ai`: provider-neutral shared AI abstractions
- `ui`: reusable presentation components only

Do not move feature-specific business logic into a shared package merely to
make the folder structure look symmetrical.

### Data, automation, and operations

- `database/` contains database schema, migrations, seeds, and local tooling.
- `automation/` contains reviewed workflow definitions, webhooks, and cron
  configuration.
- `infrastructure/` contains deploy, container, networking, and monitoring
  configuration.
- `docs/` contains current technical documentation and decisions.
- `documentation/roadmap/` contains the product roadmap history and master
  roadmap.

## Engineering baseline

Use the existing stack unless a phase has an approved reason to change it:

- **Monorepo:** npm workspaces with Turbo
- **Web:** Next.js, React, TypeScript, and Tailwind CSS
- **API:** Node.js, Express, and ESM modules
- **Data and auth:** Supabase PostgreSQL, Row Level Security, and Supabase Auth
- **Validation:** TypeScript schemas at API boundaries
- **Testing:** Node test runner, Vitest, and browser tests where user journeys
  require them

Preferred additions should be small and purposeful:

- Use Zod for shared runtime validation.
- Use a structured logger and redact credentials, tokens, signed URLs, and
  sensitive personal information.
- Use a durable job system with retries and idempotency before enabling
  automated sends or long-running workflows.
- Use Sentry or equivalent error monitoring before production automation.

Alternatives require a documented decision. For example, Fastify or NestJS
may replace Express for a justified API redesign; BullMQ, Inngest, or
Trigger.dev may run jobs; and Drizzle or Prisma may be adopted only with a
migration plan that preserves database security and tests.

## Mandatory rules for every change

1. **Protect secrets.** Never commit real credentials. Keep example files
   safe, complete, and current.
2. **Validate all inputs.** Validate HTTP payloads, webhook payloads, file
   metadata, and AI outputs before they reach business logic.
3. **Authorize on the server.** Enforce identity, role, membership, and
   tenant/client scope before reading or writing protected data.
4. **Keep audit records safe.** Record important actions without storing raw
   passwords, invitation values, access tokens, signed URLs, or document
   contents.
5. **Make automation idempotent.** Retried jobs must not create duplicate
   records, invoices, emails, or notifications.
6. **Prefer additive database changes.** Use reviewed migrations and verify
   rollback or recovery behavior before releasing schema changes.
7. **Keep boundaries intact.** Route handlers call services; services apply
   business rules; repositories own persistence. Do not put database logic in
   UI components.
8. **Test the changed behavior.** Add or update the smallest useful test at
   the API, integration, UI, or end-to-end level.
9. **Do not claim unverified work.** Record deferred functionality as deferred
   until it is implemented and validated.

## Working sequence for all phases

Apply this sequence to every approved roadmap item:

1. **Confirm scope.** Link the task to its master-roadmap phase and define
   what is in scope, explicitly deferred, and forbidden.
2. **Design the boundary.** Identify the UI route, API route, service,
   repository, database changes, background jobs, and external providers
   involved.
3. **Define acceptance criteria.** Include authorized and unauthorized cases,
   empty/loading/error states, audit behavior, and failure recovery.
4. **Implement minimally.** Reuse existing module patterns and avoid unrelated
   refactors.
5. **Test at the correct level.** Add unit tests for rules, integration tests
   for data/security boundaries, and browser tests for critical user journeys.
6. **Run release checks.** Run linting, type checking, relevant tests, and a
   production build. Validate the feature in staging when it touches data,
   permissions, integrations, or deployment.
7. **Document the result.** Update the master roadmap only after all approved
   acceptance criteria are met. Clearly preserve deferred scope.

## Phase 10 — Communication Hub

**Goal:** Provide safe, traceable communication between authorized JARVIS
PRIME users and clients without leaking portal boundaries or sensitive data.

Build in this order:

- Define communication types, participants, permissions, retention, and audit
  requirements.
- Create server-side communication modules with strict owner, employee, and
  client visibility rules.
- Add notifications and unread-state handling that tolerate retries without
  duplicate alerts.
- Add portal UI with accessible composition, loading, error, empty, and
  permission-denied states.
- Add attachment support only after private storage authorization, malware
  scanning policy, and file metadata validation are defined.

Done when:

- [ ] Every message or notification is scoped and authorized on the server.
- [ ] Unauthorized portal identities cannot read or infer another scope's data.
- [ ] Notification delivery is observable and safely retryable.
- [ ] Critical communication journeys have API and browser coverage.

## Phase 11 — Automation Platform

**Goal:** Run approved business workflows reliably without unsafe side effects.

Build in this order:

- Define job contracts, ownership, scheduling rules, and idempotency keys.
- Introduce a durable queue or managed workflow runner.
- Add retries with bounded exponential backoff and a visible failed-job state.
- Record job input references, status transitions, provider results, and safe
  audit events.
- Add human approval for high-impact actions such as bulk sends, first-time
  client actions, and spending changes.

Done when:

- [ ] Re-running a job cannot create duplicate business effects.
- [ ] Operators can inspect, retry, and resolve failed jobs safely.
- [ ] Automated actions honour tenant scope, send limits, approvals, and
  suppression rules.
- [ ] Job failures produce actionable alerts and do not silently disappear.

## Phase 12 — Analytics and Reporting

**Goal:** Give each role trustworthy, privacy-aware visibility into outcomes.

Build in this order:

- Define the metrics, data owner, calculation, refresh rate, and authorized
  audience for every dashboard value.
- Build read models or bounded queries; do not expose raw internal data to
  client-facing views.
- Add report filters that enforce server-side role and client scope.
- Verify time-zone handling, empty datasets, late-arriving events, and totals.
- Export data only with explicit permissions, audit records, and a retention
  policy.

Done when:

- [ ] Metrics have written definitions and match their source data.
- [ ] Dashboard and export access are authorization-tested.
- [ ] Expensive reports are bounded, monitored, and do not degrade core flows.

## Phase 13 — Production and DevOps

**Goal:** Make releases safe, observable, recoverable, and repeatable.

Build in this order:

- Establish isolated local, staging, and production environments.
- Use CI to run install, lint, type-check, tests, and production builds.
- Deploy through a documented staging-to-production promotion process.
- Add structured logs, error tracking, health checks, uptime monitoring, and
  alerts for API, jobs, integrations, and abnormal outbound activity.
- Document backups, database restore exercises, rollback behavior, domain
  configuration, and incident ownership.

Done when:

- [ ] A release is traceable to a tested revision and has a rollback path.
- [ ] Production credentials and data are isolated from development and staging.
- [ ] A restore drill has been performed without using production data.
- [ ] Alerts reach an accountable owner with a documented response path.

## Phase 14 — AI Foundation

**Goal:** Provide a reusable, observable, and controlled AI layer.

Build in this order:

- Define provider interfaces and configuration for each approved AI provider.
- Store prompts as versioned server-side assets with clear input and output
  contracts.
- Require structured, schema-validated outputs for every AI operation.
- Add cost, latency, error, and safety telemetry without logging sensitive
  prompt data unnecessarily.
- Define fallback behavior for provider failure, rate limits, unsafe output,
  and low-confidence results.

Done when:

- [ ] AI outputs cannot bypass validation, authorization, or business rules.
- [ ] Provider failures degrade safely and are observable.
- [ ] Prompts, models, and evaluations are versioned and reviewable.

## Phase 15 — AI Sales Agents

**Goal:** Assist sales work while preserving human control, compliance, and
brand quality.

Build in this order:

- Implement prospect research, enrichment, ICP scoring, and drafting as
  separate, auditable capabilities.
- Use approved source data only and record provenance where practical.
- Add approval queues before any first outreach or high-volume send.
- Enforce unsubscribe, suppression, consent/source tracking, sending caps,
  and provider webhooks.
- Evaluate drafts against factuality, policy, personalization quality, and
  prohibited claims before release.

Done when:

- [ ] Every outbound item is traceable to a client, campaign, source, model,
  prompt version, approval decision, and provider result.
- [ ] Users can edit, approve, reject, or stop automated sales actions.
- [ ] The system prevents duplicate and non-compliant sends.

## Phase 16 — AI Operations

**Goal:** Apply AI to internal operational assistance without giving it
unbounded authority.

Build in this order:

- Start with read-only summarization, classification, and suggested tasks.
- Grant tools one action at a time, with tightly scoped permissions.
- Require confirmation for destructive, financial, customer-visible, or
  irreversible actions.
- Log proposed and executed tool calls with redacted inputs and outcomes.
- Maintain evaluations for accuracy, safety, latency, and operational value.

Done when:

- [ ] AI recommendations are distinguishable from system-of-record data.
- [ ] Tool permissions are least-privilege and independently authorized.
- [ ] Operators can review, explain, and reverse supported actions.

## Phase 17 — Enterprise Security

**Goal:** Complete the security controls needed for a mature production
service and larger customer requirements.

Build in this order:

- Perform threat modelling for authentication, portals, webhooks, file access,
  AI tools, background jobs, and administrative workflows.
- Add dependency updates, secret scanning, security headers, vulnerability
  management, and periodic access reviews.
- Review RLS policies, service-role boundaries, audit coverage, retention, and
  deletion workflows.
- Establish incident response, severity definitions, disclosure processes, and
  recurring restore and access-control drills.
- Gather evidence for relevant compliance requirements only after the target
  market and contractual needs are known.

Done when:

- [ ] High-risk threat-model findings have owners and remediation plans.
- [ ] Security controls are tested continuously, not only documented.
- [ ] Incident response and recovery are exercised and measurable.

## Version 1.0 release gate

Version 1.0 may be proposed only after all planned phases are accepted and the
following release gate is green:

- [ ] Root dependency installation is reproducible from the committed lockfile.
- [ ] Linting, type checking, tests, and production builds pass in CI.
- [ ] Critical owner, employee, client, finance, communication, and approved
  automation journeys pass in staging.
- [ ] Authentication, authorization, client isolation, RLS, and audit behavior
  have security-focused test coverage.
- [ ] Monitoring, alerting, backups, recovery steps, and rollback are verified.
- [ ] Deferred scope is explicitly listed; it is not silently implied to work.
- [ ] The release owner approves a documented go/no-go checklist.

## Development commands

Run commands from the repository root unless a phase document says otherwise:

```bash
npm install
npm run lint
npm run test
npm run build
npm run dev:web
npm run dev:api
```

Use the application-level commands for targeted investigation:

```bash
npm run doctor --workspace=apps/api
npm run test --workspace=apps/api
npm run type-check --workspace=apps/web
npm run test --workspace=apps/web
```

Do not run watch-mode commands in CI. Use single-run test commands for
verification, and use a local development server only when interactive
manual testing is required.
