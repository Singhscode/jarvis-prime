// Scheduler API Route
// View and manage scheduled automation jobs.

import express from 'express';
import { listJobs, getJobStatus, runJobNow, toggleJob } from './scheduler.js';

const router = express.Router();

// GET /api/scheduler — List all scheduled jobs
router.get('/', (req, res) => {
  return res.json({
    success: true,
    data: {
      jobs: listJobs(),
      totalJobs: listJobs().length,
    },
  });
});

// GET /api/scheduler/:jobId — Get status of a specific job
router.get('/:jobId', (req, res) => {
  const status = getJobStatus(req.params.jobId);
  if (!status) {
    return res.status(404).json({ error: `Job not found: ${req.params.jobId}` });
  }
  return res.json({ success: true, data: status });
});

// POST /api/scheduler/:jobId/run — Manually trigger a job
router.post('/:jobId/run', async (req, res) => {
  try {
    const result = await runJobNow(req.params.jobId);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/scheduler/:jobId/toggle — Enable/disable a job
router.post('/:jobId/toggle', (req, res) => {
  try {
    const { enabled } = req.body;
    const result = toggleJob(req.params.jobId, enabled);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
