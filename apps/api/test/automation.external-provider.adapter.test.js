import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExternalProviderAdapterRegistry } from '../src/modules/automation/automation.external-provider.adapter.js';
import { classifyError } from '../src/modules/automation/automation.execution.validation.js';

const baseContext = Object.freeze({
  providerCode: 'APOLLO',
  actionCode: 'ACT_APOLLO_SEARCH',
  ownerUserId: 'owner-1',
  runId: 'run-1',
  workItemId: 'work-1',
  correlationId: 'correlation-1',
  input: { query: 'founder' },
});

function adapter(overrides = {}) {
  return {
    providerCode: 'APOLLO',
    actionCode: 'ACT_APOLLO_SEARCH',
    kind: 'READ_ONLY',
    capability: null,
    rateConcurrencyGroup: 'APOLLO_READ',
    timeoutMs: 1000,
    validateInput: (input) => input,
    execute: async () => ({ classification: 'SUCCESS', reasonCode: null, safeMetadata: { count: 1 } }),
    ...overrides,
  };
}

test('external adapter registry is closed and derives provider idempotency/correlation from server work context', async () => {
  const seen = [];
  const registry = createExternalProviderAdapterRegistry({ adapters: [adapter({ execute: async (context) => {
    seen.push(context);
    return { classification: 'SUCCESS', reasonCode: null, safeMetadata: { count: 1 } };
  } })] });
  assert.equal(registry.get('APOLLO', 'ACT_APOLLO_SEARCH').providerCode, 'APOLLO');
  assert.deepEqual(registry.list(), [{ providerCode: 'APOLLO', actionCode: 'ACT_APOLLO_SEARCH', kind: 'READ_ONLY', capability: null, rateConcurrencyGroup: 'APOLLO_READ', timeoutMs: 1000 }]);
  assert.deepEqual(await registry.execute(baseContext), { safeMetadata: { count: 1 } });
  assert.deepEqual(seen[0], {
    ...baseContext,
    providerIdempotencyKey: 'phase11:APOLLO:ACT_APOLLO_SEARCH:work-1',
    providerCorrelationId: 'phase11:APOLLO:correlation-1',
    kind: 'READ_ONLY',
    capability: null,
    rateConcurrencyGroup: 'APOLLO_READ',
    timeoutMs: 1000,
    signal: seen[0].signal,
  });
  assert.equal(seen[0].signal instanceof AbortSignal, true);
  await assert.rejects(registry.execute({ ...baseContext, providerCode: 'HUNTER' }), /AUTOMATION_EXTERNAL_ACTION_DISABLED/);
});

test('external adapter contract blocks browser-dynamic execution fields before an adapter can run', async () => {
  let calls = 0;
  const registry = createExternalProviderAdapterRegistry({ adapters: [adapter({ execute: async () => { calls += 1; return { classification: 'SUCCESS', reasonCode: null, safeMetadata: {} }; } })] });
  await assert.rejects(registry.execute({ ...baseContext, credentials: 'browser-secret' }), /AUTOMATION_INVALID_EXTERNAL_PROVIDER_CONTEXT/);
  await assert.rejects(registry.execute({ ...baseContext, input: { callback: 'https://example.test' } }), /AUTOMATION_EXTERNAL_DYNAMIC_INPUT/);
  await assert.rejects(registry.execute({ ...baseContext, input: { sql: 'select 1' } }), /AUTOMATION_EXTERNAL_DYNAMIC_INPUT/);
  assert.equal(calls, 0);
});

test('side-effect adapters require explicit server capability approval while read-only adapters do not', async () => {
  const sideEffect = adapter({ providerCode: 'CALENDAR', actionCode: 'ACT_CALENDAR_BOOK', kind: 'SIDE_EFFECT', capability: 'CAP_CALENDAR_BOOKING', rateConcurrencyGroup: 'CALENDAR_WRITE' });
  const blocked = createExternalProviderAdapterRegistry({ adapters: [sideEffect] });
  await assert.rejects(blocked.execute({ ...baseContext, providerCode: 'CALENDAR', actionCode: 'ACT_CALENDAR_BOOK' }), /AUTOMATION_EXTERNAL_CAPABILITY_UNAPPROVED/);
  const allowed = createExternalProviderAdapterRegistry({ adapters: [sideEffect], approvedCapabilities: ['CAP_CALENDAR_BOOKING'] });
  assert.deepEqual(await allowed.execute({ ...baseContext, providerCode: 'CALENDAR', actionCode: 'ACT_CALENDAR_BOOK' }), { safeMetadata: { count: 1 } });
});

test('provider result classifications map into the existing Phase 11 retry and review lifecycle', async () => {
  for (const [classification, expected] of [
    ['RETRYABLE', { state: 'RETRYABLE', reason: 'PROVIDER_RATE_LIMIT' }],
    ['FAILED', { state: 'FAILED', reason: 'PROVIDER_REJECTED' }],
    ['UNKNOWN_OUTCOME', { state: 'HUMAN_REVIEW', reason: 'PROVIDER_OUTCOME_UNKNOWN' }],
    ['HUMAN_REVIEW', { state: 'HUMAN_REVIEW', reason: 'PROVIDER_REVIEW_REQUIRED' }],
  ]) {
    const registry = createExternalProviderAdapterRegistry({ adapters: [adapter({ execute: async () => ({ classification, reasonCode: expected.reason, safeMetadata: {} }) })] });
    await assert.rejects(registry.execute(baseContext), (error) => {
      assert.deepEqual(classifyError(error, { afterDispatch: true }), expected);
      return true;
    });
  }
});

test('adapter definitions are static, typed, bounded, and duplicate-free', () => {
  assert.throws(() => createExternalProviderAdapterRegistry({ adapters: [adapter({ kind: 'SIDE_EFFECT', capability: null })] }), /AUTOMATION_INVALID_EXTERNAL_CAPABILITY/);
  assert.throws(() => createExternalProviderAdapterRegistry({ adapters: [adapter(), adapter()] }), /AUTOMATION_EXTERNAL_ADAPTER_DUPLICATE/);
  assert.throws(() => createExternalProviderAdapterRegistry({ adapters: [adapter({ timeoutMs: 999 })] }), /AUTOMATION_INVALID_EXTERNAL_TIMEOUT/);
  assert.throws(() => createExternalProviderAdapterRegistry({ adapters: [adapter({ extra: true })] }), /AUTOMATION_INVALID_EXTERNAL_PROVIDER_ADAPTER/);
});
