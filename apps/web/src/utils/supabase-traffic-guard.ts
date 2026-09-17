/**
 * Supabase Traffic Guard (Web Client Side)
 *
 * Checks whether Supabase traffic is allowed by environment configuration.
 * Used in Next.js API routes to block traffic when SUPABASE_TRAFFIC_ENABLED=false.
 *
 * Safe by default: If not set, behaves as true (traffic enabled).
 * Reversible: Can be toggled via environment without redeployment.
 */

export function isSupabaseTrafficEnabled(env = process.env): boolean {
  const value = env.SUPABASE_TRAFFIC_ENABLED;

  // Safe by default: if not set or empty, allow traffic
  if (value === undefined || value === '') return true;

  // Explicit false or 'false' string: block traffic
  if (value === 'false') return false;

  // Explicit true or 'true' string: allow traffic
  if (value === 'true') return true;

  // Invalid value: default to enabled
  console.warn(
    `Invalid SUPABASE_TRAFFIC_ENABLED value: ${value}. Must be 'true' or 'false'. Defaulting to enabled.`
  );
  return true;
}

export default {
  isSupabaseTrafficEnabled,
};
