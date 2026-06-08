/**
 * JARVIS PRIME — Agent Runner
 *
 * Schedule:
 *  - Inbound agent: every 15 minutes (checks for new form leads)
 *  - Outbound agent: daily at 9:00 AM IST
 *
 * Run: node --env-file=.env src/runner.js
 */

import cron from "node-cron";
import { runInboundAgent }     from "./agents/inbound-agent.js";
import { runOutboundAgent }    from "./agents/outbound-agent.js";
import { sendTelegram }        from "./lib/telegram.js";

console.log("╔═══════════════════════════════════════╗");
console.log("║   JARVIS PRIME — Agent System Online  ║");
console.log("╚═══════════════════════════════════════╝");
console.log("Started:", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }));
console.log("");

// ── Inbound Agent: every 15 minutes ──
cron.schedule("*/15 * * * *", async () => {
  try {
    await runInboundAgent();
  } catch (err) {
    console.error("[Runner] Inbound agent crashed:", err.message);
    await sendTelegram(`⚠️ *Inbound Agent Error*\n\`${err.message}\``).catch(() => {});
  }
}, { timezone: "Asia/Kolkata" });

// ── Outbound Agent: 9:00 AM IST daily ──
cron.schedule("0 9 * * *", async () => {
  try {
    await runOutboundAgent();
  } catch (err) {
    console.error("[Runner] Outbound agent crashed:", err.message);
    await sendTelegram(`⚠️ *Outbound Agent Error*\n\`${err.message}\``).catch(() => {});
  }
}, { timezone: "Asia/Kolkata" });

// ── Startup: run inbound immediately on launch ──
console.log("Running inbound check on startup...");
runInboundAgent().catch(err => console.error("[Startup] Inbound error:", err.message));

// ── Startup: alert founder ──
sendTelegram(
  `✅ *JARVIS PRIME Agent System Online*\n\n` +
  `🔄 Inbound check: every 15 mins\n` +
  `📤 Outbound send: daily 9 AM IST\n\n` +
  `_Started: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}_`
).catch(() => {});

console.log("✓ Inbound agent: every 15 minutes");
console.log("✓ Outbound agent: daily at 9:00 AM IST");
console.log("✓ Waiting for leads...\n");
