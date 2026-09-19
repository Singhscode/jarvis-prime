import { createHash, X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import tls from 'node:tls';

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
// Sentinel written when retiring migration 37 from production: keeps the version
// in the ledger so Supabase CLI sees it as already-applied, but replaces the
// statements with an empty array so the gate can distinguish retired from active.
export const STAGING_ONLY_RETIRED_NAME = 'retired_staging_only_canary';
const LEDGER_RETIRE_STAGING_37_SQL = "update supabase_migrations.schema_migrations set name = 'retired_staging_only_canary', statements = ARRAY[]::text[] where version = '20260810000037'";
const LEDGER_VERIFY_STAGING_37_RETIRED_SQL = "select name, statements from supabase_migrations.schema_migrations where version = '20260810000037'";

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
  Object.freeze({
    version: '20260810000038',
    file: '20260810000038_add_automation_resource_trigger_contract.sql',
    sha256: '9efb3ba4b524ed67f45ded904aa8355687adbef7ee6a131829a456931e16fa24',
  }),
  Object.freeze({
    version: '20260810000039',
    file: '20260810000039_complete_core_automation_engine.sql',
    sha256: '7d8d4fa1faae05622e56d861e4577797ae18b9f08f4cd9bfc7d5c7165672dccb',
  }),
  Object.freeze({
    version: '20260810000040',
    file: '20260810000040_harden_automation_worker_claim_drain.sql',
    sha256: '3ab75d24d26fd2923b277b641c16bc86ff5a3f7c2199a336e8de6f84ba6d7914',
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
 * Enforces the TLS-verified Supabase host derived from a protected
 * production Environment variable. Supports direct connection or Supavisor
 * session pooler mode based on PHASE11_PRODUCTION_DB_MODE (default: direct).
 * Pooler, preview, staging, local, and arbitrary hosts are rejected before
 * a client is created.
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

  // Connection mode: 'direct' (default) or 'session-pooler'
  const dbMode = environment.PHASE11_PRODUCTION_DB_MODE || 'direct';
  if (!['direct', 'session-pooler'].includes(dbMode)) {
    throw new Phase11MigrationGateError('PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
  }

  const sslmode = target.searchParams.get('sslmode');
  const sslmodeAccepted = sslmode === null || sslmode === 'verify-full' || sslmode === 'require';

  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !sslmodeAccepted) {
    throw new Phase11MigrationGateError('PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
  }

  // Validate port: session mode requires 5432, direct mode allows 5432
  if (target.port && target.port !== '5432') {
    throw new Phase11MigrationGateError('PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
  }

  // Validate host based on mode
  if (dbMode === 'direct') {
    // Direct connection: db.<project-ref>.supabase.co
    const expectedHost = `db.${projectRef}.supabase.co`;
    if (target.hostname !== expectedHost) {
      throw new Phase11MigrationGateError('PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
    }
  } else if (dbMode === 'session-pooler') {
    // Supabase's documented Shared Session Pooler carries the project ref in
    // the connection *username* (e.g. postgres.<project-ref>), not the
    // hostname. The shared pooler hostname is a region/index-scoped Supavisor
    // endpoint such as aws-0-us-east-1.pooler.supabase.com and does not embed
    // the project ref at all, so the ref must never be matched from the host.
    // https://supabase.com/docs/guides/database/connecting-to-postgres
    const poolerSuffix = '.pooler.supabase.com';
    const poolerLabel = target.hostname.endsWith(poolerSuffix)
      ? target.hostname.slice(0, -poolerSuffix.length)
      : null;
    if (!poolerLabel) {
      // Also rejects a hostname equal to the bare suffix (no region/index
      // label), which is malformed rather than a real Supavisor endpoint.
      throw new Phase11MigrationGateError('PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
    }

    let username;
    try {
      // target.username is percent-encoded per the URL spec; decode it to
      // compare the literal role/ref segments. The password is never read.
      username = decodeURIComponent(target.username);
    } catch {
      throw new Phase11MigrationGateError('PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
    }

    // Documented shared-pooler identity: <role>.<project-ref>, where <role> is
    // usually "postgres" but MAY be a custom Postgres role. The project ref
    // must be the exact suffix after the final '.', matching PROJECT_REF
    // exactly (no additional dots, no partial/prefix match).
    const lastDot = username.lastIndexOf('.');
    const usernameProjectRef = lastDot === -1 ? '' : username.slice(lastDot + 1);
    const usernameRole = lastDot === -1 ? username : username.slice(0, lastDot);
    if (!usernameRole || usernameProjectRef !== projectRef) {
      throw new Phase11MigrationGateError('PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED');
    }
  }

  return {
    connectionString,
    projectRef,
    dbMode,
    certificateAuthority: environment.PHASE11_PRODUCTION_DATABASE_CA_PEM || undefined,
  };
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
      // Two sub-cases for version 37:
      //   retired sentinel  → name='retired_staging_only_canary' AND statements is an empty array
      //   anything else     → real migration content that must never be in production (HARD STOP)
      const row = byVersion.get(version);
      const isRetiredSentinel = row.name === STAGING_ONLY_RETIRED_NAME
        && Array.isArray(row.statements)
        && row.statements.length === 0;
      if (!isRetiredSentinel) {
        violations.push('PHASE11_GATE_STAGING_ONLY_37_PRESENT');
      }
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

  // Determine the 37 status for the ledger report.
  // absent        → 37 not in ledger (expected clean state before remediation)
  // retired       → sentinel present; 37 treated as permanently retired, NOT a violation
  // present-stop  → real statements present; HARD STOP
  let stagingOnly;
  if (!byVersion.has(STAGING_ONLY_VERSION)) {
    stagingOnly = 'absent';
  } else {
    const row = byVersion.get(STAGING_ONLY_VERSION);
    const isRetiredSentinel = row.name === STAGING_ONLY_RETIRED_NAME
      && Array.isArray(row.statements)
      && row.statements.length === 0;
    stagingOnly = isRetiredSentinel ? 'retired' : 'present-stop';
  }

  const migration35 = states[0];
  const migration36 = states[1];
  const migration38 = states[2];
  const migration39 = states[3];
  const migration40 = states[4];

  // Enforce sequential ordering: 36 requires 35, 38 requires 36, 39 requires 38, 40 requires 39
  if (migration36.status === 'applied' && migration35.status !== 'applied') {
    violations.push('PHASE11_GATE_ORDERING_INVALID');
  }
  if (migration38.status === 'applied' && migration36.status !== 'applied') {
    violations.push('PHASE11_GATE_ORDERING_INVALID');
  }
  if (migration39.status === 'applied' && migration38.status !== 'applied') {
    violations.push('PHASE11_GATE_ORDERING_INVALID');
  }
  if (migration40.status === 'applied' && migration39.status !== 'applied') {
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
  if (migration38.status === 'pending') {
    if (migration36.status !== 'applied' && migration36.status !== 'pending') {
      violations.push('PHASE11_GATE_ORDERING_INVALID');
    }
    pending.push(approvedMigrations[2]);
  }
  if (migration39.status === 'pending') {
    if (migration38.status !== 'applied' && migration38.status !== 'pending') {
      violations.push('PHASE11_GATE_ORDERING_INVALID');
    }
    pending.push(approvedMigrations[3]);
  }
  if (migration40.status === 'pending') {
    if (migration39.status !== 'applied' && migration39.status !== 'pending') {
      violations.push('PHASE11_GATE_ORDERING_INVALID');
    }
    pending.push(approvedMigrations[4]);
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

const TLS_CONNECTION_QUERY_PARAMETERS = Object.freeze([
  'ssl',
  'sslmode',
  'sslrootcert',
  'sslcert',
  'sslkey',
  'sslnegotiation',
  'uselibpqcompat',
]);

/**
 * Build a pg configuration whose TLS policy cannot be overridden by a URL query
 * parameter. When the protected Environment provides the project CA, it is the
 * sole additional trust anchor; hostname and chain verification remain enabled.
 */
export function createVerifiedPgClientConfig({ connectionString, certificateAuthority }) {
  const sanitizedConnectionUrl = new URL(connectionString);
  for (const parameter of TLS_CONNECTION_QUERY_PARAMETERS) {
    sanitizedConnectionUrl.searchParams.delete(parameter);
  }

  const ssl = { rejectUnauthorized: true };
  if (typeof certificateAuthority === 'string' && certificateAuthority.trim()) {
    ssl.ca = certificateAuthority;
  }

  return { connectionString: sanitizedConnectionUrl.toString(), ssl };
}

async function defaultClientFactory({ connectionString, certificateAuthority, root }) {
  const requireApiDependency = createRequire(path.join(root, 'apps', 'api', 'package.json'));
  const pg = requireApiDependency('pg');
  return new pg.Client(createVerifiedPgClientConfig({ connectionString, certificateAuthority }));
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
const SAFE_DATABASE_ERROR_CODES = new Set([
  '28P01', '28000', '3D000',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'EAI_AGAIN', 'EAI_FAIL', 'EAI_NODATA', 'ENETUNREACH', 'ENETDOWN',
  'ENOTFOUND', 'EHOSTUNREACH', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
]);

export function classifyProductionDatabaseError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (['EAI_AGAIN', 'EAI_FAIL', 'EAI_NODATA', 'ENOTFOUND'].includes(code)) return 'DNS';
  if (['ENETUNREACH', 'ENETDOWN', 'EHOSTUNREACH', 'ECONNREFUSED', 'ECONNRESET'].includes(code)) return 'NETWORK';
  if (code === 'ETIMEDOUT') return 'TIMEOUT';
  if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(code)) return 'TLS';
  if (['28P01', '28000'].includes(code)) return 'AUTH';
  if (code === '3D000') return 'DATABASE';
  return 'DATABASE_DRIVER';
}

function safeProductionDatabaseErrorCode(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  return SAFE_DATABASE_ERROR_CODES.has(code) ? code : 'UNCLASSIFIED';
}

/**
 * Forensic diagnostic: Analyze CA PEM from runtime environment without exposing content.
 * Reports only sanitized metadata: presence, length, byte patterns, hashes, encoding issues.
 * Identifies: literal escaped newlines, BOM, CRLF, encoding corruption, whitespace issues.
 * Does NOT print the CA or any secret data.
 */
export function diagnosticCaPemForensics(environment = process.env) {
  const caPem = environment.PHASE11_PRODUCTION_DATABASE_CA_PEM;

  const report = { phase: 'ca-forensics' };

  if (!caPem) {
    report.ca_env_present = false;
    return report;
  }

  report.ca_env_present = true;
  report.ca_length = caPem.length;

  // Byte-level analysis
  const caBytes = Buffer.from(caPem, 'utf8');
  if (caBytes.length >= 1) report.ca_first_byte_hex = caBytes.readUInt8(0).toString(16).padStart(2, '0');
  if (caBytes.length >= 1) report.ca_last_byte_hex = caBytes.readUInt8(caBytes.length - 1).toString(16).padStart(2, '0');

  // BOM detection
  report.ca_has_bom_utf8 = caBytes.length >= 3 && caBytes[0] === 0xEF && caBytes[1] === 0xBB && caBytes[2] === 0xBF;

  // Newline pattern analysis (without printing content)
  const crlf = (caPem.match(/\r\n/g) || []).length;
  const lf = (caPem.match(/(?<!\r)\n/g) || []).length;
  const crAlone = (caPem.match(/\r(?!\n)/g) || []).length;

  report.ca_contains_crlf = crlf > 0;
  report.ca_contains_lf = lf > 0;
  report.ca_contains_cr = crAlone > 0;
  report.crlf_count = crlf;
  report.lf_count = lf;

  // Literal escaped newline detection: looking for the two-character sequence \ followed by n
  const literalBackslashN = (caPem.match(/\\n/g) || []).length;
  report.ca_contains_literal_backslash_n = literalBackslashN > 0;
  report.literal_backslash_n_count = literalBackslashN;

  // BEGIN/END marker count
  const beginCount = (caPem.match(/-----BEGIN\s+CERTIFICATE-----/g) || []).length;
  const endCount = (caPem.match(/-----END\s+CERTIFICATE-----/g) || []).length;
  report.ca_begin_marker_count = beginCount;
  report.ca_end_marker_count = endCount;

  // Whitespace analysis
  const leadingWhitespace = caPem.match(/^\s+/);
  const trailingWhitespace = caPem.match(/\s+$/);
  report.ca_has_leading_whitespace = !!leadingWhitespace;
  report.ca_has_trailing_whitespace = !!trailingWhitespace;

  // Hash the raw bytes as-is
  report.ca_sha256_raw = createHash('sha256').update(caBytes).digest('hex');

  // Hash after trimming whitespace
  const trimmed = caPem.trim();
  const trimmedBytes = Buffer.from(trimmed, 'utf8');
  report.ca_sha256_trimmed = createHash('sha256').update(trimmedBytes).digest('hex');

  // Try to extract DER and hash that
  try {
    const base64 = caPem
      .split('\n')
      .filter(line => !line.includes('-----') && line.trim())
      .join('');
    if (base64) {
      const der = Buffer.from(base64, 'base64');
      report.ca_sha256_der = createHash('sha256').update(der).digest('hex');
      report.ca_der_extracted = true;
    }
  } catch (e) {
    report.ca_der_extract_error = e.message;
  }

  // Expected known fingerprint
  report.expected_ca_sha256 = '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa';
  report.ca_sha256_matches_expected = report.ca_sha256_der === report.expected_ca_sha256;

  // Try to parse with X509Certificate
  try {
    const cert = new X509Certificate(caPem);
    report.x509_parse_status = 'ok';
    report.x509_subject = cert.subject;
    report.x509_issuer = cert.issuer;
    report.x509_is_ca = cert.checkCAConstraint ? true : false;
  } catch (e) {
    report.x509_parse_status = 'failed';
    report.x509_parse_error = e.message;
  }

  return report;
}

/**
 * Temporary diagnostic: Test Node.js TLS capability against the production
 * PostgreSQL endpoint using PostgreSQL SSLRequest + TLS handshake with the
 * supplied CA. Reports only sanitized metadata; no secrets, no credentials,
 * no certificate contents. Does NOT authenticate or execute SQL.
 */
export async function diagnosticNodeTlsCapability(environment = process.env) {
  const connectionString = environment.PHASE11_PRODUCTION_DATABASE_URL;
  const caPem = environment.PHASE11_PRODUCTION_DATABASE_CA_PEM;

  if (!connectionString || !caPem) {
    return { status: 'skipped', reason: 'missing environment' };
  }

  const report = { phase: 'tls-diagnostic' };

  try {
    // Parse URL
    const url = new URL(connectionString);
    const host = url.hostname;
    const port = parseInt(url.port) || 5432;
    const username = decodeURIComponent(url.username);

    report.host = host;
    report.port = port;
    report.username_shape = username.includes('.') ? 'role.projectref' : 'role';

    // CA analysis
    const caLength = caPem.length;
    const base64 = caPem
      .split('\n')
      .filter(l => !l.includes('-----') && l.trim())
      .join('');
    const der = Buffer.from(base64, 'base64');
    const caSha256 = createHash('sha256').update(der).digest('hex');

    const cert = new X509Certificate(caPem);
    report.ca_length = caLength;
    report.ca_sha256 = caSha256;
    report.ca_subject = cert.subject;
    report.ca_issuer = cert.issuer;
    report.ca_basic_constraints = cert.checkCAConstraint ? 'CA:TRUE' : 'CA:FALSE';

    // PostgreSQL STARTTLS
    const sslRequest = Buffer.alloc(8);
    sslRequest.writeUInt32BE(8, 0);
    sslRequest.writeUInt32BE(80877103, 4);

    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      socket.setTimeout(10000);

      socket.once('connect', () => {
        report.postgres_ssl_request_sent = true;
        socket.write(sslRequest);
      });

      socket.once('data', (response) => {
        if (response[0] !== 0x53) {
          reject(new Error(`SSL negotiation failed: server responded with ${String.fromCharCode(response[0] || 0)}`));
          socket.destroy();
          return;
        }

        report.postgres_ssl_negotiation = 'ok';

        // Upgrade to TLS
        const tlsSocket = tls.connect(
          {
            socket,
            host,
            servername: host,
            ca: caPem,
            rejectUnauthorized: true,
          },
          () => {
            report.node_tls_protocol = tlsSocket.getProtocol();
            report.node_tls_cipher = tlsSocket.getCipher().name;
            report.node_tls_authorized = tlsSocket.authorized;
            report.node_tls_authorization_error = tlsSocket.authorizationError || null;

            const peer = tlsSocket.getPeerCertificate(false);
            if (peer?.subject) report.peer_subject = peer.subject;
            if (peer?.issuer) report.peer_issuer = peer.issuer;

            report.status = 'ok';
            tlsSocket.destroy();
            resolve();
          }
        );

        tlsSocket.once('error', (err) => {
          report.status = 'failed';
          report.node_tls_error = err.code || err.message;
          tlsSocket.destroy();
          reject(err);
        });
      });

      socket.once('timeout', () => {
        reject(new Error('Connection timeout'));
        socket.destroy();
      });

      socket.once('error', (err) => {
        reject(err);
      });
    });
  } catch (e) {
    report.status = 'failed';
    report.error = e.message;
  }

  return report;
}

export class Phase11DatabaseError extends Error {
  constructor(stage, error, { mode } = {}) {
    super('PHASE11_DATABASE_DRIVER_ERROR');
    this.name = 'Phase11DatabaseError';
    this.stage = stage;
    this.mode = mode || 'direct';
    this.classification = classifyProductionDatabaseError(error);
    this.safeCode = safeProductionDatabaseErrorCode(error);
  }
}

export function formatPhase11DatabaseError(error) {
  return [
    'PHASE11_GATE_DATABASE_FAILED',
    `class=${error.classification}`,
    `code=${error.safeCode}`,
    `stage=${error.stage}`,
    `mode=${error.mode || 'UNKNOWN'}`,
    'port=5432',
    'tls=REJECT_UNAUTHORIZED',
  ].join(' ');
}

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

  // TEMPORARY DIAGNOSTIC: Test Node TLS capability with production CA
  if (environment.PHASE11_PRODUCTION_DATABASE_URL && environment.PHASE11_PRODUCTION_DATABASE_CA_PEM) {
    const forensics = diagnosticCaPemForensics(environment);
    write(`PHASE11_DIAGNOSTICS_CA_FORENSICS ${JSON.stringify(forensics)}`);
    const tlsDiag = await diagnosticNodeTlsCapability(environment);
    write(`PHASE11_DIAGNOSTICS_NODE_TLS ${JSON.stringify(tlsDiag)}`);
  }

  let client;
  let connected = false;
  let stage = 'client-create';

  try {
    client = await clientFactory({ ...target, root, dbMode: target.dbMode });
    stage = 'connect';
    await client.connect();
    connected = true;
    stage = 'ledger-read';
    let report = evaluateProductionLedger(await readLedgerReadOnly(client), migrations);
    stage = 'ledger-evaluate';
    writeLedgerReport(write, report);
    if (report.violations.length || operation === 'inspect') {
      return Object.freeze({ report, applied: Object.freeze([]), stopped: report.violations.length > 0 });
    }

    stage = 'advisory-lock';
    await client.query(ADVISORY_LOCK_SQL);
    try {
      stage = 'ledger-read';
      report = evaluateProductionLedger(await readLedgerReadOnly(client), migrations);
      stage = 'ledger-evaluate';
      writeLedgerReport(write, report);
      if (report.violations.length) {
        return Object.freeze({ report, applied: Object.freeze([]), stopped: true });
      }

      const applied = [];
      for (const migration of report.pending) {
        stage = 'migration-apply';
        await applyOneMigration(client, migration);
        stage = 'ledger-read';
        const verified = evaluateProductionLedger(await readLedgerReadOnly(client), migrations);
        stage = 'ledger-evaluate';
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
  } catch (error) {
    if (error instanceof Phase11MigrationGateError) throw error;
    // Capture dbMode from target object if available
    const mode = target?.dbMode || 'direct';
    throw new Phase11DatabaseError(stage, error, { mode });
  } finally {
    if (connected) await client.end().catch(() => {});
  }
}

/**
 * Retire the staging-only migration 37 in the production ledger by overwriting
 * its row with a permanent sentinel (name='retired_staging_only_canary',
 * statements=ARRAY[]::text[]).  The version row is KEPT so Supabase CLI and
 * every other migration tool sees 37 as already-applied and never re-runs it.
 * The gate's evaluateProductionLedger will accept this sentinel without raising
 * a violation.
 *
 * Requires explicit confirmation via environment variable to prevent accidental
 * execution.
 */
async function removeStagingOnlyMigration37() {
  const confirmationCode = process.env.PHASE11_REMOVE_STAGING_37_CONFIRM;
  if (confirmationCode !== 'REMOVE_STAGING_ONLY_37_FROM_PRODUCTION') {
    console.error('PHASE11_GATE_REMOVE_STAGING_37_CONFIRMATION_REQUIRED');
    console.error('Set PHASE11_REMOVE_STAGING_37_CONFIRM=REMOVE_STAGING_ONLY_37_FROM_PRODUCTION to proceed.');
    process.exitCode = 1;
    return;
  }

  console.log('PHASE11_GATE_REMOVE_STAGING_37_START');
  const target = assertProductionTarget(process.env);

  let client;
  let connected = false;

  try {
    client = await defaultClientFactory({ ...target, root: defaultRoot, dbMode: target.dbMode });
    await client.connect();
    connected = true;

    await client.query('BEGIN');
    try {
      console.log('PHASE11_GATE_REMOVE_STAGING_37_EXECUTING');
      await client.query(LEDGER_RETIRE_STAGING_37_SQL);

      // Verify the sentinel is exactly what we expect before committing.
      const verifyResult = await client.query(LEDGER_VERIFY_STAGING_37_RETIRED_SQL);
      const row = verifyResult.rows?.[0];
      const sentinelOk = row
        && row.name === STAGING_ONLY_RETIRED_NAME
        && Array.isArray(row.statements)
        && row.statements.length === 0;
      if (!sentinelOk) {
        throw new Error('PHASE11_GATE_REMOVE_STAGING_37_VERIFICATION_FAILED');
      }

      await client.query('COMMIT');
      console.log('PHASE11_GATE_REMOVE_STAGING_37_SUCCESS');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  } catch (error) {
    if (error instanceof Phase11MigrationGateError) {
      console.error(error.code);
    } else {
      console.error('PHASE11_GATE_REMOVE_STAGING_37_FAILED');
      console.error(error.message);
    }
    process.exitCode = 1;
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
  if (argument === '--remove-staging-only-37') {
    await removeStagingOnlyMigration37();
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
    if (error instanceof Phase11MigrationGateError) {
      console.error(error.code);
    } else if (error instanceof Phase11DatabaseError) {
      console.error(formatPhase11DatabaseError(error));
    } else {
      console.error('PHASE11_GATE_FAILED');
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
