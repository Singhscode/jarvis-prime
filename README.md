# JARVIS PRIME

AI-powered outbound automation engine for B2B agencies. Sources prospects, scores them against your ICP, sends personalized email sequences, handles replies, and books meetings — autonomously.

---

## Project Structure

```
jarvis-prime/
├── apps/
│   ├── web/          # Next.js frontend (landing page + client portal)
│   ├── api/          # Node.js automation engine + HTTP API
│   └── icp-scorer/   # Standalone ICP scoring module
├── database/          # Version-controlled SQL schemas and migrations
├── packages/
│   ├── ui/           # Shared React components
│   ├── auth/         # Shared authentication helpers
│   ├── ai/           # Shared AI provider abstractions
│   ├── config/       # Shared configuration helpers
│   ├── logger/       # Shared structured logger
│   ├── types/        # Shared TypeScript types
│   └── validation/   # Shared validation schemas
├── automation/       # n8n workflows, webhooks, cron
├── infrastructure/   # Docker, Terraform, Nginx, monitoring
├── docs/             # Architecture, API, deployment, business docs
└── scripts/          # Database, deployment, development scripts
```

---

## Quick Start

### Backend API (automation engine)

```bash
cd apps/api
npm install
cp .env.example .env      # fill in your values
node src/runner.js --doctor  # verify configuration
node src/runner.js --server  # start HTTP server on :3001
```

**Available endpoints once running:**

| URL | Description |
|-----|-------------|
| `GET  /health` | System health + provider status |
| `GET  /api` | All available routes |
| `GET  /api/analytics/dashboard` | Full dashboard metrics |
| `POST /api/outreach` | Trigger outreach |
| `GET  /api/scheduler` | Scheduled job status |
| `GET  /api/linkedin` | LinkedIn automation status |

### Frontend (Next.js)

```bash
cd apps/web
npm install
cp .env.example .env.local   # fill in your values
npm run dev                  # starts on :3000
```

### CLI mode (no server)

```bash
cd apps/api
node src/runner.js              # full pipeline once
node src/runner.js --task=source    # source + score prospects only
node src/runner.js --task=outbound  # send outreach only
node src/runner.js --task=inbound   # simulate reply handling
node src/runner.js --doctor         # config + provider check
```

---

## Configuration

Copy `apps/api/.env.example` to `apps/api/.env` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `DRY_RUN` | — | `true` = safe mode, nothing sent (default) |
| `SUPABASE_URL` | For live | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For live | Supabase service key |
| `GROQ_API_KEY` | For AI emails | Groq API key |
| `RESEND_API_KEY` | For sending | Resend email API key |
| `APOLLO_API_KEY` | For sourcing | Apollo.io API key |

All other variables are optional. See `apps/api/.env.example` for the full list.

---

## Development

From the repo root (requires [Turborepo](https://turbo.build)):

```bash
npm install
npm run dev:web    # start frontend dev server
npm run dev:api    # start backend dev server
npm run build      # build all packages
npm run test       # run all tests
npm run lint       # lint all packages
```

---

## Current Release and Roadmap

✅ **Phase 8 — Owner Workspace Complete**
**Version:** `v0.11.0` · **Git Tag:** `v0.11.0-owner-workspace` · **Status:** Complete · **Completion Date:** July 21, 2026

The Owner Workspace provides one responsive `/dashboard` operating surface for dashboard oversight, CRM, clients, projects, tasks, employees, documents, audit, settings, and global search. It reuses the existing CRM, Client Portal document lifecycle, JWT, refresh-cookie, and session platform while enforcing server-derived Owner Workspace scope and denying Client Portal and Employee Portal identities.

### Phase 9 — Finance & Billing

✅ **Status:** Complete. Production schema/security verification, disposable PostgreSQL integration (7/7 passing), CI wiring, and the manual authenticated Owner smoke are complete. The Owner confirmed the four Finance routes loaded successfully in an existing authenticated session; no Finance data was created or changed during this verification.

- **IMPLEMENTED:** Owner-scoped Finance overview, billing-profile management, invoices, manual payment records, expenses, server-derived employee permissions, service-only mutation RPCs, audit events, and private Finance storage/schema foundations.
- **VERIFIED:** Read-only production schema/RPC/RLS/ACL inspection; disposable PostgreSQL Finance integration (7/7 passing); CI wiring for the existing Finance integration suite; and authenticated Owner route loading for overview, invoices, payments, and expenses.
- **DEFERRED:** Client Finance portal; payment gateways/webhooks; reconciliation; refunds/chargebacks; subscriptions; Finance documents/receipts UI; reports/exports; accounting synchronization; and tax/legal automation.

**Roadmap:** ✅ Phase 0 Repository Cleanup · ✅ Phase 0.5 Database Audit · ✅ Phase 0.6 Runtime Stabilization · ✅ Phase 1 Core User Platform · ✅ Phase 2 CRM Foundation · ✅ Phase 3 Client Management · ✅ Phase 4 Project Management · ✅ Phase 5 Task Management · ✅ Phase 6 Employee Portal · ✅ Phase 7 Client Portal · ✅ Phase 8 Owner Workspace · ✅ Phase 9 Finance & Billing · ⏳ Phase 10 Communication Hub · ⏳ Phase 11 Automation Platform · ⏳ Phase 12 Analytics & Reporting · ⏳ Phase 13 Production & DevOps · ⏳ Phase 14 AI Foundation · ⏳ Phase 15 AI Sales Agents · ⏳ Phase 16 AI Operations · ⏳ Phase 17 Enterprise Security · 🚀 Version 1.0 Release
See the [master roadmap](./documentation/roadmap/MASTER_ROADMAP.md), [detailed roadmap](./documentation/roadmap/README.md), and [changelog and release notes](./documentation/roadmap/CHANGELOG.md).

---

## Architecture

```
apps/api/src/
├── runner.js          # Entry point (CLI + HTTP server)
├── app.js             # Express app factory
├── config/config.js   # Environment configuration
├── modules/           # Feature modules (auth, campaigns, prospects, meetings…)
├── ai/                # AI agents, prompts, and provider abstractions
├── integrations/      # Email, webhooks, notifications, compliance
├── database/          # Supabase client + in-memory fallback
├── jobs/              # Scheduler + background queue
├── middleware/         # Auth, CORS, rate limiting, logging
└── utils/             # Logger, A/B testing, event bus
```

**Safe by default:** `DRY_RUN=true` means the full pipeline runs — sourcing, scoring, personalizing — but no emails are sent and no paid API calls are made. Set `DRY_RUN=false` only when your sending domain and API keys are ready.

---

## Deployment

- **Frontend:** Deploy `apps/web/` to Vercel (see `apps/web/vercel.json`)
- **Backend:** Deploy `apps/api/` to any Node.js 18+ host
- **Database:** Supabase (PostgreSQL) — SQL source of truth at [`database/`](./database/); apply schemas in the documented order

---

## License

MIT — see [LICENSE](./LICENSE)
