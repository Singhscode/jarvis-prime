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

## CRM Foundation

The authenticated CRM is available only at `/api/crm`. It stores owner-scoped
companies, contacts, and CRM lead markers; it does not use the website intake
`leads` table. Send a valid access token with every request:

```bash
curl -H "Authorization: Bearer <access-token>" http://localhost:3001/api/crm/companies
```

### Manual verification

1. Run `npm run db:reset` from the repository root, start the API, then register
   or log in through `/api/auth` to obtain an access token.
2. Replace `API` with `http://localhost:3001/api/crm` and send the bearer token
   shown above for each check.

| Endpoint | Manual check |
|---|---|
| `GET /companies` | Verify `{ success: true, data: [] }` before creating a company. |
| `POST /companies` | Send `{ "name": "Acme" }`; verify `201` and save the returned company ID. |
| `PATCH /companies/:id` | Change the company name; verify the returned record has the new name. |
| `DELETE /companies/:id` | Delete a disposable company; verify `{ success: true }`. |
| `GET /contacts` | Verify only contacts created by the authenticated user are returned. |
| `POST /contacts` | Send a name and optional saved `company_id`; verify `201` and save the contact ID. |
| `PATCH /contacts/:id` | Change the contact title or clear an optional field with `null`; verify the response. |
| `DELETE /contacts/:id` | Delete a contact without a CRM lead; verify `{ success: true }`. |
| `GET /leads` | Verify only the authenticated user's CRM lead markers are returned. |
| `POST /leads` | Send `{ "contact_id": "<saved-contact-id>" }`; verify `201`. |
| `DELETE /leads/:id` | Delete the CRM lead marker; verify the contact remains and `{ success: true }` is returned. |

Verify that a second user cannot list, update, or delete the first user's CRM
records. Also verify that deleting a company clears `company_id` on its contacts,
and that a contact with a CRM lead returns `409` until the lead is deleted.

---

## Client Management

Client Management converts an active CRM lead into an owner-scoped client at the
same `/api/crm` base path. The conversion preserves the CRM lead and links it to
the new client; converted leads are excluded from the active CRM lead list. The
migration includes `convert_crm_lead_to_client` solely because the Supabase
JavaScript client does not provide application-level transactions; it atomically
creates the client and sets the two client relationships.

### Manual verification

Create a CRM contact and active CRM lead first, then use the same bearer token
for each of these checks:

| Endpoint | Manual check |
|---|---|
| `GET /clients` | Verify `{ success: true, data: [] }` before conversion. |
| `POST /clients` | Send `{ "lead_id": "<lead-id>", "name": "Acme" }`; verify `201`, a client, and the preserved lead no longer appears in `GET /leads`. |
| `PATCH /clients/:id` | Change only the client name and verify the response. |
| `DELETE /clients/:id` | Delete a disposable client; verify `{ success: true }`, cleared contact association, and the preserved lead appears in `GET /leads` again. |
| `GET /clients/:clientId/contacts` | Verify the converted lead contact is returned. |
| `POST /clients/:clientId/contacts` | Create a second client contact; verify `201` and association with the client. |
| `PATCH /clients/:clientId/contacts/:contactId` | Change a title or clear an optional field; verify the response. |
| `DELETE /clients/:clientId/contacts/:contactId` | Verify the contact remains in general CRM contacts but is disassociated from the client. |

Use a second user's token to verify no client or client-contact operation can
read or mutate the first user's records. Also verify unknown fields such as
`status`, `stage`, `pipeline`, `company_id`, and `client_id` return `400`.

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
