// Lightweight built-in scheduler.
// Runs configurable cron-like jobs so the engine operates autonomously
// without requiring external tools like n8n for basic scheduling.

import { config } from '../config.js';
import { log } from './logger.js';

const jobs = new Map();
const timers = new Map();

// ---- Cron parser (minimal, handles standard 5-field cron) ----

function parseCron(expr) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = expr.split(/\s+/);
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

function matchField(field, value, max) {
  if (field === '*') return true;
  // Handle */N (every N)
  if (field.startsWith('*/')) {
    const interval = parseInt(field.slice(2), 10);
    return value % interval === 0;
  }
  // Handle comma-separated values
  if (field.includes(',')) {
    return field.split(',').map(Number).includes(value);
  }
  // Handle ranges (e.g. 1-5)
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(Number);
    return value >= start && value <= end;
  }
  // Exact match
  return parseInt(field, 10) === value;
}

function shouldRunNow(cronExpr) {
  const now = new Date();
  const cron = parseCron(cronExpr);
  return (
    matchField(cron.minute, now.getMinutes()) &&
    matchField(cron.hour, now.getHours()) &&
    matchField(cron.dayOfMonth, now.getDate()) &&
    matchField(cron.month, now.getMonth() + 1) &&
    matchField(cron.dayOfWeek, now.getDay())
  );
}

// ---- Job management ----

/**
 * Register a scheduled job.
 * @param {object} jobDef
 * @param {string} jobDef.id     Unique job ID (e.g. 'daily-source')
 * @param {string} jobDef.name   Human-readable name
 * @param {string} jobDef.cron   Cron expression (e.g. '0 9 * * *' for 9 AM daily)
 * @param {Function} jobDef.handler  Async function to run
 * @param {boolean} [jobDef.enabled=true]
 */
export function registerJob(jobDef) {
  const job = {
    id: jobDef.id,
    name: jobDef.name,
    cron: jobDef.cron,
    handler: jobDef.handler,
    enabled: jobDef.enabled !== false,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    runCount: 0,
    config: jobDef.config || {},
  };
  jobs.set(job.id, job);
  log.info(`📅 Registered job: "${job.name}" (${job.cron}) [${job.enabled ? 'enabled' : 'disabled'}]`);
  return job;
}

/**
 * Start the scheduler tick loop (checks every 60 seconds).
 */
export function startScheduler() {
  if (!config.schedulerEnabled) {
    log.info('Scheduler is disabled via config.');
    return;
  }

  log.info('⏰ Scheduler started. Checking jobs every 60 seconds.');

  // Check immediately on start, then every 60 seconds
  const intervalId = setInterval(tick, 60_000);
  timers.set('__main__', intervalId);

  // Don't block startup — tick in the background
  setTimeout(tick, 5_000);
}

/**
 * Stop the scheduler.
 */
export function stopScheduler() {
  for (const [id, timer] of timers) {
    clearInterval(timer);
  }
  timers.clear();
  log.info('Scheduler stopped.');
}

async function tick() {
  for (const [id, job] of jobs) {
    if (!job.enabled) continue;
    if (!shouldRunNow(job.cron)) continue;

    // Prevent double-runs within the same minute
    const now = new Date();
    if (job.lastRunAt) {
      const lastRun = new Date(job.lastRunAt);
      if (
        lastRun.getFullYear() === now.getFullYear() &&
        lastRun.getMonth() === now.getMonth() &&
        lastRun.getDate() === now.getDate() &&
        lastRun.getHours() === now.getHours() &&
        lastRun.getMinutes() === now.getMinutes()
      ) {
        continue; // Already ran this minute
      }
    }

    // Run the job
    log.step(`⏰ Running scheduled job: "${job.name}"`);
    job.lastRunAt = now.toISOString();
    job.runCount++;

    try {
      await job.handler(job.config);
      job.lastStatus = 'success';
      job.lastError = null;
      log.ok(`✅ Job "${job.name}" completed successfully.`);
    } catch (err) {
      job.lastStatus = 'failed';
      job.lastError = err.message;
      log.error(`❌ Job "${job.name}" failed: ${err.message}`);
    }
  }
}

/**
 * Manually trigger a job by ID.
 */
export async function runJobNow(jobId) {
  const job = jobs.get(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  log.step(`▶️ Manually running job: "${job.name}"`);
  job.lastRunAt = new Date().toISOString();
  job.runCount++;

  try {
    await job.handler(job.config);
    job.lastStatus = 'success';
    job.lastError = null;
    return { status: 'success', job: getJobStatus(jobId) };
  } catch (err) {
    job.lastStatus = 'failed';
    job.lastError = err.message;
    return { status: 'failed', error: err.message, job: getJobStatus(jobId) };
  }
}

/**
 * Enable or disable a job.
 */
export function toggleJob(jobId, enabled) {
  const job = jobs.get(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  job.enabled = enabled !== undefined ? enabled : !job.enabled;
  log.info(`Job "${job.name}" is now ${job.enabled ? 'enabled' : 'disabled'}.`);
  return getJobStatus(jobId);
}

/**
 * Get status of a specific job.
 */
export function getJobStatus(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  return {
    id: job.id,
    name: job.name,
    cron: job.cron,
    enabled: job.enabled,
    lastRunAt: job.lastRunAt,
    lastStatus: job.lastStatus,
    lastError: job.lastError,
    runCount: job.runCount,
  };
}

/**
 * List all registered jobs.
 */
export function listJobs() {
  return Array.from(jobs.values()).map((job) => ({
    id: job.id,
    name: job.name,
    cron: job.cron,
    enabled: job.enabled,
    lastRunAt: job.lastRunAt,
    lastStatus: job.lastStatus,
    lastError: job.lastError,
    runCount: job.runCount,
  }));
}

/**
 * Register the default JARVIS PRIME automation jobs.
 * Call this at server startup.
 */
export function registerDefaultJobs({ sourceAndScoreAll, runOutreachAll, processReplies, generateDailyReport, generateWeeklyReport }) {
  registerJob({
    id: 'daily-source',
    name: 'Daily Prospect Sourcing',
    cron: '0 9 * * *', // 9 AM daily
    handler: sourceAndScoreAll || (async () => log.info('Source & score: no handler registered')),
  });

  registerJob({
    id: 'daily-outreach',
    name: 'Daily Outreach Send',
    cron: '0 10 * * *', // 10 AM daily
    handler: runOutreachAll || (async () => log.info('Outreach: no handler registered')),
  });

  registerJob({
    id: 'reply-check',
    name: 'Reply Check',
    cron: '*/15 * * * *', // Every 15 minutes
    handler: processReplies || (async () => log.info('Reply check: no handler registered')),
  });

  registerJob({
    id: 'daily-report',
    name: 'Daily Analytics Report',
    cron: '0 18 * * *', // 6 PM daily
    handler: generateDailyReport || (async () => log.info('Daily report: no handler registered')),
  });

  registerJob({
    id: 'weekly-report',
    name: 'Weekly Performance Summary',
    cron: '0 9 * * 1', // Monday 9 AM
    handler: generateWeeklyReport || (async () => log.info('Weekly report: no handler registered')),
  });
}
