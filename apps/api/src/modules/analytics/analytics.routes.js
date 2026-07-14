// Analytics API Route
// Dashboard metrics, daily/weekly trends, funnels, and channel breakdowns.

import express from 'express';
import * as analyticsService from './analytics.service.js';
import { listTests, getTestResults } from '../../utils/ab-testing.js';

const router = express.Router();

// GET /api/analytics/dashboard — Full dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const clientId = req.query.clientId || null;
    const data = await analyticsService.getDashboard(clientId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics/daily — Daily metrics for a date range
router.get('/daily', async (req, res) => {
  try {
    const { clientId, startDate, endDate } = req.query;
    const data = await analyticsService.getDailyMetrics(clientId, startDate, endDate);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics/funnel — Conversion funnel
router.get('/funnel', async (req, res) => {
  try {
    const clientId = req.query.clientId || null;
    const data = await analyticsService.getFunnelMetrics(clientId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics/channels — Email vs LinkedIn comparison
router.get('/channels', async (req, res) => {
  try {
    const clientId = req.query.clientId || null;
    const data = await analyticsService.getChannelBreakdown(clientId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics/ab-tests — A/B test results
router.get('/ab-tests', (req, res) => {
  try {
    const clientId = req.query.clientId || null;
    const tests = listTests(clientId);
    return res.json({
      success: true,
      data: {
        total: tests.length,
        running: tests.filter((t) => t.status === 'running').length,
        completed: tests.filter((t) => t.status === 'completed').length,
        tests: tests.map((t) => getTestResults(t.id)),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics — Overview endpoint
router.get('/', (req, res) => {
  return res.json({
    status: 'ok',
    endpoints: [
      'GET /api/analytics/dashboard',
      'GET /api/analytics/daily?startDate=&endDate=',
      'GET /api/analytics/funnel',
      'GET /api/analytics/channels',
      'GET /api/analytics/ab-tests',
    ],
  });
});

export default router;
