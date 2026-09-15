# JARVIS PRIME — Phase-Wise Delivery Roadmap

> **Purpose:** An ordered implementation checklist for taking JARVIS PRIME from its current monorepo foundation to a reliable production service.
>
> **Rule:** Do not start a later phase until that phase's **exit criteria** are met. Items marked **Verified complete** are based on the current workspace manifests and Turbo configuration; they still need command-level validation before release.

## Current verified foundation

| Area | Status | Verified state | Follow-up required |
|---|---|---|---|
| npm workspace layout | Complete | Root workspaces use `apps/*` and `packages/*`. | Confirm one root lockfile is used after a clean install. |
| Web application | Complete foundation | `apps/web` is a Next.js application with dev, build, lint, type-check, and test scripts. | Run and fix those commands in a clean environment. |
| API application | Complete foundation | `apps/api` is an ESM Node/Express API with server, doctor, and Node test commands. | Verify `doctor`, tests, and server health endpoint. |
| ICP scorer | Partially complete | `apps/icp-scorer` is a TypeScript buildable library with tests. | Decide whether it stays a library or becomes a separate service/CLI. |
| Build orchestration | Complete foundation | Turbo config defines build, lint, test, dev, and type-check tasks. | Add missing scripts in all participating packages. |
| Shared packages | Partially complete | Shared package directories exist. | Implement exports and consistent build/type-check/test contracts. |
| Production readiness | Not complete | No release gate is verified. | Complete Phases 1–8 before production launch. |

## Work sequence at a glance

| Phase | Objective | Status | Depends on | Primary output |
|---|---|---:|---|---|
| 0 | Lock the target architecture | In progress | — | Decisions log and ownership map |
| 1 | Make local development reproducible | To do | 0 | Green install, lint, type-check, test, build |
| 2 | Secure configuration and access | To do | 1 | Validated environment configuration and authentication baseline |
| 3 | Stabilize database and API contracts | To do | 2 | Migrations, repositories, documented and tested API |
| 4 | Deliver core product workflows | To do | 3 | Client, prospect, campaign, meeting, and task workflows |
| 5 | Build reliable automation and AI | To do | 3, 4 | Safe jobs, provider integrations, AI guardrails |
| 6 | Harden the frontend experience | To do | 3, 4 | Accessible, tested web portal and dashboard |
| 7 | Deploy with observability and recovery | To do | 1–6 | Staging, production, monitoring, backups, incident runbook |
| 8 | Establish release operations | To do | 7 | CI/CD release gates and operating cadence |

---

## Phase 0 — Architecture decisions and repository cleanup

**Goal:** Remove ambiguity about what each application, package, and root folder owns.

| Status | Task | Deliverable / completion check | Technology choice | Good alternatives |
|---|---|---|---|---|
| ☐ | Confirm application boundaries | `apps/web` owns browser UI; `apps/api` owns HTTP, jobs, integrations, and business rules. | Next.js + Node/Express (current) | Next.js Route Handlers for a smaller deployment; NestJS or Fastify for a more structured API. |
| ☐ | Decide ICP scorer role | Record whether `apps/icp-scorer` is a shared library, CLI, or independently deployed service. | TypeScript library (current) | CLI with `commander`; API module inside `apps/api`; separate Fastify service only if independent scaling is required. |
| ☐ | Define shared-package ownership | Give `types`, `validation`, `logger`, `config`, `database`, `auth`, `ai`, and `ui` a documented responsibility and public API. | npm workspaces + TypeScript | pnpm workspaces; Nx; a single application until reuse becomes real. |
| ☐ | Consolidate duplicate or legacy folders deliberately | Merge only reviewed content into `docs/`, `automation/`, and `infrastructure/`; delete duplicates only after confirming they are unused. | Git moves + decision records | Archive legacy content under `docs/archive/` first. |
| ☐ | Create an architecture decision log | Add short ADRs for database, auth, hosting, AI providers, and background-job execution. | Markdown ADRs in `docs/decisions/` | Log4brains; Notion/Linear linked from the repository. |

**Exit criteria**
- [ ] A new developer can identify the owner of every top-level directory.
- [ ] The ICP scorer deployment model is decided and documented.
- [ ] There is one canonical `docs/`, `automation/`, and `infrastructure/` location.

---

## Phase 1 — Reproducible developer workflow and quality gates

**Goal:** Every developer and CI runner can install, check, test, and build the workspace consistently.

| Status | Task | Deliverable / completion check | Technology choice | Good alternatives |
|---|---|---|---|---|
| ☐ | Pin the runtime and package manager | Commit `.nvmrc` or Volta config for Node 20+ and use the package manager declared in root `package.json`. | Node.js + npm workspaces (current) | pnpm for faster, stricter workspace installs; Yarn Berry. |
| ☐ | Run a clean dependency install | Delete only generated dependency directories locally, install from root, and commit the resulting root lockfile. | `npm ci` in CI | pnpm `--frozen-lockfile`; Yarn immutable install. |
| ☐ | Add a root type-check command | `npm run type-check` calls Turbo and succeeds for every TypeScript workspace. | TypeScript + Turbo | `tsc --build` project references; Nx affected checks. |
| ☐ | Standardize workspace scripts | Every app/package participating in Turbo has appropriate `build`, `lint`, `type-check`, and `test` scripts, or is explicitly excluded. | Turbo pipelines (current) | Nx targets; package-specific scripts without an orchestrator for a small repo. |
| ☐ | Add formatting and pre-commit checks | One formatter and lint policy run before commits and in CI. | ESLint + Prettier + Husky/lint-staged | Biome (lint + format); Lefthook. |
| ☐ | Verify local application startup | Web starts locally, API `doctor` succeeds, API server starts, and the health endpoint returns a documented success response. | Next.js dev server + Express (current) | Docker Compose dev environment; Dev Containers. |

**Exit criteria**
- [ ] `npm ci`, `npm run lint`, `npm run type-check`, `npm run test`, and `npm run build` pass from the repository root.
- [ ] `npm run dev:web` and `npm run dev:api` work with documented local environment values.
- [ ] CI runs the same commands without relying on developer-machine state.

---

## Phase 2 — Secrets, configuration, identity, and authorization

**Goal:** Prevent secret leakage and ensure every request is authenticated and authorized consistently.

| Status | Task | Deliverable / completion check | Technology choice | Good alternatives |
|---|---|---|---|---|
| ☐ | Create validated environment schemas | API and web applications fail fast with actionable errors for missing or malformed environment variables. | Zod + `@t3-oss/env-nextjs` / custom loader | envalid; convict; Joi. |
| ☐ | Maintain safe environment templates | Keep `.env.example` files current; never commit real API keys, tokens, passwords, or service-role keys. | `.env.example` + dotenv (current) | 1Password CLI; Doppler; Infisical. |
| ☐ | Choose and implement authentication | Login, session refresh, logout, password reset, and server-side session validation work end-to-end. | Supabase Auth | Auth.js; Clerk; Keycloak for self-hosted enterprise deployments. |
| ☐ | Implement role and tenant isolation | Enforce roles and client/agency boundaries in API middleware and database queries—not only in the UI. | Supabase RLS + API authorization middleware | PostgreSQL RLS with custom JWT; CASL for application authorization. |
| ☐ | Add security controls | Rate-limit sensitive endpoints, configure CORS precisely, secure cookies, validate inputs, and add audit logging. | Express middleware + Zod validation | Helmet; Arcjet; Cloudflare WAF/rate limiting. |

**Exit criteria**
- [ ] No secret appears in Git history, browser bundles, logs, or example files.
- [ ] Protected API routes reject unauthenticated requests and enforce tenant/role checks.
- [ ] Configuration checks run in local, staging, and production deployments.

---

## Phase 3 — Database, API contracts, and integration reliability

**Goal:** Make data ownership, database changes, and external integration behavior safe and testable.

| Status | Task | Deliverable / completion check | Technology choice | Good alternatives |
|---|---|---|---|---|
| ☐ | Establish migration workflow | Schema, migrations, seed data, and rollback/repair instructions are tracked in source control. | Supabase CLI + PostgreSQL (current) | Prisma Migrate; Drizzle Kit; Flyway. |
| ☐ | Implement repository layer | Client, prospect, campaign, meeting, project, and user repositories have typed interfaces and tests. | Supabase JS client + TypeScript | Drizzle ORM; Prisma; Kysely. |
| ☐ | Define API contracts | Routes have schemas, response conventions, error codes, and versioning policy. | OpenAPI + Zod | tRPC for internal type-safe APIs; GraphQL when clients need flexible queries. |
| ☐ | Add integration boundaries | Email, enrichment, calendar, payments, and webhooks have adapters, retry behavior, and normalized error handling. | Adapter pattern + fetch/SDK clients | Temporal activities; BullMQ worker integrations. |
| ☐ | Test database and API behavior | Critical paths run against an isolated test database, never production data. | Node test runner + Supabase local stack | Vitest; Testcontainers; Playwright API tests. |

**Exit criteria**
- [ ] A fresh environment can apply migrations and seed safe test data.
- [ ] API contracts are documented and validated at runtime.
- [ ] Integration failures produce actionable errors and do not create duplicate records or sends.

---

## Phase 4 — Core product workflows

**Goal:** Deliver a thin but complete client-to-outcome workflow before expanding features.

| Status | Task | Deliverable / completion check | Technology choice | Good alternatives |
|---|---|---|---|---|
| ☐ | Client and user management | Authorized users can create, view, update, deactivate, and scope client accounts. | Next.js forms + API modules | React Hook Form + TanStack Query; server actions where appropriate. |
| ☐ | Prospect pipeline | Users can import/source prospects, validate them, enrich them, score ICP fit, and review outcomes. | API prospects module + ICP scorer | CSV import with Papa Parse; queue-based bulk processor. |
| ☐ | Campaign management | Users define campaigns, audiences, sequence steps, schedules, and safe send limits. | API campaigns module | Customer.io/HubSpot integration for managed campaigns. |
| ☐ | Meetings and projects | Booking, reminders, project status, and activity history work for a tenant. | Calendar integration + database modules | Cal.com; Google/Microsoft calendar SDKs; Linear/Jira integration. |
| ☐ | Task and dashboard visibility | Dashboard shows accurate status, errors, activity, and next actions. | Next.js dashboard + API stats routes | Metabase embedded analytics; Retool for internal-first operations. |

**Exit criteria**
- [ ] A real authorized user can move one test client from prospect intake through outreach, meeting, and project tracking.
- [ ] All writes are tenant-scoped and auditable.
- [ ] Errors are visible to an operator and recoverable without database edits.

---

## Phase 5 — Automation and AI safety

**Goal:** Automate repeatable operations without sending unsafe, duplicate, or unapproved actions.

| Status | Task | Deliverable / completion check | Technology choice | Good alternatives |
|---|---|---|---|---|
| ☐ | Add durable job execution | Scheduled work has idempotency keys, retries, backoff, dead-letter handling, and job visibility. | BullMQ + Redis | Trigger.dev; Inngest; Temporal for long-running workflows. |
| ☐ | Build provider abstraction | AI, email, enrichment, and source providers implement a common interface with per-provider configuration. | Adapter interfaces in `apps/api/src/ai` | LangChain/LangGraph for multi-step AI workflows; direct SDKs for simplicity. |
| ☐ | Add AI output validation | Every model output is structured, schema-validated, logged safely, and rejected on low confidence or invalid data. | Zod structured outputs | Pydantic AI if moving workflows to Python; Guardrails AI. |
| ☐ | Add human approval points | Require review before high-impact actions such as first sends, high-volume sends, account changes, or spend increases. | Internal approval queue in dashboard | Slack/Teams approval workflow; n8n approval step. |
| ☐ | Enforce messaging compliance | Implement unsubscribe, suppression, consent/source tracking, sending caps, and audit trails. | Database suppression tables + email provider webhooks | Customer.io/SendGrid compliance controls; dedicated consent platform. |

**Exit criteria**
- [ ] Re-running a job cannot send duplicate messages or create duplicate records.
- [ ] All outbound communications are traceable to a client, campaign, template, approval, and provider response.
- [ ] AI cannot bypass input validation, tenant boundaries, send limits, or human approval controls.

---

## Phase 6 — Web quality, usability, and accessibility

**Goal:** Make the web application reliable and understandable for daily user operations.

| Status | Task | Deliverable / completion check | Technology choice | Good alternatives |
|---|---|---|---|---|
| ☐ | Establish a shared design system | Reusable components, tokens, loading states, empty states, and error states are consistent. | Tailwind CSS + shared `packages/ui` | shadcn/ui; Radix UI; Material UI. |
| ☐ | Implement data fetching conventions | Authenticated queries, mutations, cache invalidation, and API error handling behave consistently. | TanStack Query | SWR; Next.js Server Components/Actions for suitable flows. |
| ☐ | Add form validation and feedback | Forms validate before submission and display accessible field and server errors. | React Hook Form + Zod | Formik; Conform. |
| ☐ | Test critical user journeys | Login, onboarding, prospect review, campaign approval, and meeting booking have end-to-end coverage. | Playwright | Cypress; WebdriverIO. |
| ☐ | Meet accessibility and performance baseline | Keyboard operation, labels, contrast, mobile layout, Core Web Vitals, and error boundaries are checked. | Lighthouse + axe-core | Pa11y; Storybook accessibility addon. |

**Exit criteria**
- [ ] Critical workflows pass end-to-end tests in staging.
- [ ] The application has no known critical accessibility failures.
- [ ] Users receive useful feedback for loading, empty, unauthorized, and failed states.

---

## Phase 7 — Staging, production deployment, and observability

**Goal:** Release safely, detect failures quickly, and recover without data loss.

| Status | Task | Deliverable / completion check | Technology choice | Good alternatives |
|---|---|---|---|---|
| ☐ | Create isolated environments | Local, preview/staging, and production use different credentials, databases, domains, and service keys. | Vercel for web + managed Node host/API container | Netlify + Render; Cloudflare Pages/Workers; AWS ECS/Fargate. |
| ☐ | Containerize the API where needed | API Dockerfile is reproducible, non-root, small, and configured entirely through environment variables. | Docker + managed container host | Railway; Render; Fly.io; serverless functions for low volume. |
| ☐ | Configure observability | Centralized error tracking, structured logs, metrics, health checks, uptime probes, and alerts are active. | Sentry + structured JSON logs + Better Stack | Datadog; Grafana/Prometheus/Loki; OpenTelemetry collector. |
| ☐ | Plan backups and recovery | Database backup retention, restore drill, migration rollback plan, and recovery ownership are documented. | Supabase backups + restore drill | Managed PostgreSQL provider backups; WAL-G. |
| ☐ | Secure domains and delivery | HTTPS, security headers, domain ownership, redirects, robots policy, and CSP are configured. | Hosting platform TLS + headers | Cloudflare CDN/WAF; AWS CloudFront. |

**Exit criteria**
- [ ] Staging is deployed from the main integration branch and production uses an approved release process.
- [ ] Alerts notify the responsible team of API failures, job failures, and abnormal outbound activity.
- [ ] A database restore drill has succeeded using non-production data.

---

## Phase 8 — Release operations and continuous improvement

**Goal:** Turn the system into a maintainable product, not a one-time deployment.

| Status | Task | Deliverable / completion check | Technology choice | Good alternatives |
|---|---|---|---|---|
| ☐ | Enforce CI release gates | Pull requests run install, lint, type-check, tests, build, and security scanning before merge. | GitHub Actions | GitLab CI; CircleCI; Buildkite. |
| ☐ | Add deployment promotion rules | Preview → staging → production releases are traceable and reversible. | GitHub environments + deployment approvals | Changesets; semantic-release; LaunchDarkly for feature flags. |
| ☐ | Track product and operational metrics | Measure funnel conversion, campaign performance, send/delivery/reply rates, failure rates, and cost. | PostHog + Sentry + database reporting | Amplitude; Mixpanel; Metabase. |
| ☐ | Establish incident and support process | On-call ownership, severity levels, incident template, support triage, and postmortems are documented. | Markdown runbooks + issue templates | PagerDuty; Opsgenie; Linear/Jira service management. |
| ☐ | Maintain a security update cadence | Dependency review, secret scanning, access review, and periodic backup restore tests are scheduled. | Dependabot + GitHub secret scanning | Snyk; Renovate; GitGuardian. |

**Exit criteria**
- [ ] Every production deployment is linked to a tested revision and has a rollback path.
- [ ] Security, availability, product, and automation metrics are reviewed on a defined cadence.
- [ ] The team can diagnose and respond to a production incident from documented runbooks.

---

## Recommended minimum technology stack

This is the lowest-complexity stack that fits the current repository and avoids premature microservices.

| Concern | Recommended starting choice | Use an alternative when… |
|---|---|---|
| Monorepo | npm workspaces + Turbo | Use pnpm if install speed/disk efficiency becomes a problem; use Nx for affected-graph tooling and generators. |
| Frontend | Next.js + TypeScript + Tailwind CSS | Use Remix for web-standard server patterns; use Vite React for a separate SPA. |
| API | Express + TypeScript modules | Use Fastify for better performance/schema integration; NestJS for larger teams requiring DI/conventions. |
| Database | Supabase PostgreSQL + RLS | Use Neon/Postgres + Drizzle/Prisma if Supabase services are not required. |
| Validation | Zod shared between web/API | Use Valibot for smaller bundle size; use JSON Schema where non-TypeScript consumers dominate. |
| Authentication | Supabase Auth | Use Auth.js for app-managed auth; Clerk for faster managed B2B features. |
| Background jobs | BullMQ + Redis | Use Inngest/Trigger.dev for managed event jobs; Temporal for durable multi-day workflows. |
| AI integration | Direct provider SDKs behind adapters | Use LangGraph for agent state/graphs; use Vercel AI SDK for streaming UI-heavy experiences. |
| Testing | Node test runner + Vitest + Playwright | Use Jest if required by existing tooling; Cypress for teams already trained on it. |
| Monitoring | Sentry + structured logs + uptime checks | Use Datadog for a managed enterprise suite; OpenTelemetry + Grafana for open tooling. |
| Hosting | Vercel (web) + Render/Railway/Fly.io (API) + Supabase (data) | Use AWS/GCP/Azure when compliance, network control, or scale requires it. |

## Immediate next five tasks

Execute these in order; they unblock all feature work.

1. [ ] **Decide the ICP scorer role** and document the result in `docs/decisions/`.
2. [ ] **Run a clean root install** and fix workspace dependency or lockfile issues.
3. [ ] **Add and run a root `type-check` script**, then ensure every relevant workspace has a matching task.
4. [ ] **Run the release gate locally:** lint, type-check, test, build, web startup, API `doctor`, and API health check.
5. [ ] **Implement environment validation and authentication/tenant authorization** before adding further product features or enabling automation.
