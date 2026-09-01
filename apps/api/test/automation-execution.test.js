import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActionRegistry } from '../src/modules/automation/automation.execution.actions.js';
import { ACTION_CODES, assertActionCode, assertTransition, classifyError, retryDelayMs } from '../src/modules/automation/automation.execution.validation.js';
import { createDurableScheduleMaterializer, createEligibilityScheduler } from '../src/modules/automation/automation.execution.scheduler.js';
import { createWorker } from '../src/modules/automation/automation.execution.worker.js';
import { getPermittedRunActions } from '../src/modules/automation/automation.execution.service.js';
import { getAutomationWorkerRuntimeConfig } from '../src/workers/automation-worker.runtime.js';
import { createAutomationWorkerHealthServer, workerReadinessView } from '../src/workers/automation-worker.health.js';

test('automation contracts allow only fixed actions, legal transitions, and deterministic safe retry classification', () => {
  assert.deepEqual(ACTION_CODES, ['ACT_ASSIGN', 'ACT_TASK', 'ACT_NOTIFY', 'ACT_APOLLO_SEARCH']);
  assert.equal(assertActionCode('ACT_ASSIGN'), 'ACT_ASSIGN');
  assert.throws(() => assertActionCode('ACT_EMAIL'), /AUTOMATION_ACTION_DISABLED/);
  assert.equal(assertTransition('RUNNING', 'COMPLETED'), 'COMPLETED');
  assert.throws(() => assertTransition('COMPLETED', 'RETRYABLE'), /AUTOMATION_TRANSITION_INVALID/);
  assert.deepEqual(classifyError({ code: 'SERVICE_UNAVAILABLE' }), { state: 'RETRYABLE', reason: 'TRANSIENT_DEPENDENCY_FAILURE' });
  assert.deepEqual(classifyError({ code: 'VALIDATION_ERROR' }), { state: 'FAILED', reason: 'TERMINAL_DOMAIN_FAILURE' });
  assert.deepEqual(classifyError(new Error('unknown'), { afterDispatch: true }), { state: 'HUMAN_REVIEW', reason: 'POST_DISPATCH_UNCERTAIN' });
  assert.equal(retryDelayMs(2, 'same'), retryDelayMs(2, 'same'));
});

test('eligibility scheduler only wakes durable worker logic and never executes actions', async () => {
  let wakes = 0; const scheduled = [];
  const scheduler = createEligibilityScheduler({ intervalMs: 1000, onWake: async () => { wakes += 1; }, sleep: (fn) => { scheduled.push(fn); return scheduled.length; } });
  scheduler.start(); await scheduled.shift()(); scheduler.stop();
  assert.equal(wakes, 1); assert.equal(scheduler.running, false);
});

test('worker marks dispatch before one fixed action, persists result, and drains safely', async () => {
  const calls = []; const repository = {
    checkReady: async () => true, recoverStale: async () => [], claim: async () => [{ id: 'work-1', owner_user_id: 'owner-1', requested_by_user_id: 'actor-1', requested_by_kind: 'owner', action_code: 'ACT_ASSIGN', lease_token: 'lease-1', attempt_count: 1, input: {} }],
    markDispatching: async (...args) => calls.push(['dispatching', ...args]), transition: async (...args) => calls.push(['transition', ...args]),
  };
  const worker = createWorker({ workerId: 'worker-1', repositoryApi: repository, actionResolver: () => async () => ({ safeMetadata: { ok: true } }) });
  await worker.start(); const results = await worker.runOnce(); await worker.shutdown({ graceMs: 1 });
  assert.deepEqual(results, [{ id: 'work-1', state: 'COMPLETED' }]); assert.equal(calls[0][0], 'dispatching'); assert.deepEqual(calls[1].slice(0, 6), ['transition', 'work-1', 'worker-1', 'lease-1', 'COMPLETED', 'ACTION_COMPLETED']); assert.equal(worker.ready, false);
});

test('worker never blindly retries an action after durable dispatch uncertainty', async () => {
  const transitions = []; const repository = { checkReady: async () => true, recoverStale: async () => [], claim: async () => [{ id: 'work-2', owner_user_id: 'owner-1', requested_by_user_id: 'actor-1', requested_by_kind: 'owner', action_code: 'ACT_TASK', lease_token: 'lease-2', attempt_count: 1, input: {} }], markDispatching: async () => {}, transition: async (...args) => transitions.push(args) };
  const worker = createWorker({ workerId: 'worker-2', repositoryApi: repository, actionResolver: () => async () => { throw new Error('response lost'); } }); await worker.start(); await worker.runOnce();
  assert.equal(transitions[0][3], 'HUMAN_REVIEW'); assert.equal(transitions[0][4], 'POST_DISPATCH_UNCERTAIN');
});

test('worker exits before resolving an adapter when the durable dispatch fence denies work', async () => {
  let resolved = false;
  const repository = {
    checkReady: async () => true,
    recoverStale: async () => [],
    claim: async () => [{ id: 'work-denied', owner_user_id: 'owner-1', requested_by_user_id: 'actor-1', requested_by_kind: 'employee', action_code: 'ACT_TASK', lease_token: 'lease-denied', attempt_count: 1, input: {} }],
    markDispatching: async () => ({ allowed: false, state: 'BLOCKED' }),
    transition: async () => { throw new Error('transition must not be called'); },
  };
  const worker = createWorker({ workerId: 'worker-denied', repositoryApi: repository, actionResolver: () => { resolved = true; throw new Error('adapter must not resolve'); } });
  await worker.start();
  assert.deepEqual(await worker.runOnce(), [{ id: 'work-denied', state: 'BLOCKED' }]);
  assert.equal(resolved, false);
});

test('fixed action registry delegates only to the existing CRM and Communication contracts', async () => {
  const calls = [];
  const actions = createActionRegistry({
    crmApi: {
      updateTask: async (...args) => calls.push(['updateTask', ...args]),
      createTask: async (...args) => calls.push(['createTask', ...args]),
    },
    communicationsApi: {
      createThread: async (...args) => calls.push(['createThread', ...args]),
      sendMessage: async (...args) => calls.push(['sendMessage', ...args]),
    },
    emailDeliveryEnabled: false,
  });
  const base = { ownerUserId: 'owner-1', actorUserId: 'owner-1', actorKind: 'owner', workItemId: 'work-1' };
  await actions.ACT_ASSIGN({ ...base, input: { projectId: 'project-1', taskId: 'task-1', employeeUserId: 'employee-1' } });
  await actions.ACT_TASK({ ...base, input: { mode: 'UPDATE', projectId: 'project-1', taskId: 'task-1', patch: { completed: true } } });
  await actions.ACT_TASK({ ...base, input: { mode: 'CREATE', projectId: 'project-1', name: 'Follow up' } });
  await actions.ACT_NOTIFY({ ...base, input: { mode: 'CREATE_THREAD', subject: 'Status', body: 'Update', participants: [{ kind: 'employee', employeeCode: 'JP-EMP-000001' }] } });
  await actions.ACT_NOTIFY({ ...base, actorUserId: 'employee-1', actorKind: 'employee', input: { mode: 'SEND_MESSAGE', threadId: 'thread-1', body: 'Update' } });
  assert.deepEqual(calls, [
    ['updateTask', 'owner-1', 'project-1', 'task-1', { assigned_user_id: 'employee-1' }],
    ['updateTask', 'owner-1', 'project-1', 'task-1', { completed: true }],
    ['createTask', 'owner-1', 'project-1', { name: 'Follow up' }],
    ['createThread', 'owner-1', { subject: 'Status', body: 'Update', participants: [{ kind: 'employee', employeeCode: 'JP-EMP-000001' }] }, 'automation:work-1'],
    ['sendMessage', 'employee-1', 'thread-1', { body: 'Update' }, [], 'automation:work-1'],
  ]);
});

test('ACT_ASSIGN recognizes a confirmed CRM desired state after an uncertain update error', async () => {
  const reads = [];
  const actions = createActionRegistry({
    crmApi: {
      updateTask: async () => { throw new Error('response lost'); },
      listTasks: async (...args) => { reads.push(args); return [{ id: 'task-1', assigned_user_id: 'employee-1' }]; },
    },
  });
  const outcome = await actions.ACT_ASSIGN({ ownerUserId: 'owner-1', actorUserId: 'owner-1', actorKind: 'owner', workItemId: 'work-1', input: { projectId: 'project-1', taskId: 'task-1', employeeUserId: 'employee-1' } });
  assert.deepEqual(outcome, { safeMetadata: { mode: 'ASSIGN', reconciled: true } });
  assert.deepEqual(reads, [['owner-1', 'project-1']]);
});

test('ACT_TASK surfaces a known reconciliation conflict for a differing desired state', async () => {
  const actions = createActionRegistry({
    crmApi: {
      updateTask: async () => { throw new Error('response lost'); },
      listTasks: async () => [{ id: 'task-1', completed: false }],
    },
  });
  await assert.rejects(
    actions.ACT_TASK({ ownerUserId: 'owner-1', actorUserId: 'owner-1', actorKind: 'owner', workItemId: 'work-1', input: { mode: 'UPDATE', projectId: 'project-1', taskId: 'task-1', patch: { completed: true } } }),
    (error) => error.message === 'AUTOMATION_RECONCILIATION_CONFLICT' && error.code === 'CONFLICT' && error.knownOutcome === true,
  );
});

test('worker enforces default action-class concurrency before durable dispatch', async () => {
  let running = 0; let peak = 0;
  const work = Array.from({ length: 4 }, (_, index) => ({ id: `action-${index}`, owner_user_id: 'owner-1', requested_by_user_id: 'owner-1', requested_by_kind: 'owner', action_code: 'ACT_TASK', lease_token: `lease-${index}`, attempt_count: 1, input: {} }));
  const repository = { checkReady: async () => true, recoverStale: async () => [], claim: async () => work, markDispatching: async () => ({ allowed: true }), transition: async () => {} };
  const worker = createWorker({ workerId: 'worker-class-limit', concurrency: 4, repositoryApi: repository, actionResolver: () => async () => {
    running += 1; peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    return { safeMetadata: {} };
  } });
  await worker.start();
  await worker.runOnce();
  assert.equal(peak, 2);
  assert.throws(() => createWorker({ actionConcurrency: 11 }), /AUTOMATION_INVALID_ACTION_CONCURRENCY/);
});


test('durable schedule materializer serializes database scheduling and stops safely', async () => {
  const scheduled = []; const calls = [];
  const scheduler = createDurableScheduleMaterializer({
    repositoryApi: { materializeSchedules: async (limit) => calls.push(limit) },
    intervalMs: 1000,
    sleep: (callback) => { scheduled.push(callback); return scheduled.length; },
  });
  scheduler.start(); scheduler.start();
  assert.equal(scheduled.length, 1);
  await scheduled.shift()();
  assert.deepEqual(calls, [25]);
  assert.equal(scheduled.length, 1);
  scheduler.stop();
  await scheduled.shift()();
  assert.deepEqual(calls, [25]);
  assert.equal(scheduler.running, false);
  assert.throws(() => createDurableScheduleMaterializer(), /AUTOMATION_INVALID_SCHEDULE_REPOSITORY/);
  assert.throws(() => createDurableScheduleMaterializer({ repositoryApi: { materializeSchedules: async () => {} }, batch: 26 }), /AUTOMATION_INVALID_SCHEDULE_BATCH/);
});

test('worker blocks startup on an incompatible durable execution contract', async () => {
  const calls = [];
  const compatible = {
    checkReady: async (...args) => { calls.push(['ready', ...args]); return { ready: true, schema_version: 2 }; },
    recoverStale: async () => { calls.push(['recover']); return []; }, claim: async () => [],
  };
  const worker = createWorker({ workerId: 'worker-compatible', repositoryApi: compatible });
  await worker.start();
  assert.deepEqual(calls[0], ['ready', 'AUTOMATION_REGISTRY_V1', 'AUTOMATION_WORKER_V1']);
  assert.deepEqual(worker.status.compatibility, { ready: true, schema_version: 2 });
  await worker.shutdown({ graceMs: 1 });

  const blockedCalls = [];
  const blocked = createWorker({
    repositoryApi: { checkReady: async () => { throw new Error('AUTOMATION_COMPATIBILITY_MISMATCH'); }, recoverStale: async () => { blockedCalls.push('recover'); return []; }, claim: async () => { blockedCalls.push('claim'); return []; } },
  });
  await assert.rejects(blocked.start(), /AUTOMATION_COMPATIBILITY_MISMATCH/);
  assert.equal(blocked.ready, false);
  assert.deepEqual(blockedCalls, []);
});

test('worker heartbeats only dispatched work and records lease loss as human review', async () => {
  const makeWork = (id) => ({ id, owner_user_id: 'owner-1', requested_by_user_id: 'owner-1', requested_by_kind: 'owner', action_code: 'ACT_TASK', lease_token: `lease-${id}`, attempt_count: 1, input: {} });
  const waitForHeartbeat = () => new Promise((resolve) => setTimeout(resolve, 1050));

  const calls = [];
  const successRepository = {
    checkReady: async () => true, recoverStale: async () => [], claim: async () => [makeWork('heartbeat-ok')],
    markDispatching: async (...args) => { calls.push(['dispatch', ...args]); return { allowed: true }; },
    heartbeat: async (...args) => calls.push(['heartbeat', ...args]), transition: async (...args) => calls.push(['transition', ...args]),
  };
  const successWorker = createWorker({ workerId: 'heartbeat-worker', heartbeatMs: 1000, leaseSeconds: 10, repositoryApi: successRepository, actionResolver: () => async () => { await waitForHeartbeat(); return { safeMetadata: {} }; } });
  await successWorker.start();
  assert.deepEqual(await successWorker.runOnce(), [{ id: 'heartbeat-ok', state: 'COMPLETED' }]);
  assert.deepEqual(calls[1], ['heartbeat', 'heartbeat-ok', 'heartbeat-worker', 'lease-heartbeat-ok', 10]);
  assert.equal(calls.at(-1)[0], 'transition');
  assert.equal(successWorker.status.metrics.heartbeats >= 1, true);

  const transitions = [];
  const lostRepository = {
    checkReady: async () => true, recoverStale: async () => [], claim: async () => [makeWork('heartbeat-lost')], markDispatching: async () => ({ allowed: true }),
    heartbeat: async () => { throw new Error('AUTOMATION_LEASE_LOST'); }, transition: async (...args) => transitions.push(args),
  };
  const lostWorker = createWorker({ workerId: 'lease-loss-worker', heartbeatMs: 1000, leaseSeconds: 10, repositoryApi: lostRepository, actionResolver: () => async () => { await waitForHeartbeat(); return { safeMetadata: {} }; } });
  await lostWorker.start();
  assert.deepEqual(await lostWorker.runOnce(), [{ id: 'heartbeat-lost', state: 'HUMAN_REVIEW' }]);
  assert.deepEqual(transitions[0].slice(3, 5), ['HUMAN_REVIEW', 'POST_DISPATCH_UNCERTAIN']);
  assert.equal(lostWorker.status.metrics.heartbeatFailures >= 1, true);
});


test('server-derived run actions remain scoped to the authenticated actor and terminal state', () => {
  const employee = { isOwner: false, actorUserId: 'employee-1' };
  const owner = { isOwner: true, actorUserId: 'owner-1' };
  const ownRun = { state: 'WAITING', requested_by_kind: 'employee', requested_by_user_id: 'employee-1', cancelled_at: null };
  assert.deepEqual(getPermittedRunActions(employee, ownRun), { pause: true, resume: true, cancel: false, retry: true });
  assert.deepEqual(getPermittedRunActions(employee, { ...ownRun, requested_by_user_id: 'employee-2' }), { pause: false, resume: false, cancel: false, retry: false });
  assert.deepEqual(getPermittedRunActions(owner, { ...ownRun, state: 'COMPLETED' }), { pause: false, resume: false, cancel: false, retry: false });
  assert.deepEqual(getPermittedRunActions(owner, ownRun), { pause: true, resume: true, cancel: true, retry: true });
});

test('worker runtime configuration validates only durable-worker requirements and never treats a probe as execution authority', () => {
  const runtime = getAutomationWorkerRuntimeConfig({
    SUPABASE_URL: 'https://automation.test', SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
    AUTOMATION_WORKER_ID: 'worker-test', AUTOMATION_WORKER_CLAIM_BATCH: '3', AUTOMATION_WORKER_HEALTH_PORT: '3101',
  });
  assert.deepEqual(runtime.workerOptions.claimBatch, 3);
  assert.equal(runtime.healthPort, 3101);
  assert.throws(() => getAutomationWorkerRuntimeConfig({ SUPABASE_URL: 'https://automation.test', SUPABASE_SERVICE_ROLE_KEY: '' }), /AUTOMATION_WORKER_DATABASE_CONFIG_REQUIRED/);
  assert.throws(() => getAutomationWorkerRuntimeConfig({ SUPABASE_URL: 'https://automation.test', SUPABASE_SERVICE_ROLE_KEY: 'service-role-test', AUTOMATION_WORKER_POLL_MS: '10' }), /AUTOMATION_WORKER_CONFIG_INVALID_POLL_MS/);
  assert.throws(() => getAutomationWorkerRuntimeConfig({ SUPABASE_URL: 'https://automation.test', SUPABASE_SERVICE_ROLE_KEY: 'service-role-test', AUTOMATION_WORKER_LEASE_SECONDS: '10', AUTOMATION_WORKER_HEARTBEAT_MS: '6000' }), /AUTOMATION_WORKER_CONFIG_INVALID_HEARTBEAT_MS/);
});

test('worker health probe reports local liveness and existing-worker readiness without work or secret data', async () => {
  let status = { ready: false, draining: false, active: 0, compatibility: null };
  const server = createAutomationWorkerHealthServer({ statusProvider: () => status, now: () => '2026-08-30T00:00:00.000Z' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const live = await fetch(`http://127.0.0.1:${port}/live`);
    assert.equal(live.status, 200); assert.deepEqual(await live.json(), { alive: true });
    let ready = await fetch(`http://127.0.0.1:${port}/ready`);
    assert.equal(ready.status, 503); assert.equal((await ready.json()).ready, false);
    status = { ready: true, draining: false, active: 2, compatibility: { ready: true, schema_version: 2, registry_version: 'AUTOMATION_REGISTRY_V1', worker_version: 'AUTOMATION_WORKER_V1', secret: 'must-not-appear' } };
    ready = await fetch(`http://127.0.0.1:${port}/ready`);
    const body = await ready.json();
    assert.equal(ready.status, 200); assert.deepEqual(body, { ready: true, draining: false, active: 2, compatibility: { ready: true, schemaVersion: 2, registryVersion: 'AUTOMATION_REGISTRY_V1', workerVersion: 'AUTOMATION_WORKER_V1' }, observedAt: '2026-08-30T00:00:00.000Z' });
    assert.doesNotMatch(JSON.stringify(body), /secret|workerId|lease|input/i);
    const draining = workerReadinessView({ ready: true, draining: true, active: 0 });
    assert.equal(draining.ready, false); assert.equal(draining.draining, true); assert.equal(draining.active, 0); assert.equal(draining.compatibility, null);
    assert.match(draining.observedAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
