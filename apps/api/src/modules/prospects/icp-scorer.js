// ICP (Ideal Customer Profile) scorer — configurable scoring.
//
// Scores a sourced prospect against a client's ICP config so we only spend
// outreach on good-fit people. Scoring weights, thresholds, and disqualifiers
// are now configurable per-client via getClientConfig().
//
// Default scale: 0-30 points.
// Default qualify threshold: 15 points.
// Default hot threshold: 24 points.

import { getClientConfig } from '../../config/config.js';

const DEFAULT_KEYWORDS = ['agency', 'lead gen', 'outbound', 'b2b', 'sales', 'pipeline', 'scale', 'growth'];
const DEFAULT_DISQUALIFY = ['student', 'intern', 'freelance', 'unemployed', 'looking for work'];

/**
 * @param {object} prospect  Sourced prospect (title, company, industry, location, email...)
 * @param {object} client    Client ICP config (icp_titles, icp_industries, icp_locations, icp_keywords)
 * @returns {{score:number, qualified:boolean, hot:boolean, reasons:string[]}}
 */
export function scoreProspect(prospect = {}, client = {}) {
  const reasons = [];
  let score = 0;

  // Get client-specific or default scoring config
  const clientConfig = getClientConfig(client);
  const weights = clientConfig.scoringWeights;
  const qualifyThreshold = clientConfig.qualifyThreshold;
  const hotThreshold = clientConfig.hotThreshold;
  const disqualifiers = clientConfig.disqualifiers || DEFAULT_DISQUALIFY;

  const titles = (client.icp_titles || []).map((t) => t.toLowerCase());
  const industries = (client.icp_industries || []).map((t) => t.toLowerCase());
  const locations = (client.icp_locations || []).map((t) => t.toLowerCase());
  const keywords = (client.icp_keywords && client.icp_keywords.length ? client.icp_keywords : DEFAULT_KEYWORDS).map((k) =>
    k.toLowerCase()
  );

  const haystack = [prospect.title, prospect.company, prospect.industry]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Disqualifiers — auto-fail bad fits.
  for (const bad of disqualifiers) {
    if (haystack.includes(bad.toLowerCase())) {
      return { score: 0, qualified: false, hot: false, reasons: [`Disqualified: matched "${bad}"`] };
    }
  }

  // 1. Title fit (0 - weights.title)
  const title = (prospect.title || '').toLowerCase();
  if (titles.length && titles.some((t) => title.includes(t))) {
    score += weights.title;
    reasons.push(`Title match: +${weights.title}`);
  } else if (/founder|ceo|owner|head|director|vp|chief/.test(title)) {
    const partialScore = Math.round(weights.title * 0.6);
    score += partialScore;
    reasons.push(`Decision-maker title: +${partialScore}`);
  }

  // 2. Industry fit (0 - weights.industry)
  const industry = (prospect.industry || '').toLowerCase();
  if (industries.length && industries.some((i) => industry.includes(i) || haystack.includes(i))) {
    score += weights.industry;
    reasons.push(`Industry match: +${weights.industry}`);
  }

  // 3. Location fit (0 - weights.location)
  const location = (prospect.location || '').toLowerCase();
  if (locations.length && locations.some((l) => location.includes(l))) {
    score += weights.location;
    reasons.push(`Location match: +${weights.location}`);
  }

  // 4. Keyword intent signals (0 - weights.keyword * 3, capped at 3 keywords)
  const matches = keywords.filter((k) => haystack.includes(k));
  if (matches.length) {
    const pts = Math.min(matches.length, 3) * weights.keyword;
    score += pts;
    reasons.push(`Keyword relevance: +${pts} (${matches.length} match${matches.length > 1 ? 'es' : ''})`);
  }

  // 5. Has a usable email (0 - weights.email) — no email means we can't act.
  if (prospect.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prospect.email)) {
    score += weights.email;
    reasons.push(`Valid email: +${weights.email}`);
  }

  score = Math.min(score, 30);
  const qualified = score >= qualifyThreshold;
  const hot = score >= hotThreshold;
  if (qualified) reasons.push(hot ? 'ICP alignment: Hot 🔥' : 'ICP alignment: Qualified');

  return { score, qualified, hot, reasons };
}
