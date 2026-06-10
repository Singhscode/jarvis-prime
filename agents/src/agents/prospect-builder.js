/**
 * JARVIS PRIME — Prospect Builder Agent
 *
 * Builds prospect lists from Apollo.io or LinkedIn Sales Navigator.
 * Scores each prospect against ICP before adding to database.
 */

import { supabase } from "../lib/supabase.js";
import { scoreICP } from "../lib/icp-scorer.js";
import { pathToFileURL } from "url";

// Apollo.io API (if using)
const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const APOLLO_API = "https://api.apollo.io/v1";

export async function buildProspectList(criteria) {
  console.log("\n[Prospect Builder] Starting...", new Date().toLocaleString("en-IN"));
  
  const {
    industry = "Marketing Agency",
    location = "India",
    minEmployees = 5,
    maxEmployees = 100,
    titles = ["Founder", "CEO", "Co-founder", "Managing Director"],
    limit = 100
  } = criteria;

  console.log(`[Prospect Builder] Criteria: ${industry}, ${location}, ${limit} prospects`);

  // Fetch from Apollo (or manual CSV import)
  let prospects = [];
  
  if (APOLLO_API_KEY) {
    prospects = await fetchFromApollo(criteria);
  } else {
    console.log("[Prospect Builder] No Apollo API key — using manual import mode");
    return { success: false, message: "Configure APOLLO_API_KEY or use importFromCSV()" };
  }

  // Score and filter
  const qualified = [];
  for (const prospect of prospects) {
    const icpResult = scoreICP({
      name: prospect.name,
      company: prospect.company,
      revenue: prospect.revenue,
      message: `${prospect.title} at ${prospect.company} in ${prospect.industry}`,
    });

    if (icpResult.score >= 12) {
      qualified.push({
        ...prospect,
        icp_score: icpResult.score,
        icp_fit: icpResult.hot ? "perfect" : icpResult.qualified ? "good" : "maybe",
      });
    }
  }

  console.log(`[Prospect Builder] ${qualified.length}/${prospects.length} passed ICP filter`);

  // Insert into database
  if (qualified.length > 0) {
    const { error } = await supabase.from("prospects").insert(qualified);
    if (error) {
      console.error("[Prospect Builder] Insert error:", error.message);
      return { success: false, message: error.message };
    }
  }

  console.log(`[Prospect Builder] ✓ Added ${qualified.length} prospects to database`);
  return { success: true, added: qualified.length, total: prospects.length };
}


async function fetchFromApollo(criteria) {
  const response = await fetch(`${APOLLO_API}/mixed_people/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": APOLLO_API_KEY,
    },
    body: JSON.stringify({
      person_titles: criteria.titles,
      person_locations: [criteria.location],
      organization_num_employees_ranges: [`${criteria.minEmployees},${criteria.maxEmployees}`],
      q_organization_keyword_tags: [criteria.industry],
      page: 1,
      per_page: criteria.limit,
    }),
  });

  const data = await response.json();
  
  if (!data.people) return [];

  return data.people.map(p => ({
    name: p.name,
    email: p.email,
    phone: p.phone_numbers?.[0]?.sanitized_number,
    linkedin_url: p.linkedin_url,
    company: p.organization?.name,
    title: p.title,
    industry: p.organization?.industry,
    company_size: p.organization?.estimated_num_employees,
    website: p.organization?.website_url,
    location: p.city || p.country,
    source: "apollo",
  }));
}


/**
 * Import prospects from CSV file
 * CSV format: name,email,phone,company,title,linkedin_url
 */
export async function importFromCSV(csvPath) {
  const fs = await import("fs/promises");
  const content = await fs.readFile(csvPath, "utf-8");
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",");

  const prospects = lines.slice(1).map(line => {
    const values = line.split(",");
    const prospect = {};
    headers.forEach((h, i) => {
      prospect[h.trim()] = values[i]?.trim();
    });
    return prospect;
  });

  console.log(`[Prospect Builder] Parsed ${prospects.length} prospects from CSV`);

  // Score and insert
  const qualified = [];
  for (const p of prospects) {
    const icpResult = scoreICP({
      name: p.name,
      company: p.company,
      revenue: p.revenue || "1-5L",
      message: `${p.title} at ${p.company}`,
    });

    qualified.push({
      name: p.name,
      email: p.email,
      phone: p.phone,
      company: p.company,
      title: p.title,
      linkedin_url: p.linkedin_url,
      icp_score: icpResult.score,
      icp_fit: icpResult.hot ? "perfect" : icpResult.qualified ? "good" : "maybe",
      source: "csv_import",
    });
  }

  const { error } = await supabase.from("prospects").insert(qualified);
  if (error) {
    console.error("[Prospect Builder] Insert error:", error.message);
    return { success: false, message: error.message };
  }

  return { success: true, added: qualified.length };
}

// Run if called directly
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args[0] === "--csv") {
    importFromCSV(args[1]).then(console.log).catch(console.error);
  } else {
    buildProspectList({}).then(console.log).catch(console.error);
  }
}
