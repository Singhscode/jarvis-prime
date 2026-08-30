import { config } from '../config/config.js';

const LIMITS = Object.freeze({
  claimBatch: [1, 50], concurrency: [1, 20], actionConcurrency: [1, 10],
  leaseSeconds: [10, 3600], heartbeatMs: [1000, 1_800_000], pollMs: [1000, 60_000],
  scheduleIntervalMs: [1000, 60_000], scheduleBatch: [1, 25], drainGraceMs: [1000, 300_000], healthPort: [1, 65535],
});

function invalid(name) { throw new Error(`AUTOMATION_WORKER_CONFIG_INVALID_${name}`); }
function optionalText(value, name, max = 120) {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > max || value.trim() !== value) invalid(name);
  return value;
}
function number(value, name, fallback, [min, max]) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) invalid(name);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) invalid(name);
  return parsed;
}

/**
 * Validates only the configuration needed by the independently deployed durable
 * worker. It deliberately does not require HTTP/JWT or provider credentials.
 */
export function getAutomationWorkerRuntimeConfig(env = process.env) {
  const supabaseUrl = env.SUPABASE_URL ?? config.supabaseUrl;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY ?? config.supabaseKey;
  if (!supabaseUrl || !supabaseKey) throw new Error('AUTOMATION_WORKER_DATABASE_CONFIG_REQUIRED');

  const leaseSeconds = number(env.AUTOMATION_WORKER_LEASE_SECONDS, 'LEASE_SECONDS', 60, LIMITS.leaseSeconds);
  const heartbeatMs = number(env.AUTOMATION_WORKER_HEARTBEAT_MS, 'HEARTBEAT_MS', 15_000, LIMITS.heartbeatMs);
  if (heartbeatMs > leaseSeconds * 500) invalid('HEARTBEAT_MS');

  return Object.freeze({
    workerId: optionalText(env.AUTOMATION_WORKER_ID, 'ID'),
    workerOptions: Object.freeze({
      claimBatch: number(env.AUTOMATION_WORKER_CLAIM_BATCH, 'CLAIM_BATCH', 10, LIMITS.claimBatch),
      concurrency: number(env.AUTOMATION_WORKER_CONCURRENCY, 'CONCURRENCY', 4, LIMITS.concurrency),
      actionConcurrency: number(env.AUTOMATION_WORKER_ACTION_CONCURRENCY, 'ACTION_CONCURRENCY', 2, LIMITS.actionConcurrency),
      leaseSeconds,
      heartbeatMs,
      pollMs: number(env.AUTOMATION_WORKER_POLL_MS, 'POLL_MS', 5000, LIMITS.pollMs),
    }),
    scheduleOptions: Object.freeze({
      intervalMs: number(env.AUTOMATION_SCHEDULE_INTERVAL_MS, 'SCHEDULE_INTERVAL_MS', 5000, LIMITS.scheduleIntervalMs),
      batch: number(env.AUTOMATION_SCHEDULE_BATCH, 'SCHEDULE_BATCH', 25, LIMITS.scheduleBatch),
    }),
    drainGraceMs: number(env.AUTOMATION_WORKER_DRAIN_GRACE_MS, 'DRAIN_GRACE_MS', 30_000, LIMITS.drainGraceMs),
    healthPort: env.AUTOMATION_WORKER_HEALTH_PORT === undefined || env.AUTOMATION_WORKER_HEALTH_PORT === ''
      ? null : number(env.AUTOMATION_WORKER_HEALTH_PORT, 'HEALTH_PORT', null, LIMITS.healthPort),
  });
}
