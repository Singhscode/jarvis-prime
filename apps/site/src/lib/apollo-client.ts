/**
 * Apollo.io API Client
 * Handles prospect research, lead enrichment, and contact information
 */

const APOLLO_BASE_URL = "https://api.apollo.io/v1";
const APOLLO_API_KEY = process.env.APOLLO_API_KEY;

export interface ApolloProspect {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
  title: string;
  company: string;
  linkedin_url?: string;
  company_website?: string;
  company_size?: string;
  industry?: string;
  icp_score?: number;
  created_at?: string;
}

export interface ApolloSearchParams {
  keyword?: string; // Job title, company name, etc.
  location?: string;
  company_domain?: string;
  company_size?: string;
  industry?: string;
  min_revenue?: number;
  max_revenue?: number;
  filters?: Record<string, any>;
  per_page?: number;
  page?: number;
}

export interface EnrichedProspect extends ApolloProspect {
  icp_match: number; // 0-100 score for ICP matching
  enriched_at: string;
  data_quality: "high" | "medium" | "low";
}

/**
 * Search for prospects in Apollo.io
 * Useful for finding marketing agency decision makers
 */
export async function searchProspects(
  params: ApolloSearchParams
): Promise<ApolloProspect[]> {
  if (!APOLLO_API_KEY) {
    throw new Error("APOLLO_API_KEY not configured");
  }

  try {
    const response = await fetch(`${APOLLO_BASE_URL}/mixed_people/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": APOLLO_API_KEY,
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({
        q_keywords: params.keyword,
        location: params.location,
        company_domain: params.company_domain,
        company_size: params.company_size,
        industry: params.industry,
        min_annual_revenue: params.min_revenue,
        max_annual_revenue: params.max_revenue,
        page: params.page || 1,
        per_page: params.per_page || 50,
        ...params.filters,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Apollo API error ${response.status}:`, errorText);
      throw new Error(`Apollo API error: ${response.status}`);
    }

    const data = await response.json();
    return data.people || [];
  } catch (error) {
    console.error("Apollo search error:", error);
    throw error;
  }
}

/**
 * Enrich prospect data with additional information
 * Adds ICP scoring, data quality assessment
 */
export async function enrichProspect(
  prospect: ApolloProspect,
  icpCriteria?: Record<string, any>
): Promise<EnrichedProspect> {
  // Calculate ICP match score (0-100)
  let icpScore = 0;

  // Default ICP for marketing agencies (10-50 employees)
  const defaultICP = {
    industry: "marketing",
    company_size: "11-50",
    min_revenue: 500000,
  };

  const criteria = icpCriteria || defaultICP;

  // Score based on company size (high priority for JARVIS PRIME)
  if (prospect.company_size) {
    if (
      prospect.company_size.includes("11-50") ||
      prospect.company_size.includes("51-100")
    ) {
      icpScore += 40; // Perfect fit for JARVIS PRIME
    } else if (prospect.company_size.includes("10-50")) {
      icpScore += 35;
    } else if (
      prospect.company_size.includes("101-500") ||
      prospect.company_size.includes("1-10")
    ) {
      icpScore += 20;
    }
  }

  // Score based on industry
  if (prospect.industry) {
    if (
      prospect.industry.toLowerCase().includes("marketing") ||
      prospect.industry.toLowerCase().includes("advertising") ||
      prospect.industry.toLowerCase().includes("agency")
    ) {
      icpScore += 30;
    } else if (
      prospect.industry.toLowerCase().includes("technology") ||
      prospect.industry.toLowerCase().includes("b2b") ||
      prospect.industry.toLowerCase().includes("sales")
    ) {
      icpScore += 15;
    }
  }

  // Score based on title (decision maker indicators)
  if (prospect.title) {
    const titleLower = prospect.title.toLowerCase();
    if (titleLower.includes("founder") || titleLower.includes("ceo")) {
      icpScore += 25;
    } else if (
      titleLower.includes("director") ||
      titleLower.includes("head of") ||
      titleLower.includes("manager")
    ) {
      icpScore += 20;
    } else if (titleLower.includes("operations") || titleLower.includes("vp")) {
      icpScore += 18;
    }
  }

  // Determine data quality
  let dataQuality: "high" | "medium" | "low" = "medium";
  const qualitySignals = [
    prospect.email,
    prospect.phone_number,
    prospect.linkedin_url,
    prospect.title,
  ].filter(Boolean).length;

  if (qualitySignals >= 3) {
    dataQuality = "high";
  } else if (qualitySignals <= 1) {
    dataQuality = "low";
  }

  return {
    ...prospect,
    icp_match: Math.min(icpScore, 100),
    enriched_at: new Date().toISOString(),
    data_quality: dataQuality,
  };
}

/**
 * Batch enrich multiple prospects
 * Scores them for ICP match and filters high-quality leads
 */
export async function enrichProspects(
  prospects: ApolloProspect[],
  minICPScore: number = 50
): Promise<EnrichedProspect[]> {
  const enriched = await Promise.all(
    prospects.map((p) => enrichProspect(p))
  );

  // Filter by minimum ICP score
  return enriched
    .filter((p) => p.icp_match >= minICPScore)
    .sort((a, b) => b.icp_match - a.icp_match); // Highest scoring first
}

/**
 * Find prospects at a specific company domain
 * Used for company-level targeting
 */
export async function findProspectsAtCompany(
  companyDomain: string,
  filters?: Partial<ApolloSearchParams>
): Promise<ApolloProspect[]> {
  return searchProspects({
    company_domain: companyDomain,
    per_page: 100,
    ...filters,
  });
}

/**
 * Search for decision makers by job title and industry
 * Targets marketing agency owners and operations leaders
 */
export async function findDecisionMakers(
  keywords: string[] = [
    "founder",
    "ceo",
    "director of operations",
    "head of growth",
  ],
  location?: string,
  industry?: string
): Promise<ApolloProspect[]> {
  const prospects: ApolloProspect[] = [];

  for (const keyword of keywords) {
    try {
      const results = await searchProspects({
        keyword,
        location,
        industry: industry || "marketing",
        per_page: 50,
      });
      prospects.push(...results);
    } catch (error) {
      console.error(`Error searching for "${keyword}":`, error);
    }
  }

  // Remove duplicates by email
  const uniqueProspects = Array.from(
    new Map(prospects.map((p) => [p.email, p])).values()
  );

  return uniqueProspects;
}

/**
 * Get detailed company information
 * Useful for account research before outreach
 */
export async function getCompanyInfo(
  companyDomain: string
): Promise<Record<string, any>> {
  if (!APOLLO_API_KEY) {
    throw new Error("APOLLO_API_KEY not configured");
  }

  try {
    const response = await fetch(`${APOLLO_BASE_URL}/organizations/enrich`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": APOLLO_API_KEY,
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({
        domain: companyDomain,
      }),
    });

    if (!response.ok) {
      throw new Error(`Apollo API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Company info error:", error);
    throw error;
  }
}

/**
 * Validate and verify email addresses
 * Check if email is valid before sending
 */
export async function verifyEmail(email: string): Promise<boolean> {
  if (!APOLLO_API_KEY) {
    throw new Error("APOLLO_API_KEY not configured");
  }

  try {
    const response = await fetch(`${APOLLO_BASE_URL}/people/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": APOLLO_API_KEY,
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({
        email,
      }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.person?.email === email;
  } catch (error) {
    console.error("Email verification error:", error);
    return false;
  }
}

export default {
  searchProspects,
  enrichProspect,
  enrichProspects,
  findProspectsAtCompany,
  findDecisionMakers,
  getCompanyInfo,
  verifyEmail,
};
