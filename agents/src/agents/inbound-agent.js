/**
 * JARVIS PRIME — Inbound Lead Response Agent
 *
 * Runs every 15 minutes. For each new lead in Supabase:
 *  1. Scores against ICP
 *  2. Classifies intent with AI
 *  3. Drafts a personalized reply email with AI
 *  4. Sends the reply via Resend
 *  5. Updates lead status in Supabase
 *  6. Sends Telegram alert to founder if lead is hot
 */

import { supabase }    from "../lib/supabase.js";
import { callAI }      from "../lib/ai.js";
import { sendEmail }   from "../lib/resend.js";
import { sendTelegram } from "../lib/telegram.js";
import { scoreICP }    from "../lib/icp-scorer.js";
import { pathToFileURL } from "url";

export async function runInboundAgent() {
  console.log("\n[Inbound Agent] Starting run...", new Date().toLocaleString("en-IN"));

  const { data: leads, error } = await supabase
    .from("leads")
    .select("*")
    .eq("status", "new")
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    console.error("[Inbound Agent] Supabase fetch error:", error.message);
    return;
  }

  if (!leads || leads.length === 0) {
    console.log("[Inbound Agent] No new leads. Done.");
    return;
  }

  console.log(`[Inbound Agent] Found ${leads.length} new lead(s) to process.`);

  for (const lead of leads) {
    await processLead(lead);
    await sleep(2000);
  }

  console.log("[Inbound Agent] Run complete.");
}

async function processLead(lead) {
  console.log(`\n  → Processing: ${lead.name} <${lead.email}>`);

  const icpResult = scoreICP(lead);
  console.log(`     ICP Score: ${icpResult.score}/25 | Qualified: ${icpResult.qualified} | Hot: ${icpResult.hot}`);

  const status = icpResult.hot ? "qualified" : icpResult.qualified ? "contacted" : "closed_lost";

  if (!icpResult.qualified) {
    console.log(`     Skipping — below ICP threshold (score ${icpResult.score})`);
    await supabase.from("leads").update({ status: "closed_lost", notes: `ICP score: ${icpResult.score}. Reasons: ${icpResult.reasons.join(", ")}` }).eq("id", lead.id);
    return;
  }

  // AI: classify intent
  const intent = await classifyIntent(lead);
  console.log(`     Intent: ${intent}`);

  // AI: draft reply
  const emailHtml = await draftReplyEmail(lead, icpResult, intent);

  // Send reply
  const emailId = await sendEmail({
    to: lead.email,
    subject: `Re: Your inquiry — let's talk, ${lead.name.split(" ")[0]}`,
    html: emailHtml,
  });

  // Update Supabase
  await supabase.from("leads").update({
    status,
    notes: `ICP: ${icpResult.score}/25. Intent: ${intent}. Reply sent: ${emailId || "failed"}`,
  }).eq("id", lead.id);

  // Log outreach
  await supabase.from("outreach_log").insert({
    lead_id: lead.id,
    channel: "email",
    step: 1,
    subject: `Re: Your inquiry — let's talk, ${lead.name.split(" ")[0]}`,
    body: emailHtml,
  });

  // Telegram alert for hot leads
  if (icpResult.hot) {
    await sendTelegram(
      `🔥 *HOT LEAD — Act Now!*\n\n` +
      `👤 ${lead.name} @ ${lead.company}\n` +
      `📧 ${lead.email}\n` +
      `📱 ${lead.phone || "No phone"}\n` +
      `💰 Revenue: ${lead.revenue || "Unknown"}\n` +
      `🎯 ICP Score: ${icpResult.score}/25\n` +
      `🧠 Intent: ${intent}\n\n` +
      `✅ Auto-reply sent. Follow up personally within 1 hour!`
    );
  }

  console.log(`     ✓ Done — status: ${status}, email: ${emailId ? "sent" : "failed"}`);
}

async function classifyIntent(lead) {
  const prompt = `You are a B2B sales classifier. Classify this lead's intent in 3-5 words.

Lead info:
- Company: ${lead.company}
- Revenue: ${lead.revenue || "unknown"}
- Message: "${lead.message || "no message"}"

Respond with ONLY a short intent label like:
"Wants lead generation", "Exploring outbound automation", "Ready to buy", "Just browsing", "Needs more demos"`;

  try {
    return await callAI([{ role: "user", content: prompt }], { maxTokens: 20, temperature: 0.3 });
  } catch {
    return "Intent unclear";
  }
}

async function draftReplyEmail(lead, icpResult, intent) {
  const founderName = process.env.FOUNDER_NAME || "Anuj";
  const calendly = process.env.FOUNDER_CALENDLY || "https://calendly.com/jarvis-prime";

  const prompt = `You are ${founderName}, founder of JARVIS PRIME — an AI outbound agency for Indian B2B companies.

Write a warm, conversational reply email to ${lead.name} from ${lead.company}.

Context:
- Their revenue: ${lead.revenue || "not shared"}
- Their message: "${lead.message || "no message — they just submitted the form"}"
- Their intent: ${intent}
- ICP score: ${icpResult.score}/25 (${icpResult.hot ? "hot lead" : "qualified lead"})

Rules:
- Be direct and human — no corporate fluff
- 3–4 short paragraphs max
- Acknowledge their specific situation
- Mention 1 relevant result (e.g., "we helped a Mumbai agency book 18 calls/month")
- End with a clear CTA: book a free 30-min call via this link: ${calendly}
- Sign off as ${founderName}, JARVIS PRIME
- Output ONLY the email HTML body (no subject line, no markdown)`;

  try {
    const content = await callAI([{ role: "user", content: prompt }], { maxTokens: 400, temperature: 0.75 });
    return wrapEmailHTML(content, calendly);
  } catch (err) {
    console.error("[Inbound Agent] AI draft failed:", err.message);
    return fallbackEmail(lead, founderName, calendly);
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

function fallbackEmail(lead, founderName, calendly) {
  return wrapEmailHTML(
    `<p>Hi ${lead.name.split(" ")[0]},</p>
    <p>Thanks for reaching out to JARVIS PRIME. I've reviewed your submission and I'd love to show you exactly what we can build for ${lead.company}.</p>
    <p>We've helped agencies like yours go from 3–5 scattered leads/month to 15–20 qualified calls on autopilot — in under 30 days.</p>
    <p>Can we get 30 minutes on a call this week? Book directly here: <a href="${calendly}">${calendly}</a></p>
    <p>Looking forward to speaking,<br/>${founderName}</p>`,
    calendly
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runInboundAgent().catch((err) => {
    console.error("[Inbound Agent] Fatal error:", err.message);
    process.exitCode = 1;
  });
}
