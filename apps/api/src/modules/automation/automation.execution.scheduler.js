import { bounded, MAX } from './automation.execution.validation.js';

export function createDurableScheduleMaterializer({ repositoryApi, intervalMs = 5000, batch = 25, sleep = (fn) => setTimeout(fn, 0), onError = () => {} } = {}) {
  const interval = bounded(intervalMs, 5000, MAX.pollMinMs, MAX.pollMaxMs, 'SCHEDULER_INTERVAL');
  const limit = bounded(batch, 25, 1, 25, 'SCHEDULE_BATCH');
  if (!repositoryApi?.materializeSchedules) throw new Error('AUTOMATION_INVALID_SCHEDULE_REPOSITORY');
  if (typeof onError !== 'function') throw new Error('AUTOMATION_INVALID_SCHEDULE_ERROR_HANDLER');
  let running = false; let timer = null;
  const reportFailure = (error) => { try { onError(error); } catch { /* Reporting must never stop materialization. */ } };
  const tick = async () => {
    if (!running) return;
    try { await repositoryApi.materializeSchedules(limit); }
    catch (error) { reportFailure(error); }
    finally { if (running) timer = sleep(tick, interval); }
  };
  return { get running() { return running; }, start() { if (running) return; running = true; timer = sleep(tick, interval); }, stop() { running = false; if (typeof clearTimeout === 'function') clearTimeout(timer); } };
}

export function createEligibilityScheduler({ intervalMs = 5000, onWake, sleep = (ms) => setTimeout(ms, 0) } = {}) {
  const interval = bounded(intervalMs, 5000, MAX.pollMinMs, MAX.pollMaxMs, 'SCHEDULER_INTERVAL');
  if (typeof onWake !== 'function') throw new Error('AUTOMATION_INVALID_SCHEDULER_WAKE');
  let running = false; let timer = null;
  const tick = async () => { if (!running) return; await onWake(); if (running) timer = sleep(tick, interval); };
  return { get running() { return running; }, start() { if (running) return; running = true; timer = sleep(tick, interval); }, stop() { running = false; if (typeof clearTimeout === 'function') clearTimeout(timer); } };
}
