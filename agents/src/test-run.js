/**
 * JARVIS PRIME — Live System Test
 * Verifies all REAL integrations are working.
 * Run: npm run test   (uses node --env-file=.env)
 */

import { supabase } from "./lib/supabase.js";
import { callAI } from "./lib/ai.js";
import { sendTelegram } from "./lib/telegram.js";
import { scoreICP } from "./lib/icp-scorer.js";

console.log("\n=== JARVIS PRIME — Live System Test ===\n");

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const no = (m) => { console.log(`  ✗ ${m}`); fail++; };

// 1. Env
console.log("1. Environment variables");
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GROQ_API_KEY", "RESEND_API_KEY", "TELEGRAM_BOT_TOKEN", "APOLLO_API_KEY"]) {
  process.env[k] ? ok(`${k} set`) : no(`${k} MISSING`);
}

// 2. ICP scorer (no network)
console.log("\n2. ICP Scorer");
const r = scoreICP({ name: "Test Founder", company: "Growth Agency", revenue: "5-20L", message: "founder looking for outbound lead gen", phone: "+919876543210" });
r.score >= 15 ? ok(`scored ${r.score}/25 (qualified)`) : no(`scored ${r.score}/25`);

// 3. Supabase
console.log("\n3. Supabase connection");
try {
  const { error } = await supabase.from("leads").select("id").limit(1);
  error ? no(`Supabase: ${error.message}`) : ok("Supabase connected, 'leads' table reachable");
} catch (e) { no(`Supabase: ${e.message}`); }

// 4. Groq AI
console.log("\n4. AI (Groq/OpenAI)");
try {
  const out = await callAI([{ role: "user", content: "Reply with exactly: OK" }], { maxTokens: 5 });
  out ? ok(`AI responded: "${out}"`) : no("AI empty response");
} catch (e) { no(`AI: ${e.message}`); }

// 5. Telegram
console.log("\n5. Telegram");
try {
  await sendTelegram("🧪 JARVIS PRIME system test — all systems check.");
  ok("Telegram message sent (check your phone)");
} catch (e) { no(`Telegram: ${e.message}`); }

console.log(`\n=== Result: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail > 0 ? 1 : 0);
