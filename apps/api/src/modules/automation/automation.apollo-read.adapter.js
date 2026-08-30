import { ApolloProvider } from '../../ai/providers/source/apollo.js';
import { createExternalProviderAdapterRegistry } from './automation.external-provider.adapter.js';

export const APOLLO_PROVIDER_CODE = 'APOLLO';
export const APOLLO_ACTION_CODE = 'ACT_APOLLO_SEARCH';
export const APOLLO_RATE_CONCURRENCY_GROUP = 'APOLLO_READ';

const INPUT_FIELDS = Object.freeze(['titles', 'locations', 'industries', 'limit']);
const TERM_LIMIT = 10;
const TERM_LENGTH = 100;

function invalid() { throw new Error('AUTOMATION_APOLLO_INPUT_INVALID'); }
function terms(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > TERM_LIMIT) invalid();
  const normalized = value.map((term) => {
    if (typeof term !== 'string') invalid();
    const text = term.trim();
    if (!text || text.length > TERM_LENGTH) invalid();
    return text;
  });
  if (new Set(normalized.map((term) => term.toLocaleLowerCase('en-US'))).size !== normalized.length) invalid();
  return Object.freeze(normalized);
}

/** Validates the only browser-admissible Apollo search shape. */
export function assertApolloSearchInput(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some((key) => !INPUT_FIELDS.includes(key))) invalid();
  if (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 50) invalid();
  return Object.freeze({ titles: terms(value.titles), locations: terms(value.locations), industries: terms(value.industries), limit: value.limit });
}

function resultCount(result, limit) {
  if (!result || !Array.isArray(result.prospects) || result.prospects.length > limit) throw new Error('APOLLO_RESPONSE_INVALID');
  return result.prospects.length;
}
function correlation(providerCorrelationId) {
  return { provider: APOLLO_PROVIDER_CODE, providerCorrelationId };
}
function failure(classification, reasonCode, providerCorrelationId) {
  const outcome = classification === 'RETRYABLE' ? 'RETRYABLE_FAILURE' : classification === 'FAILED' ? 'TERMINAL_FAILURE' : 'UNKNOWN_OUTCOME';
  return { classification, reasonCode, safeMetadata: { ...correlation(providerCorrelationId), outcome, completeness: 'UNKNOWN' } };
}
function classifiedError(error, signal, providerCorrelationId) {
  if (signal?.aborted || error?.name === 'AbortError' || error?.code === 'EXTERNAL_TIMEOUT') return failure('RETRYABLE', 'APOLLO_TIMEOUT', providerCorrelationId);
  const status = Number(error?.status || String(error?.code || '').match(/^APOLLO_HTTP_(\d{3})$/)?.[1]);
  if (status === 429) return failure('RETRYABLE', 'APOLLO_RATE_LIMIT', providerCorrelationId);
  if (status >= 500 && status <= 599) return failure('RETRYABLE', 'APOLLO_UNAVAILABLE', providerCorrelationId);
  if (status >= 400 && status <= 499) return failure('FAILED', 'APOLLO_REQUEST_REJECTED', providerCorrelationId);
  if (['APOLLO_UNCONFIGURED', 'APOLLO_RESPONSE_INVALID', 'AUTOMATION_APOLLO_CLIENT_INVALID'].includes(error?.code)) return failure('FAILED', error.code, providerCorrelationId);
  return failure('RETRYABLE', 'APOLLO_NETWORK_ERROR', providerCorrelationId);
}
function completion(page, returned, providerCorrelationId) {
  const total = Number.isSafeInteger(page?.total) && page.total >= 0 ? page.total : null;
  if (page?.partial === true || (total !== null && total > returned)) {
    return { ...correlation(providerCorrelationId), outcome: 'PARTIAL_SUCCESS', completeness: 'PARTIAL', returnedCount: returned };
  }
  if (total !== null && total <= returned) {
    return { ...correlation(providerCorrelationId), outcome: 'COMPLETE_SUCCESS', completeness: 'COMPLETE', returnedCount: returned };
  }
  return { ...correlation(providerCorrelationId), outcome: 'SUCCESS_UNKNOWN_COMPLETENESS', completeness: 'UNKNOWN', returnedCount: returned };
}

/**
 * Returns the one approved Apollo adapter. It makes one fixed, unpaginated read
 * through the existing ApolloProvider and persists only the bounded summary.
 */
export function createApolloReadOnlyAdapter({ apolloClient = new ApolloProvider(), timeoutMs = 15000 } = {}) {
  return Object.freeze({
    providerCode: APOLLO_PROVIDER_CODE,
    actionCode: APOLLO_ACTION_CODE,
    kind: 'READ_ONLY',
    capability: null,
    rateConcurrencyGroup: APOLLO_RATE_CONCURRENCY_GROUP,
    timeoutMs,
    validateInput: assertApolloSearchInput,
    execute: async ({ input, signal, providerCorrelationId }) => {
      if (!apolloClient || typeof apolloClient.isConfigured !== 'function' || typeof apolloClient.searchPage !== 'function') {
        return failure('FAILED', 'AUTOMATION_APOLLO_CLIENT_INVALID', providerCorrelationId);
      }
      if (!apolloClient.isConfigured()) return failure('FAILED', 'APOLLO_UNCONFIGURED', providerCorrelationId);
      try {
        const page = await apolloClient.searchPage({
          icp_titles: input.titles,
          icp_locations: input.locations,
          icp_industries: input.industries,
        }, input.limit, { signal });
        return { classification: 'SUCCESS', reasonCode: null, safeMetadata: completion(page, resultCount(page, input.limit), providerCorrelationId) };
      } catch (error) {
        return classifiedError(error, signal, providerCorrelationId);
      }
    },
  });
}

export function createApolloReadOnlyAdapterRegistry(options = {}) {
  return createExternalProviderAdapterRegistry({ adapters: [createApolloReadOnlyAdapter(options)] });
}
