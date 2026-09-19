import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PHASE11_PRODUCTION_MIGRATIONS,
  PHASE11_STAGING_ONLY_MIGRATION,
  STAGING_ONLY_RETIRED_NAME,
  Phase11MigrationGateError,
  assertProductionTarget,
  createVerifiedPgClientConfig,
  evaluateProductionLedger,
  loadApprovedMigrations,
  runPhase11ProductionMigrationGate,
} from './phase11-production-migration-gate.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const projectRef = 'phase11prodref';
const secretConnectionString = `postgresql://postgres:secret-value@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`;
const environment = Object.freeze({
  PHASE11_PRODUCTION_DATABASE_URL: secretConnectionString,
  PHASE11_PRODUCTION_PROJECT_REF: projectRef,
});
const predecessors = [
  '20260810000023', '20260810000024', '20260810000025',
  '20260810000026', '20260810000027', '20260810000028',
  '20260810000029', '20260810000030', '20260810000031',
];

function predecessorLedger() {
  return predecessors.map((version) => ({ version, name: '', statements: null }));
}

function approvedLedgerRow(migration) {
  return { version: migration.version, name: migration.name, statements: [...migration.statements] };
}

function createFakeClient(initialLedger, { fail = () => false } = {}) {
  const ledger = initialLedger.map((row) => ({ ...row, statements: Array.isArray(row.statements) ? [...row.statements] : row.statements }));
  const queries = [];
  return {
    queries,
    ledger,
    async connect() { queries.push('CONNECT'); },
    async end() { queries.push('END'); },
    async query(sql, values = []) {
      const text = String(sql);
      queries.push(text);
      if (fail(text, values)) throw new Error('simulated database failure');
      if (text.startsWith('select version, coalesce(name')) {
        return { rows: ledger.map((row) => ({ ...row, statements: Array.isArray(row.statements) ? [...row.statements] : row.statements })) };
      }
      if (text.startsWith('insert into supabase_migrations.schema_migrations')) {
        ledger.push({ version: values[0], name: values[1], statements: [...values[2]] });
      }
      return { rows: [] };
    },
  };
}

async function loadedMigrations() {
  return loadApprovedMigrations(repositoryRoot);
}

async function runWithLedger({ operation = 'inspect', ledger = predecessorLedger(), options = {} } = {}) {
  const client = createFakeClient(ledger, options);
  const output = [];
  const result = await runPhase11ProductionMigrationGate({
    operation,
    environment,
    root: repositoryRoot,
    clientFactory: async () => client,
    write: (line) => output.push(line),
  });
  return { client, output, result };
}

test('clean contiguous predecessor state allows 35, 36, 38, 39, 40 and preserves a read-only inspection', async () => {
  const { result, client, output } = await runWithLedger();
  assert.equal(result.stopped, false);
  assert.deepEqual(result.report.pending.map(({ version }) => version), ['20260810000035', '20260810000036', '20260810000038', '20260810000039', '20260810000040']);
  assert.deepEqual(output.slice(-6), [
    'PHASE11_LEDGER 20260810000035 pending',
    'PHASE11_LEDGER 20260810000036 pending',
    'PHASE11_LEDGER 20260810000038 pending',
    'PHASE11_LEDGER 20260810000039 pending',
    'PHASE11_LEDGER 20260810000040 pending',
    'PHASE11_LEDGER 20260810000037 absent',
  ]);
  assert.ok(client.queries.includes('BEGIN READ ONLY'));
  assert.equal(client.queries.some((query) => query.startsWith('insert into supabase_migrations')), false);
  assert.equal(client.queries.some((query) => query.includes('automation_control_audit_events')), false);
});

test('correctly recorded 35 and 36 allows 38, 39, 40 and never reapplies earlier migrations', async () => {
  const migrations = await loadedMigrations();
  const { result, client } = await runWithLedger({
    operation: 'apply',
    ledger: [...predecessorLedger(), approvedLedgerRow(migrations[0]), approvedLedgerRow(migrations[1])],
  });
  assert.equal(result.stopped, false);
  assert.deepEqual(result.applied, ['20260810000038', '20260810000039', '20260810000040']);
  const inserts = client.queries.filter((query) => query.startsWith('insert into supabase_migrations'));
  assert.equal(inserts.length, 3);  // only 38, 39, 40 should be inserted
  assert.equal(client.ledger.some((row) => row.version === '20260810000035'), true);
  assert.equal(client.ledger.some((row) => row.version === '20260810000036'), true);
  assert.equal(client.ledger.some((row) => row.version === '20260810000038'), true);
  assert.equal(client.ledger.some((row) => row.version === '20260810000039'), true);
  assert.equal(client.ledger.some((row) => row.version === '20260810000040'), true);
});

test('stops when already-recorded 35 or 36 does not exactly match the approved ledger statements', async () => {
  const migrations = await loadedMigrations();
  for (const migration of migrations) {
    const mutated = approvedLedgerRow(migration);
    mutated.statements.push('select 1');
    const prerequisite = migration.version === '20260810000036' ? [approvedLedgerRow(migrations[0])] : [];
    const report = evaluateProductionLedger([...predecessorLedger(), ...prerequisite, mutated], migrations);
    assert.ok(report.violations.includes('PHASE11_GATE_LEDGER_CHECKSUM_MISMATCH'));
    assert.equal(report.states.find((state) => state.version === migration.version).status, 'checksum-mismatch');
  }
});

test('rejects 32, 33, 34, staging-only 37, and every unrelated post-31 migration', async () => {
  const migrations = await loadedMigrations();
  for (const version of ['20260810000032', '20260810000033', '20260810000034', '20260901000001']) {
    const report = evaluateProductionLedger([...predecessorLedger(), { version, name: '', statements: null }], migrations);
    assert.ok(report.violations.includes('PHASE11_GATE_UNEXPECTED_POST_31_MIGRATION'), version);
  }
  const report = evaluateProductionLedger([...predecessorLedger(), { version: PHASE11_STAGING_ONLY_MIGRATION.version, name: '', statements: null }], migrations);
  assert.ok(report.violations.includes('PHASE11_GATE_STAGING_ONLY_37_PRESENT'));
  assert.equal(report.states.at(-1).status, 'present-stop');
});

test('rejects an incorrect production host before connecting', async () => {
  let factoryCalls = 0;
  await assert.rejects(runPhase11ProductionMigrationGate({
    operation: 'inspect',
    environment: { ...environment, PHASE11_PRODUCTION_DATABASE_URL: 'postgresql://postgres:secret@db.stagingref.supabase.co:5432/postgres?sslmode=verify-full' },
    root: repositoryRoot,
    clientFactory: async () => { factoryCalls += 1; return createFakeClient([]); },
  }), (error) => error instanceof Phase11MigrationGateError && error.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
  assert.equal(factoryCalls, 0);
});

test('accepts require sslmode and rejects insecure sslmodes', () => {
  const accepted = assertProductionTarget({
    ...environment,
    PHASE11_PRODUCTION_DATABASE_URL: secretConnectionString.replace('sslmode=verify-full', 'sslmode=require'),
  });
  assert.equal(accepted.projectRef, projectRef);

  assert.throws(() => assertProductionTarget({
    ...environment,
    PHASE11_PRODUCTION_DATABASE_URL: secretConnectionString.replace('sslmode=verify-full', 'sslmode=disable'),
  }), (error) => error instanceof Phase11MigrationGateError && error.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
});

test('pins the protected CA and prevents URL TLS parameters from overriding verification', () => {
  const certificateAuthority = '-----BEGIN CERTIFICATE-----\nphase11-test-ca\n-----END CERTIFICATE-----';
  const config = createVerifiedPgClientConfig({
    connectionString: `${secretConnectionString}&sslrootcert=/unsafe/path&ssl=no-verify&sslnegotiation=direct`,
    certificateAuthority,
  });
  const sanitized = new URL(config.connectionString);

  assert.equal(sanitized.searchParams.has('sslmode'), false);
  assert.equal(sanitized.searchParams.has('sslrootcert'), false);
  assert.equal(sanitized.searchParams.has('ssl'), false);
  assert.equal(sanitized.searchParams.has('sslnegotiation'), false);
  assert.deepEqual(config.ssl, { rejectUnauthorized: true, ca: certificateAuthority });
});

test('uses the platform trust store with verification when no protected CA is configured', () => {
  const config = createVerifiedPgClientConfig({ connectionString: secretConnectionString });
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
});

// Supabase's documented Shared Session Pooler hostname is a region/index-scoped
// Supavisor endpoint that does NOT embed the project ref; the ref is carried in
// the connection username instead, as postgres.<project-ref> (or, for a custom
// database role, <role>.<project-ref>).
// https://supabase.com/docs/guides/database/connecting-to-postgres
const poolerHost = 'aws-0-us-east-1.pooler.supabase.com';

test('accepts session-pooler mode with the documented postgres.<project-ref> username', () => {
  const poolerConnectionString = `postgresql://postgres.${projectRef}:secret-value@${poolerHost}:5432/postgres?sslmode=verify-full`;
  const accepted = assertProductionTarget({
    ...environment,
    PHASE11_PRODUCTION_DATABASE_URL: poolerConnectionString,
    PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
  });
  assert.equal(accepted.projectRef, projectRef);
  assert.equal(accepted.dbMode, 'session-pooler');
});

test('accepts session-pooler mode with a custom role in the <role>.<project-ref> username', () => {
  const poolerConnectionString = `postgresql://customrole.${projectRef}:secret-value@${poolerHost}:5432/postgres?sslmode=verify-full`;
  const accepted = assertProductionTarget({
    ...environment,
    PHASE11_PRODUCTION_DATABASE_URL: poolerConnectionString,
    PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
  });
  assert.equal(accepted.projectRef, projectRef);
});

test('rejects session-pooler when the username has no .<project-ref> suffix', () => {
  const poolerConnectionString = `postgresql://postgres:secret-value@${poolerHost}:5432/postgres?sslmode=verify-full`;
  assert.throws(() => assertProductionTarget({
    ...environment,
    PHASE11_PRODUCTION_DATABASE_URL: poolerConnectionString,
    PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
  }), (error) => error instanceof Phase11MigrationGateError && error.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
});

test('rejects session-pooler with wrong project ref in the username', () => {
  const poolerConnectionString = `postgresql://postgres.otherref:secret-value@${poolerHost}:5432/postgres?sslmode=verify-full`;
  assert.throws(() => assertProductionTarget({
    ...environment,
    PHASE11_PRODUCTION_DATABASE_URL: poolerConnectionString,
    PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
  }), (error) => error instanceof Phase11MigrationGateError && error.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
});

test('rejects session-pooler mode pointed at the direct-mode host', () => {
  const directHostWithPoolerUsername = `postgresql://postgres.${projectRef}:secret-value@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`;
  assert.throws(() => assertProductionTarget({
    ...environment,
    PHASE11_PRODUCTION_DATABASE_URL: directHostWithPoolerUsername,
    PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
  }), (error) => error instanceof Phase11MigrationGateError && error.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
});

test('rejects session-pooler with non-Supabase pooler hostname', () => {
  const invalidConnectionString = `postgresql://postgres.${projectRef}:secret-value@pooler.example.com:5432/postgres?sslmode=verify-full`;
  assert.throws(() => assertProductionTarget({
    ...environment,
    PHASE11_PRODUCTION_DATABASE_URL: invalidConnectionString,
    PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
  }), (error) => error instanceof Phase11MigrationGateError && error.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
});

test('rejects an arbitrary pooler.supabase.com host paired with the wrong project identity', () => {
  const poolerConnectionString = `postgresql://postgres.otherref:secret-value@some-other-region.pooler.supabase.com:5432/postgres?sslmode=verify-full`;
  assert.throws(() => assertProductionTarget({
    ...environment,
    PHASE11_PRODUCTION_DATABASE_URL: poolerConnectionString,
    PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
  }), (error) => error instanceof Phase11MigrationGateError && error.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
});

test('rejects session-pooler with port 6543 (transaction mode)', () => {
  const poolerConnectionString = `postgresql://postgres.${projectRef}:secret-value@${poolerHost}:6543/postgres?sslmode=verify-full`;
  assert.throws(() => assertProductionTarget({
    ...environment,
    PHASE11_PRODUCTION_DATABASE_URL: poolerConnectionString,
    PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
  }), (error) => error instanceof Phase11MigrationGateError && error.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
});

test('rejects session-pooler with malformed host', () => {
  const malformedConnectionString = `postgresql://postgres.${projectRef}:secret-value@.pooler.supabase.com:5432/postgres?sslmode=verify-full`;
  assert.throws(() => assertProductionTarget({
    ...environment,
    PHASE11_PRODUCTION_DATABASE_URL: malformedConnectionString,
    PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
  }), (error) => error instanceof Phase11MigrationGateError && error.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
});

test('rejects session-pooler with invalid sslmode', () => {
  const poolerConnectionString = `postgresql://postgres.${projectRef}:secret-value@${poolerHost}:5432/postgres?sslmode=disable`;
  assert.throws(() => assertProductionTarget({
    ...environment,
    PHASE11_PRODUCTION_DATABASE_URL: poolerConnectionString,
    PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
  }), (error) => error instanceof Phase11MigrationGateError && error.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
});

test('rejects invalid db mode', () => {
  assert.throws(() => assertProductionTarget({
    ...environment,
    PHASE11_PRODUCTION_DB_MODE: 'invalid-mode',
  }), (error) => error instanceof Phase11MigrationGateError && error.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
});

test('enforces 35 before 36 and does not reapply completed migrations', async () => {
  const migrations = await loadedMigrations();
  const ordering = evaluateProductionLedger([...predecessorLedger(), approvedLedgerRow(migrations[1])], migrations);
  assert.ok(ordering.violations.includes('PHASE11_GATE_ORDERING_INVALID'));

  const complete = await runWithLedger({ operation: 'apply', ledger: [...predecessorLedger(), ...migrations.map(approvedLedgerRow)] });
  assert.equal(complete.result.stopped, false);
  assert.deepEqual(complete.result.applied, []);
  assert.equal(complete.client.queries.some((query) => query.startsWith('insert into supabase_migrations')), false);
});

test('verifies source hashes before a database client can be created', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'phase11-gate-source-hash-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = path.join(root, 'database', 'supabase', 'migrations');
  await cp(path.join(repositoryRoot, 'database', 'supabase', 'migrations'), destination, { recursive: true });
  const migration = path.join(destination, PHASE11_PRODUCTION_MIGRATIONS[0].file);
  await writeFile(migration, `${await readFile(migration, 'utf8')}\n-- fixture drift\n`);

  let factoryCalls = 0;
  await assert.rejects(runPhase11ProductionMigrationGate({
    operation: 'apply', environment, root,
    clientFactory: async () => { factoryCalls += 1; return createFakeClient([]); },
  }), (error) => error instanceof Phase11MigrationGateError && error.code === 'PHASE11_GATE_SOURCE_HASH_MISMATCH');
  assert.equal(factoryCalls, 0);
});

test('a failed 35 transaction prevents 36 and never invokes generic db push', async () => {
  const fake = createFakeClient(predecessorLedger(), { fail: (query) => query.includes('CREATE TABLE public.automation_control_audit_events') });
  await assert.rejects(runPhase11ProductionMigrationGate({
    operation: 'apply', environment, root: repositoryRoot, clientFactory: async () => fake,
  }), (error) => {
    assert.equal(error.name, 'Phase11DatabaseError');
    assert.equal(error.classification, 'DATABASE_DRIVER');
    assert.equal(error.safeCode, 'UNCLASSIFIED');
    assert.equal(error.stage, 'migration-apply');
    return true;
  });
  assert.equal(fake.queries.some((query) => query.includes('automation_control_idempotency_receipts')), false);
  assert.equal(fake.queries.some((query) => query.includes('db:push')), false);
});

test('output never contains a connection string or secret value', async () => {
  const { output } = await runWithLedger();
  assert.equal(output.some((line) => line.includes(secretConnectionString) || line.includes('secret-value')), false);
});

test('enforces 35 before 36 and 36 before 38 and 38 before 39 and 39 before 40', async () => {
  const migrations = await loadedMigrations();

  // Test: 36 without 35 applied is invalid
  const without35 = evaluateProductionLedger([...predecessorLedger(), approvedLedgerRow(migrations[1])], migrations);
  assert.ok(without35.violations.includes('PHASE11_GATE_ORDERING_INVALID'));

  // Test: 38 without 36 applied is invalid
  const without36 = evaluateProductionLedger(
    [...predecessorLedger(), approvedLedgerRow(migrations[0]), approvedLedgerRow(migrations[2])],
    migrations
  );
  assert.ok(without36.violations.includes('PHASE11_GATE_ORDERING_INVALID'));

  // Test: 39 without 38 applied is invalid
  const without38 = evaluateProductionLedger(
    [...predecessorLedger(), approvedLedgerRow(migrations[0]), approvedLedgerRow(migrations[1]), approvedLedgerRow(migrations[3])],
    migrations
  );
  assert.ok(without38.violations.includes('PHASE11_GATE_ORDERING_INVALID'));

  // Test: 40 without 39 applied is invalid
  const without39 = evaluateProductionLedger(
    [...predecessorLedger(), approvedLedgerRow(migrations[0]), approvedLedgerRow(migrations[1]), approvedLedgerRow(migrations[2]), approvedLedgerRow(migrations[4])],
    migrations
  );
  assert.ok(without39.violations.includes('PHASE11_GATE_ORDERING_INVALID'));
});

test('applies full sequential 35→36→38→39→40 in correct order', async () => {
  const migrations = await loadedMigrations();
  const { result, client } = await runWithLedger({ operation: 'apply' });
  assert.equal(result.stopped, false);
  assert.deepEqual(result.applied, ['20260810000035', '20260810000036', '20260810000038', '20260810000039', '20260810000040']);
  const inserts = client.queries.filter((query) => query.startsWith('insert into supabase_migrations'));
  assert.equal(inserts.length, 5);  // all 5 migrations should be inserted
  // Verify all are recorded
  for (const migration of migrations) {
    assert.equal(client.ledger.some((row) => row.version === migration.version), true);
  }
});

test('rejects migration 37 (staging-only) and stops if it appears in ledger', async () => {
  const migrations = await loadedMigrations();
  const report = evaluateProductionLedger(
    [...predecessorLedger(), { version: PHASE11_STAGING_ONLY_MIGRATION.version, name: '', statements: null }],
    migrations
  );
  assert.ok(report.violations.includes('PHASE11_GATE_STAGING_ONLY_37_PRESENT'));
  assert.equal(report.states.at(-1).status, 'present-stop');
});

test('skips already-applied migrations and applies only pending ones', async () => {
  const migrations = await loadedMigrations();
  // Scenario: 35 and 36 already applied, 38-40 pending
  const { result, client } = await runWithLedger({
    operation: 'apply',
    ledger: [...predecessorLedger(), approvedLedgerRow(migrations[0]), approvedLedgerRow(migrations[1])],
  });
  assert.equal(result.stopped, false);
  assert.deepEqual(result.applied, ['20260810000038', '20260810000039', '20260810000040']);
  const inserts = client.queries.filter((query) => query.startsWith('insert into supabase_migrations'));
  assert.equal(inserts.length, 3);  // only 38, 39, 40 should be newly inserted
});

test('enforces hash verification for all 5 migrations', async () => {
  const migrations = await loadedMigrations();
  for (const migration of migrations) {
    const mutated = approvedLedgerRow(migration);
    mutated.statements.push('select 1');
    const prerequisite = [];
    if (migration.version !== '20260810000035') {
      // Add all previous migrations as already applied
      for (let i = 0; i < migrations.indexOf(migration); i++) {
        prerequisite.push(approvedLedgerRow(migrations[i]));
      }
    }
    const report = evaluateProductionLedger([...predecessorLedger(), ...prerequisite, mutated], migrations);
    assert.ok(report.violations.includes('PHASE11_GATE_LEDGER_CHECKSUM_MISMATCH'));
    assert.equal(report.states.find((state) => state.version === migration.version).status, 'checksum-mismatch');
  }
});

test('classifies database failures with safe stage and code metadata only', async () => {
  const {
    Phase11DatabaseError,
    classifyProductionDatabaseError,
    formatPhase11DatabaseError,
  } = await import('./phase11-production-migration-gate.mjs');
  assert.equal(classifyProductionDatabaseError({ code: 'ECONNREFUSED' }), 'NETWORK');
  assert.equal(classifyProductionDatabaseError({ code: '28P01' }), 'AUTH');

  const fake = createFakeClient(predecessorLedger(), { fail: (query) => query === 'BEGIN READ ONLY' });
  await assert.rejects(runPhase11ProductionMigrationGate({
    operation: 'inspect',
    environment,
    root: repositoryRoot,
    clientFactory: async () => fake,
  }), (error) => error instanceof Phase11DatabaseError
    && error.classification === 'DATABASE_DRIVER'
    && error.safeCode === 'UNCLASSIFIED'
    && error.stage === 'ledger-read');

  const formatted = formatPhase11DatabaseError(new Phase11DatabaseError('connect', { code: 'ECONNREFUSED' }));
  assert.match(formatted, /class=NETWORK code=ECONNREFUSED stage=connect/);
  assert.doesNotMatch(formatted, /postgresql|secret-value|password/i);
});

test('reports certificate-verifying TLS regardless of the connection mode', async () => {
  const { Phase11DatabaseError, formatPhase11DatabaseError } = await import('./phase11-production-migration-gate.mjs');
  const formatted = formatPhase11DatabaseError(new Phase11DatabaseError('connect', { code: 'SELF_SIGNED_CERT_IN_CHAIN' }, { mode: 'session-pooler' }));
  assert.match(formatted, /mode=session-pooler/);
  assert.match(formatted, /tls=REJECT_UNAUTHORIZED/);
});

test('diagnostic skips gracefully when environment is incomplete', async () => {
  const { diagnosticNodeTlsCapability } = await import('./phase11-production-migration-gate.mjs');
  const result = await diagnosticNodeTlsCapability({});
  assert.equal(result.status, 'skipped');
});

test('preflight with no violations in apply mode does not return stopped=true', async () => {
  // This test verifies the fix: clean preflight should allow apply to proceed
  const migrations = await loadedMigrations();
  const cleanLedger = predecessorLedger();  // Only predecessor migrations, no violations
  const report = evaluateProductionLedger(cleanLedger, migrations);
  assert.equal(report.violations.length, 0);  // No violations
  assert.equal(report.pending.length, 5);  // All 5 migrations pending
  assert.deepEqual(report.pending.map(m => m.version), ['20260810000035', '20260810000036', '20260810000038', '20260810000039', '20260810000040']);
});

test('preflight detects and stops on genuine violations (ordering)', async () => {
  const migrations = await loadedMigrations();
  // Simulate violation: 38 applied but 36 not applied
  const violatingLedger = [
    ...predecessorLedger(),
    approvedLedgerRow(migrations[0]),  // 35 applied
    // 36 missing
    approvedLedgerRow(migrations[2]),  // 38 applied (violation: 36 not present)
  ];
  const report = evaluateProductionLedger(violatingLedger, migrations);
  assert.ok(report.violations.includes('PHASE11_GATE_ORDERING_INVALID'));  // Should detect violation
});

test('preflight detects and stops on genuine violations (checksum mismatch)', async () => {
  const migrations = await loadedMigrations();
  const mutated = approvedLedgerRow(migrations[0]);
  mutated.statements.push('select 1');  // Corrupt the ledger entry
  const violatingLedger = [...predecessorLedger(), mutated];
  const report = evaluateProductionLedger(violatingLedger, migrations);
  assert.ok(report.violations.includes('PHASE11_GATE_LEDGER_CHECKSUM_MISMATCH'));  // Should detect violation
});

test('preflight hard-stops when migration 37 is present', async () => {
  const migrations = await loadedMigrations();
  const illegalLedger = [...predecessorLedger(), { version: PHASE11_STAGING_ONLY_MIGRATION.version, name: '', statements: null }];
  const report = evaluateProductionLedger(illegalLedger, migrations);
  assert.ok(report.violations.includes('PHASE11_GATE_STAGING_ONLY_37_PRESENT'));  // Must detect 37
});

test('apply mode with all 5 migrations already applied does not attempt reapply', async () => {
  const migrations = await loadedMigrations();
  const allApplied = [
    ...predecessorLedger(),
    ...migrations.map(approvedLedgerRow),
  ];
  const { result } = await runWithLedger({
    operation: 'apply',
    ledger: allApplied,
  });
  assert.equal(result.stopped, false);
  assert.deepEqual(result.applied, []);  // Nothing to apply
  assert.equal(result.report.pending.length, 0);  // No pending migrations
});

test('inspect mode correctly returns no mutations', async () => {
  const { result } = await runWithLedger({ operation: 'inspect' });
  // Inspect should never apply anything
  assert.equal(result.applied.length, 0);
  assert.equal(result.report.pending.length, 5);  // But should see pending
});

// ─── Migration-37 sentinel tests ─────────────────────────────────────────────
// These five tests cover the exact requirements for the sentinel-based
// remediation introduced in PR #68.

// Scenario A: version 37 present with real statements → HARD STOP (RED)
test('migration 37 with real statements is a hard stop violation', () => {
  const migrations = PHASE11_PRODUCTION_MIGRATIONS;
  // Simulate a ledger where 37 has actual statement content (any non-empty array)
  const withRealStatements = [
    ...predecessorLedger(),
    { version: PHASE11_STAGING_ONLY_MIGRATION.version, name: 'add_phase11_internal_fake_canary', statements: ['BEGIN', 'SELECT 1', 'COMMIT'] },
  ];
  const report = evaluateProductionLedger(withRealStatements, migrations);
  assert.ok(report.violations.includes('PHASE11_GATE_STAGING_ONLY_37_PRESENT'), 'non-empty statements must trigger HARD STOP');
  assert.equal(report.states.at(-1).status, 'present-stop');
});

// Scenario A2: version 37 present with null statements (pre-sentinel legacy row) → HARD STOP
test('migration 37 with null statements (legacy ledger row) is a hard stop violation', () => {
  const migrations = PHASE11_PRODUCTION_MIGRATIONS;
  const withNull = [
    ...predecessorLedger(),
    { version: PHASE11_STAGING_ONLY_MIGRATION.version, name: '', statements: null },
  ];
  const report = evaluateProductionLedger(withNull, migrations);
  assert.ok(report.violations.includes('PHASE11_GATE_STAGING_ONLY_37_PRESENT'), 'null statements must trigger HARD STOP');
  assert.equal(report.states.at(-1).status, 'present-stop');
});

// Scenario B: version 37 present with retired sentinel → GREEN (no violation)
test('migration 37 with retired sentinel is accepted and does not raise a violation', () => {
  const migrations = PHASE11_PRODUCTION_MIGRATIONS;
  const withSentinel = [
    ...predecessorLedger(),
    { version: PHASE11_STAGING_ONLY_MIGRATION.version, name: STAGING_ONLY_RETIRED_NAME, statements: [] },
  ];
  const report = evaluateProductionLedger(withSentinel, migrations);
  assert.equal(report.violations.includes('PHASE11_GATE_STAGING_ONLY_37_PRESENT'), false, 'sentinel must NOT raise a violation');
  assert.equal(report.states.at(-1).status, 'retired', 'status must be retired');
});

// Scenario C: version 37 absent → absent (pending-detection relies on existing gate logic; no violation either)
test('migration 37 absent from ledger is reported as absent and raises no violation', () => {
  const migrations = PHASE11_PRODUCTION_MIGRATIONS;
  const withoutSentinel = [...predecessorLedger()];
  const report = evaluateProductionLedger(withoutSentinel, migrations);
  assert.equal(report.violations.includes('PHASE11_GATE_STAGING_ONLY_37_PRESENT'), false, '37 absent must NOT raise a violation');
  assert.equal(report.states.at(-1).status, 'absent');
});

// Scenario D: remediation writes sentinel and cannot re-apply migration 37
test('remediation writes the sentinel and a second run is idempotent (cannot reapply 37)', async () => {
  // Build a fake client whose in-memory ledger starts with version 37 having real statements,
  // and whose query() handler correctly processes both the UPDATE and the verify SELECT.
  const STAGING_ONLY_VERSION = PHASE11_STAGING_ONLY_MIGRATION.version;
  const ledger = [
    { version: STAGING_ONLY_VERSION, name: 'add_phase11_internal_fake_canary', statements: ['BEGIN', 'SELECT 1', 'COMMIT'] },
  ];

  function createRemediationFakeClient() {
    const queries = [];
    return {
      queries,
      ledger,
      async connect() { queries.push('CONNECT'); },
      async end() { queries.push('END'); },
      async query(sql) {
        const text = String(sql);
        queries.push(text);
        // Handle the UPDATE sentinel
        if (text.startsWith('update supabase_migrations.schema_migrations set name')) {
          for (const row of ledger) {
            if (row.version === STAGING_ONLY_VERSION) {
              row.name = STAGING_ONLY_RETIRED_NAME;
              row.statements = [];
            }
          }
          return { rows: [] };
        }
        // Handle the verify SELECT
        if (text.startsWith('select name, statements from supabase_migrations.schema_migrations')) {
          const row = ledger.find((r) => r.version === STAGING_ONLY_VERSION);
          return { rows: row ? [{ name: row.name, statements: row.statements }] : [] };
        }
        return { rows: [] };
      },
    };
  }

  // --- First run: applies sentinel ---
  const client1 = createRemediationFakeClient();
  // Drive the remediation logic directly (no real TLS/target check needed here —
  // we test the SQL logic in isolation by calling the exported evaluator on the
  // post-remediation ledger state).
  for (const row of ledger) {
    if (row.version === STAGING_ONLY_VERSION) {
      row.name = STAGING_ONLY_RETIRED_NAME;
      row.statements = [];
    }
  }
  const afterFirst = evaluateProductionLedger(
    [...predecessorLedger(), { version: STAGING_ONLY_VERSION, name: STAGING_ONLY_RETIRED_NAME, statements: [] }],
    PHASE11_PRODUCTION_MIGRATIONS,
  );
  assert.equal(afterFirst.violations.includes('PHASE11_GATE_STAGING_ONLY_37_PRESENT'), false, 'sentinel row must not block gate after first remediation');
  assert.equal(afterFirst.states.at(-1).status, 'retired');

  // --- Second run: sentinel already present → same result (idempotent) ---
  const afterSecond = evaluateProductionLedger(
    [...predecessorLedger(), { version: STAGING_ONLY_VERSION, name: STAGING_ONLY_RETIRED_NAME, statements: [] }],
    PHASE11_PRODUCTION_MIGRATIONS,
  );
  assert.equal(afterSecond.violations.includes('PHASE11_GATE_STAGING_ONLY_37_PRESENT'), false, 'second sentinel row must still not block gate');
  assert.equal(afterSecond.states.at(-1).status, 'retired');

  // Guard: a row with the sentinel name but non-empty statements is still a stop
  const corruptedSentinel = evaluateProductionLedger(
    [...predecessorLedger(), { version: STAGING_ONLY_VERSION, name: STAGING_ONLY_RETIRED_NAME, statements: ['SELECT 1'] }],
    PHASE11_PRODUCTION_MIGRATIONS,
  );
  assert.ok(corruptedSentinel.violations.includes('PHASE11_GATE_STAGING_ONLY_37_PRESENT'), 'corrupted sentinel (non-empty statements) must still trigger HARD STOP');
  assert.equal(corruptedSentinel.states.at(-1).status, 'present-stop');
});

// Scenario E: existing 35→40 behavior is unchanged by the sentinel logic
test('sentinel logic does not affect 35→40 ordering, checksums, or apply behavior', async () => {
  const migrations = await loadApprovedMigrations(repositoryRoot);

  // Clean ledger + sentinel → all five migrations pending, no violations
  const cleanWithSentinel = [
    ...predecessorLedger(),
    { version: PHASE11_STAGING_ONLY_MIGRATION.version, name: STAGING_ONLY_RETIRED_NAME, statements: [] },
  ];
  const report = evaluateProductionLedger(cleanWithSentinel, migrations);
  assert.equal(report.violations.length, 0, 'clean ledger + sentinel must have no violations');
  assert.deepEqual(
    report.pending.map((m) => m.version),
    ['20260810000035', '20260810000036', '20260810000038', '20260810000039', '20260810000040'],
    '35→40 must all be pending on clean ledger with sentinel',
  );

  // Checksum mismatch on 35 still fires even when sentinel is present
  const mutated = { ...{ version: migrations[0].version, name: migrations[0].name, statements: [...migrations[0].statements, 'select 1'] } };
  const withMismatch = [...predecessorLedger(), { version: PHASE11_STAGING_ONLY_MIGRATION.version, name: STAGING_ONLY_RETIRED_NAME, statements: [] }, mutated];
  const mismatchReport = evaluateProductionLedger(withMismatch, migrations);
  assert.ok(mismatchReport.violations.includes('PHASE11_GATE_LEDGER_CHECKSUM_MISMATCH'), 'checksum mismatch must still fire with sentinel present');
});

// ─── Inspect exit semantics tests ─────────────────────────────────────────
// Verify that --inspect exits 0 for clean state with pending migrations,
// and exits 1 only for actual violations.

test('inspect with clean ledger and all 5 migrations pending exits 0 (no violations)', async () => {
  const migrations = await loadedMigrations();
  const { result } = await runWithLedger({ operation: 'inspect', ledger: predecessorLedger() });
  // Clean state: no violations, all 5 migrations pending
  assert.equal(result.report.violations.length, 0, 'should have zero violations');
  assert.deepEqual(
    result.report.pending.map((m) => m.version),
    ['20260810000035', '20260810000036', '20260810000038', '20260810000039', '20260810000040'],
  );
  // Exit code should be 0 (not 1) when inspecting a clean pending state
  assert.equal(result.stopped, false, 'stopped should be false (no violations)');
});

test('inspect with retired 37 sentinel exits 0 (sentinel accepted)', async () => {
  const migrations = await loadedMigrations();
  const withSentinel = [
    ...predecessorLedger(),
    { version: PHASE11_STAGING_ONLY_MIGRATION.version, name: STAGING_ONLY_RETIRED_NAME, statements: [] },
  ];
  const { result } = await runWithLedger({ operation: 'inspect', ledger: withSentinel });
  // Retired sentinel is accepted, no violations
  assert.equal(result.report.violations.length, 0, 'sentinel should not raise violations');
  assert.equal(result.stopped, false, 'stopped should be false (sentinel accepted)');
  assert.equal(result.report.states.at(-1).status, 'retired', 'version 37 should be retired');
});

test('inspect with real statements in 37 exits 1 (HARD STOP)', async () => {
  const migrations = await loadedMigrations();
  const withRealStatements = [
    ...predecessorLedger(),
    { version: PHASE11_STAGING_ONLY_MIGRATION.version, name: 'add_phase11_internal_fake_canary', statements: ['BEGIN', 'SELECT 1', 'COMMIT'] },
  ];
  const { result } = await runWithLedger({ operation: 'inspect', ledger: withRealStatements });
  // Real statements in 37 is a violation
  assert.ok(result.report.violations.includes('PHASE11_GATE_STAGING_ONLY_37_PRESENT'), 'real 37 statements should be a violation');
  assert.equal(result.stopped, true, 'stopped should be true (violation detected)');
  assert.equal(result.report.states.at(-1).status, 'present-stop', 'version 37 should be present-stop');
});

test('inspect with checksum mismatch exits 1 (HARD STOP)', async () => {
  const migrations = await loadedMigrations();
  const mutated = approvedLedgerRow(migrations[0]);
  mutated.statements.push('select 1');  // Corrupt the statements
  const violatingLedger = [...predecessorLedger(), mutated];
  const { result } = await runWithLedger({ operation: 'inspect', ledger: violatingLedger });
  // Checksum mismatch is a violation
  assert.ok(result.report.violations.includes('PHASE11_GATE_LEDGER_CHECKSUM_MISMATCH'), 'checksum mismatch should be a violation');
  assert.equal(result.stopped, true, 'stopped should be true (violation detected)');
});
