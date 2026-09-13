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

test('accepts the literal Phase 11 candidate chain and explicit production approval subset', async (t) => {
  const root = await createFixture(t);

  const result = await verifyAutomationRolloutContract(root);

  assert.equal(result.migrations.length, 12);
  assert.deepEqual(result.migrations.slice(-4), [
    '20260810000031_add_automation_operational_health.sql',
    '20260810000035_complete_phase11_local_candidate_controls.sql',
    '20260810000036_harden_phase11_p0_controls.sql',
    '20260810000037_add_phase11_internal_fake_canary.sql',
  ]);
  assert.deepEqual(result.productionMigrations.slice(-3), [
    '20260810000031_add_automation_operational_health.sql',
    '20260810000035_complete_phase11_local_candidate_controls.sql',
    '20260810000036_harden_phase11_p0_controls.sql',
  ]);
  assert.equal(result.migrations.at(-1), '20260810000037_add_phase11_internal_fake_canary.sql');
  assert.equal(result.productionMigrations.includes('20260810000037_add_phase11_internal_fake_canary.sql'), false);
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

  await assert.rejects(verifyAutomationRolloutContract(root), /migration manifest must exactly match the literal approved candidate chain/);
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

test('production worker deployment requires trusted main source before Azure OIDC', async () => {
  const productionWorkflow = await readFile(
    path.join(repositoryRoot, '.github', 'workflows', '08-deploy-aca-production.yml'),
    'utf8',
  );
  const stagingWorkflow = await readFile(
    path.join(repositoryRoot, '.github', 'workflows', '06-deploy-aca-staging.yml'),
    'utf8',
  );

  const jobMainGate = "if: github.ref == 'refs/heads/main'";
  const pairedSha = 'if [[ "${{ inputs.git_sha }}" != "${{ inputs.api_release_sha }}" ]]';
  const checkout = `uses: actions/checkout@v4
        with:
          ref: \${{ inputs.git_sha }}
          fetch-depth: 0`;
  const refreshedMain = 'git fetch --no-tags origin main:refs/remotes/origin/main';
  const ancestry = 'git merge-base --is-ancestor "${{ inputs.git_sha }}" origin/main';
  const checkedOutHead = 'actual="$(git rev-parse HEAD)"';
  const requestedShaEquality = 'if [[ "$actual" != "${{ inputs.git_sha }}" ]]';
  const successfulApiRun = 'if (( successful_api_runs < 1 )); then';
  const azureLogin = 'uses: azure/login@v2';

  const positions = [
    jobMainGate,
    pairedSha,
    checkout,
    refreshedMain,
    ancestry,
    checkedOutHead,
    requestedShaEquality,
    successfulApiRun,
    azureLogin,
  ].map((marker) => {
    const position = productionWorkflow.indexOf(marker);
    assert.notEqual(position, -1, `production workflow must contain ${marker}`);
    return position;
  });

  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index - 1] < positions[index], 'source trust checks must complete before Azure login');
  }

  assert.match(stagingWorkflow, /environment: staging/);
  assert.match(stagingWorkflow, /IMAGE_REPOSITORY: \$\{\{ vars\.STAGING_WORKER_IMAGE_REPOSITORY \}\}/);
  assert.doesNotMatch(stagingWorkflow, /if: github\.ref == 'refs\/heads\/main'/);
});
