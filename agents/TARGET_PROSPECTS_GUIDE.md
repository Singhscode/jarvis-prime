# JARVIS PRIME — How to Find Target Prospects

## What the Agent Does (Daily at 9 AM IST)
1. Reads `prospects.csv`
2. AI writes personalized cold email for each prospect
3. Sends 40 emails max per day via Resend
4. Logs to Supabase
5. Sends Telegram summary to you

## Target Customer Profile
- **Who:** Founders, CEOs, Directors of Indian B2B agencies
- **What they do:** Marketing agencies, performance marketing, SaaS, lead gen agencies
- **Size:** 1-50 employees
- **Revenue:** ₹5L+/month (can afford ₹15-35K/mo for your service)
- **Pain:** Spending ₹30-50K on SDRs, getting inconsistent results

## How to Find Emails (Free Methods)

### Method 1: LinkedIn Contact Info (Fastest)
1. Search LinkedIn: `"founder" AND ("digital agency" OR "marketing agency") AND "India"`
2. Click a profile
3. Click "Contact info" under their name
4. Copy email if visible
5. Add to CSV

### Method 2: Hunter.io (25 free lookups/month)
1. Go to hunter.io
2. Enter company domain (e.g., `growthpixel.in`)
3. Hunter shows: `rahul@growthpixel.in`
4. Verify with LinkedIn name match
5. Add to CSV

### Method 3: Apollo.io Free Credits (50/month)
1. Go to apollo.io (free account)
2. Search: "founder", "India", "marketing agency"
3. Click profiles → "Get email" (uses credits)
4. Export or copy manually
5. Add to CSV

### Method 4: Guess + Verify
Most Indian agencies use patterns:
- `founder@company.in` or `founder@company.com`
- `first@company.in`
- `firstname@company.in`

Use hunter.io "Email Verifier" to check if email exists (free).

## CSV Format

```csv
first_name,last_name,title,email,company,linkedin_url
Rahul,Sharma,Founder,rahul@digipixel.in,DigiPixel,https://linkedin.com/in/rahulsharma
Priya,Mehta,CEO,priya@growthhackers.io,Growth Hackers,https://linkedin.com/in/priyamehta
Amit,Gupta,Director,amit@scaleup.in,ScaleUp Agency,https://linkedin.com/in/amitgupta
```

## Where to Find Prospects

### LinkedIn Groups (Join These)
- Digital Marketing India
- Agency Owners India
- Startup Founders India
- B2B Sales India

### Facebook Groups
- Digital Marketing India
- Agency Owners Network
- Indian Startup Ecosystem

### IndieHackers
- Post in "Show IH" about your outbound system
- Comment on posts by Indian founders

## Goal: 40 Prospects = 40 Emails/Day

With 40 prospects in CSV:
- Day 1: 40 emails sent (Step 1 of sequence)
- Day 4: 40 follow-ups sent (Step 2)
- Day 8: 40 breakup emails sent (Step 3)

Expected results:
- 35-40% open rate = 14-16 opens
- 8-10% reply rate = 3-4 replies
- 2-3 discovery calls booked
- 1 client closed (₹15-35K)

## Quick Start (Do This Tonight)

1. Open LinkedIn
2. Search: `"founder" AND "marketing agency" AND "India"`
3. Open 10 profiles
4. Find 5 emails (using methods above)
5. Add to `agents/src/prospects.csv`
6. Agent sends tomorrow at 9 AM automatically

## What Happens When They Reply

Reply goes to: `anuj@jarvis-prime.in` (your Resend from email)

You respond manually:
```
Thanks for the interest! Worth a quick 15-min call to show you the system?

Book here: https://calendly.com/jarvis-prime
```

On the call → Use the discovery script I gave you earlier.

---

**Start with 5 prospects tonight. Agent will send them tomorrow morning.**
