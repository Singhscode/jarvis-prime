# Phase 13 Production Deployment Architecture

## Status and Scope
**Design review only.** This document turns the approved requirements into a production deployment design. It creates no infrastructure and does not change application code, authentication, API contracts, schema, migrations, CI workflows, DNS, Supabase, Docker, secrets, commits, tags, or releases.

## Overview
JARVIS PRIME is deployed as a managed SaaS: Vercel serves the existing Next.js application, Railway runs the existing long-lived Express process, and separate Supabase Cloud projects hold each environment's PostgreSQL and Storage. Owners use `https://jarvisprime.me/dashboard`; employees use `https://jarvisprime.me/employee`. No user operates local tooling to access these experiences.

### Recommended Startup Provider Baseline
| Responsibility | Recommended service | Why |
|---|---|---|
| Registrar | Namecheap | Keep current domain registration separate from hosting for portability. |
| DNS / optional edge protection | Cloudflare | Authoritative DNS, DDoS/WAF/rate-limit controls, DNS observability; proxy only after cookie/webhook validation. |
| Web frontend | Vercel | The repository is already Vercel-linked and the existing Next.js app maps directly to Vercel builds, CDN, previews, and immutable deployments. |
| Public API | Railway | Runs the unchanged stateful Node process with health checks, managed TLS, deployment logs, custom domains, and no user-operated Docker/VPS. |
| Scheduler runtime | Railway private service | Runs one isolated copy of the current server command, preventing public API scale-out from duplicating jobs. |
| PostgreSQL, auth-adjacent data, storage | Supabase Cloud | Matches the existing Supabase client, canonical migrations, service-role model, PostgreSQL, and Storage model. |
| Transactional email | Resend | Matches the current email provider configuration and supports domain-authenticated transactional/outbound delivery. |
| Error tracking | Sentry | Captures application exceptions and release context without replacing current logs. |
| Logs, uptime, alerting | Better Stack | Centralized searchable logs, synthetic checks, on-call alerts, and status visibility at startup cost. |
| Runtime secret stores | Vercel and Railway environment secret stores | Environment-scoped injection with no secret files or browser exposure. |

### Growth and Enterprise Equivalents
The API can move from Railway to Fly.io, AWS ECS/Fargate, or Kubernetes; logs/metrics can move to Grafana Cloud/Datadog; secrets can move to AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault, or 1Password Connect. Supabase remains the data plane until a deliberate managed-PostgreSQL migration. These changes preserve the current application boundaries and HTTP contracts.

## Architecture

### Deployment Topology
```text
Owner ── HTTPS ─┐
Employee ─ HTTPS┼── Cloudflare DNS / optional edge controls ── Vercel
Public visitor ─┘                                                │
                                                                  ├─ jarvisprime.me/dashboard
                                                                  └─ jarvisprime.me/employee
Browser ── HTTPS + credentials ── api.jarvisprime.me ── Railway public API service
                                                         │        (SCHEDULER_ENABLED=false)
                                                         ├── Supabase Production project
                                                         │   ├─ PostgreSQL + backups
                                                         │   └─ Storage
                                                         ├── Resend / approved providers
                                                         ├── Sentry
                                                         └── Better Stack

Railway private scheduler service (exactly one replica; SCHEDULER_ENABLED=true)
  └─ same approved API artifact; no public domain; same production Supabase project

GitHub Actions ── approved immutable artifact ── Vercel + Railway + controlled migration step
```

### Canonical Production Domains
| Purpose | URL / hostname | Routing rule |
|---|---|---|
| Marketing and owner web | `https://jarvisprime.me` | Vercel; redirect `www` to apex or the selected canonical host. |
| Owner dashboard | `https://jarvisprime.me/dashboard` | Existing protected web route. |
| Employee Workspace | `https://jarvisprime.me/employee` | Existing Employee Portal route. |
| API | `https://api.jarvisprime.me` | Railway public API service only. |
| Public webhooks | `https://api.jarvisprime.me/webhooks/*` | Railway public API service with provider signature verification. |
| Unsubscribe | `https://jarvisprime.me/unsubscribe` | Existing web/API routing as finalized before launch. |
| Staging | `https://staging.jarvisprime.me`, `https://api.staging.jarvisprime.me` | Separate Vercel/Railway/Supabase staging deployment. |

TLS terminates at the managed hosts. HTTP redirects to HTTPS. API cookies remain host-only for `api.jarvisprime.me`; no broad `Domain` attribute is needed.

## Components and Interfaces

### Service Responsibilities
| Service | Responsibilities | Explicit non-responsibilities |
|---|---|---|
| Vercel web | Build and serve the existing Next.js routes, CDN, preview deployment, browser configuration that is intentionally public. | Storing API secrets, running jobs, accessing service-role credentials. |
| Railway public API | Run `node src/runner.js --server`, serve existing API/auth/webhook routes, terminate gracefully, expose `/live` and `/ready`. | Executing scheduled jobs in production. |
| Railway scheduler | Run one private copy of the existing server command with scheduling enabled; report health and logs. | Serving public traffic or scaling beyond one replica. |
| Supabase Cloud | Isolated PostgreSQL, existing tables/RPC/RLS, Storage, provider-managed backups and recovery capabilities. | Browser authorization policy decisions or application session issuance. |
| Resend | Authenticated email transport and delivery events. | Storing application credentials or bypassing unsubscribe/compliance behavior. |
| Cloudflare | DNS, optional edge WAF/rate limiting, external availability controls. | Authentication or application authorization. |
| Sentry / Better Stack | Error events, redacted logs, metrics, synthetics, alert delivery, incident evidence. | Holding unredacted secrets, refresh tokens, or full sensitive payloads. |

## Data Models
The deployment introduces no tables, columns, RPCs, Storage schema, authentication claims, or API payloads. PostgreSQL data, existing Supabase Storage objects, user roles, owner scope, sessions, audit records, and the canonical SQL migrations remain unchanged. Provider configuration is environment-scoped operational metadata, not application data.

## Environment Topology
| Control | Development | Staging | Production |
|---|---|---|---|
| Web/API | Local developer processes | Separate Vercel and Railway staging services | Vercel production and Railway production services |
| Database/Storage | Preserved local Docker Supabase volumes | Dedicated Supabase staging project and buckets | Dedicated Supabase production project and buckets |
| Data | Synthetic/local test data only | Synthetic, anonymized, or purpose-built test data only | Real production data only |
| Secrets | Developer-local ignored files | Staging provider secret stores | Production provider secret stores with production-only access |
| Backups | Local operator backups | Staging backup policy and restore rehearsal | Production backup policy and disaster recovery controls |
| Deploy authority | Developer | CI service account | CI service account plus named production approver |

There is no shared database, Storage bucket, service-role key, backup, provider credential, or direct production-data copy between staging and production. Production restores never target staging; restore testing uses an isolated recovery target with strictly limited access.


## Correctness Properties
### Property 1: Environment Isolation
No staging credential, database, Storage bucket, backup, or deployment identity can read or modify production data.

**Validates: Requirements 4.1, 5.1**

### Property 2: Scheduler Singularity
Only the private scheduler service has scheduling enabled, and exactly one replica may run at a time.

**Validates: Requirements 2.2**

### Property 3: Browser Secret Boundary
Refresh tokens remain host-only HttpOnly cookies; service-role and other secrets never enter a browser bundle.

**Validates: Requirements 3.3, 4.3**

### Property 4: Release Integrity
Production deploys only an approved immutable Release_Candidate after an auditable backup/recovery-point check and required health verification.

**Validates: Requirements 5.2, 7.2**

## Error Handling
Managed-host failures are surfaced through `/live`, `/ready`, protected deep-health checks, Sentry, Better Stack, provider status pages, and the incident procedure in the disaster-recovery section. Deployment failures stop promotion, preserve the current release and retained data, and select either a traffic rollback, forward correction, or verified restore—never a destructive reset.

## Testing Strategy
Before implementation approval, validate the planned topology in staging: DNS/TLS and CORS/cookie behavior; API readiness; synthetic login/refresh/Employee Portal flows; scheduler singleton behavior; webhook signatures; backup restore evidence; alert delivery; migration compatibility; and rollback to a known-good artifact. Production verification uses non-destructive synthetic accounts and never copies customer data to staging.

## 5. Authentication and User Workflows

### Employee Authentication Flow
```text
Employee → jarvisprime.me/employee → existing sign-in form
  → HTTPS POST api.jarvisprime.me/api/auth/login
  → existing API validates credentials and issues access JWT in response
  → API writes existing host-only refreshToken cookie:
      HttpOnly; Secure in production; SameSite=Strict; Path=/api/auth
  → browser keeps access token in existing in-memory state
  → authorized Employee Portal requests include Bearer JWT and credentials
  → existing refresh endpoint rotates the HttpOnly cookie when necessary
  → existing logout revokes the server-side session-associated refresh token and clears the cookie
```

`jarvisprime.me` and `api.jarvisprime.me` are different origins but same-site HTTPS subdomains. The existing `SameSite=Strict` cookie therefore remains compatible with same-site fetches; the browser must continue sending `credentials: include` and the API must allow only the exact web origins with credentials. No cookie is exposed to JavaScript, sent to an unrelated domain, or given a parent-domain scope.

### Owner Workflow
1. A restricted production operator runs the reviewed `npm run owner:bootstrap` CLI from an approved checkout. The CLI accepts credentials only through hidden interactive prompts, validates the fixed production project, and atomically creates the first active, verified `client` plus a durable `owner.bootstrap_completed` audit marker. It permanently refuses execution after that successful marker exists, regardless of later Owner eligibility changes. A lost COMMIT acknowledgement is reconciled through a fresh connection; an unprovable outcome stops with `COMMIT_OUTCOME_UNKNOWN` and must not be retried. See `documentation/INITIAL_OWNER_BOOTSTRAP_RUNBOOK.md`.
2. The owner visits `https://www.jarvisprime.me/dashboard` and signs in through the existing `/api/auth/login` JWT/session flow.
3. The owner manages the currently exposed dashboard/CRM capabilities and assigns projects/tasks through existing approved routes only.
4. Employees use the supplied production `/employee` URL, authenticate with their assigned credentials, and see only database-derived, directly assigned work.

### Critical Current-System Boundary: Employee Creation
The frozen system has no owner-authorized employee-creation endpoint or dashboard flow. The existing `npm run employee:create` command is an internal, interactive provisioning tool—not a production-user capability—and its local database discovery is not a production workflow. Therefore, **the requirement that an owner create employees in the browser cannot be fulfilled by this deployment design without a separately approved product feature** (owner authorization, API, UI, tests, audit behavior, and production-safe provisioning). Until that feature is approved and built, a restricted operations process creates employees through a controlled bootstrap/provisioning path; no owner or employee runs CLI commands.

### Existing Dashboard Boundary
The current `/dashboard` and `/employee` experiences both authenticate through the existing Phase 6 JWT/session lifecycle. Owner Workspace adds its database-derived active-client/no-membership authorization predicate after JWT authentication; Employee Workspace retains direct-assignment scope. The Owner bootstrap CLI creates identity data only and does not issue JWTs, create sessions, or change either browser flow.

## 6. Security Architecture

### Transport, Browser, and API Controls
- Enforce HTTPS at Vercel and Railway, redirect HTTP, enable HSTS after validation, and keep TLS certificate management at the hosts.
- Set `TRUST_PROXY_HOPS` to the exact production proxy depth only after validating the deployed request path; do not trust arbitrary forwarded headers.
- Configure `CORS_ORIGINS` as an exact comma-separated allowlist of canonical production and staging web origins per environment. Never use `*` with credentialed requests.
- Preserve the existing `HttpOnly`, production-only `Secure`, `SameSite=Strict`, `/api/auth` refresh-cookie scope and in-memory access-token behavior.
- Keep the existing authorization model: API derives identity, role, owner scope, assignment, projects, and tasks server-side; clients never provide those identities as trusted input.
- Place edge rate limiting/WAF rules in front of public API/auth/webhook traffic as a supplementary, global control. The existing in-process limiter remains a second layer.

### Least Privilege and Service Access
- Each environment receives its own Supabase URL and service-role credential. The service-role key is injected only into the API and scheduler runtimes, never Vercel browser configuration, CI logs, or personal devices.
- Vercel can read only web build/runtime configuration; Railway can read only the secrets required by its environment; GitHub deployment identities can deploy only their target environment.
- Use named human accounts, MFA, least-privilege team roles, quarterly access reviews, and immediate removal on role change across GitHub, Vercel, Railway, Supabase, DNS, Resend, Sentry, and Better Stack.
- Database network access uses Supabase managed access controls; direct SQL/admin access is break-glass only, time-bound, audited, and never used by everyday users.
- Storage uses separate staging/production buckets and server-side service-role access according to the existing application design. No public bucket is assumed.

### Secrets and Environment Matrix
| Location | Permitted configuration categories | Rules |
|---|---|---|
| Vercel web | Intentionally public `NEXT_PUBLIC_*` URLs/keys only, such as API base URL or public Supabase metadata when the feature requires it | Values are visible in browser bundles; never put a password, shared secret, JWT secret, service-role key, provider key, or connection string here. |
| Railway public API | Existing JWT/encryption, Supabase service access, CORS, email/AI/outreach/provider, notification, compliance, scheduler-disabled, and observability configuration | Inject by production secret store; no `.env` files, CLI output, images, or logs. |
| Railway scheduler | Same approved runtime set as API, with scheduler-specific controls enabled | One replica only; no public domain; use the same isolated production secret scope. |
| GitHub Actions | Environment-scoped deployment credentials and build-time public configuration only | Protected production environment, masked output, no echoing, no repository `.env` files. |
| Supabase / Resend / observability | Provider-native credentials and integrations | Rotate on suspected disclosure and on the defined schedule; record owner and last rotation. |

`NEXT_PUBLIC_AUTOMATION_SECRET` is browser-readable by design and therefore cannot contain a production secret. Any dashboard/API path that relies on it as a credential is a launch-blocking security gap requiring a separate approved authentication/API remediation; this design does not conceal or change that limitation.

### Email and Compliance
Before live sending, configure and verify the sending domain's SPF, DKIM, and DMARC records, sender identity, reply-to address, postal address, unsubscribe URL, webhook signature checks, and bounce/complaint monitoring. Keep `DRY_RUN=true` until the staging checklist and explicit go-live approval are complete. The production scheduler may set `DRY_RUN=false` only after that approval; staging stays dry-run.

## 7. Deployment Flow and Migration Strategy

### Release Sequence
```text
Pull Request → CI validation → merge approved commit to main
  → immutable Release_Candidate → staging deployment + staging migration
  → readiness, deep-health, authenticated employee smoke test
  → named production approval → recovery-point confirmation
  → production backward-compatible migration → API/scheduler rollout → web rollout
  → /live + /ready + authenticated smoke checks + monitoring window
```

1. CI creates and records an immutable commit SHA; a version tag references that exact commit only after all gates pass.
2. Staging deploys the same source/artifact shape intended for production, with staging secrets and staging Supabase only.
3. The migration operator verifies the canonical migration set, staging result, production backup/recovery point, and approval before production promotion.
4. Production schema changes follow expand/contract discipline: only backward-compatible additive changes deploy before code that depends on them. Destructive, reset, or unreviewed data operations are prohibited.
5. Deploy the public API with scheduling disabled, then the singleton scheduler, then Vercel web. Health and smoke checks must pass before declaring the release healthy.
6. Roll back web/API traffic to the previous verified artifact when application checks fail. Do not roll back a production migration by reset; use an approved forward correction or restore procedure based on the incident decision.

### Health Checks and Availability
- `/live`: process liveness; platform restart signal only.
- `/ready`: API readiness and database reachability; deployment and load-balancer gate.
- `/health/deep`: database/provider diagnostic; use from protected monitoring, not as a public detailed disclosure surface.
- Authenticated smoke: non-production synthetic employee verifies login, refresh, portal snapshot, one approved non-destructive test path, and logout against staging; production smoke uses a dedicated synthetic account and no customer task mutation.
- Vercel deployments use immutable build promotion. Railway public API uses rolling/blue-green deployment with readiness gating and a grace period. The scheduler is stopped/replaced serially to preserve exactly one active scheduler.

### Current CI/CD Gap List (Design Only)
| Current state | Risk | Required future workflow capability |
|---|---|---|
| `01-test.yml` uses local Supabase reset for CI integration tests | Correct for disposable CI, but no staging/production migration validation | Pin Node consistently, retain local reset only in CI, validate canonical migration ordering and test artifacts. |
| Staging workflow verifies but prints `deployment ready` | No actual staging deployment or smoke confirmation | Deploy web/API/scheduler to staging, apply controlled staging migrations, then run protected readiness/smoke checks. |
| Production workflow verifies release only | A tag can pass without any deployed state or rollback record | Protected approval, immutable artifact promotion, controlled migration, deployment, health gate, rollback recording. |
| Node versions differ across workflows | Runtime/build drift | Define one supported Node release and enforce it in package manager, CI, and hosting. |
| No dependency/security policy gate | Known vulnerable dependency can reach production | Add blocking severity threshold, exception owner, and expiry record. |

No workflow is changed by this document.


## 8. Observability and Operational Monitoring

### Logs and Error Tracking
All web, API, scheduler, deployment, Supabase, and provider events are correlated by environment, release SHA, request/correlation identifier where available, and timestamp. Railway stdout/stderr is forwarded to Better Stack; API exceptions and browser failures go to Sentry with release and environment tags. Request bodies, authorization headers, cookies, JWTs, refresh tokens, password material, service-role keys, connection strings, and email content are redacted before export. Production logs retain searchable operational metadata for 30 days at startup, then 90 days at growth; security/audit retention follows the approved data-retention policy.

### Monitoring and Alert Matrix
| Signal | Source | Warning / critical action |
|---|---|---|
| Web availability and TLS | Better Stack synthetic HTTPS probes | Alert on failed checks, certificate/DNS errors, or elevated latency. |
| API liveness/readiness | `/live` and protected `/ready` probes | Restart failed process; escalate if readiness fails for 5 minutes. |
| Database health | Protected `/health/deep`, Supabase metrics | Freeze deploys; investigate connection, capacity, or incident status. |
| API error rate/latency | Railway + Sentry + logs | Page on sustained 5xx spike or p95 latency breach. |
| Login/refresh failures | API metrics/log events | Alert on anomaly; check CORS, cookie, Supabase, and credential rotation. |
| Scheduler heartbeat/job outcomes | Scheduler logs and synthetic job-state check | Page if no expected heartbeat or duplicate/failed execution occurs. |
| Webhook/email delivery | Resend webhooks and API logs | Alert on signature failures, bounce/complaint spikes, or provider errors. |
| Backup/restore test | Supabase and recovery-run evidence | Alert on missed backup, failed restore, or RPO/RTO breach. |

The founder owns startup on-call, with a documented backup contact. Alerts route first to the selected secure notification channel, then escalate to the backup contact if unacknowledged. A public status page is optional at startup and required before enterprise commitments.

### Audit Logs
Existing database audit records remain the system of record for application actions such as Employee Portal task completion. Infrastructure audit events—provider access, deployment approvals, DNS changes, secret rotation, backup/restore actions—remain in the relevant provider audit trail and are linked to the incident/release record. No replacement audit schema is introduced.

## 9. Backup and Disaster-Recovery Strategy

### Backup Policy
| Environment | Database and Storage backup | Retention / testing | Recovery target |
|---|---|---|---|
| Development | Existing local backups, preserved volumes; never reset/delete without explicit approval | Operator-managed; not a production recovery source | No production commitment |
| Staging | Provider backup and pre-migration recovery point | 14 days; restore rehearsal before major release changes | RPO 24 hours, RTO 8 hours |
| Production startup | Supabase managed backups plus point-in-time capability selected to meet the target; Storage recovery/versioning capability enabled where available | Minimum 35 days; monthly isolated restore test; retain recovery evidence | RPO 4 hours, RTO 8 hours |
| Growing SaaS | Managed PITR plus scheduled encrypted logical/database-and-object recovery copies in a separate access-controlled account | 90 days; monthly restore and quarterly regional/provider-loss exercise | RPO 1 hour, RTO 4 hours |
| Enterprise | Cross-account, immutable encrypted backups and tested regional recovery architecture | Policy-driven retention; quarterly full DR exercise | RPO 15 minutes, RTO 1 hour |

Exact provider plan capabilities, retention settings, and legal retention requirements are verified during procurement; the targets above are acceptance criteria, not claims about the currently selected tier. Backups and recovery copies are encrypted at rest and in transit, isolated from daily application credentials, and accessible only to designated recovery operators.

### Production Restore Procedure
1. Declare incident, assign incident lead, stop deployments, and disable the scheduler to prevent writes/outbound side effects.
2. Identify the last known-good release, schema version, restore point, affected data class, and whether a forward correction is safer than restoration.
3. Create an isolated recovery project/target; restore database and required Storage objects without overwriting the live system.
4. Validate schema version, row-level access expectations, application login, Employee Portal isolation, file access, and critical audit records against the recovery checklist.
5. Obtain incident-lead approval, switch managed service configuration/traffic only if restoration is selected, and deploy the known-good artifact if needed.
6. Verify `/live`, `/ready`, protected deep health, synthetic owner/employee flows, scheduler singleton state, and monitoring before reopening service.
7. Revoke any compromised credentials, preserve evidence, notify affected parties as required, reconcile missed jobs safely, and complete a blameless post-incident review.

No recovery procedure uses `supabase db reset`, `npm run db:reset`, Docker volume removal, or an unapproved destructive migration against retained data.

## 10. Scalability Roadmap
| Stage | Web/API/Scheduler | Data and operations | Trigger to advance |
|---|---|---|---|
| Startup | Vercel web; one public Railway API replica; one private scheduler replica; managed Supabase project | Provider backups, Sentry/Better Stack, manual named approver | Sustained traffic, error budget risk, or more than one operator |
| Growing SaaS | Multiple readiness-gated public API replicas; scheduler remains exactly one; Cloudflare edge controls; staging parity; stronger backup copies | Supabase plan/compute upgrade, centralized alert rotation, managed secrets process, monthly restore tests | Customer SLAs, higher availability target, regional/customer compliance need |
| Enterprise | Multi-region/blue-green API strategy; dedicated scheduler leadership or queue architecture approved separately; private connectivity where available | Formal SLOs, cross-account immutable backups, SIEM/log retention, SSO/provider access controls, DR exercises | Contractual RPO/RTO, audit, data-residency, or large-volume requirements |

The frontend/API/database contract and current JWT/session model remain stable across stages. The principal scalability caveat is that the present rate limiter and refresh-token single-flight coordination are process-local. Edge controls mitigate global abuse at startup; a later approved distributed coordination improvement is required before relying on broad multi-replica API scale for high-risk auth traffic.

## 11. Risks and Mitigations
| Risk | Impact | Mitigation / decision |
|---|---|---|
| Owner dashboard employee creation is absent from the frozen API/UI | Owner cannot self-serve employee lifecycle as requested | Treat browser employee management as a separate approved feature; use restricted operations provisioning only until then. |
| `/dashboard` uses a distinct portal-auth path from employee JWT auth | Confusing owner identity/accountability model | Preserve current behavior; separately scope consolidation only after product/security review. |
| Browser-readable automation secret is used as a secret | Credential exposure and API abuse | Do not set it to a sensitive value; launch-block any route that treats it as authentication until separately remediated. |
| Scheduler embedded in API server | Duplicate jobs when public service scales | Public API always disables scheduler; one private singleton enables it; alert on duplicate/absent heartbeat. |
| Process-local limiter and refresh coordination | Multi-replica auth behavior is not globally coordinated | Apply edge limits/stickiness where validated; retain single API replica until a distributed design is approved. |
| Migration failure | Partial release or data loss | Preflight, recovery point, additive-first migrations, stop promotion, forward correction/verified restore—not reset. |
| Provider outage | Service unavailable | Provider status monitoring, documented failover/recovery process, portable DNS, verified backups, and known-good artifact. |
| Sending-domain misconfiguration | Deliverability and compliance failure | SPF/DKIM/DMARC, dry-run gate, controlled volume, bounce/complaint alerting, unsubscribe verification. |
| Secret disclosure | Account/data compromise | Provider secret stores, least privilege, redaction, rotation runbook, MFA, audit trails, and environment isolation. |

## 12. Assumptions
1. `jarvisprime.me` is controlled by the company and may be delegated to Cloudflare DNS after explicit approval.
2. Vercel remains the preferred host for the existing Next.js web application.
3. Railway is approved as the initial persistent Node runtime, subject to procurement/security review and regional availability confirmation.
4. Supabase Cloud supports separate staging and production projects in the required region and plan tier.
5. Existing health endpoints, graceful shutdown, CORS configuration, `SCHEDULER_ENABLED`, JWT/session behavior, and Employee Portal contracts remain unchanged.
6. A named human can approve production releases and act as initial incident owner.
7. Staging can use only synthetic or anonymized data; production data is never copied there.
8. This document describes target configuration and runbooks; it does not assert that any provider account, domain record, secret, or managed service has been created.

## 13. Open Questions and Approval Gates
1. **Owner lifecycle:** Approve a separately scoped owner-only employee provisioning feature, or formally retain restricted-operator provisioning. The current frozen system cannot give owners browser employee creation.
2. **Dashboard security:** Confirm whether the existing portal-auth dashboard meets production owner requirements or whether a later JWT/user-platform consolidation is required.
3. **Public API credential:** Identify any endpoint relying on `NEXT_PUBLIC_AUTOMATION_SECRET`; approve a remediation before production exposure if it is treated as a secret.
4. **Region and compliance:** Select primary data region, applicable privacy/data-retention obligations, and customer contractual RPO/RTO.
5. **Provider procurement:** Confirm Railway, Supabase, Resend, Sentry, Better Stack, and Cloudflare plans, ownership, MFA, billing, and support tiers.
6. **Email launch:** Approve sender domain, DNS records, compliance content, recipient acquisition policy, volume ramp, and the go-live condition for `DRY_RUN=false`.
7. **Operations:** Name release approvers, incident owner/backups, alert destination, maintenance window, status-page policy, and secret-rotation cadence.
8. **Implementation authorization:** No infrastructure, workflow, configuration, DNS, provider, secret, migration, application, commit, tag, or push work begins until these decisions and an explicit implementation approval are recorded.

## Requirement Traceability
| Approved requirement | Design sections |
|---|---|
| 1. Managed topology | 1–4, 10 |
| 2. API/scheduler separation | 2–3, 7, 10–11 |
| 3. Domains/TLS/browser boundaries | 2, 5–6 |
| 4. Environments and secrets | 4, 6 |
| 5. Supabase lifecycle/data protection | 4, 7, 9 |
| 6. Owner/employee operation | 5, 11, 13 |
| 7. Delivery controls | 7 |
| 8. Observability | 8 |
| 9. Security/compliance | 6, 8–9, 11 |
| 10. Design boundary | Status and Scope, 13 |
