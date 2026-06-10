/**
 * JARVIS PRIME — Cron Scheduler
 *
 * Runs all agents on schedule:
 * - Inbound Agent: Every 15 minutes (responds to new leads)
 * - Daily Outreach: 9 AM IST (sends follow-ups)
 * - Daily Summary: 6 PM IST (sends Telegram report)
 *
 * USAGE:
 * npm run scheduler    — Start scheduler (keeps running)
 * pm2 start src/scheduler.js --name jarvis-scheduler  — Run with PM2
 */

import "dotenv/config";
import cron from "node-cron";
import { runInboundAgent } from "./agents/inbound-agent.js";
import { runDailyOutreach } from "./agents/daily-outreach.js";
import { sendDailySummary } from "./lib/telegram.js";
import { supabase } from "./lib/supabase.js";

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║         JARVIS PRIME — Automation Scheduler               ║");
console.log("║         All systems operational                            ║");
console.log("╚════════════════════════════════════════════════════════════╝");
console.log(`\nStarted at: ${new Date().toLocaleString("en-IN")}`);
console.log("Timezone: Asia/Kolkata (IST)\n");

// ============================================================================
// SCHEDULE 1: Inbound Agent — Every 15 minutes
// ============================================================================
cron.schedule("*/15 * * * *", async () => {
  console.log("\n[Scheduler] Running Inbound Agent...");
  try {
    await runInboundAgent();
  } catch (error) {
    console.error("[Scheduler] Inbound Agent error:", error.message);
  }
}, {
  timezone: "Asia/Kolkata"
});
console.log("✓ Inbound Agent scheduled: Every 15 minutes");


// ============================================================================
// SCHEDULE 2: Daily Outreach — 9 AM IST
// ============================================================================
cron.schedule("0 9 * * *", async () => {
  console.log("\n[Scheduler] Running Daily Outreach...");
  try {
    await runDailyOutreach();
  } catch (error) {
    console.error("[Scheduler] Daily Outreach error:", error.message);
  }
}, {
  timezone: "Asia/Kolkata"
});
console.log("✓ Daily Outreach scheduled: 9:00 AM IST");

// ============================================================================
// SCHEDULE 3: Daily Summary — 6 PM IST
// ============================================================================
cron.schedule("0 18 * * *", async () => {
  console.log("\n[Scheduler] Generating Daily Summary...");
  try {
    const today = new Date().toISOString().split("T")[0];
    
    // Get today's stats
    const { data: newLeads } = await supabase
      .from("leads")
      .select("id")
      .gte("created_at", `${today}T00:00:00`)
      .lte("created_at", `${today}T23:59:59`);

    const { data: qualified } = await supabase
      .from("leads")
      .select("id")
      .eq("status", "qualified");

    const { data: emailsSent } = await supabase
      .from("outreach_log")
      .select("id")
      .gte("sent_at", `${today}T00:00:00`);

    const { data: meetings } = await supabase
      .from("meetings")
      .select("id")
      .gte("created_at", `${today}T00:00:00`);

    const { data: hotLeads } = await supabase
      .from("leads")
      .select("id")
      .eq("icp_hot", true)
      .gte("created_at", `${today}T00:00:00`);

    await sendDailySummary({
      newLeads: newLeads?.length || 0,
      qualified: qualified?.length || 0,
      hotLeads: hotLeads?.length || 0,
      emailsSent: emailsSent?.length || 0,
      callsBooked: meetings?.length || 0,
      pipelineValue: 0,
    });

    console.log("[Scheduler] Daily summary sent!");
  } catch (error) {
    console.error("[Scheduler] Daily Summary error:", error.message);
  }
}, {
  timezone: "Asia/Kolkata"
});
console.log("✓ Daily Summary scheduled: 6:00 PM IST");

// ============================================================================
// STARTUP MESSAGE
// ============================================================================
console.log("\n════════════════════════════════════════════════════════════");
console.log("All agents scheduled. Scheduler running...");
console.log("Press Ctrl+C to stop.\n");

// Keep alive
process.on("SIGINT", () => {
  console.log("\n[Scheduler] Shutting down gracefully...");
  process.exit(0);
});
