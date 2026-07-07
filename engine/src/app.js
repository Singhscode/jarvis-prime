// App factory — assembles the Express application.
//
// Separates app creation from server listening so the app can be:
//   - Imported in tests without starting a server
//   - Configured differently per environment
//   - Assembled with different middleware stacks
//
// Usage:
//   import { createApp } from './app.js';
//   const { app } = await createApp();
//   app.listen(3001);

import { config, providerStatus } from './config.js';
import { log } from './lib/logger.js';
import { listActiveClients } from './lib/db.js';
import { sourceAndScore, runOutreach } from './agents/outbound-agent.js';
import { createCors } from './middleware/cors.js';
import { createRateLimiter } from './middleware/rate-limiter.js';
import { createRequestLogger } from './middleware/request-logger.js';
import { createAuth } from './middleware/authenticate.js';
import { notFoundHandler, errorHandler } from './middleware/error-handler.js';
import { checkConnection } from './lib/db.js';

/**
 * Create and configure the Express application.
 * @param {object} [options]
 * @param {boolean} [options.enableScheduler=true]  Start the scheduler
 * @param {boolean} [options.enableCors=true]       Enable CORS middleware
 * @param {boolean} [options.enableRateLimit=true]   Enable rate limiting
 * @returns {Promise<{ app: Express.Application }>}
 */
export async function createApp(options = {}) {
  const {
    enableScheduler = config.schedulerEnabled,
    enableCors = true,
    enableRateLimit = true,
  } = options;

  const express = await import('express');
  const app = express.default();

  // ---- Core middleware ----
  app.use(express.json({ limit: '2mb' }));

  if (enableCors) {
    app.use(createCors());
  }

  if (enableRateLimit) {
    app.use(createRateLimiter());
  }

  app.use(createRequestLogger());

  // ---- Public routes (no auth) ----

  // Health check with provider status & system info
  app.get('/health', (req, res) => {
    const status = providerStatus();
    return res.json({
      status: 'ok',
      engine: 'JARVIS PRIME',
      version: '3.0.0',
      mode: config.dryRun ? 'dry-run' : 'live',
      dryRun: config.dryRun,
      env: config.env,
      uptime: Math.round(process.uptime()),
      uptimeHuman: formatUptime(process.uptime()),
      providers: status,
      configured: Object.entries(status).filter(([, v]) => v).map(([k]) => k),
      missing: Object.entries(status).filter(([, v]) => !v).map(([k]) => k),
      memory: {
        rss: `${Math.round(process.memoryUsage().rss / 1048576)}MB`,
        heap: `${Math.round(process.memoryUsage().heapUsed / 1048576)}MB`,
      },
      scheduler: enableScheduler ? 'active' : 'disabled',
      timestamp: new Date().toISOString(),
    });
  });

  // Deep health check — verifies DB connectivity
  app.get('/health/deep', async (req, res) => {
    const status = providerStatus();
    const checks = { database: false, providers: status };

    try {
      checks.database = await checkConnection();
    } catch {
      checks.database = false;
    }

    const allHealthy = checks.database;
    return res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness probe (for Kubernetes/Docker)
  app.get('/ready', async (req, res) => {
    try {
      const dbOk = await checkConnection();
      if (!dbOk) return res.status(503).json({ ready: false, reason: 'database' });
      return res.json({ ready: true });
    } catch {
      return res.status(503).json({ ready: false });
    }
  });

  // Liveness probe
  app.get('/live', (req, res) => res.json({ alive: true }));

  // Compliance routes (public, no auth)
  const { default: complianceRouter } = await import('./api/routes/compliance.js');
  app.use('/unsubscribe', complianceRouter);

  // Webhook receiver routes (authenticated by signature, not API secret)
  const { default: webhooksRouter } = await import('./api/routes/webhooks.js');
  app.use('/webhooks', webhooksRouter);

  // ---- Auth middleware for all /api routes ----
  app.use('/api', createAuth());

  // ---- Import and mount API routes ----
  const { default: enrichmentRouter } = await import('./api/routes/enrichment.js');
  const { default: outreachRouter } = await import('./api/routes/outreach.js');
  const { default: campaignsRouter } = await import('./api/routes/campaigns.js');
  const { default: linkedinRouter } = await import('./api/routes/linkedin.js');
  const { default: analyticsRouter } = await import('./api/routes/analytics.js');
  const { default: calendarRouter } = await import('./api/routes/calendar.js');
  const { default: schedulerRouter } = await import('./api/routes/scheduler.js');

  // Mount at /api/ (current) — serves as default version
  app.use('/api/enrichment', enrichmentRouter);
  app.use('/api/outreach', outreachRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/linkedin', linkedinRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/calendar', calendarRouter);
  app.use('/api/scheduler', schedulerRouter);

  // Also mount at /api/v1/ for explicit versioning
  app.use('/api/v1/enrichment', enrichmentRouter);
  app.use('/api/v1/outreach', outreachRouter);
  app.use('/api/v1/campaigns', campaignsRouter);
  app.use('/api/v1/linkedin', linkedinRouter);
  app.use('/api/v1/analytics', analyticsRouter);
  app.use('/api/v1/calendar', calendarRouter);
  app.use('/api/v1/scheduler', schedulerRouter);

  // API directory — list all available endpoints
  app.get('/api', (req, res) => {
    return res.json({
      engine: 'JARVIS PRIME',
      version: '3.0.0',
      versioning: 'Routes available at /api/* (default) and /api/v1/* (explicit)',
      routes: {
        'GET  /health': 'System health & provider status',
        'GET  /health/deep': 'Deep health check (verifies DB)',
        'GET  /ready': 'Kubernetes readiness probe',
        'GET  /live': 'Kubernetes liveness probe',
        'GET  /api/enrichment': 'Search & enrich prospects',
        'POST /api/outreach': 'Send cold emails & follow-ups',
        'GET  /api/campaigns': 'Campaign management',
        'GET  /api/linkedin': 'LinkedIn automation status',
        'POST /api/linkedin': 'Execute LinkedIn actions',
        'GET  /api/analytics/dashboard': 'Full dashboard metrics',
        'GET  /api/analytics/daily': 'Daily metrics',
        'GET  /api/analytics/funnel': 'Conversion funnel',
        'GET  /api/analytics/channels': 'Channel breakdown',
        'GET  /api/analytics/ab-tests': 'A/B test results',
        'GET  /api/calendar/availability': 'Available meeting slots',
        'POST /api/calendar/book': 'Book a meeting',
        'GET  /api/scheduler': 'Scheduled job status',
        'POST /api/scheduler/:id/run': 'Manually trigger a job',
        'POST /webhooks/inbound-email': 'Inbound email webhook',
        'POST /webhooks/calendar': 'Cal.com webhook',
        'POST /webhooks/crm': 'CRM sync webhook',
        'POST /webhooks/custom': 'Custom n8n/Zapier trigger',
        'GET  /unsubscribe': 'Public unsubscribe page',
      },
    });
  });

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  // ---- Start scheduler (if enabled) ----
  if (enableScheduler) {
    const { registerDefaultJobs, startScheduler } = await import('./lib/scheduler.js');
    registerDefaultJobs({
      sourceAndScoreAll: async () => {
        const clients = await listActiveClients();
        for (const client of clients) await sourceAndScore(client);
      },
      runOutreachAll: async () => {
        const clients = await listActiveClients();
        for (const client of clients) await runOutreach(client);
      },
      processReplies: async () => {
        log.info('[Scheduler] Reply check: awaiting webhook-based reply detection.');
      },
      generateDailyReport: async () => {
        const { getDashboard } = await import('./api/services/analytics-service.js');
        const { alertEvent } = await import('./lib/notifications.js');
        const data = await getDashboard(null);
        await alertEvent('daily_report', {
          date: new Date().toLocaleDateString(),
          emailsSent: data.today.emailsSent,
          linkedinActions: data.channels?.linkedin?.actions || 0,
          replies: data.today.replies,
          replyRate: data.today.replyRate,
          meetingsBooked: data.today.meetingsBooked,
        });
      },
      generateWeeklyReport: async () => {
        const { getDashboard } = await import('./api/services/analytics-service.js');
        const { alertEvent } = await import('./lib/notifications.js');
        const data = await getDashboard(null);
        await alertEvent('weekly_report', {
          week: `Week of ${new Date().toLocaleDateString()}`,
          totalEmails: data.overview.contacted,
          totalReplies: data.overview.replied,
          replyRate: data.overview.contacted > 0
            ? ((data.overview.replied / data.overview.contacted) * 100).toFixed(1)
            : '0',
          meetingsBooked: data.overview.booked,
        });
      },
    });
    startScheduler();
  }

  return { app };
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}
