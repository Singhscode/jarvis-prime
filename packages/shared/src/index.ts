/**
 * ICP Scorer — Lead Qualification Engine
 * Scores leads 0-25 based on ideal customer profile fit
 * Score >= 15 = qualified, Score >= 20 = hot lead
 */

export interface Lead {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  revenue?: "0-1L" | "1-5L" | "5-20L" | "20L+";
  message?: string;
}

export interface ScoredLead extends Lead {
  score: number;
  qualified: boolean;
  hot: boolean;
  reasons: string[];
}

export interface ScorerConfig {
  revenueScores?: Record<string, number>;
  hotKeywords?: string[];
  disqualifyKeywords?: string[];
  weights?: {
    revenue?: number;
    keywords?: number;
    phone?: number;
    message?: number;
  };
}

export interface ProspectScoringClient {
  name?: string;
  icp_titles?: string[];
  icp_industries?: string[];
  icp_locations?: string[];
  icp_keywords?: string[];
  config?: {
    scoringWeights?: {
      title?: number;
      industry?: number;
      location?: number;
      keyword?: number;
      email?: number;
    };
    qualifyThreshold?: number;
    hotThreshold?: number;
    disqualifiers?: string[] | null;
  };
}

export interface ProspectRecord {
  full_name?: string;
  first_name?: string;
  title?: string;
  company?: string;
  industry?: string;
  location?: string;
  email?: string;
  linkedin_url?: string;
  source?: string;
}

// Default configuration
const DEFAULT_REVENUE_SCORES: Record<string, number> = {
  "0-1L": 2,
  "1-5L": 5,
  "5-20L": 8,
  "20L+": 10,
};

const DEFAULT_HOT_KEYWORDS = [
  "sdr",
  "outbound",
  "lead gen",
  "leads",
  "pipeline",
  "sales",
  "agency",
  "saas",
  "b2b",
  "cold email",
  "linkedin",
  "prospecting",
  "hiring",
  "scale",
  "growth",
  "revenue",
  "clients",
];

const DEFAULT_DISQUALIFY_KEYWORDS = [
  "student",
  "college",
  "learning",
  "intern",
  "freelance",
  "d2c",
  "ecommerce",
  "retail",
  "restaurant",
  "school",
];

const DEFAULT_WEIGHTS = {
  revenue: 10,
  keywords: 8,
  phone: 2,
  message: 2,
};

const DEFAULT_PROSPECT_WEIGHTS = {
  title: 10,
  industry: 8,
  location: 4,
  keyword: 2,
  email: 2,
};

const DEFAULT_PROSPECT_KEYWORDS = ["agency", "lead gen", "outbound", "b2b", "sales", "pipeline", "scale", "growth"];

const DEFAULT_PROSPECT_DISQUALIFY = ["student", "intern", "freelance", "unemployed", "looking for work"];

/**
 * Score a lead against default ICP configuration
 */
export function scoreICP(lead: Lead): ScoredLead {
  const scorer = createCustomScorer({});
  return scorer(lead);
}

/**
 * Create a custom scorer with your own rules
 */
export function createCustomScorer(config: ScorerConfig) {
  const revenueScores = config.revenueScores || DEFAULT_REVENUE_SCORES;
  const hotKeywords = (config.hotKeywords || DEFAULT_HOT_KEYWORDS).map((k) =>
    k.toLowerCase()
  );
  const disqualifyKeywords = (
    config.disqualifyKeywords || DEFAULT_DISQUALIFY_KEYWORDS
  ).map((k) => k.toLowerCase());
  const weights = { ...DEFAULT_WEIGHTS, ...config.weights };

  return function scorer(lead: Lead): ScoredLead {
    let score = 0;
    const reasons: string[] = [];

    // 1. Revenue tier (0-10 pts)
    const revScore = revenueScores[lead.revenue || ""] || 0;
    score += revScore;
    if (revScore > 0) {
      reasons.push(`Revenue tier: +${revScore}`);
    }

    // 2. Message relevance (0-8 pts)
    const msgLower = (lead.message || "").toLowerCase();
    const companyLower = (lead.company || "").toLowerCase();
    const combined = `${msgLower} ${companyLower}`;

    let keywordHits = 0;
    for (const kw of hotKeywords) {
      if (combined.includes(kw)) {
        keywordHits++;
      }
    }

    const kwScore = Math.min(
      keywordHits * (weights.keywords / 4),
      weights.keywords
    );
    score += kwScore;
    if (kwScore > 0) {
      reasons.push(`Keyword relevance: +${Math.round(kwScore)} (${keywordHits} matches)`);
    }

    // 3. Has phone (2 pts — shows intent)
    if (lead.phone && lead.phone.length > 5) {
      score += weights.phone;
      reasons.push(`Phone provided: +${weights.phone}`);
    }

    // 4. Has detailed message (2 pts)
    if ((lead.message || "").length > 50) {
      score += weights.message;
      reasons.push(`Detailed message: +${weights.message}`);
    }

    // 5. Disqualification check
    let disqualified = false;
    for (const kw of disqualifyKeywords) {
      if (combined.includes(kw)) {
        disqualified = true;
        reasons.push(`⚠️ Disqualified: matched "${kw}"`);
        break;
      }
    }

    if (disqualified) {
      score = Math.min(score, 5);
    }

    // Calculate qualified/hot status
    const qualified = score >= 15 && !disqualified;
    const hot = score >= 20 && !disqualified;

    return {
      ...lead,
      score: Math.round(score),
      qualified,
      hot,
      reasons,
    };
  };
}

/**
 * Batch score multiple leads
 */
export function batchScore(leads: Lead[]): ScoredLead[] {
  return leads.map(scoreICP);
}

/**
 * Filter to only qualified leads
 */
export function filterQualified(leads: ScoredLead[]): ScoredLead[] {
  return leads.filter((l) => l.qualified);
}

/**
 * Filter to only hot leads
 */
export function filterHot(leads: ScoredLead[]): ScoredLead[] {
  return leads.filter((l) => l.hot);
}

/**
 * Sort leads by score (highest first)
 */
export function sortByScore(leads: ScoredLead[]): ScoredLead[] {
  return [...leads].sort((a, b) => b.score - a.score);
}

/**
 * Score a sourced prospect against a client's ICP config.
 */
export function scoreProspect(prospect: ProspectRecord = {}, client: ProspectScoringClient = {}) {
  const reasons: string[] = [];
  let score = 0;

  const clientConfig = client.config || {};
  const weights = { ...DEFAULT_PROSPECT_WEIGHTS, ...(clientConfig.scoringWeights || {}) };
  const qualifyThreshold = clientConfig.qualifyThreshold ?? 15;
  const hotThreshold = clientConfig.hotThreshold ?? 24;
  const disqualifiers = clientConfig.disqualifiers || DEFAULT_PROSPECT_DISQUALIFY;

  const titles = (client.icp_titles || []).map((value) => value.toLowerCase());
  const industries = (client.icp_industries || []).map((value) => value.toLowerCase());
  const locations = (client.icp_locations || []).map((value) => value.toLowerCase());
  const keywords = (client.icp_keywords && client.icp_keywords.length ? client.icp_keywords : DEFAULT_PROSPECT_KEYWORDS).map((value) =>
    value.toLowerCase()
  );

  const haystack = [prospect.title, prospect.company, prospect.industry].filter(Boolean).join(" ").toLowerCase();

  for (const bad of disqualifiers) {
    if (haystack.includes(bad.toLowerCase())) {
      return { score: 0, qualified: false, hot: false, reasons: [`Disqualified: matched "${bad}"`] };
    }
  }

  const title = (prospect.title || "").toLowerCase();
  if (titles.length && titles.some((value) => title.includes(value))) {
    score += weights.title;
    reasons.push(`Title match: +${weights.title}`);
  } else if (/founder|ceo|owner|head|director|vp|chief/.test(title)) {
    const partialScore = Math.round(weights.title * 0.6);
    score += partialScore;
    reasons.push(`Decision-maker title: +${partialScore}`);
  }

  const industry = (prospect.industry || "").toLowerCase();
  if (industries.length && industries.some((value) => industry.includes(value) || haystack.includes(value))) {
    score += weights.industry;
    reasons.push(`Industry match: +${weights.industry}`);
  }

  const location = (prospect.location || "").toLowerCase();
  if (locations.length && locations.some((value) => location.includes(value))) {
    score += weights.location;
    reasons.push(`Location match: +${weights.location}`);
  }

  const matches = keywords.filter((value) => haystack.includes(value));
  if (matches.length) {
    const points = Math.min(matches.length, 3) * weights.keyword;
    score += points;
    reasons.push(`Keyword relevance: +${points} (${matches.length} match${matches.length > 1 ? "es" : ""})`);
  }

  if (prospect.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prospect.email)) {
    score += weights.email;
    reasons.push(`Valid email: +${weights.email}`);
  }

  score = Math.min(score, 30);
  const qualified = score >= qualifyThreshold;
  const hot = score >= hotThreshold;

  if (qualified) {
    reasons.push(hot ? "ICP alignment: Hot 🔥" : "ICP alignment: Qualified");
  }

  return { ...prospect, score: Math.round(score), qualified, hot, reasons };
}

export default scoreICP;
