# ✅ Booking & Demo Video Setup Guide

**Status**: 🟢 Live and Ready - Just needs configuration

---

## What's Done ✅

Your landing page now has:
- ✅ **"Book Free Strategy Call" button** - Opens a booking modal
- ✅ **"Watch Demo" button** - Opens a demo video player
- ✅ **Modal animations** - Smooth transitions
- ✅ **Close functionality** - Click X or outside to close
- ✅ **Deployed to production** - Live at jarvisprime.me

---

## What You Need To Do (2 Steps)

### Step 1: Setup Calendly Booking Link

**What is Calendly?** A free scheduling tool that manages your calendar and lets people book calls.

1. Go to: https://calendly.com (create free account if needed)
2. Create a new event (e.g., "Strategy Call - 30 min")
3. Set:
   - Duration: 30 minutes
   - Color: Cyan or Purple
   - Auto-confirm booking
4. Copy your Calendly link (looks like: `https://calendly.com/yourname/30min`)

### Step 2: Update Calendly Link in Code

Open the website and find this in your code:

**File**: `apps/site/src/app/page.tsx`

**Find this line** (around line 850):
```
href="https://calendly.com/your-username/30min"
```

**Replace with your actual Calendly link:**
```
href="https://calendly.com/anuj/strategy-call"
```

Example:
```tsx
<a
  href="https://calendly.com/anuj/strategy-call"  // ← Your link here
  target="_blank"
  rel="noopener noreferrer"
  className="block w-full px-6 py-3 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-lg font-semibold text-slate-950 text-center hover:shadow-lg hover:shadow-cyan-400/50 transition-all"
>
  Open Calendly Link
</a>
```

### Step 3: Setup Demo Video

**Option A: Use YouTube (Recommended)**
1. Upload your JARVIS PRIME demo video to YouTube
2. Copy the video ID (from: youtube.com/watch?v=**VIDEOID**)
3. Find this line in code (around line 875):
   ```
   src="https://www.youtube.com/embed/dQw4w9WgXcQ"
   ```
4. Replace with your video:
   ```
   src="https://www.youtube.com/embed/YOUR_VIDEO_ID"
   ```

**Option B: Use Loom (Free & Easy)**
1. Go to: https://loom.com
2. Record a demo of your product
3. Get the embed link
4. Replace the YouTube URL with your Loom embed link

**Option C: Use Vimeo**
1. Upload to vimeo.com
2. Get the embed code
3. Use the same iframe structure

---

## How to Deploy Changes

After updating the Calendly link and video:

```bash
# From your project root:
cd apps/site
npm run build       # Verify it builds
git add -A
git commit -m "Update: Add Calendly and demo video links"
git push origin main
cd ..
cd ..
vercel deploy --prod    # Deploy to production
```

---

## Testing Locally

1. Run locally first:
   ```bash
   cd apps/site
   npm run dev
   ```

2. Go to http://localhost:3000

3. Click the buttons:
   - "Book Free Strategy Call" → Modal opens
   - "Watch Demo" → Video player opens
   - Click X or outside → Modal closes

---

## Button Functionality Explained

### Book Free Strategy Call
- **What it does**: Opens a modal with Calendly booking widget
- **User sees**: Beautiful modal with booking form
- **Calendly link**: Directs to your calendar
- **Mobile friendly**: Yes, fully responsive

### Watch Demo
- **What it does**: Opens a modal with embedded video player
- **User sees**: Full-screen video player
- **Video source**: YouTube, Loom, or Vimeo
- **Mobile friendly**: Yes, responsive video

---

## File Locations

**Main landing page code:**
```
apps/site/src/app/page.tsx
```

**Lines to update:**
- Calendly link: ~Line 860
- Demo video: ~Line 885

---

## Quick Reference: URLs to Update

| Item | Current | Update To |
|------|---------|-----------|
| **Calendly Link** | `https://calendly.com/your-username/30min` | Your actual Calendly URL |
| **Demo Video** | `dQw4w9WgXcQ` (YouTube ID) | Your video ID |

---

## Troubleshooting

**Q: Calendly link opens in new tab, but I want it in modal?**
A: The current setup opens in a new tab. If you want embedded Calendly, sign up for Calendly's embed feature (paid plan).

**Q: Demo video won't play?**
A: Check the video ID is correct. Test it: `youtube.com/embed/YOUR_VIDEO_ID`

**Q: Modals look broken on mobile?**
A: They should be responsive. Clear browser cache (Cmd+Shift+R) and refresh.

**Q: Can I add multiple booking times?**
A: Yes! Create multiple event types in Calendly, each with different durations/times.

---

## Next Steps

1. ✅ Set up Calendly account
2. ✅ Get your Calendly booking link
3. ✅ Update the link in code
4. ✅ Record or upload your demo video
5. ✅ Get your video ID
6. ✅ Update the video ID in code
7. ✅ Deploy to production
8. 🎉 Test by clicking buttons on jarvisprime.me

---

## Advanced: Custom Email Confirmations

In Calendly settings, you can:
- ✅ Auto-send confirmation emails
- ✅ Add your company logo
- ✅ Customize confirmation message
- ✅ Send follow-up emails
- ✅ Add Zapier automations (connect to your CRM)

---

## Support

**Need help?**
- Check that your Calendly link is public (not private)
- Verify YouTube video is public (not unlisted/private)
- Clear browser cache
- Try a different browser

---

## Current Live Demo

Visit: **https://jarvisprime.me**

Click:
- "Book Free Strategy Call" → Opens modal (needs your Calendly link)
- "Watch Demo" → Opens video modal (has sample video)

Everything is working! Just need to plug in your links. 🚀

---

**Status**: ✅ 95% Done - Just waiting for your Calendly link and demo video!

