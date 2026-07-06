# JARVIS PRIME Engine — Dual Mode (CLI + HTTP)

The engine runs in two modes from the same codebase:

## CLI Mode (Default)

Run automation tasks from the command line:

```bash
# Full pipeline once
npm run run

# Only source & score prospects
npm run source

# Only send outreach
npm run outbound

# Simulate inbound replies (dry-run)
npm run inbound

# Check configuration
npm run doctor
```

## HTTP Server Mode (New)

Run as an HTTP API server for website integration:

```bash
# Start server on port 3001
npm run server

# Or custom port
node src/runner.js --server --port=3000

# Development (with auto-reload)
npm run server:dev
```

## Environment Variables

Add to `engine/.env`:

```env
# For both modes
DRY_RUN=true
DAILY_PROSPECT_LIMIT=25
DAILY_SEND_LIMIT=40

# For HTTP server mode
PORT=3001
AUTOMATION_SERVER_SECRET=your_secret_key

# API Keys (same in both modes)
APOLLO_API_KEY=...
GROQ_API_KEY=...
RESEND_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

## Architecture

```
engine/
├── src/
│   ├── config.js              (Configuration for both modes)
│   ├── runner.js              (Entry point - detects mode)
│   │
│   ├── agents/                (CLI agents - prospect finding, scoring)
│   ├── ai/                    (AI personalization)
│   ├── email/                 (Email sending)
│   ├── lib/                   (Database, logging)
│   │
│   └── api/                   (HTTP API - NEW)
│       ├── routes/            (HTTP endpoints)
│       │   ├── enrichment.js
│       │   ├── outreach.js
│       │   └── campaigns.js
│       └── services/          (Business logic)
│           ├── enrichment-service.js
│           ├── outreach-service.js
│           └── campaign-service.js
└── .env                       (Shared config for both modes)
```

## API Endpoints (HTTP Mode)

All endpoints require `x-automation-secret` header (except `/health`).

### Enrichment
```bash
POST /api/enrichment
{
  "action": "find_agencies",
  "params": { "location": "India", "limit": 50 },
  "dry_run": false
}
```

### Outreach
```bash
POST /api/outreach
{
  "action": "send_email",
  "prospect": { "name": "John", "email": "john@example.com" },
  "step": 1,
  "dry_run": false
}
```

### Campaigns
```bash
POST /api/campaigns
{
  "clientId": "client_123",
  "campaignData": { "prospectCount": 100 }
}
```

### Health (no auth)
```bash
GET /health
```

## How It Works

### CLI Mode
1. User runs: `npm run source`
2. `runner.js` detects no `--server` flag
3. Executes CLI pipeline (agents/outbound-agent.js)
4. Runs to completion and exits

### HTTP Server Mode
1. User runs: `npm run server`
2. `runner.js` detects `--server` flag
3. Loads Express.js
4. Mounts API routes
5. Starts HTTP server on port 3001
6. Listens for incoming requests

## Website Integration

In `apps/site/.env.local`:
```env
NEXT_PUBLIC_ENGINE_SERVER_URL=http://localhost:3001  # dev
# or: https://engine.yourdomain.com  # production

AUTOMATION_SERVER_SECRET=your_secret_from_engine_.env
```

In website code:
```typescript
import { callEngineServer } from '@/lib/automation-client';

const result = await callEngineServer('/api/enrichment', {
  action: 'find_agencies',
  params: { location: 'India' },
});
```

## Setup

### 1. Install
```bash
cd engine
npm install
```

### 2. Configure
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Run CLI
```bash
npm run doctor
npm run source
```

### 4. Or Run HTTP Server
```bash
npm run server
# In another terminal:
curl http://localhost:3001/health
```

## Key Benefits

✅ **Single Codebase** - CLI and HTTP modes in one folder
✅ **Reusable Logic** - Services used by both modes
✅ **Secure** - API keys in .env, not on website
✅ **Flexible** - Run manually (CLI) or via HTTP (API)
✅ **Easy Deployment** - Deploy one /engine folder

## Commands

### CLI Tasks
```bash
npm run run              # Full pipeline
npm run source           # Find & score prospects
npm run outbound         # Send outreach
npm run inbound          # Process replies (demo)
npm run doctor           # Check configuration
```

### Server
```bash
npm run server           # Start HTTP server
npm run server:dev       # Start with auto-reload
```

## Next Steps

1. ✅ Single engine folder (both CLI and HTTP)
2. Update website to call `/api/enrichment`, `/api/outreach`, etc.
3. Deploy engine server on same infrastructure
4. Website calls engine for all automations

## Migration from Separate Folders

If coming from separate `/automation-server` and `/engine`:
- `/automation-server` can be deleted
- All functionality is now in `/engine`
- API routes are the same
- Configuration is unified

## Troubleshooting

**Server won't start:**
```bash
npm install
node src/runner.js --doctor
```

**Port already in use:**
```bash
node src/runner.js --server --port=3002
```

**Missing API key:**
Check `engine/.env` has all required values

**Website can't reach engine:**
Check `NEXT_PUBLIC_ENGINE_SERVER_URL` in website .env

---

**Summary**: One /engine folder, two modes (CLI + HTTP), shared code and configuration.
