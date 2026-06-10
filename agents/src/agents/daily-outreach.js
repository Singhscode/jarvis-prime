/**
 * JARVIS PRIME — Daily Outreach Agent
 *
 * Runs daily at 9 AM IST. Sends follow-up emails to leads who haven't responded.
 * Follows a 5-step email sequence with smart timing.
 */

import { supabase } from "../lib/supabase.js";
import { callAI } from "../lib/ai.js";
import { sendEmail } from "../lib/resend.js";
import { sendDailySummary } from "../lib/telegram.js";
import { pathToFileURL } from "url";

// Follow-up timing (days after last contact)
const SEQUENCE_TIMING = [0, 2, 5, 9, 14]; // Day 0 = initial, then +2, +5, etc.

export async function runDailyOutreach() {
  console.log("\n[Daily Outreach] Starting run...", new Date().toLocaleString("en-IN"));

  const stats = {
    leadsProcessed: 0,
    emailsSent: 0,
    completed: 0,
    skipped: 0,
  };

  // Get all leads that need follow-up
  const { data: leads, error } = await supabase
    .from("leads")
    .select(`
      *,
      outreach_log (
        id,
        step,
        sent_at,
        replied_at
      )
    `)
    .in("status", ["contacted", "qualified"])
    .order("last_contacted_at", { ascending: true });

  if (error) {
    console.error("[Daily Outreach] Supabase error:", error.message);
    return;
  }

  if (!leads || leads.length === 0) {
    console.log("[Daily Outreach] No leads to follow up. Done.");
    return;
  }

  console.log(`[Daily Outreach] Found ${leads.length} leads in pipeline.`);

  for (const lead of leads) {
    const result = await processFollowUp(lead);
    stats.leadsProcessed++;
    
    if (result === "sent") stats.emailsSent++;
    else if (result === "completed") stats.completed++;
    else stats.skipped++;

    await sleep(2000);
  }

  // Send daily summary
  await sendDailySummary({
    newLeads: 0,
    qualified: stats.leadsProcessed,
    hotLeads: 0,
    emailsSent: stats.emailsSent,
    callsBooked: 0,
    pipelineValue: 0,
  });

  console.log(`\n[Daily Outreach] Complete. Sent: ${stats.emailsSent}, Skipped: ${stats.skipped}, Completed: ${stats.completed}`);
}

async function processFollowUp(lead) {
  const outreachHistory = lead.outreach_log || [];
  const lastOutreach = outreachHistory.sort((a, b) => 
    new Date(b.sent_at) - new Date(a.sent_at)
  )[0];

  // If they replied, skip
  if (outreachHistory.some(o => o.replied_at)) {
    console.log(`  → ${lead.name}: Already replied — skipping`);
    return "completed";
  }

  // Determine current step
  const currentStep = lastOutreach ? lastOutreach.step : 0;
  const nextStep = currentStep + 1;

  // If sequence complete, mark as done
  if (nextStep > SEQUENCE_TIMING.length) {
    console.log(`  → ${lead.name}: Sequence complete — marking cold`);
    await supabase.from("leads").update({ 
      status: "closed_lost",
      notes: "No response after 5-email sequence"
    }).eq("id", lead.id);
    return "completed";
  }

  // Check if enough time has passed
  if (lastOutreach) {
    const daysSinceContact = Math.floor(
      (Date.now() - new Date(lastOutreach.sent_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    const requiredDays = SEQUENCE_TIMING[nextStep] - SEQUENCE_TIMING[currentStep];

    if (daysSinceContact < requiredDays) {
      console.log(`  → ${lead.name}: Too soon (${daysSinceContact}/${requiredDays} days) — skipping`);
      return "skipped";
    }
  }

  // Generate and send follow-up
  console.log(`  → ${lead.name}: Sending follow-up #${nextStep}`);
  
  const emailHtml = await generateFollowUp(lead, nextStep);
  const subject = getFollowUpSubject(lead, nextStep);

  const emailId = await sendEmail({
    to: lead.email,
    subject,
    html: emailHtml,
  });

  if (!emailId) {
    console.log(`  → ${lead.name}: Email failed`);
    return "skipped";
  }

  // Log outreach
  await supabase.from("outreach_log").insert({
    lead_id: lead.id,
    channel: "email",
    step: nextStep,
    subject,
    body: emailHtml,
    external_id: emailId,
  });

  // Update lead
  await supabase.from("leads").update({
    last_contacted_at: new Date().toISOString(),
  }).eq("id", lead.id);

  console.log(`  → ${lead.name}: ✓ Follow-up #${nextStep} sent`);
  return "sent";
}

function getFollowUpSubject(lead, step) {
  const firstName = lead.name.split(" ")[0];
  const subjects = [
    `Re: Your inquiry — let's talk, ${firstName}`,
    `Quick follow-up, ${firstName}`,
    `Did you see my last note?`,
    `One more thing — ${lead.company}`,
    `Last try — worth a quick chat?`,
  ];
  return subjects[Math.min(step - 1, subjects.length - 1)];
}

async function generateFollowUp(lead, step) {
  const founderName = process.env.FOUNDER_NAME || "Anuj";
  const calendly = process.env.FOUNDER_CALENDLY || "https://calendly.com/jarvis-prime";

  const prompts = {
    2: `Write a brief follow-up email (2 paragraphs max) checking if ${lead.name} from ${lead.company} saw your last email about outbound automation. Be casual and human. End with calendly link: ${calendly}`,
    3: `Write a value-add follow-up to ${lead.name} sharing a quick tip about B2B lead gen (1 specific insight). Keep it short. Mention you're happy to share more on a call: ${calendly}`,
    4: `Write a breakup-style email to ${lead.name} saying you'll stop following up but wanted to share one last thought about how agencies like ${lead.company} are using AI outbound. Include calendly: ${calendly}`,
    5: `Write a final short email to ${lead.name}. Just 2-3 sentences. Say you won't follow up again but your offer to help ${lead.company} stands. Include calendly: ${calendly}`,
  };

  const prompt = prompts[step] || prompts[2];

  try {
    const content = await callAI([
      { role: "system", content: `You are ${founderName}, founder of JARVIS PRIME. Write casual, human emails. No corporate speak. Output HTML only.` },
      { role: "user", content: prompt }
    ], { maxTokens: 300, temperature: 0.8 });

    return wrapEmailHTML(content, calendly);
  } catch {
    return fallbackFollowUp(lead, step, founderName, calendly);
  }
}

function wrapEmailHTML(body, calendly) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a;line-height:1.6;">
  ${body}
  <br/>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="font-size:13px;color:#666;">
    <strong>JARVIS PRIME</strong> — AI Outbound Agency<br/>
    Book a free strategy call: <a href="${calendly}">${calendly}</a>
  </p>
</body>
</html>`;
}

function fallbackFollowUp(lead, step, founderName, calendly) {
  const firstName = lead.name.split(" ")[0];
  const templates = {
    2: `<p>Hey ${firstName},</p><p>Just floating this back to the top of your inbox. Did you get a chance to look at my last note?</p><p>Happy to show you exactly how we've helped agencies book 15-20 qualified calls/month — takes 30 mins: <a href="${calendly}">${calendly}</a></p><p>— ${founderName}</p>`,
    3: `<p>${firstName},</p><p>Quick tip: most agencies waste hours on manual prospecting. We've automated the entire flow — from finding leads to booking calls.</p><p>If you're curious, let's chat: <a href="${calendly}">${calendly}</a></p><p>— ${founderName}</p>`,
    4: `<p>Hey ${firstName},</p><p>I'll stop following up after this, but wanted to share: we just helped a Mumbai agency go from 3 calls/month to 18 — in under 30 days.</p><p>If timing ever makes sense: <a href="${calendly}">${calendly}</a></p><p>— ${founderName}</p>`,
    5: `<p>${firstName},</p><p>Last note from me. If you ever want to explore automating outbound for ${lead.company}, the offer stands: <a href="${calendly}">${calendly}</a></p><p>Wishing you the best,<br/>${founderName}</p>`,
  };
  return wrapEmailHTML(templates[step] || templates[2], calendly);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Run if called directly
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDailyOutreach().catch(err => {
    console.error("[Daily Outreach] Fatal error:", err.message);
    process.exitCode = 1;
  });
}
