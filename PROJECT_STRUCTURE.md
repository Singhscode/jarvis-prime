# 📁 JARVIS PRIME — Project Structure

## Complete Folder Organization

```
Jarvis ai company/
│
├── 📄 PROJECT_STRUCTURE.md          ← You are here
├── 📄 package.json                  ← Root dependencies
├── 📄 .env.local                    ← Environment variables (gitignored)
├── 📄 .gitignore                    ← Git ignore rules
│
├── 📂 apps/                         ← Monorepo applications
│   └── site/                        ← FRONTEND (Next.js Website)
│       ├── 📄 package.json
│       ├── 📄 tsconfig.json
│       ├── 📄 next.config.mjs
│       ├── 📄 postcss.config.js
│       ├── 📂 public/               ← Static assets (logos, icons)
│       ├── 📂 src/
│       │   ├── 📂 app/              ← Next.js app directory
│       │   │   ├── page.tsx         ← Home page
│       │   │   ├── layout.tsx       ← Root layout
│       │   │   ├── 📂 api/          ← API routes
│       │   │   ├── 📂 dashboard/    ← Dashboard pages
│       │   │   ├── 📂 book-call/    ← Meeting booking
│       │   │   ├── 📂 lead-generation/
│       │   │   ├── 📂 tasks/
│       │   │   └── 📂 leads/
│       │   └── 📂 components/       ← Reusable components
│       └── .next/                   ← Build output (gitignored)
│
├── 📂 engine/                       ← BACKEND (Automation Engine)
│   ├── 📄 package.json
│   ├── 📄 .env                      ← Engine environment
│   ├── 📄 DUAL_MODE.md              ← CLI vs HTTP documentation
│   │
│   ├── 📂 src/
│   │   ├── 📄 runner.js             ← Entry point (CLI + HTTP modes)
│   │   ├── 📄 config.js             ← Configuration & environment
│   │   │
│   │   ├── 📂 agents/               ← AI Decision Logic
│   │   │   ├── outbound-agent.js    ← Source, score, send
│   │   │   ├── inbound-agent.js     ← Reply classification
│   │   │   └── ...
│   │   │
│   │   ├── 📂 api/                  ← HTTP API Layer
│   │   │   ├── 📂 routes/           ← API endpoints
│   │   │   │   ├── enrichment.js    ← POST /api/enrichment
│   │   │   │   ├── outreach.js      ← POST /api/outreach
│   │   │   │   └── campaigns.js     ← POST /api/campaigns
│   │   │   │
│   │   │   └── 📂 services/         ← Business logic
│   │   │       ├── enrichment.js
│   │   │       ├── outreach.js
│   │   │       └── campaigns.js
│   │   │
│   │   ├── 📂 lib/                  ← Utility functions
│   │   │   ├── db.js                ← Database queries
│   │   │   ├── logger.js            ← Logging
│   │   │   └── ...
│   │   │
│   │   └── 📂 web/                  ← Web dashboards (removed)
│   │       ├── index.html           ← Classic dashboard
│   │       └── README.md
│   │
│   └── 📂 sql/
│       └── schema.sql               ← Database schema
│
├── 📂 documentation/                ← DOCUMENTATION
│   ├── 📂 presentation/             ← Meeting materials
│   │   ├── PRESENT_THIS_NOW.txt     ← ⭐ 10-min script
│   │   ├── PRESENTATION_ONE_PAGE_SUMMARY.txt
│   │   ├── FOUNDER_MEETING_BRIEF.txt
│   │   ├── START_PRESENTING_TODAY.txt
│   │   └── MEETING_PREP_CHECKLIST.txt
│   │
│   ├── 📂 onboarding/               ← Employee training
│   │   └── EMPLOYEE_ONBOARDING.md
│   │
│   ├── 📂 technical/                ← Technical details
│   │   └── BUSINESS_LOGIC_DETAILED.md
│   │
│   ├── 📂 auth/                     ← Authentication docs
│   ├── 📂 security/                 ← Security docs
│   ├── 📂 changelog/                ← Development history
│   └── 📂 business/                 ← Business docs and execution plans

├── 📂 automation/                   ← n8n workflows and diagrams
├── 📂 database/                     ← SQL assets
│   └── 📂 schema/
│       └── supabase-schema.sql
│
├── 📂 .github/                      ← GitHub configuration
│   └── workflows/                   ← CI/CD workflows
│
├── 📂 .vscode/                      ← VS Code settings
│
└── 📂 node_modules/                 ← Dependencies (gitignored)
```

---

## 📋 Folder Purposes

### **apps/site/** (FRONTEND)
- **Purpose**: Customer-facing website and UI
- **Tech**: Next.js, TypeScript, Tailwind CSS
- **Key Files**: 
  - `page.tsx` - Home page
  - `api/` - Backend API routes
  - `components/` - Reusable UI components
- **Run**: `npm run dev` (port 3000)

### **engine/** (BACKEND)
- **Purpose**: Automation engine, business logic, API server
- **Tech**: Node.js, Express, PostgreSQL
- **Key Files**:
  - `runner.js` - Main entry point
  - `agents/` - AI decision logic
  - `api/` - HTTP API routes
  - `config.js` - Settings & environment
- **Run**: `npm run server` (port 3001)

### **docs/presentation/** (PRESENTATION MATERIALS)
- **Purpose**: Founder meeting & onboarding presentations
- **Files**:
  - `PRESENT_THIS_NOW.txt` ⭐ - 10-min script
  - `PRESENTATION_ONE_PAGE_SUMMARY.txt` - Visual aids
  - `FOUNDER_MEETING_BRIEF.txt` - Full version
  - `MEETING_PREP_CHECKLIST.txt` - Preparation guide

### **docs/onboarding/** (EMPLOYEE TRAINING)
- **Purpose**: New employee onboarding materials
- **Files**:
  - `EMPLOYEE_ONBOARDING.md` - Complete training guide

### **docs/technical/** (TECHNICAL DOCUMENTATION)
- **Purpose**: Deep technical documentation for engineers
- **Files**:
  - `BUSINESS_LOGIC_DETAILED.md` - Algorithms, architecture, data models

---

## 🚀 Quick Commands

### Frontend (Next.js)
```bash
cd apps/site
npm install
npm run dev           # Development server (port 3000)
npm run build         # Production build
npm run start         # Production server
```

### Backend (Engine)
```bash
cd engine
npm install
npm run server        # Start HTTP server (port 3001)
npm run source        # CLI: Source prospects
npm run outbound      # CLI: Send outreach
npm run doctor        # CLI: Health check
```

### Full-stack local startup
```bash
npm install
npm run dev           # Starts site + engine together
```

### Documentation
```bash
# View presentation materials
open documentation/presentation/PRESENT_THIS_NOW.txt

# View onboarding materials
open documentation/onboarding/EMPLOYEE_ONBOARDING.md

# View technical documentation
open documentation/technical/BUSINESS_LOGIC_DETAILED.md
```

---

## 🔧 Development Workflow

### 1. Start Backend
```bash
cd engine
npm run server
# Server runs on http://localhost:3001
# Test: curl http://localhost:3001/health
```

### 2. Start Frontend
```bash
cd apps/site
npm run dev
# Website runs on http://localhost:3000
```

### 3. Both Running
- Backend API: http://localhost:3001
- Frontend: http://localhost:3000
- API calls: frontend → backend on port 3001

---

## 📊 File Organization Summary

| Folder | Purpose | Language | Contains |
|--------|---------|----------|----------|
| `apps/site/` | Frontend website | TypeScript/React | Next.js app, components, API routes |
| `engine/` | Backend automation | JavaScript/Node.js | Agents, APIs, database logic |
| `engine/sql/` | Database | SQL | Schema, migrations |
| `documentation/presentation/` | Meeting materials | Markdown/Text | Presentation scripts, slides |
| `documentation/onboarding/` | Employee training | Markdown | Training guides |
| `documentation/technical/` | Technical docs | Markdown | Architecture, algorithms |
| `.github/` | CI/CD | YAML | GitHub Actions workflows |

---

## 🔐 Environment Files (gitignored)

### Root: `.env.local`
```
# Shared environment
NODE_ENV=development
```

### Engine: `engine/.env`
```
PORT=3001
DRY_RUN=true
AUTOMATION_SECRET=your-secret
SUPABASE_URL=...
SUPABASE_KEY=...
APOLLO_KEY=...
RESEND_KEY=...
OPENAI_KEY=...
```

### Frontend: `apps/site/.env.local`
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## 🎯 For Different Roles

### Frontend Engineer
- Work in: `apps/site/`
- Edit: `src/app/`, `src/components/`
- Test: `npm run dev` on port 3000
- API calls to: `http://localhost:3001`

### Backend Engineer
- Work in: `engine/`
- Edit: `src/agents/`, `src/api/`, `src/config.js`
- Test: `npm run server` on port 3001
- Database: `sql/schema.sql`

### DevOps/Infrastructure
- Deploy: `apps/site/` to Vercel
- Deploy: `engine/` to Node.js host
- Config: `engine/.env`
- Database: Setup PostgreSQL (Supabase)

### Product Manager
- Reference: `documentation/technical/BUSINESS_LOGIC_DETAILED.md`
- Analytics: Use dashboard at `apps/site/src/app/dashboard/`

---

## 📈 How Data Flows

```
Website (Port 3000)
    ↓
API Call to Engine (Port 3001)
    ↓
Engine Routes → Services → Agents
    ↓
Database (PostgreSQL)
    ↓
Response back to Website
```

---

## ✅ Next Steps

1. **Review Structure**: Explore each folder
2. **Start Locally**: `npm run dev` (frontend) + `npm run server` (backend)
3. **Read Documentation**: 
   - Frontend dev: See `apps/site/`
   - Backend dev: See `engine/`
   - New team: See `docs/presentation/PRESENT_THIS_NOW.txt`
4. **Make Changes**: Edit files in respective folders
5. **Deploy**: Follow README in each folder

---

## 📞 Support

- **Presentation**: See `docs/presentation/`
- **Onboarding**: See `docs/onboarding/`
- **Technical**: See `docs/technical/`
- **Code**: See `apps/site/` and `engine/`

---

**Project is now properly organized and ready for team collaboration!** 🚀
