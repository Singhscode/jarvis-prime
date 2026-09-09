import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..', '..');
const migrationDirectory = path.join('database', 'supabase', 'migrations');

const PREDECESSOR_VERSIONS = Object.freeze([
  '20260810000023', '20260810000024', '20260810000025',
  '20260810000026', '20260810000027', '20260810000028',
  '20260810000029', '20260810000030', '20260810000031',
]);
const LAST_PREDECESSOR_VERSION = PREDECESSOR_VERSIONS.at(-1);
const STAGING_ONLY_VERSION = '20260810000037';
const ADVISORY_LOCK_SQL = "select pg_advisory_lock(hashtext('jarvis-prime:phase11-production-migration-gate'))";
const ADVISORY_UNLOCK_SQL = "select pg_advisory_unlock(hashtext('jarvis-prime:phase11-production-migration-gate'))";
const LEDGER_SELECT_SQL = 'select version, coalesce(name, \'\') as name, statements from supabase_migrations.schema_migrations order by version';
const LEDGER_INSERT_SQL = 'insert into supabase_migrations.schema_migrations(version, name, statements) values ($1, $2, $3)';

/** The only migrations this runner can ever execute. */
export const PHASE11_PRODUCTION_MIGRATIONS = Object.freeze([
  Object.freeze({
    version: '20260810000035',
    file: '20260810000035_complete_phase11_local_candidate_controls.sql',
    sha256: 'ca8c92f8883f68cdc9654b3233e71050e65bdb9e33253931e44148ed0ccd3df0',
  }),
  Object.freeze({
    version: '20260810000036',
    file: '20260810000036_harden_phase11_p0_controls.sql',
    sha256: 'b35bb3aed105ddfd9cdd053877b0f95d228ba262bd2f5a1bd71a58d092e0812b',
  }),
]);

export const PHASE11_STAGING_ONLY_MIGRATION = Object.freeze({
  version: STAGING_ONLY_VERSION,
  file: '20260810000037_add_phase11_internal_fake_canary.sql',
  sha256: 'f65ee2e7101749e614c9b22638a00734bb41a07818d82a7e4b155568504a5399',
});

export class Phase11MigrationGateError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Phase11MigrationGateError';
    this.code = code;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function migrationName(file, version) {
  return file.slice(version.length + 1, -'.sql'.length);
}

/**
 * Mirrors Supabase CLI's parser for the SQL constructs used in the two immutable
 * allowlisted files. Statements are retained byte-for-byte apart from the CLI's
 * trailing-semicolon and whitespace trim, so their ledger representation can be
 * checked without discovering any other migration file.
 */
export function splitSupabaseStatements(source) {
  const statements = [];
  let start = 0;
  let state = 'ready';
  let quote = null;
  let dollarTag = null;
  let blockDepth = 0;
  let parentheses = 0;

  const emit = (end) => {
    const statement = source.slice(start, end).replace(/;+$/, '').trim();
    if (statement) statements.push(statement);
    start = end;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (state === 'line-comment') {
      if (character === '\n') state = 'ready';
      continue;
    }
    if (state === 'block-comment') {
      if (character === '/' && next === '*') {
        blockDepth += 1;
        index += 1;
      } else if (character === '*' && next === '/') {
        blockDepth -= 1;
        index += 1;
        if (blockDepth === 0) state = 'ready';
      }
      continue;
    }
    if (state === 'quote') {
      if (character === '\\') {
        index += 1;
      } else if (character === quote) {
        if (next === quote) index += 1;
        else state = 'ready';
      }
      continue;
    }
    if (state === 'dollar') {
      if (source.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        state = 'ready';
      }
      continue;
    }

    if (character === '-' && next === '-') {
      state = 'line-comment';
      index += 1;
    } else if (character === '/' && next === '*') {
      state = 'block-comment';
      blockDepth = 1;
      index += 1;
    } else if (character === "'" || character === '"') {
      state = 'quote';
      quote = character;
    } else if (character === '$') {
      const tag = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (tag) {
        state = 'dollar';
        dollarTag = tag;
        index += tag.length - 1;
      }
    } else if (character === '(') {
      parentheses += 1;
    } else if (character === ')' && parentheses > 0) {
      parentheses -= 1;
    } else if (character === ';' && parentheses === 0) {
      emit(index + 1);
    }
  }
  emit(source.length);
  return statements;
}

function assertTransactionBounded(migration) {
  const first = migration.statements.at(0) || '';
  const last = migration.statements.at(-1) || '';
  if (!/\bBEGIN\s*$/i.test(first) || !/^COMMIT\s*$/i.test(last)) {
    throw new Phase11MigrationGateError('PHASE11_GATE_INVALID_TRANSACTION_BOUNDARY');
  }
}

/** Read exactly the two literal allowlisted source files and verify their immutable hashes. */
export async function loadApprovedMigrations(root = defaultRoot) {
  return Promise.all(PHASE11_PRODUCTION_MIGRATIONS.map(async (definition) => {
    const source = await readFile(path.join(root, migrationDirectory, definition.file), 'utf8');
    if (sha256(source) !== definition.sha256) {
      throw new Phase11MigrationGateError('PHASE11_GATE_SOURCE_HASH_MISMATCH');
    }
    const migration = {
      ...definition,
      name: migrationName(definition.file, definition.version),
      source,
      statements: splitSupabaseStatements(source),
    };
    assertTransactionBounded(migration);
    return Object.freeze(migration);
  }));
}

/**
 * Enforces the direct, TLS-verified Supabase host derived from a protected
 * production Environment variable. Pooler, preview, staging, local, and any
 * arbitrary host are rejected before a client is created.
 */
export function assertProductionTarget(environment = process.env) {
  const connectionString = environment.PHASE11_PRODUCTION_DATABASE_URL;
  const projectRef = environment.PHASE11_PRODUCTION_PROJECT_REF;
  if (!connectionString || !projectRef || !/^[a-z0-9]{8,64}$/.test(projectRef)) {
    throw new Phase11MigrationGateError('PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
  }

  let target;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Phase11MigrationGateError('PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
  }

  const expectedHost = `db.${projectRef}.supabase.co`;
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || target.hostname !== expectedHost
    || (target.port && target.port !== '5432')
    || target.searchParams.get('sslmode') !== 'verify-full') {
    throw new Phase11MigrationGateError('PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
  }
  return { connectionString, projectRef };
}

function ledgerStatementsMatch(row, migration) {
  return row.name === migration.name
    && Array.isArray(row.statements)
    && row.statements.length === migration.statements.length
    && row.statements.every((statement, index) => statement === migration.statements[index]);
}

/**
 * Evaluate only the remote ledger. The result is deliberately descriptive so
 * inspect mode can emit migration IDs and statuses before failing closed.
 */
export function evaluateProductionLedger(rows, migrations) {
  const approvedMigrations = migrations || PHASE11_PRODUCTION_MIGRATIONS;
  const byVersion = new Map();
  const violations = [];
  for (const row of rows || []) {
    const version = String(row.version || '');
    if (!version || byVersion.has(version)) {
      violations.push('PHASE11_GATE_LEDGER_INVALID');
      continue;
    }
    byVersion.set(version, { version, name: String(row.name || ''), statements: row.statements });
  }

  for (const version of PREDECESSOR_VERSIONS) {
    if (!byVersion.has(version)) violations.push('PHASE11_GATE_PREDECESSOR_MISSING');
  }

  for (const version of byVersion.keys()) {
    if (version === STAGING_ONLY_VERSION) {
      violations.push('PHASE11_GATE_STAGING_ONLY_37_PRESENT');
    } else if (version > LAST_PREDECESSOR_VERSION && !approvedMigrations.some((migration) => migration.version === version)) {
      violations.push('PHASE11_GATE_UNEXPECTED_POST_31_MIGRATION');
    }
  }

  const states = approvedMigrations.map((migration) => {
    const row = byVersion.get(migration.version);
    if (!row) return { version: migration.version, status: 'pending' };
    if (!ledgerStatementsMatch(row, migration)) {
      violations.push('PHASE11_GATE_LEDGER_CHECKSUM_MISMATCH');
      return { version: migration.version, status: 'checksum-mismatch' };
    }
    return { version: migration.version, status: 'applied' };
  });
  const stagingOnly = byVersion.has(STAGING_ONLY_VERSION) ? 'present-stop' : 'absent';

  const migration35 = states[0];
  const migration36 = states[1];
  if (migration36.status === 'applied' && migration35.status !== 'applied') {
    violations.push('PHASE11_GATE_ORDERING_INVALID');
  }

  const pending = [];
  if (migration35.status === 'pending') pending.push(approvedMigrations[0]);
  if (migration36.status === 'pending') {
    if (migration35.status !== 'applied' && migration35.status !== 'pending') {
      violations.push('PHASE11_GATE_ORDERING_INVALID');
    }
    pending.push(approvedMigrations[1]);
  }

  return Object.freeze({
    states: Object.freeze([...states, { version: STAGING_ONLY_VERSION, status: stagingOnly }]),
    pending: Object.freeze(pending),
    violations: Object.freeze([...new Set(violations)]),
  });
}

async function readLedgerReadOnly(client) {
  await client.query('BEGIN READ ONLY');
  try {
    const result = await client.query(LEDGER_SELECT_SQL);
    return result.rows || [];
  } finally {
    await client.query('ROLLBACK').catch(() => {});
  }
}

async function defaultClientFactory({ connectionString, root }) {
  const requireApiDependency = createRequire(path.join(root, 'apps', 'api', 'package.json'));
  const pg = requireApiDependency('pg');
  return new pg.Client({ connectionString, ssl: { rejectUnauthorized: true } });
}

async function applyOneMigration(client, migration) {
  try {
    for (const statement of migration.statements.slice(0, -1)) await client.query(statement);
    await client.query(LEDGER_INSERT_SQL, [migration.version, migration.name, migration.statements]);
    await client.query(migration.statements.at(-1));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

function writeLedgerReport(write, report) {
  for (const state of report.states) write(`PHASE11_LEDGER ${state.version} ${state.status}`);
}

function describeMigrations(write) {
  for (const migration of PHASE11_PRODUCTION_MIGRATIONS) {
    write(`PHASE11_ALLOWLIST ${migration.file} ${migration.sha256}`);
  }
  write(`PHASE11_STAGING_ONLY ${PHASE11_STAGING_ONLY_MIGRATION.file} ${PHASE11_STAGING_ONLY_MIGRATION.sha256}`);
}

/**
 * Connect only after source-hash and target checks pass. inspect mode uses a
 * BEGIN READ ONLY transaction exclusively. apply mode repeats that preflight
 * under an advisory lock, then executes 35 and 36 in order; each migration's
 * ledger record is inserted before its committed source transaction commits.
 */
export async function runPhase11ProductionMigrationGate({
  operation,
  environment = process.env,
  root = defaultRoot,
  clientFactory = defaultClientFactory,
  write = () => {},
} = {}) {
  if (!['inspect', 'apply'].includes(operation)) {
    throw new Phase11MigrationGateError('PHASE11_GATE_OPERATION_REQUIRED');
  }
  const migrations = await loadApprovedMigrations(root);
  const target = assertProductionTarget(environment);
  const client = await clientFactory({ ...target, root });
  let connected = false;

  try {
    await client.connect();
    connected = true;
    let report = evaluateProductionLedger(await readLedgerReadOnly(client), migrations);
    writeLedgerReport(write, report);
    if (report.violations.length || operation === 'inspect') {
      return Object.freeze({ report, applied: Object.freeze([]), stopped: report.violations.length > 0 });
    }

    await client.query(ADVISORY_LOCK_SQL);
    try {
      report = evaluateProductionLedger(await readLedgerReadOnly(client), migrations);
      writeLedgerReport(write, report);
      if (report.violations.length) {
        return Object.freeze({ report, applied: Object.freeze([]), stopped: true });
      }

      const applied = [];
      for (const migration of report.pending) {
        await applyOneMigration(client, migration);
        const verified = evaluateProductionLedger(await readLedgerReadOnly(client), migrations);
        writeLedgerReport(write, verified);
        if (verified.violations.length || !verified.states.some((state) => state.version === migration.version && state.status === 'applied')) {
          return Object.freeze({ report: verified, applied: Object.freeze(applied), stopped: true });
        }
        applied.push(migration.version);
        report = verified;
      }
      return Object.freeze({ report, applied: Object.freeze(applied), stopped: false });
    } finally {
      await client.query(ADVISORY_UNLOCK_SQL).catch(() => {});
    }
  } finally {
    if (connected) await client.end().catch(() => {});
  }
}

async function main() {
  const argument = process.argv.slice(2).at(0);
  if (argument === '--describe') {
    describeMigrations(console.log);
    return;
  }
  const operation = argument === '--inspect' ? 'inspect' : argument === '--apply' ? 'apply' : null;
  try {
    const result = await runPhase11ProductionMigrationGate({ operation, write: console.log });
    if (result.stopped) {
      console.error('PHASE11_GATE_STOPPED');
      process.exitCode = 1;
    }
  } catch (error) {
    // Do not print driver errors: they can include target details and must never expose a connection string.
    console.error(error instanceof Phase11MigrationGateError ? error.code : 'PHASE11_GATE_FAILED');
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
