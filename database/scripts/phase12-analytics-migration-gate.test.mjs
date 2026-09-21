/**
 * Phase 12 Analytics Production Migration — test suite.
 *
 * Every test runs against an in-memory stub PostgreSQL client. No production
 * credential, real connection string, or CA is used anywhere in this file; the
 * connection strings below are structurally valid fakes that exist only to
 * satisfy assertProductionTarget's shape checks.
 *
 * Covers:
 *   - pending migration discovery (derived from the hash-pinned apply set)
 *   - apply-driver execution path actually reaching applyOneMigration
 *   - migration 43 allowlist + SHA-256 + transaction-boundary validation
 *   - confirmation-token validation
 *   - Phase 12 post-apply ledger verification (independent of phase11States)
 *   - unknown / unapproved migration hard-stop
 *   - no mutation when preflight reports violations
 *   - idempotency
 */
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  ADVISORY_LOCK_SQL,
  LEDGER_INSERT_SQL,
  LEDGER_SELECT_SQL,
  Phase11MigrationGateError,
} from './phase11-production-migration-gate.mjs';
import {
  assertPhase12Confirmation,
  assertPhase12PolicyApproval,
  derivePhase12Predecessors,
  describePhase12Migrations,
  evaluatePhase12AnalyticsLedger,
  formatPhase12Violation,
  loadPhase12ApprovedMigrations,
  PHASE12_ANALYTICS_CLASSIFICATION,
  PHASE12_ANALYTICS_CONFIRMATION_TOKENS,
  PHASE12_ANALYTICS_PHASE_NAME,
  PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS,
  Phase12MigrationGateError,
  runPhase12AnalyticsMigrationGate,
  verifyPhase12Applied,
} from './phase12-analytics-migration-gate.mjs';
import { loadMigrationPolicy } from './migration-policy-loader.mjs';

// ─────────────────────────────────────────────────────────────────
// Fixtures — all values are fakes; nothing here touches production.
// ─────────────────────────────────────────────────────────────────

const MIGRATION_43 = '20260810000043';
const projectRef = 'fytnwpnnvqecjmyhrzcx';
const directUrl = `postgresql://postgres:password@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`;
const gateScript = fileURLToPath(new URL('./phase12-analytics-migration-gate.mjs', import.meta.url));

function productionEnvironment(overrides = {}) {
  return {
    PHASE11_PRODUCTION_DATABASE_URL: directUrl,
    PHASE11_PRODUCTION_PROJECT_REF: projectRef,
    PHASE11_PRODUCTION_DB_MODE: 'direct',
    PHASE12_ANALYTICS_CONFIRM: PHASE12_ANALYTICS_CONFIRMATION_TOKENS.apply,
    ...overrides,
  };
}

let policyData;
let approvedMigrations;
test.before(async () => {
  policyData = await loadMigrationPolicy();
  approvedMigrations = await loadPhase12ApprovedMigrations();
});

/** A ledger in which Phase 11 is complete and ANALYTICS 41/42 are applied. */
function healthyLedgerRows() {
  return [
    ...policyData.phase11Required.map((version) => ({
      version,
      name: `phase11_${version}`,
      statements: ['BEGIN', 'COMMIT'],
    })),
    ...derivePhase12Predecessors(policyData).map((version) => ({
      version,
      name: `analytics_${version}`,
      statements: ['BEGIN', 'COMMIT'],
    })),
  ];
}

function appliedRowFor(migration) {
  return { version: migration.version, name: migration.name, statements: [...migration.statements] };
}

/**
 * In-memory stand-in for a pg Client. Records every statement so tests can prove
 * exactly what was and was not executed.
 */
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

function runGateCli(args, env = {}) {
  try {
    const output = execFileSync(process.execPath, [gateScript, ...args], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, output };
  } catch (error) {
    return { exitCode: error.status ?? 1, output: (error.stdout ?? '') + (error.stderr ?? '') };
  }
}

// ─────────────────────────────────────────────────────────────────
// PART 1 — ALLOWLIST / HASH / BOUNDARY VALIDATION
// ─────────────────────────────────────────────────────────────────

test('Allowlist: contains exactly migration 43 and nothing else', () => {
  assert.equal(PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS.length, 1);
  const [migration] = PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS;
  assert.equal(migration.version, MIGRATION_43);
  assert.equal(migration.file, '20260810000043_fix_analytics_rpc_bigint_cast.sql');
  assert.equal(migration.phase, PHASE12_ANALYTICS_PHASE_NAME);
  assert.equal(migration.classification, PHASE12_ANALYTICS_CLASSIFICATION);
  assert.match(migration.sha256, /^[0-9a-f]{64}$/);
});

test('Allowlist: does NOT contain any Phase 11 migration', () => {
  const phase11 = new Set(['20260810000035', '20260810000036', '20260810000038', '20260810000039', '20260810000040']);
  for (const migration of PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS) {
    assert(!phase11.has(migration.version), `Phase 11 migration ${migration.version} must not be in the Phase 12 apply set`);
  }
});

test('Hash validation: on-disk migration 43 matches the pinned SHA-256', async () => {
  const [migration] = await loadPhase12ApprovedMigrations();
  assert.equal(migration.version, MIGRATION_43);
  assert.equal(migration.name, 'fix_analytics_rpc_bigint_cast');
  assert(migration.statements.length > 1);
});

test('Hash validation: a tampered pin fails closed with SOURCE_HASH_MISMATCH', async () => {
  const tampered = [{ ...PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS[0], sha256: '0'.repeat(64) }];
  await assert.rejects(
    () => loadPhase12ApprovedMigrations(undefined, tampered),
    (error) => error instanceof Phase12MigrationGateError && error.code === 'PHASE12_GATE_SOURCE_HASH_MISMATCH',
  );
});

test('Hash validation: a missing file fails closed rather than skipping', async () => {
  const missing = [{ ...PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS[0], file: '20260810000043_does_not_exist.sql' }];
  await assert.rejects(() => loadPhase12ApprovedMigrations(undefined, missing));
});

test('Transaction boundary: migration 43 is transaction bounded (BEGIN … COMMIT)', async () => {
  const [migration] = await loadPhase12ApprovedMigrations();
  assert.match(migration.statements.at(0), /\bBEGIN$/);
  assert.equal(migration.statements.at(-1), 'COMMIT');
});

test('Policy cross-check: migration 43 must be policy-approved under ANALYTICS', () => {
  assert.equal(assertPhase12PolicyApproval(policyData), true);
});

test('Policy cross-check: an unregistered version fails closed', () => {
  const rogue = [{ ...PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS[0], version: '20260810000099' }];
  assert.throws(
    () => assertPhase12PolicyApproval(policyData, rogue),
    (error) => error instanceof Phase12MigrationGateError
      && error.code === 'PHASE12_GATE_MIGRATION_NOT_POLICY_APPROVED',
  );
});

test('Policy cross-check: a version registered under a different phase fails closed', () => {
  // 20260810000032 is registered under PHASE15, not ANALYTICS.
  const wrongPhase = [{ ...PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS[0], version: '20260810000032' }];
  assert.throws(
    () => assertPhase12PolicyApproval(policyData, wrongPhase),
    (error) => error instanceof Phase12MigrationGateError
      && error.code === 'PHASE12_GATE_MIGRATION_PHASE_MISMATCH',
  );
});

test('Predecessors: derived from policy as ANALYTICS 41 and 42', () => {
  assert.deepEqual(derivePhase12Predecessors(policyData), ['20260810000041', '20260810000042']);
});

// ─────────────────────────────────────────────────────────────────
// PART 2 — CONFIRMATION TOKEN VALIDATION
// ─────────────────────────────────────────────────────────────────

test('Confirmation: apply requires the exact APPLY_PHASE12_ANALYTICS_43 token', () => {
  assert.equal(PHASE12_ANALYTICS_CONFIRMATION_TOKENS.apply, 'APPLY_PHASE12_ANALYTICS_43');
  assert.equal(
    assertPhase12Confirmation('apply', { PHASE12_ANALYTICS_CONFIRM: 'APPLY_PHASE12_ANALYTICS_43' }),
    'APPLY_PHASE12_ANALYTICS_43',
  );
});

test('Confirmation: apply with a read-only token fails closed', () => {
  assert.throws(
    () => assertPhase12Confirmation('apply', { PHASE12_ANALYTICS_CONFIRM: 'INSPECT_ONLY' }),
    (error) => error instanceof Phase12MigrationGateError && error.code === 'PHASE12_GATE_CONFIRMATION_REQUIRED',
  );
});

test('Confirmation: apply with the Phase 11 token fails closed', () => {
  assert.throws(
    () => assertPhase12Confirmation('apply', { PHASE12_ANALYTICS_CONFIRM: 'APPLY_FULL_35_THROUGH_40' }),
    (error) => error instanceof Phase12MigrationGateError && error.code === 'PHASE12_GATE_CONFIRMATION_REQUIRED',
  );
});

test('Confirmation: missing token fails closed', () => {
  assert.throws(
    () => assertPhase12Confirmation('apply', {}),
    (error) => error instanceof Phase12MigrationGateError && error.code === 'PHASE12_GATE_CONFIRMATION_REQUIRED',
  );
});

test('Confirmation: an unsupported operation fails closed', () => {
  assert.throws(
    () => assertPhase12Confirmation('destroy', { PHASE12_ANALYTICS_CONFIRM: 'anything' }),
    (error) => error instanceof Phase12MigrationGateError && error.code === 'PHASE12_GATE_OPERATION_REQUIRED',
  );
});

test('Confirmation: token is validated before any production target resolution', async () => {
  // No database URL at all. If confirmation were checked second, this would raise
  // the target error instead.
  await assert.rejects(
    () => runPhase12AnalyticsMigrationGate({
      operation: 'apply',
      environment: { PHASE12_ANALYTICS_CONFIRM: 'wrong' },
      clientFactory: () => { throw new Error('must never connect'); },
    }),
    (error) => error instanceof Phase12MigrationGateError && error.code === 'PHASE12_GATE_CONFIRMATION_REQUIRED',
  );
});

// ─────────────────────────────────────────────────────────────────
// PART 3 — PENDING DISCOVERY
// ─────────────────────────────────────────────────────────────────

test('Pending discovery: migration 43 absent from ledger is pending', () => {
  const report = evaluatePhase12AnalyticsLedger(healthyLedgerRows(), approvedMigrations, policyData);
  assert.equal(report.violations.length, 0, formatPhase12Violation(report.violations[0]));
  assert.equal(report.pending.length, 1);
  assert.equal(report.pending[0].version, MIGRATION_43);
  assert.deepEqual(report.phase12States, [
    { version: MIGRATION_43, classification: PHASE12_ANALYTICS_CLASSIFICATION, status: 'pending' },
  ]);
});

test('Pending discovery: migration 43 already applied yields an empty pending set', () => {
  const rows = [...healthyLedgerRows(), appliedRowFor(approvedMigrations[0])];
  const report = evaluatePhase12AnalyticsLedger(rows, approvedMigrations, policyData);
  assert.equal(report.violations.length, 0);
  assert.equal(report.pending.length, 0);
  assert.equal(report.phase12States[0].status, 'applied');
});

test('Pending discovery: pending is derived from the apply set, never from the ledger', () => {
  // An unrelated approved later-phase migration is missing from the ledger; it must
  // never appear as something this runner would execute.
  const rows = healthyLedgerRows().filter((row) => row.version !== '20260810000041');
  const report = evaluatePhase12AnalyticsLedger(rows, approvedMigrations, policyData);
  for (const migration of report.pending) {
    assert.equal(migration.version, MIGRATION_43);
  }
});

test('Pending discovery: checksum mismatch blocks apply and is not pending', () => {
  const rows = [
    ...healthyLedgerRows(),
    { version: MIGRATION_43, name: 'fix_analytics_rpc_bigint_cast', statements: ['BEGIN', 'SELECT 1', 'COMMIT'] },
  ];
  const report = evaluatePhase12AnalyticsLedger(rows, approvedMigrations, policyData);
  const mismatch = report.violations.filter((v) => v.code === 'PHASE12_GATE_LEDGER_CHECKSUM_MISMATCH');
  assert.equal(mismatch.length, 1);
  assert.equal(report.pending.length, 0);
  assert.equal(report.phase12States[0].status, 'checksum-mismatch');
});

// ─────────────────────────────────────────────────────────────────
// PART 4 — FAIL-CLOSED LEDGER GUARDS
// ─────────────────────────────────────────────────────────────────

test('Hard-stop: unknown production migration', () => {
  const rows = [...healthyLedgerRows(), { version: '20260810000099', name: 'mystery', statements: ['BEGIN', 'COMMIT'] }];
  const report = evaluatePhase12AnalyticsLedger(rows, approvedMigrations, policyData);
  const unknown = report.violations.filter((v) => v.code === 'PHASE12_GATE_UNKNOWN_PRODUCTION_MIGRATION');
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].version, '20260810000099');
  assert(report.hasViolations);
});

test('Hard-stop: active staging-only migration 37', () => {
  const rows = [
    ...healthyLedgerRows(),
    { version: '20260810000037', name: 'add_phase11_internal_fake_canary', statements: ['BEGIN', 'SELECT 1', 'COMMIT'] },
  ];
  const report = evaluatePhase12AnalyticsLedger(rows, approvedMigrations, policyData);
  const staging = report.violations.filter((v) => v.code === 'PHASE12_GATE_STAGING_ONLY_37_PRESENT');
  assert.equal(staging.length, 1);
});

test('Retired sentinel 37 is accepted without violation', () => {
  const rows = [
    ...healthyLedgerRows(),
    { version: '20260810000037', name: policyData.stagingOnlySentinelName, statements: [] },
  ];
  const report = evaluatePhase12AnalyticsLedger(rows, approvedMigrations, policyData);
  assert.equal(report.violations.length, 0);
});

test('Hard-stop: Phase 11 incomplete blocks a Phase 12 delivery', () => {
  const rows = healthyLedgerRows().filter((row) => row.version !== '20260810000040');
  const report = evaluatePhase12AnalyticsLedger(rows, approvedMigrations, policyData);
  const incomplete = report.violations.filter((v) => v.code === 'PHASE12_GATE_PHASE11_INCOMPLETE');
  assert.equal(incomplete.length, 1);
  assert.equal(incomplete[0].version, '20260810000040');
});

test('Hard-stop: missing ANALYTICS predecessor 42 blocks apply', () => {
  const rows = healthyLedgerRows().filter((row) => row.version !== '20260810000042');
  const report = evaluatePhase12AnalyticsLedger(rows, approvedMigrations, policyData);
  const missing = report.violations.filter((v) => v.code === 'PHASE12_GATE_PREDECESSOR_MISSING');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].version, '20260810000042');
});

test('Hard-stop: duplicate ledger version', () => {
  const rows = [...healthyLedgerRows(), ...healthyLedgerRows().slice(0, 1)];
  const report = evaluatePhase12AnalyticsLedger(rows, approvedMigrations, policyData);
  assert(report.violations.some((v) => v.code === 'PHASE12_GATE_LEDGER_INVALID'));
});

test('Violation formatting never leaks secrets or prints [object Object]', () => {
  const line = formatPhase12Violation({
    code: 'PHASE12_GATE_UNKNOWN_PRODUCTION_MIGRATION',
    version: '20260810000099',
    classification: 'UNKNOWN',
    reason: 'Unknown production migration not classified in migration policy',
    connectionString: 'postgresql://user:PASSWORD@host/db',
    certificateAuthority: '-----BEGIN CERTIFICATE-----SECRET',
    password: 'hunter2',
  });
  assert(line.startsWith('PHASE12_VIOLATION PHASE12_GATE_UNKNOWN_PRODUCTION_MIGRATION'));
  assert(!line.includes('[object Object]'));
  assert(!line.includes('PASSWORD'));
  assert(!line.includes('hunter2'));
  assert(!line.includes('BEGIN CERTIFICATE'));
  assert.equal(formatPhase12Violation(null), 'PHASE12_VIOLATION PHASE12_GATE_UNKNOWN_VIOLATION');
});

// ─────────────────────────────────────────────────────────────────
// PART 5 — APPLY DRIVER EXECUTION PATH
// ─────────────────────────────────────────────────────────────────

test('Apply driver: reaches applyOneMigration and records migration 43 atomically', async () => {
  const client = createStubClient({ rows: healthyLedgerRows() });
  const result = await runPhase12AnalyticsMigrationGate({
    operation: 'apply',
    environment: productionEnvironment(),
    clientFactory: async () => client,
  });

  assert.equal(result.stopped, false);
  assert.deepEqual(result.applied, [MIGRATION_43]);

  // Proof the driver actually executed the migration body, not just the ledger row.
  const executed = client.queries.map((entry) => entry.sql);
  for (const statement of approvedMigrations[0].statements.slice(0, -1)) {
    assert(executed.includes(statement), `Expected migration statement to be executed: ${statement.slice(0, 60)}`);
  }

  // Exactly one ledger insert, carrying the approved version/name/statements.
  assert.equal(client.inserts.length, 1);
  const [version, name, statements] = client.inserts[0].params;
  assert.equal(version, MIGRATION_43);
  assert.equal(name, 'fix_analytics_rpc_bigint_cast');
  assert.deepEqual(statements, approvedMigrations[0].statements);

  // The ledger row is inserted before the migration's own COMMIT, so the schema
  // change and its record commit together.
  const insertIndex = executed.indexOf(LEDGER_INSERT_SQL);
  assert.equal(executed.at(insertIndex + 1), 'COMMIT');

  // Advisory lock was taken and released.
  assert(client.lockAcquired, 'apply must acquire the shared production advisory lock');
  assert(executed.some((sql) => sql.includes('pg_advisory_unlock')));
});

test('Apply driver: executes ONLY migration 43 — no Phase 11 migration is applied', async () => {
  const client = createStubClient({ rows: healthyLedgerRows() });
  const result = await runPhase12AnalyticsMigrationGate({
    operation: 'apply',
    environment: productionEnvironment(),
    clientFactory: async () => client,
  });
  assert.deepEqual(result.applied, [MIGRATION_43]);
  assert.equal(client.inserts.length, 1);
  for (const insert of client.inserts) {
    assert.equal(insert.params[0], MIGRATION_43);
  }
});

test('Apply driver: idempotent — a second apply performs no write', async () => {
  const rows = healthyLedgerRows();
  const first = createStubClient({ rows });
  await runPhase12AnalyticsMigrationGate({
    operation: 'apply',
    environment: productionEnvironment(),
    clientFactory: async () => first,
  });
  assert.equal(first.inserts.length, 1);

  // Re-run against the resulting ledger state.
  const second = createStubClient({ rows: first.ledger });
  const result = await runPhase12AnalyticsMigrationGate({
    operation: 'apply',
    environment: productionEnvironment(),
    clientFactory: async () => second,
  });
  assert.equal(result.stopped, false);
  assert.deepEqual(result.applied, []);
  assert.equal(second.inserts.length, 0, 'second apply must not write to the ledger');
});

test('Apply driver: no mutation when preflight reports violations', async () => {
  const rows = [...healthyLedgerRows(), { version: '20260810000099', name: 'mystery', statements: ['BEGIN', 'COMMIT'] }];
  const client = createStubClient({ rows });
  const result = await runPhase12AnalyticsMigrationGate({
    operation: 'apply',
    environment: productionEnvironment(),
    clientFactory: async () => client,
  });

  assert.equal(result.stopped, true);
  assert.deepEqual(result.applied, []);
  assert.equal(client.inserts.length, 0, 'a violating preflight must not write to the ledger');
  assert.equal(client.lockAcquired, false, 'a violating preflight must not even take the advisory lock');
});

test('Apply driver: no mutation when Phase 11 is incomplete', async () => {
  const rows = healthyLedgerRows().filter((row) => row.version !== '20260810000038');
  const client = createStubClient({ rows });
  const result = await runPhase12AnalyticsMigrationGate({
    operation: 'apply',
    environment: productionEnvironment(),
    clientFactory: async () => client,
  });
  assert.equal(result.stopped, true);
  assert.equal(client.inserts.length, 0);
  assert.equal(client.lockAcquired, false);
});

test('Inspect mode: read-only — no lock, no write, reports pending', async () => {
  const client = createStubClient({ rows: healthyLedgerRows() });
  const result = await runPhase12AnalyticsMigrationGate({
    operation: 'inspect',
    environment: productionEnvironment({ PHASE12_ANALYTICS_CONFIRM: 'INSPECT_ONLY' }),
    clientFactory: async () => client,
  });

  assert.equal(result.stopped, false);
  assert.deepEqual(result.applied, []);
  assert.equal(result.report.pending.length, 1);
  assert.equal(client.inserts.length, 0);
  assert.equal(client.lockAcquired, false);
  assert(client.queries.some((entry) => entry.sql === 'BEGIN READ ONLY'));
});

// ─────────────────────────────────────────────────────────────────
// PART 6 — POST-APPLY LEDGER VERIFICATION (Phase 12 specific)
// ─────────────────────────────────────────────────────────────────

test('Post-apply verification: confirms version, name, and byte-exact statements', () => {
  const rows = [...healthyLedgerRows(), appliedRowFor(approvedMigrations[0])];
  const verification = verifyPhase12Applied(rows, approvedMigrations, { policyData });
  assert.equal(verification.hasViolations, false);
  assert.equal(verification.applied, true);
  assert.equal(verification.verified.length, 1);
  assert.equal(verification.verified[0].version, MIGRATION_43);
  assert.equal(verification.verified[0].name, 'fix_analytics_rpc_bigint_cast');
  assert.equal(verification.verified[0].status, 'applied');
  assert.equal(verification.verified[0].sha256, PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS[0].sha256);
});

test('Post-apply verification: absent migration 43 is a violation', () => {
  const verification = verifyPhase12Applied(healthyLedgerRows(), approvedMigrations, { policyData });
  assert.equal(verification.applied, false);
  assert(verification.violations.some((v) => v.code === 'PHASE12_GATE_POST_APPLY_MIGRATION_ABSENT'));
});

test('Post-apply verification: wrong ledger name is a violation', () => {
  const rows = [
    ...healthyLedgerRows(),
    { ...appliedRowFor(approvedMigrations[0]), name: 'something_else' },
  ];
  const verification = verifyPhase12Applied(rows, approvedMigrations, { policyData });
  assert.equal(verification.applied, false);
  assert(verification.violations.some((v) => v.code === 'PHASE12_GATE_POST_APPLY_NAME_MISMATCH'));
});

test('Post-apply verification: altered statements are a violation', () => {
  const rows = [
    ...healthyLedgerRows(),
    { version: MIGRATION_43, name: 'fix_analytics_rpc_bigint_cast', statements: ['BEGIN', 'DROP TABLE users', 'COMMIT'] },
  ];
  const verification = verifyPhase12Applied(rows, approvedMigrations, { policyData });
  assert.equal(verification.applied, false);
  assert(verification.violations.some((v) => v.code === 'PHASE12_GATE_POST_APPLY_CHECKSUM_MISMATCH'));
});

test('Post-apply verification: an unexpected extra migration is a violation', () => {
  const baseline = new Set(healthyLedgerRows().map((row) => row.version));
  const rows = [
    ...healthyLedgerRows(),
    appliedRowFor(approvedMigrations[0]),
    { version: '20260810000034', name: 'sneaked_in', statements: ['BEGIN', 'COMMIT'] },
  ];
  const verification = verifyPhase12Applied(rows, approvedMigrations, { baselineVersions: baseline });
  assert(verification.violations.some((v) => v.code === 'PHASE12_GATE_UNEXPECTED_MIGRATION_APPLIED'
    && v.version === '20260810000034'));
});

test('Post-apply verification: does not consult Phase 11 phase11States', () => {
  const rows = [...healthyLedgerRows(), appliedRowFor(approvedMigrations[0])];
  const verification = verifyPhase12Applied(rows, approvedMigrations, { policyData });
  assert.equal(verification.phase11States, undefined);
  const report = evaluatePhase12AnalyticsLedger(rows, approvedMigrations, policyData);
  assert.equal(report.phase11States, undefined, 'Phase 12 evaluation must not produce phase11States');
  assert(Array.isArray(report.phase12States));
});

test('Verify mode: read-only and reports the applied migration', async () => {
  const client = createStubClient({ rows: [...healthyLedgerRows(), appliedRowFor(approvedMigrations[0])] });
  const lines = [];
  const result = await runPhase12AnalyticsMigrationGate({
    operation: 'verify',
    environment: productionEnvironment({ PHASE12_ANALYTICS_CONFIRM: 'INSPECT_ONLY' }),
    clientFactory: async () => client,
    write: (line) => lines.push(line),
  });
  assert.equal(result.stopped, false);
  assert.equal(result.verification.applied, true);
  assert.equal(client.inserts.length, 0);
  assert.equal(client.lockAcquired, false);
  assert(lines.some((line) => line.startsWith(`PHASE12_VERIFIED ${MIGRATION_43}`)));
});

// ─────────────────────────────────────────────────────────────────
// PART 7 — TARGET / TLS VALIDATION IS PRESERVED
// ─────────────────────────────────────────────────────────────────

test('Target validation: a non-production host fails closed before connecting', async () => {
  await assert.rejects(
    () => runPhase12AnalyticsMigrationGate({
      operation: 'apply',
      environment: productionEnvironment({
        PHASE11_PRODUCTION_DATABASE_URL: 'postgresql://postgres:password@localhost:5432/postgres',
      }),
      clientFactory: () => { throw new Error('must never connect'); },
    }),
    (error) => error instanceof Phase11MigrationGateError
      && error.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED',
  );
});

test('Target validation: db_mode mismatch fails closed', async () => {
  await assert.rejects(
    () => runPhase12AnalyticsMigrationGate({
      operation: 'apply',
      environment: productionEnvironment({ PHASE11_PRODUCTION_DB_MODE: 'session-pooler' }),
      clientFactory: () => { throw new Error('must never connect'); },
    }),
    (error) => error instanceof Phase11MigrationGateError
      && error.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED',
  );
});

// ─────────────────────────────────────────────────────────────────
// PART 8 — CLI SURFACE
// ─────────────────────────────────────────────────────────────────

test('CLI: --describe prints the boundary and exits 0', () => {
  const { exitCode, output } = runGateCli(['--describe'], {});
  assert.equal(exitCode, 0);
  assert(output.includes('PHASE12_ALLOWLIST 20260810000043_fix_analytics_rpc_bigint_cast.sql'));
  assert(output.includes('PHASE12_CONFIRMATION_TOKEN_APPLY APPLY_PHASE12_ANALYTICS_43'));
});

test('CLI: describePhase12Migrations emits one allowlist line per migration', () => {
  const lines = [];
  describePhase12Migrations((line) => lines.push(line));
  const allowlistLines = lines.filter((line) => line.startsWith('PHASE12_ALLOWLIST'));
  assert.equal(allowlistLines.length, PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS.length);
});

test('CLI: --apply without a confirmation token exits non-zero and never connects', () => {
  const { exitCode, output } = runGateCli(['--apply'], {
    PHASE12_ANALYTICS_CONFIRM: '',
    PHASE11_PRODUCTION_DATABASE_URL: directUrl,
    PHASE11_PRODUCTION_PROJECT_REF: projectRef,
    PHASE11_PRODUCTION_DB_MODE: 'direct',
  });
  assert.notEqual(exitCode, 0);
  assert(output.includes('PHASE12_GATE_CONFIRMATION_REQUIRED'), `Got: ${output}`);
});

test('CLI: unknown operation exits non-zero', () => {
  const { exitCode, output } = runGateCli(['--wat'], { PHASE12_ANALYTICS_CONFIRM: 'INSPECT_ONLY' });
  assert.notEqual(exitCode, 0);
  assert(output.includes('PHASE12_GATE_OPERATION_REQUIRED'), `Got: ${output}`);
});

test('CLI: no secret value is echoed by the gate on failure', () => {
  const { output } = runGateCli(['--apply'], {
    PHASE12_ANALYTICS_CONFIRM: 'APPLY_PHASE12_ANALYTICS_43',
    PHASE11_PRODUCTION_DATABASE_URL: `postgresql://postgres:SUPERSECRET@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
    PHASE11_PRODUCTION_PROJECT_REF: projectRef,
    PHASE11_PRODUCTION_DB_MODE: 'direct',
  });
  assert(!output.includes('SUPERSECRET'), `Secret leaked into output: ${output}`);
});
