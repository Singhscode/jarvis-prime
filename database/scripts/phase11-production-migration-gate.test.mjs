import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PHASE11_PRODUCTION_MIGRATIONS,
  PHASE11_STAGING_ONLY_MIGRATION,
  Phase11MigrationGateError,
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

test('clean contiguous predecessor state allows 35 and preserves a read-only inspection', async () => {
  const { result, client, output } = await runWithLedger();
  assert.equal(result.stopped, false);
  assert.deepEqual(result.report.pending.map(({ version }) => version), ['20260810000035', '20260810000036']);
  assert.deepEqual(output.slice(-3), [
    'PHASE11_LEDGER 20260810000035 pending',
    'PHASE11_LEDGER 20260810000036 pending',
    'PHASE11_LEDGER 20260810000037 absent',
  ]);
  assert.ok(client.queries.includes('BEGIN READ ONLY'));
  assert.equal(client.queries.some((query) => query.startsWith('insert into supabase_migrations')), false);
  assert.equal(client.queries.some((query) => query.includes('automation_control_audit_events')), false);
});

test('correctly recorded 35 allows only 36 and never reapplies 35', async () => {
  const migrations = await loadedMigrations();
  const { result, client } = await runWithLedger({ operation: 'apply', ledger: [...predecessorLedger(), approvedLedgerRow(migrations[0])] });
  assert.equal(result.stopped, false);
  assert.deepEqual(result.applied, ['20260810000036']);
  const inserts = client.queries.filter((query) => query.startsWith('insert into supabase_migrations'));
  assert.equal(inserts.length, 1);
  assert.equal(client.ledger.some((row) => row.version === '20260810000035'), true);
  assert.equal(client.ledger.some((row) => row.version === '20260810000036'), true);
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
  }), /simulated database failure/);
  assert.equal(fake.queries.some((query) => query.includes('automation_control_idempotency_receipts')), false);
  assert.equal(fake.queries.some((query) => query.includes('db:push')), false);
});

test('output never contains a connection string or secret value', async () => {
  const { output } = await runWithLedger();
  assert.equal(output.some((line) => line.includes(secretConnectionString) || line.includes('secret-value')), false);
});
