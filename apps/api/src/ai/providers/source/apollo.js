// Apollo source provider — implements the source provider interface.
// Extracted from sources/prospect-finder.js.

import { config } from '../../../config/config.js';
import { log } from '../../../utils/logger.js';
import { BaseSourceProvider } from './index.js';

export class ApolloProvider extends BaseSourceProvider {
  get name() { return 'apollo'; }

  isConfigured() {
    return Boolean(config.apolloApiKey);
  }

  /**
   * Search Apollo People Search API for prospects.
   * @param {object} client  Client with ICP config
   * @param {number} limit   Max results
   * @returns {Promise<Array>} Normalized prospect objects
   */
  async search(client, limit = 25) {
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
}
