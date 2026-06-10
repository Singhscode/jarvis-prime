/**
 * JARVIS PRIME — System Test
 *
 * Tests all components to verify setup is correct.
 * Run: npm run test
 */

import "dotenv/config";
import { supabase } from "./lib/supabase.js";
import { scoreICP } from "./lib/icp-scorer.js";

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║         JARVIS PRIME — System Test                         ║");
console.log("╚════════════════════════════════════════════════════════════╝\n");

async function runTests() {
  let passed = 0;
  let failed = 0;

  // Test 1: Environment Variables
  console.log("1. Testing Environment Variables...");
  const envVars = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "OPENAI_API_KEY",
    "RESEND_API_KEY",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID"
  ];

  for (const v of envVars) {
    if (process.env[v]) {
      console.log(`   ✓ ${v} configured`);
      passed++;
    } else {
      console.log(`   ✗ ${v} MISSING`);
      failed++;
    }
  }

  // Test 2: Supabase Connection
  console.log("\n2. Testing Supabase Connection...");
  try {
    const { data, error } = await supabase.from("leads").select("id").limit(1);
    if (error) throw error;
    console.log("   ✓ Supabase connected successfully");
    passed++;
  } catch (err) {
    console.log(`   ✗ Supabase error: ${err.message}`);
    failed++;
  }

  // Test 3: ICP Scorer
  console.log("\n3. Testing ICP Scorer...");
  const testLead = {
    name: "Rahul Sharma",
    company: "TechAgency India",
    revenue: "5-20L",
    message: "Looking for outbound automation, I'm the founder",
    phone: "+91-9876543210"
  };

  const result = scoreICP(testLead);
  console.log(`   Lead: ${testLead.name} @ ${testLead.company}`);
  console.log(`   Score: ${result.score}/25`);
  console.log(`   Qualified: ${result.qualified}`);
  console.log(`   Hot: ${result.hot}`);
  console.log(`   Reasons: ${result.reasons.join(", ")}`);

  if (result.score >= 15) {
    console.log("   ✓ ICP Scorer working correctly");
    passed++;
  } else {
    console.log("   ✗ ICP Scorer may have issues");
    failed++;
  }


  // Test 4: OpenAI Connection
  console.log("\n4. Testing OpenAI Connection...");
  if (process.env.OPENAI_API_KEY) {
    try {
      const { callAI } = await import("./lib/ai.js");
      const response = await callAI([
        { role: "user", content: "Say 'JARVIS PRIME is operational' in exactly 5 words." }
      ], { maxTokens: 20 });
      console.log(`   Response: "${response}"`);
      console.log("   ✓ OpenAI connected successfully");
      passed++;
    } catch (err) {
      console.log(`   ✗ OpenAI error: ${err.message}`);
      failed++;
    }
  } else {
    console.log("   ⚠ Skipped (no API key)");
  }

  // Test 5: Telegram Connection
  console.log("\n5. Testing Telegram Connection...");
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    try {
      const { sendTelegram } = await import("./lib/telegram.js");
      const success = await sendTelegram("🧪 *Test Message*\n\nJARVIS PRIME system test successful!");
      if (success) {
        console.log("   ✓ Telegram message sent (check your Telegram!)");
        passed++;
      } else {
        console.log("   ✗ Telegram send failed");
        failed++;
      }
    } catch (err) {
      console.log(`   ✗ Telegram error: ${err.message}`);
      failed++;
    }
  } else {
    console.log("   ⚠ Skipped (no credentials)");
  }

  // Test 6: Resend Connection
  console.log("\n6. Testing Resend Connection...");
  if (process.env.RESEND_API_KEY) {
    console.log("   ⚠ Resend configured (skipping actual send to avoid spam)");
    console.log("   ✓ RESEND_API_KEY present");
    passed++;
  } else {
    console.log("   ⚠ Skipped (no API key)");
  }

  // Summary
  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log("════════════════════════════════════════════════════════════");

  if (failed === 0) {
    console.log("\n🎉 All tests passed! Your system is ready.\n");
    console.log("Next steps:");
    console.log("  1. Run: npm run scheduler");
    console.log("  2. Submit a test lead on your website");
    console.log("  3. Watch the magic happen!\n");
  } else {
    console.log("\n⚠️  Some tests failed. Please fix the issues above.\n");
    console.log("Refer to CLIENT_HANDOVER_PACKAGE.md for setup instructions.\n");
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error("Test failed:", err.message);
  process.exit(1);
});
