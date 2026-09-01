import { MAX, assertObject, byteLength } from './automation.execution.validation.js';

export const EXTERNAL_PROVIDER_ACTION_KINDS = Object.freeze(['READ_ONLY', 'SIDE_EFFECT']);
export const EXTERNAL_PROVIDER_RESULT_CLASSIFICATIONS = Object.freeze(['SUCCESS', 'RETRYABLE', 'FAILED', 'UNKNOWN_OUTCOME', 'HUMAN_REVIEW']);

const CODE = /^[A-Z][A-Z0-9_]{2,60}$/;
const CAPABILITY = /^CAP_[A-Z0-9_]{3,80}$/;
const REASON = /^[A-Z0-9_]{3,100}$/;
const FORBIDDEN_INPUT_FIELDS = new Set(['credential', 'credentials', 'secret', 'secrets', 'token', 'tokens', 'password', 'apikey', 'api_key', 'url', 'uri', 'module', 'modules', 'sql', 'handler', 'script', 'command', 'code']);

/**
 * @typedef {object} ExternalProviderAdapterDefinition
 * @property {string} providerCode Fixed server-registered provider identity.
 * @property {string} actionCode Fixed server-registered action identity.
 * @property {'READ_ONLY'|'SIDE_EFFECT'} kind Whether the adapter can cause an external side effect.
 * @property {string|null} capability Required server-approved capability for SIDE_EFFECT adapters.
 * @property {string} rateConcurrencyGroup Fixed future quota/concurrency grouping key.
 * @property {number} timeoutMs Per-call server timeout in milliseconds.
 * @property {(input: object) => object} validateInput Server-owned provider input validator.
 * @property {(context: object) => Promise<object>} execute Server-owned provider implementation.
 */

function exact(value, fields, code) {
  const object = assertObject(value, code);
  if (Object.keys(object).some((key) => !fields.includes(key))) throw new Error(`AUTOMATION_INVALID_${code}`);
  return object;
}
function string(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200) throw new Error(`AUTOMATION_INVALID_${label}`);
  return value;
}
function fixedCode(value, label) {
  if (typeof value !== 'string' || !CODE.test(value)) throw new Error(`AUTOMATION_INVALID_${label}`);
  return value;
}
function reason(value, fallback) {
  const candidate = value || fallback;
  if (typeof candidate !== 'string' || !REASON.test(candidate)) throw new Error('AUTOMATION_EXTERNAL_RESULT_INVALID');
  return candidate;
}
function keyFor(providerCode, actionCode) { return `${providerCode}:${actionCode}`; }
function assertSafeInput(value) {
  const input = assertObject(value, 'EXTERNAL_PROVIDER_INPUT');
  function visit(candidate) {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== 'object') {
      if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) throw new Error('AUTOMATION_EXTERNAL_DYNAMIC_INPUT');
      return;
    }
    for (const [field, nested] of Object.entries(candidate)) {
      if (FORBIDDEN_INPUT_FIELDS.has(field.toLowerCase())) throw new Error('AUTOMATION_EXTERNAL_DYNAMIC_INPUT');
      visit(nested);
    }
  }
  visit(input);
  return input;
}
function validateDefinition(value) {
  const definition = exact(value, ['providerCode', 'actionCode', 'kind', 'capability', 'rateConcurrencyGroup', 'timeoutMs', 'validateInput', 'execute'], 'EXTERNAL_PROVIDER_ADAPTER');
  const providerCode = fixedCode(definition.providerCode, 'EXTERNAL_PROVIDER_CODE');
  const actionCode = fixedCode(definition.actionCode, 'EXTERNAL_ACTION_CODE');
  if (!EXTERNAL_PROVIDER_ACTION_KINDS.includes(definition.kind)) throw new Error('AUTOMATION_INVALID_EXTERNAL_ACTION_KIND');
  if (definition.kind === 'SIDE_EFFECT') {
    if (typeof definition.capability !== 'string' || !CAPABILITY.test(definition.capability)) throw new Error('AUTOMATION_INVALID_EXTERNAL_CAPABILITY');
  } else if (definition.capability !== null) {
    throw new Error('AUTOMATION_INVALID_EXTERNAL_CAPABILITY');
  }
  const rateConcurrencyGroup = fixedCode(definition.rateConcurrencyGroup, 'EXTERNAL_RATE_CONCURRENCY_GROUP');
  if (!Number.isInteger(definition.timeoutMs) || definition.timeoutMs < 1000 || definition.timeoutMs > 120000) throw new Error('AUTOMATION_INVALID_EXTERNAL_TIMEOUT');
  if (typeof definition.validateInput !== 'function' || typeof definition.execute !== 'function') throw new Error('AUTOMATION_INVALID_EXTERNAL_ADAPTER');
  return Object.freeze({ ...definition, providerCode, actionCode, rateConcurrencyGroup });
}
function assertExecutionContext(value) {
  const context = exact(value, ['providerCode', 'actionCode', 'ownerUserId', 'runId', 'workItemId', 'correlationId', 'input'], 'EXTERNAL_PROVIDER_CONTEXT');
  return Object.freeze({
    providerCode: fixedCode(context.providerCode, 'EXTERNAL_PROVIDER_CODE'),
    actionCode: fixedCode(context.actionCode, 'EXTERNAL_ACTION_CODE'),
    ownerUserId: string(context.ownerUserId, 'EXTERNAL_OWNER'),
    runId: string(context.runId, 'EXTERNAL_RUN'),
    workItemId: string(context.workItemId, 'EXTERNAL_WORK'),
    correlationId: string(context.correlationId, 'EXTERNAL_CORRELATION'),
    input: assertSafeInput(context.input),
  });
}
function identifiers(context) {
  return Object.freeze({
    providerIdempotencyKey: `phase11:${context.providerCode}:${context.actionCode}:${context.workItemId}`,
    providerCorrelationId: `phase11:${context.providerCode}:${context.correlationId}`,
  });
}
function outcomeError(classification, reasonCode, safeMetadata = {}) {
  const error = new Error(reasonCode);
  error.code = reasonCode;
  error.automationOutcome = classification;
  error.knownOutcome = classification !== 'UNKNOWN_OUTCOME';
  error.safeMetadata = safeMetadata;
  return error;
}
function normalizeResult(value) {
  const result = exact(value, ['classification', 'reasonCode', 'safeMetadata'], 'EXTERNAL_PROVIDER_RESULT');
  if (!EXTERNAL_PROVIDER_RESULT_CLASSIFICATIONS.includes(result.classification)) throw new Error('AUTOMATION_EXTERNAL_RESULT_INVALID');
  const safeMetadata = assertObject(result.safeMetadata || {}, 'EXTERNAL_PROVIDER_RESULT_METADATA', MAX.metadataBytes);
  if (byteLength(safeMetadata) > MAX.metadataBytes) throw new Error('AUTOMATION_EXTERNAL_RESULT_INVALID');
  if (result.classification === 'SUCCESS') {
    if (result.reasonCode !== null) throw new Error('AUTOMATION_EXTERNAL_RESULT_INVALID');
    return Object.freeze({ safeMetadata });
  }
  const defaults = Object.freeze({
    RETRYABLE: 'EXTERNAL_RETRYABLE',
    FAILED: 'EXTERNAL_FAILED',
    UNKNOWN_OUTCOME: 'EXTERNAL_UNKNOWN_OUTCOME',
    HUMAN_REVIEW: 'EXTERNAL_HUMAN_REVIEW',
  });
  throw outcomeError(result.classification, reason(result.reasonCode, defaults[result.classification]), safeMetadata);
}
function withTimeout(execute, timeoutMs, kind) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error('EXTERNAL_TIMEOUT');
      error.code = 'EXTERNAL_TIMEOUT';
      // A bounded read-only request has no external mutation to reconcile.
      // Side-effect adapters remain unknown outcomes unless their own contract proves otherwise.
      if (kind === 'READ_ONLY') {
        error.automationOutcome = 'RETRYABLE';
        error.knownOutcome = true;
      }
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([execute(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

/**
 * Creates a closed, server-composed adapter registry. It intentionally has no default
 * adapters: registering an adapter later also requires an allowlisted Phase 11 action,
 * migration-supported provider identity, and the existing worker/claim lifecycle.
 */
export function createExternalProviderAdapterRegistry({ adapters = [], approvedCapabilities = [] } = {}) {
  if (!Array.isArray(adapters) || !Array.isArray(approvedCapabilities)) throw new Error('AUTOMATION_INVALID_EXTERNAL_REGISTRY');
  const approved = new Set(approvedCapabilities);
  if ([...approved].some((capability) => typeof capability !== 'string' || !CAPABILITY.test(capability))) throw new Error('AUTOMATION_INVALID_EXTERNAL_CAPABILITY');
  const registry = new Map();
  for (const candidate of adapters) {
    const definition = validateDefinition(candidate);
    const key = keyFor(definition.providerCode, definition.actionCode);
    if (registry.has(key)) throw new Error('AUTOMATION_EXTERNAL_ADAPTER_DUPLICATE');
    registry.set(key, definition);
  }
  function get(providerCode, actionCode) {
    return registry.get(keyFor(providerCode, actionCode)) || null;
  }
  return Object.freeze({
    get,
    list: () => Object.freeze([...registry.values()].map(({ execute, validateInput, ...definition }) => Object.freeze(definition))),
    async execute(value) {
      const context = assertExecutionContext(value);
      const definition = get(context.providerCode, context.actionCode);
      if (!definition) throw new Error('AUTOMATION_EXTERNAL_ACTION_DISABLED');
      if (definition.kind === 'SIDE_EFFECT' && !approved.has(definition.capability)) throw new Error('AUTOMATION_EXTERNAL_CAPABILITY_UNAPPROVED');
      const input = assertSafeInput(definition.validateInput(context.input));
      const providerIdentifiers = identifiers(context);
      const execution = Object.freeze({
        ...context,
        input,
        ...providerIdentifiers,
        kind: definition.kind,
        capability: definition.capability,
        rateConcurrencyGroup: definition.rateConcurrencyGroup,
        timeoutMs: definition.timeoutMs,
      });
      try {
        const result = await withTimeout((signal) => definition.execute(Object.freeze({ ...execution, signal })), definition.timeoutMs, definition.kind);
        return normalizeResult(result);
      } catch (error) {
        // A timeout can win the race before an adapter observes its abort signal.
        // Preserve only a safe Apollo reconciliation summary; no raw request/result is retained.
        if (context.providerCode === 'APOLLO' && !error?.safeMetadata) {
          error.safeMetadata = Object.freeze({
            provider: 'APOLLO',
            outcome: error?.automationOutcome === 'HUMAN_REVIEW' || error?.automationOutcome === 'UNKNOWN_OUTCOME' ? 'UNKNOWN_OUTCOME' : 'RETRYABLE_FAILURE',
            completeness: 'UNKNOWN',
            providerCorrelationId: providerIdentifiers.providerCorrelationId,
          });
        }
        throw error;
      }
    },
  });
}
