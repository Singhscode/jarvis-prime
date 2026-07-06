// Prospect sourcing. Uses Apollo.io to search for people matching a client's
// ICP, and Hunter.io to find/verify emails when Apollo doesn't return one.
//
// In dry-run mode (or when no API keys are set) it returns realistic MOCK
// prospects so the rest of the pipeline can be tested without spending credits.

import { config } from '../config.js';
import { log } from '../lib/logger.js';

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

async function apolloSearch(client, limit) {
  // Apollo People Search API
  const body = {
    api_key: config.apolloApiKey,
    page: 1,
    per_page: Math.min(limit, 100),
    person_titles: client.icp_titles || [],
    person_locations: client.icp_locations || [],
    q_organization_industries: client.icp_industries || [],
  };
  const res = await fetch('https://api.apollo.io/v1/mixed_people/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Apollo search failed: ${res.status}`);
  const json = await res.json();
  const people = json.people || [];
  return people.map((p) => ({
    full_name: p.name,
    first_name: p.first_name,
    title: p.title,
    company: p.organization?.name,
    email: p.email || null,
    linkedin_url: p.linkedin_url,
    industry: p.organization?.industry,
    location: [p.city, p.state, p.country].filter(Boolean).join(', '),
    source: 'apollo',
    _domain: p.organization?.primary_domain,
  }));
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
 * @returns {Promise<Array>} normalized prospect objects (not yet scored/saved)
 */
export async function findProspects(client, limit = config.dailyProspectLimit) {
  // Safe path: no Apollo key or dry-run -> mock data.
  if (config.dryRun || !config.apolloApiKey) {
    log.dry(`Sourcing ${limit} mock prospects for "${client.name}" (no live Apollo call).`);
    return mockProspects(client, limit);
  }

  log.step(`Searching Apollo for up to ${limit} prospects for "${client.name}"...`);
  const found = await apolloSearch(client, limit);

  // Fill in missing emails via Hunter where possible.
  for (const p of found) {
    if (!p.email && p._domain) {
      const [first, ...rest] = (p.full_name || '').split(' ');
      p.email = await hunterFindEmail(first, rest.join(' '), p._domain);
      if (p.email) p.source = 'apollo+hunter';
    }
    delete p._domain;
  }

  const withEmail = found.filter((p) => p.email);
  log.ok(`Apollo returned ${found.length} people, ${withEmail.length} with usable emails.`);
  return withEmail;
}
