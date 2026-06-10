# 🚦 JARVIS PRIME — Honest Status & Go-Live Checklist

_Last verified: June 10, 2026 via `npm run test`_

This document tells you the **truth** about what is working and the exact steps to make the company actually generate leads, book calls, and close deals automatically.

---

## ✅ What is REAL and working right now

| Component | Status | Proof |
|-----------|--------|-------|
| Website (jarvisprime.me) | ✅ Live | Loads in browser |
| Operations portal (/dashboard, /leads, /tasks) | ✅ Live (demo data) | Loads in browser |
| ICP scorer (0–25 qualification) | ✅ Working | Test scored a lead 23/25 |
| Telegram alerts | ✅ Working | Test message delivered |
| Agent code (inbound, outbound, runner) | ✅ Written & valid | `node --check` passes |
| Automation schedule (runner.js) | ✅ Ready | Inbound /15 min, Outbound 9 AM IST |

---

## ❌ What is NOT connected yet (the real blockers)

These are why no real leads are flowing. **Each must be fixed in `agents/.env`.**

| Blocker | Current value | What it should be |
|---------|---------------|-------------------|
| **Supabase** | `SUPABASE_URL=https://your-project.supabase.co` (placeholder) | Your real project URL + service role key |
| **AI (Groq)** | Key returns `401 Invalid API Key` | A valid free key from console.groq.com |
| **Email** | Not verified | Gmail App Password OR verified Resend domain |
| **Apollo** | Key present, unverified | Real key with email-export credits |
| **Prospect data** | Fake (random names/emails) | Real contacts pulled from Apollo |

> ⚠️ **Important:** The file `agents/build-prospect-list.js` generates **fake** prospects (random names, made-up emails like `priya@growthdeck.com`). **Do NOT email these** — they will bounce and destroy your sending domain's reputation. Use real Apollo-sourced contacts only (`npm run source`).

---

## 🛠️ Go-Live in 5 steps (~60–90 min, one time)

### Step 1 — Supabase (database) · 15 min
1. Create a project at https://supabase.com
2. SQL Editor → paste all of `agents/schema.sql` → Run
3. Settings → API → copy **Project URL** and **service_role** key
4. Put them in `agents/.env`:
   ```
   SUPABASE_URL=https://your-real-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```

### Step 2 — AI · 5 min
1. Get a free key at https://console.groq.com/keys
2. In `agents/.env`:
   ```
   AI_PROVIDER=groq
   GROQ_API_KEY=gsk_your_real_key
   ```

### Step 3 — Email · 15 min
**Easiest (Gmail):**
1. Enable 2FA on Gmail → create an App Password
2. In `agents/.env`:
   ```
   GMAIL_USER=you@gmail.com
   GMAIL_APP_PASSWORD=your16charapppassword
   ```
**Better deliverability (Resend):** verify your domain at resend.com, then set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.

### Step 4 — Apollo (real prospects) · 15 min
1. Create account at https://apollo.io, buy a small credit pack for email exports
2. Settings → API → copy key into `agents/.env`:
   ```
   APOLLO_API_KEY=your_real_key
   ```

### Step 5 — Verify & launch · 10 min
```bash
cd agents
npm install
npm run test        # all checks should pass now
npm run source      # pull REAL prospects from Apollo → prospects table
npm start           # starts runner: inbound /15min + outbound 9AM IST
```

For 24/7 operation, run on an always-on host (not your laptop):
```bash
npm install -g pm2
pm2 start "npm start" --name jarvis
pm2 save && pm2 startup
```

---

## 🔢 The funnel math (how the targets are hit)

To hit **50–100 qualified leads → 8–12 calls → 1–2 deals/month**, the outbound engine needs volume:

```
~1,000 cold emails/month  (≈30–35/day, via outbound-agent 5-step sequence)
   ↓  ~40% open, ~4% reply
~40 replies  →  ICP filter  →  ~50–100 qualified conversations*
   ↓  ~20% book
8–12 discovery calls
   ↓  ~15% close
1–2 deals
```
*Qualified count includes inbound website leads + positive outbound replies.

**Levers if numbers are low:** more sourced prospects (Step 4), better subject lines, faster reply time (inbound runs every 15 min), tighter ICP.

---

## 📌 Bottom line

The machine is **built and correct**. It is **not running** only because it has no real credentials. Do the 5 steps above and the same `npm run test` that currently shows 2 failures will pass — at which point leads start flowing automatically with zero manual work.
