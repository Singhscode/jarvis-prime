import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CommitOutcomeUnknownError,
  EmailAlreadyExistsError,
  OwnerAlreadyExistsError,
  OwnerBootstrapService,
  TransactionError,
} from '../src/modules/auth/owner-bootstrap.service.js';
import {
  PRODUCTION_PROJECT_REF,
  runOwnerBootstrapCli,
  validateBootstrapEnvironment,
} from '../scripts/bootstrap-owner.js';

const ownerId = '10000000-0000-4000-8000-000000000001';
const auditId = '90000000-0000-4000-8000-000000000001';
const strongPassword = 'UniqueOwner!2026X';
const productionUrl = `postgresql://postgres.${PRODUCTION_PROJECT_REF}:secret@aws-0.test.pooler.supabase.com:5432/postgres`;
const productionEnvironment = (url = productionUrl) => ({
  NODE_ENV: 'production',
  PRODUCTION_DATABASE_URL: url,
});
const productionConfig = {
  host: 'aws-0.test.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: `postgres.${PRODUCTION_PROJECT_REF}`,
  password: 'secret',
  ssl: { rejectUnauthorized: true },
  application_name: 'jarvis-prime-owner-bootstrap',
};
const bootstrapMarker = {
  id: auditId,
  user_id: ownerId,
  event_type: 'owner.bootstrap_completed',
  action: 'create',
  resource_type: 'user',
  resource_id: ownerId,
  success: true,
  details: { source: 'owner:bootstrap', version: 1 },
};

class FakeDatabase {
  constructor(options = {}) {
    this.queryFailure = options.queryFailure || (options.match ? options : null);
    this.connectFailure = options.connectFailure || null;
    this.rollbackFailure = options.rollbackFailure || null;
    this.endFailure = options.endFailure || null;
    this.queries = [];
    this.ended = false;
  }
  async connect() {
    if (this.connectFailure) throw this.connectFailure;
  }
  async query(sql) {
    this.queries.push(sql);
    if (sql === 'rollback' && this.rollbackFailure) throw this.rollbackFailure;
    if (this.queryFailure && sql.includes(this.queryFailure.match)) {
      throw this.queryFailure.error;
    }
    return { rows: [] };
  }
  async end() {
    this.ended = true;
    if (this.endFailure) throw this.endFailure;
  }
}

function dependencies({
  existingOwners = [], existingUser = null, existingMarker = null,
  markerSequence = null, auditFailure = null, database,
  failureStage = null, stageError = null,
} = {}) {
  let ownerChecks = 0;
  let markerChecks = 0;
  const db = database || new FakeDatabase();
  const fail = (stage) => {
    if (failureStage === stage) throw stageError;
  };
  return {
    db,
    users: {
      findOwnerBootstrapAuditForUpdate: async () => {
        const stage = markerChecks === 0 ? 'marker_lookup' : 'final_marker_lookup';
        fail(stage);
        const result = markerSequence
          ? markerSequence[markerChecks]
          : (existingMarker || (markerChecks > 0 ? bootstrapMarker : null));
        markerChecks += 1;
        return result || null;
      },
      findUserByNormalizedEmailForUpdate: async () => {
        fail('email_lookup');
        return existingUser;
      },
      createInitialOwner: async (_transaction, input) => {
        fail('user_insert');
        return { id: ownerId, ...input };
      },
      createAuditLog: async () => {
        fail('audit_insert');
        if (auditFailure) throw auditFailure;
        return { id: auditId };
      },
    },
    owners: {
      findAuthorizedOwnerWorkspaceUsersForUpdate: async () => {
        const stage = ownerChecks === 0 ? 'owner_lookup' : 'final_owner_lookup';
        fail(stage);
        ownerChecks += 1;
        return ownerChecks === 1 ? existingOwners : [{ id: ownerId }];
      },
      isAuthorizedOwnerWorkspaceUserInTransaction: async () => {
        fail('final_authorization');
        return true;
      },
    },
  };
}

describe('OwnerBootstrapService', () => {
  test('creates one active Owner and durable audit marker in one transaction', async () => {
    const { db, users, owners } = dependencies();
    const service = new OwnerBootstrapService({
      connectionConfig: productionConfig,
      clientFactory: () => db,
      users,
      owners,
    });
    const result = await service.bootstrap({
      fullName: 'Anuj Singh', email: 'OWNER@EXAMPLE.COM', password: strongPassword,
    });
    assert.deepEqual(result, { ownerId, auditId });
    assert.ok(db.queries.includes('begin'));
    assert.ok(db.queries.includes('commit'));
    assert.equal(db.queries.includes('rollback'), false);
    assert.equal(db.ended, true);
  });

  test('returns stable validation reasons before opening a connection', async () => {
    let created = false;
    const service = new OwnerBootstrapService({
      connectionConfig: productionConfig,
      clientFactory: () => { created = true; return new FakeDatabase(); },
    });
    await assert.rejects(
      service.bootstrap({ fullName: '', email: 'owner@example.com', password: strongPassword }),
      { code: 'VALIDATION_FULL_NAME' }
    );
    await assert.rejects(
      service.bootstrap({ fullName: 'Owner', email: 'invalid-email', password: strongPassword }),
      { code: 'VALIDATION_EMAIL' }
    );
    await assert.rejects(
      service.bootstrap({ fullName: 'Owner', email: 'owner@example.com', password: 'weak' }),
      { code: 'VALIDATION_PASSWORD_TOO_SHORT' }
    );
    await assert.rejects(
      service.bootstrap({ fullName: 'Owner', email: 'owner@example.com', password: `A1!${'x'.repeat(126)}` }),
      { code: 'VALIDATION_PASSWORD_TOO_LONG' }
    );
    assert.equal(created, false);
  });

  test('refuses a durable bootstrap marker before mutable Owner eligibility', async () => {
    const deletedOwnerMarker = { ...bootstrapMarker, user_id: null };
    const { db, users, owners } = dependencies({ existingMarker: deletedOwnerMarker });
    let ownerLookupCalled = false;
    owners.findAuthorizedOwnerWorkspaceUsersForUpdate = async () => {
      ownerLookupCalled = true;
      return [];
    };
    const service = new OwnerBootstrapService({
      connectionConfig: productionConfig, clientFactory: () => db, users, owners,
    });
    await assert.rejects(
      service.bootstrap({ fullName: 'Owner', email: 'owner@example.com', password: strongPassword }),
      OwnerAlreadyExistsError
    );
    assert.equal(ownerLookupCalled, false);
    assert.ok(db.queries.includes('rollback'));
  });

  test('refuses when an Owner already exists and rolls back', async () => {
    const { db, users, owners } = dependencies({ existingOwners: [{ id: 'existing' }] });
    const service = new OwnerBootstrapService({
      connectionConfig: productionConfig, clientFactory: () => db, users, owners,
    });
    await assert.rejects(
      service.bootstrap({ fullName: 'Owner', email: 'owner@example.com', password: strongPassword }),
      OwnerAlreadyExistsError
    );
    assert.ok(db.queries.includes('rollback'));
    assert.equal(db.queries.includes('commit'), false);
  });

  test('refuses an existing email and rolls back', async () => {
    const { db, users, owners } = dependencies({ existingUser: { id: 'existing' } });
    const service = new OwnerBootstrapService({
      connectionConfig: productionConfig, clientFactory: () => db, users, owners,
    });
    await assert.rejects(
      service.bootstrap({ fullName: 'Owner', email: 'owner@example.com', password: strongPassword }),
      EmailAlreadyExistsError
    );
    assert.ok(db.queries.includes('rollback'));
  });

  test('maps every main transaction stage to an exact diagnostic code', async (t) => {
    const stages = [
      ['client_create', 'TRANSACTION_CLIENT_CREATE_FAILED', null, false, 'CONNECT'],
      ['connect', 'UNKNOWN_CONNECT_ERROR', null, false, 'CONNECT'],
      ['begin', 'TRANSACTION_BEGIN_FAILED', 'begin', false, 'BEGIN'],
      ['lock_timeout_config', 'TRANSACTION_LOCK_TIMEOUT_CONFIG_FAILED', 'lock_timeout', true,
        'SET_LOCK_TIMEOUT'],
      ['statement_timeout_config', 'TRANSACTION_STATEMENT_TIMEOUT_CONFIG_FAILED',
        'statement_timeout', true, 'SET_STATEMENT_TIMEOUT'],
      ['advisory_lock', 'TRANSACTION_ADVISORY_LOCK_FAILED', 'pg_advisory_xact_lock', true,
        'ADVISORY_LOCK'],
      ['table_lock', 'TRANSACTION_TABLE_LOCK_FAILED', 'lock table', true, 'LOCK_USERS'],
      ['marker_lookup', 'TRANSACTION_MARKER_LOOKUP_FAILED', null, true, 'CHECK_EXISTING_OWNER'],
      ['owner_lookup', 'TRANSACTION_OWNER_LOOKUP_FAILED', null, true, 'CHECK_EXISTING_OWNER'],
      ['email_lookup', 'TRANSACTION_EMAIL_LOOKUP_FAILED', null, true, 'CHECK_EMAIL'],
      ['user_insert', 'TRANSACTION_USER_INSERT_FAILED', null, true, 'INSERT_OWNER'],
      ['audit_insert', 'TRANSACTION_AUDIT_INSERT_FAILED', null, true, 'INSERT_AUDIT'],
      ['final_authorization', 'TRANSACTION_FINAL_AUTHORIZATION_FAILED', null, true,
        'VERIFY_OWNER'],
      ['final_owner_lookup', 'TRANSACTION_FINAL_OWNER_LOOKUP_FAILED', null, true,
        'VERIFY_OWNER'],
      ['final_marker_lookup', 'TRANSACTION_FINAL_MARKER_LOOKUP_FAILED', null, true,
        'VERIFY_OWNER'],
    ];

    for (const [stage, code, queryMatch, expectsRollback, expectedFailedStage] of stages) {
      await t.test(stage, async () => {
        const injected = Object.assign(new Error(`private ${stage} failure`), { code: 'XX001' });
        let db = new FakeDatabase();
        let clientFactory = () => db;
        let deps;

        if (stage === 'client_create') {
          clientFactory = () => { throw injected; };
          deps = dependencies();
        } else if (stage === 'connect') {
          db = new FakeDatabase({ connectFailure: injected });
          deps = dependencies({ database: db });
        } else if (queryMatch) {
          db = new FakeDatabase({ queryFailure: { match: queryMatch, error: injected } });
          deps = dependencies({ database: db });
        } else {
          deps = dependencies({ database: db, failureStage: stage, stageError: injected });
        }

        const service = new OwnerBootstrapService({
          connectionConfig: productionConfig,
          clientFactory,
          users: deps.users,
          owners: deps.owners,
        });
        await assert.rejects(
          service.bootstrap({
            fullName: 'Owner', email: 'owner@example.com', password: strongPassword,
          }),
          (error) => {
            assert.ok(error instanceof TransactionError);
            assert.equal(error.code, code);
            assert.equal(error.operation, stage);
            assert.equal(error.stage, stage);
            assert.equal(error.sqlState, 'XX001');
            if (stage === 'connect') {
              assert.equal(error.pgErrorCode, 'XX001');
              assert.equal(error.errorClass, 'Error');
              assert.equal(error.errorName, 'Error');
              assert.equal(error.errno, null);
              assert.equal(error.syscall, null);
            } else {
              assert.equal(Object.hasOwn(error, 'pgErrorCode'), false);
              assert.equal(Object.hasOwn(error, 'errorClass'), false);
              assert.equal(Object.hasOwn(error, 'errorName'), false);
              assert.equal(Object.hasOwn(error, 'errno'), false);
              assert.equal(Object.hasOwn(error, 'syscall'), false);
            }
            assert.equal(error.rollbackStatus, expectsRollback ? 'completed' : 'not_started');
            assert.equal(error.failedStage, expectedFailedStage);
            return true;
          }
        );
        assert.equal(db.queries.includes('rollback'), expectsRollback);
      });
    }
  });

  test('maps and sanitizes initial pg connection failures without retaining private details', async (t) => {
    const cases = [
      ['ERR_TLS_CERT_ALTNAME_INVALID', 'TLS_HOSTNAME'],
      ['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT'],
      ['SELF_SIGNED_CERT_IN_CHAIN', 'SELF_SIGNED_CERT'],
      ['CERT_HAS_EXPIRED', 'CERT_HAS_EXPIRED'],
      ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'],
      ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'TLS_CERTIFICATE_CHAIN'],
      ['ECONNREFUSED', 'ECONNREFUSED'],
      ['ENOTFOUND', 'ENOTFOUND'],
      ['ETIMEDOUT', 'ETIMEDOUT'],
      ['ECONNRESET', 'ECONNRESET'],
      ['28P01', '28P01'],
      ['ERR_PRIVATE_UNKNOWN', 'UNKNOWN_CONNECT_ERROR'],
    ];

    for (const [pgErrorCode, stableCode] of cases) {
      await t.test(pgErrorCode, async () => {
        const connectionError = Object.assign(new TypeError('private connection detail'), {
          code: pgErrorCode,
          errno: pgErrorCode,
          syscall: 'connect',
        });
        const db = new FakeDatabase({ connectFailure: connectionError });
        const { users, owners } = dependencies({ database: db });
        const service = new OwnerBootstrapService({
          connectionConfig: productionConfig,
          clientFactory: () => db,
          users,
          owners,
        });

        await assert.rejects(
          service.bootstrap({
            fullName: 'Owner', email: 'owner@example.com', password: strongPassword,
          }),
          (error) => {
            assert.equal(error.code, stableCode);
            assert.equal(error.operation, 'connect');
            assert.equal(error.sqlState, pgErrorCode === '28P01' ? '28P01' : null);
            assert.equal(error.pgErrorCode, pgErrorCode);
            assert.equal(error.errorClass, 'TypeError');
            assert.equal(error.errorName, 'TypeError');
            assert.equal(error.errno, pgErrorCode);
            assert.equal(error.syscall, 'connect');
            assert.equal(error.rollbackStatus, 'not_started');
            assert.equal(Object.hasOwn(error, 'cause'), false);
            assert.equal(error.message, stableCode);
            return true;
          }
        );
      });
    }

    const malformed = Object.assign(new Error('private malformed detail'), {
      code: 'private-code!',
      name: 'private error!',
      errno: { private: true },
      syscall: 'connect private-host',
    });
    const db = new FakeDatabase({ connectFailure: malformed });
    const { users, owners } = dependencies({ database: db });
    await assert.rejects(
      new OwnerBootstrapService({
        connectionConfig: productionConfig,
        clientFactory: () => db,
        users,
        owners,
      }).bootstrap({ fullName: 'Owner', email: 'owner@example.com', password: strongPassword }),
      (error) => {
        assert.equal(error.code, 'UNKNOWN_CONNECT_ERROR');
        assert.equal(error.pgErrorCode, null);
        assert.equal(error.errorClass, 'Error');
        assert.equal(error.errorName, null);
        assert.equal(error.errno, null);
        assert.equal(error.syscall, null);
        return true;
      }
    );
  });

  test('maps 23505 to EMAIL_ALREADY_EXISTS only for the user insert', async () => {
    const duplicate = Object.assign(new Error('duplicate detail must stay private'), { code: '23505' });
    const userInsert = dependencies({ failureStage: 'user_insert', stageError: duplicate });
    await assert.rejects(
      new OwnerBootstrapService({
        connectionConfig: productionConfig,
        clientFactory: () => userInsert.db,
        users: userInsert.users,
        owners: userInsert.owners,
      }).bootstrap({ fullName: 'Owner', email: 'owner@example.com', password: strongPassword }),
      EmailAlreadyExistsError
    );
    assert.ok(userInsert.db.queries.includes('rollback'));

    const auditInsert = dependencies({ failureStage: 'audit_insert', stageError: duplicate });
    await assert.rejects(
      new OwnerBootstrapService({
        connectionConfig: productionConfig,
        clientFactory: () => auditInsert.db,
        users: auditInsert.users,
        owners: auditInsert.owners,
      }).bootstrap({ fullName: 'Owner', email: 'owner@example.com', password: strongPassword }),
      (error) => {
        assert.equal(error.code, 'TRANSACTION_AUDIT_INSERT_FAILED');
        assert.equal(error.sqlState, '23505');
        assert.equal(error.rollbackStatus, 'completed');
        return true;
      }
    );
    assert.ok(auditInsert.db.queries.includes('rollback'));
  });

  test('rollback and close failures preserve the primary operation code', async () => {
    const primary = Object.assign(new Error('private audit failure'), { code: 'XX002' });
    const rollback = Object.assign(new Error('private rollback failure'), { code: '08006' });
    const db = new FakeDatabase({
      rollbackFailure: rollback,
      endFailure: new Error('private close failure'),
    });
    const { users, owners } = dependencies({
      database: db,
      failureStage: 'audit_insert',
      stageError: primary,
    });
    const service = new OwnerBootstrapService({
      connectionConfig: productionConfig, clientFactory: () => db, users, owners,
    });
    await assert.rejects(
      service.bootstrap({ fullName: 'Owner', email: 'owner@example.com', password: strongPassword }),
      (error) => {
        assert.equal(error.code, 'TRANSACTION_AUDIT_INSERT_FAILED');
        assert.equal(error.operation, 'audit_insert');
        assert.equal(error.sqlState, 'XX002');
        assert.equal(error.rollbackStatus, 'failed');
        return true;
      }
    );
    assert.ok(db.queries.includes('rollback'));
    assert.equal(db.ended, true);
  });

  test('returns success after a lost COMMIT acknowledgement is reconciled', async () => {
    const original = new FakeDatabase({ match: 'commit', error: new Error('acknowledgement lost') });
    const reconciliation = new FakeDatabase();
    const { users, owners } = dependencies({ database: original });
    let calls = 0;
    let originalClosedBeforeReconciliation = false;
    const service = new OwnerBootstrapService({
      connectionConfig: productionConfig,
      clientFactory: () => {
        calls += 1;
        if (calls === 1) return original;
        originalClosedBeforeReconciliation = original.ended;
        return reconciliation;
      },
      users,
      owners,
    });
    const result = await service.bootstrap({
      fullName: 'Owner', email: 'owner@example.com', password: strongPassword,
    });
    assert.deepEqual(result, { ownerId, auditId });
    assert.equal(originalClosedBeforeReconciliation, true);
    assert.ok(reconciliation.queries.includes('begin isolation level repeatable read'));
    assert.ok(reconciliation.queries.includes('rollback'));
  });

  test('fails closed when a COMMIT outcome cannot be established', async () => {
    const original = new FakeDatabase({ match: 'commit', error: new Error('commit not applied') });
    const reconciliation = new FakeDatabase();
    const { users, owners } = dependencies({
      database: original,
      markerSequence: [null, bootstrapMarker, null],
    });
    let calls = 0;
    const service = new OwnerBootstrapService({
      connectionConfig: productionConfig,
      clientFactory: () => (calls++ === 0 ? original : reconciliation),
      users,
      owners,
    });
    await assert.rejects(
      service.bootstrap({ fullName: 'Owner', email: 'owner@example.com', password: strongPassword }),
      (error) => {
        assert.ok(error instanceof CommitOutcomeUnknownError);
        assert.equal(error.code, 'COMMIT_OUTCOME_UNKNOWN');
        assert.equal(error.stage, 'reconciliation_assertion');
        assert.equal(error.failedStage, 'POST_COMMIT_RECONCILIATION');
        assert.equal(error.rollbackStatus, 'completed');
        return true;
      }
    );
    assert.equal(original.queries.includes('rollback'), false);
  });

  test('reconciliation clientFactory failure remains COMMIT_OUTCOME_UNKNOWN', async () => {
    const commitError = Object.assign(new Error('private commit detail'), { code: '08006' });
    const reconciliationError = Object.assign(
      new Error('private connection configuration detail'),
      { code: '08001' }
    );
    const original = new FakeDatabase({ match: 'commit', error: commitError });
    const { users, owners } = dependencies({ database: original });
    let calls = 0;
    const service = new OwnerBootstrapService({
      connectionConfig: productionConfig,
      clientFactory: () => {
        calls += 1;
        if (calls === 1) return original;
        throw reconciliationError;
      },
      users,
      owners,
    });
    await assert.rejects(
      service.bootstrap({ fullName: 'Owner', email: 'owner@example.com', password: strongPassword }),
      (error) => {
        assert.ok(error instanceof CommitOutcomeUnknownError);
        assert.equal(error.code, 'COMMIT_OUTCOME_UNKNOWN');
        assert.equal(error.operation, 'reconciliation_client_create');
        assert.equal(error.stage, 'reconciliation_client_create');
        assert.equal(error.sqlState, '08001');
        assert.equal(error.commitSqlState, '08006');
        assert.equal(error.failedStage, 'POST_COMMIT_RECONCILIATION');
        assert.equal(error.rollbackStatus, 'not_started');
        return true;
      }
    );
    assert.equal(original.queries.includes('rollback'), false);
    assert.equal(original.ended, true);
  });
});

describe('owner bootstrap CLI', () => {
  const testCaPath = '/tmp/supabase-root-2021-ca.pem';
  const testCa = 'verified-supabase-root-ca';
  const productionEnvironmentWithCa = (url) => ({
    ...productionEnvironment(url),
    PRODUCTION_DATABASE_CA_PATH: testCaPath,
  });
  const validateEnvironmentForTest = (env) => validateBootstrapEnvironment(env, {
    loadCa: (caPath) => {
      assert.equal(caPath, testCaPath);
      return testCa;
    },
  });
  const productionConfigWithCa = {
    ...productionConfig,
    ssl: { ca: testCa, rejectUnauthorized: true },
  };
  const runTestCli = (options) => runOwnerBootstrapCli({
    ...options,
    validateEnvironment: () => productionConfig,
  });

  test('accepts official Direct and Session Pooler URIs with strict project binding', () => {
    const directUrl = `postgresql://postgres:secret@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`;
    const directConfig = {
      ...productionConfigWithCa,
      host: `db.${PRODUCTION_PROJECT_REF}.supabase.co`,
      user: 'postgres',
    };

    for (const suffix of ['', '?sslmode=require']) {
      assert.deepEqual(
        validateEnvironmentForTest(productionEnvironmentWithCa(`${productionUrl}${suffix}`)),
        productionConfigWithCa
      );
      assert.deepEqual(
        validateEnvironmentForTest(productionEnvironmentWithCa(`${directUrl}${suffix}`)),
        directConfig
      );
    }
  });

  test('validates the pinned, scoped CA file without retaining its content', async () => {
    const [{ mkdtempSync, rmSync, writeFileSync }, { X509Certificate }, { rootCertificates },
      { tmpdir }, { join }, bootstrap] = await Promise.all([
      import('node:fs'), import('node:crypto'), import('node:tls'), import('node:os'),
      import('node:path'), import('../scripts/bootstrap-owner.js'),
    ]);
    const directory = mkdtempSync(join(tmpdir(), 'owner-bootstrap-ca-'));
    const caPath = join(directory, 'root.pem');
    const invalidPath = join(directory, 'invalid.pem');
    const oversizedPath = join(directory, 'oversized.pem');
    const pem = rootCertificates[0];
    const certificate = new X509Certificate(pem);

    try {
      writeFileSync(caPath, pem, { mode: 0o600 });
      assert.equal(
        bootstrap.loadProductionDatabaseCa(caPath, certificate.fingerprint256),
        `${pem.trim()}\n`
      );
      assert.throws(
        () => bootstrap.loadProductionDatabaseCa('root.pem', certificate.fingerprint256),
        { code: 'VALIDATION_DATABASE_CA_PATH' }
      );
      assert.throws(
        () => bootstrap.loadProductionDatabaseCa(join(directory, 'missing.pem'), certificate.fingerprint256),
        { code: 'VALIDATION_DATABASE_CA_PATH' }
      );
      assert.throws(
        () => bootstrap.loadProductionDatabaseCa(directory, certificate.fingerprint256),
        { code: 'VALIDATION_DATABASE_CA_FILE' }
      );
      writeFileSync(invalidPath, 'not a PEM certificate', { mode: 0o600 });
      assert.throws(
        () => bootstrap.loadProductionDatabaseCa(invalidPath, certificate.fingerprint256),
        { code: 'VALIDATION_DATABASE_CA_FILE' }
      );
      writeFileSync(oversizedPath, 'A'.repeat(bootstrap.MAX_PRODUCTION_DATABASE_CA_FILE_BYTES),
        { mode: 0o600 });
      assert.throws(
        () => bootstrap.loadProductionDatabaseCa(oversizedPath, certificate.fingerprint256),
        { code: 'VALIDATION_DATABASE_CA_FILE' }
      );
      assert.throws(
        () => bootstrap.loadProductionDatabaseCa(caPath, '00'.repeat(32).match(/../g).join(':')),
        { code: 'VALIDATION_DATABASE_CA_FILE' }
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('requires the session-only CA path before creating a bootstrap client', () => {
    assert.throws(
      () => validateBootstrapEnvironment(productionEnvironment()),
      { code: 'VALIDATION_DATABASE_CA_PATH' }
    );
  });

  test('decodes a percent-encoded password exactly once without changing TLS', () => {
    const encodedUrl = `postgresql://postgres.${PRODUCTION_PROJECT_REF}:Owner%40Pass%3A2026%2F%23%3F%25@aws-0.test.pooler.supabase.com:5432/postgres?sslmode=require`;
    assert.deepEqual(validateEnvironmentForTest(productionEnvironmentWithCa(encodedUrl)), {
      ...productionConfigWithCa,
      password: 'Owner@Pass:2026/#?%',
    });
  });

  test('rejects invalid projects, usernames, hosts, databases, and query overrides', () => {
    const invalidUrls = [
      'postgresql://postgres:secret@db.other.supabase.co:5432/postgres',
      'postgresql://postgres.other:secret@aws-0.test.pooler.supabase.com:5432/postgres',
      `postgresql://postgres.${PRODUCTION_PROJECT_REF}:secret@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`,
      `postgresql://postgres:secret@aws-0.test.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres.${PRODUCTION_PROJECT_REF}:secret@database.example.com:5432/postgres`,
      `postgresql://postgres.${PRODUCTION_PROJECT_REF}:secret@pooler.supabase.com.example.com:5432/postgres`,
      `${productionUrl.replace('/postgres', '/other')}`,
      `${productionUrl.replace(':5432/', ':6543/')}`,
    ];
    for (const url of invalidUrls) {
      assert.throws(
        () => validateEnvironmentForTest(productionEnvironmentWithCa(url)),
        { code: 'TARGET_MISMATCH' }
      );
    }

    for (const query of [
      '?host=db.attacker.test',
      '?user=postgres.other',
      '?password=attacker',
      '?port=6432',
      '?dbname=other',
      '?sslmode=disable',
      '?sslmode=verify-full',
      '?sslmode=require&host=db.attacker.test',
      '?sslmode=require&sslmode=require',
    ]) {
      assert.throws(
        () => validateEnvironmentForTest(productionEnvironmentWithCa(`${productionUrl}${query}`)),
        { code: 'TARGET_MISMATCH' }
      );
    }
  });

  test('uses hidden password prompts and emits only sanitized success output', async () => {
    const questions = ['Anuj Singh', 'owner@example.com',
      `CREATE FIRST OWNER owner@example.com IN ${PRODUCTION_PROJECT_REF}`];
    const hidden = [strongPassword, strongPassword];
    const hiddenLabels = [];
    const output = [];
    let received;
    let receivedConfig;
    const code = await runTestCli({
      env: productionEnvironment(),
      prompts: {
        question: async () => questions.shift(),
        hiddenQuestion: async (label) => { hiddenLabels.push(label); return hidden.shift(); },
      },
      serviceFactory: (config) => {
        receivedConfig = config;
        return { bootstrap: async (input) => {
          received = input;
          return { ownerId, auditId };
        } };
      },
      writeOutput: (line) => output.push(line),
      writeError: (line) => output.push(line),
    });
    assert.equal(code, 0);
    assert.deepEqual(receivedConfig, productionConfig);
    assert.deepEqual(hiddenLabels, ['Owner Password: ', 'Confirm Password: ']);
    assert.deepEqual(received, {
      fullName: 'Anuj Singh', email: 'owner@example.com', password: strongPassword,
    });
    assert.deepEqual(output, [
      'OWNER_BOOTSTRAP=PASS', `OWNER_ID=${ownerId}`, `AUDIT_ID=${auditId}`,
    ]);
    assert.equal(output.join('\n').includes(strongPassword), false);
    assert.equal(output.join('\n').includes(productionUrl), false);
  });

  test('emits only the stable mapped code for an initial connection failure', async () => {
    const privateDetail = `TLS secret=${strongPassword} url=${productionUrl}`;
    const connectionError = Object.assign(new Error(privateDetail), {
      code: 'ERR_TLS_CERT_ALTNAME_INVALID',
      syscall: 'connect',
    });
    const db = new FakeDatabase({ connectFailure: connectionError });
    const { users, owners } = dependencies({ database: db });
    const output = [];
    const questions = ['Anuj Singh', 'owner@example.com',
      `CREATE FIRST OWNER owner@example.com IN ${PRODUCTION_PROJECT_REF}`];
    const hidden = [strongPassword, strongPassword];

    const code = await runTestCli({
      env: productionEnvironment(),
      prompts: {
        question: async () => questions.shift(),
        hiddenQuestion: async () => hidden.shift(),
      },
      serviceFactory: (connectionConfig) => new OwnerBootstrapService({
        connectionConfig,
        clientFactory: () => db,
        users,
        owners,
      }),
      writeOutput: (line) => output.push(line),
      writeError: (line) => output.push(line),
    });

    assert.equal(code, 1);
    assert.deepEqual(output, [
      'OWNER_BOOTSTRAP=FAIL',
      'FAILED_STAGE=CONNECT',
      'ERROR_CODE=TLS_HOSTNAME',
    ]);
    assert.equal(output.join('\n').includes(privateDetail), false);
    assert.equal(output.join('\n').includes(strongPassword), false);
    assert.equal(output.join('\n').includes(productionUrl), false);
  });

  test('emits exactly three sanitized lines for a transaction stage failure', async () => {
    const privateDetail = `SQL select secret=${strongPassword} url=${productionUrl} token=private`;
    const tableLockError = Object.assign(new Error(privateDetail), { code: '55P03' });
    const db = new FakeDatabase({
      queryFailure: { match: 'lock table', error: tableLockError },
    });
    const { users, owners } = dependencies({ database: db });
    const output = [];
    const questions = ['Anuj Singh', 'owner@example.com',
      `CREATE FIRST OWNER owner@example.com IN ${PRODUCTION_PROJECT_REF}`];
    const hidden = [strongPassword, strongPassword];
    const code = await runTestCli({
      env: productionEnvironment(),
      prompts: {
        question: async () => questions.shift(),
        hiddenQuestion: async () => hidden.shift(),
      },
      serviceFactory: (connectionConfig) => new OwnerBootstrapService({
        connectionConfig,
        clientFactory: () => db,
        users,
        owners,
      }),
      writeOutput: (line) => output.push(line),
      writeError: (line) => output.push(line),
    });
    assert.equal(code, 1);
    assert.deepEqual(output, [
      'OWNER_BOOTSTRAP=FAIL',
      'FAILED_STAGE=LOCK_USERS',
      'ERROR_CODE=TRANSACTION_TABLE_LOCK_FAILED',
    ]);
    assert.equal(output.join('\n').split('\n').length, 3);
    assert.equal(output.join('\n').includes(privateDetail), false);
    assert.equal(output.join('\n').includes(strongPassword), false);
    assert.equal(output.join('\n').includes(productionUrl), false);
  });

  test('refuses an incorrect confirmation without calling the service', async () => {
    let called = false;
    const output = [];
    const questions = ['Anuj Singh', 'owner@example.com', 'NO'];
    const code = await runTestCli({
      env: productionEnvironment(),
      prompts: {
        question: async () => questions.shift(),
        hiddenQuestion: async () => strongPassword,
      },
      serviceFactory: () => ({ bootstrap: async () => { called = true; } }),
      writeOutput: (line) => output.push(line),
      writeError: (line) => output.push(line),
    });
    assert.equal(code, 1);
    assert.equal(called, false);
    assert.deepEqual(output, [
      'OWNER_BOOTSTRAP=FAIL',
      'FAILED_STAGE=VALIDATION',
      'ERROR_CODE=VALIDATION_CONFIRMATION',
    ]);
  });
});
