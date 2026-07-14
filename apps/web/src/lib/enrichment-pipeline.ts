/**
 * Prospect Enrichment Pipeline
 * Integrates Apollo.io and LinkedIn with your outbound automation engine
 * Flow: Search → Enrich → Score → Store → Ready for outreach
 */

import {
  searchProspects,
  enrichProspects,
  findDecisionMakers,
  getCompanyInfo,
  verifyEmail,
  ApolloProspect,
  EnrichedProspect,
  ApolloSearchParams,
} from "./apollo-client";

import {
  enrichLinkedInProspect,
  generateManualLinkedInGuide,
  generateSourceComparison,
  buildLinkedInSearchURL,
  LinkedInProspect,
  EnrichedLinkedInProspect,
} from "./linkedin-scraper";

export interface EnrichmentPipelineConfig {
  minICPScore?: number; // Minimum ICP score to include (0-100)
  minDataQuality?: "high" | "medium" | "low"; // Minimum data quality threshold
  verifyEmails?: boolean; // Verify emails before storing
  autoTag?: boolean; // Automatically tag prospects
  dryRun?: boolean; // Test without storing
}

export interface EnrichmentResult {
  success: boolean;
  prospectCount: number;
  enrichedCount: number;
  highQualityCount: number;
  prospects: EnrichedProspect[];
  errors: string[];
  timestamp: string;
}

const DEFAULT_CONFIG: EnrichmentPipelineConfig = {
  minICPScore: 50,
  minDataQuality: "medium",
  verifyEmails: false, // Set to true for production
  autoTag: true,
  dryRun: false,
};

/**
 * JARVIS PRIME ICP Profile
 * Target: Marketing agencies, 10-50 employees
 */
const JARVIS_ICP = {
  industry: ["marketing", "advertising", "agency", "digital agency"],
  company_size: ["11-50", "51-100"],
  keywords: [
    "marketing agency",
    "digital agency",
    "marketing director",
    "ops director",
  ],
};

/**
 * Main enrichment pipeline
 * Searches, scores, and stores prospects in one flow
 */
export async function runEnrichmentPipeline(
  searchParams: ApolloSearchParams,
  config: EnrichmentPipelineConfig = DEFAULT_CONFIG
): Promise<EnrichmentResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const errors: string[] = [];
  let prospects: EnrichedProspect[] = [];

  console.log("🚀 Starting enrichment pipeline...");
  console.log(`📊 Config:`, finalConfig);

  try {
    // Step 1: Search for prospects
    console.log("🔍 Step 1: Searching for prospects...");
    let rawProspects: ApolloProspect[] = [];

    try {
      rawProspects = await searchProspects(searchParams);
      console.log(`✓ Found ${rawProspects.length} prospects`);
    } catch (error) {
      const errorMsg = `Search failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      console.error(`✗ ${errorMsg}`);
      return {
        success: false,
        prospectCount: 0,
        enrichedCount: 0,
        highQualityCount: 0,
        prospects: [],
        errors,
        timestamp: new Date().toISOString(),
      };
    }

    // Step 2: Enrich and score prospects
    console.log("🧠 Step 2: Enriching and scoring prospects...");
    try {
      prospects = await enrichProspects(
        rawProspects,
        finalConfig.minICPScore || 50
      );
      console.log(
        `✓ Enriched ${prospects.length} prospects (score >= ${finalConfig.minICPScore})`
      );
    } catch (error) {
      const errorMsg = `Enrichment failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      console.error(`✗ ${errorMsg}`);
    }

    // Step 3: Filter by data quality
    console.log("✨ Step 3: Filtering by data quality...");
    const qualityMap = { high: 3, medium: 2, low: 1 };
    const minQualityLevel = qualityMap[finalConfig.minDataQuality || "medium"];

    prospects = prospects.filter(
      (p) => qualityMap[p.data_quality] >= minQualityLevel
    );
    console.log(`✓ ${prospects.length} prospects meet quality threshold`);

    // Step 4: Verify emails (optional, production only)
    if (finalConfig.verifyEmails && !finalConfig.dryRun) {
      console.log("📧 Step 4: Verifying email addresses...");
      const verifiedProspects: EnrichedProspect[] = [];

      for (const prospect of prospects) {
        try {
          const isValid = await verifyEmail(prospect.email);
          if (isValid) {
            verifiedProspects.push(prospect);
          } else {
            console.log(`⚠️  Email verification failed: ${prospect.email}`);
          }
        } catch (error) {
          console.error(`Email verification error for ${prospect.email}:`, error);
        }
      }

      prospects = verifiedProspects;
      console.log(`✓ ${prospects.length} emails verified`);
    }

    // Step 5: Store prospects (if not dry run)
    if (!finalConfig.dryRun) {
      console.log("💾 Step 5: Storing prospects...");
      try {
        await storeProspects(prospects);
        console.log(`✓ Stored ${prospects.length} prospects`);
      } catch (error) {
        const errorMsg = `Storage failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        console.error(`✗ ${errorMsg}`);
      }
    } else {
      console.log("⏭️  Skipping storage (dry run mode)");
    }

    // Generate report
    const highQualityCount = prospects.filter(
      (p) => p.data_quality === "high"
    ).length;

    console.log("\n✅ Pipeline Complete!");
    console.log(`📊 Summary:`);
    console.log(`   Total prospects: ${prospects.length}`);
    console.log(`   High quality: ${highQualityCount}`);
    console.log(`   Errors: ${errors.length}`);

    return {
      success: errors.length === 0,
      prospectCount: prospects.length,
      enrichedCount: prospects.length,
      highQualityCount,
      prospects,
      errors,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const errorMsg = `Fatal pipeline error: ${error instanceof Error ? error.message : String(error)}`;
    errors.push(errorMsg);
    console.error(`✗ ${errorMsg}`);

    return {
      success: false,
      prospectCount: 0,
      enrichedCount: 0,
      highQualityCount: 0,
      prospects: [],
      errors,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Quick search for marketing agency decision makers
 * Pre-configured for JARVIS PRIME ICP
 */
export async function findMarketingAgencyLeads(
  location?: string,
  limit: number = 50
): Promise<EnrichmentResult> {
  console.log(
    `🎯 Finding marketing agency decision makers (location: ${location || "any"})`
  );

  return runEnrichmentPipeline(
    {
      keyword: "marketing agency",
      location,
      industry: "marketing",
      per_page: limit,
    },
    {
      minICPScore: 60,
      minDataQuality: "high",
      dryRun: false,
    }
  );
}

/**
 * Search for prospects at specific companies
 */
export async function findProspectsAtCompanies(
  companyDomains: string[]
): Promise<EnrichmentResult> {
  console.log(`🏢 Finding prospects at ${companyDomains.length} companies`);

  const allProspects: EnrichedProspect[] = [];
  const errors: string[] = [];

  for (const domain of companyDomains) {
    try {
      const result = await runEnrichmentPipeline({
        company_domain: domain,
        per_page: 100,
      });

      if (result.success) {
        allProspects.push(...result.prospects);
      } else {
        errors.push(`Failed to find prospects at ${domain}`);
      }
    } catch (error) {
      errors.push(
        `Error for ${domain}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return {
    success: errors.length === 0,
    prospectCount: allProspects.length,
    enrichedCount: allProspects.length,
    highQualityCount: allProspects.filter((p) => p.data_quality === "high")
      .length,
    prospects: allProspects,
    errors,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Store prospects in database (Supabase)
 * Called automatically by the pipeline
 */
async function storeProspects(prospects: EnrichedProspect[]): Promise<void> {
  // Store in Supabase for later use
  const response = await fetch("/api/leads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prospects: prospects.map((p) => ({
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
        phone: p.phone_number,
        title: p.title,
        company: p.company,
        linkedin_url: p.linkedin_url,
        icp_score: p.icp_match,
        data_quality: p.data_quality,
        source: "apollo",
        status: "new",
        enriched_at: p.enriched_at,
      })),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to store prospects: ${response.statusText}`);
  }
}

/**
 * Generate enrichment report
 */
export function generateReport(result: EnrichmentResult): string {
  return `
📋 ENRICHMENT PIPELINE REPORT
${new Date(result.timestamp).toLocaleString()}

✅ Status: ${result.success ? "SUCCESS" : "FAILED"}

📊 METRICS:
  • Total prospects found: ${result.prospectCount}
  • Enriched prospects: ${result.enrichedCount}
  • High quality prospects: ${result.highQualityCount}
  • Success rate: ${result.prospectCount > 0 ? Math.round((result.highQualityCount / result.prospectCount) * 100) : 0}%

🎯 TOP PROSPECTS:
${result.prospects
  .slice(0, 5)
  .map(
    (p, i) => `
  ${i + 1}. ${p.first_name} ${p.last_name}
     • Company: ${p.company}
     • Title: ${p.title}
     • Email: ${p.email}
     • ICP Score: ${p.icp_match}/100
     • Data Quality: ${p.data_quality}
`
  )
  .join("")}

${result.errors.length > 0 ? `\n❌ ERRORS:\n${result.errors.map((e) => `  • ${e}`).join("\n")}` : ""}

---
Total prospects ready for outreach: ${result.highQualityCount}
  `;
}

const enrichmentPipeline = {
  runEnrichmentPipeline,
  findMarketingAgencyLeads,
  findProspectsAtCompanies,
  generateReport,
};

export default enrichmentPipeline;
