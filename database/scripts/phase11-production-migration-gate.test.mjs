import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  evaluateProductionLedger,
  loadApprovedMigrations,
  assertProductionTarget,
  Phase11MigrationGateError,
  PHASE11_PRODUCTION_MIGRATIONS,
  PHASE11_STAGING_ONLY_MIGRATION,
  STAGING_ONLY_RETIRED_NAME,
} from './phase11-production-migration-gate.mjs';
import {
  loadMigrationPolicy,
  classifyMigration,
  getLaterPhaseName,
} from './migration-policy-loader.mjs';

let policyData;

test.before(async () => {
  // Load policy once for all tests
  policyData = await loadMigrationPolicy();
});

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
  // Check migrations 32, 33, 34 (Phase 15)
  assert.equal(classifyMigration('20260810000032', policyData), 'LATER_PHASE_APPROVED');
  assert.equal(classifyMigration('20260810000033', policyData), 'LATER_PHASE_APPROVED');
  assert.equal(classifyMigration('20260810000034', policyData), 'LATER_PHASE_APPROVED');
  
  // Check migrations 41, 42, 43 (Analytics)
  assert.equal(classifyMigration('20260810000041', policyData), 'LATER_PHASE_APPROVED');
  assert.equal(classifyMigration('20260810000042', policyData), 'LATER_PHASE_APPROVED');
  assert.equal(classifyMigration('20260810000043', policyData), 'LATER_PHASE_APPROVED');
});

test('Migration classification: Unknown migration', () => {
  assert.equal(classifyMigration('20260810000099', policyData), 'UNKNOWN');
});

test('Later phase identification', () => {
  assert.equal(getLaterPhaseName('20260810000032', policyData), 'PHASE15');
  assert.equal(getLaterPhaseName('20260810000033', policyData), 'PHASE15');
  assert.equal(getLaterPhaseName('20260810000034', policyData), 'PHASE15');
  
  assert.equal(getLaterPhaseName('20260810000041', policyData), 'ANALYTICS');
  assert.equal(getLaterPhaseName('20260810000042', policyData), 'ANALYTICS');
  assert.equal(getLaterPhaseName('20260810000043', policyData), 'ANALYTICS');
  
  assert.equal(getLaterPhaseName('20260810000035', policyData), null);
});

test('Ledger evaluation: Clean state (no migrations)', () => {
  const rows = [];
  const result = evaluateProductionLedger(rows, PHASE11_PRODUCTION_MIGRATIONS, policyData);
  
  // Should have violations for missing predecessors
  assert(result.violations.length > 0);
  const missingPredecessorViolations = result.violations.filter(v => v.code === 'PHASE11_GATE_PREDECESSOR_MISSING');
  assert.equal(missingPredecessorViolations.length, 9); // 9 predecessors
});

test('Ledger evaluation: All Phase 11 predecessors present', async () => {
  const approvedMigrations = await loadApprovedMigrations();
  const rows = policyData.phase11Predecessors.map(version => ({
    version,
    name: `migration_${version}`,
    statements: ['BEGIN', 'COMMIT'],
  }));
  
  const result = evaluateProductionLedger(rows, approvedMigrations, policyData);
  
  // Should have violations for missing Phase 11 required (35,36,38,39,40)
  // but NOT for predecessors or later phases
  const missingPredecessorViolations = result.violations.filter(v => v.code === 'PHASE11_GATE_PREDECESSOR_MISSING');
  assert.equal(missingPredecessorViolations.length, 0);
});

test('Ledger evaluation: Staging-only migration 37 active (should violate)', () => {
  const rows = [
    {
      version: '20260810000037',
      name: 'add_phase11_internal_fake_canary',
      statements: ['BEGIN', 'SELECT 1', 'COMMIT'],
    },
  ];
  
  const result = evaluateProductionLedger(rows, PHASE11_PRODUCTION_MIGRATIONS, policyData);
  
  const stagingViolations = result.violations.filter(v => v.code === 'PHASE11_GATE_STAGING_ONLY_37_PRESENT');
  assert.equal(stagingViolations.length, 1);
  assert.equal(stagingViolations[0].version, '20260810000037');
});

test('Ledger evaluation: Staging-only migration 37 retired (sentinel - should NOT violate)', () => {
  const rows = [
    {
      version: '20260810000037',
      name: STAGING_ONLY_RETIRED_NAME,
      statements: [],
    },
  ];
  
  const result = evaluateProductionLedger(rows, PHASE11_PRODUCTION_MIGRATIONS, policyData);
  
  const stagingViolations = result.violations.filter(v => v.code === 'PHASE11_GATE_STAGING_ONLY_37_PRESENT');
  assert.equal(stagingViolations.length, 0);
});

test('Ledger evaluation: Later-phase approved migration (should NOT violate)', () => {
  const rows = [
    {
      version: '20260810000041',
      name: 'add_analytics_schema',
      statements: ['BEGIN', 'CREATE SCHEMA', 'COMMIT'],
    },
  ];
  
  const result = evaluateProductionLedger(rows, PHASE11_PRODUCTION_MIGRATIONS, policyData);
  
  // Should NOT have violation for analytics migration
  const analyticsViolations = result.violations.filter(v => v.version === '20260810000041');
  assert.equal(analyticsViolations.length, 0);
});

test('Ledger evaluation: Unknown post-31 migration (should violate)', () => {
  const rows = [
    {
      version: '20260810000099',
      name: 'mysterious_migration',
      statements: ['BEGIN', 'COMMIT'],
    },
  ];
  
  const result = evaluateProductionLedger(rows, PHASE11_PRODUCTION_MIGRATIONS, policyData);
  
  const unknownViolations = result.violations.filter(v => v.code === 'PHASE11_GATE_UNKNOWN_PRODUCTION_MIGRATION');
  assert.equal(unknownViolations.length, 1);
});

test('Ledger evaluation: Duplicate version (should violate)', () => {
  const rows = [
    { version: '20260810000035', name: 'migration1', statements: ['BEGIN', 'COMMIT'] },
    { version: '20260810000035', name: 'migration1_dup', statements: ['BEGIN', 'COMMIT'] },
  ];
  
  const result = evaluateProductionLedger(rows, PHASE11_PRODUCTION_MIGRATIONS, policyData);
  
  const ledgerInvalidViolations = result.violations.filter(v => v.code === 'PHASE11_GATE_LEDGER_INVALID');
  assert(ledgerInvalidViolations.length > 0);
});

test('Ledger evaluation: Phase 11 required migrations with correct order applied', async () => {
  const approvedMigrations = await loadApprovedMigrations();
  
  // Create rows with predecessors + all Phase 11 required in order
  // For predecessors, use mock statements (they won't be checksummed)
  // For Phase 11 required, use the actual statements from approved migrations so checksums match
  const rows = [
    ...policyData.phase11Predecessors.map(version => ({
      version,
      name: `migration_${version}`,
      statements: ['BEGIN', 'COMMIT'],
    })),
    ...approvedMigrations.map(migration => ({
      version: migration.version,
      name: migration.name,
      statements: migration.statements,
    })),
  ];
  
  const result = evaluateProductionLedger(rows, approvedMigrations, policyData);
  
  // No violations should exist
  assert.equal(result.violations.length, 0);
  assert.equal(result.hasViolations, false);
});

test('Policy structure is valid', () => {
  assert(policyData.policy.policyVersion);
  assert(Array.isArray(policyData.phase11Predecessors));
  assert(Array.isArray(policyData.phase11Required));
  assert.equal(policyData.stagingOnlySentinelVersion, '20260810000037');
  assert.equal(policyData.stagingOnlySentinelName, STAGING_ONLY_RETIRED_NAME);
  assert(policyData.allApprovedMigrations instanceof Set);
  assert(policyData.stagingOnlyMigrations instanceof Set);
});

test('All Phase 11 required migrations are in all approved migrations', () => {
  for (const version of policyData.phase11Required) {
    assert(policyData.allApprovedMigrations.has(version), `${version} not in allApprovedMigrations`);
  }
});

test('All Phase 11 predecessors are in all approved migrations', () => {
  for (const version of policyData.phase11Predecessors) {
    assert(policyData.allApprovedMigrations.has(version), `${version} not in allApprovedMigrations`);
  }
});

test('Staging-only migration 37 is NOT in allApprovedMigrations', () => {
  assert(!policyData.allApprovedMigrations.has('20260810000037'));
});

// Database mode and target validation tests
const projectRef = 'fytnwpnnvqecjmyhrzcx';
const directUrl = `postgresql://postgres:password@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`;
const poolerUrl = 'postgresql://postgres.fytnwpnnvqecjmyhrzcx:password@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full';
const ca = '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----';

test('Session Pooler URL + session-pooler mode = accepted', () => {
  const env = {
    PHASE11_PRODUCTION_DATABASE_URL: poolerUrl,
    PHASE11_PRODUCTION_PROJECT_REF: projectRef,
    PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
    PHASE11_PRODUCTION_DATABASE_CA_PEM: ca,
  };
  const result = assertProductionTarget(env);
  assert.equal(result.dbMode, 'session-pooler');
  assert(result.connectionString.includes('pooler.supabase.com'));
});

test('Direct URL + direct mode = accepted', () => {
  const env = {
    PHASE11_PRODUCTION_DATABASE_URL: directUrl,
    PHASE11_PRODUCTION_PROJECT_REF: projectRef,
    PHASE11_PRODUCTION_DB_MODE: 'direct',
    PHASE11_PRODUCTION_DATABASE_CA_PEM: ca,
  };
  const result = assertProductionTarget(env);
  assert.equal(result.dbMode, 'direct');
  assert(result.connectionString.includes(`db.${projectRef}`));
});

test('Session Pooler URL + direct mode = rejected', () => {
  const env = {
    PHASE11_PRODUCTION_DATABASE_URL: poolerUrl,
    PHASE11_PRODUCTION_PROJECT_REF: projectRef,
    PHASE11_PRODUCTION_DB_MODE: 'direct',
    PHASE11_PRODUCTION_DATABASE_CA_PEM: ca,
  };
  assert.throws(() => assertProductionTarget(env), (err) => {
    return err instanceof Phase11MigrationGateError 
      && err.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED';
  }, 'Should reject session-pooler URL with direct mode');
});

test('Direct URL + session-pooler mode = rejected', () => {
  const env = {
    PHASE11_PRODUCTION_DATABASE_URL: directUrl,
    PHASE11_PRODUCTION_PROJECT_REF: projectRef,
    PHASE11_PRODUCTION_DB_MODE: 'session-pooler',
    PHASE11_PRODUCTION_DATABASE_CA_PEM: ca,
  };
  assert.throws(() => assertProductionTarget(env), (err) => {
    return err instanceof Phase11MigrationGateError 
      && err.code === 'PHASE11_GATE_PRODUCTION_TARGET_UNVERIFIED';
  }, 'Should reject direct URL with session-pooler mode');
});
