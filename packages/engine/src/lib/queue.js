// In-memory job queue — async work processing with retries.
//
// Designed to be swapped out for Redis/BullMQ when traffic demands it.
// Makes outreach processing async instead of blocking the API response.
//
// Usage:
//   import { queue } from './lib/queue.js';
//   queue.enqueue('send_email', { to: 'x@y.com', subject: 'hi' });
//   queue.process('send_email', async (job) => { ... });

import { log } from './logger.js';

class InMemoryQueue {
  constructor() {
    this._jobs = new Map();           // jobId -> job
    this._handlers = new Map();       // jobType -> handler function
    this._processing = false;
    this._idCounter = 0;
  }

  /**
   * Add a job to the queue.
   * @param {string} type     Job type (e.g., 'send_email', 'source_prospects')
   * @param {object} payload  Job data
   * @param {object} [opts]   { priority, maxRetries, delay }
   * @returns {object} The created job
   */
  enqueue(type, payload, opts = {}) {
    const id = `job-${++this._idCounter}-${Date.now()}`;
    const job = {
      id,
      type,
      payload,
      status: 'pending',      // pending | processing | completed | failed | retrying
      retries: 0,
      maxRetries: opts.maxRetries ?? 3,
      priority: opts.priority ?? 0,
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      delay: opts.delay ?? 0,   // delay in ms before processing
    };

    this._jobs.set(id, job);
    log.info(`[Queue] Enqueued job ${id} (${type})`);

    // Auto-process if a handler is registered
    if (this._handlers.has(type) && !this._processing) {
      this._tick();
    }

    return job;
  }

  /**
   * Register a handler for a job type.
   * @param {string} type       Job type to handle
   * @param {Function} handler  Async function (job) => any
   */
  process(type, handler) {
    this._handlers.set(type, handler);
    log.info(`[Queue] Registered handler for "${type}"`);
    // Process any pending jobs of this type
    this._tick();
  }

  /**
   * Get all jobs, optionally filtered by type or status.
   */
  getJobs(filter = {}) {
    let jobs = Array.from(this._jobs.values());
    if (filter.type) jobs = jobs.filter((j) => j.type === filter.type);
    if (filter.status) jobs = jobs.filter((j) => j.status === filter.status);
    return jobs.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get queue statistics.
   */
  stats() {
    const jobs = Array.from(this._jobs.values());
    return {
      total: jobs.length,
      pending: jobs.filter((j) => j.status === 'pending').length,
      processing: jobs.filter((j) => j.status === 'processing').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
      retrying: jobs.filter((j) => j.status === 'retrying').length,
    };
  }

  /**
   * Clear completed and failed jobs older than `maxAge` ms.
   */
  cleanup(maxAge = 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - maxAge;
    for (const [id, job] of this._jobs) {
      if (['completed', 'failed'].includes(job.status) && new Date(job.createdAt).getTime() < cutoff) {
        this._jobs.delete(id);
      }
    }
  }

  async _tick() {
    if (this._processing) return;
    this._processing = true;

    try {
      for (const [id, job] of this._jobs) {
        if (job.status !== 'pending' && job.status !== 'retrying') continue;

        const handler = this._handlers.get(job.type);
        if (!handler) continue;

        // Check delay
        if (job.delay > 0 && Date.now() - new Date(job.createdAt).getTime() < job.delay) {
          continue;
        }

        job.status = 'processing';
        job.startedAt = new Date().toISOString();

        try {
          await handler(job);
          job.status = 'completed';
          job.completedAt = new Date().toISOString();
        } catch (err) {
          job.retries++;
          if (job.retries >= job.maxRetries) {
            job.status = 'failed';
            job.error = err.message;
            log.error(`[Queue] Job ${id} (${job.type}) permanently failed: ${err.message}`);
          } else {
            job.status = 'retrying';
            job.error = err.message;
            log.warn(`[Queue] Job ${id} (${job.type}) failed, retry ${job.retries}/${job.maxRetries}: ${err.message}`);
          }
        }
      }
    } finally {
      this._processing = false;
    }

    // Check if there are more pending jobs
    const hasPending = Array.from(this._jobs.values()).some(
      (j) => j.status === 'pending' || j.status === 'retrying'
    );
    if (hasPending) {
      // Use setImmediate to avoid blocking
      setTimeout(() => this._tick(), 100);
    }
  }
}

// Singleton instance
export const queue = new InMemoryQueue();
