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

test('accepts the unified automation chain without depending on the retained canary migration', async (t) => {
  const root = await createFixture(t);

  const result = await verifyAutomationRolloutContract(root);

  assert.equal(result.migrations.length, 14);
  assert.deepEqual(result.migrations.slice(-3), [
    '20260810000038_add_automation_resource_trigger_contract.sql',
    '20260810000039_complete_core_automation_engine.sql',
    '20260810000040_harden_automation_worker_claim_drain.sql',
  ]);
  assert.deepEqual(result.productionMigrations, result.migrations);
  assert.equal(isPhase11AutomationMigration('20260810000037_add_phase11_internal_fake_canary.sql'), false);
  assert.equal(result.migrations.includes('20260810000037_add_phase11_internal_fake_canary.sql'), false);
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

  await assert.rejects(verifyAutomationRolloutContract(root), /migration manifest must exactly match the unified automation chain/);
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

test('first production worker image bootstrap is manual, provenance-gated, and ACR-push-only', async () => {
  const bootstrapWorkflow = await readFile(
    path.join(repositoryRoot, '.github', 'workflows', '10-bootstrap-aca-production-image.yml'),
    'utf8',
  );

  assert.match(bootstrapWorkflow, /on:\n  workflow_dispatch:/);
  assert.doesNotMatch(bootstrapWorkflow, /^  (?:push|pull_request|schedule|workflow_call):/m);

  const jobMainGate = "if: github.ref == 'refs/heads/main'";
  const productionEnvironment = 'environment: jarvis-prime-api / production';
  const shaFormat = 'if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then';
  const pairedSha = 'if [[ "${{ inputs.git_sha }}" != "${{ inputs.api_release_sha }}" ]]';
  const expectedRepository = 'if [[ "$IMAGE_REPOSITORY" != "phase11-automation-worker" ]]';
  const checkout = `uses: actions/checkout@v4
        with:
          ref: \${{ inputs.git_sha }}
          fetch-depth: 0`;
  const refreshedMain = 'git fetch --no-tags origin main:refs/remotes/origin/main';
  const ancestry = 'git merge-base --is-ancestor "${{ inputs.git_sha }}" origin/main';
  const checkedOutHead = 'actual="$(git rev-parse HEAD)"';
  const requestedShaEquality = 'if [[ "$actual" != "${{ inputs.git_sha }}" ]]';
  const apiEvidence = 'api_runs="repos/${GITHUB_REPOSITORY}/actions/workflows/04-deploy-azure-api.yml/runs?head_sha=${{ inputs.api_release_sha }}&status=completed&per_page=100"';
  const successfulApiRun = 'if (( successful_api_runs < 1 )); then';
  const azureLogin = 'uses: azure/login@v2';
  const acrLogin = 'az acr login --name "$ACR_NAME"';
  const immutableImage = 'image="${ACR_LOGIN_SERVER}/${IMAGE_REPOSITORY}:sha-${{ inputs.git_sha }}"';
  const rootDockerfileBuild = 'docker build --file Dockerfile --tag "$image"';
  const imagePush = 'docker push "$image"';

  const positions = [
    jobMainGate,
    productionEnvironment,
    shaFormat,
    pairedSha,
    expectedRepository,
    checkout,
    refreshedMain,
    ancestry,
    checkedOutHead,
    requestedShaEquality,
    apiEvidence,
    successfulApiRun,
    azureLogin,
    acrLogin,
    immutableImage,
    rootDockerfileBuild,
    imagePush,
  ].map((marker) => {
    const position = bootstrapWorkflow.indexOf(marker);
    assert.notEqual(position, -1, `bootstrap workflow must contain ${marker}`);
    return position;
  });

  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index - 1] < positions[index], 'bootstrap trust checks must complete before Azure login and ACR push');
  }

  assert.match(bootstrapWorkflow, /IMAGE_REPOSITORY: \$\{\{ vars\.PRODUCTION_WORKER_IMAGE_REPOSITORY \}\}/);
  assert.doesNotMatch(bootstrapWorkflow, /STAGING_|environment: staging/);
  assert.doesNotMatch(bootstrapWorkflow, /INTERNAL_FAKE|docker pull|:\s*latest\b/i);
  assert.doesNotMatch(bootstrapWorkflow, /az containerapp\b|az deployment\b|\bbicep\s+(?:build|deploy)\b|az keyvault\b|az identity\b|az role assignment\b|az monitor\b/i);

  const azureCliCommands = [...bootstrapWorkflow.matchAll(/^\s*(az\s+.+)$/gm)].map(([, command]) => command);
  assert.deepEqual(azureCliCommands, [acrLogin]);
});

test('production API release requires exact SHA provenance and deployed API readiness', async () => {
  const apiWorkflow = await readFile(
    path.join(repositoryRoot, '.github', 'workflows', '04-deploy-azure-api.yml'),
    'utf8',
  );
  const workerWorkflow = await readFile(
    path.join(repositoryRoot, '.github', 'workflows', '08-deploy-aca-production.yml'),
    'utf8',
  );
  const bootstrapWorkflow = await readFile(
    path.join(repositoryRoot, '.github', 'workflows', '10-bootstrap-aca-production-image.yml'),
    'utf8',
  );

  assert.match(apiWorkflow, /workflow_dispatch:\n    inputs:\n      git_sha:/);
  assert.match(apiWorkflow, /required: true\n        type: string/);
  assert.match(apiWorkflow, /environment: "jarvis-prime-api \/ production"/);
  assert.doesNotMatch(apiWorkflow, /STAGING_|environment:\s*staging|environment:\s*Preview/);

  const jobMainGate = "if: github.ref == 'refs/heads/main'";
  const requestedSha = 'REQUESTED_GIT_SHA: ${{ inputs.git_sha || github.sha }}';
  const shaFormat = 'if [[ ! "$REQUESTED_GIT_SHA" =~ ^[0-9a-f]{40}$ ]]; then';
  const checkout = `uses: actions/checkout@v4
        with:
          ref: \${{ env.REQUESTED_GIT_SHA }}
          fetch-depth: 0`;
  const refreshedMain = 'git fetch --no-tags origin main:refs/remotes/origin/main';
  const ancestry = 'git merge-base --is-ancestor "$REQUESTED_GIT_SHA" origin/main';
  const checkedOutHead = 'actual="$(git rev-parse HEAD)"';
  const requestedShaEquality = 'if [[ "$actual" != "$REQUESTED_GIT_SHA" ]]';
  const releaseSha = 'echo "RELEASE_SHA=$actual" >> "$GITHUB_ENV"';
  const azureLogin = 'uses: azure/login@v2';
  const appServiceDeploy = 'uses: azure/webapps-deploy@v3';
  const appHost = 'az webapp show --name "$AZURE_WEBAPP_NAME" --resource-group "$AZURE_WEBAPP_RESOURCE_GROUP" --query defaultHostName -o tsv';
  const readinessEndpoint = 'ready_url="https://${api_host}/ready"';
  const boundedAttempts = 'max_attempts=30';
  const readinessSuccess = "curl --fail --silent --show-error --max-time 10 \"$ready_url\" | jq -e '.ready == true' >/dev/null";
  const readinessFailure = 'echo "API readiness did not succeed after ${max_attempts} attempts." >&2';
  const pairingSummary = 'echo "- Deployed API release SHA: \\`${RELEASE_SHA}\\`"';

  const positions = [
    jobMainGate,
    requestedSha,
    shaFormat,
    checkout,
    refreshedMain,
    ancestry,
    checkedOutHead,
    requestedShaEquality,
    releaseSha,
    azureLogin,
    appServiceDeploy,
    appHost,
    readinessEndpoint,
    boundedAttempts,
    readinessSuccess,
    readinessFailure,
    pairingSummary,
  ].map((marker) => {
    const position = apiWorkflow.indexOf(marker);
    assert.notEqual(position, -1, `API workflow must contain ${marker}`);
    return position;
  });

  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index - 1] < positions[index], 'API SHA checks, deployment, readiness, and pairing evidence must stay ordered');
  }

  assert.doesNotMatch(apiWorkflow, /db:push|phase11-production-migration-gate|az containerapp\b|az acr\b|az keyvault\b|\bbicep\b/i);
  assert.match(apiWorkflow, /Automatic rollback: not attempted/);
  assert.match(apiWorkflow, /GET \/ready/);
  assert.doesNotMatch(apiWorkflow, /health\/deep|GET \/health|GET \/live/);

  assert.match(workerWorkflow, /az containerapp update/);
  assert.match(bootstrapWorkflow, /az acr login/);
});
