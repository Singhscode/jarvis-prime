import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  evaluateProductionTarget,
  formatProductionTargetDiagnostic,
} from './validate-phase11-production-target.mjs';

const projectRef = 'fytnwpnnvqecjmyhrzcx';
const directTarget = `postgresql://diagnostic-user:diagnostic-password@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`;
const diagnosticScript = fileURLToPath(new URL('./validate-phase11-production-target.mjs', import.meta.url));

function evaluate(connectionString, configuredProjectRef = projectRef) {
  return evaluateProductionTarget({ connectionString, projectRef: configuredProjectRef });
}

test('accepts only the expected direct TLS-verified PostgreSQL target', () => {
  const result = evaluate(directTarget);
  assert.deepEqual(result, {
    secretPresent: true,
    scheme: true,
    host: true,
    port: true,
    sslmode: true,
    projectRef: true,
    poolerEndpoint: false,
    overallTarget: true,
  });
  assert.equal(formatProductionTargetDiagnostic(result), [
    'SECRET_PRESENT: YES',
    'SCHEME: PASS',
    'HOST: PASS',
    'PORT: PASS',
    'SSLMODE: PASS',
    'PROJECT_REF: PASS',
    'POOLER_ENDPOINT: NO',
    'OVERALL_TARGET: PASS',
  ].join('\n'));
});

test('fails closed when the secret is absent or malformed', () => {
  const absent = evaluate('');
  assert.equal(absent.secretPresent, false);
  assert.equal(absent.overallTarget, false);

  const malformed = evaluate('not a URL');
  assert.equal(malformed.secretPresent, true);
  assert.equal(malformed.scheme, false);
  assert.equal(malformed.host, false);
  assert.equal(malformed.port, false);
  assert.equal(malformed.sslmode, false);
  assert.equal(malformed.overallTarget, false);
});

test('rejects each target mismatch without exposing a URL component', () => {
  assert.equal(evaluate(directTarget.replace('postgresql:', 'postgres:')).scheme, false);
  assert.equal(evaluate(directTarget.replace(`db.${projectRef}.supabase.co`, 'db.other-project.supabase.co')).host, false);
  assert.equal(evaluate(directTarget.replace(':5432/', ':6543/')).port, false);
  assert.equal(evaluate(directTarget.replace('sslmode=verify-full', 'sslmode=require')).sslmode, false);
  assert.equal(evaluate(directTarget, 'otherprojectref').projectRef, false);
});

test('identifies and rejects a Supabase pooler endpoint', () => {
  const pooler = `postgresql://diagnostic-user:diagnostic-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`;
  const result = evaluate(pooler);
  assert.equal(result.poolerEndpoint, true);
  assert.equal(result.host, false);
  assert.equal(result.overallTarget, false);
});

test('CLI emits fixed statuses without emitting the supplied URL', () => {
  const result = spawnSync(process.execPath, [diagnosticScript], {
    encoding: 'utf8',
    env: {
      PHASE11_PRODUCTION_DATABASE_URL: directTarget,
      PHASE11_PRODUCTION_PROJECT_REF: projectRef,
    },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, `${formatProductionTargetDiagnostic(evaluate(directTarget))}\n`);
  assert.equal(`${result.stdout}${result.stderr}`.includes(directTarget), false);
});
