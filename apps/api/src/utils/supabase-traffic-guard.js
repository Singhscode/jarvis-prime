/**
 * Supabase Traffic Guard
 *
 * Centralized emergency kill switch for all Supabase network traffic.
 *
 * When SUPABASE_TRAFFIC_ENABLED=false, the application will:
 * - NOT make Data API/RPC calls
 * - NOT perform Storage operations
 * - NOT execute automation worker remote loops
 * - NOT retry disabled-state operations
 * - Return 503 for HTTP routes requiring Supabase
 *
 * Safe by default: If not set, behaves as true (traffic enabled).
 * Reversible: Can be toggled via environment without redeployment.
 */

import { log } from './logger.js';

const ENABLED_ENV_VAR = 'SUPABASE_TRAFFIC_ENABLED';

/**
 * Check whether Supabase traffic is allowed by environment configuration.
 * @returns {boolean} true if traffic should proceed, false if blocked
 */
export function isSupabaseTrafficEnabled(env = process.env) {
  const value = env[ENABLED_ENV_VAR];
  
  // Safe by default: if not set or empty, allow traffic
  if (value === undefined || value === '') return true;
  
  // Explicit false or 'false' string: block traffic
  if (value === false || value === 'false') return false;
  
  // Explicit true or 'true' string: allow traffic
  if (value === true || value === 'true') return true;
  
  // Invalid value: log warning and default to enabled
  log.warn(`Invalid ${ENABLED_ENV_VAR} value: ${value}. Must be 'true' or 'false'. Defaulting to enabled.`);
  return true;
}

/**
 * Assert that Supabase traffic is enabled, throw if disabled.
 * Used to guard all Supabase operations.
 * @throws {Error} SUPABASE_TRAFFIC_DISABLED if traffic is blocked
 */
export function assertSupabaseTrafficEnabled(env = process.env) {
  if (!isSupabaseTrafficEnabled(env)) {
    const error = new Error('Supabase traffic is disabled via SUPABASE_TRAFFIC_ENABLED=false');
    error.code = 'SUPABASE_TRAFFIC_DISABLED';
    error.statusCode = 503;
    throw error;
  }
}

/**
 * Log that a traffic-disabled operation was blocked.
 * @param {string} operation Description of blocked operation
 * @param {string} [context] Additional context (e.g., file, function)
 */
export function logTrafficDisabled(operation, context) {
  const msg = context ? `${operation} (${context})` : operation;
  log.warn(`SUPABASE_TRAFFIC_DISABLED: ${msg}`);
}

/**
 * Safe error handler for disabled state in retry contexts.
 * Ensures disabled state is never retried; failures propagate immediately.
 * @param {Error} error Caught error
 * @returns {boolean} true if should retry, false if disabled (do not retry)
 */
export function shouldRetrySupabaseError(error, env = process.env) {
  if (error?.code === 'SUPABASE_TRAFFIC_DISABLED') {
    logTrafficDisabled('Blocked retry of disabled Supabase operation');
    return false; // Never retry disabled state
  }
  return true; // Transient errors may be retried
}

export default {
  isSupabaseTrafficEnabled,
  assertSupabaseTrafficEnabled,
  logTrafficDisabled,
  shouldRetrySupabaseError,
};
