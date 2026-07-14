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
    const matchedAllCustomKeywords = Boolean(config.hotKeywords?.length) && keywordHits === hotKeywords.length;
    const awardedKeywordScore = matchedAllCustomKeywords ? Math.max(kwScore, 15) : kwScore;
    score += awardedKeywordScore;
    if (kwScore > 0) {
      reasons.push(`Keyword relevance: +${Math.round(awardedKeywordScore)} (${keywordHits} matches)`);
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

export default scoreICP;
