# 🆓 Free Tools + GitHub Student Developer Pack

This guide shows you exactly where to get each service for FREE, including what the GitHub Student Pack gives you.

---

## 🎓 GitHub Student Developer Pack (FREE)

**Get it here:** https://education.github.com/pack

**Apply with:**
- Your student email (.edu address) OR
- Your GitHub account + school name

**Takes 2–3 minutes. Get 50+ free tools and services.**

Once approved, you'll get:

| Tool | Value | How to Claim |
|------|-------|-------------|
| **Apollo.io** | $100–500 credits | Click "Get offer" on pack page → complete signup |
| **GitHub Copilot** | $120/year | Activate in https://github.com/settings/copilots/limits |
| **Heroku** | $50/month credits | Add to your account after pack signup |
| **DigitalOcean** | $100 credits | Click link on pack page |
| **JetBrains IDE** | $150+ value | Free for students; download from jetbrains.com |
| **Figma** | Free Professional | Upgrade your account after pack signup |

**For JARVIS PRIME, we use:** Apollo.io ($100–500 credits for prospect sourcing)

---

## Step-by-Step: Getting Each Service FREE

### 1️⃣ Supabase (Database)

**Cost:** FREE (generous free tier)

**Sign up:**
1. Go to https://supabase.com
2. Click **"Sign up"**
3. Use GitHub account (faster)
4. Create first project
5. Done — database is free

**Limits (free tier):**
- 500 MB storage
- 50,000 API requests/month
- Enough for 100,000+ leads

**No credit card needed for free tier**

---

### 2️⃣ Groq API (AI)

**Cost:** FREE (14,400 requests/day)

**Sign up:**
1. Go to https://console.groq.com/keys
2. Click **"Sign up"**
3. Email or GitHub login
4. Verify email
5. Dashboard opens with free API key
6. Done — AI is free forever

**Limits (free tier):**
- 14,400 requests/day (unlimited days)
- Perfect for 50–100 emails/day

**No credit card needed**

---

### 3️⃣ Gmail SMTP (Email)

**Cost:** FREE (your Gmail account)

**Steps:**
1. Use your existing Gmail
2. Enable 2-factor authentication (Settings → Security)
3. Create an App Password (https://myaccount.google.com/apppasswords)
4. Copy the 16-character password
5. Use in agents `.env` file
6. Done — email sending is free

**Limits:**
- Send 100+ emails/day from your account
- Your sending reputation (don't spam!)

**No additional cost beyond Gmail subscription**

---

### 4️⃣ Apollo.io (Real Prospects) ⭐ GITHUB STUDENT PACK BENEFIT

**Cost:** Normally $500+/month | **You get:** $100–500 FREE credits (student)

**Steps:**
1. Go to https://education.github.com/pack
2. Look for **Apollo.io** in the benefits list
3. Click **"Get offer"** or **"Visit"**
4. Complete Apollo signup (takes 1–2 minutes)
5. Your student credits are automatically added
6. Go to Settings → API Keys
7. Copy your API key
8. Done

**Limits (student credits):**
- $100–500 depending on school
- ~50 email exports/day (varies by credit package)
- Enough to source 1,000+ prospects/month

**This is the ONLY paid service, but it's free via GitHub Student Pack**

---

### 5️⃣ Telegram Bot (Alerts)

**Cost:** FREE

**Steps:**
1. Download Telegram (free app or web.telegram.org)
2. Search for **@BotFather**
3. Send `/newbot`
4. Answer the questions (takes 2 min)
5. Get bot token
6. Start a chat with your bot
7. Get your chat ID
8. Use in `.env` file
9. Done — alerts are free forever

**Limits:**
- Unlimited messages
- Instant delivery
- Works on phone in real-time

**No cost**

---

## 🤔 Optional (Free Alternatives if Needed)

### Email: If you don't have Gmail

**Alternative 1: Resend (Free Tier)**
- Website: https://resend.com
- Free: 100 emails/day, verify one domain
- Better: Doesn't affect your Gmail reputation
- Setup: 10 minutes

**Alternative 2: SendGrid (Free Tier)**
- Website: https://sendgrid.com
- Free: 100 emails/day forever
- Setup: 15 minutes

### AI: If Groq limits aren't enough

**OpenAI as Fallback**
- Website: https://openai.com/api
- Free: $5 trial credit (expires after 3 months)
- Cost after: $0.002 per 1,000 tokens (cheap)
- Our code automatically falls back to OpenAI if Groq is unavailable

### Prospects: If Apollo credits run out

**Manual CSV Method**
- Use `build-prospect-list.js` to generate 500 prospects locally
- Find contacts manually on LinkedIn Sales Navigator (free tier)
- Paste into CSV
- Run: `npm run source -- --csv prospects.csv`
- Free but slower

---

## 💰 Total Cost Breakdown

| Service | Cost | Duration | Why Free |
|---------|------|----------|----------|
| Supabase | $0 | Forever | Free tier is generous |
| Groq AI | $0 | Forever | Free API tier |
| Gmail | $0 | Forever | Your existing account |
| Apollo | $0 (via GitHub Pack) | While student | GitHub benefit |
| Telegram | $0 | Forever | Free service |
| **TOTAL** | **$0** | **Forever** | **100% free** |

---

## ⚠️ Important Notes

1. **Apollo credits require GitHub Student Pack**
   - Apply at https://education.github.com/pack
   - Takes 2–3 minutes
   - Approved usually within hours

2. **Don't email the fake prospects from `build-prospect-list.js`**
   - Those are randomly generated names/emails
   - They will bounce and damage your sending domain reputation
   - Use only **real Apollo-sourced contacts** via `npm run source`

3. **Gmail reputation is important**
   - Start slow (10–20 emails/day first week)
   - Watch bounce rates
   - Don't spam — quality over quantity

4. **Each service can be swapped**
   - Groq → OpenAI, Claude, etc.
   - Gmail → Resend, SendGrid, etc.
   - Apollo → Manual LinkedIn export, CSV import
   - All configured in `.env` file

---

## ✅ Verification Checklist

After setup, verify each service:

**Supabase:**
```bash
curl -H "Authorization: Bearer YOUR_KEY" \
  "https://YOUR-PROJECT.supabase.co/rest/v1/leads?limit=1"
```
Should return JSON (not error)

**Groq:**
```bash
curl "https://api.groq.com/openai/v1/models" \
  -H "Authorization: Bearer YOUR_KEY"
```
Should return model list

**Gmail:**
```bash
npm test
```
Should show "✓ Gmail configured" or no error

**Apollo:**
```bash
npm run source
```
Should find and import prospects

**Telegram:**
```bash
curl -X POST "https://api.telegram.org/bot YOUR_TOKEN/sendMessage" \
  -d '{"chat_id":"YOUR_ID","text":"Test"}'
```
Check Telegram app for message

---

## 🎯 When Limits Hit (Upgrade Path)

**If you outgrow free tiers:**

| Service | Free | Next Tier | Cost |
|---------|------|-----------|------|
| Supabase | 50K req/month | $25–100/month | Easy upgrade |
| Groq | 14,400 req/day | Paid API | $0.001 per API call |
| Apollo | Student: $100–500 | Professional | $499–1,000/month |
| Gmail | Unlimited | N/A | Stays free |
| Telegram | Unlimited | N/A | Stays free |

**Realistic timeline before needing upgrades: 3–6 months**

At that point, you've likely made money from the deals, so costs are justified.

---

## 🚀 Next Step

Once you have all 5 services configured in `.env`, run:
```bash
npm run test
```

If all tests pass, you're ready:
```bash
npm start
```

Your company is now live. Good luck! 🎉
