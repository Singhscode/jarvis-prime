# JARVIS PRIME — Production Setup Guide

**Status:** ✅ Ready for Production Configuration  
**Last Updated:** 27 May 2026

---

## 🎯 Quick Overview

Your JARVIS PRIME project is fully built and ready to run. You just need to configure the API keys and services. This guide will walk you through each step.

---

## 📋 Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] Supabase account (free tier)
- [ ] Groq account (free, 14,400 req/day) OR OpenAI account
- [ ] Resend account (free, 3000 emails/month)
- [ ] Telegram account (for bot alerts)
- [ ] Apollo.io account (optional, for lead scraping)
- [ ] Calendly account (for booking links)

---

## 🚀 Step-by-Step Setup

### Step 1: Supabase Setup (Required)

1. **Create Account**: Go to [supabase.com](https://supabase.com) and sign up (free)

2. **Create New Project**:
   - Click "New Project"
   - Choose your organization
   - Give it a name (e.g., "jarvis-prime")
   - Set a strong database password
   - Choose region (closest to your users)
   - Click "Create new project" (takes 2-3 minutes)

3. **Get API Keys**:
   - Go to Project Settings → API
   - Copy these values:
     - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
     - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)

4. **Create Database Tables**:
   - Go to SQL Editor → New Query
   - Copy and paste the contents of `business/supabase-schema.sql`
   - Click "Run" to execute
   - Verify tables were created: `leads` and `outreach_log`

5. **Update Environment Files**:

   **`agents/.env`**:
   ```env
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

   **`apps/site/.env.local`**:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

---

### Step 2: AI Provider Setup (Required)

#### Option A: Groq (FREE - Recommended)

1. **Create Account**: Go to [console.groq.com](https://console.groq.com) and sign up

2. **Get API Key**:
   - Go to API Keys
   - Click "Create API Key"
   - Copy the key (starts with `gsk_`)

3. **Update `agents/.env`**:
   ```env
   GROQ_API_KEY=gsk_your-key-here
   AI_PROVIDER=groq
   ```

#### Option B: OpenAI (Paid)

1. **Create Account**: Go to [platform.openai.com](https://platform.openai.com)

2. **Get API Key**:
   - Go to API Keys
   - Click "Create new secret key"
   - Copy the key (starts with `sk-`)

3. **Update `agents/.env`**:
   ```env
   OPENAI_API_KEY=sk-your-key-here
   AI_PROVIDER=openai
   ```

---

### Step 3: Email Setup (Required)

**Resend** (Free 3000 emails/month)

1. **Create Account**: Go to [resend.com](https://resend.com) and sign up

2. **Get API Key**:
   - Go to API Keys
   - Click "Create API Key"
   - Copy the key (starts with `re_`)

3. **Add Domain** (Optional but recommended):
   - Go to Domains
   - Add your domain (e.g., `jarvis-prime.in`)
   - Follow DNS verification steps

4. **Update `agents/.env`**:
   ```env
   RESEND_API_KEY=re_your-key-here
   RESEND_FROM_EMAIL=JARVIS PRIME <hello@jarvis-prime.in>
   ```

---

### Step 4: Telegram Bot Setup (Required for Alerts)

1. **Create Bot**:
   - Open Telegram and search for `@BotFather`
   - Send `/newbot`
   - Follow prompts to name your bot (e.g., "Jarvis Prime Alerts")
   - Copy the bot token (looks like `123456789:ABCdef...`)

2. **Get Chat ID**:
   - Send a message to your new bot
   - Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Look for `"chat":{"id":123456789,...}`
   - Copy the `id` number

3. **Update Both Environment Files**:

   **`agents/.env`**:
   ```env
   TELEGRAM_BOT_TOKEN=123456789:ABCdef...
   TELEGRAM_CHAT_ID=987654321
   ```

   **`apps/site/.env.local`**:
   ```env
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
   TELEGRAM_CHAT_ID=987654321
   ```

---

### Step 5: Apollo.io Setup (Optional - For Outbound Leads)

1. **Create Account**: Go to [apollo.io](https://www.apollo.io) and sign up

2. **Get API Key**:
   - Go to Settings → API Keys
   - Click "Generate API Key"
   - Copy the key

3. **Update `agents/.env`**:
   ```env
   APOLLO_API_KEY=your-apollo-api-key
   ```

---

### Step 6: Calendly Setup (Optional)

1. **Create Account**: Go to [calendly.com](https://calendly.com)

2. **Get Booking Link**:
   - Create an event type (e.g., "30 Min Strategy Call")
   - Copy the sharing link

3. **Update `agents/.env`**:
   ```env
   FOUNDER_CALENDLY=https://calendly.com/your-link
   ```

---

## 🔒 Security Notes

### .gitignore Configuration

Make sure these files are in `.gitignore`:
```
.env
.env.local
*.local
```

### Environment Variable Security

- **Never commit** `.env` or `.env.local` files to Git
- **Keep service role keys secret** - they have full database access
- **Use different keys** for development and production
- **Rotate keys regularly** for security

---

## 🧪 Testing Your Setup

### 1. Test Site (Port 3000)

```bash
npm run dev:site
```

Visit `http://localhost:3000` and:
- Check if page loads
- Test the contact form
- Verify Telegram alert arrives when form is submitted

### 2. Test Dashboard (Port 3001)

```bash
npm run dev:dashboard
```

Visit `http://localhost:3001` and:
- Check if dashboard loads
- Verify it can connect to Supabase

### 3. Test Agents

```bash
cd agents && npm run dev
```

You should see:
```
╔═══════════════════════════════════════╗
║   JARVIS PRIME — Agent System Online  ║
╚═══════════════════════════════════════╝
```

And a Telegram message confirming the system is online.

---

## 🚨 Troubleshooting

### Agents Not Starting

**Error**: `Error: ENOENT: no such file or directory, open '.env'`
- **Fix**: Make sure you're in the `agents` directory and `.env` file exists

**Error**: `SupabaseError: Invalid API key`
- **Fix**: Double-check your `SUPABASE_SERVICE_ROLE_KEY` in `agents/.env`

### Site Not Loading

**Error**: `Error: Invalid Supabase URL`
- **Fix**: Check `NEXT_PUBLIC_SUPABASE_URL` in `apps/site/.env.local`

**Error**: `Module not found`
- **Fix**: Run `npm install` in the root directory

### Telegram Alerts Not Working

**Check**:
1. Bot token is correct
2. Chat ID is correct (must be a number, not the bot's ID)
3. You've sent at least one message to the bot

### Email Not Sending

**Check**:
1. Resend API key is correct
2. Domain is verified in Resend (if using custom domain)
3. From email matches your verified domain

---

## 📈 Production Deployment

### Marketing Site (Netlify)

```bash
cd apps/site
npx netlify deploy --prod
```

### Dashboard (Vercel)

```bash
cd apps/dashboard
npx vercel --prod
```

### Agents (VPS or Local Server)

**Option 1: PM2**
```bash
cd agents
npm install -g pm2
pm2 start npm --name "jarvis-agents" -- run start
pm2 save
pm2 startup
```

**Option 2: Systemd (Linux)**
Create `/etc/systemd/system/jarvis-agents.service`:
```ini
[Unit]
Description=JARVIS PRIME Agents
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/jarvis-prime/agents
ExecStart=/usr/bin/node --env-file=.env src/runner.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable jarvis-agents
sudo systemctl start jarvis-agents
sudo systemctl status jarvis-agents
```

**Option 3: macOS Launchd**
Use the provided `business/com.jarvisprime.runner.plist` file:
```bash
cp business/com.jarvisprime.runner.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.jarvisprime.runner.plist
```

---

## ✅ Final Checklist

Before going live, verify:

- [ ] All environment variables are set correctly
- [ ] Supabase database tables are created
- [ ] Site builds without errors (`npm run build:site`)
- [ ] Dashboard builds without errors (`npm run build:dashboard`)
- [ ] Agents start without errors
- [ ] Test lead submission works
- [ ] Telegram alerts are received
- [ ] Emails are sent successfully
- [ ] `.env` files are in `.gitignore`
- [ ] Production deployment is configured

---

## 🎉 You're Ready!

Once you've completed all steps, your JARVIS PRIME system will be fully operational:

- **Marketing Site**: Live at your domain
- **Dashboard**: Accessible for monitoring
- **Agents**: Running 24/7, processing leads automatically

**Support**: If you encounter issues, check the logs:
- Site/Dashboard: Terminal output
- Agents: `agents/logs/` directory

---

**Last Updated:** 27 May 2026  
**Status:** ✅ Production Ready (pending your API keys)
