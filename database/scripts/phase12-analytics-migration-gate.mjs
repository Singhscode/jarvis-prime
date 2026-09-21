/**
 * Phase 12 Analytics — protected production migration runner.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The Phase 11 gate can only ever execute the five migrations named in its
 * immutable `PHASE11_PRODUCTION_MIGRATIONS` allowlist (35, 36, 38, 39, 40). That
 * boundary is deliberate and is NOT widened here.
 *
 * `LATER_PHASE_APPROVED` in migration-policy.json is a *classification* that stops
 * an already-applied later-phase ledger row from tripping the Phase 11 gate's
 * unknown-migration hard stop. It is not, and must not become, an apply
 * mechanism: nothing in that classification pins a file, pins a hash, or
 * authorises execution.
 *
 * This runner therefore makes Phase 12 execution explicit. A migration is applied
 * only when ALL of the following hold:
 *
 *   1. it appears in this file's hash-pinned `PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS`
 *      allowlist, and the on-disk file's SHA-256 matches byte for byte;
 *   2. it is ALSO registered as production-approved under the ANALYTICS phase in
 *      migration-policy.json (defence in depth — code and policy must agree);
 *   3. it is transaction bounded (its own first statement is BEGIN, its own last
 *      statement is COMMIT);
 *   4. the operator supplied the exact confirmation token for this operation;
 *   5. the production target passes the same TLS/host/project-ref verification the
 *      Phase 11 gate uses;
 *   6. a read-only preflight over the production ledger reports zero violations;
 *   7. its declared predecessors (the earlier ANALYTICS migrations) are already
 *      applied, and the Phase 11 required set is complete.
 *
 * WHAT THIS RUNNER NEVER DOES
 * ---------------------------
 * No `supabase db push`. No arbitrary SQL. No DDL outside the allowlisted file's
 * own statements. No provisioning, secret mutation, artefact deploy, or provider
 * activation. No writes at all in inspect or verify mode. No Phase 11 migration is
 * read, executed, or re-verified through the Phase 11 `phase11States` path.
 *
 * Production access comes from the protected `jarvis-prime-api / production`
 * GitHub Environment. The PHASE11_PRODUCTION_* variable names are reused verbatim
 * because they identify the production *target*, not a phase — reusing them means
 * this runner needs no new secret and grants no new access.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADVISORY_LOCK_SQL,
  ADVISORY_UNLOCK_SQL,
  applyOneMigration,
  assertProductionTarget,
  assertTransactionBounded,
  defaultClientFactory,
  formatPhase11DatabaseError,
  ledgerStatementsMatch,
  migrationName,
  Phase11DatabaseError,
  Phase11MigrationGateError,
  readLedgerReadOnly,
  sha256,
  splitSupabaseStatements,
} from './phase11-production-migration-gate.mjs';
import { classifyMigration, getLaterPhaseName, loadMigrationPolicy } from './migration-policy-loader.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..', '..');
const migrationDirectory = path.join('database', 'supabase', 'migrations');

/** The registered phase name in migration-policy.json that owns migration 43. */
export const PHASE12_ANALYTICS_PHASE_NAME = 'ANALYTICS';

/** Classification this runner assigns to its own apply set. */
export const PHASE12_ANALYTICS_CLASSIFICATION = 'PHASE12_ANALYTICS_REQUIRED';

/**
 * The ONLY migrations this runner can ever execute.
 *
 * Adding an entry here is the single, reviewable act that authorises a Phase 12
 * production migration. The SHA-256 is a content pin: if the file changes by even
 * one byte, loading fails closed with PHASE12_GATE_SOURCE_HASH_MISMATCH.
 */
export const PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS = Object.freeze([
  Object.freeze({
    version: '20260810000043',
    file: '20260810000043_fix_analytics_rpc_bigint_cast.sql',
    sha256: 'e815794c2698249eaba869460bf8b28450998f41c5601b97e5c301d72883c0c5',
    phase: PHASE12_ANALYTICS_PHASE_NAME,
    classification: PHASE12_ANALYTICS_CLASSIFICATION,
  }),
]);

/**
 * Confirmation tokens. The operator must supply the token matching the requested
 * operation; any mismatch fails closed before a database client is created.
 */
export const PHASE12_ANALYTICS_CONFIRMATION_TOKENS = Object.freeze({
  inspect: 'INSPECT_ONLY',
  apply: 'APPLY_PHASE12_ANALYTICS_43',
  verify: 'INSPECT_ONLY',
});

export class Phase12MigrationGateError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Phase12MigrationGateError';
    this.code = code;
  }
}

/**
 * Format a violation for CI logs. Only the four descriptive fields are ever
 * printed, so a violation object that happens to carry a connection string,
 * password, or CA PEM cannot leak them.
 */
export function formatPhase12Violation(violation) {
  const code = (typeof violation?.code === 'string' && violation.code)
    ? violation.code
    : 'PHASE12_GATE_UNKNOWN_VIOLATION';
  const parts = [`PHASE12_VIOLATION ${code}`];
  if (violation?.version) parts.push(`version=${violation.version}`);
  if (violation?.classification) parts.push(`classification=${violation.classification}`);
  if (violation?.reason) parts.push(`reason="${violation.reason}"`);
  return parts.join(' ');
}

/**
 * Require the requested operation to carry its exact confirmation token.
 * Reads the token from the environment so the workflow cannot apply without an
 * explicit, auditable operator declaration.
 */
export function assertPhase12Confirmation(operation, environment = process.env) {
  const expected = PHASE12_ANALYTICS_CONFIRMATION_TOKENS[operation];
  if (!expected) throw new Phase12MigrationGateError('PHASE12_GATE_OPERATION_REQUIRED');
  if (environment.PHASE12_ANALYTICS_CONFIRM !== expected) {
    throw new Phase12MigrationGateError('PHASE12_GATE_CONFIRMATION_REQUIRED');
  }
  return expected;
}

/**
 * Cross-check the code allowlist against migration-policy.json.
 *
 * Both must independently approve every version in the apply set. If someone
 * removes 43 from the policy, or registers it under a different phase, this fails
 * closed rather than applying on the strength of the code allowlist alone.
 */
export function assertPhase12PolicyApproval(policyData, migrations = PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS) {
  for (const migration of migrations) {
    if (classifyMigration(migration.version, policyData) !== 'LATER_PHASE_APPROVED') {
      throw new Phase12MigrationGateError('PHASE12_GATE_MIGRATION_NOT_POLICY_APPROVED');
    }
    if (getLaterPhaseName(migration.version, policyData) !== migration.phase) {
      throw new Phase12MigrationGateError('PHASE12_GATE_MIGRATION_PHASE_MISMATCH');
    }
  }
  return true;
}

/**
 * Predecessors are derived from the policy rather than hardcoded: every version
 * registered under the ANALYTICS phase that is NOT in this runner's apply set must
 * already be applied. Today that resolves to 41 and 42 — and 43 replaces function
 * bodies created by 42, so 42's presence is a correctness requirement, not just a
 * bookkeeping one.
 */
export function derivePhase12Predecessors(policyData, migrations = PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS) {
  const applySet = new Set(migrations.map((migration) => migration.version));
  const registered = policyData.policy?.phases?.LATER_PHASES?.registeredPhases?.[PHASE12_ANALYTICS_PHASE_NAME]
    ?.productionApproved;
  if (!Array.isArray(registered) || registered.length === 0) {
    throw new Phase12MigrationGateError('PHASE12_GATE_POLICY_PHASE_MISSING');
  }
  return Object.freeze(registered.filter((version) => !applySet.has(version)));
}

/**
 * Read exactly the allowlisted Phase 12 files, verify their content pins, and
 * parse them into the statement list the ledger records.
 */
export async function loadPhase12ApprovedMigrations(root = defaultRoot, migrations = PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS) {
  return Promise.all(migrations.map(async (definition) => {
    const source = await readFile(path.join(root, migrationDirectory, definition.file), 'utf8');
    if (sha256(source) !== definition.sha256) {
      throw new Phase12MigrationGateError('PHASE12_GATE_SOURCE_HASH_MISMATCH');
    }
    const migration = {
      ...definition,
      name: migrationName(definition.file, definition.version),
      source,
      statements: splitSupabaseStatements(source),
    };
    // Reuses the Phase 11 boundary check but raises a Phase 12 code, so a
    // malformed Phase 12 file can never be reported as a Phase 11 fault.
    assertTransactionBounded(migration, 'PHASE12_GATE_INVALID_TRANSACTION_BOUNDARY');
    return Object.freeze(migration);
  }));
}

/**
 * Evaluate the production ledger for a Phase 12 delivery.
 *
 * This is deliberately a separate function from the Phase 11
 * `evaluateProductionLedger`. It does NOT populate or consult `phase11States`,
 * and it does not run Phase 11's positional ordering check — that check indexes
 * its state array against the five-entry Phase 11 policy list and would be
 * meaningless (and unsafe) for a one-entry Phase 12 apply set.
 *
 * Ledger-wide safety checks are kept equivalent to Phase 11's: duplicate rows,
 * unknown rows, and an active staging-only 37 are all hard stops.
 */
export function evaluatePhase12AnalyticsLedger(rows, migrations, policyData) {
  if (!policyData) {
    throw new Error('evaluatePhase12AnalyticsLedger requires policyData from loadMigrationPolicy()');
  }
  const applySet = migrations || PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS;
  const predecessors = derivePhase12Predecessors(policyData, applySet);
  const byVersion = new Map();
  const violations = [];
  const migrationDetails = [];

  for (const row of rows || []) {
    const version = String(row.version || '');
    if (!version || byVersion.has(version)) {
      violations.push({
        code: 'PHASE12_GATE_LEDGER_INVALID',
        version,
        classification: 'UNKNOWN',
        reason: 'Duplicate or invalid version in ledger',
      });
      continue;
    }
    byVersion.set(version, { version, name: String(row.name || ''), statements: row.statements });
  }

  // Ledger-wide classification: an unclassified row means the production database
  // contains something no policy accounts for. Fail closed rather than mutate it.
  for (const version of byVersion.keys()) {
    const row = byVersion.get(version);
    const classification = classifyMigration(version, policyData);

    if (version === policyData.stagingOnlySentinelVersion) {
      const isRetiredSentinel = row.name === policyData.stagingOnlySentinelName
        && Array.isArray(row.statements)
        && row.statements.length === 0;
      if (!isRetiredSentinel) {
        violations.push({
          code: 'PHASE12_GATE_STAGING_ONLY_37_PRESENT',
          version,
          classification: 'STAGING_ONLY',
          reason: 'Migration 37 (staging-only) is active in production; must be retired with sentinel marker',
        });
      }
      migrationDetails.push({ version, classification, status: isRetiredSentinel ? 'retired-sentinel' : 'present-stop' });
      continue;
    }

    if (classification === 'UNKNOWN') {
      violations.push({
        code: 'PHASE12_GATE_UNKNOWN_PRODUCTION_MIGRATION',
        version,
        classification,
        reason: 'Unknown production migration not classified in migration policy',
      });
      migrationDetails.push({ version, classification, status: 'unknown' });
      continue;
    }

    if (classification === 'STAGING_ONLY') {
      violations.push({
        code: 'PHASE12_GATE_STAGING_ONLY_PRESENT',
        version,
        classification,
        reason: 'Staging-only migration present in production',
      });
      migrationDetails.push({ version, classification, status: 'present-stop' });
      continue;
    }

    migrationDetails.push({
      version,
      classification,
      laterPhase: getLaterPhaseName(version, policyData),
      status: 'present',
    });
  }

  // Phase 11 must be complete before a Phase 12 delivery. Read-only assertion —
  // this never applies, re-verifies, or alters a Phase 11 migration.
  for (const version of policyData.phase11Required) {
    if (!byVersion.has(version)) {
      violations.push({
        code: 'PHASE12_GATE_PHASE11_INCOMPLETE',
        version,
        classification: 'PHASE11_REQUIRED',
        reason: 'Phase 11 required migration is not applied; Phase 12 cannot be delivered first',
      });
    }
  }

  // Declared ANALYTICS predecessors must already be applied.
  for (const version of predecessors) {
    if (!byVersion.has(version)) {
      violations.push({
        code: 'PHASE12_GATE_PREDECESSOR_MISSING',
        version,
        classification: 'LATER_PHASE_APPROVED',
        reason: 'Required ANALYTICS predecessor migration is missing from ledger',
      });
    }
  }

  // Per-migration state for the Phase 12 apply set only.
  const phase12States = applySet.map((migration) => {
    const row = byVersion.get(migration.version);
    if (!row) {
      return { version: migration.version, classification: migration.classification, status: 'pending' };
    }
    if (!ledgerStatementsMatch(row, migration)) {
      violations.push({
        code: 'PHASE12_GATE_LEDGER_CHECKSUM_MISMATCH',
        version: migration.version,
        classification: migration.classification,
        reason: 'Phase 12 migration ledger entry does not match approved source file',
      });
      return { version: migration.version, classification: migration.classification, status: 'checksum-mismatch' };
    }
    return { version: migration.version, classification: migration.classification, status: 'applied' };
  });

  // Pending is derived from the hash-pinned apply set, never from the ledger, so
  // an unapproved migration can never enter the execution path. An already-applied
  // version is excluded, which makes apply idempotent: re-running after a
  // successful delivery yields an empty set and performs no writes.
  const pending = applySet.filter((migration) => !byVersion.has(migration.version));

  return Object.freeze({
    byVersion,
    predecessors,
    migrationDetails: Object.freeze(migrationDetails),
    phase12States: Object.freeze(phase12States),
    pending: Object.freeze(pending),
    violations: Object.freeze(violations),
    hasViolations: violations.length > 0,
  });
}

/**
 * Post-apply verification, independent of the Phase 11 `phase11States` path.
 *
 * Verifies directly against the production ledger that each allowlisted Phase 12
 * migration is present with the expected name and byte-exact statement list, and
 * that no version outside the apply set was added relative to the pre-apply
 * baseline.
 *
 * @param {Array} rows            ledger rows read after apply
 * @param {Array} migrations      the hash-verified Phase 12 apply set
 * @param {Object} [options]
 * @param {Set<string>|Array<string>} [options.baselineVersions] versions present before apply
 * @param {Object} [options.policyData] when supplied, also rejects unclassified rows
 */
export function verifyPhase12Applied(rows, migrations, { baselineVersions, policyData } = {}) {
  const applySet = migrations || PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS;
  const byVersion = new Map();
  for (const row of rows || []) {
    const version = String(row.version || '');
    if (version) byVersion.set(version, { version, name: String(row.name || ''), statements: row.statements });
  }

  const violations = [];
  const verified = [];

  for (const migration of applySet) {
    const row = byVersion.get(migration.version);
    if (!row) {
      violations.push({
        code: 'PHASE12_GATE_POST_APPLY_MIGRATION_ABSENT',
        version: migration.version,
        classification: migration.classification,
        reason: 'Migration is not present in the production ledger after apply',
      });
      continue;
    }
    if (row.name !== migration.name) {
      violations.push({
        code: 'PHASE12_GATE_POST_APPLY_NAME_MISMATCH',
        version: migration.version,
        classification: migration.classification,
        reason: 'Ledger name does not match the approved migration file name',
      });
      continue;
    }
    if (!ledgerStatementsMatch(row, migration)) {
      violations.push({
        code: 'PHASE12_GATE_POST_APPLY_CHECKSUM_MISMATCH',
        version: migration.version,
        classification: migration.classification,
        reason: 'Ledger statements do not match the approved, hash-pinned source file',
      });
      continue;
    }
    verified.push({
      version: migration.version,
      name: migration.name,
      sha256: migration.sha256,
      classification: migration.classification,
      status: 'applied',
    });
  }

  // Nothing outside the apply set may have appeared since the baseline snapshot.
  if (baselineVersions) {
    const baseline = baselineVersions instanceof Set ? baselineVersions : new Set(baselineVersions);
    const allowed = new Set(applySet.map((migration) => migration.version));
    for (const version of byVersion.keys()) {
      if (!baseline.has(version) && !allowed.has(version)) {
        violations.push({
          code: 'PHASE12_GATE_UNEXPECTED_MIGRATION_APPLIED',
          version,
          classification: 'UNKNOWN',
          reason: 'A migration outside the Phase 12 apply set was added during this operation',
        });
      }
    }
  }

  // Standalone verification (no baseline available, e.g. a fresh --verify process)
  // still rejects any row the policy cannot classify.
  if (policyData) {
    for (const version of byVersion.keys()) {
      if (version === policyData.stagingOnlySentinelVersion) continue;
      if (classifyMigration(version, policyData) === 'UNKNOWN') {
        violations.push({
          code: 'PHASE12_GATE_UNKNOWN_PRODUCTION_MIGRATION',
          version,
          classification: 'UNKNOWN',
          reason: 'Unknown production migration not classified in migration policy',
        });
      }
    }
  }

  return Object.freeze({
    verified: Object.freeze(verified),
    violations: Object.freeze(violations),
    hasViolations: violations.length > 0,
    applied: violations.length === 0 && verified.length === applySet.length,
  });
}

function writePhase12Report(write, report) {
  for (const detail of report.migrationDetails || []) {
    write(`PHASE12_LEDGER ${detail.version} ${detail.status}`);
  }
  for (const state of report.phase12States || []) {
    write(`PHASE12_APPLY_SET ${state.version} ${state.status}`);
  }
  for (const violation of report.violations || []) {
    write(formatPhase12Violation(violation));
  }
}

export function describePhase12Migrations(write) {
  for (const migration of PHASE12_ANALYTICS_PRODUCTION_MIGRATIONS) {
    write(`PHASE12_ALLOWLIST ${migration.file} ${migration.sha256} phase=${migration.phase} classification=${migration.classification}`);
  }
  write(`PHASE12_CONFIRMATION_TOKEN_APPLY ${PHASE12_ANALYTICS_CONFIRMATION_TOKENS.apply}`);
}

/**
 * Run the Phase 12 Analytics production migration operation.
 *
 * inspect — read-only. Opens BEGIN READ ONLY, reports ledger + apply-set state,
 *           never takes the advisory lock and never writes.
 * verify  — read-only. Confirms the apply set is present, named, and byte-exact.
 * apply   — preflight read-only evaluation; stops on any violation; otherwise takes
 *           the shared production advisory lock, re-evaluates under the lock, and
 *           executes only the hash-verified pending set, verifying the ledger after
 *           each migration.
 */
export async function runPhase12AnalyticsMigrationGate({
  operation,
  environment = process.env,
  root = defaultRoot,
  clientFactory = defaultClientFactory,
  write = () => {},
} = {}) {
  if (!['inspect', 'apply', 'verify'].includes(operation)) {
    throw new Phase12MigrationGateError('PHASE12_GATE_OPERATION_REQUIRED');
  }

  // Order matters: every check that can be made without touching production is
  // made first, so an unconfirmed or unapproved request never opens a connection.
  assertPhase12Confirmation(operation, environment);
  const policyData = await loadMigrationPolicy(root);
  assertPhase12PolicyApproval(policyData);
  const migrations = await loadPhase12ApprovedMigrations(root);
  const target = assertProductionTarget(environment);

  let client;
  let connected = false;
  let stage = 'client-create';

  try {
    client = await clientFactory({ ...target, root, dbMode: target.dbMode });
    stage = 'connect';
    await client.connect();
    connected = true;

    stage = 'ledger-read';
    const preflightRows = await readLedgerReadOnly(client);

    if (operation === 'verify') {
      stage = 'post-apply-verify';
      const verification = verifyPhase12Applied(preflightRows, migrations, { policyData });
      for (const entry of verification.verified) {
        write(`PHASE12_VERIFIED ${entry.version} ${entry.name} ${entry.status} sha256=${entry.sha256}`);
      }
      for (const violation of verification.violations) write(formatPhase12Violation(violation));
      return Object.freeze({ operation, verification, applied: Object.freeze([]), stopped: verification.hasViolations });
    }

    stage = 'ledger-evaluate';
    let report = evaluatePhase12AnalyticsLedger(preflightRows, migrations, policyData);
    writePhase12Report(write, report);

    if (report.violations.length || operation === 'inspect') {
      return Object.freeze({ operation, report, applied: Object.freeze([]), stopped: report.violations.length > 0 });
    }

    // Baseline captured before any mutation, used by post-apply verification to
    // prove nothing outside the apply set was added.
    const baselineVersions = new Set(report.byVersion.keys());

    stage = 'advisory-lock';
    await client.query(ADVISORY_LOCK_SQL);
    try {
      // Re-evaluate under the lock: another runner may have delivered between the
      // preflight read and the lock acquisition.
      stage = 'ledger-read';
      report = evaluatePhase12AnalyticsLedger(await readLedgerReadOnly(client), migrations, policyData);
      stage = 'ledger-evaluate';
      writePhase12Report(write, report);
      if (report.violations.length) {
        return Object.freeze({ operation, report, applied: Object.freeze([]), stopped: true });
      }

      const applied = [];
      for (const migration of report.pending) {
        stage = 'migration-apply';
        await applyOneMigration(client, migration);

        stage = 'post-apply-verify';
        const rowsAfter = await readLedgerReadOnly(client);
        const verification = verifyPhase12Applied(rowsAfter, [migration], { baselineVersions, policyData });
        for (const entry of verification.verified) {
          write(`PHASE12_VERIFIED ${entry.version} ${entry.name} ${entry.status} sha256=${entry.sha256}`);
        }
        for (const violation of verification.violations) write(formatPhase12Violation(violation));
        if (!verification.applied) {
          return Object.freeze({ operation, report, verification, applied: Object.freeze(applied), stopped: true });
        }

        applied.push(migration.version);
        baselineVersions.add(migration.version);
      }

      stage = 'ledger-read';
      const finalRows = await readLedgerReadOnly(client);
      stage = 'ledger-evaluate';
      report = evaluatePhase12AnalyticsLedger(finalRows, migrations, policyData);
      writePhase12Report(write, report);
      const verification = verifyPhase12Applied(finalRows, migrations, { policyData });
      for (const violation of verification.violations) write(formatPhase12Violation(violation));

      return Object.freeze({
        operation,
        report,
        verification,
        applied: Object.freeze(applied),
        stopped: report.violations.length > 0 || verification.hasViolations,
      });
    } finally {
      await client.query(ADVISORY_UNLOCK_SQL).catch(() => {});
    }
  } catch (error) {
    if (error instanceof Phase12MigrationGateError) throw error;
    if (error instanceof Phase11MigrationGateError) throw error;
    throw new Phase11DatabaseError(stage, error, { mode: target?.dbMode || 'direct' });
  } finally {
    if (connected) await client.end().catch(() => {});
  }
}

async function main() {
  const argument = process.argv.slice(2).at(0);
  if (argument === '--describe') {
    describePhase12Migrations(console.log);
    return;
  }
  const operation = argument === '--inspect'
    ? 'inspect'
    : argument === '--apply'
      ? 'apply'
      : argument === '--verify'
        ? 'verify'
        : null;
  try {
    const result = await runPhase12AnalyticsMigrationGate({ operation, write: console.log });
    const violations = [
      ...(result.report?.violations || []),
      ...(result.verification?.violations || []),
    ];
    if (violations.length > 0) {
      for (const violation of violations) console.error(formatPhase12Violation(violation));
      console.error(`PHASE12_VIOLATION_COUNT ${violations.length}`);
      console.error('PHASE12_GATE_STOPPED');
      process.exitCode = 1;
      return;
    }
    if (result.stopped) {
      console.error('PHASE12_GATE_STOPPED');
      process.exitCode = 1;
      return;
    }
    if (operation === 'apply') {
      console.log(`PHASE12_APPLIED_COUNT ${result.applied.length}`);
      for (const version of result.applied) console.log(`PHASE12_APPLIED ${version}`);
    }
  } catch (error) {
    if (error instanceof Phase12MigrationGateError || error instanceof Phase11MigrationGateError) {
      console.error(error.code);
    } else if (error instanceof Phase11DatabaseError) {
      console.error(formatPhase11DatabaseError(error));
    } else {
      console.error('PHASE12_GATE_FAILED');
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
