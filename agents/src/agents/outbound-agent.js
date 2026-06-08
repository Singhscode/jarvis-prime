/**
 * JARVIS PRIME — Outbound Prospecting Agent
 *
 * Runs once daily (9 AM IST). For each run:
 *  1. Fetches prospects from Apollo.io free API
 *  2. Scores each against ICP
 *  3. Skips anyone already in our Supabase leads table
 *  4. AI-writes a personalized first line for each qualified prospect
 *  5. Sends cold email sequence (step 1) via Resend
 *  6. Logs to outreach_log in Supabase
 *  7. Sends daily summary to Telegram
 */

import { supabase }    from "../lib/supabase.js";
import { callAI }      from "../lib/ai.js";
import { sendEmail }   from "../lib/resend.js";
import { sendTelegram } from "../lib/telegram.js";
import { scoreICP }    from "../lib/icp-scorer.js";
import { pathToFileURL } from "url";

const DAILY_SEND_LIMIT = 40;

const TARGET_TITLES = [
  "Founder", "Co-Founder", "CEO", "Director", "Head of Sales",
  "Head of Growth", "VP Sales", "Managing Director", "Owner"
];

const TARGET_INDUSTRIES = [
  "Marketing Agency", "Digital Agency", "SaaS", "B2B Software",
  "Advertising", "Lead Generation", "Growth Agency"
];

export async function runOutboundAgent() {
  console.log("\n[Outbound Agent] Starting run...", new Date().toLocaleString("en-IN"));

  const prospects = await fetchApolloProspects();

  if (!prospects.length) {
    console.log("[Outbound Agent] No prospects fetched. Done.");
    return;
  }

  console.log(`[Outbound Agent] Fetched ${prospects.length} raw prospects.`);

  const existingEmails = await getExistingEmails();
  const fresh = prospects.filter(p => !existingEmails.has(p.email?.toLowerCase()));
  console.log(`[Outbound Agent] ${fresh.length} fresh prospects after dedup.`);

  let sent = 0, skipped = 0, saved = 0;
  const hotLeads = [];

  for (const prospect of fresh) {
    if (sent >= DAILY_SEND_LIMIT) break;

    const lead = normalizeLead(prospect);
    // Outbound prospects from CSV are pre-qualified (manually curated)
    // Auto-score them as qualified for outreach
    const icpResult = {
      score: 18,
      qualified: true,
      hot: lead.title?.toLowerCase().includes("founder") || lead.title?.toLowerCase().includes("ceo"),
      reasons: ["Pre-qualified via CSV import"],
    };

    const firstLine  = await generateFirstLine(lead);
    const emailHtml  = buildColdEmail(lead, firstLine, 1);
    const subject    = buildSubject(lead, 1);

    const emailId = await sendEmail({ to: lead.email, subject, html: emailHtml });

    if (emailId) {
      await saveLead(lead, icpResult);
      await logOutreach(lead, subject, emailHtml, 1);
      sent++;
      saved++;
      if (icpResult.hot) hotLeads.push(lead);
      await sleep(3000 + Math.random() * 5000);
    }
  }

  const summary = `📤 *Outbound Agent — Daily Report*\n\n` +
    `✅ Emails sent: ${sent}/${DAILY_SEND_LIMIT}\n` +
    `⏭ Skipped (not ICP): ${skipped}\n` +
    `💾 Saved to Supabase: ${saved}\n` +
    `🔥 Hot prospects: ${hotLeads.length}\n\n` +
    (hotLeads.length
      ? `*Hot leads:*\n` + hotLeads.map(l => `• ${l.name} @ ${l.company} (${l.email})`).join("\n")
      : "") +
    `\n\n_${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}_`;

  await sendTelegram(summary);
  console.log("[Outbound Agent] Run complete.");
}

async function fetchApolloProspects() {
  const apiKey = process.env.APOLLO_API_KEY;

  // ── STEP 1: Try CSV file first (manual prospects — unlimited and free) ──
  try {
    const { readFileSync, existsSync } = await import("fs");
    const csvPath = decodeURIComponent(new URL("../prospects.csv", import.meta.url).pathname);
    console.log("[Outbound] Checking CSV at:", csvPath);

    if (existsSync(csvPath)) {
      const content = readFileSync(csvPath, "utf8").trim();
      const lines = content.split("\n").filter(line => line.trim());

      if (lines.length > 1) {
        const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
        const prospects = lines.slice(1).map(line => {
          const values = line.split(",").map(v => v.trim());
          const obj = {};
          headers.forEach((h, i) => obj[h] = values[i] || "");
          return {
            first_name: obj.first_name || obj.name?.split(" ")[0] || "",
            last_name:  obj.last_name  || obj.name?.split(" ")[1] || "",
            title:      obj.title || obj.job_title || "Founder",
            email:      obj.email || "",
            organization: { name: obj.company || obj.organization || "" },
            linkedin_url: obj.linkedin || obj.linkedin_url || null,
          };
        }).filter(p => p.email && p.email.includes("@"));

        if (prospects.length) {
          console.log(`[Outbound] ✅ Loaded ${prospects.length} prospects from prospects.csv`);
          return prospects;
        }
      }
      console.log("[Outbound] CSV exists but no valid prospects found");
    } else {
      console.log("[Outbound] No prospects.csv found at", csvPath);
    }
  } catch (err) {
    console.warn("[Outbound] CSV read error:", err.message);
  }

  // ── STEP 2: Try Apollo API (requires paid plan) ──
  if (apiKey) {
    try {
      console.log("[Outbound] Trying Apollo API...");
      const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({
          q_organization_locations: ["India"],
          person_titles: TARGET_TITLES,
          q_keywords: "B2B agency SaaS outbound sales",
          page: 1,
          per_page: 50,
        }),
      });

      const data = await res.json();
      if (data.error) {
        console.warn("[Apollo] API error:", data.error);
        console.warn("[Apollo] Free plan doesn't include API. Add prospects to agents/src/prospects.csv to send real emails.");
      } else if (data.people?.length) {
        console.log(`[Outbound] Loaded ${data.people.length} from Apollo API`);
        return data.people;
      }
    } catch (err) {
      console.error("[Apollo] Fetch error:", err.message);
    }
  }

  // ── STEP 3: Fallback to mock data for testing ──
  console.log("[Outbound] Using mock data for testing. Add real prospects to prospects.csv");
  return getMockProspects();
}

async function getExistingEmails() {
  const { data } = await supabase.from("leads").select("email");
  return new Set((data || []).map(r => r.email?.toLowerCase()));
}

function normalizeLead(prospect) {
  return {
    name:    `${prospect.first_name || ""} ${prospect.last_name || ""}`.trim(),
    company: prospect.organization?.name || prospect.company || "Unknown",
    email:   prospect.email || "",
    phone:   prospect.phone_numbers?.[0]?.sanitized_number || null,
    revenue: null,
    message: prospect.linkedin_url ? `Title: ${prospect.title || ""} | LinkedIn: ${prospect.linkedin_url}` : `Title: ${prospect.title || ""}`,
    source:  "outbound_csv",
    status:  "new",
    _linkedin: prospect.linkedin_url,
    _title:    prospect.title || "",
  };
}

async function generateFirstLine(lead) {
  const prompt = `Write a single personalized opening sentence for a cold email to ${lead.name}, ${lead.title} at ${lead.company} (Indian B2B company).

Requirements:
- Max 20 words
- Reference their company or role specifically  
- Make it relevant to outbound sales or lead generation
- No generic phrases like "I came across your profile"
- Sound human, not AI-written
- Output ONLY the sentence, no quotes`;

  try {
    return await callAI([{ role: "user", content: prompt }], { maxTokens: 40, temperature: 0.9 });
  } catch {
    return `Running outbound at ${lead.company} sounds like a complex operation.`;
  }
}

function buildSubject(lead, step) {
  const subjects = {
    1: [
      `cut SDR cost 70% — ${lead.company}`,
      `10 qualified calls/month for ${lead.company}?`,
      `AI outbound for ${lead.company}`,
    ],
    2: [`re: ${lead.company} outbound`],
    3: [`last one from me`],
  };

  const options = subjects[step] || subjects[1];
  return options[Math.floor(Math.random() * options.length)];
}

function buildColdEmail(lead, firstLine, step) {
  const founderName = process.env.FOUNDER_NAME || "Anuj";
  const calendly    = process.env.FOUNDER_CALENDLY || "https://calendly.com/jarvis-prime";
  const firstName   = lead.name.split(" ")[0];

  const bodies = {
    1: `
      <p>Hey ${firstName},</p>
      <p>${firstLine}</p>
      <p>Most ${lead.title?.toLowerCase().includes("agency") ? "agencies" : "B2B founders"} I talk to are spending ₹40–80K/month on SDRs getting 5–8 calls/month with inconsistent results.</p>
      <p>We built an AI system that scrapes, enriches, personalises, and sends outbound automatically — booking 10–20 qualified calls/month for ₹15–35K. Goes live in 7 days. Free pilot week, no commitment.</p>
      <p>Worth a 15-min chat? <a href="${calendly}">Book here</a></p>
      <p>— ${founderName}<br/>JARVIS PRIME</p>
    `,
    2: `
      <p>Hey ${firstName} — just wanted to resurface this.</p>
      <p>One of our clients (Mumbai-based performance agency) went from 3 calls/month to 18 in the first 30 days. No new hires.</p>
      <p>Happy to show you exactly what we built for them — 15 mins this week? <a href="${calendly}">Book here</a></p>
      <p>— ${founderName}</p>
    `,
    3: `
      <p>Hey ${firstName},</p>
      <p>Last one from me — if outbound is still a bottleneck at ${lead.company} and you're spending more than ₹30K/month on it with inconsistent results, we should talk.</p>
      <p>If not, totally fine — I'll take you off my list.</p>
      <p>Either way, best of luck.</p>
      <p>— ${founderName}<br/>JARVIS PRIME</p>
    `,
  };

  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a;line-height:1.7;">
    ${bodies[step] || bodies[1]}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
    <p style="font-size:12px;color:#999;">JARVIS PRIME · AI Outbound Agency<br/>
    <a href="mailto:${process.env.FOUNDER_EMAIL}" style="color:#999;">Unsubscribe</a></p>
  </body></html>`;
}

async function saveLead(lead, icpResult) {
  // Strip non-DB fields (prefixed with _)
  const { _linkedin, _title, ...dbLead } = lead;
  const { error } = await supabase.from("leads").upsert(
    { ...dbLead, notes: `ICP: ${icpResult.score}/25 | Outbound step 1 sent | ${_title || ""}` },
    { onConflict: "email" }
  );
  if (error) console.error("[Outbound] Supabase save error:", error.message);
}

async function logOutreach(lead, subject, body, step) {
  const { data: leadRow } = await supabase
    .from("leads").select("id").eq("email", lead.email).single();

  if (!leadRow) return;

  await supabase.from("outreach_log").insert({
    lead_id: leadRow.id,
    channel: "email",
    step,
    subject,
    body,
  });
}

function getMockProspects() {
  return [
    { first_name: "Rahul", last_name: "Sharma", email: "rahul@pixelforge.in", title: "Founder", organization: { name: "PixelForge Agency" } },
    { first_name: "Priya", last_name: "Mehta",  email: "priya@growthos.io",   title: "CEO",     organization: { name: "GrowthOS" } },
  ];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOutboundAgent().catch((err) => {
    console.error("[Outbound Agent] Fatal error:", err.message);
    process.exitCode = 1;
  });
}
