// JARVIS PRIME ENGINE — orchestrator / entry point.
//
// DUAL MODE:
//   CLI MODE (default):
//     node src/runner.js              full pipeline once
//     node src/runner.js --task=source     only source + score
//     node src/runner.js --task=outbound   only send outreach
//     node src/runner.js --task=inbound    simulate replies
//     node src/runner.js --doctor          config report
//
//   HTTP SERVER MODE:
//     node src/runner.js --server         start HTTP API server on port 3001
//     node src/runner.js --server --port=3000   custom port
//
// Safe by default: DRY_RUN=true means nothing is emailed/paid APIs not called.

import { config, providerStatus } from './config.js';
import { log } from './lib/logger.js';
import { listActiveClients, getProspectsByStage } from './lib/db.js';
import { sourceAndScore, runOutreach } from './agents/outbound-agent.js';
import { handleReply } from './agents/inbound-agent.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

function getArg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : null;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

function banner() {
  log.info('================================================');
  log.info('  JARVIS PRIME — Outbound Automation Engine');
  log.info(`  Mode: ${config.dryRun ? '🧪 DRY-RUN (safe, nothing sent)' : '🚀 LIVE'}`);
  log.info('================================================');
}

async function doctor() {
  banner();
  const status = providerStatus();
  log.info('Provider readiness:');
  for (const [name, ready] of Object.entries(status)) {
    log[ready ? 'ok' : 'warn'](`  ${name.padEnd(10)} ${ready ? 'configured' : 'NOT configured'}`);
  }
  log.info('');
  log.info(`Daily prospect limit : ${config.dailyProspectLimit}`);
  log.info(`Daily send limit     : ${config.dailySendLimit}`);
  log.info(`From                 : ${config.fromName} <${config.fromEmail}>`);
  log.info('');
  if (config.dryRun) {
    log.warn('DRY_RUN is ON. To go live: set DRY_RUN=false in .env AND configure the providers above.');
  } else if (!status.database || !status.resend) {
    log.error('LIVE mode but database or email is not configured. Fix before running.');
  } else {
    log.ok('LIVE mode and core providers configured.');
  }
}

async function taskSource() {
  const clients = await listActiveClients();
  if (clients.length === 0) {
    log.warn('No active clients found. Add a client row (see engine/sql/schema.sql) to begin.');
    return;
  }
  for (const client of clients) await sourceAndScore(client);
}

async function taskOutbound() {
  const clients = await listActiveClients();
  for (const client of clients) await runOutreach(client);
}

// Demo only: in dry-run, simulate a few replies so you can see inbound handling.
async function taskInboundDemo() {
  if (!config.dryRun) {
    log.warn('Inbound processing needs an inbox webhook/IMAP poller in LIVE mode. See inbound-agent.js notes.');
    return;
  }
  const clients = await listActiveClients();
  const client = clients[0];
  const contacted = await getProspectsByStage('contacted', 3);
  if (contacted.length === 0) {
    log.info('No contacted prospects to simulate replies for. Run outreach first.');
    return;
  }
  const samples = ['Sure, sounds good — send me a calendar link', 'Not interested, thanks', 'Please unsubscribe me'];
  for (let i = 0; i < contacted.length; i++) {
    const intent = await handleReply(contacted[i], samples[i % samples.length], client);
    log.dry(`Simulated reply from ${contacted[i].email} -> classified as "${intent}"`);
  }
}

async function fullPipeline() {
  banner();
  log.step('Step 1/2 — Sourcing & scoring prospects...');
  await taskSource();
  log.step('Step 2/2 — Running outreach sequences...');
  await taskOutbound();
  log.ok('Pipeline run complete.');
}

async function main() {
  try {
    if (hasFlag('doctor')) return await doctor();

    // HTTP SERVER MODE
    if (hasFlag('server')) {
      return await startHttpServer();
    }

    // CLI MODE
    const task = getArg('task');
    if (task === 'source') {
      banner();
      return await taskSource();
    }
    if (task === 'outbound') {
      banner();
      return await taskOutbound();
    }
    if (task === 'inbound') {
      banner();
      return await taskInboundDemo();
    }

    await fullPipeline();
  } catch (err) {
    log.error(`Engine run failed: ${err.message}`);
    process.exitCode = 1;
  }
}

async function startHttpServer() {
  const express = await import('express');
  const app = express.default();

  // ---- Core middleware ----
  app.use(express.json({ limit: '2mb' }));
  app.use(corsMiddleware);
  app.use(rateLimiter);
  app.use(logger);

  // ---- Public routes (no auth) ----

  // Enhanced health check with provider status & system info
  app.get('/health', (req, res) => {
    const status = providerStatus();
    return res.json({
      status: 'ok',
      engine: 'JARVIS PRIME',
      version: '2.0.0',
      mode: config.dryRun ? 'dry-run' : 'live',
      dryRun: config.dryRun,
      uptime: Math.round(process.uptime()),
      uptimeHuman: formatUptime(process.uptime()),
      providers: status,
      configured: Object.entries(status).filter(([, v]) => v).map(([k]) => k),
      missing: Object.entries(status).filter(([, v]) => !v).map(([k]) => k),
      memory: {
        rss: `${Math.round(process.memoryUsage().rss / 1048576)}MB`,
        heap: `${Math.round(process.memoryUsage().heapUsed / 1048576)}MB`,
      },
      scheduler: config.schedulerEnabled ? 'active' : 'disabled',
      timestamp: new Date().toISOString(),
    });
  });

  // Compliance routes (public, no auth)
  const { default: complianceRouter } = await import('./api/routes/compliance.js');
  app.use('/unsubscribe', complianceRouter);

  // Webhook receiver routes (authenticated by signature, not API secret)
  const { default: webhooksRouter } = await import('./api/routes/webhooks.js');
  app.use('/webhooks', webhooksRouter);

  // ---- Auth middleware for all /api routes ----
  app.use('/api', authenticate);

  // ---- Import API routes ----
  const { default: enrichmentRouter } = await import('./api/routes/enrichment.js');
  const { default: outreachRouter } = await import('./api/routes/outreach.js');
  const { default: campaignsRouter } = await import('./api/routes/campaigns.js');
  const { default: linkedinRouter } = await import('./api/routes/linkedin.js');
  const { default: analyticsRouter } = await import('./api/routes/analytics.js');
  const { default: calendarRouter } = await import('./api/routes/calendar.js');
  const { default: schedulerRouter } = await import('./api/routes/scheduler.js');

  // ---- Mount API routes ----
  app.use('/api/enrichment', enrichmentRouter);
  app.use('/api/outreach', outreachRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/linkedin', linkedinRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/calendar', calendarRouter);
  app.use('/api/scheduler', schedulerRouter);

  // API directory — list all available endpoints
  app.get('/api', (req, res) => {
    return res.json({
      engine: 'JARVIS PRIME',
      version: '2.0.0',
      routes: {
        'GET  /health': 'System health & provider status',
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

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', hint: 'GET /api for available endpoints' });
  });

  // Error handler
  app.use(errorHandler);

  // ---- Start scheduler ----
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

  // ---- Start server ----
  const port = getArg('port') || config.port || 3001;
  app.listen(port, () => {
    log.info('');
    log.info('╔══════════════════════════════════════════════════════╗');
    log.info('║   JARVIS PRIME — Automation Engine v2.0             ║');
    log.info('╚══════════════════════════════════════════════════════╝');
    log.info('');
    log.info(`   🌐 Server:     http://localhost:${port}`);
    log.info(`   💚 Health:     http://localhost:${port}/health`);
    log.info(`   📡 API:        http://localhost:${port}/api`);
    log.info(`   📊 Dashboard:  http://localhost:${port}/api/analytics/dashboard`);
    log.info(`   ⏰ Scheduler:  http://localhost:${port}/api/scheduler`);
    log.info(`   🔗 LinkedIn:   http://localhost:${port}/api/linkedin`);
    log.info(`   📅 Calendar:   http://localhost:${port}/api/calendar`);
    log.info(`   🔔 Webhooks:   http://localhost:${port}/webhooks`);
    log.info('');
    log.info(`   Mode: ${config.dryRun ? '🧪 DRY-RUN (safe, nothing sent)' : '🚀 LIVE'}`);
    log.info(`   Scheduler: ${config.schedulerEnabled ? '✅ Active' : '⏸️  Disabled'}`);
    log.info('');
  });
}

// ---- Middleware ----

function corsMiddleware(req, res, next) {
  const allowedOrigins = config.corsOrigins.split(',').map((o) => o.trim());
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-automation-secret, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
}

// Simple in-memory rate limiter (per IP, 100 req/min)
const rateLimitStore = new Map();
function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 100;

  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
    return next();
  }

  const entry = rateLimitStore.get(ip);
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + windowMs;
    return next();
  }

  entry.count++;
  if (entry.count > maxRequests) {
    res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  next();
}

function logger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    log.info(`${req.method} ${req.path} ${res.statusCode} (${duration}ms)`);
  });
  next();
}

function authenticate(req, res, next) {
  const secret = req.headers['x-automation-secret'];
  if (!secret || secret !== config.automationSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function errorHandler(err, req, res, next) {
  log.error(err.message);
  res.status(err.status || 500).json({ error: err.message });
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

main();
