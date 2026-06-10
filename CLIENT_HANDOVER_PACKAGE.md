# 🚀 JARVIS PRIME — Complete Client Handover Package

## Welcome to Your AI Outbound System

This document contains everything you need to deploy and operate your JARVIS PRIME automation system. Follow the steps in order.

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [What You're Getting](#what-youre-getting)
3. [Setup Checklist](#setup-checklist)
4. [Account Setup Guide](#account-setup-guide)
5. [Database Setup](#database-setup)
6. [Environment Configuration](#environment-configuration)
7. [Running the System](#running-the-system)
8. [How Each Agent Works](#how-each-agent-works)
9. [Daily Operations](#daily-operations)
10. [Troubleshooting](#troubleshooting)
11. [Support](#support)

---

## 🎯 System Overview

JARVIS PRIME automates your entire outbound sales process:

```
┌─────────────────────────────────────────────────────────────────┐
│                    JARVIS PRIME SYSTEM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   LEAD SOURCES          AI AGENTS           OUTPUTS             │
│   ──────────────        ─────────────       ────────────        │
│                                                                 │
│   ┌─────────────┐      ┌─────────────┐     ┌─────────────┐     │
│   │   Website   │ ───▶ │  Inbound    │ ──▶ │ Auto Reply  │     │
│   │   Form      │      │  Agent      │     │ Email Sent  │     │
│   └─────────────┘      └─────────────┘     └─────────────┘     │
│                              │                   │              │
│   ┌─────────────┐            ▼                   ▼              │
│   │  LinkedIn   │      ┌─────────────┐     ┌─────────────┐     │
│   │  Inbound    │ ───▶ │ ICP Scorer  │ ──▶ │  Telegram   │     │
│   └─────────────┘      │  (0-25)     │     │   Alert     │     │
│                        └─────────────┘     └─────────────┘     │
│   ┌─────────────┐            │                   │              │
│   │   Apollo    │            ▼                   ▼              │
│   │  Prospects  │ ───▶ ┌─────────────┐     ┌─────────────┐     │
│   └─────────────┘      │  Follow-up  │ ──▶ │  Meeting    │     │
│                        │   Agent     │     │  Booked     │     │
│                        └─────────────┘     └─────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Result:** 50-100 qualified leads → 8-12 discovery calls → 1-2 closed deals per month

---

## 📦 What You're Getting

### 1. Live Website
- **URL:** https://jarvisprime.me
- **Features:** Premium landing page, Calendly booking, lead capture form
- **Stack:** Next.js, Tailwind CSS, Framer Motion, Vercel hosting

### 2. AI Automation Agents

| Agent | Function | Schedule |
|-------|----------|----------|
| **Inbound Agent** | Responds to new leads within 15 min | Every 15 minutes |
| **Daily Outreach** | Sends follow-up sequences | 9 AM IST daily |
| **Prospect Builder** | Builds qualified prospect lists | On-demand |
| **ICP Scorer** | Scores leads 0-25 against ICP | Runs per lead |

### 3. Database Schema
- 8 tables for complete CRM functionality
- Lead tracking, outreach logging, deal pipeline
- Daily metrics and reporting

### 4. Documentation
- Setup guides, video scripts, playbooks
- Over 200 pages of strategic content

---

## ✅ Setup Checklist

Complete these in order:

### Phase 1: Accounts (30 minutes)
- [ ] Create Supabase account (free) — https://supabase.com
- [ ] Create OpenAI account — https://platform.openai.com
- [ ] Create Resend account (free) — https://resend.com
- [ ] Create Telegram bot — Message @BotFather
- [ ] (Optional) Create Apollo.io account — https://apollo.io

### Phase 2: Configuration (30 minutes)
- [ ] Run database schema in Supabase
- [ ] Verify domain in Resend
- [ ] Get Telegram chat ID
- [ ] Fill in `.env` file

### Phase 3: Launch (15 minutes)
- [ ] Install dependencies: `npm install`
- [ ] Test agents: `npm run test`
- [ ] Start scheduler: `npm run scheduler`
- [ ] Verify Telegram alerts working

---

## 🔧 Account Setup Guide

### 1. Supabase (Database)

1. Go to https://supabase.com → Sign up (free)
2. Click "New Project"
3. Name it: `jarvis-prime`
4. Set a secure database password (save this!)
5. Region: Choose closest (Mumbai for India)
6. Wait 2 minutes for provisioning
7. Go to **Settings → API**
8. Copy:
   - Project URL → `SUPABASE_URL`
   - anon public key → `SUPABASE_ANON_KEY`

### 2. OpenAI (AI)

1. Go to https://platform.openai.com → Sign up
2. Add payment method (required)
3. Go to **API Keys** → Create new key
4. Name it: `jarvis-prime`
5. Copy → `OPENAI_API_KEY`
6. Add $10 credits to start (lasts ~1000 emails)

### 3. Resend (Email)

1. Go to https://resend.com → Sign up (free)
2. Go to **Domains** → Add your domain
3. Add DNS records as shown
4. Wait for verification (5-30 min)
5. Go to **API Keys** → Create key
6. Copy → `RESEND_API_KEY`
7. Set `RESEND_FROM_EMAIL=hello@yourdomain.com`


### 4. Telegram (Alerts)

1. Open Telegram → Search @BotFather
2. Send `/newbot`
3. Name it: `JARVIS PRIME Alerts`
4. Username: `jarvisprime_alerts_bot`
5. Copy token → `TELEGRAM_BOT_TOKEN`
6. Start a chat with your bot
7. Visit: `https://api.telegram.org/bot<TOKEN>/getUpdates`
8. Find `chat.id` → `TELEGRAM_CHAT_ID`

### 5. Calendly (Booking)

1. Go to https://calendly.com → Sign up (free)
2. Create 30-min event: "Free Strategy Call"
3. Copy link → `FOUNDER_CALENDLY`

---

## 🗄️ Database Setup

### Run the Schema

1. Open Supabase → Your Project → **SQL Editor**
2. Open file: `/agents/schema.sql`
3. Copy entire contents
4. Paste in SQL Editor
5. Click **Run**
6. Verify: You should see 8 tables created

### Tables Created:

| Table | Purpose |
|-------|---------|
| `leads` | All incoming leads |
| `outreach_log` | Every email/message sent |
| `meetings` | Booked calls |
| `deals` | Sales pipeline |
| `prospects` | Outbound prospect lists |
| `campaigns` | Campaign management |
| `email_templates` | Reusable templates |
| `daily_metrics` | Daily reporting |

---

## ⚙️ Environment Configuration

### Create Your .env File

```bash
cd agents
cp .env.example .env
```

### Fill In Values

```env
# SUPABASE
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUz...

# OPENAI
OPENAI_API_KEY=sk-xxxxx

# RESEND
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=hello@jarvisprime.me

# TELEGRAM
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
TELEGRAM_CHAT_ID=123456789

# FOUNDER INFO
FOUNDER_NAME=Anuj
FOUNDER_CALENDLY=https://calendly.com/jarvis-prime/30min
```

---

## 🚀 Running the System

### Install Dependencies

```bash
cd agents
npm install
```

### Test Individual Agents

```bash
# Test inbound agent
npm run inbound

# Test daily outreach
npm run outreach

# Test prospect builder
npm run prospects
```

### Start Scheduler (Runs Forever)

```bash
npm run scheduler
```

### Run with PM2 (Recommended for Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start scheduler
pm2 start src/scheduler.js --name jarvis-scheduler

# View logs
pm2 logs jarvis-scheduler

# Auto-restart on reboot
pm2 startup
pm2 save
```


---

## 🤖 How Each Agent Works

### 1. Inbound Agent (`inbound-agent.js`)

**Runs:** Every 15 minutes

**Process:**
```
New Lead Submitted
      ↓
Fetch from Supabase (status = "new")
      ↓
Score Against ICP (0-25 scale)
      ↓
┌─────────────────────────────────────┐
│ Score < 15: Mark as "closed_lost"   │
│ Score 15-19: Mark as "contacted"    │
│ Score 20+: Mark as "qualified" 🔥   │
└─────────────────────────────────────┘
      ↓
AI Classifies Intent
      ↓
AI Drafts Personalized Reply
      ↓
Send via Resend
      ↓
Log in outreach_log
      ↓
If HOT → Send Telegram Alert
```

### 2. ICP Scorer (`icp-scorer.js`)

**Scoring Breakdown (0-25 points):**

| Factor | Points | Details |
|--------|--------|---------|
| Revenue Tier | 0-10 | 0-1L=2, 1-5L=5, 5-20L=8, 20L+=10 |
| Keyword Relevance | 0-8 | 2 pts per matching keyword |
| Has Phone | 2 | Shows intent |
| Detailed Message | 2 | Message > 20 chars |
| Decision Maker | 3 | Title includes founder/CEO |

**Thresholds:**
- Score ≥ 15: Qualified → Goes to outreach
- Score ≥ 20: HOT → Founder follows up personally

**Disqualify Keywords:** student, college, intern, freelance, d2c, retail

### 3. Daily Outreach Agent (`daily-outreach.js`)

**Runs:** 9 AM IST daily

**Email Sequence:**
```
Day 0:  Initial reply (after form submission)
Day 2:  Follow-up #1 — "Did you see my last email?"
Day 5:  Follow-up #2 — Value-add tip
Day 9:  Follow-up #3 — Breakup style
Day 14: Follow-up #4 — Final attempt
```

**Logic:**
- Skips leads who already replied
- Checks days since last contact
- AI generates each follow-up
- Marks cold after sequence complete

### 4. Prospect Builder (`prospect-builder.js`)

**Runs:** On-demand

**Sources:**
- Apollo.io API (if configured)
- CSV import (manual upload)

**Process:**
1. Fetch prospects from source
2. Score each against ICP
3. Filter (only score ≥ 12)
4. Insert into `prospects` table

---

## 📅 Daily Operations

### Your Morning Checklist (5 min)

1. **Check Telegram** — Any hot leads overnight?
2. **Check Supabase** — Dashboard → leads table
3. **Review** — Any meetings booked?

### Your Evening Checklist (5 min)

1. **Check Telegram** — Daily summary at 6 PM
2. **Review metrics** — Opens, replies, meetings
3. **Follow up** — Personally call any hot leads

### Weekly Tasks (30 min)

1. **Monday:** Add new prospects to list
2. **Wednesday:** Review email templates, tweak if needed
3. **Friday:** Check win/loss, adjust ICP if needed

---

## 🛠️ Troubleshooting

### Agent Not Running?

```bash
# Check if scheduler is running
pm2 status

# Restart if needed
pm2 restart jarvis-scheduler

# Check logs
pm2 logs jarvis-scheduler --lines 50
```

### Emails Not Sending?

1. Check Resend dashboard for errors
2. Verify domain is still verified
3. Check `RESEND_API_KEY` is correct
4. Check Resend rate limits

### No Telegram Alerts?

1. Message your bot first (required!)
2. Verify `TELEGRAM_CHAT_ID` is correct
3. Test: `curl "https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>&text=Test"`

### Database Connection Failed?

1. Check Supabase project is active
2. Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY`
3. Check Supabase dashboard for errors

---

## 📞 Support

**For technical issues:**
- Email: support@jarvisprime.me
- WhatsApp: +91-XXXXXXXXXX

**For strategy questions:**
- Book a call: https://calendly.com/jarvis-prime/30min

---

## 🎉 You're Ready!

Your JARVIS PRIME system is now set up and running. Here's what to expect:

**Week 1:** System learns your ICP, sends first emails
**Week 2-4:** Leads start responding, meetings get booked
**Month 2:** Full pipeline building, 8-12 calls/month
**Month 3+:** Consistent flow of qualified opportunities

**Remember:** The system works 24/7. You just need to show up for calls and close deals.

Welcome to automated outbound! 🚀
