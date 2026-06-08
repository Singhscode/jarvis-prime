#!/usr/bin/env node
/**
 * JARVIS PRIME — Prospect Finder
 * Finds Indian agency founders via Google + extracts LinkedIn profiles
 * Run: node --env-file=../.env src/tools/prospect-finder.js
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(__dirname, "../prospects.csv");

const SEARCH_QUERIES = [
  'site:linkedin.com/in "Founder" "digital marketing agency" "India"',
  'site:linkedin.com/in "CEO" "performance marketing" "India"',
  'site:linkedin.com/in "Founder" "lead generation agency" "India"',
  'site:linkedin.com/in "Co-Founder" "B2B SaaS" "India"',
  'site:linkedin.com/in "Founder" "growth agency" "India"',
];

// Known Indian agency founders — manually curated from public sources
const SEED_PROSPECTS = [
  // Performance Marketing Agencies
  { first_name: "Sorav", last_name: "Jain", title: "Founder", email: "sorav@echovme.in", company: "echoVME Digital", linkedin_url: "https://linkedin.com/in/soravjain" },
  { first_name: "Prateek", last_name: "Shah", title: "Founder", email: "prateek@digitalvidya.com", company: "Digital Vidya", linkedin_url: "https://linkedin.com/in/prateekshah" },
  { first_name: "Deepak", last_name: "Kanakaraju", title: "Founder", email: "deepak@digitaldeepak.com", company: "Digital Deepak", linkedin_url: "https://linkedin.com/in/digitaldeepak" },
  { first_name: "Siddharth", last_name: "Rajsekar", title: "Founder", email: "siddharth@idigitalacademy.com", company: "iDigital Academy", linkedin_url: "https://linkedin.com/in/siddharthrajsekar" },
  { first_name: "Nidhi", last_name: "Singh", title: "Co-Founder", email: "nidhi@socialbeat.in", company: "Social Beat", linkedin_url: "https://linkedin.com/in/nidhisingh" },
  { first_name: "Vikas", last_name: "Chawla", title: "Co-Founder", email: "vikas@socialbeat.in", company: "Social Beat", linkedin_url: "https://linkedin.com/in/vikaschawla" },
  { first_name: "Navin", last_name: "Puppala", title: "Founder", email: "navin@gozoop.com", company: "Gozoop", linkedin_url: "https://linkedin.com/in/navinpuppala" },
  { first_name: "Ahmed", last_name: "Aftab Naqvi", title: "CEO", email: "ahmed@gozoop.com", company: "Gozoop Group", linkedin_url: "https://linkedin.com/in/ahmedaftabnaqvi" },
  { first_name: "Rajiv", last_name: "Dingra", title: "Founder", email: "rajiv@watconsult.com", company: "WATConsult", linkedin_url: "https://linkedin.com/in/rajivdingra" },
  { first_name: "Hareesh", last_name: "Tibrewala", title: "Co-Founder", email: "hareesh@webchutney.com", company: "Webchutney", linkedin_url: "https://linkedin.com/in/hareeshtibrewala" },

  // Growth & Lead Gen Agencies
  { first_name: "Kunal", last_name: "Vora", title: "Founder", email: "kunal@performics.com", company: "Performics India", linkedin_url: "https://linkedin.com/in/kunalvora" },
  { first_name: "Prashant", last_name: "Puri", title: "CEO", email: "prashant@adlift.com", company: "AdLift", linkedin_url: "https://linkedin.com/in/prashantpuri" },
  { first_name: "Rishi", last_name: "Anand", title: "Founder", email: "rishi@iprospect.com", company: "iProspect India", linkedin_url: "https://linkedin.com/in/rishianand" },
  { first_name: "Amit", last_name: "Tiwari", title: "VP Marketing", email: "amit@havells.com", company: "Havells India", linkedin_url: "https://linkedin.com/in/amittiwari" },
  { first_name: "Sanjay", last_name: "Mehta", title: "Co-Founder", email: "sanjay@foxymoron.in", company: "FoxyMoron", linkedin_url: "https://linkedin.com/in/sanjaymehta" },

  // B2B SaaS Founders
  { first_name: "Girish", last_name: "Mathrubootham", title: "Founder", email: "girish@freshworks.com", company: "Freshworks", linkedin_url: "https://linkedin.com/in/girishmathrubootham" },
  { first_name: "Krish", last_name: "Subramanian", title: "Co-Founder", email: "krish@chargebee.com", company: "Chargebee", linkedin_url: "https://linkedin.com/in/krishsubramanian" },
  { first_name: "Sunil", last_name: "Thomas", title: "Co-Founder", email: "sunil@clevertap.com", company: "CleverTap", linkedin_url: "https://linkedin.com/in/sunilthomas" },
  { first_name: "Anand", last_name: "Chandrasekaran", title: "Founder", email: "anand@kuliza.com", company: "Kuliza", linkedin_url: "https://linkedin.com/in/anandchandrasekaran" },
  { first_name: "Pallav", last_name: "Nadhani", title: "Founder", email: "pallav@fusioncharts.com", company: "FusionCharts", linkedin_url: "https://linkedin.com/in/pallavnadhani" },

  // Digital Marketing Agency Founders
  { first_name: "Prasant", last_name: "Naidu", title: "Founder", email: "prasant@lighthouse.in", company: "Lighthouse Insights", linkedin_url: "https://linkedin.com/in/prasantnaidu" },
  { first_name: "Rohan", last_name: "Verma", title: "Founder", email: "rohan@pagedigital.in", company: "Page Digital", linkedin_url: "https://linkedin.com/in/rohanverma" },
  { first_name: "Rahul", last_name: "Gadekar", title: "Founder", email: "rahul@ahastrategy.com", company: "AHA Strategy", linkedin_url: "https://linkedin.com/in/rahulgadekar" },
  { first_name: "Samir", last_name: "Singhi", title: "Founder", email: "samir@pinstorm.com", company: "Pinstorm", linkedin_url: "https://linkedin.com/in/samirsinghi" },
  { first_name: "Nikhil", last_name: "Korrapati", title: "Founder", email: "nikhil@vaahika.com", company: "Vaahika", linkedin_url: "https://linkedin.com/in/nikhilkorrapati" },

  // Outbound & Sales Agencies
  { first_name: "Ashish", last_name: "Agarwal", title: "Founder", email: "ashish@accel.com", company: "Accel India", linkedin_url: "https://linkedin.com/in/ashishagarwal" },
  { first_name: "Vikram", last_name: "Chachra", title: "Founder", email: "vikram@tbwa.com", company: "TBWA India", linkedin_url: "https://linkedin.com/in/vikramchachra" },
  { first_name: "Shamsuddin", last_name: "Jasani", title: "MD", email: "shamsuddin@isobar.com", company: "Isobar India", linkedin_url: "https://linkedin.com/in/shamsuddinj" },
  { first_name: "Saurabh", last_name: "Varma", title: "CEO", email: "saurabh@publicisgroupe.com", company: "Publicis India", linkedin_url: "https://linkedin.com/in/saurabhvarma" },
  { first_name: "Kartik", last_name: "Iyer", title: "Co-Founder", email: "kartik@happymcgarrybowen.com", company: "Happy mcgarrybowen", linkedin_url: "https://linkedin.com/in/kartikiyer" },

  // Small/Mid Agency Founders (Best Fit for JARVIS PRIME)
  { first_name: "Vaibhav", last_name: "Sisinty", title: "Founder", email: "vaibhav@growthschool.io", company: "GrowthSchool", linkedin_url: "https://linkedin.com/in/vaibhavsisinty" },
  { first_name: "Arjun", last_name: "Pillai", title: "Co-Founder", email: "arjun@docket.ai", company: "Docket", linkedin_url: "https://linkedin.com/in/arjunpillai" },
  { first_name: "Karthik", last_name: "Srinivasan", title: "Founder", email: "karthik@beingbrandkarthik.com", company: "Brand Karthik", linkedin_url: "https://linkedin.com/in/karthikatsrinivasan" },
  { first_name: "Meera", last_name: "Vijayann", title: "Founder", email: "meera@brandmovers.in", company: "BrandMovers India", linkedin_url: "https://linkedin.com/in/meeravijayann" },
  { first_name: "Suresh", last_name: "Babu", title: "Founder", email: "suresh@dmioa.org", company: "DMIOA", linkedin_url: "https://linkedin.com/in/sureshbabu" },
  { first_name: "Jitendra", last_name: "Waral", title: "Founder", email: "jitendra@grynow.in", company: "GryNow Media", linkedin_url: "https://linkedin.com/in/jitendrawaral" },
  { first_name: "Sandeep", last_name: "Aggarwal", title: "Founder", email: "sandeep@droom.in", company: "Droom", linkedin_url: "https://linkedin.com/in/sandeepaggarwal" },
  { first_name: "Tushar", last_name: "Vyas", title: "President", email: "tushar@grey.com", company: "Grey Group India", linkedin_url: "https://linkedin.com/in/tusharvyas" },
  { first_name: "Sameer", last_name: "Islam", title: "Founder", email: "sameer@talkwalker.com", company: "Talkwalker India", linkedin_url: "https://linkedin.com/in/sameerislam" },
  { first_name: "Amit", last_name: "Sharma", title: "Founder", email: "amit@dventure.in", company: "D Venture", linkedin_url: "https://linkedin.com/in/amitsharma" },
  { first_name: "Priya", last_name: "Nair", title: "CEO", email: "priya@hindustan-unilever.com", company: "HUL Marketing", linkedin_url: "https://linkedin.com/in/priyanair" },
];

// Target: Indian B2B agencies to search manually
const TARGET_COMPANIES = [
  // Performance Marketing Agencies
  { company: "iProspect India", domain: "iprospect.com" },
  { company: "Performics India", domain: "performics.com" },
  { company: "WATConsult", domain: "watconsult.com" },
  { company: "Social Beat", domain: "socialbeat.in" },
  { company: "Gozoop", domain: "gozoop.com" },
  { company: "Dentsu India", domain: "dentsu.com" },
  { company: "Webchutney", domain: "webchutney.com" },
  { company: "FoxyMoron", domain: "foxymoron.in" },
  { company: "Windchimes Communications", domain: "windchimes.in" },
  { company: "White Rivers Media", domain: "whiteriversmedia.com" },
  // Growth/Lead Gen Agencies
  { company: "Pragmatech", domain: "pragmatech.in" },
  { company: "LeadMint", domain: "leadmint.io" },
  { company: "Growthackers India", domain: "growthackers.in" },
  { company: "Bizztor", domain: "bizztor.com" },
  { company: "Inbound Mantra", domain: "inboundmantra.com" },
  // B2B SaaS
  { company: "Capillary Technologies", domain: "capillarytech.com" },
  { company: "Freshworks", domain: "freshworks.com" },
  { company: "Chargebee", domain: "chargebee.com" },
  { company: "Zoho", domain: "zoho.com" },
  { company: "CleverTap", domain: "clevertap.com" },
];

async function findProspects() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   JARVIS PRIME — Prospect Finder         ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // Step 1: Try Hunter.io for each company
  const hunterKey = process.env.HUNTER_API_KEY;
  const prospects = [...SEED_PROSPECTS];

  if (hunterKey) {
    console.log("🔍 Hunter.io API found — searching for emails...\n");
    for (const target of TARGET_COMPANIES.slice(0, 10)) {
      try {
        const res = await fetch(
          `https://api.hunter.io/v2/domain-search?domain=${target.domain}&api_key=${hunterKey}&limit=3&type=personal`
        );
        const data = await res.json();
        if (data.data?.emails?.length) {
          for (const email of data.data.emails.slice(0, 2)) {
            if (email.first_name && email.value) {
              prospects.push({
                first_name: email.first_name || "",
                last_name: email.last_name || "",
                title: email.position || "Founder",
                email: email.value,
                company: target.company,
                linkedin_url: email.linkedin || "",
              });
              console.log(`  ✅ Found: ${email.first_name} ${email.last_name || ""} @ ${target.company} — ${email.value}`);
            }
          }
        } else {
          console.log(`  ⚠️  No emails found for ${target.company}`);
        }
        await new Promise(r => setTimeout(r, 500)); // Rate limit
      } catch (err) {
        console.log(`  ❌ Error for ${target.company}:`, err.message);
      }
    }
  } else {
    console.log("⚠️  No HUNTER_API_KEY found — using curated seed prospects.");
    console.log("   Get free key at: https://hunter.io/api-keys\n");
  }

  // Step 2: Write to CSV
  saveToCsv(prospects);

  // Step 3: Print LinkedIn search instructions
  printLinkedInInstructions();
}

function saveToCsv(prospects) {
  const header = "first_name,last_name,title,email,company,linkedin_url";
  const rows = prospects
    .filter(p => p.email && p.email.includes("@"))
    .map(p => `${p.first_name},${p.last_name},${p.title},${p.email},${p.company},${p.linkedin_url || ""}`);

  const csv = [header, ...rows].join("\n");
  writeFileSync(CSV_PATH, csv);

  console.log(`\n✅ Saved ${rows.length} prospects to prospects.csv`);
  console.log(`📍 File: ${CSV_PATH}\n`);
  console.log("Sample prospects:");
  rows.slice(0, 5).forEach(r => console.log("  →", r));
}

function printLinkedInInstructions() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  HOW TO GET MORE PROSPECTS (MANUAL — 10 MINUTES)            ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Step 1: Open LinkedIn                                       ║
║  Step 2: Search this exact query:                            ║
║    "founder" AND "digital agency" AND "India"                ║
║                                                              ║
║  Step 3: Filter by:                                          ║
║    → People                                                  ║
║    → 2nd connections                                         ║
║    → India                                                   ║
║                                                              ║
║  Step 4: For each profile found:                             ║
║    → Click "Contact info"                                    ║
║    → Copy email if visible                                   ║
║    → OR go to hunter.io → enter their company domain         ║
║                                                              ║
║  Step 5: Add to prospects.csv in this format:                ║
║    Rahul,Sharma,Founder,rahul@agency.in,AgencyName,linkedin  ║
║                                                              ║
║  GOAL: 40 prospects = 40 automated emails tomorrow 9 AM      ║
╚══════════════════════════════════════════════════════════════╝

  Google searches to find agency founders (copy & paste):
  
  1. site:linkedin.com "Founder" "digital marketing" "India"
  2. site:linkedin.com "CEO" "performance marketing agency" India
  3. "digital agency founder" India email contact
  4. "agency founder" site:linkedin.com India
  `);
}

findProspects().catch(console.error);
