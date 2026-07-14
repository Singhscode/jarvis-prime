/**
 * LinkedIn Prospect Scraper
 * Alternative to Apollo.io - scrape prospects directly from LinkedIn
 * No API key needed, uses standard web scraping
 */

export interface LinkedInProspect {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  title: string;
  company: string;
  location?: string;
  linkedin_url: string;
  profile_image?: string;
  headline?: string;
  company_size?: string;
  industry?: string;
}

export interface LinkedInSearchParams {
  keywords?: string; // Job title, skills
  company?: string; // Company name
  location?: string; // City/Country
  current_company?: string; // Filter by company
  title?: string; // Job title filter
  limit?: number; // Number of results
}

export interface EnrichedLinkedInProspect extends LinkedInProspect {
  icp_match: number; // 0-100 score for ICP matching
  enriched_at: string;
  data_quality: "high" | "medium" | "low";
  source: "linkedin";
}

/**
 * Search for prospects on LinkedIn
 * Builds a LinkedIn search URL that user can visit to find prospects
 */
export function buildLinkedInSearchURL(
  params: LinkedInSearchParams
): { url: string; instructions: string } {
  const baseUrl = "https://www.linkedin.com/search/results/people";
  const queryParams = new URLSearchParams();

  // Build LinkedIn-compatible search parameters
  if (params.keywords) {
    queryParams.append("keywords", params.keywords);
  }

  if (params.title) {
    queryParams.append("title", params.title);
  }

  if (params.current_company) {
    queryParams.append("company", params.current_company);
  }

  if (params.location) {
    queryParams.append("geoUrn", convertLocationToGeoUrn(params.location));
  }

  // LinkedIn URL for 1st-degree connections
  queryParams.append("network", "%5B%22F%22%5D"); // 1st degree

  const url = `${baseUrl}?${queryParams.toString()}`;

  const instructions = `
LinkedIn Prospect Search:

1. Open this URL in your browser:
   ${url}

2. You'll see a list of matching prospects on LinkedIn

3. For each prospect you want to contact:
   - Click their profile
   - Get their email from their profile or "Contact info" section
   - Copy email to your list

4. Export prospects manually or use LinkedIn Sales Navigator for bulk export

LinkedIn Search Tips:
  • Use specific job titles: "Marketing Director", "CEO", "Founder"
  • Narrow by company size if possible
  • Filter by location
  • 1st degree connections often have more complete profiles
`;

  return { url, instructions };
}

/**
 * Convert location name to LinkedIn geoUrn
 * Common locations for India
 */
function convertLocationToGeoUrn(location: string): string {
  const locationMap: Record<string, string> = {
    // Countries
    india: "102713980",
    "united states": "103644243",
    uk: "101165590",
    canada: "102393587",
    australia: "104192997",
    singapore: "105460968",
    dubai: "101099619",
    uae: "106837606",

    // Indian Cities
    bangalore: "105365761",
    bengaluru: "105365761",
    mumbai: "102713980", // India overall
    delhi: "102713980", // India overall
    hyderabad: "102713980", // India overall
    pune: "102713980", // India overall
    "new delhi": "102713980",

    // US Cities
    "new york": "105081334",
    "san francisco": "105687271",
    "los angeles": "105288745",
    chicago: "105238594",
    seattle: "105303688",
    austin: "104669043",

    // Other
    london: "101165590",
    sydney: "105337489",
    toronto: "106062805",
  };

  const normalized = location.toLowerCase().trim();
  return locationMap[normalized] || "102713980"; // Default to India
}

/**
 * Parse LinkedIn profile URL to extract prospect data
 * Manual step - user provides LinkedIn profile URL
 */
export async function parseLinkedInProfile(
  profileUrl: string
): Promise<Partial<LinkedInProspect>> {
  // Extract LinkedIn URL components
  const match = profileUrl.match(/linkedin\.com\/in\/([a-z0-9-]+)/);
  if (!match) {
    throw new Error("Invalid LinkedIn URL format");
  }

  const username = match[1];

  // Return what we can extract from URL
  return {
    linkedin_url: profileUrl,
    id: username,
  };
}

/**
 * Enrich LinkedIn prospect data with ICP scoring
 */
export async function enrichLinkedInProspect(
  prospect: LinkedInProspect,
  icpCriteria?: Record<string, any>
): Promise<EnrichedLinkedInProspect> {
  let icpScore = 0;

  // Default ICP for marketing agencies
  const defaultICP = {
    industry: "marketing",
    company_size: "11-50",
  };

  const criteria = icpCriteria || defaultICP;

  // Score based on job title (decision makers)
  if (prospect.title) {
    const titleLower = prospect.title.toLowerCase();
    if (titleLower.includes("founder") || titleLower.includes("ceo")) {
      icpScore += 30;
    } else if (
      titleLower.includes("director") ||
      titleLower.includes("head of") ||
      titleLower.includes("manager")
    ) {
      icpScore += 25;
    } else if (titleLower.includes("operations") || titleLower.includes("vp")) {
      icpScore += 20;
    } else if (
      titleLower.includes("marketing") ||
      titleLower.includes("growth")
    ) {
      icpScore += 15;
    }
  }

  // Score based on company
  if (prospect.company) {
    const companyLower = prospect.company.toLowerCase();
    if (
      companyLower.includes("agency") ||
      companyLower.includes("digital") ||
      companyLower.includes("marketing")
    ) {
      icpScore += 35;
    } else if (
      companyLower.includes("tech") ||
      companyLower.includes("startup")
    ) {
      icpScore += 20;
    }
  }

  // Score based on company size (if available)
  if (prospect.company_size) {
    if (
      prospect.company_size.includes("11-50") ||
      prospect.company_size.includes("51-100")
    ) {
      icpScore += 20;
    } else if (prospect.company_size.includes("1-10")) {
      icpScore += 15;
    }
  }

  // Score based on location
  if (prospect.location) {
    const locLower = prospect.location.toLowerCase();
    if (locLower.includes("india")) {
      icpScore += 10; // Target market
    }
  }

  // Determine data quality
  let dataQuality: "high" | "medium" | "low" = "medium";
  const qualitySignals = [
    prospect.email,
    prospect.profile_image,
    prospect.headline,
    prospect.company_size,
  ].filter(Boolean).length;

  if (qualitySignals >= 3) {
    dataQuality = "high";
  } else if (qualitySignals <= 1) {
    dataQuality = "low";
  }

  return {
    ...prospect,
    source: "linkedin",
    icp_match: Math.min(icpScore, 100),
    enriched_at: new Date().toISOString(),
    data_quality: dataQuality,
  };
}

/**
 * Build LinkedIn Sales Navigator search URL
 * Premium service but more powerful
 */
export function buildLinkedInSalesNavigatorURL(
  params: LinkedInSearchParams
): { url: string; instructions: string } {
  const baseUrl = "https://business.linkedin.com/talent-solutions/sales-navigator";

  const instructions = `
LinkedIn Sales Navigator:

LinkedIn Sales Navigator is a premium tool ($99/month) that includes:
  ✓ Advanced filters (company size, industry, seniority, etc.)
  ✓ Bulk export (export multiple prospects at once)
  ✓ Email finder (find prospect emails directly in Sales Navigator)
  ✓ Company search (find all prospects at a specific company)
  ✓ Account-based marketing tools
  ✓ CRM integration

VS Free LinkedIn Search:
  Free: Click each profile individually, manually get emails
  Sales Navigator: Bulk export, automated email finding

RECOMMENDATION FOR JARVIS PRIME:
  • Use free LinkedIn search first (test concept)
  • Once getting customers, upgrade to Sales Navigator ($99/month)
  • Sales Navigator + Apollo = best combo
  • But for MVP, free search is sufficient

SETUP STEPS:
  1. Go to: ${baseUrl}
  2. Start 30-day free trial
  3. Use advanced filters to find marketing agency owners
  4. Export prospects to CSV
  5. Import into your email tool

Search Tips for Marketing Agency Owners:
  • Title: "Founder" OR "CEO" OR "Director of Operations"
  • Company size: 11-50 employees
  • Industry: Marketing, Advertising, Digital Agency
  • Location: Your target city/country
  • Seniority: Senior (C-level, VP, Director)
`;

  return { url: baseUrl, instructions };
}

/**
 * Generate manual LinkedIn search guide for user
 */
export function generateManualLinkedInGuide(
  searchCriteria: LinkedInSearchParams
): string {
  const guide = `
📋 MANUAL LINKEDIN PROSPECT SEARCH GUIDE
═══════════════════════════════════════════════════════════════════

STEP 1: Open LinkedIn
  1. Go to linkedin.com
  2. Click "People" in the search bar at top
  3. Or go to linkedin.com/search/results/people/

STEP 2: Set Filters

  Current Job Title: ${searchCriteria.title || "CEO, Founder, Director of Operations"}
    • Narrow down to decision makers
    • Try each title separately for best results

  Current Company: ${searchCriteria.current_company || "Marketing Agency"}
    • If targeting specific companies, enter here
    • Leave blank to search all companies

  Location: ${searchCriteria.location || "India"}
    • Filter by geography
    • Can select multiple locations

  Connection Degree: 1st degree connections
    • These have more complete profiles
    • Usually have email visible

  Keywords: ${searchCriteria.keywords || "marketing, growth, digital"}
    • Add relevant skills/keywords
    • Helps filter for relevant prospects

STEP 3: Review Results
  • Browse the list of matching prospects
  • Look at profile pictures (real people first)
  • Check their headline (confirms job title)
  • Click on interesting profiles

STEP 4: Get Contact Info
  From each prospect's LinkedIn profile:
    • Get their full name
    • Get their email (usually in "Contact info" section)
    • Get their phone (if listed)
    • Note their company name
    • Note their job title

STEP 5: Export Prospects
  If using a tool that supports CSV:
    1. Open each profile in new tab
    2. Copy: First Name, Last Name, Email, Title, Company
    3. Paste into spreadsheet
    4. Save as CSV

  Alternative: Use extension like "LinkedIn to Sheets"
    • Automatically exports profiles to Google Sheets
    • Much faster than manual copy

STEP 6: Clean Up Data
  • Remove duplicates (by email)
  • Remove low-quality entries (missing emails)
  • Sort by relevance
  • Ready for email outreach

EXPECTED RESULTS:
  • Manual search: 5-10 prospects/hour
  • Each prospect: name, email, title, company
  • Quality: Medium to High (direct from LinkedIn)
  • Cost: Free

TIME ESTIMATE:
  • Setup: 5 minutes
  • Search: 30 minutes for 20 prospects
  • Cleanup: 10 minutes
  • Total: ~45 minutes for 20 qualified prospects

TIPS FOR BETTER RESULTS:
  1. Search by company first (marketing agencies in your area)
  2. Then filter by title (CEO, Founder, etc.)
  3. Then look at individual profiles
  4. Prioritize 1st degree connections (higher quality)
  5. Save URLs of top prospects for follow-up

EMAIL FINDING TOOLS:
  If email not directly on profile, try:
    • Hunter.io (find emails by domain)
    • RocketReach (email finder)
    • Clearbit (B2B data)
    • Gmail search (if you have domain)

NEXT STEP:
  Run this command to enrich the prospects you find:

    node scripts/enrich-linkedin-prospects.js --input prospects.csv

  This will score them by ICP match and prepare for outreach.
`;

  return guide;
}

/**
 * Generate LinkedIn + Apollo comparison guide
 */
export function generateSourceComparison(): string {
  return `
📊 PROSPECT SOURCE COMPARISON
═══════════════════════════════════════════════════════════════════

                    LINKEDIN FREE    APOLLO.IO      SALES NAV
─────────────────────────────────────────────────────────────────
Cost/Month              $0          $99-299         $99-499
Setup Time              5 min       5 min           10 min
Prospects/Hour          5-10        Auto 50         50-100
Data Quality           Medium        High           High
Email Included          No          Yes            Yes
Company Size Filter     No          Yes            Yes
Bulk Export            No           Yes            Yes
Automation             No           Yes            No
Ease of Use            Easy         Easy           Medium
─────────────────────────────────────────────────────────────────

RECOMMENDATION FOR JARVIS PRIME:
═══════════════════════════════════════════════════════════════════

PHASE 1 (Week 1-2): Test Concept
  • Use free LinkedIn search
  • Get 50-100 prospects manually
  • Send cold emails
  • Validate if concept works

PHASE 2 (Week 3+): Scale If Working
  • Upgrade to Apollo.io ($99/month)
  • Automate prospect sourcing
  • Send 100+ emails/week
  • Close first customers

PHASE 3 (Month 2): Optimize
  • Keep Apollo.io running
  • Add Sales Navigator ($99/month) for bulk export
  • Combine both sources
  • Scale to 3-5 customers

COST STRATEGY:
  Phase 1: $0 (free LinkedIn)
  Phase 2: $99/month (Apollo)
  Phase 3: $198/month (Apollo + Sales Nav)

REVENUE GENERATED:
  Phase 1: 0 (testing)
  Phase 2: ₹1,25,250/month per customer
  Phase 3: ₹1,25,250/month per customer

ROI: All tools paid for by first customer ✓


WORKFLOW COMPARISON:
═══════════════════════════════════════════════════════════════════

FREE LINKEDIN WORKFLOW:
  1. Manual search on LinkedIn
  2. Click each profile
  3. Copy email
  4. Paste into spreadsheet
  5. Send emails manually
  Time: 2 hours for 50 prospects

APOLLO.IO WORKFLOW:
  1. Run CLI: node scripts/enrich-prospects.js
  2. Get CSV with 50 prospects
  3. Auto-scored by ICP match
  4. Paste into email tool
  5. Send automatically
  Time: 2 minutes for 50 prospects

SALES NAVIGATOR WORKFLOW:
  1. Advanced search with filters
  2. Bulk export to CSV
  3. Import email finder results
  4. Paste into CRM
  5. Auto-send via CRM integration
  Time: 5 minutes for 100 prospects


GETTING STARTED NOW (Free):
═══════════════════════════════════════════════════════════════════

OPTION 1: Manual LinkedIn Search
  1. Go to linkedin.com/search/results/people/
  2. Search: title:"CEO" location:"India" company:"marketing"
  3. Review profiles and copy emails
  4. Enrich with our ICP scoring: node scripts/enrich-linkedin-prospects.js
  5. Send cold emails

OPTION 2: LinkedIn + Sales Navigator Trial
  1. Start Sales Navigator 30-day free trial
  2. Use advanced search filters
  3. Bulk export prospects
  4. Get Apollo trial credit if first-time user
  5. Test both tools, keep what works

OPTION 3: Apollo.io Trial
  1. If Apollo shows trial available, use it
  2. Immediately test search API
  3. Get 50 prospects in 2 minutes
  4. Compare quality vs LinkedIn manual


RECOMMENDED ACTION:
═══════════════════════════════════════════════════════════════════

✓ IMMEDIATE: Use free LinkedIn search
  • Test manual prospecting workflow
  • Get first 50-100 prospects
  • Send cold emails
  • Validate concept works

✓ WEEK 2: If getting positive results
  • Upgrade Apollo.io to $99/month
  • Automate prospect sourcing
  • Scale to 200+ prospects
  • Close first customers

✓ MONTH 2: If 3+ customers acquired
  • Keep Apollo.io
  • Add Sales Navigator ($99/month)
  • Combine both sources
  • Scale to 500+ prospects/month


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bottom line: Start free with LinkedIn, upgrade to Apollo when you get customers.
All tools play together - use whichever fits your budget and timeline.

`;
}

const linkedInScraper = {
  buildLinkedInSearchURL,
  parseLinkedInProfile,
  enrichLinkedInProspect,
  buildLinkedInSalesNavigatorURL,
  generateManualLinkedInGuide,
  generateSourceComparison,
  convertLocationToGeoUrn,
};

export default linkedInScraper;
