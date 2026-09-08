import * as repository from './automation.execution.repository.js';
import { getAction } from './automation.execution.actions.js';
import { AUTOMATION_REGISTRY_VERSION, AUTOMATION_WORKER_VERSION, bounded, classifyError, MAX, redactedError, retryDelayMs, workerIdentity } from './automation.execution.validation.js';
import { createAutomationObservability } from './automation.execution.observability.js';

function noThrowObservability(observability) {
  const invoke = (method, ...args) => { try { observability?.[method]?.(...args); } catch {} };
  return Object.freeze({
    log: (...args) => invoke('log', ...args), warn: (...args) => invoke('warn', ...args), claim: (...args) => invoke('claim', ...args),
    transition: (...args) => invoke('transition', ...args), recovered: (...args) => invoke('recovered', ...args),
    get metrics() { try { const metrics = observability?.metrics; return metrics && typeof metrics === 'object' ? metrics : {}; } catch { return {}; } },
  });
}

export function createWorker({ workerId = workerIdentity(), claimBatch = 10, concurrency = 4, actionConcurrency = 2, leaseSeconds = 60, heartbeatMs = 15000, pollMs = 5000, registryVersion = AUTOMATION_REGISTRY_VERSION, workerVersion = AUTOMATION_WORKER_VERSION, repositoryApi = repository, actionResolver = getAction, concurrencyKeyResolver = (work) => work.provider_code === 'APOLLO' ? 'APOLLO_READ' : work.action_code, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), logger = console, observability = createAutomationObservability({ logger }) } = {}) {
  const telemetry = noThrowObservability(observability);
  const batch = bounded(claimBatch, 10, 1, MAX.claimBatch, 'CLAIM_BATCH');
  const limit = bounded(concurrency, 4, 1, MAX.workerConcurrency, 'WORKER_CONCURRENCY');
  const actionLimit = bounded(actionConcurrency, 2, 1, MAX.actionConcurrency, 'ACTION_CONCURRENCY');
  const lease = bounded(leaseSeconds, 60, 10, 3600, 'LEASE_SECONDS');
  const heartbeatInterval = bounded(heartbeatMs, 15000, 1000, Math.max(1000, lease * 500), 'HEARTBEAT_INTERVAL');
  const interval = bounded(pollMs, 5000, MAX.pollMinMs, MAX.pollMaxMs, 'POLL_INTERVAL');
  const actionActive = new Map(); const actionWaiters = new Map();
  const metrics = { claims: 0, completed: 0, retryable: 0, failed: 0, blocked: 0, review: 0, heartbeats: 0, heartbeatFailures: 0, staleRecovered: 0 };
  let draining = false; let ready = false; let active = 0; let compatibility = null;
  async function acquireAction(actionCode) {
    while ((actionActive.get(actionCode) || 0) >= actionLimit) {
      await new Promise((resolve) => {
        const waiters = actionWaiters.get(actionCode) || [];
        waiters.push(resolve); actionWaiters.set(actionCode, waiters);
      });
    }
    actionActive.set(actionCode, (actionActive.get(actionCode) || 0) + 1);
  }
  function releaseAction(actionCode) {
    actionActive.set(actionCode, Math.max(0, (actionActive.get(actionCode) || 1) - 1));
    actionWaiters.get(actionCode)?.shift()?.();
  }
  function recordState(state, reasonCode = null) {
    if (state === 'COMPLETED') metrics.completed += 1;
    else if (state === 'RETRYABLE') metrics.retryable += 1;
    else if (state === 'FAILED') metrics.failed += 1;
    else if (state === 'BLOCKED') metrics.blocked += 1;
    else if (state === 'HUMAN_REVIEW') metrics.review += 1;
    telemetry.transition(state, reasonCode);
  }
  function startHeartbeat(work) {
    if (typeof repositoryApi.heartbeat !== 'function') return { stop: () => {}, lost: () => false };
    let lost = false;
    const timer = setInterval(() => {
      repositoryApi.heartbeat(work.id, workerId, work.lease_token, lease)
        .then(() => { metrics.heartbeats += 1; })
        .catch(() => { lost = true; metrics.heartbeatFailures += 1; telemetry.warn('heartbeat_failed', { workId: work.id, runId: work.run_id, correlationId: work.correlation_id, actorCategory: 'worker', sourceCategory: 'worker', transition: 'HEARTBEAT', actionCode: work.action_code, attempt: work.attempt_count, reasonCode: 'AUTOMATION_LEASE_LOST' }); });
    }, heartbeatInterval);
    timer.unref?.();
    return { stop: () => clearInterval(timer), lost: () => lost };
  }
  async function process(work) {
    active += 1;
    let dispatched = false; let actionAcquired = false; let heartbeat = null;
    try {
      const concurrencyKey = concurrencyKeyResolver(work);
      await acquireAction(concurrencyKey); actionAcquired = concurrencyKey;
      const dispatchAdmission = await repositoryApi.markDispatching(work.id, workerId, work.lease_token);
      if (dispatchAdmission?.allowed === false) {
        recordState(dispatchAdmission.state || 'BLOCKED', dispatchAdmission.reason);
        telemetry.log('dispatch_denied', { workId: work.id, runId: work.run_id, correlationId: work.correlation_id, actorCategory: 'worker', sourceCategory: 'dispatch', transition: `RUNNING_TO_${dispatchAdmission.state || 'BLOCKED'}`, actionCode: work.action_code, attempt: work.attempt_count, reasonCode: dispatchAdmission.reason || 'DISPATCH_DENIED' });
        return { id: work.id, state: dispatchAdmission.state || 'BLOCKED' };
      }
      telemetry.log('dispatching', { workId: work.id, runId: work.run_id, correlationId: work.correlation_id, actorCategory: 'worker', sourceCategory: 'dispatch', transition: 'CLAIMED_TO_DISPATCHING', actionCode: work.action_code, attempt: work.attempt_count });
      dispatched = true;
      heartbeat = startHeartbeat(work);
      const action = actionResolver(work.action_code, work.provider_code || 'INTERNAL');
      const outcome = await action({ ownerUserId: work.owner_user_id, actorUserId: work.requested_by_user_id, actorKind: work.requested_by_kind, runId: work.run_id, workItemId: work.id, correlationId: work.correlation_id, input: work.input });
      if (heartbeat.lost()) {
        const error = new Error('AUTOMATION_LEASE_LOST'); error.code = 'AUTOMATION_LEASE_LOST'; throw error;
      }
      await repositoryApi.transition(work.id, workerId, work.lease_token, 'COMPLETED', 'ACTION_COMPLETED', outcome.safeMetadata || {});
      recordState('COMPLETED');
      telemetry.log('transition', { workId: work.id, runId: work.run_id, correlationId: work.correlation_id, actorCategory: 'worker', sourceCategory: 'worker', transition: 'RUNNING_TO_COMPLETED', actionCode: work.action_code, attempt: work.attempt_count, result: outcome.safeMetadata || {} });
      return { id: work.id, state: 'COMPLETED' };
    } catch (error) {
      const classified = classifyError(error, { afterDispatch: dispatched, knownOutcome: Boolean(error?.knownOutcome) });
      const safeProviderResult = error?.safeMetadata && typeof error.safeMetadata === 'object' && !Array.isArray(error.safeMetadata)
        ? error.safeMetadata : {};
      const dueAt = classified.state === 'RETRYABLE' ? new Date(Date.now() + retryDelayMs(work.attempt_count, work.id)).toISOString() : null;
      try { await repositoryApi.transition(work.id, workerId, work.lease_token, classified.state, classified.reason, { ...redactedError(error), ...safeProviderResult }, dueAt); } catch (transitionError) { telemetry.warn('transition_failed', { workId: work.id, runId: work.run_id, correlationId: work.correlation_id, actorCategory: 'worker', sourceCategory: 'worker', transition: 'RUNNING_TO_ERROR', actionCode: work.action_code, attempt: work.attempt_count, reasonCode: redactedError(transitionError).code }); }
      recordState(classified.state, classified.reason);
      telemetry.log('transition', { workId: work.id, runId: work.run_id, correlationId: work.correlation_id, actorCategory: 'worker', sourceCategory: 'worker', transition: `RUNNING_TO_${classified.state}`, actionCode: work.action_code, attempt: work.attempt_count, reasonCode: classified.reason, result: safeProviderResult });
      return { id: work.id, state: classified.state };
    } finally {
      heartbeat?.stop();
      if (actionAcquired) releaseAction(actionAcquired);
      active -= 1;
    }
  }
  return {
    get workerId() { return workerId; }, get ready() { return ready && !draining; }, get draining() { return draining; }, get active() { return active; },
    get status() { return { ready: ready && !draining, draining, active, registryVersion, workerVersion, compatibility, metrics: { ...metrics, observability: telemetry.metrics } }; },
    async start() {
      compatibility = await repositoryApi.checkReady(registryVersion, workerVersion);
      const recovered = await repositoryApi.recoverStale(Math.min(batch, 50));
      metrics.staleRecovered += recovered.length;
      telemetry.recovered(recovered.length);
      ready = true;
      telemetry.log('worker_ready', { actorCategory: 'worker', sourceCategory: 'worker', transition: 'READY', recipeVersion: registryVersion });
    },
    async runOnce() {
      if (draining || !ready) return [];
      const recovered = await repositoryApi.recoverStale(Math.min(batch, 50));
      metrics.staleRecovered += recovered.length;
      telemetry.recovered(recovered.length);
      const claimStartedAt = Date.now();
      const claimed = await repositoryApi.claim(workerId, batch, lease);
      metrics.claims += claimed.length;
      telemetry.claim(Date.now() - claimStartedAt, claimed);
      for (const work of claimed) telemetry.log('claim', { workId: work.id, runId: work.run_id, correlationId: work.correlation_id, actorCategory: 'worker', sourceCategory: 'claim', transition: 'WAITING_TO_RUNNING', actionCode: work.action_code, attempt: work.attempt_count });
      const results = [];
      for (let index = 0; index < claimed.length; index += limit) results.push(...await Promise.all(claimed.slice(index, index + limit).map(process)));
      return results;
    },
    async run(signal) { await this.start(); while (!draining && !signal?.aborted) { await this.runOnce(); if (!draining && !signal?.aborted) await sleep(interval); } },
    async shutdown({ graceMs = 30000 } = {}) { draining = true; const deadline = Date.now() + graceMs; while (active && Date.now() < deadline) await sleep(25); ready = false; telemetry.log('worker_stopped', { actorCategory: 'worker', sourceCategory: 'worker', transition: 'STOPPED' }); },
  };
}
