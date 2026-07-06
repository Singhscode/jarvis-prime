// ICP (Ideal Customer Profile) scorer — 0-30 scale.
// Scores a sourced prospect against a client's ICP config so we only spend
// outreach on good-fit people. Ported and extended from JARVIS PRIME's
// proven 0-25 scorer with added title/industry/location fit signals.

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
  for (const bad of DEFAULT_DISQUALIFY) {
    if (haystack.includes(bad)) {
      return { score: 0, qualified: false, hot: false, reasons: [`Disqualified: matched "${bad}"`] };
    }
  }

  // 1. Title fit (0-10)
  const title = (prospect.title || '').toLowerCase();
  if (titles.length && titles.some((t) => title.includes(t))) {
    score += 10;
    reasons.push('Title match: +10');
  } else if (/founder|ceo|owner|head|director|vp|chief/.test(title)) {
    score += 6;
    reasons.push('Decision-maker title: +6');
  }

  // 2. Industry fit (0-8)
  const industry = (prospect.industry || '').toLowerCase();
  if (industries.length && industries.some((i) => industry.includes(i) || haystack.includes(i))) {
    score += 8;
    reasons.push('Industry match: +8');
  }

  // 3. Location fit (0-4)
  const location = (prospect.location || '').toLowerCase();
  if (locations.length && locations.some((l) => location.includes(l))) {
    score += 4;
    reasons.push('Location match: +4');
  }

  // 4. Keyword intent signals (0-6, +2 each, max 3)
  const matches = keywords.filter((k) => haystack.includes(k));
  if (matches.length) {
    const pts = Math.min(matches.length, 3) * 2;
    score += pts;
    reasons.push(`Keyword relevance: +${pts} (${matches.length} match${matches.length > 1 ? 'es' : ''})`);
  }

  // 5. Has a usable email (0-2) — no email means we can't act.
  if (prospect.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prospect.email)) {
    score += 2;
    reasons.push('Valid email: +2');
  }

  score = Math.min(score, 30);
  const qualified = score >= 15;
  const hot = score >= 24;
  if (qualified) reasons.push(hot ? 'ICP alignment: Hot 🔥' : 'ICP alignment: Qualified');

  return { score, qualified, hot, reasons };
}
