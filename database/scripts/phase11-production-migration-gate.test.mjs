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
  ADVISORY_LOCK_SQL,
  assertProductionTarget,
  evaluateProductionLedger,
  formatViolation,
  LEDGER_INSERT_SQL,
  LEDGER_SELECT_SQL,
  loadApprovedMigrations,
  Phase11MigrationGateError,
  PHASE11_PRODUCTION_MIGRATIONS,
  PHASE11_STAGING_ONLY_MIGRATION,
  runPhase11ProductionMigrationGate,
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

// ─────────────────────────────────────────────────────────────────
// PART 7 — PENDING DISCOVERY AND THE APPLY DRIVER
//
// Regression coverage for the latent defect where the apply driver iterated
// `report.pending` while evaluateProductionLedger never produced that field,
// making `--apply` throw before it could execute anything.
//
// Every test here uses an in-memory stub client. No production credential, real
// connection string, or CA is used; the fixtures above are structurally valid
// fakes that only satisfy assertProductionTarget's shape checks.
// ─────────────────────────────────────────────────────────────────

const PHASE11_APPLY_ORDER = ['20260810000035', '20260810000036', '20260810000038', '20260810000039', '20260810000040'];

function phase11ProductionEnvironment(overrides = {}) {
  return {
    PHASE11_PRODUCTION_DATABASE_URL: directUrl,
    PHASE11_PRODUCTION_PROJECT_REF: projectRef,
    PHASE11_PRODUCTION_DB_MODE: 'direct',
    ...overrides,
  };
}

/** Ledger containing every Phase 11 predecessor and nothing else. */
function predecessorOnlyRows() {
  return policyData.phase11Predecessors.map((version) => ({
    version,
    name: `migration_${version}`,
    statements: ['BEGIN', 'COMMIT'],
  }));
}

function appliedRow(migration) {
  return { version: migration.version, name: migration.name, statements: [...migration.statements] };
}

function createStubClient({ rows = [] } = {}) {
  const ledger = rows.map((row) => ({ ...row }));
  const queries = [];
  return {
    queries,
    ledger,
    get inserts() {
      return queries.filter((entry) => entry.sql === LEDGER_INSERT_SQL);
    },
    get lockAcquired() {
      return queries.some((entry) => entry.sql === ADVISORY_LOCK_SQL);
    },
    async connect() {},
    async end() {},
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql === LEDGER_SELECT_SQL) {
        return { rows: ledger.map((row) => ({ ...row, statements: [...row.statements] })) };
      }
      if (sql === LEDGER_INSERT_SQL) {
        ledger.push({ version: params[0], name: params[1], statements: [...params[2]] });
        return { rows: [] };
      }
      return { rows: [{}] };
    },
  };
}

test('Pending: report exposes a pending collection (regression — was undefined)', async () => {
  const approvedMigrations = await loadApprovedMigrations();
  const report = evaluateProductionLedger(predecessorOnlyRows(), approvedMigrations, policyData);
  assert(Array.isArray(report.pending), 'report.pending must be an array, not undefined');
});

test('Pending: all five Phase 11 migrations pending, in allowlist order', async () => {
  const approvedMigrations = await loadApprovedMigrations();
  const report = evaluateProductionLedger(predecessorOnlyRows(), approvedMigrations, policyData);
  assert.equal(report.violations.length, 0);
  assert.deepEqual(report.pending.map((migration) => migration.version), PHASE11_APPLY_ORDER);
});

test('Pending: already-applied migrations are excluded', async () => {
  const approvedMigrations = await loadApprovedMigrations();
  const rows = [...predecessorOnlyRows(), appliedRow(approvedMigrations[0]), appliedRow(approvedMigrations[1])];
  const report = evaluateProductionLedger(rows, approvedMigrations, policyData);
  assert.equal(report.violations.length, 0);
  assert.deepEqual(report.pending.map((migration) => migration.version), PHASE11_APPLY_ORDER.slice(2));
});

test('Pending: empty when every Phase 11 migration is applied', async () => {
  const approvedMigrations = await loadApprovedMigrations();
  const rows = [...predecessorOnlyRows(), ...approvedMigrations.map(appliedRow)];
  const report = evaluateProductionLedger(rows, approvedMigrations, policyData);
  assert.equal(report.violations.length, 0);
  assert.equal(report.pending.length, 0);
});

test('Pending: entries are full migration objects carrying statements to execute', async () => {
  const approvedMigrations = await loadApprovedMigrations();
  const report = evaluateProductionLedger(predecessorOnlyRows(), approvedMigrations, policyData);
  for (const migration of report.pending) {
    assert(Array.isArray(migration.statements) && migration.statements.length > 1);
    assert.equal(typeof migration.name, 'string');
    assert.match(migration.sha256, /^[0-9a-f]{64}$/);
  }
});

test('Apply driver: reaches applyOneMigration and applies 35 → 36 → 38 → 39 → 40 in order', async () => {
  const approvedMigrations = await loadApprovedMigrations();
  const client = createStubClient({ rows: predecessorOnlyRows() });
  const result = await runPhase11ProductionMigrationGate({
    operation: 'apply',
    environment: phase11ProductionEnvironment(),
    clientFactory: async () => client,
  });

  assert.equal(result.stopped, false);
  assert.deepEqual(result.applied, PHASE11_APPLY_ORDER);
  assert.equal(client.inserts.length, 5);
  assert.deepEqual(client.inserts.map((insert) => insert.params[0]), PHASE11_APPLY_ORDER);

  // Proof the migration bodies ran, not just the ledger rows.
  const executed = client.queries.map((entry) => entry.sql);
  for (const statement of approvedMigrations[0].statements.slice(0, -1)) {
    assert(executed.includes(statement), `Expected statement to be executed: ${statement.slice(0, 60)}`);
  }
  assert(client.lockAcquired, 'apply must acquire the advisory lock');
});

test('Apply driver: each ledger insert commits with its migration (insert immediately precedes COMMIT)', async () => {
  const client = createStubClient({ rows: predecessorOnlyRows() });
  await runPhase11ProductionMigrationGate({
    operation: 'apply',
    environment: phase11ProductionEnvironment(),
    clientFactory: async () => client,
  });
  const executed = client.queries.map((entry) => entry.sql);
  for (let index = 0; index < executed.length; index += 1) {
    if (executed[index] === LEDGER_INSERT_SQL) {
      assert.equal(executed[index + 1], 'COMMIT', 'ledger insert must be the last statement before COMMIT');
    }
  }
});

test('Apply driver: no mutation when nothing is pending (read-only outcome)', async () => {
  const approvedMigrations = await loadApprovedMigrations();
  const rows = [...predecessorOnlyRows(), ...approvedMigrations.map(appliedRow)];
  const client = createStubClient({ rows });
  const result = await runPhase11ProductionMigrationGate({
    operation: 'apply',
    environment: phase11ProductionEnvironment(),
    clientFactory: async () => client,
  });

  assert.equal(result.stopped, false);
  assert.deepEqual(result.applied, []);
  assert.equal(client.inserts.length, 0, 'an empty pending set must produce no ledger write');
});

test('Apply driver: no mutation when preflight reports violations', async () => {
  const rows = [...predecessorOnlyRows(), { version: '20260810000099', name: 'mystery', statements: ['BEGIN', 'COMMIT'] }];
  const client = createStubClient({ rows });
  const result = await runPhase11ProductionMigrationGate({
    operation: 'apply',
    environment: phase11ProductionEnvironment(),
    clientFactory: async () => client,
  });

  assert.equal(result.stopped, true);
  assert.deepEqual(result.applied, []);
  assert.equal(client.inserts.length, 0);
  assert.equal(client.lockAcquired, false, 'a violating preflight must not take the advisory lock');
});

test('Apply driver: missing predecessor blocks apply with no mutation', async () => {
  const rows = predecessorOnlyRows().slice(1);
  const client = createStubClient({ rows });
  const result = await runPhase11ProductionMigrationGate({
    operation: 'apply',
    environment: phase11ProductionEnvironment(),
    clientFactory: async () => client,
  });
  assert.equal(result.stopped, true);
  assert.equal(client.inserts.length, 0);
  assert.equal(client.lockAcquired, false);
});

test('Inspect mode: read-only — no advisory lock, no write', async () => {
  const client = createStubClient({ rows: predecessorOnlyRows() });
  const result = await runPhase11ProductionMigrationGate({
    operation: 'inspect',
    environment: phase11ProductionEnvironment(),
    clientFactory: async () => client,
  });
  assert.deepEqual(result.applied, []);
  assert.equal(client.inserts.length, 0);
  assert.equal(client.lockAcquired, false);
  assert(client.queries.some((entry) => entry.sql === 'BEGIN READ ONLY'));
});

// ─────────────────────────────────────────────────────────────────
// PART 8 — PHASE 11 BOUNDARY IS UNCHANGED
//
// These assertions pin the Phase 11 apply set so that adding a later-phase
// migration path can never silently widen it.
// ─────────────────────────────────────────────────────────────────

test('Boundary: Phase 11 apply set is exactly 35, 36, 38, 39, 40', () => {
  assert.deepEqual(PHASE11_PRODUCTION_MIGRATIONS.map((migration) => migration.version), PHASE11_APPLY_ORDER);
});

test('Boundary: Phase 11 apply set excludes migration 37 and every later-phase migration', () => {
  const versions = new Set(PHASE11_PRODUCTION_MIGRATIONS.map((migration) => migration.version));
  assert(!versions.has('20260810000037'), 'staging-only 37 must never be in the Phase 11 apply set');
  for (const version of ['20260810000041', '20260810000042', '20260810000043']) {
    assert(!versions.has(version), `later-phase migration ${version} must not be in the Phase 11 apply set`);
  }
  assert.equal(PHASE11_STAGING_ONLY_MIGRATION.version, '20260810000037');
});

test('Boundary: every Phase 11 apply-set entry remains content-pinned by SHA-256', () => {
  for (const migration of PHASE11_PRODUCTION_MIGRATIONS) {
    assert.match(migration.sha256, /^[0-9a-f]{64}$/);
    assert(migration.file.startsWith(migration.version));
  }
});

test('Boundary: Phase 11 evaluation still reports phase11States for its own set only', async () => {
  const approvedMigrations = await loadApprovedMigrations();
  const report = evaluateProductionLedger(predecessorOnlyRows(), approvedMigrations, policyData);
  assert.deepEqual(report.phase11States.map((state) => state.version), PHASE11_APPLY_ORDER);
  for (const state of report.phase11States) {
    assert.equal(state.classification, 'PHASE11_REQUIRED');
  }
});
