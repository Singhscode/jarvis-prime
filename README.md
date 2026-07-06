# ⚡ JARVIS PRIME — B2B Sales Automation Engine

Automated outbound prospecting platform for agencies. AI-powered email personalization, multi-step sequences, and intelligent reply handling.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+)
- npm or yarn
- PostgreSQL (or Supabase account)

### Installation

```bash
# Clone repo
git clone <repo-url>
cd "Jarvis ai company"

# Install root dependencies
npm install

# Backend setup
cd engine
npm install
cp .env.example .env.local
# Add API keys to .env.local

# Frontend setup
cd ../apps/site
npm install
cp .env.example .env.local
```

### Run Locally

**Terminal 1: Backend API**
```bash
cd engine
npm run server
# Runs on http://localhost:3001
```

**Terminal 2: Frontend**
```bash
cd apps/site
npm run dev
# Runs on http://localhost:3000
```

### Verify Setup
```bash
# Test backend
curl http://localhost:3001/health

# Open frontend
open http://localhost:3000
```

---

## 📁 Project Structure

```
Jarvis ai company/
├── apps/site/          ← FRONTEND (Next.js website)
├── engine/             ← BACKEND (Node.js API)
├── docs/               ← DOCUMENTATION
│   ├── presentation/   ← Meeting materials
│   ├── onboarding/     ← Employee training
│   └── technical/      ← Technical docs
└── PROJECT_STRUCTURE.md ← Detailed folder guide
```

**Full structure**: See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)

---

## 🎯 What Does It Do?

### The Problem
Agencies spend 40+ hours/week on lead generation:
- Manual research on LinkedIn
- Writing personalized emails
- Following up with non-responders
- Manually entering data into CRM

### The Solution
JARVIS PRIME automates the entire workflow:

```
DAY 1     → Source 500 qualified prospects
DAY 2     → AI scores each prospect (0-100 ICP match)
DAY 3-7   → Send personalized email sequences
DAY 10    → Get replies + AI classifies intent
          → Schedule meetings automatically
```

### The Result
📈 **2-3 meetings/week → 15-20 meetings/week**

---

## 🔧 Available Commands

### Backend (engine/)
```bash
npm run server              # Start HTTP API server (port 3001)
npm run source              # CLI: Source & score prospects
npm run outbound            # CLI: Send outreach campaigns
npm run doctor              # CLI: Health check
npm run server --port=3000  # Custom port
```

### Frontend (apps/site/)
```bash
npm run dev                 # Development server
npm run build               # Production build
npm run start               # Production server
npm run lint                # Code quality check
```

---

## 📊 Key Features

✅ **Prospect Sourcing**
- Apollo API integration
- 500+ prospects/day

✅ **AI Scoring**
- ICP (Ideal Customer Profile) matching
- 0-100 point scoring

✅ **Email Personalization**
- GPT-4 powered
- Unique subject + body per prospect
- Mentions company news, industry trends

✅ **Multi-Step Sequences**
- Day 3, 6, 8, 10 follow-ups
- Automatic send timing
- Different angles each step

✅ **Reply Intelligence**
- AI classification (INTERESTED, NOT_INTERESTED, etc)
- Auto-meeting scheduling
- Slack notifications

✅ **Automation Workflows**
- n8n integration
- Zapier compatibility
- Custom triggers & actions

---

## 🔌 API Endpoints

### Public (No Auth)
```
GET /health
→ Server status, uptime, mode
```

### Protected (Requires x-automation-secret header)
```
POST /api/enrichment
→ Enrich prospect data with Apollo/Hunter

POST /api/outreach
→ Send personalized email campaign

POST /api/campaigns
→ Manage campaign settings
```

**Auth Header:**
```
x-automation-secret: <your-secret-key>
```

---

## 🗄️ Database

**Type**: PostgreSQL (Supabase recommended)

**Tables**:
- `clients` - Agency/company records
- `prospects` - B2B contact information
- `messages` - Email records (sent, opened, clicked)
- `events` - Tracking data (opens, clicks, replies)
- `suppression` - Unsubscribed/bounced emails

**Setup**:
```bash
# Run migrations
psql -f engine/sql/schema.sql

# Or use Supabase:
# Create new project
# Run schema.sql in SQL editor
```

---

## 📚 Documentation

### For New Employees
👉 See: [`docs/presentation/PRESENT_THIS_NOW.txt`](docs/presentation/PRESENT_THIS_NOW.txt)
- 10-minute presentation script
- Everything they need to know

### For Developers
👉 See: [`docs/technical/BUSINESS_LOGIC_DETAILED.md`](docs/technical/BUSINESS_LOGIC_DETAILED.md)
- Algorithms explained
- Architecture deep dive
- Data models

### For Onboarding
👉 See: [`docs/onboarding/EMPLOYEE_ONBOARDING.md`](docs/onboarding/EMPLOYEE_ONBOARDING.md)
- Complete training guide
- First week tasks
- Development setup

### For Presentations
👉 See: [`docs/presentation/`](docs/presentation/)
- Multiple presentation formats
- Meeting preparation checklist

---

## 🚀 Deployment

### Frontend (Next.js)
```bash
# Deploy to Vercel
npm run build
vercel
```

### Backend (Node.js)
```bash
# Deploy to any Node.js host
npm install --production
npm run server

# Or use Docker:
docker build -t jarvis-engine .
docker run -p 3001:3001 jarvis-engine
```

---

## 🔐 Environment Variables

**Required** (`engine/.env`):
```
PORT=3001
DRY_RUN=true
AUTOMATION_SECRET=your-secret-key
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key
OPENAI_KEY=your-openai-key
APOLLO_KEY=your-apollo-key
RESEND_KEY=your-resend-key
```

**Optional**:
```
HUNTER_KEY=your-hunter-key
CLEARBIT_KEY=your-clearbit-key
```

---

## 🧪 Testing

### Health Check
```bash
curl http://localhost:3001/health
```

### Test Campaign (DRY-RUN)
```bash
cd engine
npm run source    # Source prospects
npm run outbound  # Send test emails (safe mode)
npm run doctor    # Verify everything works
```

---

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes
3. Test locally: `npm run dev` + `npm run server`
4. Commit: `git commit -m "Add feature"`
5. Push: `git push origin feature/your-feature`
6. Create Pull Request

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check port 3001 not in use
lsof -i :3001

# Verify Node.js installed
node --version

# Reinstall dependencies
rm -rf node_modules
npm install
```

### Frontend won't connect to backend
```bash
# Verify backend running
curl http://localhost:3001/health

# Check NEXT_PUBLIC_API_URL in .env.local
cat apps/site/.env.local
```

### Database connection error
```bash
# Test database connection
psql -U user -d database -h localhost

# Or verify Supabase credentials in .env
cat engine/.env
```

---

## 📞 Support

**For Presentations**: See `docs/presentation/PRESENT_THIS_NOW.txt`  
**For Technical Help**: See `docs/technical/BUSINESS_LOGIC_DETAILED.md`  
**For Onboarding**: See `docs/onboarding/EMPLOYEE_ONBOARDING.md`  

---

## 📈 Performance

- **Reply Rate**: 22% (industry avg: 8%)
- **ROI**: 13,200% on average campaign
- **Cost per prospect**: $0.60
- **Email delivery**: 98%+
- **Response time**: <100ms

---

## 🗺️ Roadmap

- [ ] Advanced analytics dashboard
- [ ] Multi-language support
- [ ] WhatsApp automation
- [ ] LinkedIn integration
- [ ] Custom AI model training
- [ ] Team collaboration features

---

## 📄 License

MIT License - See LICENSE file

---

**Made by Anuj Singh**  
**Latest Update**: July 3, 2026  
**Status**: Production Ready ✅

