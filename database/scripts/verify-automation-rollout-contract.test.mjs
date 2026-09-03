import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  isPhase11AutomationMigration,
  verifyAutomationRolloutContract,
} from './verify-automation-rollout-contract.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtureFiles = [
  'database/automation-rollout-contract.json',
  'apps/api/package.json',
  'apps/api/src/workers/automation-worker.js',
  'apps/api/src/workers/automation-worker.health.js',
  'apps/api/src/modules/automation/automation.execution.validation.js',
  'documentation/operations/phase11-worker-deployment-contract.md',
];
const phase15aMigrations = [
  '20260810000022_add_phase15_sales_agent_approvals.sql',
  '20260810000023_harden_phase15_sales_agent_approvals.sql',
  '20260810000024_enforce_phase15_release_capability.sql',
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function createFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'phase11-rollout-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const relative of fixtureFiles) {
    const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(repositoryRoot, relative), destination);
  }

  await mkdir(path.join(root, 'database', 'supabase'), { recursive: true });
  await cp(
    path.join(repositoryRoot, 'database', 'supabase', 'migrations'),
    path.join(root, 'database', 'supabase', 'migrations'),
    { recursive: true },
  );

  return root;
}

async function readContract(root) {
  const contractPath = path.join(root, 'database', 'automation-rollout-contract.json');
  return {
    contractPath,
    contract: JSON.parse(await readFile(contractPath, 'utf8')),
  };
}

test('recognizes only the canonical Phase 11 automation naming family', () => {
  assert.equal(isPhase11AutomationMigration('20260810000023_add_automation_control_plane.sql'), true);
  assert.equal(isPhase11AutomationMigration('20260810000025_fix_automation_daily_quota_window.sql'), true);
  assert.equal(isPhase11AutomationMigration('20260810000027_add_employee_run_pause_control.sql'), true);

  for (const filename of phase15aMigrations) {
    assert.equal(isPhase11AutomationMigration(filename), false, `${filename} must remain outside Phase 11 ownership`);
  }
});

test('accepts canonical Phase 11 migrations alongside overlapping Phase 15A migrations', async (t) => {
  const root = await createFixture(t);

  const result = await verifyAutomationRolloutContract(root);

  assert.equal(result.migrations.length, 9);
  assert.deepEqual(
    result.migrations,
    [
      '20260810000023_add_automation_control_plane.sql',
      '20260810000024_add_automation_execution_gap_controls.sql',
      '20260810000025_fix_automation_daily_quota_window.sql',
      '20260810000026_add_automation_recipe_policy_governance.sql',
      '20260810000027_add_employee_run_pause_control.sql',
      '20260810000028_add_automation_icp_score_policy.sql',
      '20260810000029_add_automation_apollo_readonly_action.sql',
      '20260810000030_add_automation_apollo_operational_readiness.sql',
      '20260810000031_add_automation_operational_health.sql',
    ],
  );
});

test('fails when a required canonical Phase 11 migration is absent', async (t) => {
  const root = await createFixture(t);
  await unlink(path.join(root, 'database', 'supabase', 'migrations', '20260810000025_fix_automation_daily_quota_window.sql'));

  await assert.rejects(verifyAutomationRolloutContract(root), /migration is missing: 20260810000025_fix_automation_daily_quota_window\.sql/);
});

test('fails for an unexpected migration in the Phase 11 automation naming family', async (t) => {
  const root = await createFixture(t);
  const migrations = path.join(root, 'database', 'supabase', 'migrations');
  await cp(
    path.join(migrations, '20260810000023_add_automation_control_plane.sql'),
    path.join(migrations, '20260810000023_add_automation_unapproved_control.sql'),
  );

  await assert.rejects(verifyAutomationRolloutContract(root), /undeclared automation migration: 20260810000023_add_automation_unapproved_control\.sql/);
});

test('fails when a canonical Phase 11 migration hash changes', async (t) => {
  const root = await createFixture(t);
  const migration = path.join(root, 'database', 'supabase', 'migrations', '20260810000026_add_automation_recipe_policy_governance.sql');
  await writeFile(migration, `${await readFile(migration, 'utf8')}\n-- fixture drift\n`);

  await assert.rejects(verifyAutomationRolloutContract(root), /migration hash mismatch: 20260810000026_add_automation_recipe_policy_governance\.sql/);
});

test('fails when canonical Phase 11 migration manifest order changes', async (t) => {
  const root = await createFixture(t);
  const { contractPath, contract } = await readContract(root);
  [contract.migrations[0], contract.migrations[1]] = [contract.migrations[1], contract.migrations[0]];
  await writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`);

  await assert.rejects(verifyAutomationRolloutContract(root), /migration manifest is duplicated or out of order/);
});

test('fails when a canonical Phase 11 migration is not transaction-bounded', async (t) => {
  const root = await createFixture(t);
  const { contractPath, contract } = await readContract(root);
  const entry = contract.migrations.find(({ file }) => file === '20260810000028_add_automation_icp_score_policy.sql');
  const migrationPath = path.join(root, 'database', 'supabase', 'migrations', entry.file);
  const source = (await readFile(migrationPath, 'utf8')).replace(/COMMIT;\s*$/, 'ROLLBACK;\n');

  await writeFile(migrationPath, source);
  entry.sha256 = sha256(source);
  await writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`);

  await assert.rejects(verifyAutomationRolloutContract(root), /migration is not transaction-bounded: 20260810000028_add_automation_icp_score_policy\.sql/);
});
