import * as repository from './automation.execution.repository.js';
import { getAction } from './automation.execution.actions.js';
import { AUTOMATION_REGISTRY_VERSION, AUTOMATION_WORKER_VERSION, bounded, classifyError, MAX, redactedError, retryDelayMs, workerIdentity } from './automation.execution.validation.js';

export function createWorker({ workerId = workerIdentity(), claimBatch = 10, concurrency = 4, actionConcurrency = 2, leaseSeconds = 60, heartbeatMs = 15000, pollMs = 5000, registryVersion = AUTOMATION_REGISTRY_VERSION, workerVersion = AUTOMATION_WORKER_VERSION, repositoryApi = repository, actionResolver = getAction, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), logger = console } = {}) {
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
  function recordState(state) {
    if (state === 'COMPLETED') metrics.completed += 1;
    else if (state === 'RETRYABLE') metrics.retryable += 1;
    else if (state === 'FAILED') metrics.failed += 1;
    else if (state === 'BLOCKED') metrics.blocked += 1;
    else if (state === 'HUMAN_REVIEW') metrics.review += 1;
  }
  function startHeartbeat(work) {
    if (typeof repositoryApi.heartbeat !== 'function') return { stop: () => {}, lost: () => false };
    let lost = false;
    const timer = setInterval(() => {
      repositoryApi.heartbeat(work.id, workerId, work.lease_token, lease)
        .then(() => { metrics.heartbeats += 1; })
        .catch(() => { lost = true; metrics.heartbeatFailures += 1; });
    }, heartbeatInterval);
    timer.unref?.();
    return { stop: () => clearInterval(timer), lost: () => lost };
  }
  async function process(work) {
    active += 1;
    let dispatched = false; let actionAcquired = false; let heartbeat = null;
    try {
      await acquireAction(work.action_code); actionAcquired = true;
      const dispatchAdmission = await repositoryApi.markDispatching(work.id, workerId, work.lease_token);
      if (dispatchAdmission?.allowed === false) {
        recordState(dispatchAdmission.state || 'BLOCKED');
        return { id: work.id, state: dispatchAdmission.state || 'BLOCKED' };
      }
      dispatched = true;
      heartbeat = startHeartbeat(work);
      const action = actionResolver(work.action_code);
      const outcome = await action({ ownerUserId: work.owner_user_id, actorUserId: work.requested_by_user_id, actorKind: work.requested_by_kind, workItemId: work.id, correlationId: work.correlation_id, input: work.input });
      if (heartbeat.lost()) {
        const error = new Error('AUTOMATION_LEASE_LOST'); error.code = 'AUTOMATION_LEASE_LOST'; throw error;
      }
      await repositoryApi.transition(work.id, workerId, work.lease_token, 'COMPLETED', 'ACTION_COMPLETED', outcome.safeMetadata || {});
      recordState('COMPLETED');
      return { id: work.id, state: 'COMPLETED' };
    } catch (error) {
      const classified = classifyError(error, { afterDispatch: dispatched, knownOutcome: Boolean(error?.knownOutcome) });
      const dueAt = classified.state === 'RETRYABLE' ? new Date(Date.now() + retryDelayMs(work.attempt_count, work.id)).toISOString() : null;
      try { await repositoryApi.transition(work.id, workerId, work.lease_token, classified.state, classified.reason, redactedError(error), dueAt); } catch (transitionError) { logger.warn?.('Automation transition failed after worker error', redactedError(transitionError)); }
      recordState(classified.state);
      return { id: work.id, state: classified.state };
    } finally {
      heartbeat?.stop();
      if (actionAcquired) releaseAction(work.action_code);
      active -= 1;
    }
  }
  return {
    get workerId() { return workerId; }, get ready() { return ready && !draining; }, get draining() { return draining; }, get active() { return active; },
    get status() { return { ready: ready && !draining, draining, active, registryVersion, workerVersion, compatibility, metrics: { ...metrics } }; },
    async start() {
      compatibility = await repositoryApi.checkReady(registryVersion, workerVersion);
      const recovered = await repositoryApi.recoverStale(Math.min(batch, 50));
      metrics.staleRecovered += recovered.length;
      ready = true;
      logger.info?.('Automation worker ready', { registryVersion, workerVersion });
    },
    async runOnce() {
      if (draining || !ready) return [];
      const recovered = await repositoryApi.recoverStale(Math.min(batch, 50));
      metrics.staleRecovered += recovered.length;
      const claimed = await repositoryApi.claim(workerId, batch, lease);
      metrics.claims += claimed.length;
      const results = [];
      for (let index = 0; index < claimed.length; index += limit) results.push(...await Promise.all(claimed.slice(index, index + limit).map(process)));
      return results;
    },
    async run(signal) { await this.start(); while (!draining && !signal?.aborted) { await this.runOnce(); if (!draining && !signal?.aborted) await sleep(interval); } },
    async shutdown({ graceMs = 30000 } = {}) { draining = true; const deadline = Date.now() + graceMs; while (active && Date.now() < deadline) await sleep(25); ready = false; logger.info?.('Automation worker stopped', { active }); },
  };
}
