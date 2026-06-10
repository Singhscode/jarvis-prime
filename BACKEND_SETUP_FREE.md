# 🚀 JARVIS PRIME Backend Setup — Free + GitHub Student Kit

**Total time: ~2 hours (one-time setup)**  
**Cost: $0 (using free tiers + student benefits)**

---

## 📋 Prerequisites Check

Before starting, confirm you have:
- [ ] GitHub Student Developer Pack (get free at https://education.github.com/pack)
- [ ] A macOS/Linux terminal
- [ ] Internet connection
- [ ] This folder: `/Users/anujsingh/Jarvis ai company/agents/`

If you don't have the GitHub Student Pack, apply NOW (2-3 minutes) → come back here.

---

# STEP 1: Set Up Supabase Database (FREE)

**Time: 20 minutes**  
**What it does:** Stores all leads, prospects, outreach logs, meetings, deals.

### 1a. Create Supabase Project

1. Go to https://supabase.com
2. Sign up with GitHub (easiest)
3. Click **"New Project"**
4. Fill in:
   - Project name: `jarvis-prime`
   - Database password: create a strong one (save it)
   - Region: **Singapore** (closest to India)
5. Click **"Create new project"** → wait 2–3 minutes

### 1b. Run Database Schema

1. In Supabase, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Open file: `/Users/anujsingh/Jarvis ai company/agents/schema.sql`
4. Copy entire contents
5. Paste into Supabase SQL Editor
6. Click **"Run"** (green button)
7. Wait for success ✓

### 1c. Get Your Credentials

1. Go to **Settings** → **API** (left sidebar)
2. Copy these two values:
   - **Project URL** (looks like `https://YOUR-ID.supabase.co`)
   - **service_role secret** (scroll down, labeled "service_role") — **NOT** the anon key

3. Save both somewhere safe (you'll use in Step 5)

✅ **Done**: Your database is live and tables are created.

---

# STEP 2: AI — Groq (FREE, 14,400 requests/day)

**Time: 5 minutes**  
**What it does:** Generates personalized emails using AI (free alternative to OpenAI).

### 2a. Get Groq API Key

1. Go to https://console.groq.com/keys
2. Sign up with email/GitHub
3. Click **"Create API Key"**
4. Copy it (looks like `gsk_xxxxxxxxxxxx`)
5. Save it

✅ **Done**: You have unlimited free AI for email drafting.

---

# STEP 3: Email — Gmail SMTP (FREE, via your email)

**Time: 15 minutes**  
**What it does:** Actually sends emails to prospects.

### 3a. Enable Gmail App Password

1. Go to https://myaccount.google.com/apppasswords
   - If it asks to sign in: use your Gmail login
   - If it says "App passwords not available": you need to enable 2-factor authentication first
2. Device: **Mail** | OS: **Mac**
3. Click **"Generate"**
4. Copy the 16-character password (ignore spaces)
5. Save it

### 3b. Test Gmail Connection

Open terminal:
```bash
cd /Users/anujsingh/Jarvis\ ai\ company/agents
cat > test-email.js << 'EOF'
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "YOUR_EMAIL@gmail.com",
    pass: "YOUR_16_CHAR_PASSWORD"
  }
});

transporter.sendMail({
  from: "YOUR_EMAIL@gmail.com",
  to: "YOUR_EMAIL@gmail.com",
  subject: "Test",
  html: "<p>If you see this, Gmail is working!</p>"
}, (err, info) => {
  if (err) console.error("Failed:", err.message);
  else console.log("Success:", info.response);
  process.exit(0);
});
EOF
```

Edit the file:
- Replace `YOUR_EMAIL@gmail.com` (2 places) with your actual Gmail
- Replace `YOUR_16_CHAR_PASSWORD` with the app password from Step 3a

Run:
```bash
npm install nodemailer
node test-email.js
```

If it says "Success", email works ✅

✅ **Done**: Emails can now be sent from your Gmail.

---

# STEP 4: Apollo.io Prospect Data (FREE TIER + Student Kit)

**Time: 20 minutes**  
**What it does:** Sources real B2B prospects (founders, sales leaders, etc.).

### 4a. GitHub Student Kit → Apollo.io Credits

1. Go to https://education.github.com/pack (in Student Benefits section)
2. Find **Apollo.io** → click **"Get offer"** or **"Visit"**
3. It will show free credits for students (typically $100–500)
4. Complete setup

### 4b. Create Apollo API Key

1. Log in to https://app.apollo.io
2. Go to **Settings** (gear icon, bottom left)
3. Go to **Integrations** → **API**
4. Copy your **API key**
5. Save it

### 4c. Test Apollo Connection

```bash
cd /Users/anujsingh/Jarvis\ ai\ company/agents
cat > test-apollo.js << 'EOF'
const API_KEY = "YOUR_APOLLO_KEY";
const response = await fetch("https://api.apollo.io/v1/mixed_people/search", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Api-Key": API_KEY
  },
  body: JSON.stringify({
    person_titles: ["Founder", "CEO"],
    person_locations: ["India"],
    organization_num_employees_ranges: ["5,100"],
    q_organization_keyword_tags: ["Marketing Agency"],
    page: 1,
    per_page: 5
  })
});

const data = await response.json();
if (data.people) {
  console.log(`Found ${data.people.length} prospects`);
  console.log(data.people[0]);
} else {
  console.log("Error:", data);
}
EOF
```

Edit: replace `YOUR_APOLLO_KEY` with your key.

Run:
```bash
node test-apollo.js
```

If it shows prospects with names/emails, Apollo works ✅

✅ **Done**: Real prospects can now be sourced.

---

# STEP 5: Telegram Alerts (FREE)

**Time: 10 minutes**  
**What it does:** Sends you instant phone notifications when hot leads come in.

### 5a. Create Telegram Bot

1. Open Telegram (app or web: web.telegram.org)
2. Search for **@BotFather**
3. Send: `/newbot`
4. Answer the questions:
   - Name: `JARVIS PRIME Alerts`
   - Username: `jarvisprime_alerts_bot`
5. Copy the token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz...`)
6. Save it

### 5b. Get Your Chat ID

1. Search for your new bot in Telegram: `@jarvisprime_alerts_bot`
2. Click **Start**
3. In terminal, run:
   ```bash
   curl "https://api.telegram.org/bot123456789:ABCdefGHIjklMNOpqrsTUVwxyz/getUpdates"
   ```
   (Replace the token with your actual token from 5a)
4. Look for `"chat":{"id":` → that number is your **chat ID**
5. Save it

### 5c. Test Telegram

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"chat_id":"YOUR_CHAT_ID","text":"Test message from JARVIS"}' \
  "https://api.telegram.org/botYOUR_TOKEN/sendMessage"
```

Replace `YOUR_CHAT_ID` and `YOUR_TOKEN`.

Run in terminal. Check Telegram app — you should get a message ✅

✅ **Done**: Hot lead alerts will come to your phone in real-time.

---

# STEP 6: Set Up Your Environment File

**Time: 5 minutes**  
**What it does:** Tells the agents where to find all the services.

### 6a. Create .env File

```bash
cd /Users/anujsingh/Jarvis\ ai\ company/agents
cp .env.example .env
```

### 6b. Fill in .env

Open `.env` in a text editor and fill in these values:

```env
# SUPABASE (from Step 1c)
SUPABASE_URL=https://YOUR-ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ... (the long service_role key)

# GROQ AI (from Step 2a)
AI_PROVIDER=groq
GROQ_API_KEY=gsk_...

# GMAIL (from Step 3a)
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx (16 chars)

# APOLLO (from Step 4b)
APOLLO_API_KEY=...

# TELEGRAM (from Step 5a & 5b)
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
TELEGRAM_CHAT_ID=123456789

# FOUNDER INFO
FOUNDER_NAME=Anuj Singh
FOUNDER_EMAIL=your-email@gmail.com
FOUNDER_CALENDLY=https://calendly.com/your-username/30min
```

Save the file.

✅ **Done**: Your backend is now configured.

---

# STEP 7: Install Dependencies & Test

**Time: 10 minutes**  
**What it does:** Verifies everything is connected and working.

### 7a. Install Node Packages

```bash
cd /Users/anujsingh/Jarvis\ ai\ company/agents
npm install
```

### 7b. Run System Test

```bash
npm run test
```

You should see:
```
=== JARVIS PRIME — Live System Test ===

1. Environment variables
  ✓ SUPABASE_URL set
  ✓ SUPABASE_SERVICE_ROLE_KEY set
  ...

3. Supabase connection
  ✓ Supabase connected, 'leads' table reachable

4. AI (Groq/OpenAI)
  ✓ AI responded: "OK"

5. Telegram
  ✓ Telegram message sent

=== Result: 10 passed, 0 failed ===
```

If all pass ✅ → **Backend is working!**

If any fail → error message tells you which service needs fixing (re-check that step).

---

# STEP 8: Start the Automation

**Time: 1 minute**  
**What it does:** Launches the live agents (inbound every 15 min, outbound daily at 9 AM).

### 8a. Start Agents

```bash
npm start
```

You should see:
```
╔═══════════════════════════════════════╗
║   JARVIS PRIME — Agent System Online  ║
╚═══════════════════════════════════════╝
Started: [timestamp]

✓ Inbound agent: every 15 minutes
✓ Outbound agent: daily at 9:00 AM IST
✓ Waiting for leads...
```

Let it run. It will:
- Check for new website leads every 15 minutes
- Send outbound emails daily at 9 AM
- Alert you on Telegram when hot leads come in

### 8b. Keep It Running 24/7

To run even after you close terminal, use PM2:

```bash
npm install -g pm2
pm2 start "npm start" --name jarvis-prime
pm2 save
pm2 startup
```

Then you can close terminal — agents keep running.

---

# STEP 9: Test with Real Prospects

**Time: 15 minutes**  
**What it does:** Pulls real prospects from Apollo and starts outreach.

### 9a. Source Prospects from Apollo

```bash
npm run source
```

This will:
1. Query Apollo.io for 100 B2B marketing agency founders/CEOs in India
2. Score each one (0–25 scale)
3. Filter qualified ones (score ≥ 12)
4. Add them to Supabase `prospects` table
5. Mark them as "ready" for outbound

Output will show how many were qualified.

### 9b. Monitor in Portal

1. Go to https://jarvisprime.me/dashboard
2. You'll see the metrics updating
3. Leads will appear in https://jarvisprime.me/leads as they come in

✅ **Done**: Real automation is now live!

---

# 🎯 What Happens Now (Automated)

**Every 15 minutes:**
- ✓ Check for new website leads
- ✓ Score against ICP
- ✓ Send personalized reply email (AI-generated)
- ✓ Alert you on Telegram if hot (score 20+)

**Every day at 9 AM IST:**
- ✓ Find prospects marked "ready"
- ✓ Generate personalized cold email
- ✓ Send 30–40 emails (rate-limited)
- ✓ Log all activity

**Expected monthly results:**
- 1,000+ cold emails → 40+ replies → 50–100 qualified leads
- 8–12 discovery calls booked
- 1–2 deals closed

---

# 📊 Free Tier Limits (and how you stay within them)

| Service | Free Limit | Usage | Status |
|---------|-----------|-------|--------|
| **Supabase** | Unlimited rows, 50K req/month | ~1K req/month | ✅ Safe |
| **Groq** | 14,400 requests/day | ~50/day | ✅ Safe |
| **Gmail** | Unlimited (your own account) | 100 emails/day | ✅ Safe |
| **Apollo** | Student kit (typically $100–500) | 50 emails exported/day | ✅ Safe |
| **Telegram** | Unlimited | 100 messages/day | ✅ Safe |

---

# 🆘 Troubleshooting

### "Test failed: Supabase connection"
- Check `SUPABASE_URL` doesn't have typos
- Verify you copied the full project URL
- Try: `curl SUPABASE_URL` in terminal (should not timeout)

### "Test failed: Groq API key invalid"
- Go to https://console.groq.com/keys and regenerate
- Make sure key starts with `gsk_`
- Update `.env` and run test again

### "Telegram message not received"
- Verify you clicked **Start** on your bot in Telegram
- Double-check chat ID is a number (no quotes)
- Try sending manually: `curl` command from Step 5c

### "Apollo returns no prospects"
- Check API key is correct
- Verify you have credits left (check Apollo dashboard)
- Try different search criteria: change "Marketing Agency" to "SaaS"

---

# ✅ Final Checklist

- [ ] Supabase project created + schema imported
- [ ] Groq API key obtained
- [ ] Gmail App Password generated
- [ ] Apollo.io access via GitHub Student Kit
- [ ] Telegram bot created + chat ID saved
- [ ] `.env` file filled with all credentials
- [ ] `npm run test` passes (all 10+ checks)
- [ ] `npm start` runs without errors
- [ ] Prospects sourced from Apollo (`npm run source`)
- [ ] First email sent (check your email inbox)

When all boxes are checked: **Your company is live and generating leads automatically!** 🚀

---

# 📞 Support

If you get stuck on any step:
1. Check the troubleshooting section above
2. Run `npm run test` to see which service is failing
3. Re-read that specific step carefully
4. The error message usually tells you exactly what's wrong

Good luck! Your backend is about to come alive. 🎉
