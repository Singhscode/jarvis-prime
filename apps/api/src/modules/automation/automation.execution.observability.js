const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|header|payload|input|email|name|lease/i;
const SAFE_FIELDS = new Set(['correlationId', 'runId', 'workId', 'actorCategory', 'sourceCategory', 'transition', 'actionCode', 'recipeVersion', 'timestamp', 'attempt', 'reasonCode', 'result']);

export function redactAutomationValue(value, depth = 0) {
  if (depth > 3) return '[REDACTED]';
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => redactAutomationValue(entry, depth + 1));
  if (!value || typeof value !== 'object') return typeof value === 'string' && value.length > 256 ? '[REDACTED]' : value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactAutomationValue(entry, depth + 1)]));
}

function safeEventFields(values = {}, now) {
  const result = {};
  for (const [key, value] of Object.entries(values)) {
    if (!SAFE_FIELDS.has(key)) continue;
    if (key === 'actorCategory' && !['owner', 'employee', 'system', 'worker'].includes(value)) continue;
    if (key === 'sourceCategory' && !['worker', 'claim', 'dispatch', 'recovery', 'control'].includes(value)) continue;
    if (key === 'attempt' && (!Number.isInteger(value) || value < 0 || value > 20)) continue;
    result[key] = key === 'result' ? redactAutomationValue(value) : value;
  }
  return { ...result, timestamp: now().toISOString() };
}

export function createAutomationObservability({ logger = console, now = () => new Date() } = {}) {
  const metrics = {
    claimLatencyMs: 0, claims: 0, queueDepthSamples: 0, staleLeaseCount: 0,
    retries: 0, terminalFailures: 0, reviews: 0, quotaBlocks: 0, fairnessOwnerSamples: 0,
  };
  const emit = (level, event, values) => {
    try { logger?.[level]?.('automation_event', { event, ...safeEventFields(values, now) }); } catch {}
  };
  return {
    get metrics() { return { ...metrics }; },
    log(event, values = {}) { emit('info', event, values); },
    warn(event, values = {}) { emit('warn', event, values); },
    claim(latencyMs, work = []) {
      metrics.claims += work.length;
      metrics.claimLatencyMs += Math.max(0, Number(latencyMs) || 0);
      metrics.fairnessOwnerSamples += new Set(work.map((item) => item.owner_user_id).filter(Boolean)).size;
    },
    transition(state, reasonCode = null) {
      if (state === 'RETRYABLE') metrics.retries += 1;
      if (state === 'FAILED') metrics.terminalFailures += 1;
      if (state === 'HUMAN_REVIEW') metrics.reviews += 1;
      if (state === 'BLOCKED' && reasonCode === 'QUOTA_DENIED') metrics.quotaBlocks += 1;
    },
    recovered(count) { metrics.staleLeaseCount += Math.max(0, Number(count) || 0); },
  };
}
