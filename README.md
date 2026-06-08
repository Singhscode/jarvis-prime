# JARVIS PRIME — AI Business Operating System

**Founder:** Anuj Singh  
**Model:** AI Automation Agency (B2B, India)  
**Stack:** Next.js 14 · TypeScript · Tailwind CSS · Supabase · n8n

---

## Monorepo Structure

```
jarvis-prime/
├── apps/
│   ├── site/          # Public brand/marketing website (port 3000)
│   └── dashboard/     # Internal JARVIS operating dashboard (port 3001)
├── business/
│   ├── icp-document.md
│   ├── outreach-templates.md
│   ├── pricing-strategy.md
│   ├── n8n-automation-blueprint.md
│   └── 90-day-execution-plan.md
└── package.json       # Monorepo root
```

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Run brand site (localhost:3000)
```bash
npm run dev:site
```

### 3. Run internal dashboard (localhost:3001)
```bash
npm run dev:dashboard
```

### 4. Run both simultaneously
```bash
npm run dev
```

---

## Deploy Brand Site to Vercel

```bash
cd apps/site
npx vercel --prod
```

---

## n8n Setup (Automation Engine)

```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```
Access at: http://localhost:5678  
Blueprint: `business/n8n-automation-blueprint.md`

---

## Business Documents

| Doc | Purpose |
|---|---|
| `business/icp-document.md` | Ideal customer profile, scoring, qualification |
| `business/client-acquisition-playbook.md` | Daily client-finding routine, scripts, KPI targets |
| `business/starter-prospect-list.csv` | Researched starter prospect list for manual review |
| `business/daily-outreach-tracker.csv` | Lightweight tracker for messages, replies, follow-ups |
| `business/outreach-templates.md` | Email sequences A/B/C + LinkedIn + WhatsApp |
| `business/pricing-strategy.md` | Pricing tiers, ROI framing, upsell path |
| `business/n8n-automation-blueprint.md` | Full outbound automation workflow |
| `business/90-day-execution-plan.md` | Week-by-week execution + KPI targets |

---

## Revenue Target

| Month | MRR Target |
|---|---|
| Month 1 | ₹50,000 |
| Month 2 | ₹1,50,000 |
| Month 3 | ₹3,00,000 |
