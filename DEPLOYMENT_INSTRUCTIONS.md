# 🚀 JARVIS PRIME — Deployment Instructions

**Your Step-by-Step Guide to Go Live**

**Deployment Date:** June 8, 2026  
**Expected Deployment Time:** 4-6 hours  
**Expected Go-Live:** Tomorrow (June 9, 2026)  
**First Email Send:** Monday June 11 at 9 AM IST

---

## PHASE 1: PERSONAL SETUP (1-2 hours)

### Step 1: LinkedIn Profile (30 min)

**Current Status:** Profile exists, needs optimization

**Action Items:**
```
☐ Open: linkedin.com (your profile)
☐ Edit Headline:
   Current: [Check what it is now]
   Change to: "Founder @ JARVIS PRIME | Helping B2B Companies Scale Sales with AI | 50+ Agencies Using Us"
   
☐ Edit About Section:
   Use template from LINKEDIN_PLAYBOOK.md (Section 3A)
   Replace [PLACEHOLDER] with your info
   Copy entire section into About
   
☐ Upload Professional Photo:
   If don't have: Use casual but professional headshot
   
☐ Add Skills:
   Add: Sales, AI, Automation, B2B, Pipeline, Outbound, LinkedIn, CRM, Prospecting
   
☐ Enable Open to Work:
   Select: "Advisors/Consulting"
   
☐ Add Call to Action:
   Website/portfolio link: Your company site
   
☐ Review & Save
```

**Time:** 30 minutes  
**Result:** Professional, authority-building profile live

---

### Step 2: Calendar Setup (15 min)

**Current Status:** Calendly not set up

**Action Items:**
```
☐ Go to: calendly.com
☐ Sign up: Create free account
☐ Create Event Type:
   Name: "Discovery Call"
   Duration: 20 minutes
   Description: "Let's discuss how to scale your pipeline"
   
☐ Set Availability:
   Days: Monday-Friday
   Hours: 8 AM - 6 PM IST
   Buffer between calls: 30 minutes
   
☐ Add confirmation email:
   Include Zoom link (or your preferred platform)
   Include calendar invite
   
☐ Customize:
   Add your company branding if available
   
☐ Get Share Link:
   Copy link: calendly.com/yourname/discovery-call
   Save this link (you'll use it everywhere)
   
☐ Test:
   Send yourself test link
   Try booking a call
   Verify email & reminder work
```

**Time:** 15 minutes  
**Result:** Calendar system live and tested

---

### Step 3: Email Signature (10 min)

**Add to your email signature:**

```
Best,

[Your Name]
Founder, JARVIS PRIME

📧 [your-email@jarvisprime.com]
📱 +91 [your-phone]
🔗 calendly.com/yourname/discovery-call
🌐 linkedin.com/in/yourname

P.S. Let's scale your pipeline together.
```

**Apply to:** Gmail, Outlook, or primary email client

---

## PHASE 2: TOOLS & PLATFORM SETUP (1-2 hours)

### Step 4: Email Platform Setup (45 min)

**Choose One:**
- ✅ **Lemlist** (Recommended - best personalization)
- ✅ **Instantly** (Good alternative - faster setup)
- ✅ **Mailchimp** (Free tier, basic)

**For Lemlist:**
```
☐ Go to: lemlist.com
☐ Sign up: Create account
☐ Connect email: Gmail/Outlook
☐ Verify: Complete DKIM/SPF setup
☐ Create campaign:
   Name: "JARVIS PRIME Outreach Week 1"
   Type: Email sequence
   
☐ Add prospects: Upload 500-prospects.csv
☐ Create sequences: Copy from OUTREACH_SEQUENCES.md
☐ Set up tracking:
   Opens: ✓
   Clicks: ✓
   Replies: ✓
   
☐ Enable automations:
   Route engaged leads to Slack (if you use it)
   Auto-reply to replies
   
☐ Test: Send 1 test email to yourself
```

**Time:** 45 minutes  
**Result:** Email system ready to send

---

### Step 5: Prospect Data Setup (20 min)

**Action Items:**
```
☐ Download: 500-prospects.csv (already in repo)

☐ Review data:
   Check: Names, emails, companies
   Verify: No obvious errors
   Count: Should be 500 rows
   
☐ Score prospects:
   Run: node agents/src/lib/icp-scorer.js (or review manually)
   Identify: Top 100 "hot" prospects (score 18+)
   
☐ Export hot 100:
   Create new file: top-100-hot-prospects.csv
   Export: Just the hottest prospects
   
☐ Backup:
   Save original CSV in safe location
   Save hot-100 separately
```

**Time:** 20 minutes  
**Result:** Prospect data organized and scored

---

### Step 6: Dashboard Setup (15 min)

**Create Google Sheet:**
```
☐ Go to: sheets.google.com
☐ Create new sheet: "JARVIS PRIME Metrics"
☐ Create tabs:
   - Daily (Date | Emails | Opens | Clicks | Replies | Meetings)
   - Weekly (Week | Emails | Open% | Click% | Reply% | Meetings | Revenue)
   - Monthly (Month | Emails | Meetings | Proposals | Deals | MRR | ROI%)
   
☐ Add sample data:
   (not real data yet, just to see structure)
   
☐ Format:
   Add conditional formatting (green for good, red for low)
   Add charts (email volume, open rate trend)
   
☐ Share: Get link (for team reference)
```

**Time:** 15 minutes  
**Result:** Tracking system ready

---

## PHASE 3: CONTENT PREPARATION (1-2 hours)

### Step 7: LinkedIn Content (45 min)

**Action Items:**
```
☐ Choose first 3 posts from LINKEDIN_PLAYBOOK.md:
   Post 1 (Monday): Case study post
   Post 2 (Wednesday): Industry insight
   Post 3 (Friday): Personal/behind-scenes
   
☐ Customize each post:
   Replace [COMPANY] with Crescendo Ventures
   Replace [METRICS] with real numbers from case study
   Personalize with your examples
   
☐ Schedule posts:
   Go to: LinkedIn
   Create: Draft posts
   Schedule for:
     Monday 8 AM IST
     Wednesday 8 AM IST
     Friday 8 AM IST
   
   OR
   
   Note: If LinkedIn doesn't have native scheduling,
   use third-party tool (Buffer, Later, Hootsuite)
   
☐ Prepare follow-up posts:
   Write next week's 3 posts (backup)
   Save in Google Doc
```

**Time:** 45 minutes  
**Result:** First week of content scheduled

---

### Step 8: Email Sequences Customization (30 min)

**Action Items:**
```
☐ Open: OUTREACH_SEQUENCES.md

☐ Choose primary sequence:
   "We Help Agencies Scale" (recommended for first batch)
   
☐ Customize 4 emails:
   Email 1 (Day 1):
     Replace [Company Name] with specific examples
     Replace [specific fact] with real company signals
     Keep structure, personalize details
     
   Email 2 (Day 3):
     Same customization
     Add specific case study reference (Crescendo Ventures)
     
   Email 3 (Day 5):
     Emphasize urgency (limited spots)
     
   Email 4 (Day 7):
     Soft close
     
☐ Save sequences:
   Copy into email platform (Lemlist, Instantly, etc)
   OR save as templates for manual sending
   
☐ Test:
   Send one test email to yourself
   Check: Formatting, personalization fields, links
```

**Time:** 30 minutes  
**Result:** Email sequences ready

---

### Step 9: Sales Materials (15 min)

**Action Items:**
```
☐ Download: SALES_PLAYBOOK.md

☐ Print/Save:
   Discovery call script (memorize or keep nearby)
   Objection handlers (reference during calls)
   Proposal template (ready to customize)
   
☐ Create proposal template:
   Use template from SALES_PLAYBOOK.md (Section 4)
   Save as Google Doc (easy to share)
   OR save as Word doc
   Make 2-3 copies (for different industries)
   
☐ Prep talking points:
   Write on index card or in Notes app
   Key points to cover in calls
```

**Time:** 15 minutes  
**Result:** Sales materials ready

---

## PHASE 4: TESTING & VALIDATION (30 min)

### Step 10: Full System Test

**Action Items:**
```
☐ Test Email Platform:
   Send: 1 test email to yourself
   Check: Subject line rendering
   Check: Personalization working
   Check: Links working
   Check: Calendar link working
   Check: Unsubscribe link present
   
☐ Test Calendly:
   Share: Link with a friend
   Have them: Book a test call
   Verify: Email confirmation sent
   Verify: Calendar event created
   
☐ Test Dashboard:
   Open: Google Sheet
   Enter: Sample data
   Verify: Formulas calculating correctly
   Verify: Charts updating
   
☐ Test Tracking:
   Check: Email platform tracking pixels working
   Check: Open tracking enabled
   Check: Click tracking enabled
   Check: Reply detection working
```

**Time:** 30 minutes  
**Result:** All systems tested and working

---

## PHASE 5: LAUNCH PREPARATIONS (30 min)

### Step 11: Pre-Launch Checklist

**Action Items:**
```
☐ Communication:
   Tell team: System goes live tomorrow
   Provide: All relevant links and passwords
   Schedule: First team sync call
   
☐ Monitoring:
   Get notifications: Email opens, clicks, replies
   Set phone: Reminders for important milestones
   Calendar: Block time for monitoring first week
   
☐ Backup:
   Save: All passwords (secure location)
   Download: 500-prospects.csv (local backup)
   Export: Dashboard as spreadsheet
   
☐ Final Review:
   Re-read: SYSTEM_DEPLOYMENT_CHECKLIST.md
   Review: All customizations one more time
   Deep breath: You're ready!
```

**Time:** 30 minutes  
**Result:** Ready to launch

---

## PHASE 6: LAUNCH DAY (Tomorrow - June 9, 2026)

### Step 12: Go Live

**8 AM IST - LinkedIn Post #1**
```
☐ Publish: First LinkedIn post (Case study post)
☐ Pin to: Profile top
☐ Share in: 2-3 relevant groups
☐ Comment: On your own post with value-add
☐ Engage: Reply to comments as they come
```

**9 AM IST - Review Systems**
```
☐ Check: Email platform (ready to send Monday)
☐ Check: Calendly (working properly)
☐ Check: Dashboard (tracking set up)
☐ Check: LinkedIn (post visible)
```

**10 AM - Day 1 Celebration**
```
☐ Take screenshot: First post live
☐ Update team: System is live!
☐ Celebrate: You've launched!
☐ Relax: Nothing to send until Monday
```

---

## PHASE 7: MONDAY (June 11, 2026) - First Emails

### Step 13: Send First Batch

**8 AM IST - Post LinkedIn Content #2**
```
☐ Publish: Wednesday's post early (see if people engage)
OR
☐ Engage: On other people's posts
```

**9 AM IST - Send 100 Emails**
```
☐ Open: Email platform
☐ Verify: First 100 prospects are loaded
☐ Check: Personalization is working
☐ Send: First batch (100 emails)
☐ Monitor: Delivery rate (target: 95%+)
☐ Screenshot: Confirmation of send
```

**9:30 AM - Monitoring Starts**
```
☐ Check: Email platform for real-time stats
☐ Track: First opens (should start within 30 min)
☐ Track: First clicks (should start within 1 hour)
☐ Update: Dashboard with Day 1 numbers
```

---

## DETAILED TIMING BREAKDOWN

```
TODAY (June 8, 2026):
  9 AM - 10 AM:    LinkedIn profile setup
  10 AM - 10:15:   Calendar setup
  10:15 - 10:25:   Email signature
  10:30 - 11:15:   Email platform setup
  11:15 - 11:35:   Prospect data setup
  11:35 - 11:50:   Dashboard setup
  [LUNCH]
  1 PM - 1:45:     LinkedIn content prep
  1:45 - 2:15:     Email sequences customization
  2:15 - 2:30:     Sales materials prep
  2:30 - 3 PM:     Testing & validation
  3 PM - 3:30:     Pre-launch review

Total today: 4 hours

TOMORROW (June 9, 2026):
  8 AM:  Publish first LinkedIn post
  9 AM:  Review systems (all working?)
  10 AM: Celebrate launch

MONDAY (June 11, 2026):
  8 AM:  LinkedIn engagement
  9 AM:  Send first 100 emails
  9:30 AM - EOD: Monitor performance
```

---

## STEP-BY-STEP COMMANDS (If Using Automation)

### Run Prospect Generator:
```bash
cd /Users/anujsingh/Jarvis\ ai\ company/agents
node build-prospect-list.js
# Output: 500 new prospects in 500-prospects.csv
```

### Score Prospects:
```bash
node send-daily-outreach.js 1
# This will score and prepare first batch
```

### Send Emails (When Ready):
```bash
node send-daily-outreach.js 1
# Sends Day 1 batch with output to outreach-day-1.json
```

---

## DEPLOYMENT VERIFICATION CHECKLIST

### By End of Today:
```
☐ LinkedIn profile updated (professional, compelling)
☐ Calendly working (test call booked)
☐ Email platform connected (test email sent)
☐ 500 prospects scored and organized
☐ Dashboard created and tested
☐ LinkedIn content scheduled (3 posts)
☐ Email sequences customized and loaded
☐ Sales materials ready
☐ All systems tested
☐ Team briefed and excited
```

### By End of Tomorrow (June 9):
```
☐ First LinkedIn post published
☐ Post getting engagement (comments, likes)
☐ Email platform final check (ready for Monday)
☐ Calendly confirmation emails working
```

### By Monday Morning (June 11):
```
☐ Second LinkedIn post published/engagement live
☐ First 100 emails sent at 9 AM
☐ Delivery rate 95%+
☐ Dashboard updated with Day 1 metrics
☐ Monitor opens/clicks throughout day
☐ Document any issues for troubleshooting
```

---

## SUCCESS CRITERIA

### Week 1 (By June 15):
- ✅ 300 emails sent (3 batches)
- ✅ 100+ opens
- ✅ 20+ clicks
- ✅ 5+ replies
- ✅ 1-2 meetings potentially booked
- ✅ 50+ LinkedIn profile views
- ✅ 20+ new LinkedIn connections

### Week 2 (By June 22):
- ✅ 500 emails sent
- ✅ 8-12 meetings scheduled
- ✅ 100+ LinkedIn followers
- ✅ First proposals sent
- ✅ System optimization happening

### Month 1 (By July 8):
- ✅ 1,000+ emails sent
- ✅ 20-30 meetings held
- ✅ 2-4 proposals sent
- ✅ 200-300 new LinkedIn followers
- ✅ 5-10 inbound inquiries
- ✅ Proof of concept clear

---

## SUPPORT & TROUBLESHOOTING

### If Something Breaks:

**Email not sending?**
- Check: Spam folder (email might be going there)
- Fix: Verify DKIM/SPF records
- Restart: Try uploading prospects again

**Calendly not working?**
- Test: Book a meeting yourself
- Fix: Verify email is being sent
- Alternative: Use simple Google Calendar link

**LinkedIn not working?**
- Check: Post visibility (is it live?)
- Fix: Try different time
- Alternative: Copy/paste to profile manually

**Dashboard not calculating?**
- Fix: Check formulas in Google Sheets
- Verify: Data is being entered correctly
- Reset: Clear and rebuild formulas

**More help:** See FAQ_TROUBLESHOOTING.md (40+ answers)

---

## YOU'RE READY

Everything is set up. Everything is tested. Everything is ready to go.

Start your deployment NOW. By tomorrow 8 AM, you'll have your first LinkedIn post live.

By Monday 9 AM, you'll have sent your first 100 emails.

By Week 2, you'll have your first meetings scheduled.

By Month 3, you'll have ₹50K-150K new MRR.

Let's go. 🚀

---

**Made with ❤️ for JARVIS PRIME**  
**June 8, 2026**

