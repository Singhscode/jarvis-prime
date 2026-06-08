/**
 * ICP Scorer — scores a lead 0–25 against JARVIS PRIME's ICP.
 * Score >= 15 = qualified, send to outreach.
 * Score >= 20 = hot lead, founder follows up personally.
 */

const REVENUE_SCORES = {
  "0-1L":  2,
  "1-5L":  5,
  "5-20L": 8,
  "20L+":  10,
};

const HOT_KEYWORDS = [
  "sdr", "outbound", "lead gen", "leads", "pipeline", "sales",
  "agency", "saas", "b2b", "cold email", "linkedin", "prospecting",
  "hiring", "scale", "growth", "revenue", "clients", "founder", "ceo",
  "co-founder", "startup", "digital", "marketing", "tech", "platform",
];

const DISQUALIFY_KEYWORDS = [
  "student", "college", "learning", "intern", "freelance",
  "d2c", "retail", "restaurant", "school",
];

export function scoreICP(lead) {
  let score = 0;
  const reasons = [];

  // 1. Revenue tier (0-10 pts)
  const revScore = REVENUE_SCORES[lead.revenue] || 0;
  score += revScore;
  if (revScore > 0) reasons.push(`Revenue tier: +${revScore}`);

  // 2. Message relevance (0-8 pts)
  const msgLower = (lead.message || "").toLowerCase();
  const companyLower = (lead.company || "").toLowerCase();
  const combined = `${msgLower} ${companyLower}`;

  let keywordHits = 0;
  for (const kw of HOT_KEYWORDS) {
    if (combined.includes(kw)) keywordHits++;
  }
  const kwScore = Math.min(keywordHits * 2, 8);
  score += kwScore;
  if (kwScore > 0) reasons.push(`Keyword relevance: +${kwScore} (${keywordHits} matches)`);

  // 3. Has phone (2 pts — shows intent)
  if (lead.phone && lead.phone.length > 5) {
    score += 2;
    reasons.push("Phone provided: +2");
  }

  // 4. Has detailed message (2 pts)
  if ((lead.message || "").length > 20) {
    score += 2;
    reasons.push("Detailed message: +2");
  }

  // 5. Is founder/decision maker (3 pts)
  const titleLower = (lead.message || "").toLowerCase();
  const founderKeywords = ["founder", "ceo", "co-founder", "vp ", "head of"];
  if (founderKeywords.some(kw => titleLower.includes(kw))) {
    score += 3;
    reasons.push("Decision maker: +3");
  }

  // 6. Disqualification check
  let disqualified = false;
  for (const kw of DISQUALIFY_KEYWORDS) {
    if (combined.includes(kw)) {
      disqualified = true;
      reasons.push(`DISQUALIFIED: matched "${kw}"`);
      break;
    }
  }

  if (disqualified) score = Math.min(score, 5);

  return {
    score,
    qualified: score >= 15 && !disqualified,
    hot: score >= 20 && !disqualified,
    reasons,
  };
}
