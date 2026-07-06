# 🚀 JARVIS PRIME — Employee Onboarding Guide

**Founder Meeting Briefing Document**

---

## 📋 Table of Contents

1. [Company Overview](#company-overview)
2. [Product Architecture](#product-architecture)
3. [Core System Scripts](#core-system-scripts)
4. [Data Flow & Logic](#data-flow--logic)
5. [n8n Workflow Models](#n8n-workflow-models)
6. [API Documentation](#api-documentation)
7. [Technology Stack](#technology-stack)
8. [Getting Started](#getting-started)

---

## 🏢 Company Overview

### JARVIS PRIME — B2B Sales Automation Engine

**Mission**: Automate B2B outbound prospecting, personalized email campaigns, and lead qualification using AI.

**Core Business**: 
- Agencies hire JARVIS PRIME to automatically find, enrich, and reach out to prospects
- AI personalizes emails based on prospect data
- System tracks replies, classifies intent, and schedules follow-ups
- Founders get qualified leads with meetings booked

**Key Features**:
- 🎯 Prospect sourcing from Apollo & Hunter
- 🧠 AI-powered scoring and personalization
- 📧 Multi-step email sequences
- 💬 Reply handling and classification
- 📊 Campaign analytics and ROI tracking

---

## 🏗️ Product Architecture

### System Layers

```
┌─────────────────────────────────────────────┐
│         CLIENT WEBSITE (Next.js)             │  ← Landing page, booking, dashboards
│         /apps/site/                         │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│    API GATEWAY / AUTOMATION SERVER           │
│    /engine/src/runner.js (port 3001)        │  ← HTTP API with authentication
└────────────────┬────────────────────────────┘
                 │
     ┌───────────┴───────────┐
     │                       │
┌────▼───────┐      ┌───────▼─────┐
│  Agents    │      │  Database   │
│  (AI Logic)│      │  (Supabase) │
└────────────┘      └─────────────┘
     ▲                       ▲
     │                       │
┌────┴───────┐      ┌───────┴─────┐
│ Enrichment │      │  Prospects  │
│ Outbound   │      │  Messages   │
│ Inbound    │      │  Events     │
└────────────┘      └─────────────┘
```

### Dual-Mode Architecture

**CLI Mode** (Scheduled Jobs):
```
npm run source      → Source & score prospects
npm run outbound    → Send email sequences
npm run doctor      → Health check
```

**HTTP Mode** (API Server):
```
npm run server      → Start HTTP API on port 3001
POST /api/enrichment
POST /api/outreach
POST /api/campaigns
```

---

## 💻 Core System Scripts

### 1. **engine/src/runner.js** — Main Entry Point

**Purpose**: Orchestrates CLI and HTTP server modes

**CLI Mode Example**:
```bash
node src/runner.js                    # Full pipeline once
node src/runner.js --task=source      # Just source & score
node src/runner.js --task=outbound    # Just send emails
node src/runner.js --doctor           # Config report
```

**HTTP Mode Example**:
```bash
node src/runner.js --server           # Start API server on 3001
node src/runner.js --server --port=3000  # Custom port
```

**Key Functions**:
- `banner()` — Show startup info
- `doctor()` — Check provider credentials
- `taskSource()` — Run source & score
- `taskOutbound()` — Send outreach
- `startHttpServer()` — Start Express API

---

### 2. **engine/src/agents/outbound-agent.js** — Campaign Logic

**Purpose**: Source prospects, score them, send personalized emails

**Main Functions**:

```javascript
sourceAndScore(client)
  → Fetch prospects from Apollo
  → Score by ICP match
  → Save to database
  → Return qualified leads

runOutreach(client)
  → Get prospects due for outreach
  → Generate personalized email
  → Send via Resend
  → Log to database
  → Schedule follow-up
```

**Example Flow**:
```
1. Get all prospects with stage="queued"
2. Filter by daily limit (e.g., 50/day)
3. For each prospect:
   - Generate AI-personalized subject & body
   - Send via Resend email API
   - Record message in DB
   - Schedule next step (follow-up in 3 days)
4. Update prospect stage to "contacted"
```

---

### 3. **engine/src/agents/inbound-agent.js** — Reply Handling

**Purpose**: Process incoming replies, classify intent, update pipeline

**Main Functions**:

```javascript
handleReply(prospect, replyText, client)
  → Classify reply intent (INTERESTED, NOT_INTERESTED, BUSY)
  → Update prospect stage
  → Log event
  → Schedule follow-up if needed
  → Return classification
```

**Classification Logic**:
```
Keywords: ["sure", "yes", "interested", "send"] → INTERESTED
Keywords: ["no", "not", "unsubscribe"] → NOT_INTERESTED
Default → NEEDS_REVIEW or BUSY
```

---

### 4. **engine/src/lib/db.js** — Database Abstraction

**Purpose**: Handle data persistence (Supabase or in-memory)

**Key Functions**:

```javascript
listActiveClients()          → Get all active clients
getProspectsByStage(stage)   → Filter by pipeline stage
insertProspects(rows)        → Add new prospects
updateProspect(id, patch)    → Update prospect data
insertMessage(row)           → Log outreach email
insertEvent(row)             → Log opens, clicks, replies
countMessagesSentToday()     → Respect daily limits
isSuppressed(email)          → Check unsubscribe list
```

---

### 5. **engine/src/config.js** — Configuration

**Purpose**: Load settings from .env, manage secrets

**Key Variables**:
```javascript
config.dryRun                 // Safe mode (default: true)
config.fromEmail              // From address
config.dailyProspectLimit     // Max new prospects/day
config.dailySendLimit         // Max emails/day
config.automationSecret       // API auth token
config.supabaseUrl            // Database connection
config.resendApiKey           // Email provider key
config.apolloApiKey           // Prospect source key
```

---

## 🔄 Data Flow & Logic

### Complete Prospect Journey

```
STAGE 1: SOURCING
├─ Client defines ICP (job titles, industries, locations)
├─ System queries Apollo API for matching prospects
├─ 500+ prospects sourced
└─ Stage: "new"

STAGE 2: SCORING
├─ Each prospect scored 0-100
├─ Score = title match + industry match + keyword match
├─ Top 50 marked as "qualified"
├─ Marked with hot=true if score > 85
└─ Stage: stays "new" but qualified=true

STAGE 3: SEQUENCING
├─ Qualified prospects moved to "queued"
├─ Daily send limit enforced (50/day)
├─ First email sent
└─ Stage: "contacted"

STAGE 4: PERSONALIZATION (AI)
├─ Email subject: AI personalizes with prospect name
├─ Email body: Mentions their role, company, recent news
├─ Includes unique hook from their LinkedIn
└─ Sent via Resend email API

STAGE 5: TRACKING & REPLIES
├─ Email opens tracked via pixels
├─ Clicks tracked via unique links
├─ Replies captured via webhook
├─ Stage: "replied"
└─ Inbound agent classifies reply

STAGE 6: QUALIFICATION
├─ Interested? → Schedule meeting
├─ Not interested? → Move to suppression list
├─ Needs follow-up? → Queue next email in sequence
├─ No reply? → Send follow-up (day 3)
└─ Final stage: "booked" or "disqualified"
```

### Email Sequence Example

```
Day 1: Initial outreach
  Subject: Hi {first_name}, {company} is expanding to India 🎯
  Body: Personalized hook + value prop + CTA
  
Day 3: First follow-up (if no reply)
  Subject: Quick question about {company}'s plans
  Body: Different angle, social proof
  
Day 5: Second follow-up
  Subject: Last chance to connect
  Body: Urgency + case study
  
Day 7: Final touch
  Subject: Let's chat over coffee ☕
  Body: Personal message from founder
```

---

## 🔗 n8n Workflow Models

### Workflow 1: Daily Outreach Automation

**Trigger**: Every day at 9 AM

```
[Webhook Trigger] 
    ↓
[Check Daily Limit] (Have we sent <50 today?)
    ↓
[Get Due Prospects] (stage="queued" AND next_action_at <= now)
    ↓
[For Each Prospect]
    ├─ Generate AI Email (call OpenAI API)
    ├─ Send via Resend
    ├─ Record in Database
    └─ Update Prospect Stage
    ↓
[Send Slack Alert] (Sent 45 emails today)
```

**n8n Nodes**:
```
1. Trigger: Webhook (POST /outreach-trigger)
2. HTTP Request: GET /api/prospects?stage=queued
3. Loop: For Each Item
4. HTTP Request: POST /api/generate-email
5. HTTP Request: POST /api/send-email
6. Supabase: Insert message record
7. HTTP Request: PATCH /api/prospect/{id}
8. Slack: Send notification
```

---

### Workflow 2: Reply Processing Pipeline

**Trigger**: Email webhook (when reply arrives)

```
[Email Webhook] (New reply received)
    ↓
[Parse Email] (Extract sender, subject, body)
    ↓
[Find Prospect] (Match to prospect_id by email)
    ↓
[AI Classification] (Classify reply intent)
    ├─ INTERESTED → Create calendar meeting
    ├─ NOT_INTERESTED → Add to suppression list
    └─ NEEDS_REVIEW → Alert sales team
    ↓
[Update Prospect] (Stage = "replied")
    ↓
[Log Event] (Create event record)
    ↓
[Schedule Follow-up] (If INTERESTED, book meeting)
```

**n8n Nodes**:
```
1. Trigger: Webhook (POST /webhook/reply)
2. Set Variable: Extract email fields
3. HTTP Request: GET /api/prospect?email={email}
4. HTTP Request: POST /api/classify-reply
5. Conditional: IF classification == INTERESTED
   ├─ HTTP Request: POST /api/book-meeting
   ├─ Slack: Alert sales team
   └─ Calendar: Add to Google Calendar
6. Supabase: Update prospect stage
7. Supabase: Insert event
```

---

### Workflow 3: Campaign Performance Analytics

**Trigger**: Every day at 6 PM

```
[Trigger Daily] (6 PM)
    ↓
[Calculate Metrics]
    ├─ Total emails sent today
    ├─ Reply rate (replies / sent)
    ├─ Meeting booking rate
    ├─ Cost per qualified lead
    └─ ROI estimate
    ↓
[Generate Report]
    ├─ Create PDF dashboard
    ├─ Include top performers
    └─ Flag low-performing segments
    ↓
[Send to Clients]
    ├─ Email report
    ├─ Slack notification
    └─ Update web dashboard
```

**n8n Nodes**:
```
1. Trigger: Schedule (Daily 6 PM)
2. Supabase: Query messages (today)
3. Supabase: Query events (replies)
4. Set Variable: Calculate metrics
5. HTTP Request: POST /api/generate-report
6. Google Sheets: Log metrics
7. Email: Send to client
8. Slack: Send notification
```

---

### Workflow 4: Lead Enrichment Pipeline

**Trigger**: New prospect added

```
[Prospect Created Event]
    ↓
[Call Apollo API] (Get more data)
    ├─ Recent company news
    ├─ Tech stack
    ├─ Funding info
    └─ Employee count
    ↓
[Call Hunter API] (Get company emails)
    ├─ Email format
    ├─ Valid company domains
    └─ Email finder
    ↓
[AI Scoring] (Calculate ICP match)
    ├─ Title match vs ICP titles
    ├─ Industry match vs ICP industries
    └─ Location match vs ICP locations
    ↓
[Update Prospect] (Add enriched data + score)
    ↓
[Mark Qualified] (If score > 70)
```

**n8n Nodes**:
```
1. Trigger: Webhook (POST /prospect-created)
2. HTTP Request: GET apollo.io/api/v1/prospects?email={email}
3. Set Variable: Extract Apollo data
4. HTTP Request: GET hunter.io/v2/domain-search?domain={domain}
5. Set Variable: Calculate ICP score
6. Supabase: Update prospect (enriched data + score)
7. Conditional: IF score > 70
   └─ Set Field: qualified = true
8. Supabase: Mark as qualified
```

---

### Workflow 5: Weekly Performance Summary

**Trigger**: Every Monday 9 AM

```
[Weekly Report]
    ↓
[Query All Metrics]
    ├─ Prospects sourced
    ├─ Emails sent
    ├─ Replies received
    ├─ Meetings booked
    ├─ Revenue generated (if tracked)
    └─ Top performing campaigns
    ↓
[Create Visualizations]
    ├─ Charts in Google Sheets
    ├─ Dashboard update
    └─ Trends vs previous week
    ↓
[Send Reports]
    ├─ Email to all clients
    ├─ Slack to team
    └─ Post to website (private)
```

---

## 📡 API Documentation

### Base URL
```
http://localhost:3001
```

### Authentication
```
Header: x-automation-secret: {your-secret-key}
```

### Endpoints

#### 1. GET /health
**Purpose**: Health check  
**Auth**: None  
**Response**:
```json
{
  "status": "ok",
  "mode": "http",
  "dryRun": true,
  "uptime": 3600
}
```

#### 2. POST /api/enrichment
**Purpose**: Enrich prospect data  
**Auth**: Required  
**Request**:
```json
{
  "email": "john@company.com",
  "name": "John Smith"
}
```
**Response**:
```json
{
  "prospect_id": "p-123",
  "title": "CEO",
  "company": "TechCorp",
  "linkedin": "linkedin.com/in/john",
  "score": 85,
  "qualified": true
}
```

#### 3. POST /api/outreach
**Purpose**: Send outreach email  
**Auth**: Required  
**Request**:
```json
{
  "prospect_id": "p-123",
  "client_id": "c-1",
  "email_template": "initial_outreach"
}
```
**Response**:
```json
{
  "message_id": "m-456",
  "status": "sent",
  "email": "john@company.com",
  "sent_at": "2026-07-03T10:00:00Z"
}
```

#### 4. POST /api/campaigns
**Purpose**: Manage campaigns  
**Auth**: Required  
**Request**:
```json
{
  "action": "launch",
  "client_id": "c-1",
  "prospect_ids": ["p-1", "p-2", "p-3"],
  "template": "sequence_1"
}
```

---

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js + ES Modules
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Email**: Resend API
- **Data Sources**: Apollo, Hunter, Clearbit

### Frontend
- **Framework**: Next.js 14+
- **Language**: TypeScript/JavaScript
- **Styling**: Tailwind CSS
- **Auth**: NextAuth.js (optional)

### Infrastructure
- **Hosting**: Vercel (website), any Node.js host (engine)
- **Database**: Supabase (managed PostgreSQL)
- **Task Scheduler**: n8n or Cron jobs
- **Webhooks**: Resend (email events)

### AI/ML
- **LLM**: OpenAI GPT-4 (personalization)
- **Classification**: Intent recognition
- **Scoring**: Custom algorithm (ICP match)

---

## 🚀 Getting Started

### For New Employees

#### 1. **Development Setup**
```bash
# Clone repo
git clone <repo-url>
cd "Jarvis ai company"

# Install dependencies
cd engine && npm install
cd ../apps/site && npm install

# Setup .env
cp .env.example .env.local
# Add your API keys
```

#### 2. **Start Development**
```bash
# Terminal 1: Start engine API
cd engine
npm run server

# Terminal 2: Start website
cd apps/site
npm run dev

# Open browser
open http://localhost:3000 (website)
open http://localhost:3001/health (API health)
```

#### 3. **Run a Dry-Run Campaign**
```bash
cd engine
npm run source      # Source prospects
npm run outbound    # Send test emails (DRY_RUN=true, nothing actually sent)
npm run doctor      # Check config
```

#### 4. **Database Setup (if needed)**
```bash
# Create Supabase account
# Run SQL from engine/sql/schema.sql
# Set SUPABASE_URL and SUPABASE_KEY in .env
```

---

## 📊 Key Metrics

### What We Track
- **Outreach**: Emails sent, sequences active, daily limits
- **Engagement**: Opens, clicks, replies, bounce rate
- **Conversion**: Reply rate, meeting booking rate, qualified leads
- **Revenue**: Cost per lead, ROI, deal value

### Example Dashboard
```
Total Prospects: 1,200
├─ New: 300
├─ Contacted: 500
├─ Replied: 200
└─ Booked: 40

Daily Metrics:
├─ Emails Sent: 50
├─ Reply Rate: 22%
├─ Meetings Today: 3
└─ Estimated Value: $45K
```

---

## 🔐 Security & Compliance

### Data Protection
- ✅ DRY_RUN mode by default (safe)
- ✅ API keys in .env (not in code)
- ✅ Suppression list for unsubscribes
- ✅ Row-level security in Supabase

### Rate Limiting
- ✅ Daily prospect limit (default: 500)
- ✅ Daily send limit (default: 100)
- ✅ Per-client limits
- ✅ Hourly API rate limits

---

## 📞 Support & Escalation

### Common Issues

**Email not sending?**
- Check Resend API key
- Check DRY_RUN mode
- Check suppression list

**Prospect not sourcing?**
- Check Apollo API key
- Check ICP configuration
- Check daily limits

**Database errors?**
- Check Supabase connection
- Run migrations
- Check row-level security

### Contact
- Founder: Anuj Singh
- Tech Lead: [Your name]
- Support: support@jarvisai.io

---

## 🎯 Next Steps

1. **Week 1**: Understand system architecture & data flow
2. **Week 2**: Set up development environment
3. **Week 3**: Run first test campaign
4. **Week 4**: Customize for your first client

---

**Last Updated**: July 3, 2026  
**Version**: 1.0  
**Status**: Production Ready

