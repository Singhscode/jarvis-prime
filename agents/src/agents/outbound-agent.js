/**
 * JARVIS PRIME — Outbound Lead Agent
 *
 * Runs daily. For each prospect in queue:
 *  1. Checks if ready for outreach
 *  2. Generates personalized email with AI
 *  3. Sends via Resend
 *  4. Updates prospect status
 *  5. Schedules follow-ups
 *
 * Schedule: Every day at 9 AM IST
 */

import { supabase }       from "../lib/supabase.js";
import { callAI }         from "../lib/ai.js";
import { sendEmail }      from "../lib/resend.js";
import { sendTelegram }   from "../lib/telegram.js";
import { scoreICP }       from "../lib/icp-scorer.js";
import { pathToFileURL }  from "url";

const DAILY_LIMIT = 30; // Max emails per day

export async function runOutboundAgent() {
  console.log("\n[Outbound Agent] Starting run...", new Date().toLocaleString("en-IN"));

  // Get prospects ready for outreach
  const { data: prospects, error } = await supabase
    .from("prospects")
    .select("*")
    .in("status", ["ready", "contacted"])
    .order("icp_score", { ascending: false })
    .limit(DAILY_LIMIT);

  if (error) {
    console.error("[Outbound Agent] Supabase fetch error:", error.message);
    return;
  }

  if (!prospects || prospects.length === 0) {
    console.log("[Outbound Agent] No prospects ready. Done.");
    return;
  }

  console.log(`[Outbound Agent] Found ${prospects.length} prospect(s) to contact.`);

  let emailsSent = 0;
  let errors = 0;

  for (const prospect of prospects) {
    try {
      await processProspect(prospect);
      emailsSent++;
      await sleep(3000); // 3 second delay between emails
    } catch (err) {
      console.error(`[Outbound Agent] Error processing ${prospect.name}:`, err.message);
      errors++;
    }
  }

  // Send summary
  await sendTelegram(
    `📤 *Outbound Agent Complete*\n\n` +
    `📧 Emails Sent: ${emailsSent}\n` +
    `❌ Errors: ${errors}\n` +
    `📅 ${new Date().toLocaleDateString("en-IN")}`
  );

  console.log(`[Outbound Agent] Run complete. Sent: ${emailsSent}, Errors: ${errors}`);
}

async function processProspect(prospect) {
  console.log(`\n  → Processing: ${prospect.name} @ ${prospect.company}`);

  // Check which step they're on
  const { data: logs } = await supabase
    .from("outreach_log")
    .select("step")
    .eq("lead_id", prospect.id)
    .order("step", { ascending: false })
    .limit(1);

  const currentStep = logs?.[0]?.step || 0;
  const nextStep = currentStep + 1;

  if (nextStep > 5) {
    console.log(`     Skipping — already completed 5-step sequence`);
    await supabase.from("prospects").update({ status: "sequence_complete" }).eq("id", prospect.id);
    return;
  }

  console.log(`     Step ${nextStep} of 5`);

  // Generate email based on step
  const email = await generateOutboundEmail(prospect, nextStep);
  
  // Send email
  const emailId = await sendEmail({
    to: prospect.email,
    subject: email.subject,
    html: email.body,
  });

  if (!emailId) {
    throw new Error("Email send failed");
  }

  // Update prospect status
  await supabase.from("prospects").update({
    status: "contacted",
    updated_at: new Date().toISOString(),
  }).eq("id", prospect.id);

  // Log outreach
  await supabase.from("outreach_log").insert({
    lead_id: prospect.id,
    channel: "email",
    step: nextStep,
    subject: email.subject,
    body: email.body,
    email_id: emailId,
  });

  console.log(`     ✓ Email ${nextStep} sent — ID: ${emailId}`);
}

async function generateOutboundEmail(prospect, step) {
  const founderName = process.env.FOUNDER_NAME || "Anuj";
  const calendly = process.env.FOUNDER_CALENDLY || "https://calendly.com/jarvis-prime";

  const stepPrompts = {
    1: `Write the FIRST cold email to ${prospect.name}, ${prospect.title} at ${prospect.company}.
        
        Rules:
        - Subject line: Short, curiosity-driven, no spam words
        - Opening: Reference something specific about their company/role
        - Body: Quick pain point (low leads, manual outreach, inconsistent pipeline)
        - Social proof: "We helped [similar company] book 18 calls/month"
        - CTA: Soft ask — "Worth a quick chat to see if this fits?"
        - Link: ${calendly}
        - 3-4 short paragraphs max`,

    2: `Write follow-up email #2 (they didn't reply to the first one).
        
        Rules:
        - Subject: "Re: [reference first email topic]" or "Quick follow-up"
        - Super short — 2-3 sentences
        - New angle or value prop
        - No guilt-tripping
        - Same CTA`,

    3: `Write follow-up email #3.
        
        Rules:
        - Share a quick case study or specific result
        - "Just helped [company] achieve X"
        - Make it feel like valuable info, not a pitch
        - 3 sentences max`,

    4: `Write follow-up email #4.
        
        Rules:
        - Different angle — maybe a question about their goals
        - "Curious — are you still looking to [solve pain point]?"
        - Keep it conversational`,

    5: `Write the FINAL follow-up email.
        
        Rules:
        - Breakup email tone
        - "Totally understand if timing isn't right"
        - Leave door open
        - "Reply 'later' if I should check back in a few months"
        - Graceful close`,
  };

  const prompt = `You are ${founderName}, founder of JARVIS PRIME — an AI outbound agency for Indian B2B companies.

${stepPrompts[step]}

Prospect info:
- Name: ${prospect.name}
- Title: ${prospect.title || "Unknown"}
- Company: ${prospect.company}
- Industry: ${prospect.industry || "B2B"}
- Revenue estimate: ${prospect.revenue_estimate || "Unknown"}

Output format:
SUBJECT: [subject line]
---
[email body HTML]

Sign off as ${founderName}`;

  const response = await callAI([{ role: "user", content: prompt }], {
    maxTokens: 500,
    temperature: 0.75,
  });

  // Parse response
  const subjectMatch = response.match(/SUBJECT:\s*(.+?)(?:\n|---)/i);
  const subject = subjectMatch ? subjectMatch[1].trim() : `Quick question for ${prospect.company}`;
  const body = response.replace(/SUBJECT:\s*.+?\n---\n?/i, "").trim();

  return {
    subject,
    body: wrapEmailHTML(body, calendly),
  };
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Run if executed directly
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOutboundAgent().catch((err) => {
    console.error("[Outbound Agent] Fatal error:", err.message);
    process.exitCode = 1;
  });
}
