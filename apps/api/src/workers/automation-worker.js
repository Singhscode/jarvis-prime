import * as repository from '../modules/automation/automation.execution.repository.js';
import { createDurableScheduleMaterializer } from '../modules/automation/automation.execution.scheduler.js';
import { createWorker } from '../modules/automation/automation.execution.worker.js';
import { createAutomationWorkerHealthServer } from './automation-worker.health.js';
import { getAutomationWorkerRuntimeConfig } from './automation-worker.runtime.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const runtime = getAutomationWorkerRuntimeConfig();
  const worker = createWorker({ workerId: runtime.workerId, ...runtime.workerOptions });
  const materializer = createDurableScheduleMaterializer({ repositoryApi: repository, ...runtime.scheduleOptions });
  const controller = new AbortController();
  const healthServer = runtime.healthPort === null
    ? null
    : createAutomationWorkerHealthServer({ statusProvider: () => worker.status });
  let shutdownPromise = null;
  const shutdown = () => {
    if (!shutdownPromise) {
      controller.abort();
      materializer.stop();
      shutdownPromise = worker.shutdown({ graceMs: runtime.drainGraceMs });
    }
    return shutdownPromise;
  };
  const closeHealth = async () => {
    if (!healthServer?.listening) return;
    await new Promise((resolve, reject) => healthServer.close((error) => error ? reject(error) : resolve()));
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    void shutdown().then(() => { process.exitCode = 0; }).catch(() => { process.exitCode = 1; });
  });

  try {
    if (healthServer) await new Promise((resolve, reject) => {
      healthServer.once('error', reject);
      healthServer.listen(runtime.healthPort, '0.0.0.0', () => { healthServer.off('error', reject); resolve(); });
    });
    await worker.start();
    materializer.start();
    while (!controller.signal.aborted && !worker.draining) {
      await worker.runOnce();
      if (!controller.signal.aborted && !worker.draining) await sleep(runtime.workerOptions.pollMs);
    }
  } finally {
    materializer.stop();
    await shutdown();
    await closeHealth();
  }
}

run().catch((error) => { console.error('Automation worker failed', { code: error?.code || 'AUTOMATION_WORKER_FAILURE' }); process.exitCode = 1; });
