import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..', '..');
const AUTOMATION_MIGRATION = /^202608100000(2[3-9]|3[01])_.+\.sql$/;

function fail(errors, message) { errors.push(message); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

/**
 * Static repository-only release gate. It intentionally runs no child processes,
 * links no Supabase project, reads no environment variables, and never applies a migration.
 */
export async function verifyAutomationRolloutContract(root = defaultRoot) {
  const errors = [];
  const read = async (relative) => readFile(path.join(root, relative), 'utf8');
  let contract;
  try { contract = JSON.parse(await read('database/automation-rollout-contract.json')); }
  catch (error) { throw new Error(`AUTOMATION_ROLLOUT_CONTRACT_INVALID: ${error.message}`); }

  if (contract.contractVersion !== 1) fail(errors, 'contractVersion must be 1');
  if (contract.workerCommand !== 'npm run worker:automation --workspace=apps/api') fail(errors, 'workerCommand is not the approved separate-worker command');
  if (contract.compatibility?.registryVersion !== 'AUTOMATION_REGISTRY_V1' || contract.compatibility?.workerVersion !== 'AUTOMATION_WORKER_V1') {
    fail(errors, 'compatibility versions do not match the durable worker contract');
  }
  if (!Array.isArray(contract.migrations) || contract.migrations.length !== 9) fail(errors, 'exactly migrations 20260810000023 through 20260810000031 are required');

  const expected = new Set(); let previous = '';
  for (const entry of contract.migrations || []) {
    if (!entry || typeof entry.file !== 'string' || !AUTOMATION_MIGRATION.test(entry.file) || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) {
      fail(errors, 'migration manifest contains an invalid entry'); continue;
    }
    const version = entry.file.slice(0, 14);
    if (expected.has(entry.file) || version <= previous) fail(errors, `migration manifest is duplicated or out of order: ${entry.file}`);
    expected.add(entry.file); previous = version;
    try {
      const source = await read(path.join('database', 'supabase', 'migrations', entry.file));
      if (sha256(source) !== entry.sha256) fail(errors, `migration hash mismatch: ${entry.file}`);
      if (!/^\s*BEGIN;/m.test(source) || !/COMMIT;\s*$/.test(source)) fail(errors, `migration is not transaction-bounded: ${entry.file}`);
    } catch { fail(errors, `migration is missing: ${entry.file}`); }
  }

  const migrationDir = path.join(root, 'database', 'supabase', 'migrations');
  const discovered = (await readdir(migrationDir)).filter((name) => AUTOMATION_MIGRATION.test(name));
  for (const file of discovered) if (!expected.has(file)) fail(errors, `undeclared automation migration: ${file}`);
  for (const file of expected) if (!discovered.includes(file)) fail(errors, `declared automation migration is absent: ${file}`);

  try {
    const healthMigration = await read('database/supabase/migrations/20260810000031_add_automation_operational_health.sql');
    if (!healthMigration.includes('automation_get_owner_operational_health') || healthMigration.includes('owner_automation_runs')) fail(errors, 'operational-health migration violates the Phase 11 authority boundary');
    const packageJson = JSON.parse(await read('apps/api/package.json'));
    if (packageJson.scripts?.['worker:automation'] !== 'node src/workers/automation-worker.js') fail(errors, 'API worker script is missing or changed');
    const worker = await read('apps/api/src/workers/automation-worker.js');
    const probe = await read('apps/api/src/workers/automation-worker.health.js');
    const validation = await read('apps/api/src/modules/automation/automation.execution.validation.js');
    if (!worker.includes('getAutomationWorkerRuntimeConfig') || !worker.includes("'SIGTERM'")) fail(errors, 'worker startup validation or SIGTERM drain wiring is missing');
    if (!probe.includes("'/live'") || !probe.includes("'/ready'")) fail(errors, 'worker supervisor probes are missing');
    if (!validation.includes(contract.compatibility.registryVersion) || !validation.includes(contract.compatibility.workerVersion)) fail(errors, 'worker compatibility constants are missing');
    const deploymentContract = await read('documentation/operations/phase11-worker-deployment-contract.md');
    if (!deploymentContract.includes('CI never runs `npm run db:push`') || !deploymentContract.includes(contract.workerCommand)) fail(errors, 'deployment contract is incomplete');
  } catch (error) { fail(errors, `required deployment artifact is unavailable: ${error.message}`); }

  if (errors.length) throw new Error(`AUTOMATION_ROLLOUT_CONTRACT_INVALID:\n- ${errors.join('\n- ')}`);
  return { migrations: [...expected], compatibility: contract.compatibility };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyAutomationRolloutContract().then((result) => {
    console.log(`Automation rollout contract verified: ${result.migrations.length} migrations, ${result.compatibility.registryVersion}/${result.compatibility.workerVersion}`);
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
