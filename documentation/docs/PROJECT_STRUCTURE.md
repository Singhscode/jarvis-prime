# JARVIS PRIME - Project Structure

## Overview
JARVIS PRIME is an AI-powered outbound and appointment-setting service for agencies and B2B companies.

## Directory Structure

```
jarvis-prime/
├── apps/
│   ├── site/                    # Main marketing website (Next.js)
│   │   ├── src/
│   │   │   ├── app/            # Next.js 14 App Router
│   │   │   │   ├── page.tsx           # Homepage
│   │   │   │   ├── lead-generation/   # Lead gen service page
│   │   │   │   ├── book-call/         # Calendly booking page
│   │   │   │   ├── portal-auth/       # Portal authentication
│   │   │   │   └── api/               # API routes
│   │   │   └── components/     # React components
│   │   │       ├── Header.tsx
│   │   │       └── CalendlyBooking.tsx
│   │   ├── public/             # Static assets
│   │   │   ├── logo.svg
│   │   │   ├── logo-white.svg
│   │   │   └── icon.svg
│   │   └── package.json
│   │
│   └── dashboard/              # Client dashboard (Next.js)
│       └── src/
│
├── agents/                     # AI agents for outbound
│   ├── src/
│   │   ├── agents/            # Agent implementations
│   │   │   ├── inbound-agent.js
│   │   │   ├── outbound-agent.js
│   │   │   └── prospect-builder.js
│   │   ├── lib/               # Shared utilities
│   │   │   ├── ai.js
│   │   │   ├── icp-scorer.js
│   │   │   ├── resend.js
│   │   │   └── supabase.js
│   │   └── tools/             # Agent tools
│   │       ├── email-verifier.js
│   │       └── prospect-finder.js
│   └── package.json
│
├── docs/                       # Documentation (NEW)
│   ├── development-history/   # Historical dev docs
│   └── PROJECT_STRUCTURE.md   # This file
│
├── .gitignore                 # Git ignore patterns
├── .env.local                 # Environment variables (not in git)
└── vercel.json                # Vercel deployment config
```

## Key Technologies

### Frontend (apps/site)
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Deployment**: Vercel
- **Booking**: Calendly integration

### Backend (agents)
- **Runtime**: Node.js
- **Database**: Supabase
- **Email**: Resend API
- **AI**: OpenAI API
- **Notifications**: Telegram

## Live URLs

- **Production**: https://www.jarvisprime.me
- **Lead Generation**: https://www.jarvisprime.me/lead-generation
- **Book Call**: https://www.jarvisprime.me/book-call

## Contact Information

- **Email**: hello@jarvisprime.me
- **Phone**: +91 88105 00723
- **Address**: Gurgaon, Haryana, India
- **LinkedIn**: https://www.linkedin.com/company/jarvis-prime-ai
- **X (Twitter)**: https://x.com/jarvisprime_ai

## Environment Variables

Required variables in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `TELEGRAM_BOT_TOKEN`

## Development

### Install Dependencies
```bash
npm install
```

### Run Development Server
```bash
cd apps/site
npm run dev
```

### Build for Production
```bash
npm run build
```

### Deploy Preview
```bash
vercel
```

### Deploy Production
```bash
vercel --prod
```

## Pages Overview

### Marketing Site (apps/site)

1. **Homepage** (`/`)
   - Hero section with value proposition
   - Services (AI Appointment Setting, Voice Agents, Workflow Automation)
   - Results/metrics
   - How it works (5-step process)
   - Pricing (3 tiers)
   - FAQ
   - Lead Generation CTA banner
   - Footer with social links

2. **Lead Generation** (`/lead-generation`)
   - Premium service page
   - Detailed process explanation
   - Case studies
   - Interactive FAQ
   - Calendly booking CTA

3. **Book Call** (`/book-call`)
   - Calendly booking widget
   - Minimal design focused on conversion

4. **Portal Auth** (`/portal-auth`)
   - Password-protected portal access

## Recent Updates

### Latest Changes (June 2026)
- ✅ Added Lead Generation service page
- ✅ Integrated social media (LinkedIn + X)
- ✅ Added company address
- ✅ Created CTA banner on homepage
- ✅ Optimized SEO metadata
- ✅ Cleaned up project structure

## Maintenance

### Regular Tasks
- Monitor Vercel deployments
- Update dependencies monthly
- Review analytics
- Test booking flow
- Check social links

### Backup Strategy
- Code: Git repository
- Database: Supabase automated backups
- Documentation: /docs folder
- Environment: Vercel settings

## Support

For technical issues or questions:
- Email: hello@jarvisprime.me
- Check documentation in /docs
- Review git history for changes
