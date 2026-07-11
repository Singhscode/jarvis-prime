// Source provider abstraction — swap prospect sourcing services.
//
// Interface:
//   { name, isConfigured(), search(client, limit) }
//
// Usage:
//   import { getSourceProvider } from '../providers/source/index.js';
//   const source = await getSourceProvider();
//   const prospects = await source.search(client, 25);

import { config } from '../../config.js';

/**
 * Get the configured source provider.
 * Currently only Apollo is available. Add new providers by creating
 * a new file and adding a case to this switch.
 * @returns {Promise<object>} Source provider implementing { name, isConfigured(), search() }
 */
export async function getSourceProvider() {
  // Future: could be config.sourceProvider || 'apollo'
  const { ApolloProvider } = await import('./apollo.js');
  return new ApolloProvider();
}

/**
 * Base interface contract for source providers.
 */
export class BaseSourceProvider {
  get name() { return 'base'; }
  isConfigured() { return false; }

  /**
   * Search for prospects matching a client's ICP.
   * @param {object} client  Client row with ICP config
   * @param {number} limit   Max prospects to return
   * @returns {Promise<Array>} Normalized prospect objects
   */
  async search(client, limit) {
    throw new Error(`${this.name}: search() not implemented`);
  }
}
