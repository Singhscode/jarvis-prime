// Analytics API Routes
// Dashboard, revenue, clients, projects, tasks, leads, communications, automation, expenses.

import express from 'express';
import * as service from './analytics.service.js';
import { createAuthMiddleware } from '../../middleware/auth-middleware.js';

const router = express.Router();

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const handle = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res)).catch(next);

const respond = (res, data, status = 200) => {
  res.set('Cache-Control', 'private, no-store');
  res.status(status).json({ success: true, data });
};

// Require authentication for all analytics endpoints
router.use(createAuthMiddleware({ required: true }));

// GET /api/analytics/dashboard — Full overview dashboard
router.get('/dashboard', handle(async (req, res) => {
  const data = await service.getDashboard(req.user.sub);
  respond(res, data);
}));

// GET /api/analytics/revenue?start=YYYY-MM-DD&end=YYYY-MM-DD
// Revenue report for period
router.get('/revenue', handle(async (req, res) => {
  const { start, end } = req.query;
  
  if (!start || !end) {
    throw new AppError('start and end dates required (format: YYYY-MM-DD)', 400, 'VALIDATION_ERROR');
  }
  
  const data = await service.getRevenueReport(req.user.sub, start, end);
  respond(res, data);
}));

// GET /api/analytics/daily?start=YYYY-MM-DD&end=YYYY-MM-DD
// Daily metrics for date range
router.get('/daily', handle(async (req, res) => {
  const { start, end } = req.query;
  
  if (!start || !end) {
    throw new AppError('start and end dates required (format: YYYY-MM-DD)', 400, 'VALIDATION_ERROR');
  }
  
  const data = await service.getDailyMetrics(req.user.sub, start, end);
  respond(res, data);
}));

// GET /api/analytics/clients
// Client metrics
router.get('/clients', handle(async (req, res) => {
  const data = await service.getClientsReport(req.user.sub);
  respond(res, data);
}));

// GET /api/analytics/projects
// Project metrics
router.get('/projects', handle(async (req, res) => {
  const data = await service.getProjectsReport(req.user.sub);
  respond(res, data);
}));

// GET /api/analytics/tasks
// Task metrics
router.get('/tasks', handle(async (req, res) => {
  const data = await service.getTasksReport(req.user.sub);
  respond(res, data);
}));

// GET /api/analytics/leads
// Lead metrics
router.get('/leads', handle(async (req, res) => {
  const data = await service.getLeadsReport(req.user.sub);
  respond(res, data);
}));

// GET /api/analytics/communication
// Communication metrics (last 24h)
router.get('/communication', handle(async (req, res) => {
  const data = await service.getCommunicationReport(req.user.sub);
  respond(res, data);
}));

// GET /api/analytics/automation
// Automation metrics (last 24h)
router.get('/automation', handle(async (req, res) => {
  const data = await service.getAutomationReport(req.user.sub);
  respond(res, data);
}));

// GET /api/analytics/expenses
// Expense metrics
router.get('/expenses', handle(async (req, res) => {
  const data = await service.getExpensesReport(req.user.sub);
  respond(res, data);
}));

// GET /api/analytics
// Overview/status endpoint
router.get('/', (req, res) => {
  respond(res, {
    status: 'ok',
    endpoints: [
      'GET /api/analytics/dashboard',
      'GET /api/analytics/revenue?start=YYYY-MM-DD&end=YYYY-MM-DD',
      'GET /api/analytics/daily?start=YYYY-MM-DD&end=YYYY-MM-DD',
      'GET /api/analytics/clients',
      'GET /api/analytics/projects',
      'GET /api/analytics/tasks',
      'GET /api/analytics/leads',
      'GET /api/analytics/communication',
      'GET /api/analytics/automation',
      'GET /api/analytics/expenses',
    ],
  });
});

export default router;
