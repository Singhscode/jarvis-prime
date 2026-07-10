#!/usr/bin/env node

/**
 * CLI Tool: Prospect Enrichment Pipeline
 * Usage: node scripts/enrich-prospects.js [options]
 * 
 * Examples:
 *   node scripts/enrich-prospects.js --action find_agencies --location "India"
 *   node scripts/enrich-prospects.js --action search --keyword "marketing director" --limit 50
 *   node scripts/enrich-prospects.js --action find_agencies --dry-run
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, "../apps/.env.local"),
});

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    const key = args[i].substring(2);
    const nextArg = args[i + 1];
    const value = nextArg && !nextArg.startsWith("--") ? nextArg : true;
    options[key] = value;
    if (typeof value !== "boolean") i++;
  }
}

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const APOLLO_BASE_URL = "https://api.apollo.io/v1";

if (!APOLLO_API_KEY) {
  console.error("❌ APOLLO_API_KEY not configured in .env.local");
  process.exit(1);
}

async function searchProspects(params) {
  console.log("🔍 Searching for prospects...");
  console.log("   Request params:", JSON.stringify(params, null, 2));

  const payload = {
    q_keywords: params.keyword,
    location: params.location,
    page: 1,
    per_page: Math.min(params.limit || 50, 100),
  };

  // Only add optional fields if they're defined
  if (params.industry) payload.industry = params.industry;
  if (params.company_size) payload.company_size = params.company_size;

  console.log("   API Payload:", JSON.stringify(payload, null, 2));

  const response = await fetch(`${APOLLO_BASE_URL}/mixed_people/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": APOLLO_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  console.log("   Response status:", response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.log("   Error response:", errorText);
    throw new Error(`Apollo API error: ${response.status}`);
  }

  const data = await response.json();
  return data.people || [];
}

function enrichProspect(prospect) {
  let icpScore = 0;

  // Score by company size (marketing agencies 10-50 people = perfect fit)
  if (prospect.company_size) {
    if (prospect.company_size.includes("11-50")) {
      icpScore += 40;
    } else if (prospect.company_size.includes("51-100")) {
      icpScore += 30;
    } else if (prospect.company_size.includes("1-10")) {
      icpScore += 20;
    }
  }

  // Score by industry
  if (prospect.industry) {
    const ind = prospect.industry.toLowerCase();
    if (
      ind.includes("marketing") ||
      ind.includes("advertising") ||
      ind.includes("agency")
    ) {
      icpScore += 30;
    } else if (
      ind.includes("technology") ||
      ind.includes("b2b") ||
      ind.includes("sales")
    ) {
      icpScore += 15;
    }
  }

  // Score by title (decision makers)
  if (prospect.title) {
    const title = prospect.title.toLowerCase();
    if (title.includes("founder") || title.includes("ceo")) {
      icpScore += 25;
    } else if (
      title.includes("director") ||
      title.includes("head of") ||
      title.includes("manager")
    ) {
      icpScore += 20;
    }
  }

  // Data quality check
  const hasData = [
    prospect.email,
    prospect.phone_number,
    prospect.linkedin_url,
  ].filter(Boolean).length;
  const dataQuality =
    hasData >= 3 ? "high" : hasData >= 2 ? "medium" : "low";

  return {
    ...prospect,
    icp_match: Math.min(icpScore, 100),
    data_quality: dataQuality,
    enriched_at: new Date().toISOString(),
  };
}

async function runPipeline() {
  const action = options.action || "find_agencies";
  const location = options.location;
  const limit = parseInt(options.limit) || 50;
  const dryRun = options["dry-run"] !== undefined;
  const keyword = options.keyword || "marketing agency";

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🚀 PROSPECT ENRICHMENT PIPELINE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📊 Action: ${action}`);
  console.log(`🎯 Keyword: ${keyword}`);
  if (location) console.log(`📍 Location: ${location}`);
  console.log(`📈 Limit: ${limit}`);
  console.log(`${dryRun ? "🧪 DRY RUN MODE" : "💾 PRODUCTION MODE"}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  try {
    // Search for prospects
    const prospects = await searchProspects({
      keyword,
      location,
      industry: "marketing",
      company_size: "11-50",
      limit,
    });

    console.log(`✓ Found ${prospects.length} prospects\n`);

    if (prospects.length === 0) {
      console.log("⚠️  No prospects found with these criteria");
      return;
    }

    // Enrich prospects
    console.log("🧠 Enriching prospects...");
    const enriched = prospects.map((p) => enrichProspect(p));

    // Filter by ICP score >= 50
    const qualified = enriched.filter((p) => p.icp_match >= 50);
    console.log(
      `✓ ${qualified.length} prospects qualify (ICP score >= 50)\n`
    );

    // Sort by score
    qualified.sort((a, b) => b.icp_match - a.icp_match);

    // Display top prospects
    console.log("🎯 TOP QUALIFIED PROSPECTS:\n");
    qualified.slice(0, 10).forEach((p, i) => {
      console.log(`${i + 1}. ${p.first_name} ${p.last_name}`);
      console.log(`   🏢 ${p.company} | ${p.title}`);
      console.log(`   📧 ${p.email}`);
      if (p.phone_number) console.log(`   📞 ${p.phone_number}`);
      if (p.linkedin_url) console.log(`   🔗 ${p.linkedin_url}`);
      console.log(`   🎯 ICP Score: ${p.icp_match}/100 | Quality: ${p.data_quality}`);
      console.log();
    });

    // Summary
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 SUMMARY:");
    console.log(`   Total found: ${prospects.length}`);
    console.log(`   Qualified: ${qualified.length}`);
    console.log(
      `   High quality: ${qualified.filter((p) => p.data_quality === "high").length}`
    );
    console.log(`   Ready for outreach: ${qualified.filter((p) => p.data_quality !== "low").length}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Export to CSV if not dry run
    if (!dryRun) {
      const csv = generateCSV(qualified);
      const filename = `prospects-${Date.now()}.csv`;
      fs.writeFileSync(filename, csv);
      console.log(`💾 Prospects exported to: ${filename}\n`);
    } else {
      console.log("⏭️  Dry run mode - prospects not saved\n");
    }

    console.log("✅ Pipeline complete!\n");
  } catch (error) {
    console.error("❌ Pipeline error:", error.message);
    process.exit(1);
  }
}

function generateCSV(prospects) {
  const headers = [
    "First Name",
    "Last Name",
    "Email",
    "Phone",
    "Company",
    "Title",
    "LinkedIn",
    "ICP Score",
    "Data Quality",
  ];

  const rows = prospects.map((p) => [
    p.first_name,
    p.last_name,
    p.email,
    p.phone_number || "",
    p.company,
    p.title,
    p.linkedin_url || "",
    p.icp_match,
    p.data_quality,
  ]);

  return [
    headers.join(","),
    ...rows.map((r) => r.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");
}

// Run the pipeline
runPipeline().catch(console.error);
