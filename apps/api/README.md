# JARVIS PRIME — Outbound Automation Engine

This is the engine that **delivers the service**: it finds prospects for a client,
scores them against their Ideal Customer Profile, writes personalized emails with
AI, sends multi-step sequences, and processes replies — booking-ready leads get
flagged to you on Telegram.

> **Safe by default.** The engine starts in **DRY-RUN** mode: it runs the whole
> pipeline but **never sends real emails** and **never calls paid APIs**. You
> flip one switch to go live once you're ready. This protects your sending
> domain and your API budget.

---

## What it does (the pipeline)

1. **Source** — finds people matching the client's ICP (Apollo.io, + Hunter.io for emails).
2. **Score** — rates each prospect 0–30; only qualified ones enter outreach.
3. **Personalize** — writes a short, human email per prospect (Groq AI, with template fallback).
4. **Send** — emails the sequence (first touch + 2 follow-ups), respecting a daily cap and the unsubscribe/suppression list.
5. **Reply handling** — classifies replies (interested / not / unsubscribe / auto-reply) and alerts you when someone wants to talk.

Everything is stored in Supabase (`clients`, `prospects`, `messages`, `events`, `suppression`).

---

## Quick start (test it safely — 2 minutes)

```bash
cd engine
npm install
node src/runner.js --doctor   # shows what's configured
node src/runner.js            # runs the full pipeline in DRY-RUN (nothing sent)
npm test                      # runs the logic tests
```

With no keys set, it uses an in-memory demo client and mock prospects so you can
see the whole thing work without any setup.

---

## Commands

| Command | What it does |
|---|---|
| `node src/runner.js` | Full pipeline once: source → score → outreach |
| `node src/runner.js --task=source` | Only source + score new prospects |
| `node src/runner.js --task=outbound` | Only send due outreach |
| `node src/runner.js --task=inbound` | Simulate reply handling (dry-run demo) |
| `node src/runner.js --doctor` | Print configuration & readiness report |
| `npm test` | Run unit tests |

---

## Going live (the honest checklist)

Dry-run proves the logic works. To actually deliver to a paying client, you need
to set these up — in this order:

1. **Database** — install the Supabase CLI, then run `npm run db:reset` from
   the repository root to initialize a local database from the versioned
   migrations. Link a remote project and run `npm run db:push` only after
   reviewing `npm run db:status`. Set `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` in `apps/api/.env`.
2. **A sending domain with deliverability** — use a dedicated/subdomain (e.g.
   `mail.jarvisprime.me`), set up **SPF, DKIM, and DMARC**, and **warm it up**
   for 2–3 weeks before volume sending. Skipping this = spam folder + blacklisting.
   Connect it in Resend and set `RESEND_API_KEY`, `FROM_EMAIL`, `REPLY_TO_EMAIL`.
3. **Prospect data** — add `APOLLO_API_KEY` (and optionally `HUNTER_API_KEY`).
4. **AI (optional but recommended)** — add `GROQ_API_KEY` for personalized copy.
   Without it, the engine uses built-in templates.
5. **Reply detection** — connect an inbox so replies are processed automatically:
   either a Resend/Postmark **inbound webhook** or an **IMAP poller** that calls
   `handleReply()` per message. (Booking can be wired from a Calendly webhook to
   `markBooked()`.)
6. **Compliance** — set `COMPANY_POSTAL_ADDRESS` and a real `UNSUBSCRIBE_URL`
   (every email already includes a footer + `List-Unsubscribe` header). Keep
   volume sane with `DAILY_SEND_LIMIT`.
7. **Flip the switch** — set `DRY_RUN=false`. Run `--doctor` to confirm green.
8. **Schedule it** — run `node src/runner.js` on a schedule (cron, a small VM,
   or a scheduled GitHub Action) so it works daily on autopilot.

> ⚠️ **Important:** Cold outreach is regulated (CAN-SPAM in the US, India's DPDP
> Act, GDPR in the EU). Only contact business addresses with a legitimate reason,
> always honor unsubscribes (the engine does this automatically), and keep
> sender identity honest.

---

## Configuration

Copy `.env.example` to `.env` and fill in values. Key switches:

- `DRY_RUN` — `true` (safe, default) or `false` (live).
- `DAILY_PROSPECT_LIMIT` / `DAILY_SEND_LIMIT` — keep small while warming up.

---

## File map

```
engine/
  src/
    config.js               env loading + provider status
    runner.js               orchestrator / CLI entry point
    lib/
      db.js                 Supabase data layer (+ in-memory fallback)
      logger.js             timestamped logging
    scoring/icp-scorer.js   0–30 ICP scoring
    sources/prospect-finder.js  Apollo + Hunter (mock fallback)
    ai/personalizer.js      Groq email writer (template fallback)
    email/sender.js         Resend sending + compliance footer (dry-run gate)
    agents/
      outbound-agent.js     source→score→send sequence loop
      inbound-agent.js      reply classification + handling
  ../../database/supabase/migrations/20260715000000_create_outreach_schema.sql  database tables
  test/engine.test.js       unit tests
  .env.example              configuration template
```
