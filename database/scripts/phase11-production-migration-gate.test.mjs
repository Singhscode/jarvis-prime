/**
 * Phase 11 Production Migration Gate – comprehensive test suite.
 *
 * Covers:
 *   - Historical approved migration classification
 *   - Historical unknown migration hard-stop
 *   - Staging-only migration 37 handling
 *   - Later-phase approved migration
 *   - Unknown future migration hard-stop
 *   - Multiple violations
 *   - formatViolation output (never [object Object])
 *   - Zero-violation / non-zero-violation ledger evaluation
 *   - Newly introduced violation code → automatically fails (exit-code test)
 *   - Existing target / TLS / checksum / ordering protections
 *   - db_mode validation (session-pooler ↔ direct)
 */
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  assertProductionTarget,
  evaluateProductionLedger,
  formatViolation,
  loadApprovedMigrations,
  Phase11MigrationGateError,
  PHASE11_PRODUCTION_MIGRATIONS,
  PHASE11_STAGING_ONLY_MIGRATION,
  STAGING_ONLY_RETIRED_NAME,
} from './phase11-production-migration-gate.mjs';
import {
  classifyMigration,
  getLaterPhaseName,
  loadMigrationPolicy,
} from './migration-policy-loader.mjs';

// ─────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────

const projectRef = 'fytnwpnnvqecjmyhrzcx';
const directUrl = `postgresql://postgres:password@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`;
const poolerUrl = `postgresql://postgres.${projectRef}:password@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`;
const stubCa = '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----';

const gateScript = fileURLToPath(new URL('./phase11-production-migration-gate.mjs', import.meta.url));

let policyData;
test.before(async () => {
  policyData = await loadMigrationPolicy();
});

// ─────────────────────────────────────────────────────────────────
// PART 1 — CLASSIFICATION
// ─────────────────────────────────────────────────────────────────

test('Migration classification: Phase 11 predecessors', () => {
  for (const version of policyData.phase11Predecessors) {
    assert.equal(classifyMigration(version, policyData), 'PHASE11_PREDECESSOR');
  }
});

test('Migration classification: Phase 11 required', () => {
  for (const version of policyData.phase11Required) {
    assert.equal(classifyMigration(version, policyData), 'PHASE11_REQUIRED');
  }
});

test('Migration classification: Staging only (37)', () => {
  assert.equal(classifyMigration(policyData.stagingOnlySentinelVersion, policyData), 'STAGING_ONLY');
});

test('Migration classification: Later phase approved', () => {
  // Phase 15
  assert.equal(classifyMigration('20260810000032', policyData), 'LATER_PHASE_APPROVED');
  assert.equal(classifyMigration('20260810000033', policyData), 'LATER_PHASE_APPROVED');
  assert.equal(classifyMigration('20260810000034', policyData), 'LATER_PHASE_APPROVED');
  // Analytics
  assert.equal(classifyMigration('20260810000041', policyData), 'LATER_PHASE_APPROVED');
  assert.equal(classifyMigration('20260810000042', policyData), 'LATER_PHASE_APPROVED');
  assert.equal(classifyMigration('20260810000043', policyData), 'LATER_PHASE_APPROVED');
});

test('Migration classification: Historical approved (pre-Phase-11 baseline)', () => {
  // Earliest foundation migrations
  assert.equal(classifyMigration('20260715000000', policyData), 'HISTORICAL_APPROVED');
  assert.equal(classifyMigration('20260715000001', policyData), 'HISTORICAL_APPROVED');
  // Last historical entry
  assert.equal(classifyMigration('20260810000022', policyData), 'HISTORICAL_APPROVED');
  // Spot-check middle entries
  assert.equal(classifyMigration('20260718000010', policyData), 'HISTORICAL_APPROVED'); // client_portal
  assert.equal(classifyMigration('20260810000020', policyData), 'HISTORICAL_APPROVED'); // client_account_deletion
});

test('Migration classification: Unknown migration', () => {
  assert.equal(classifyMigration('20260810000099', policyData), 'UNKNOWN');
  assert.equal(classifyMigration('19990101000000', policyData), 'UNKNOWN');
});

test('Later phase identification', () => {
  assert.equal(getLaterPhaseName('20260810000032', policyData), 'PHASE15');
  assert.equal(getLaterPhaseName('20260810000041', policyData), 'ANALYTICS');
  assert.equal(getLaterPhaseName('20260810000035', policyData), null);
});

// ─────────────────────────────────────────────────────────────────
// PART 2 — LEDGER EVALUATION
// ─────────────────────────────────────────────────────────────────

test('Ledger: zero violations when only historical migrations present', () => {
  const rows = [
    { version: '20260715000000', name: 'create_outreach_schema', statements: ['BEGIN', 'COMMIT'] },
    { version: '20260810000022', name: 'add_communication_hub', statements: ['BEGIN', 'COMMIT'] },
  ];
  const result = evaluateProductionLedger(rows, PHASE11_PRODUCTION_MIGRATIONS, policyData);
  const histViolations = result.violations.filter(
    (v) => v.version === '20260715000000' || v.version === '20260810000022',
  );
  assert.equal(histViolations.length, 0, 'Historical approved migrations must not produce violations');
});

test('Ledger: unknown pre-Phase-11 migration is a hard-stop', () => {
  // A version that is NOT in the policy — must produce UNKNOWN violation
  const rows = [
    { version: '20260714000000', name: 'mystery_early_migration', statements: ['BEGIN', 'COMMIT'] },
  ];
  const result = evaluateProductionLedger(rows, PHASE11_PRODUCTION_MIGRATIONS, policyData);
  const unknownViolations = result.violations.filter(
    (v) => v.code === 'PHASE11_GATE_UNKNOWN_PRODUCTION_MIGRATION',
  );
  assert.equal(unknownViolations.length, 1);
  assert.equal(unknownViolations[0].version, '20260714000000');
  assert(result.hasViolations);
});

test('Ledger: Clean state (no migrations) — missing predecessors', () => {
  const rows = [];
  const result = evaluateProductionLedger(rows, PHASE11_PRODUCTION_MIGRATIONS, policyData);
  assert(result.violations.length > 0);
  const missingPredecessors = result.violations.filter(
    (v) => v.code === 'PHASE11_GATE_PREDECESSOR_MISSING',
  );
  assert.equal(missingPredecessors.length, 9);
});

test('Ledger: All Phase 11 predecessors present — no predecessor violations', async () => {
  const approvedMigrations = await loadApprovedMigrations();
  const rows = policyData.phase11Predecessors.map((version) => ({
    version,
    name: `migration_${version}`,
    statements: ['BEGIN', 'COMMIT'],
  }));
  const result = evaluateProductionLedger(rows, approvedMigrations, policyData);
  const missingPredecessors = result.violations.filter(
    (v) => v.code === 'PHASE11_GATE_PREDECESSOR_MISSING',
  );
  assert.equal(missingPredecessors.length, 0);
});

test('Ledger: Staging-only migration 37 active — violation', () => {
  const rows = [
    {
      version: '20260810000037',
      name: 'add_phase11_internal_fake_canary',
      statements: ['BEGIN', 'SELECT 1', 'COMMIT'],
    },
  ];
  const result = evaluateProductionLedger(rows, PHASE11_PRODUCTION_MIGRATIONS, policyData);
  const v = result.violations.filter((x) => x.code === 'PHASE11_GATE_STAGING_ONLY_37_PRESENT');
  assert.equal(v.length, 1);
  assert.equal(v[0].version, '20260810000037');
});

test('Ledger: Staging-only migration 37 retired sentinel — no violation', () => {
  const rows = [
    { version: '20260810000037', name: STAGING_ONLY_RETIRED_NAME, statements: [] },
  ];
  const result = evaluateProductionLedger(rows, PHASE11_PRODUCTION_MIGRATIONS, policyData);
  const v = result.violations.filter((x) => x.code === 'PHASE11_GATE_STAGING_ONLY_37_PRESENT');
  assert.equal(v.length, 0);
});

test('Ledger: Later-phase approved migration — no violation', () => {
  const rows = [
    { version: '20260810000041', name: 'add_analytics_schema', statements: ['BEGIN', 'COMMIT'] },
  ];
  const result = evaluateProductionLedger(rows, PHASE11_PRODUCTION_MIGRATIONS, policyData);
  const v = result.violations.filter((x) => x.version === '20260810000041');
  assert.equal(v.length, 0);
});

test('Ledger: Unknown future migration — hard-stop', () => {
  const rows = [
    { version: '20260810000099', name: 'mysterious_migration', statements: ['BEGIN', 'COMMIT'] },
  ];
  const result = evaluateProductionLedger(rows, PHASE11_PRODUCTION_MIGRATIONS, policyData);
  const v = result.violations.filter((x) => x.code === 'PHASE11_GATE_UNKNOWN_PRODUCTION_MIGRATION');
  assert.equal(v.length, 1);
  assert(result.hasViolations);
});

test('Ledger: Multiple violations reported together', () => {
  const rows = [
    { version: '20260810000037', name: 'add_phase11_internal_fake_canary', statements: ['BEGIN', 'SELECT 1'] },
    { version: '20260810000099', name: 'future_mystery', statements: ['BEGIN', 'COMMIT'] },
  ];
  const result = evaluateProductionLedger(rows, PHASE11_PRODUCTION_MIGRATIONS, policyData);
  assert(result.violations.length >= 2, 'Expected at least two violations');
  assert(result.hasViolations);
});

test('Ledger: Duplicate version — hard-stop', () => {
  const rows = [
    { version: '20260810000035', name: 'migration1', statements: ['BEGIN', 'COMMIT'] },
    { version: '20260810000035', name: 'migration1_dup', statements: ['BEGIN', 'COMMIT'] },
  ];
  const result = evaluateProductionLedger(rows, PHASE11_PRODUCTION_MIGRATIONS, policyData);
  const v = result.violations.filter((x) => x.code === 'PHASE11_GATE_LEDGER_INVALID');
  assert(v.length > 0);
});

test('Ledger: Phase 11 required migrations applied in correct order — zero violations', async () => {
  const approvedMigrations = await loadApprovedMigrations();
  const rows = [
    ...policyData.phase11Predecessors.map((version) => ({
      version,
      name: `migration_${version}`,
      statements: ['BEGIN', 'COMMIT'],
    })),
    ...approvedMigrations.map((migration) => ({
      version: migration.version,
      name: migration.name,
      statements: migration.statements,
    })),
  ];
  const result = evaluateProductionLedger(rows, approvedMigrations, policyData);
  assert.equal(result.violations.length, 0);
  assert.equal(result.hasViolations, false);
});

// ─────────────────────────────────────────────────────────────────
// PART 3 — formatViolation: never [object Object]
// ─────────────────────────────────────────────────────────────────

test('formatViolation: full violation object renders with code, version, classification, reason', () => {
  const v = {
    code: 'PHASE11_GATE_UNKNOWN_PRODUCTION_MIGRATION',
    version: '20260714000000',
    classification: 'UNKNOWN',
    reason: 'Unknown production migration not classified in migration policy',
  };
  const line = formatViolation(v);
  assert(line.startsWith('PHASE11_VIOLATION PHASE11_GATE_UNKNOWN_PRODUCTION_MIGRATION'),
    `Expected line to start with code, got: ${line}`);
  assert(line.includes('version=20260714000000'), `Expected version in: ${line}`);
  assert(line.includes('classification=UNKNOWN'), `Expected classification in: ${line}`);
  assert(line.includes('reason='), `Expected reason in: ${line}`);
  assert(!line.includes('[object Object]'), `Must never contain [object Object]: ${line}`);
});

test('formatViolation: violation object without optional fields still renders code', () => {
  const line = formatViolation({ code: 'PHASE11_GATE_ORDERING_INVALID' });
  assert.equal(line, 'PHASE11_VIOLATION PHASE11_GATE_ORDERING_INVALID');
  assert(!line.includes('[object Object]'), `Must never contain [object Object]: ${line}`);
});

test('formatViolation: null/undefined violation renders fallback code not [object Object]', () => {
  const lineNull = formatViolation(null);
  assert(lineNull.includes('PHASE11_GATE_UNKNOWN_VIOLATION'), `Got: ${lineNull}`);
  assert(!lineNull.includes('[object Object]'), `Must never contain [object Object]: ${lineNull}`);

  const lineUndef = formatViolation(undefined);
  assert(lineUndef.includes('PHASE11_GATE_UNKNOWN_VIOLATION'), `Got: ${lineUndef}`);
  assert(!lineUndef.includes('[object Object]'), `Must never contain [object Object]: ${lineUndef}`);
});

test('formatViolation: array of violation objects — none produce [object Object]', () => {
  const violations = [
    { code: 'PHASE11_GATE_PREDECESSOR_MISSING', version: '20260810000023', classification: 'PHASE11_PREDECESSOR', reason: 'Missing' },
    { code: 'PHASE11_GATE_STAGING_ONLY_37_PRESENT', version: '20260810000037', classification: 'STAGING_ONLY', reason: 'Staging-only' },
    { code: 'PHASE11_GATE_UNKNOWN_PRODUCTION_MIGRATION', version: '20260714000000', classification: 'UNKNOWN', reason: 'Unknown' },
  ];
  for (const v of violations) {
    const line = formatViolation(v);
    assert(!line.includes('[object Object]'), `[object Object] found for code=${v.code}: ${line}`);
    assert(line.startsWith(`PHASE11_VIOLATION ${v.code}`), `Expected code first: ${line}`);
  }
});

test('formatViolation: does not print secrets — no DATABASE_URL, password, CA, or token fields', () => {
  const v = {
    code: 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED',
    // Maliciously inject secret-like keys — must not appear in output
    connectionString: 'postgresql://user:PASSWORD@host/db',
    certificateAuthority: '-----BEGIN CERTIFICATE-----\nSECRET\n-----END CERTIFICATE-----',
    password: 'hunter2',
  };
  const line = formatViolation(v);
  assert(!line.includes('PASSWORD'), `Password must not appear in violation output: ${line}`);
  assert(!line.includes('hunter2'), `Password must not appear in violation output: ${line}`);
  assert(!line.includes('BEGIN CERTIFICATE'), `CA PEM must not appear in violation output: ${line}`);
});

// ─────────────────────────────────────────────────────────────────
// PART 4 — EXIT CODE (fail-closed mechanism)
// ─────────────────────────────────────────────────────────────────

function runGate(args, env = {}) {
  try {
    const output = execFileSync(
      process.execPath,
      [gateScript, ...args],
      { env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { exitCode: 0, output };
  } catch (err) {
    return { exitCode: err.status ?? 1, output: (err.stdout ?? '') + (err.stderr ?? '') };
  }
}

test('Gate exit code: missing DATABASE_URL exits non-zero (fail-closed)', () => {
  const { exitCode, output } = runGate(['--inspect'], {
    PHASE11_PRODUCTION_DATABASE_URL: '',
    PHASE11_PRODUCTION_PROJECT_REF: projectRef,
    PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
  });
  assert.notEqual(exitCode, 0, 'Gate must exit non-zero when DATABASE_URL is missing');
  assert(
    output.includes('PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED'),
    `Expected target-unverified code, got: ${output}`,
  );
});

test('Gate exit code: --describe always exits 0 (read-only boundary description)', () => {
  const { exitCode } = runGate(['--describe'], {});
  assert.equal(exitCode, 0);
});

// ─────────────────────────────────────────────────────────────────
// PART 5 — TARGET VALIDATION (db_mode ↔ URL consistency)
// ─────────────────────────────────────────────────────────────────

test('Target validation: Session Pooler URL + session-pooler mode = accepted', () => {
  const result = assertProductionTarget({
    PHASE11_PRODUCTION_DATABASE_URL: poolerUrl,
    PHASE11_PRODUCTION_PROJECT_REF: projectRef,
    PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
    PHASE11_PRODUCTION_DATABASE_CA_PEM: stubCa,
  });
  assert.equal(result.dbMode, 'session-pooler');
  assert(result.connectionString.includes('pooler.supabase.com'));
});

test('Target validation: Direct URL + direct mode = accepted', () => {
  const result = assertProductionTarget({
    PHASE11_PRODUCTION_DATABASE_URL: directUrl,
    PHASE11_PRODUCTION_PROJECT_REF: projectRef,
    PHASE11_PRODUCTION_DB_MODE: 'direct',
    PHASE11_PRODUCTION_DATABASE_CA_PEM: stubCa,
  });
  assert.equal(result.dbMode, 'direct');
  assert(result.connectionString.includes(`db.${projectRef}`));
});

test('Target validation: Session Pooler URL + direct mode = rejected', () => {
  assert.throws(
    () =>
      assertProductionTarget({
        PHASE11_PRODUCTION_DATABASE_URL: poolerUrl,
        PHASE11_PRODUCTION_PROJECT_REF: projectRef,
        PHASE11_PRODUCTION_DB_MODE: 'direct',
        PHASE11_PRODUCTION_DATABASE_CA_PEM: stubCa,
      }),
    (err) =>
      err instanceof Phase11MigrationGateError &&
      err.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED',
    'Session Pooler URL must be rejected with direct mode',
  );
});

test('Target validation: Direct URL + session-pooler mode = rejected', () => {
  assert.throws(
    () =>
      assertProductionTarget({
        PHASE11_PRODUCTION_DATABASE_URL: directUrl,
        PHASE11_PRODUCTION_PROJECT_REF: projectRef,
        PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
        PHASE11_PRODUCTION_DATABASE_CA_PEM: stubCa,
      }),
    (err) =>
      err instanceof Phase11MigrationGateError &&
      err.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED',
    'Direct URL must be rejected with session-pooler mode',
  );
});

test('Target validation: Missing connection string = rejected', () => {
  assert.throws(
    () =>
      assertProductionTarget({
        PHASE11_PRODUCTION_DATABASE_URL: '',
        PHASE11_PRODUCTION_PROJECT_REF: projectRef,
        PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
      }),
    (err) =>
      err instanceof Phase11MigrationGateError &&
      err.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED',
  );
});

test('Target validation: Wrong project ref in pooler username = rejected', () => {
  const wrongPoolerUrl = `postgresql://postgres.wrongref:password@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`;
  assert.throws(
    () =>
      assertProductionTarget({
        PHASE11_PRODUCTION_DATABASE_URL: wrongPoolerUrl,
        PHASE11_PRODUCTION_PROJECT_REF: projectRef,
        PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
      }),
    (err) =>
      err instanceof Phase11MigrationGateError &&
      err.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED',
    'Wrong project ref in pooler username must be rejected',
  );
});

// ─────────────────────────────────────────────────────────────────
// PART 6 — POLICY STRUCTURE
// ─────────────────────────────────────────────────────────────────

test('Policy structure: required top-level fields present', () => {
  assert(policyData.policy.policyVersion);
  assert(Array.isArray(policyData.phase11Predecessors));
  assert(Array.isArray(policyData.phase11Required));
  assert.equal(policyData.stagingOnlySentinelVersion, '20260810000037');
  assert.equal(policyData.stagingOnlySentinelName, STAGING_ONLY_RETIRED_NAME);
  assert(policyData.allApprovedMigrations instanceof Set);
  assert(policyData.stagingOnlyMigrations instanceof Set);
  assert(policyData.historicalApprovedVersions instanceof Set);
});

test('Policy structure: 27 historical migrations registered', () => {
  assert.equal(policyData.historicalApprovedVersions.size, 27);
});

test('Policy structure: all historical versions are in allApprovedMigrations', () => {
  for (const version of policyData.historicalApprovedVersions) {
    assert(
      policyData.allApprovedMigrations.has(version),
      `Historical version ${version} missing from allProductionApprovedMigrations`,
    );
  }
});

test('Policy structure: Phase 11 predecessors are in allApprovedMigrations', () => {
  for (const version of policyData.phase11Predecessors) {
    assert(policyData.allApprovedMigrations.has(version), `${version} missing from allApprovedMigrations`);
  }
});

test('Policy structure: Phase 11 required are in allApprovedMigrations', () => {
  for (const version of policyData.phase11Required) {
    assert(policyData.allApprovedMigrations.has(version), `${version} missing from allApprovedMigrations`);
  }
});

test('Policy structure: staging-only migration 37 NOT in allApprovedMigrations', () => {
  assert(!policyData.allApprovedMigrations.has('20260810000037'));
});

test('Policy structure: no overlap between historical and phase11 predecessors', () => {
  for (const version of policyData.historicalApprovedVersions) {
    assert(
      !policyData.phase11Predecessors.includes(version),
      `Version ${version} appears in both historical and phase11Predecessors`,
    );
  }
});
