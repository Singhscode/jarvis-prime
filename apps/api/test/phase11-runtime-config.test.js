import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRuntimeEnvironment } from '../src/config/config.js';
import { createStagingCanary, resolveStagingCanaryRuntimeConfig } from '../src/modules/automation/automation.staging-canary.service.js';

const STAGING_URL = 'https://ygflbvplksgljlamhbju.supabase.co';
const WRONG_URL = 'https://wrong-project.supabase.co';
const KEY = 'test-service-role-key';
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const request = Object.freeze({
  ownerUserId: '11111111-1111-4111-8111-111111111111',
  actorUserId: '11111111-1111-4111-8111-111111111111',
  sourceEventId: 'CANARY_RUNTIME_CONFIG_20260908',
  dueAt: '2026-09-08T09:00:00.000Z',
});

async function withEnvFiles(files, run) {
  const baseDir = await mkdtemp(path.join(tmpdir(), 'phase11-config-'));
  try {
    await Promise.all(Object.entries(files).map(([name, content]) => writeFile(path.join(baseDir, name), content)));
    return await run(baseDir);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
}

test('process environment wins over local and environment-specific dotenv values', async () => {
  await withEnvFiles({
    '.env': `SUPABASE_URL=${WRONG_URL}\nSUPABASE_SERVICE_ROLE_KEY=local-key\n`,
    '.env.staging': 'SUPABASE_URL=https://another-wrong-project.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=file-key\n',
  }, (baseDir) => {
    const target = { NODE_ENV: 'staging', SUPABASE_URL: STAGING_URL, SUPABASE_SERVICE_ROLE_KEY: KEY };
    loadRuntimeEnvironment({ target, baseDir });
    assert.equal(target.SUPABASE_URL, STAGING_URL);
    assert.equal(target.SUPABASE_SERVICE_ROLE_KEY, KEY);
  });
});

test('dotenv loading never overwrites already injected configuration', async () => {
  await withEnvFiles({ '.env': `SUPABASE_URL=${WRONG_URL}\nSUPABASE_SERVICE_ROLE_KEY=dotenv-key\n` }, (baseDir) => {
    const target = { SUPABASE_URL: STAGING_URL, SUPABASE_SERVICE_ROLE_KEY: KEY };
    loadRuntimeEnvironment({ target, baseDir });
    assert.deepEqual(
      { url: target.SUPABASE_URL, key: target.SUPABASE_SERVICE_ROLE_KEY },
      { url: STAGING_URL, key: KEY },
    );
  });
});

test('local development retains dotenv support with environment-specific file precedence', async () => {
  await withEnvFiles({
    '.env': 'SUPABASE_URL=https://local-base.test\nLOCAL_ONLY=base\n',
    '.env.development': 'SUPABASE_URL=https://local-development.test\n',
  }, (baseDir) => {
    const target = { NODE_ENV: 'development' };
    loadRuntimeEnvironment({ target, baseDir });
    assert.equal(target.SUPABASE_URL, 'https://local-development.test');
    assert.equal(target.LOCAL_ONLY, 'base');
  });
});

test('staging mode fails closed without explicit opt-in or injected database configuration before RPC access', async () => {
  assert.throws(() => resolveStagingCanaryRuntimeConfig({
    runtimeTarget: '', supabaseUrl: STAGING_URL, supabaseKey: KEY,
  }), /AUTOMATION_CANARY_STAGING_RUNTIME_REQUIRED/);

  let calls = 0;
  const canary = createStagingCanary({
    runtimeConfig: { runtimeTarget: 'staging', supabaseUrl: '', supabaseKey: '' },
    runCanary: async () => { calls += 1; },
  });
  await assert.rejects(canary.admit(request), /AUTOMATION_CANARY_STAGING_CONFIG_REQUIRED/);
  assert.equal(calls, 0);

  const cli = spawnSync(process.execPath, [
    'scripts/run-phase11-staging-canary.mjs',
    '--owner-id', request.ownerUserId,
    '--actor-id', request.actorUserId,
    '--source-event-id', request.sourceEventId,
    '--due-at', request.dueAt,
    '--execute',
  ], {
    cwd: API_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PHASE11_RUNTIME_TARGET: 'staging',
      PHASE11_STAGING_CANARY_EXECUTE: '1',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
  });
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /AUTOMATION_CANARY_STAGING_CONFIG_REQUIRED/);
  assert.doesNotMatch(`${cli.stdout}${cli.stderr}`, /Connected to Supabase database/);
});

test('wrong staging project fails before any Supabase or RPC operation', async () => {
  let calls = 0;
  const canary = createStagingCanary({
    runtimeConfig: { runtimeTarget: 'staging', supabaseUrl: WRONG_URL, supabaseKey: KEY },
    runCanary: async () => { calls += 1; },
  });
  await assert.rejects(canary.admit(request), /AUTOMATION_CANARY_STAGING_TARGET_INVALID/);
  assert.equal(calls, 0);
});

test('correct explicitly injected staging project passes configuration preflight', () => {
  const runtime = resolveStagingCanaryRuntimeConfig({
    runtimeTarget: 'staging', supabaseUrl: STAGING_URL, supabaseKey: KEY,
  });
  assert.equal(runtime.runtimeTarget, 'staging');
  assert.equal(runtime.projectRef, 'ygflbvplksgljlamhbju');
});

test('staging configuration errors never expose URL or service-role values', () => {
  const secret = 'service-role-secret-sentinel';
  const url = 'https://unexpected-production-project.supabase.co/private-path';
  let error;
  try {
    resolveStagingCanaryRuntimeConfig({ runtimeTarget: 'staging', supabaseUrl: url, supabaseKey: secret });
  } catch (caught) { error = caught; }
  assert.match(error?.message || '', /^AUTOMATION_CANARY_STAGING_TARGET_INVALID$/);
  assert.doesNotMatch(String(error), new RegExp(secret));
  assert.doesNotMatch(String(error), new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('prior wrong-project dotenv cannot redirect explicitly injected staging runtime', async () => {
  await withEnvFiles({ '.env': `SUPABASE_URL=${WRONG_URL}\nSUPABASE_SERVICE_ROLE_KEY=wrong-key\n` }, (baseDir) => {
    const target = {
      NODE_ENV: 'development',
      PHASE11_RUNTIME_TARGET: 'staging',
      SUPABASE_URL: STAGING_URL,
      SUPABASE_SERVICE_ROLE_KEY: KEY,
    };
    loadRuntimeEnvironment({ target, baseDir });
    const runtime = resolveStagingCanaryRuntimeConfig({
      runtimeTarget: target.PHASE11_RUNTIME_TARGET,
      supabaseUrl: target.SUPABASE_URL,
      supabaseKey: target.SUPABASE_SERVICE_ROLE_KEY,
    });
    assert.equal(runtime.projectRef, 'ygflbvplksgljlamhbju');
  });
});
