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

import { config, providerStatus, validateSecrets } from './config.js';
import { log } from 'jarvis-logger';
import { listActiveClients, getProspectsByStage } from './lib/db.js';
import { sourceAndScore, runOutreach } from './agents/outbound-agent.js';
import { handleReply } from './agents/inbound-agent.js';

function getArg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : null;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

function banner() {
  log.info('================================================');
  log.info('  JARVIS PRIME — Outbound Automation Engine');
  log.info(`  Mode: ${config.dryRun ? '🧪 DRY-RUN (safe, nothing sent)' : '🚀 LIVE'}`);
  log.info(`  Env:  ${config.env}`);
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

  // Config validation warnings
  const warnings = validateConfig();
  if (warnings.length > 0) {
    log.warn('Configuration warnings:');
    for (const w of warnings) log.warn(`  ⚠ ${w}`);
  }

  if (config.dryRun) {
    log.warn('DRY_RUN is ON. To go live: set DRY_RUN=false in .env AND configure the providers above.');
  } else if (!status.database || !status.resend) {
    log.error('LIVE mode but database or email is not configured. Fix before running.');
  } else {
    log.ok('LIVE mode and core providers configured.');
  }
}

function validateConfig() {
  const warnings = [];
  if (config.automationSecret === 'dev-secret') {
    warnings.push('AUTOMATION_SERVER_SECRET is using the default "dev-secret". Set a strong secret for production.');
  }
  if (!config.supabaseUrl) warnings.push('SUPABASE_URL not set — using in-memory store.');
  if (!config.resendApiKey) warnings.push('RESEND_API_KEY not set — emails will not be sent.');
  if (!config.groqApiKey) warnings.push('GROQ_API_KEY not set — using template emails instead of AI.');
  return warnings;
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

async function startHttpServer() {
  const { createApp } = await import('./app.js');
  const { app } = await createApp();

  const port = getArg('port') || config.port || 3001;

  const server = app.listen(port, () => {
    log.info('');
    log.info('╔══════════════════════════════════════════════════════╗');
    log.info('║   JARVIS PRIME — Automation Engine v3.0             ║');
    log.info('╚══════════════════════════════════════════════════════╝');
    log.info('');
    log.info(`   🌐 Server:     http://localhost:${port}`);
    log.info(`   💚 Health:     http://localhost:${port}/health`);
    log.info(`   🔍 Deep:       http://localhost:${port}/health/deep`);
    log.info(`   📡 API:        http://localhost:${port}/api`);
    log.info(`   📡 API v1:     http://localhost:${port}/api/v1`);
    log.info(`   📊 Dashboard:  http://localhost:${port}/api/analytics/dashboard`);
    log.info(`   ⏰ Scheduler:  http://localhost:${port}/api/scheduler`);
    log.info(`   🔗 LinkedIn:   http://localhost:${port}/api/linkedin`);
    log.info(`   📅 Calendar:   http://localhost:${port}/api/calendar`);
    log.info(`   🔔 Webhooks:   http://localhost:${port}/webhooks`);
    log.info('');
    log.info(`   Mode: ${config.dryRun ? '🧪 DRY-RUN (safe, nothing sent)' : '🚀 LIVE'}`);
    log.info(`   Env:  ${config.env}`);
    log.info(`   Scheduler: ${config.schedulerEnabled ? '✅ Active' : '⏸️  Disabled'}`);
    log.info('');
  });

  // ---- Graceful shutdown ----
  const shutdown = async (signal) => {
    log.info(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
      log.ok('HTTP server closed. No more incoming connections.');
      process.exit(0);
    });

    // Force exit after 10 seconds if connections don't drain
    setTimeout(() => {
      log.warn('Forced shutdown — connections did not drain in time.');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function main() {
  try {
    // Validate secrets before doing anything else.
    // In production, throws if critical secrets are missing or insecure.
    // In development, prints warnings only.
    const warnings = validateSecrets();
    if (warnings.length > 0) {
      for (const w of warnings) log.warn(`[config] ${w}`);
    }

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

main();
