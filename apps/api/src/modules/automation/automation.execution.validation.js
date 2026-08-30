import { createHash, randomUUID } from 'node:crypto';

export const EXECUTION_STATES = Object.freeze(['RUNNING', 'WAITING', 'COMPLETED', 'RETRYABLE', 'FAILED', 'BLOCKED', 'CANCELLED', 'HUMAN_REVIEW']);
export const ACTION_CODES = Object.freeze(['ACT_ASSIGN', 'ACT_TASK', 'ACT_NOTIFY', 'ACT_APOLLO_SEARCH']);
export const AUTOMATION_REGISTRY_VERSION = 'AUTOMATION_REGISTRY_V1';
export const AUTOMATION_WORKER_VERSION = 'AUTOMATION_WORKER_V1';
export const TERMINAL_STATES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
export const MAX = Object.freeze({ claimBatch: 50, workerConcurrency: 20, actionConcurrency: 10, inputBytes: 65536, resultBytes: 16384, metadataBytes: 8192, pollMinMs: 1000, pollMaxMs: 60000 });

const transitions = new Map([
  ['RUNNING', new Set(['WAITING', 'COMPLETED', 'RETRYABLE', 'FAILED', 'BLOCKED', 'CANCELLED', 'HUMAN_REVIEW'])],
  ['WAITING', new Set(['RUNNING', 'BLOCKED', 'CANCELLED', 'HUMAN_REVIEW'])],
  ['RETRYABLE', new Set(['WAITING', 'RUNNING', 'FAILED', 'BLOCKED', 'CANCELLED', 'HUMAN_REVIEW'])],
  ['BLOCKED', new Set(['WAITING', 'CANCELLED', 'HUMAN_REVIEW'])],
  ['HUMAN_REVIEW', new Set(['WAITING', 'FAILED', 'CANCELLED'])],
]);

// Matches PostgreSQL jsonb::text for the bounded JSON values persisted by this control plane.
// This lets admission bind the supplied hash to the exact canonical input in one trusted boundary.
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(', ')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort((left, right) => left.length - right.length || left.localeCompare(right)).map((key) => `${JSON.stringify(key)}: ${stableJson(value[key])}`).join(', ')}}`;
  return JSON.stringify(value);
}
export function sha256(value) { return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex'); }
export function byteLength(value) { return Buffer.byteLength(JSON.stringify(value)); }
export function assertObject(value, label, maxBytes = MAX.inputBytes) { if (!value || Array.isArray(value) || typeof value !== 'object' || byteLength(value) > maxBytes) throw new Error(`AUTOMATION_INVALID_${label}`); return value; }
export function assertActionCode(value) { if (!ACTION_CODES.includes(value)) throw new Error('AUTOMATION_ACTION_DISABLED'); return value; }
export function assertTransition(previous, next) { if (!transitions.get(previous)?.has(next)) throw new Error('AUTOMATION_TRANSITION_INVALID'); return next; }
export function bounded(value, fallback, min, max, label) { const number = value === undefined ? fallback : Number(value); if (!Number.isInteger(number) || number < min || number > max) throw new Error(`AUTOMATION_INVALID_${label}`); return number; }
export function workerIdentity() { return `automation-${process.pid}-${randomUUID()}`; }
export function redactedError(error) { return { code: String(error?.code || error?.message || 'AUTOMATION_UNKNOWN').replace(/[^A-Z0-9_]/gi, '_').slice(0, 100) || 'AUTOMATION_UNKNOWN' }; }
export function retryDelayMs(attempt, key = '') { const capped = Math.max(1, Math.min(20, attempt)); const base = Math.min(300000, 1000 * (2 ** (capped - 1))); return base + (Number.parseInt(sha256(`${key}:${attempt}`).slice(0, 4), 16) % 1000); }
export function classifyError(error, { afterDispatch = false, knownOutcome = false } = {}) {
  const providerOutcome = error?.automationOutcome;
  if (providerOutcome === 'RETRYABLE') return { state: 'RETRYABLE', reason: String(error.code || 'EXTERNAL_RETRYABLE') };
  if (providerOutcome === 'FAILED') return { state: 'FAILED', reason: String(error.code || 'EXTERNAL_FAILED') };
  if (providerOutcome === 'UNKNOWN_OUTCOME') return { state: 'HUMAN_REVIEW', reason: String(error.code || 'EXTERNAL_UNKNOWN_OUTCOME') };
  if (providerOutcome === 'HUMAN_REVIEW') return { state: 'HUMAN_REVIEW', reason: String(error.code || 'EXTERNAL_HUMAN_REVIEW') };
  const code = String(error?.code || error?.message || '').toUpperCase();
  if (afterDispatch && !knownOutcome) return { state: 'HUMAN_REVIEW', reason: 'POST_DISPATCH_UNCERTAIN' };
  if (/TIMEOUT|UNAVAILABLE|ECONN|NETWORK|RATE_LIMIT|TEMPORARY/.test(code)) return { state: 'RETRYABLE', reason: 'TRANSIENT_DEPENDENCY_FAILURE' };
  if (/DENIED|NOT_FOUND|VALIDATION|CONFLICT|PERMISSION|AUTH/.test(code)) return { state: 'FAILED', reason: 'TERMINAL_DOMAIN_FAILURE' };
  return { state: 'HUMAN_REVIEW', reason: 'UNKNOWN_OUTCOME' };
}
