import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertStagingCanaryLineage,
  buildStagingCanaryRequest,
  createStagingCanary,
  STAGING_CANARY_COMPLETION_GRACE_MS,
  STAGING_CANARY_MAX_FUTURE_DUE_MS,
  STAGING_CANARY_MAX_OBSERVATION_MS,
  STAGING_CANARY_WORKER_POLL_ALLOWANCE_MS,
} from '../src/modules/automation/automation.staging-canary.service.js';

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

const runId = '22222222-2222-4222-8222-222222222222';
const workId = '33333333-3333-4333-8333-333333333333';

function waitingHistory() {
  return { workItems: [{ id: workId, actionCode: 'ACT_INTERNAL_FAKE', state: 'WAITING', result_metadata: {} }], events: [] };
}

function completedHistory() {
  return {
    workItems: [{ id: workId, actionCode: 'ACT_INTERNAL_FAKE', state: 'COMPLETED', result_metadata: { mode: 'INTERNAL_FAKE_CANARY' } }],
    events: [{ code: 'RECIPE_ADMITTED' }, { code: 'FUTURE_TRIGGER_RESOLVED' }],
  };
}

test('staging canary accepts only deterministic identity fields and forwards no provider/action/input surface', async () => {
  const calls = [];
  const canary = createStagingCanary({ runtimeConfig, runCanary: async (value) => { calls.push(value); return { run_id: runId }; } });
  await canary.admit(request);
  await canary.admit(request);
  assert.deepEqual(calls, [request, request]);
  assert.deepEqual(buildStagingCanaryRequest(request), request);
  assert.throws(() => buildStagingCanaryRequest({ ...request, provider: 'APOLLO' }), /AUTOMATION_CANARY_INVALID/);
  assert.throws(() => buildStagingCanaryRequest({ ...request, actionCode: 'ACT_ASSIGN' }), /AUTOMATION_CANARY_INVALID/);
  assert.throws(() => buildStagingCanaryRequest({ ...request, input: { url: 'https://example.test' } }), /AUTOMATION_CANARY_INVALID/);
});

test('staging canary requires repository-shaped completed internal work and immutable admission lineage', async () => {
  const history = {
    run: { id: runId },
    workItems: [{ id: workId, actionCode: 'ACT_INTERNAL_FAKE', state: 'COMPLETED', result_metadata: { mode: 'INTERNAL_FAKE_CANARY' } }],
    events: [{ code: 'RECIPE_ADMITTED' }, { code: 'FUTURE_TRIGGER_RESOLVED' }, { code: 'WORK_CLAIMED' }],
  };
  assert.deepEqual(assertStagingCanaryLineage(history), { runId: history.run.id, workItemId: history.workItems[0].id, state: 'COMPLETED' });
  assert.throws(() => assertStagingCanaryLineage({ ...history, workItems: [{ ...history.workItems[0], actionCode: 'ACT_APOLLO_SEARCH' }] }), /AUTOMATION_CANARY_LINEAGE_INVALID/);
  assert.throws(() => assertStagingCanaryLineage({ ...history, workItems: [{ ...history.workItems[0], result_metadata: {} }] }), /AUTOMATION_CANARY_LINEAGE_INVALID/);
  assert.throws(() => assertStagingCanaryLineage({ ...history, workItems: [{ id: workId, actionCode: 'ACT_INTERNAL_FAKE', state: 'COMPLETED' }] }), /AUTOMATION_CANARY_LINEAGE_INVALID/);
});

test('staging canary poll returns only after durable fixed-action completion', async () => {
  let reads = 0;
  const canary = createStagingCanary({
    runtimeConfig,
    getRunHistory: async () => {
      reads += 1;
      return reads === 1 ? waitingHistory() : completedHistory();
    },
    sleep: async () => {},
  });
  const result = await canary.awaitCompletion({ ownerUserId: request.ownerUserId, runId, dueAt: request.dueAt, pollMs: 250 });
  assert.equal(reads, 2);
  assert.equal(result.state, 'COMPLETED');
});

test('staging canary observes future due work beyond the prior fixed 90-second deadline', async () => {
  const startedAt = Date.parse('2026-09-09T08:54:14.000Z');
  const dueAtMs = startedAt + 120_000;
  const dueAt = new Date(dueAtMs).toISOString();
  let nowMs = startedAt;
  let reads = 0;
  const canary = createStagingCanary({
    runtimeConfig,
    getRunHistory: async () => {
      reads += 1;
      return nowMs < dueAtMs + STAGING_CANARY_WORKER_POLL_ALLOWANCE_MS ? waitingHistory() : completedHistory();
    },
    now: () => nowMs,
    sleep: async (ms) => { nowMs += ms; },
  });

  const result = await canary.awaitCompletion({ ownerUserId: request.ownerUserId, runId, dueAt, pollMs: STAGING_CANARY_WORKER_POLL_ALLOWANCE_MS });

  assert.equal(result.state, 'COMPLETED');
  assert.equal(nowMs, dueAtMs + STAGING_CANARY_WORKER_POLL_ALLOWANCE_MS);
  assert.ok(nowMs - startedAt > STAGING_CANARY_COMPLETION_GRACE_MS);
  assert.ok(reads > 1);
});

test('staging canary caps future-due observation at the admission window plus worker and completion allowance', async () => {
  const startedAt = Date.parse('2026-09-09T08:54:14.000Z');
  const dueAt = new Date(startedAt + STAGING_CANARY_MAX_FUTURE_DUE_MS).toISOString();
  let nowMs = startedAt;
  const canary = createStagingCanary({
    runtimeConfig,
    getRunHistory: async () => waitingHistory(),
    now: () => nowMs,
    sleep: async (ms) => { nowMs += ms; },
  });

  await assert.rejects(
    canary.awaitCompletion({ ownerUserId: request.ownerUserId, runId, dueAt, pollMs: STAGING_CANARY_WORKER_POLL_ALLOWANCE_MS }),
    /AUTOMATION_CANARY_TIMEOUT/,
  );
  assert.equal(nowMs - startedAt, STAGING_CANARY_MAX_OBSERVATION_MS);
});
