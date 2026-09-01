import { bounded, MAX } from './automation.execution.validation.js';

export function createDurableScheduleMaterializer({ repositoryApi, intervalMs = 5000, batch = 25, sleep = (fn) => setTimeout(fn, 0) } = {}) {
  const interval = bounded(intervalMs, 5000, MAX.pollMinMs, MAX.pollMaxMs, 'SCHEDULER_INTERVAL');
  const limit = bounded(batch, 25, 1, 25, 'SCHEDULE_BATCH');
  if (!repositoryApi?.materializeSchedules) throw new Error('AUTOMATION_INVALID_SCHEDULE_REPOSITORY');
  let running = false; let timer = null;
  const tick = async () => { if (!running) return; await repositoryApi.materializeSchedules(limit); if (running) timer = sleep(tick, interval); };
  return { get running() { return running; }, start() { if (running) return; running = true; timer = sleep(tick, interval); }, stop() { running = false; if (typeof clearTimeout === 'function') clearTimeout(timer); } };
}

export function createEligibilityScheduler({ intervalMs = 5000, onWake, sleep = (ms) => setTimeout(ms, 0) } = {}) {
  const interval = bounded(intervalMs, 5000, MAX.pollMinMs, MAX.pollMaxMs, 'SCHEDULER_INTERVAL');
  if (typeof onWake !== 'function') throw new Error('AUTOMATION_INVALID_SCHEDULER_WAKE');
  let running = false; let timer = null;
  const tick = async () => { if (!running) return; await onWake(); if (running) timer = sleep(tick, interval); };
  return { get running() { return running; }, start() { if (running) return; running = true; timer = sleep(tick, interval); }, stop() { running = false; if (typeof clearTimeout === 'function') clearTimeout(timer); } };
}
