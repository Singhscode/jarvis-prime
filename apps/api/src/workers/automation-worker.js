import * as repository from '../modules/automation/automation.execution.repository.js';
import { createDurableScheduleMaterializer } from '../modules/automation/automation.execution.scheduler.js';
import { createWorker } from '../modules/automation/automation.execution.worker.js';

const worker = createWorker({ workerId: process.env.AUTOMATION_WORKER_ID });
const materializer = createDurableScheduleMaterializer({ repositoryApi: repository });
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  controller.abort();
  materializer.stop();
  await worker.shutdown();
  process.exitCode = 0;
});

async function run() {
  await worker.start();
  materializer.start();
  while (!controller.signal.aborted && !worker.draining) {
    await worker.runOnce();
    if (!controller.signal.aborted && !worker.draining) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

run().catch((error) => { console.error('Automation worker failed', { code: error?.code || 'AUTOMATION_WORKER_FAILURE' }); process.exitCode = 1; })
  .finally(() => materializer.stop());
