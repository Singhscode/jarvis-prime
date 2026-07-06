#!/usr/bin/env node

/**
 * CLI Tool: LinkedIn Prospect Enrichment
 * Usage: node scripts/enrich-linkedin-prospects.js [options]
 * 
 * Examples:
 *   node scripts/enrich-linkedin-prospects.js --input prospects.csv
 *   node scripts/enrich-linkedin-prospects.js --search "CEO" --location "India"
 *   node scripts/enrich-linkedin-prospects.js --help
 */

const fs = require("fs");
const path = require("path");

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

// Show help
if (options.help) {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║   LinkedIn Prospect Enrichment Tool                                ║
║   Convert LinkedIn prospects to enriched leads                     ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝

USAGE:
  node scripts/enrich-linkedin-prospects.js [options]

OPTIONS:
  --input <file>       Input CSV file with LinkedIn prospects
  --search <query>     Generate LinkedIn search URL
  --location <city>    Filter by location
  --output <file>      Output file (default: enriched-[timestamp].csv)
  --help               Show this help message

EXAMPLES:

1. Enrich CSV file of LinkedIn prospects:
   node scripts/enrich-linkedin-prospects.js --input prospects.csv

2. Generate LinkedIn search URL:
   node scripts/enrich-linkedin-prospects.js --search "CEO" --location "India"

3. Show LinkedIn search guide:
   node scripts/enrich-linkedin-prospects.js --guide

INPUT CSV FORMAT:
  first_name,last_name,email,title,company,location,linkedin_url
  Anuj,Singh,anuj@example.com,CEO,JARVIS PRIME,India,linkedin.com/in/anuj
  ...

OUTPUT:
  Enriched CSV with ICP scores (0-100) and data quality ratings
`);
  process.exit(0);
}

// Show guide
if (options.guide) {
  showLinkedInGuide();
  process.exit(0);
}

// Generate search URL
if (options.search) {
  generateSearchGuide(options);
  process.exit(0);
}

// Enrich prospects from CSV
if (options.input) {
  enrichProspectsFromCSV(options);
} else {
  console.log("❌ Missing required option: --input or --search");
  console.log("   Use --help for usage information");
  process.exit(1);
}

async function enrichProspectsFromCSV(opts) {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔗 LINKEDIN PROSPECT ENRICHMENT");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const inputFile = opts.input;
  const outputFile = opts.output || `enriched-${Date.now()}.csv`;

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Input file not found: ${inputFile}`);
    process.exit(1);
  }

  try {
    // Read CSV
    console.log(`📖 Reading prospects from: ${inputFile}`);
    const csvContent = fs.readFileSync(inputFile, "utf-8");
    const lines = csvContent.trim().split("\n");

    if (lines.length < 2) {
      console.error("❌ CSV must have header row and at least 1 data row");
      process.exit(1);
    }

    // Parse header
    const header = lines[0].split(",").map((h) => h.trim());
    console.log(`✓ Found ${lines.length - 1} prospects\n`);

    // Enrich prospects
    console.log("🧠 Enriching prospects...");
    const enriched = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",");
      const prospect = {};

      header.forEach((h, idx) => {
        prospect[h] = values[idx]?.trim() || "";
      });

      const enrichedProspect = enrichProspect(prospect);
      enriched.push(enrichedProspect);

      if ((i - 1) % 5 === 0) {
        process.stdout.write(`   ${i}/${lines.length - 1}\r`);
      }
    }

    console.log(`   ✓ ${enriched.length} prospects enriched\n`);

    // Sort by ICP score
    enriched.sort((a, b) => b.icp_score - a.icp_score);

    // Generate output
    console.log("📊 Generating report...");

    const outputHeader = [
      "First Name",
      "Last Name",
      "Email",
      "Title",
      "Company",
      "LinkedIn URL",
      "ICP Score",
      "Data Quality",
      "Source",
    ];

    const outputLines = [
      outputHeader.join(","),
      ...enriched.map((p) =>
        [
          p.first_name,
          p.last_name,
          p.email,
          p.title,
          p.company,
          p.linkedin_url,
          p.icp_score,
          p.data_quality,
          "linkedin",
        ]
          .map((v) => `"${v}"`)
          .join(",")
      ),
    ];

    const outputCSV = outputLines.join("\n");

    // Save file
    fs.writeFileSync(outputFile, outputCSV);
    console.log(`✓ Saved to: ${outputFile}\n`);

    // Display summary
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 SUMMARY:");
    console.log(`   Total prospects: ${enriched.length}`);
    console.log(
      `   High quality: ${enriched.filter((p) => p.data_quality === "high").length}`
    );
    console.log(`   ICP score 70+: ${enriched.filter((p) => p.icp_score >= 70).length}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Show top 5
    console.log("🏆 TOP 5 PROSPECTS:");
    enriched.slice(0, 5).forEach((p, i) => {
      console.log(
        `${i + 1}. ${p.first_name} ${p.last_name} (${p.company}) - ${p.icp_score}/100`
      );
    });

    console.log("\n✅ Enrichment complete!\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

function enrichProspect(prospect) {
  let icpScore = 0;

  // Score by title
  if (prospect.title) {
    const title = prospect.title.toLowerCase();
    if (title.includes("founder") || title.includes("ceo")) {
      icpScore += 30;
    } else if (
      title.includes("director") ||
      title.includes("head") ||
      title.includes("manager")
    ) {
      icpScore += 25;
    } else if (title.includes("operations") || title.includes("vp")) {
      icpScore += 20;
    }
  }

  // Score by company
  if (prospect.company) {
    const company = prospect.company.toLowerCase();
    if (
      company.includes("agency") ||
      company.includes("digital") ||
      company.includes("marketing")
    ) {
      icpScore += 35;
    } else if (company.includes("tech") || company.includes("startup")) {
      icpScore += 20;
    }
  }

  // Data quality
  const hasData = [
    prospect.email,
    prospect.linkedin_url,
    prospect.title,
    prospect.company,
  ].filter(Boolean).length;

  const dataQuality = hasData >= 3 ? "high" : hasData >= 2 ? "medium" : "low";

  return {
    ...prospect,
    icp_score: Math.min(icpScore, 100),
    data_quality: dataQuality,
  };
}

function generateSearchGuide(opts) {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║   LinkedIn Search Guide for Prospects                              ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝

SEARCH: ${opts.search || "CEO"}
LOCATION: ${opts.location || "India"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1: Open LinkedIn Search
  Go to: linkedin.com/search/results/people/

STEP 2: Enter Search Query
  In the search box at top, enter:
  
  "${opts.search || "CEO"}" location:"${opts.location || "India"}"

  Or use these filters:
  • Title field: ${opts.search || "CEO"}
  • Location: ${opts.location || "India"}
  • Keywords: marketing, agency, digital

STEP 3: Apply Filters
  • Current job title
  • Current company
  • Company size: 11-50 people (for marketing agencies)
  • Connection degree: 1st connections (better data)

STEP 4: Review Results
  • Look at matching profiles
  • Check job title in headline
  • Click profiles to get more info

STEP 5: Get Contact Info
  For each prospect profile:
  1. Find "Open to work" section (if visible)
  2. Check "Contact info" tab
  3. Look for email address
  4. Get their title and company

STEP 6: Export Prospects
  Create a CSV file with:
  first_name, last_name, email, title, company, location, linkedin_url
  
  OR use browser extension:
  • "LinkedIn to Sheets" extension
  • Auto-exports profiles to Google Sheets

STEP 7: Enrich Prospects
  Once you have CSV file, run:
  
  node scripts/enrich-linkedin-prospects.js --input your-file.csv

STEP 8: Score Results
  You'll get:
  • ICP match score (0-100)
  • Data quality rating
  • Top prospects highlighted
  • Ready for cold email outreach

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXPECTED TIME:
  Manual search: 1 hour for 20-30 prospects
  Enrichment: 30 seconds automatic
  Total: ~1 hour for 20 ready-to-email prospects

NEXT STEP:
  1. Find and copy 20-30 prospects from LinkedIn
  2. Create prospects.csv file
  3. Run: node scripts/enrich-linkedin-prospects.js --input prospects.csv
  4. Get your enriched list
  5. Start sending cold emails

START NOW:
  Go to: linkedin.com/search/results/people/
  Search for: ${opts.search || "CEO"} in ${opts.location || "India"}
  
  Good luck! 🚀

`);
}

function showLinkedInGuide() {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║   LinkedIn Prospect Search Complete Guide                          ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝

WHY LINKEDIN FOR PROSPECTS?
  ✓ Free (no API key needed)
  ✓ Huge database (900M+ professionals)
  ✓ Real people with real profiles
  ✓ Verified employment info
  ✓ Can see company size and industry

GETTING STARTED:

1. MANUAL SEARCH METHOD (Fastest to start)
   $ node scripts/enrich-linkedin-prospects.js --search "CEO" --location "India"
   
   This generates a guide with:
   • Search URL to use on LinkedIn
   • Exact steps to find prospects
   • How to extract emails
   • How to save as CSV

2. IMPORT CSV METHOD (Once you have prospects)
   $ node scripts/enrich-linkedin-prospects.js --input prospects.csv
   
   Input file format:
   first_name,last_name,email,title,company
   Anuj,Singh,anuj@example.com,CEO,JARVIS PRIME
   Raj,Patel,raj@example.com,Founder,TechGrowth
   
   Output includes:
   • ICP score (0-100)
   • Data quality (high/medium/low)
   • Sorted by match score
   • Ready for email outreach

3. SALES NAVIGATOR METHOD (For advanced users)
   • $99/month subscription
   • Advanced filters
   • Bulk export
   • Email finder
   • Much faster (100s in minutes vs manual)

QUICK START (Right now):
  1. Run: node scripts/enrich-linkedin-prospects.js --search "CEO" --location "India"
  2. Copy the LinkedIn search URL
  3. Open in browser
  4. Find 20-30 prospects manually
  5. Copy their emails
  6. Create prospects.csv
  7. Run: node scripts/enrich-linkedin-prospects.js --input prospects.csv
  8. Get enriched list
  9. Start emailing

COST:
  ✓ Free search: $0
  ✓ Sales Navigator: $99-499/month (optional)
  ✓ Our CLI tool: Free (included)

TIME ESTIMATE:
  Free method: 1-2 hours per 50 prospects
  Sales Navigator: 15 minutes per 50 prospects

BEST USE:
  Week 1: Free LinkedIn search (test concept)
  Week 3+: If working, upgrade to Sales Navigator
  Month 2+: Combine with Apollo.io for maximum prospects

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ready to start?

Option 1: Generate search guide
  node scripts/enrich-linkedin-prospects.js --search "CEO" --location "India"

Option 2: See all options
  node scripts/enrich-linkedin-prospects.js --help

Let's find prospects! 🚀

`);
}
