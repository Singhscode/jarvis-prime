import { createServer } from 'node:http';

function compatibilityView(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    ready: value.ready === true,
    schemaVersion: Number.isSafeInteger(value.schema_version) ? value.schema_version : null,
    registryVersion: typeof value.registry_version === 'string' ? value.registry_version : null,
    workerVersion: typeof value.worker_version === 'string' ? value.worker_version : null,
  };
}

export function workerReadinessView(status, observedAt = new Date().toISOString()) {
  const ready = status?.ready === true && status?.draining !== true;
  return {
    ready,
    draining: status?.draining === true,
    active: Number.isSafeInteger(status?.active) && status.active >= 0 ? status.active : 0,
    compatibility: compatibilityView(status?.compatibility),
    observedAt,
  };
}

function respond(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

/** A local supervisor probe; it exposes no work, owner, credential, or provider data. */
export function createAutomationWorkerHealthServer({ statusProvider, now = () => new Date().toISOString() } = {}) {
  if (typeof statusProvider !== 'function') throw new Error('AUTOMATION_WORKER_HEALTH_STATUS_REQUIRED');
  return createServer((request, response) => {
    if (request.method !== 'GET') return respond(response, 405, { error: 'method_not_allowed' });
    if (request.url === '/live') return respond(response, 200, { alive: true });
    if (request.url === '/ready') {
      const view = workerReadinessView(statusProvider(), now());
      return respond(response, view.ready ? 200 : 503, view);
    }
    return respond(response, 404, { error: 'not_found' });
  });
}

export async function listenForAutomationWorkerHealth({ port, statusProvider, logger = console, host = '0.0.0.0' } = {}) {
  const server = createAutomationWorkerHealthServer({ statusProvider });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });
  logger.info?.('Automation worker health probe listening', { port });
  return {
    async stop() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
