// Prospect sourcing. Uses the configured source provider (Apollo by default)
// to search for people matching a client's ICP, and Hunter.io to find/verify
// emails when the source doesn't return one.
//
// In dry-run mode (or when no API keys are set) it returns realistic MOCK
// prospects so the rest of the pipeline can be tested without spending credits.
//
// Now uses provider abstraction — add new sources by creating a provider
// in providers/source/.

import { config } from '../config.js';
import { log } from '../lib/logger.js';
import { getSourceProvider } from '../providers/source/index.js';

// Cache the provider
let _sourceProvider = null;

async function getProvider() {
  if (!_sourceProvider) {
    _sourceProvider = await getSourceProvider();
  }
  return _sourceProvider;
}

const FIRST_NAMES = ['Aarav', 'Diya', 'Rohan', 'Sara', 'Kabir', 'Ananya', 'Vivaan', 'Isha', 'Arjun', 'Meera'];
const LAST_NAMES = ['Sharma', 'Patel', 'Reddy', 'Nair', 'Gupta', 'Iyer', 'Singh', 'Mehta', 'Bose', 'Rao'];
const COMPANIES = ['BrightReach', 'PixelForge', 'GrowthLoop', 'NorthStar Media', 'Apex Digital', 'BlueOrbit', 'Catalyst Labs'];

function mockProspects(client, limit) {
  const titles = client.icp_titles?.length ? client.icp_titles : ['Founder', 'Head of Sales'];
  const industry = client.icp_industries?.[0] || 'Marketing';
  const location = client.icp_locations?.[0] || 'India';
  const out = [];
  for (let i = 0; i < limit; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 3) % LAST_NAMES.length];
    const company = COMPANIES[i % COMPANIES.length];
    const domain = `${company.toLowerCase().replace(/[^a-z]/g, '')}.com`;
    out.push({
      full_name: `${first} ${last}`,
      first_name: first,
      title: titles[i % titles.length],
      company,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`,
      linkedin_url: `https://linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}`,
      industry,
      location,
      source: 'mock',
    });
  }
  return out;
}

async function hunterFindEmail(firstName, lastName, domain) {
  if (!config.hunterApiKey || !domain) return null;
  const url = `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(
    firstName || ''
  )}&last_name=${encodeURIComponent(lastName || '')}&api_key=${config.hunterApiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.email || null;
  } catch {
    return null;
  }
}

/**
 * Find prospects for a client.
 * Uses the configured source provider, with mock fallback for dry-run.
 * @returns {Promise<Array>} normalized prospect objects (not yet scored/saved)
 */
export async function findProspects(client, limit = config.dailyProspectLimit) {
  const provider = await getProvider();

  // Safe path: no provider configured or dry-run -> mock data.
  if (config.dryRun || !provider.isConfigured()) {
    log.dry(`Sourcing ${limit} mock prospects for "${client.name}" (no live ${provider.name} call).`);
    return mockProspects(client, limit);
  }

  log.step(`Searching ${provider.name} for up to ${limit} prospects for "${client.name}"...`);
  const found = await provider.search(client, limit);

  // Fill in missing emails via Hunter where possible.
  for (const p of found) {
    if (!p.email && p._domain) {
      const [first, ...rest] = (p.full_name || '').split(' ');
      p.email = await hunterFindEmail(first, rest.join(' '), p._domain);
      if (p.email) p.source = `${provider.name}+hunter`;
    }
    delete p._domain;
  }

  const withEmail = found.filter((p) => p.email);
  log.ok(`${provider.name} returned ${found.length} people, ${withEmail.length} with usable emails.`);
  return withEmail;
}
