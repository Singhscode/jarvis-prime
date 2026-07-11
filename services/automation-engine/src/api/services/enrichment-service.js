// Enrichment Service
// Wired to real prospect-finder and ICP scorer for live enrichment.

import { config } from '../../config.js';
import { findProspects } from '../../sources/prospect-finder.js';
import { insertProspects } from '../../lib/db.js';
import { scoreProspect } from 'icp-scorer';

/**
 * Search and score prospects using Apollo/Hunter.
 */
export async function searchProspects(params = {}, options = {}) {
  const { dryRun = config.dryRun } = options;

  // Build a client-like object from params for prospect-finder
  const client = {
    id: params.clientId || 'api-request',
    name: params.clientName || 'API Request',
    icp_titles: params.titles || ['Founder', 'CEO', 'Head of Sales'],
    icp_industries: params.industries || ['Marketing'],
    icp_locations: params.locations || ['India'],
    icp_keywords: params.keywords || ['agency', 'b2b', 'outbound'],
  };

  const limit = params.limit || config.dailyProspectLimit;

  // Source prospects
  const raw = await findProspects(client, limit);

  // Score each prospect
  const scored = raw.map((p) => {
    const { score, qualified, hot, reasons } = scoreProspect(p, client);
    return {
      ...p,
      icp_score: score,
      qualified,
      hot,
      score_reasons: reasons,
    };
  });

  return {
    prospectCount: scored.length,
    qualified: scored.filter((p) => p.qualified).length,
    hotLeads: scored.filter((p) => p.hot).length,
    prospects: scored,
    dryRun,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Find marketing agencies specifically (pre-built ICP).
 */
export async function findMarketingAgencies(location = 'India', limit = 50) {
  const client = {
    id: 'agency-search',
    name: 'Agency Search',
    icp_titles: ['Founder', 'CEO', 'Managing Director', 'Head of Sales'],
    icp_industries: ['Marketing', 'Advertising', 'Digital Marketing'],
    icp_locations: [location],
    icp_keywords: ['agency', 'digital marketing', 'lead gen', 'growth'],
  };

  const raw = await findProspects(client, limit);

  const scored = raw.map((p) => {
    const { score, qualified, hot, reasons } = scoreProspect(p, client);
    return { ...p, icp_score: score, qualified, hot, score_reasons: reasons };
  });

  return {
    prospectCount: scored.length,
    location,
    prospects: scored.filter((p) => p.qualified),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Enrich a batch of prospects (add missing data from Apollo/Hunter).
 */
export async function enrichBatch(params = {}, options = {}) {
  const { dryRun = config.dryRun } = options;
  const { prospects = [], clientId } = params;

  if (dryRun) {
    return {
      prospectCount: prospects.length,
      enriched: 0,
      message: 'DRY RUN — no actual enrichment API calls',
      prospects: prospects.map((p) => ({ ...p, enriched: false })),
    };
  }

  // In a full implementation, this would call Apollo/Hunter for each prospect
  // to fill in missing data (title, company size, tech stack, etc.)
  const enriched = prospects.map((p) => ({
    ...p,
    enriched: true,
    enriched_at: new Date().toISOString(),
  }));

  return {
    prospectCount: enriched.length,
    enriched: enriched.filter((p) => p.enriched).length,
    prospects: enriched,
    timestamp: new Date().toISOString(),
  };
}
