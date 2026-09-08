import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertStagingCanaryLineage, buildStagingCanaryRequest, createStagingCanary } from '../src/modules/automation/automation.staging-canary.service.js';

const runtimeConfig = Object.freeze({
  runtimeTarget: 'staging',
  supabaseUrl: 'https://ygflbvplksgljlamhbju.supabase.co',
  supabaseKey: 'test-service-role-key',
});

const request = Object.freeze({
  ownerUserId: '11111111-1111-4111-8111-111111111111',
  actorUserId: '11111111-1111-4111-8111-111111111111',
  sourceEventId: 'CANARY_RELEASE_20260908',
  dueAt: '2026-09-08T09:00:00.000Z',
});

test('staging canary accepts only deterministic identity fields and forwards no provider/action/input surface', async () => {
  const calls = [];
  const canary = createStagingCanary({ runtimeConfig, runCanary: async (value) => { calls.push(value); return { run_id: '22222222-2222-4222-8222-222222222222' }; } });
  await canary.admit(request);
  await canary.admit(request);
  assert.deepEqual(calls, [request, request]);
  assert.deepEqual(buildStagingCanaryRequest(request), request);
  assert.throws(() => buildStagingCanaryRequest({ ...request, provider: 'APOLLO' }), /AUTOMATION_CANARY_INVALID/);
  assert.throws(() => buildStagingCanaryRequest({ ...request, actionCode: 'ACT_ASSIGN' }), /AUTOMATION_CANARY_INVALID/);
  assert.throws(() => buildStagingCanaryRequest({ ...request, input: { url: 'https://example.test' } }), /AUTOMATION_CANARY_INVALID/);
});

test('staging canary requires completed fixed internal work and immutable admission lineage', async () => {
  const history = {
    run: { id: '22222222-2222-4222-8222-222222222222' },
    workItems: [{ id: '33333333-3333-4333-8333-333333333333', actionCode: 'ACT_INTERNAL_FAKE', state: 'COMPLETED', result: { mode: 'INTERNAL_FAKE_CANARY' } }],
    events: [{ code: 'RECIPE_ADMITTED' }, { code: 'FUTURE_TRIGGER_RESOLVED' }, { code: 'WORK_CLAIMED' }],
  };
  assert.deepEqual(assertStagingCanaryLineage(history), { runId: history.run.id, workItemId: history.workItems[0].id, state: 'COMPLETED' });
  assert.throws(() => assertStagingCanaryLineage({ ...history, workItems: [{ ...history.workItems[0], actionCode: 'ACT_APOLLO_SEARCH' }] }), /AUTOMATION_CANARY_LINEAGE_INVALID/);
});

test('staging canary poll returns only after durable fixed-action completion', async () => {
  let reads = 0;
  const canary = createStagingCanary({
    runtimeConfig,
    getRunHistory: async () => {
      reads += 1;
      return reads === 1
        ? { workItems: [{ id: '33333333-3333-4333-8333-333333333333', actionCode: 'ACT_INTERNAL_FAKE', state: 'WAITING', result: {} }], events: [] }
        : { workItems: [{ id: '33333333-3333-4333-8333-333333333333', actionCode: 'ACT_INTERNAL_FAKE', state: 'COMPLETED', result: { mode: 'INTERNAL_FAKE_CANARY' } }], events: [{ code: 'RECIPE_ADMITTED' }, { code: 'FUTURE_TRIGGER_RESOLVED' }] };
    },
    sleep: async () => {},
  });
  const result = await canary.awaitCompletion({ ownerUserId: request.ownerUserId, runId: '22222222-2222-4222-8222-222222222222', timeoutMs: 1_000, pollMs: 250 });
  assert.equal(reads, 2);
  assert.equal(result.state, 'COMPLETED');
});
