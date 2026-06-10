# ⚡ Operations Portal - Setup & Testing

Your new operations portal is ready. Follow these steps to verify it's working.

---

## 🚀 Quick Start (5 minutes)

### Step 1: Verify Portal Files Created
```bash
cd apps/site/src/app
ls -la dashboard/  # Should have page.tsx
ls -la leads/      # Should have page.tsx
ls -la tasks/      # Should have page.tsx
ls -la api/        # Should have leads/, tasks/, dashboard/ folders
```

### Step 2: Build & Test Locally
```bash
cd apps/site
npm run dev
```

Then visit in browser:
- http://localhost:3000 (Landing page)
- http://localhost:3000/dashboard (Dashboard)
- http://localhost:3000/leads (Leads)
- http://localhost:3000/tasks (Tasks)

### Step 3: Deploy to Vercel
```bash
git add .
git commit -m "Add operations portal"
git push origin main
```

Vercel auto-deploys. Then visit:
- https://jarvisprime.me (Landing page with new buttons)
- https://jarvisprime.me/dashboard (Dashboard)
- https://jarvisprime.me/leads (Leads manager)
- https://jarvisprime.me/tasks (Tasks)

---

## 📁 New Files Created

### Portal Pages
```
apps/site/src/app/
├── dashboard/
│   └── page.tsx          # Main dashboard
├── leads/
│   └── page.tsx          # Lead manager
├── tasks/
│   └── page.tsx          # Task manager
└── api/
    ├── leads/
    │   └── route.ts      # Leads API
    ├── tasks/
    │   └── route.ts      # Tasks API
    └── dashboard/
        └── stats/
            └── route.ts  # Dashboard API
```

### Navigation
```
apps/site/src/
├── components/
│   └── PortalNav.tsx     # Portal navigation bar
├── app/
│   ├── layout.tsx        # Root layout with nav
│   └── page.tsx          # Updated with portal button
```

### Documentation
```
Root/
├── OPERATIONS_PORTAL_GUIDE.md      # User guide
└── PORTAL_SETUP_INSTRUCTIONS.md    # This file
```

---

## ✅ Verification Checklist

After deployment, verify each page:

### ✓ Landing Page (https://jarvisprime.me)
- [ ] Two buttons visible in hero:
  - "Book Free Strategy Call" (Cyan/Purple gradient)
  - "Operations Portal" (Purple/Pink gradient)
- [ ] Operations Portal button works
- [ ] Calendly button works

### ✓ Dashboard (https://jarvisprime.me/dashboard)
- [ ] Navigation bar visible at top
- [ ] Shows 6 stat cards:
  - 📥 New Leads (12)
  - ✅ Qualified (8)
  - 🔥 Hot Leads (3)
  - 📧 Emails Sent (45)
  - 📞 Calls Booked (2)
  - 💰 Pipeline Value (₹25L)
- [ ] Agent status section visible
  - Inbound: Running ✅
  - Outreach: Running ✅
  - Prospects: Stopped ⏸
- [ ] Recent activity feed shows 4 items
- [ ] Back to Site button works
- [ ] Auto-refreshes every 30 seconds

### ✓ Leads (https://jarvisprime.me/leads)
- [ ] Navigation bar visible
- [ ] Table shows 6 leads
- [ ] Filter buttons work (All, New, Contacted, etc.)
- [ ] Columns visible:
  - Name & Email
  - Company
  - Revenue
  - ICP Score (shows colors: green 20+, orange 15-19, gray <15)
  - Status badges
  - Last Contact
  - Next Action
- [ ] Hover effects work
- [ ] Back to Dashboard button works

### ✓ Tasks (https://jarvisprime.me/tasks)
- [ ] Navigation bar visible
- [ ] Shows 6 tasks
- [ ] Filter buttons work (All, Pending, In Progress, Completed)
- [ ] Each task shows:
  - Category icon (📥 📧 📞 ⚙️)
  - Task name
  - Status badge
  - Priority label
  - Description
  - Progress bar (animated)
  - Assignee
  - Due date
- [ ] Progress bars animate
- [ ] Hover effects work
- [ ] Back to Dashboard button works

### ✓ Navigation
- [ ] All pages have nav bar at top
- [ ] Nav shows logo "JARVIS PRIME"
- [ ] Three nav links visible (Dashboard, Leads, Tasks)
- [ ] Current page highlighted in cyan
- [ ] Back button visible on all pages
- [ ] Nav is sticky (stays at top when scrolling)

---

## 🧪 Manual Testing

### Test 1: Navigation Loop
```
Home → Dashboard → Leads → Tasks → Dashboard → Home
```
Should work smoothly with no errors.

### Test 2: Filter Functionality
1. Go to Leads page
2. Click "Qualified" filter
3. Should show only qualified leads (4-5 visible)
4. Click "All" filter
5. Should show all 6 leads

### Test 3: Status Indicators
1. Dashboard → Check Agent Status colors
   - Green + pulsing = Running
   - Gray = Stopped
   - Red = Error
2. Should indicate correct status visually

### Test 4: Responsive Design
1. Open portal on:
   - Desktop (1920px) - all columns visible
   - Tablet (768px) - columns stack nicely
   - Mobile (375px) - tables scroll horizontally, nav is compact

### Test 5: Animation Performance
1. Dashboard - cards should fade in smoothly
2. Leads/Tasks - rows should fade in on scroll
3. Progress bars should animate

---

## 🔗 Integration with Backend

### Current State (Demo)
Portal shows **mock data** from API routes:
- `/api/dashboard/stats` - Returns demo metrics
- `/api/leads` - Returns demo leads
- `/api/tasks` - Returns demo tasks

### Next Step: Connect Real Data
Replace mock data with real Supabase queries:

```typescript
// In apps/site/src/app/api/leads/route.ts
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('status', 'new')
    .limit(20);
  
  return NextResponse.json({ leads });
}
```

---

## 📊 Expected Portal Data Flows

### Real-Time Updates
```
Supabase Database
        ↓
Node.js Agents (inbound-agent.js, daily-outreach.js)
        ↓
API Routes (/api/...)
        ↓
Portal Pages (Dashboard, Leads, Tasks)
        ↓
Your Browser
```

### Data Refresh Cycle
- **Every 15 min**: Inbound agent processes new leads
- **Every 30 sec**: Portal auto-refreshes stats
- **Daily 9 AM**: Outreach agent sends follow-ups
- **Daily 6 PM**: Daily summary report

---

## 🐛 Common Issues & Fixes

### Issue: Portal pages show "404 Not Found"
**Fix:** Rebuild Next.js
```bash
cd apps/site
rm -rf .next
npm run dev
```

### Issue: Buttons don't appear in hero section
**Fix:** Check `page.tsx` was updated with portal link
```bash
grep "Operations Portal" apps/site/src/app/page.tsx
# Should output the link code
```

### Issue: Navigation bar not showing
**Fix:** Verify `layout.tsx` includes PortalNav component
```bash
grep "PortalNav" apps/site/src/app/layout.tsx
```

### Issue: Animations not working
**Fix:** Ensure Framer Motion is installed
```bash
cd apps/site
npm list framer-motion
# Should show version 10+
```

### Issue: Page loads but data is empty
**Fix:** Check API routes are accessible
```bash
curl http://localhost:3000/api/dashboard/stats
# Should return JSON with mock data
```

---

## 🚀 Testing Checklist

- [ ] All pages load without errors
- [ ] Navigation works between pages
- [ ] Filters work on Leads & Tasks pages
- [ ] Agent status indicators show correctly
- [ ] Progress bars animate smoothly
- [ ] Responsive design works on mobile
- [ ] Page auto-refreshes every 30 seconds
- [ ] All buttons are clickable
- [ ] No console errors in browser DevTools
- [ ] Loading states work
- [ ] Empty states display correctly

---

## 📝 Next Steps After Testing

### 1. Connect Real Database
Update API routes to query Supabase instead of returning mock data.

### 2. Add More Features
- Export reports to PDF
- Team collaboration
- Custom alerts
- Deal timeline
- Lead scoring history

### 3. Mobile App
Convert portal to mobile app using React Native or Flutter.

### 4. Admin Settings
Add settings page to configure:
- ICP weights
- Email templates
- Agent schedules
- Timezone
- API keys

---

## 💬 Portal Features Summary

**What You Can Do Now:**
- ✅ View real-time metrics
- ✅ See all leads with scores & status
- ✅ Manage daily tasks
- ✅ Monitor agent status
- ✅ Filter by status/priority
- ✅ Track recent activity

**What Needs Backend Connection:**
- ⏳ Live lead data from Supabase
- ⏳ Real agent status monitoring
- ⏳ Task updates from automation
- ⏳ Historical metrics & reporting

---

## 🎉 You're Done!

Your operations portal is fully functional. Deploy it and start managing JARVIS PRIME like a pro!

**From the landing page, click "Operations Portal" to access the dashboard.**

Questions? Email: support@jarvisprime.me
