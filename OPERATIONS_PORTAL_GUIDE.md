# 🎛️ JARVIS PRIME Operations Portal

Your all-in-one management interface for JARVIS PRIME automation system.

---

## 📍 Portal URLs

| Page | URL | Purpose |
|------|-----|---------|
| **Dashboard** | https://jarvisprime.me/dashboard | Real-time metrics & agent status |
| **Leads** | https://jarvisprime.me/leads | Manage all incoming leads |
| **Tasks** | https://jarvisprime.me/tasks | Daily operations & workflow tasks |

---

## 🚀 Quick Access

From your landing page (https://jarvisprime.me), you now have TWO buttons:

1. **"Book Free Strategy Call"** → Opens Calendly (for prospects)
2. **"Operations Portal"** → Takes YOU to the management dashboard

---

## 📊 Dashboard Features

### Real-Time Metrics
- **📥 New Leads**: Leads captured today
- **✅ Qualified**: Leads passing ICP filter
- **🔥 Hot Leads**: High-value prospects needing immediate follow-up
- **📧 Emails Sent**: Outbound emails delivered
- **📞 Calls Booked**: Meetings scheduled
- **💰 Pipeline Value**: Total deal value

### Agent Status Monitor
Shows real-time status of all automation agents:
- **Inbound Agent** - Responds to new leads every 15 minutes
- **Outreach Agent** - Sends follow-up sequences daily
- **Prospect Agent** - Builds prospect lists (on-demand)

Status indicators:
- ✅ Running (Green, pulsing)
- ⏸ Stopped (Gray)
- ❌ Error (Red)

### Recent Activity Feed
- New leads incoming
- Emails sent successfully
- Meetings booked
- Deals won/lost
- System alerts

---

## 👥 Leads Management

### View All Leads
See every lead with:
- **Name & Email** - Contact info
- **Company** - Their business
- **Revenue Tier** - Business size
- **ICP Score** - 0-25 qualification score
- **Status** - Current pipeline stage
- **Last Contact** - When you last touched them
- **Next Action** - Recommended action

### Filter by Status

| Status | Meaning |
|--------|---------|
| **New** | Just submitted form, awaiting scoring |
| **Contacted** | We've sent auto-reply, awaiting response |
| **Qualified** | Passed ICP threshold (15+), ready for outreach |
| **Meeting Booked** | Call scheduled |
| **Proposal Sent** | Proposal delivered, negotiation phase |
| **Won** | Deal closed |
| **Lost** | Marked as not interested or failed |

### ICP Score Explained
- **0-14** → Low fit, unlikely to convert (closed_lost)
- **15-19** → Good fit, send to outreach sequence
- **20-25** → **HOT LEAD** 🔥 - Call personally within 1 hour

---

## ✅ Tasks Management

### View All Tasks
See daily operations broken down by:
- **Category** → Lead, Outreach, Meeting, Admin
- **Status** → Pending, In Progress, Completed, Failed
- **Priority** → Low, Medium, High
- **Progress** → Visual progress bar (0-100%)
- **Assignee** → You or System (automation)
- **Due Date** → When to complete

### Task Categories

| Category | Examples |
|----------|----------|
| **📥 Lead** | Follow up with hot leads, process new submissions |
| **📧 Outreach** | Send cold emails, follow-up sequences |
| **📞 Meeting** | Meeting prep, post-call follow-up |
| **⚙️ Admin** | Import prospects, clean data, update configs |

### Typical Daily Workflow

```
Morning (9 AM):
  → Check Dashboard
  → Review new Hot Leads (🔥)
  → Prepare for meetings
  → Start cold email campaign

Mid-day:
  → Handle incoming leads
  → Send follow-ups (automated)
  → Follow up on hot prospects

Evening (6 PM):
  → Review daily metrics
  → Check meeting outcomes
  → Plan tomorrow's outreach
```

---

## 🔄 How Automation Agents Work (Visible in Portal)

### Inbound Agent (Every 15 minutes)
**What it does:**
1. Checks for new leads
2. Scores them against ICP (0-25)
3. Auto-sends reply email
4. Sends Telegram alert if hot

**Visible in Portal:**
- New leads appear in dashboard
- Status updates in real-time
- Agent status shows "running"

### Outreach Agent (Daily at 9 AM)
**What it does:**
1. Finds leads needing follow-up
2. Sends day 2, 5, 9, 14 follow-ups
3. Personalizes each email with AI
4. Tracks responses

**Visible in Portal:**
- Tasks show follow-up progress
- Email sent count updates
- Response rates tracked

### Prospect Agent (On-Demand)
**What it does:**
1. Imports prospects from Apollo/CSV
2. Scores against ICP
3. Filters qualified prospects
4. Adds to outbound list

**Visible in Portal:**
- New prospects appear in tasks
- Batch processing shown as task
- Completion percentage displayed

---

## 🎯 Next Steps from Portal

### If You See a HOT LEAD (🔥)
1. Go to Leads page
2. Filter by "Qualified"
3. Find the hot lead (score 20+)
4. Click to view details
5. **Call them immediately** - open Calendly, book meeting
6. Update status to "meeting_booked"

### If You Need to Send Outreach Campaign
1. Go to Tasks page
2. Find "Send Cold Email Campaign"
3. Task shows progress and status
4. System automatically sends daily
5. Check open/reply rates daily

### If Agent Is Down
1. Check Dashboard agent status
2. If any show ❌, click to see error
3. Check system logs (link in error)
4. Restart from agent folder: `npm run scheduler`

---

## 📈 Understanding the Metrics

### Conversion Metrics
- **Lead to Qualified**: (Qualified / New Leads) × 100
  - Goal: 50%+ (ICP score of 15+)
  
- **Qualified to Meeting**: (Meetings / Qualified) × 100
  - Goal: 30%+ (1 in 3 qualified = meeting)

- **Meeting to Deal**: (Won / Meetings) × 100
  - Goal: 50%+ (1 in 2 meetings = deal)

### Overall Pipeline
```
100 Leads → 50 Qualified → 15 Meetings → 7 Deals
```

---

## 🔔 Real-Time Alerts

### Telegram Notifications
You'll receive automatic alerts:
- **🔥 Hot Lead Alert** - When score ≥ 20
- **📊 Daily Summary** - At 6 PM with metrics
- **⚠️ System Alert** - If agent fails

---

## 🛠️ Portal Settings (Coming Soon)

Future features to manage from portal:
- [ ] Configure ICP weights
- [ ] Adjust email templates
- [ ] Set timezone for scheduling
- [ ] Control agent schedules
- [ ] Export reports
- [ ] Team permissions

---

## 💡 Tips for Maximum Results

1. **Check Hot Leads FIRST** - Sort by ICP score, call 20+ leads immediately
2. **Reply to emails within 2 hours** - Set inbox notifications
3. **Update status regularly** - Mark meetings as completed for tracking
4. **Review metrics daily** - See what's working, adjust if needed
5. **Trust the automation** - Let agents run 24/7, you handle calls

---

## 🆘 Troubleshooting

### Portal Not Loading
- Clear browser cache (Cmd+Shift+Delete)
- Try incognito mode
- Check internet connection
- Verify https://jarvisprime.me is accessible

### No Leads Showing
- Ensure website lead form is live
- Check Supabase connection (settings page)
- Verify API keys in .env

### Metrics Not Updating
- Refresh page (browser refresh)
- Wait 30 seconds (auto-refresh)
- Check if agents are running
- See agent logs

---

## 📞 Support

**Portal Issues:**
- Email: support@jarvisprime.me
- WhatsApp: +91-XXXXXXXXXX

**Strategy Questions:**
- Book call: https://calendly.com/jarvis-prime

---

## 🎉 You're Ready!

Your complete operations portal is live. Start using it today to:
- ✅ Monitor all automation
- ✅ Manage leads & deals
- ✅ Track daily tasks
- ✅ Make data-driven decisions

**Welcome to automated sales! 🚀**
