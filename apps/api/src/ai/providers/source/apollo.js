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
   * Performs one fixed Apollo People Search page using server-owned credentials.
   * It remains intentionally unpaginated: callers can observe only Apollo's explicit
   * truncation signal and must not infer a cursor or persist raw people elsewhere.
   */
  async searchPage(client, limit = 25, { signal } = {}) {
    if (!this.isConfigured()) {
      const error = new Error('Apollo is not configured');
      error.code = 'APOLLO_UNCONFIGURED';
      throw error;
    }
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
      signal,
    });
    if (!res.ok) {
      const error = new Error(`Apollo search failed: ${res.status}`);
      error.code = `APOLLO_HTTP_${res.status}`;
      error.status = res.status;
      throw error;
    }
    const json = await res.json();
    const people = Array.isArray(json.people) ? json.people : [];
    const prospects = people.map((p) => ({
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
    const total = Number(json.pagination?.total_entries);
    return Object.freeze({ prospects, partial: Number.isFinite(total) && total > prospects.length, total: Number.isFinite(total) ? total : null });
  }

  /**
   * Legacy source-provider compatibility. New Phase 11 callers use searchPage so
   * they can retain only a redacted count/truncation summary.
   */
  async search(client, limit = 25, options = {}) {
    return (await this.searchPage(client, limit, options)).prospects;
  }
}
