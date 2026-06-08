# JARVIS PRIME — n8n Automation Blueprint

## Core Workflow: AI Outbound Engine

```
[TRIGGER: Schedule — Daily 9AM]
        ↓
[1. LEAD SCRAPER]
  Tool: Apollo.io free API / PhantomBuster / LinkedIn Sales Nav
  Output: Name, Company, Title, Email, LinkedIn URL, Company size, Industry
        ↓
[2. ENRICHMENT LAYER]
  Tool: Hunter.io (email verify) + Clearbit free tier
  Adds: Email validity score, Company revenue, Tech stack, Recent news
  Filter: Drop leads with email score < 80%
        ↓
[3. ICP SCORING]
  Node: n8n Function node
  Logic: Score lead 1–25 based on ICP matrix
  Filter: Only process leads with score ≥ 15
        ↓
[4. AI PERSONALIZATION]
  Tool: OpenAI GPT-4o-mini / Groq (free, faster)
  Prompt: "Write a 1-sentence personalized opening for a cold email to {name} 
           at {company} who {recentActivity}. Max 20 words. No fluff."
  Output: Unique first line per lead
        ↓
[5. EMAIL ASSEMBLY]
  Node: n8n Set node
  Template: First line + Body template + CTA + Signature
  Merge: Personalized line + sequence template
        ↓
[6. SEND ENGINE]
  Tool: Resend (3K free/mo) → Instantly (when scaling)
  Config: Max 50 emails/day/domain, random delay 3–8 min between sends
  Track: Opens, clicks, replies via tracking pixel
        ↓
[7. REPLY DETECTION]
  Tool: Gmail webhook / Resend webhooks
  Logic: If reply detected → pause sequence for that lead → tag as "REPLIED"
        ↓
[8. AI REPLY CLASSIFIER]
  Tool: GPT-4o-mini
  Classes: POSITIVE / NEGATIVE / OUT_OF_OFFICE / QUESTION
  Action: 
    POSITIVE → Add to "Hot Leads" Notion DB + WhatsApp alert to Anuj
    QUESTION → Draft AI response → human review → send
    NEGATIVE → Unsubscribe + tag
    OOO → Resume sequence in 5 days
        ↓
[9. HOT LEAD → BOOKING]
  Tool: Cal.com embed link in email
  Auto-action: Send WhatsApp notification to founder
  CRM update: Move lead to "Call Booked" stage
        ↓
[10. FOLLOW-UP SCHEDULER]
  Logic: If no reply in 48h → send next sequence email
  Max follow-ups: 3 emails + 1 LinkedIn DM
  Stop condition: Reply detected OR 3 emails sent
```

---

## Secondary Workflow: Inbound Lead Handler

```
[TRIGGER: Form submission on website]
        ↓
[1. Capture lead data] → Store in Supabase leads table
        ↓
[2. Score inbound lead] → ICP scoring
        ↓
[3. Auto-reply email] → "Thanks, we'll reach out in 2 hours"
        ↓
[4. WhatsApp alert to founder] → "New inbound lead: {name} from {company}"
        ↓
[5. Add to Notion CRM] → Stage: "Inbound - New"
        ↓
[6. If score ≥ 18] → Auto-send Calendly booking link via email
```

---

## Dashboard Metrics Workflow (Daily Report)

```
[TRIGGER: Every day 6PM]
        ↓
[Query Supabase] → leads_sent, replies, positive_replies, calls_booked
        ↓
[Calculate KPIs] → reply_rate, booking_rate, leads_to_call_rate
        ↓
[Send Slack/WhatsApp message to founder]:
  📊 Daily Report — {date}
  Leads sent: X | Replies: X (X%) | Calls booked: X
  Pipeline value: ₹X
  Action needed: [list of hot leads]
```

---

## Tool Stack (All Free Tier)

| Tool | Purpose | Free Limit |
|---|---|---|
| n8n (self-hosted) | Orchestration | Unlimited (self-host) |
| Supabase | Database + auth | 500MB free |
| OpenAI / Groq | AI personalization | Groq: 14,400 req/day free |
| Resend | Email sending | 3,000/mo free |
| Cal.com | Meeting booking | Unlimited free |
| Apollo free | Lead data | 50 exports/mo |
| Hunter.io | Email verification | 25/mo free |
| Notion | CRM / docs | Free |

---

## Self-Hosting n8n (One-time setup)

```bash
# Install n8n via Docker
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n

# Access at: http://localhost:5678
# For production: deploy on Railway.app free tier or Render.com
```
