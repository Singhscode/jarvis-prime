import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApolloReadOnlyAdapterRegistry, assertApolloSearchInput } from '../src/modules/automation/automation.apollo-read.adapter.js';
import { createActionResolver } from '../src/modules/automation/automation.execution.actions.js';
import { classifyError } from '../src/modules/automation/automation.execution.validation.js';
import { createWorker } from '../src/modules/automation/automation.execution.worker.js';

const baseContext = Object.freeze({
  providerCode: 'APOLLO', actionCode: 'ACT_APOLLO_SEARCH', ownerUserId: 'owner-a', runId: 'run-a',
  workItemId: 'work-a', correlationId: 'correlation-a',
  input: { titles: ['Founder'], locations: ['New York'], industries: ['Software'], limit: 2 },
});
const correlation = 'phase11:APOLLO:correlation-a';
function source(overrides = {}) {
  return {
    isConfigured: () => true,
    searchPage: async () => ({ prospects: [{ id: 'discarded-raw-prospect' }], partial: false, total: 1 }),
    ...overrides,
  };
}

for (const [name, error, expected] of [
  ['rate limit', Object.assign(new Error('rate'), { status: 429 }), { state: 'RETRYABLE', reason: 'APOLLO_RATE_LIMIT' }],
  ['provider outage', Object.assign(new Error('outage'), { status: 503 }), { state: 'RETRYABLE', reason: 'APOLLO_UNAVAILABLE' }],
  ['permanent request error', Object.assign(new Error('bad request'), { status: 400 }), { state: 'FAILED', reason: 'APOLLO_REQUEST_REJECTED' }],
]) {
  test(`Apollo read adapter classifies ${name} with a durable reconciliation summary`, async () => {
    const registry = createApolloReadOnlyAdapterRegistry({ apolloClient: source({ searchPage: async () => { throw error; } }) });
    await assert.rejects(registry.execute(baseContext), (received) => {
      assert.deepEqual(classifyError(received, { afterDispatch: true }), expected);
      assert.deepEqual(received.safeMetadata, { provider: 'APOLLO', outcome: expected.state === 'RETRYABLE' ? 'RETRYABLE_FAILURE' : 'TERMINAL_FAILURE', completeness: 'UNKNOWN', providerCorrelationId: correlation });
      return true;
    });
  });
}

test('Apollo read adapter accepts fixed input, discards raw records, and records complete, partial, and unknown completeness honestly', async () => {
  const calls = [];
  for (const [page, expected] of [
    [{ prospects: [{ email: 'private@example.test' }, { email: 'private2@example.test' }], partial: false, total: 2 }, { outcome: 'COMPLETE_SUCCESS', completeness: 'COMPLETE' }],
    [{ prospects: [{ email: 'private@example.test' }, { email: 'private2@example.test' }], partial: true, total: 90 }, { outcome: 'PARTIAL_SUCCESS', completeness: 'PARTIAL' }],
    [{ prospects: [{ email: 'private@example.test' }], partial: false, total: null }, { outcome: 'SUCCESS_UNKNOWN_COMPLETENESS', completeness: 'UNKNOWN' }],
  ]) {
    const registry = createApolloReadOnlyAdapterRegistry({ apolloClient: source({ searchPage: async (...args) => { calls.push(args); return page; } }) });
    const result = await registry.execute(baseContext);
    assert.deepEqual(result.safeMetadata, { provider: 'APOLLO', returnedCount: page.prospects.length, providerCorrelationId: correlation, ...expected });
    assert.equal(JSON.stringify(result).includes('private@example.test'), false);
  }
  assert.deepEqual(calls[0][0], { icp_titles: ['Founder'], icp_locations: ['New York'], icp_industries: ['Software'] });
  assert.equal(calls[0][1], 2);
  assert.equal(calls[0][2].signal instanceof AbortSignal, true);
  assert.throws(() => assertApolloSearchInput({ ...baseContext.input, limit: 51 }), /AUTOMATION_APOLLO_INPUT_INVALID/);
  assert.throws(() => assertApolloSearchInput({ ...baseContext.input, query: 'browser selected' }), /AUTOMATION_APOLLO_INPUT_INVALID/);
  assert.throws(() => assertApolloSearchInput({ ...baseContext.input, titles: [] }), /AUTOMATION_APOLLO_INPUT_INVALID/);
});

test('Apollo adapter rejects malformed input before any provider call', async () => {
  const calls = [];
  const registry = createApolloReadOnlyAdapterRegistry({ apolloClient: source({ searchPage: async (...args) => { calls.push(args); return { prospects: [], partial: false, total: 0 }; } }) });
  const invalidInputs = [
    { ...baseContext.input, titles: [1] },
    { ...baseContext.input, locations: [true] },
    { ...baseContext.input, industries: [null] },
    { ...baseContext.input, titles: [{ value: 'Founder' }] },
    { ...baseContext.input, titles: [['Founder']] },
    { ...baseContext.input, locations: [' \t '] },
    { ...baseContext.input, titles: ['Founder', 'founder'] },
    { ...baseContext.input, locations: [' New York ', 'new york'] },
    { ...baseContext.input, titles: ['x'.repeat(101)] },
    { ...baseContext.input, query: 'unknown' },
    { titles: ['Founder'], locations: ['New York'], limit: 2 },
    { ...baseContext.input, titles: [] },
    { ...baseContext.input, limit: 1.5 },
    { ...baseContext.input, limit: 51 },
  ];
  for (const input of invalidInputs) {
    assert.throws(() => assertApolloSearchInput(input), /AUTOMATION_APOLLO_INPUT_INVALID/);
    await assert.rejects(registry.execute({ ...baseContext, input }), /AUTOMATION_APOLLO_INPUT_INVALID/);
  }
  assert.equal(calls.length, 0);
});

test('Apollo adapter derives per-work correlation without CRM/outreach and preserves terminal/retry outcomes', async () => {
  const seen = [];
  const registry = createApolloReadOnlyAdapterRegistry({ apolloClient: source({ searchPage: async (...args) => { seen.push(args); return { prospects: [], partial: false, total: 0 }; } }) });
  await registry.execute(baseContext);
  await registry.execute({ ...baseContext, ownerUserId: 'owner-b', runId: 'run-b', workItemId: 'work-b', correlationId: 'correlation-b' });
  assert.equal(seen.length, 2);
  await assert.rejects(createApolloReadOnlyAdapterRegistry({ apolloClient: source({ isConfigured: () => false }) }).execute(baseContext), (error) => {
    assert.deepEqual(error.safeMetadata, { provider: 'APOLLO', outcome: 'TERMINAL_FAILURE', completeness: 'UNKNOWN', providerCorrelationId: correlation });
    return true;
  });
});

test('Apollo read timeout is retryable with safe unknown completeness and never becomes a logical duplicate', async () => {
  const registry = createApolloReadOnlyAdapterRegistry({ timeoutMs: 1000, apolloClient: source({ searchPage: async (_client, _limit, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) }) });
  await assert.rejects(registry.execute(baseContext), (error) => {
    assert.deepEqual(classifyError(error, { afterDispatch: true }), { state: 'RETRYABLE', reason: 'EXTERNAL_TIMEOUT' });
    assert.deepEqual(error.safeMetadata, { provider: 'APOLLO', outcome: 'RETRYABLE_FAILURE', completeness: 'UNKNOWN', providerCorrelationId: correlation });
    return true;
  });
});

test('Apollo resolver is independently default-deny; explicit test-only server enablement uses APOLLO_READ and existing audit lifecycle', async () => {
  const providerRegistry = createApolloReadOnlyAdapterRegistry({ apolloClient: source() });
  assert.throws(() => createActionResolver({ providerRegistry })('ACT_APOLLO_SEARCH', 'APOLLO'), /AUTOMATION_ACTION_DISABLED/);
  const events = [];
  const actionResolver = createActionResolver({ providerRegistry, enableApolloReadOnly: true });
  const repository = {
    checkReady: async () => true, recoverStale: async () => [],
    claim: async () => [{ id: 'work-a', owner_user_id: 'owner-a', run_id: 'run-a', requested_by_user_id: 'owner-a', requested_by_kind: 'owner', action_code: 'ACT_APOLLO_SEARCH', provider_code: 'APOLLO', correlation_id: 'correlation-a', lease_token: 'lease-a', attempt_count: 1, input: baseContext.input }],
    markDispatching: async (...args) => { events.push(['dispatch', ...args]); return { allowed: true }; },
    transition: async (...args) => events.push(['transition', ...args]),
  };
  const worker = createWorker({ workerId: 'apollo-worker', repositoryApi: repository, actionResolver });
  await worker.start();
  assert.deepEqual(await worker.runOnce(), [{ id: 'work-a', state: 'COMPLETED' }]);
  assert.deepEqual(events[0], ['dispatch', 'work-a', 'apollo-worker', 'lease-a']);
  assert.deepEqual(events[1].slice(4, 7), ['COMPLETED', 'ACTION_COMPLETED', { provider: 'APOLLO', outcome: 'COMPLETE_SUCCESS', completeness: 'COMPLETE', returnedCount: 1, providerCorrelationId: correlation }]);
});

test('post-dispatch Apollo uncertainty is persisted as review-safe unknown evidence', async () => {
  const transitions = [];
  const repository = {
    checkReady: async () => true, recoverStale: async () => [],
    claim: async () => [{ id: 'work-unknown', owner_user_id: 'owner-a', run_id: 'run-a', requested_by_user_id: 'owner-a', requested_by_kind: 'owner', action_code: 'ACT_APOLLO_SEARCH', provider_code: 'APOLLO', correlation_id: 'correlation-a', lease_token: 'lease-a', attempt_count: 1, input: baseContext.input }],
    markDispatching: async () => ({ allowed: true }), transition: async (...args) => transitions.push(args),
  };
  const worker = createWorker({ workerId: 'apollo-unknown', repositoryApi: repository, actionResolver: createActionResolver({ providerRegistry: createApolloReadOnlyAdapterRegistry({ apolloClient: source({ searchPage: async () => { throw new Error('lost response'); } }) }), enableApolloReadOnly: true }) });
  await worker.start(); await worker.runOnce();
  assert.deepEqual(transitions[0].slice(3, 7), ['RETRYABLE', 'APOLLO_NETWORK_ERROR', { code: 'APOLLO_NETWORK_ERROR', provider: 'APOLLO', outcome: 'RETRYABLE_FAILURE', completeness: 'UNKNOWN', providerCorrelationId: correlation }, transitions[0][6]]);
});
