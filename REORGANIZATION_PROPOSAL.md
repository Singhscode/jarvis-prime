# 🏗️ JARVIS PRIME — Folder Reorganization Proposal

**Goal**: Reorganize project by feature/responsibility while preserving functionality and Git history  
**Scope**: Both backend (`engine/`) and frontend (`apps/site/`)  
**Philosophy**: Feature-based organization for scalability and team collaboration  
**Current State**: Well-structured but could be more intuitive for new developers

---

## 📊 Current vs Proposed Structure

### BACKEND (engine/)

#### Current Structure
```
engine/src/
├── agents/              (4 files: decision logic)
├── api/routes/          (9 files: HTTP endpoints)
├── api/services/        (7 files: business logic)
├── providers/           (multiple: external services)
├── lib/                 (8 files: infrastructure)
├── middleware/          (5 files: request processing)
├── ai/                  (1 file: personalization)
├── email/               (1 file: email sending)
├── sources/             (1 file: prospect finding)
├── scoring/             (1 file: ICP scoring)
├── config.js            (top-level)
├── runner.js            (top-level)
└── app.js               (top-level)
```

#### Proposed Structure (Feature-Based)
```
engine/src/
├── core/                    ← Infrastructure & Setup
│   ├── app.js               (Express app factory)
│   ├── config.js            (Environment config)
│   ├── runner.js            (CLI/HTTP entry point)
│   └── bootstrap.js         (NEW: App initialization)
│
├── middleware/              ← Request Processing (unchanged)
│   ├── authenticate.js
│   ├── cors.js
│   ├── error-handler.js
│   ├── rate-limiter.js
│   ├── request-logger.js
│   └── validate.js
│
├── providers/               ← External Service Integrations
│   ├── ai/
│   │   ├── index.js
│   │   ├── groq.js
│   │   ├── openai.js
│   │   └── anthropic.js     (NEW: Add support)
│   ├── email/
│   │   ├── index.js
│   │   ├── resend.js
│   │   └── sendgrid.js
│   └── source/
│       ├── index.js
│       └── apollo.js
│
├── lib/                     ← Core Infrastructure
│   ├── db.js                (Database layer)
│   ├── logger.js            (Logging system)
│   ├── notifications.js     (Alerts)
│   ├── event-bus.js         (Events)
│   ├── scheduler.js         (Job scheduling)
│   ├── queue.js             (Task queue)
│   └── ab-testing.js        (A/B testing)
│
├── features/                ← Feature Modules (NEW: Organize by domain)
│   │
│   ├── sourcing/            ← Prospect Discovery & Research
│   │   ├── agents/
│   │   │   └── sourcing-agent.js
│   │   ├── services/
│   │   │   ├── prospect-finder.js
│   │   │   └── enrichment-service.js
│   │   ├── routes/
│   │   │   └── enrichment.js
│   │   └── types.js
│   │
│   ├── scoring/             ← ICP Evaluation
│   │   ├── services/
│   │   │   └── icp-scorer.js
│   │   ├── algorithms/
│   │   │   ├── icp-algorithm.js
│   │   │   └── scoring-helpers.js
│   │   └── types.js
│   │
│   ├── outreach/            ← Email Campaigns
│   │   ├── agents/
│   │   │   └── outreach-agent.js
│   │   ├── services/
│   │   │   ├── outreach-service.js
│   │   │   ├── personalizer.js
│   │   │   └── email-sender.js
│   │   ├── routes/
│   │   │   └── outreach.js
│   │   └── types.js
│   │
│   ├── replies/             ← Inbound Reply Handling
│   │   ├── agents/
│   │   │   └── inbound-agent.js
│   │   ├── services/
│   │   │   ├── reply-classifier.js
│   │   │   └── intent-detector.js
│   │   ├── routes/
│   │   │   └── replies.js    (NEW: Webhook endpoint)
│   │   └── types.js
│   │
│   ├── campaigns/           ← Multi-Channel Campaigns
│   │   ├── agents/
│   │   │   └── campaign-orchestrator.js
│   │   ├── services/
│   │   │   ├── campaign-service.js
│   │   │   ├── sequence-manager.js
│   │   │   └── channel-router.js
│   │   ├── routes/
│   │   │   └── campaigns.js
│   │   └── types.js
│   │
│   ├── linkedin/            ← LinkedIn Automation
│   │   ├── agents/
│   │   │   └── linkedin-agent.js
│   │   ├── services/
│   │   │   └── linkedin-service.js
│   │   ├── routes/
│   │   │   └── linkedin.js
│   │   └── types.js
│   │
│   ├── scheduling/          ← Meeting Booking (Cal.com)
│   │   ├── services/
│   │   │   └── calendar-service.js
│   │   ├── routes/
│   │   │   └── calendar.js
│   │   └── types.js
│   │
│   ├── analytics/           ← Metrics & Insights
│   │   ├── services/
│   │   │   └── analytics-service.js
│   │   ├── queries/         (NEW: SQL/query building)
│   │   │   ├── funnel-queries.js
│   │   │   └── metrics-queries.js
│   │   ├── routes/
│   │   │   └── analytics.js
│   │   └── types.js
│   │
│   ├── webhooks/            ← Inbound Integrations
│   │   ├── services/
│   │   │   └── webhook-service.js
│   │   ├── routes/
│   │   │   ├── email-webhooks.js
│   │   │   ├── calendar-webhooks.js
│   │   │   └── crm-webhooks.js
│   │   └── types.js
│   │
│   └── compliance/          ← Legal & Privacy
│       ├── services/
│       │   └── compliance-service.js
│       ├── routes/
│       │   └── compliance.js
│       └── types.js
│
├── api/                     ← API Router Assembly (NEW: Top-level router)
│   ├── v1.js                (NEW: API v1 router combines all routes)
│   └── health.js            (NEW: Health check routing)
│
├── types/                   ← Shared TypeScript Definitions (NEW)
│   ├── common.ts
│   ├── database.ts
│   ├── api.ts
│   └── index.ts
│
└── sql/                     ← Database (unchanged)
    ├── schema.sql
    └── migrations/
```

**Key Improvements:**
- ✅ Features organized by business domain (sourcing, scoring, outreach, etc)
- ✅ Each feature self-contained: agent + service + routes + types
- ✅ Easier to find related code
- ✅ Clearer for new developers
- ✅ Reduced file nesting depth
- ✅ Types co-located with features

---

### FRONTEND (apps/site/)

#### Current Structure
```
apps/site/src/
├── app/
│   ├── page.tsx             (homepage)
│   ├── layout.tsx           (root layout)
│   ├── globals.css          (global styles)
│   ├── _sections/           (landing page sections)
│   ├── api/                 (API routes - 9 endpoints)
│   ├── dashboard/           (dashboard page)
│   ├── lead-generation/     (lead gen funnel)
│   ├── book-call/           (calendar booking)
│   ├── tasks/               (task management)
│   ├── leads/               (leads list)
│   ├── agencies/            (agencies landing)
│   └── portal-auth/         (EMPTY - auth)
├── components/              (reusable components - 13 files)
├── lib/                     (utilities - 4 files)
└── types/                   (TypeScript defs - 1 file)
```

#### Proposed Structure (Feature-Based)
```
apps/site/src/
├── app/
│   ├── page.tsx             (homepage - routes to layout below)
│   ├── layout.tsx           (root layout wrapper)
│   ├── globals.css          (global CSS only)
│   │
│   ├── (marketing)/         ← Marketing Site Pages
│   │   ├── layout.tsx       (marketing layout)
│   │   ├── page.tsx         (redirect to home)
│   │   ├── agencies/
│   │   │   └── page.tsx
│   │   ├── lead-generation/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   └── components/
│   │   │       ├── HeroSection.tsx
│   │   │       ├── FeaturesSection.tsx
│   │   │       ├── ProcessSection.tsx
│   │   │       ├── ResultsSection.tsx
│   │   │       ├── CaseStudiesSection.tsx
│   │   │       ├── FaqSection.tsx
│   │   │       ├── CalendlyCtaSection.tsx
│   │   │       └── FinalCtaSection.tsx
│   │   └── careers/         (NEW: Careers page)
│   │       └── page.tsx
│   │
│   ├── (portal)/            ← Authenticated Portal
│   │   ├── layout.tsx       (portal layout with nav)
│   │   ├── middleware.ts    (auth check)
│   │   │
│   │   ├── dashboard/       (analytics dashboard)
│   │   │   └── page.tsx
│   │   │
│   │   ├── prospects/       (prospect management)
│   │   │   ├── page.tsx     (list)
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx (detail view)
│   │   │   └── components/
│   │   │       ├── ProspectTable.tsx
│   │   │       ├── ProspectDetail.tsx
│   │   │       └── ProspectFilters.tsx
│   │   │
│   │   ├── campaigns/       (campaign management)
│   │   │   ├── page.tsx
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx
│   │   │   └── components/
│   │   │       ├── CampaignForm.tsx
│   │   │       ├── CampaignStats.tsx
│   │   │       └── SequenceEditor.tsx
│   │   │
│   │   ├── inbox/           (reply inbox)
│   │   │   ├── page.tsx
│   │   │   └── components/
│   │   │       ├── ReplyList.tsx
│   │   │       └── ReplyDetail.tsx
│   │   │
│   │   ├── meetings/        (calendar + bookings)
│   │   │   ├── page.tsx
│   │   │   └── components/
│   │   │       ├── CalendarView.tsx
│   │   │       └── BookingsList.tsx
│   │   │
│   │   ├── tasks/           (tasks management)
│   │   │   ├── page.tsx
│   │   │   └── components/
│   │   │       └── TaskBoard.tsx
│   │   │
│   │   ├── settings/        (user settings)
│   │   │   ├── page.tsx
│   │   │   ├── account/
│   │   │   │   └── page.tsx
│   │   │   ├── team/
│   │   │   │   └── page.tsx
│   │   │   ├── billing/
│   │   │   │   └── page.tsx
│   │   │   └── components/
│   │   │       └── SettingsTabs.tsx
│   │   │
│   │   └── help/            (NEW: Help center)
│   │       ├── page.tsx
│   │       ├── docs/
│   │       └── faq/
│   │
│   ├── auth/                ← Authentication (NEW)
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── signup/
│   │   │   └── page.tsx
│   │   ├── forgot-password/
│   │   │   └── page.tsx
│   │   ├── reset-password/
│   │   │   └── page.tsx
│   │   └── callback/
│   │       └── page.tsx
│   │
│   └── api/                 ← API Routes (keep top-level)
│       ├── auth/            (NEW: organize by domain)
│       │   ├── login/route.ts
│       │   ├── logout/route.ts
│       │   └── session/route.ts
│       ├── enrichment/route.ts
│       ├── outreach/route.ts
│       ├── campaigns/route.ts
│       ├── prospects/route.ts
│       ├── analytics/route.ts
│       ├── chat/route.ts
│       ├── book/route.ts
│       ├── health/route.ts
│       └── webhooks/
│           ├── email/route.ts
│           ├── calendar/route.ts
│           └── crm/route.ts
│
├── components/              ← Shared Components
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Navigation.tsx
│   │   ├── Footer.tsx
│   │   ├── Sidebar.tsx      (NEW: Portal sidebar)
│   │   └── PortalLayout.tsx (NEW: Portal wrapper)
│   │
│   ├── ui/                  (NEW: UI primitives)
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   ├── Input.tsx
│   │   ├── Tabs.tsx
│   │   ├── Table.tsx
│   │   └── Badge.tsx
│   │
│   ├── forms/               (NEW: Reusable forms)
│   │   ├── CampaignForm.tsx
│   │   ├── ProspectForm.tsx
│   │   └── SettingsForm.tsx
│   │
│   ├── marketing/           (Marketing-specific)
│   │   ├── HeroSection.tsx
│   │   ├── FeaturesSection.tsx
│   │   ├── PricingSection.tsx
│   │   ├── FaqSection.tsx
│   │   ├── Reveal.tsx
│   │   ├── AnimatedCounter.tsx
│   │   ├── ParticleGrid.tsx
│   │   ├── SectionDivider.tsx
│   │   └── GlowButton.tsx
│   │
│   ├── features/            (NEW: Feature-specific)
│   │   ├── ChatWidget.tsx
│   │   ├── CalendlyBooking.tsx
│   │   └── Dashboard/
│   │       └── StatsCard.tsx
│   │
│   └── common/              (NEW: Small utilities)
│       ├── Loader.tsx
│       ├── EmptyState.tsx
│       └── ErrorBoundary.tsx
│
├── lib/                     ← Utilities & APIs
│   ├── api-client.ts        (NEW: Centralized API calls)
│   ├── hooks/               (NEW: Custom React hooks)
│   │   ├── useAuth.ts
│   │   ├── useAPI.ts
│   │   ├── useProspects.ts
│   │   └── useCampaigns.ts
│   ├── utils.ts             (general utilities)
│   ├── supabase.ts          (database client)
│   ├── apollo.ts            (Apollo GraphQL)
│   └── enrichment.ts        (data enrichment)
│
├── types/                   ← TypeScript Definitions
│   ├── api.ts               (API contracts)
│   ├── database.ts          (Database models)
│   ├── components.ts        (Component props)
│   └── index.ts
│
└── styles/                  ← CSS Files (NEW)
    ├── globals.css          (move from app/)
    ├── variables.css        (design tokens)
    └── animations.css       (reusable animations)
```

**Key Improvements:**
- ✅ Route groups `(marketing)` and `(portal)` separate concerns
- ✅ Auth pages consolidated in `auth/` folder
- ✅ Components organized by responsibility (layout, ui, forms, etc)
- ✅ Hooks extracted to separate folder (React best practice)
- ✅ API client centralized (single source of truth for API calls)
- ✅ Feature pages nested under `(portal)/` with feature-specific components

---

## 🎯 Reorganization Phases

### Phase 1: Backend Core Infrastructure (1-2 days)
**Goal**: Reorganize foundation without changing logic

1. Create new `src/core/` directory
2. Move `config.js`, `runner.js`, `app.js` to `src/core/`
3. Move `middleware/` to its final location (same level)
4. Move `providers/` to final location
5. Move `lib/` to final location
6. Update all import paths

**Affected Files**: ~40 imports across agents, routes, services  
**Risk**: Medium (many import paths to update)  
**Verification**: `npm run server` starts successfully

---

### Phase 2: Backend Feature Organization (2-3 days)
**Goal**: Reorganize business logic by feature

1. Create `src/features/` directory structure
2. For each feature (sourcing, scoring, outreach, replies, campaigns, linkedin, scheduling, analytics, webhooks, compliance):
   - Move agent to `features/[feature]/agents/`
   - Move service to `features/[feature]/services/`
   - Move route to `features/[feature]/routes/`
   - Create `features/[feature]/types.js` for feature types
3. Create `src/api/v1.js` that combines all routes
4. Update `app.js` to use centralized router
5. Add `src/types/` directory and move shared types

**Affected Files**: ~50 imports  
**Risk**: Medium-High (significant reorganization)  
**Verification**: All CLI tasks work, all HTTP endpoints accessible

---

### Phase 3: Backend Type Safety (1 day)
**Goal**: Convert to TypeScript gradually

1. Rename `src/` to `src-js/` as backup
2. Create `src/` for TypeScript files
3. Migrate `config.js` → `config.ts` (highest value)
4. Migrate `lib/` files to TypeScript
5. Add `types/` with comprehensive interfaces
6. Keep business logic in JavaScript for now

**Affected Files**: Core infrastructure  
**Risk**: Low (incremental, with JS fallback)  
**Verification**: TypeScript compilation succeeds

---

### Phase 4: Frontend Structure (2-3 days)
**Goal**: Reorganize by route groups and features

1. Create route group structure:
   - `app/(marketing)/`
   - `app/(portal)/`
   - `app/auth/`
2. Move/organize pages into route groups
3. Create feature-specific component folders:
   - `components/layout/`
   - `components/ui/`
   - `components/forms/`
   - `components/marketing/`
   - `components/features/`
4. Move utility hooks to `lib/hooks/`
5. Create centralized `lib/api-client.ts`
6. Consolidate duplicate components (remove duplicates from both locations, keep single source)

**Affected Files**: ~80 imports  
**Risk**: Medium (many component imports)  
**Verification**: `npm run dev` starts, all pages accessible

---

### Phase 5: Documentation & Scripts (1 day)
**Goal**: Update guides to reflect new structure

1. Update `PROJECT_STRUCTURE.md` with new layout
2. Create `.kiro/steering/backend-architecture.md` guide
3. Create `.kiro/steering/frontend-architecture.md` guide
4. Add feature development guide (how to add new feature)
5. Update editor workspace settings for path aliases

**Risk**: Low (documentation only)  
**Verification**: Team can navigate new structure

---

## 📋 Migration Checklist

### Before Starting
- [ ] Create feature branch: `git checkout -b refactor/reorganize-structure`
- [ ] Back up current structure: `git tag backup/pre-reorganization`
- [ ] Verify all tests pass (if they exist)
- [ ] Document current import patterns

### Phase 1 Execution
- [ ] Create backend core structure
- [ ] Move files using `git mv` (preserves history)
- [ ] Update imports in moved files
- [ ] Update imports in files that reference moved files
- [ ] Test: `npm run server` works
- [ ] Test: `npm run doctor` shows no errors

### Phase 2 Execution
- [ ] Create feature directories
- [ ] Move agents/services/routes to features
- [ ] Create centralized API router
- [ ] Update app.js routing
- [ ] Test all CLI tasks: `npm run source`, `npm run outreach`, etc
- [ ] Test all HTTP endpoints: curl each route

### Phase 3 Execution
- [ ] Create TypeScript config updates
- [ ] Migrate core files to .ts
- [ ] Ensure no type errors

### Phase 4 Execution
- [ ] Create Next.js route groups
- [ ] Move components and pages
- [ ] Update all component imports
- [ ] Test: `npm run dev` and navigate all pages
- [ ] Test: All API routes still work

### Phase 5 Execution
- [ ] Update documentation
- [ ] Create developer guides
- [ ] Add file organization diagram to README

### Final
- [ ] Run full test suite (once created)
- [ ] Code review of import changes
- [ ] Merge to main
- [ ] Deploy to staging first

---

## 🔄 Import Update Strategy

### Backend Example
**Before:**
```javascript
// src/api/routes/outreach.js
import { runOutreach } from '../../agents/outbound-agent.js';
import { sendEmail } from '../../email/sender.js';
import { db } from '../../lib/db.js';
```

**After:**
```javascript
// src/features/outreach/routes/outreach.js
import { runOutreach } from '../agents/outreach-agent.js';
import { sendEmail } from '../services/email-sender.js';
import { db } from '../../../lib/db.js';
```

### Frontend Example
**Before:**
```typescript
// apps/site/src/components/Dashboard.tsx
import { Prospect } from '../types/api';
import { useAPI } from '../lib/api-client';
import { StatsCard } from './StatsCard';
```

**After:**
```typescript
// apps/site/src/app/(portal)/dashboard/page.tsx
import type { Prospect } from '@/types/api';
import { useAPI } from '@/lib/hooks/useAPI';
import { StatsCard } from '@/components/features/Dashboard/StatsCard';
```

---

## ✅ Validation & Testing Strategy

### After Each Phase

**Run Tests:**
```bash
# Backend
npm run server              # HTTP mode works
npm run doctor              # Health check passes
npm run source --once       # CLI mode works

# Frontend
npm run dev                 # Dev server starts
npm run build               # Production build succeeds

# Git
git status                  # No untracked files
git log --oneline           # History preserved
```

**Manual Testing:**
```bash
# Backend: Test each feature
curl http://localhost:3001/health
curl -X POST http://localhost:3001/api/enrichment -H "Authorization: Bearer test"

# Frontend: Navigate pages
- Homepage loads
- Dashboard accessible
- API calls succeed
```

---

## 📊 Before/After Comparison

| Metric | Before | After | Benefit |
|--------|--------|-------|---------|
| **Max file nesting** | 4 levels | 3 levels | Easier to find files |
| **Files per folder** | 10-12 | 3-5 | Cleaner organization |
| **Feature discoverability** | Hard (scattered) | Easy (self-contained) | Onboarding faster |
| **Code relatedness** | Scattered | Co-located | Less context switching |
| **Adding new feature** | Touch 8+ files | Create 1 folder | Simpler development |
| **Import path length** | `../../lib/db` | `../../../lib/db` | Slightly longer (OK) |

---

## 🎯 Proposed Approval

### Do you approve this reorganization plan?

**Key Benefits:**
1. ✅ Feature-based organization (easier to find related code)
2. ✅ Clear separation of concerns (agents/services/routes)
3. ✅ Better onboarding for new team members
4. ✅ Self-contained features (can move/delete entire features easily)
5. ✅ Route groups in frontend (marketing vs portal distinction clear)
6. ✅ Prepared for TypeScript migration
7. ✅ Git history preserved (using `git mv`)
8. ✅ Incremental execution (can do 1 phase at a time)

**No Changes To:**
- Business logic
- Functionality
- APIs
- Database schema
- Dependencies

**Next Step:** Once approved, I'll start Phase 1 with detailed migration report for each file moved.

---

## 📝 Approval Section

Please confirm you want me to proceed with:

- [ ] Phase 1: Backend core infrastructure
- [ ] Phase 2: Backend feature organization
- [ ] Phase 3: TypeScript migration
- [ ] Phase 4: Frontend route groups
- [ ] Phase 5: Documentation updates

Or select specific phases to start with?

