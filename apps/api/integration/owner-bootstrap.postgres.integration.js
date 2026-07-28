import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import pg from 'pg';
import {
  CommitOutcomeUnknownError,
  EmailAlreadyExistsError,
  OwnerAlreadyExistsError,
  OwnerBootstrapService,
} from '../src/modules/auth/owner-bootstrap.service.js';
import * as authRepository from '../src/modules/auth/repository.js';

const { Client } = pg;
const rawConnectionString = process.env.TEST_DATABASE_URL;
const expectedDatabase = 'jarvis_owner_bootstrap_pg17_test';
const expectedPort = 55432;
const destructiveConfirmation = process.env.OWNER_BOOTSTRAP_DESTRUCTIVE_TEST_DATABASE;

export function buildDisposableConnectionConfig(connectionString, confirmation) {
  let target;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Error('Owner bootstrap integration tests require a valid disposable PG17 URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || target.hostname !== '127.0.0.1'
    || target.port !== String(expectedPort)
    || decodeURIComponent(target.pathname) !== `/${expectedDatabase}`
    || decodeURIComponent(target.username) !== 'postgres'
    || !target.password || target.search || target.hash
    || confirmation !== expectedDatabase) {
    throw new Error('Owner bootstrap integration tests require the confirmed disposable PG17 database.');
  }
  let password;
  try {
    password = decodeURIComponent(target.password);
  } catch {
    throw new Error('Owner bootstrap integration tests require a valid disposable PG17 URL.');
  }
  return {
    host: '127.0.0.1',
    port: expectedPort,
    database: expectedDatabase,
    user: 'postgres',
    password,
    ssl: false,
    application_name: 'jarvis-owner-bootstrap-pg17-integration',
  };
}

if (!rawConnectionString) throw new Error('TEST_DATABASE_URL is required.');
const connectionConfig = buildDisposableConnectionConfig(
  rawConnectionString,
  destructiveConfirmation
);
const password = 'UniqueOwner!2026X';
let database;

function assertLoopbackConnection(client) {
  const remoteAddress = client.connection?.stream?.remoteAddress;
  if (!['127.0.0.1', '::1'].includes(remoteAddress)) {
    throw new Error('Destructive Owner bootstrap test cleanup requires a loopback TCP peer.');
  }
}

async function assertDisposableTestDatabase() {
  assertLoopbackConnection(database);
  const { rows: [identity] } = await database.query(`select current_database() database,
    current_user username,
    to_regclass('public.owner_bootstrap_test_sentinel')::text sentinel`);
  if (identity.database !== expectedDatabase || identity.username !== 'postgres'
    || identity.sentinel !== 'owner_bootstrap_test_sentinel') {
    throw new Error('Disposable Owner bootstrap test database sentinel is missing.');
  }
  const { rows: [sentinel] } = await database.query(`select purpose
    from public.owner_bootstrap_test_sentinel where id = true`);
  if (sentinel?.purpose !== 'disposable-owner-bootstrap-pg17') {
    throw new Error('Disposable Owner bootstrap test database sentinel is invalid.');
  }
}

async function resetFixture() {
  assertLoopbackConnection(database);
  await database.query('truncate table public.audit_logs, public.users cascade');
}

async function counts() {
  const { rows: [result] } = await database.query(`select
    (select count(*)::int from public.users where role='client' and status='active') owners,
    (select count(*)::int from public.audit_logs where event_type='owner.bootstrap_completed') audits`);
  return result;
}

async function assertReplayBlocked() {
  await assert.rejects(
    new OwnerBootstrapService({ connectionConfig }).bootstrap({
      fullName: 'Second Owner', email: 'second@example.test', password,
    }),
    OwnerAlreadyExistsError
  );
}

function commitFaultFactory(commitApplied) {
  let first = true;
  return (options) => {
    const client = new Client(options);
    if (!first) return client;
    first = false;
    return {
      connect: () => client.connect(),
      query: async (...args) => {
        if (String(args[0]).trim().toLowerCase() !== 'commit') return client.query(...args);
        if (commitApplied) await client.query(...args);
        throw new Error('injected COMMIT acknowledgement failure');
      },
      end: () => client.end(),
    };
  };
}

describe('Initial Owner bootstrap PostgreSQL integration', { concurrency: false }, () => {
  before(async () => {
    database = new Client(connectionConfig);
    await database.connect();
    await assertDisposableTestDatabase();
  });

  beforeEach(resetFixture);

  after(async () => {
    if (!database) return;
    await resetFixture().catch(() => {});
    await database.end();
  });

  test('rejects connection-string authority, TLS, and option overrides', () => {
    for (const suffix of [
      '?host=example.invalid',
      '?port=5432',
      '?user=other',
      '?sslmode=require',
      '?options=-csearch_path%3Dother',
      '#unexpected-fragment',
    ]) {
      assert.throws(
        () => buildDisposableConnectionConfig(
          `${rawConnectionString}${suffix}`,
          expectedDatabase
        ),
        /confirmed disposable PG17 database/
      );
    }
  });

  test('atomically creates one active verified Owner and one audit event', async () => {
    const service = new OwnerBootstrapService({ connectionConfig });
    const result = await service.bootstrap({
      fullName: 'Initial Owner', email: 'owner@example.test', password,
    });
    const { rows: [owner] } = await database.query(`select id, email_normalized,
      role, status, email_verified_at is not null verified, password_hash,
      not exists (select 1 from public.client_portal_memberships where user_id=users.id) eligible
      from public.users where id=$1`, [result.ownerId]);
    const { rows: [audit] } = await database.query(`select id, user_id, event_type,
      action, resource_type, resource_id, success, details
      from public.audit_logs where id=$1`, [result.auditId]);

    assert.equal(owner.email_normalized, 'owner@example.test');
    assert.deepEqual({ role: owner.role, status: owner.status, verified: owner.verified,
      eligible: owner.eligible },
    { role: 'client', status: 'active', verified: true, eligible: true });
    assert.ok(owner.password_hash.startsWith('scrypt:') || owner.password_hash.startsWith('$argon2'));
    assert.equal(audit.user_id, owner.id);
    assert.equal(audit.resource_id, owner.id);
    assert.equal(audit.event_type, 'owner.bootstrap_completed');
    assert.equal(audit.success, true);
    assert.deepEqual(await counts(), { owners: 1, audits: 1 });
  });

  test('refuses replay without creating another Owner or audit row', async () => {
    const service = new OwnerBootstrapService({ connectionConfig });
    await service.bootstrap({ fullName: 'Initial Owner', email: 'owner@example.test', password });
    await assertReplayBlocked();
    assert.deepEqual(await counts(), { owners: 1, audits: 1 });
  });

  test('durable marker refuses replay after Owner status changes', async () => {
    const result = await new OwnerBootstrapService({ connectionConfig }).bootstrap({
      fullName: 'Initial Owner', email: 'owner@example.test', password,
    });
    await database.query("update public.users set status='suspended' where id=$1", [result.ownerId]);
    await assertReplayBlocked();
    assert.deepEqual(await counts(), { owners: 0, audits: 1 });
  });

  test('durable marker refuses replay after Owner role changes', async () => {
    const result = await new OwnerBootstrapService({ connectionConfig }).bootstrap({
      fullName: 'Initial Owner', email: 'owner@example.test', password,
    });
    await database.query("update public.users set role='employee' where id=$1", [result.ownerId]);
    await assertReplayBlocked();
    assert.deepEqual(await counts(), { owners: 0, audits: 1 });
  });

  test('durable marker refuses replay after a Client Portal membership is added', async () => {
    const result = await new OwnerBootstrapService({ connectionConfig }).bootstrap({
      fullName: 'Initial Owner', email: 'owner@example.test', password,
    });
    const { rows: [crmClient] } = await database.query(`insert into public.crm_clients
      (owner_user_id, name) values ($1, 'Replay Fixture') returning id`, [result.ownerId]);
    const { rows: [contact] } = await database.query(`insert into public.contacts
      (owner_user_id, client_id, name, email) values ($1, $2, 'Replay Contact',
      'owner@example.test') returning id`, [result.ownerId, crmClient.id]);
    await database.query(`insert into public.client_portal_memberships
      (crm_client_id, contact_id, user_id, email_normalized, status, created_by_user_id,
       activated_at) values ($1, $2, $3, 'owner@example.test', 'active', $3, now())`,
    [crmClient.id, contact.id, result.ownerId]);
    await assertReplayBlocked();
    assert.deepEqual(await counts(), { owners: 1, audits: 1 });
  });

  test('durable marker refuses replay after the Owner is deleted', async () => {
    const result = await new OwnerBootstrapService({ connectionConfig }).bootstrap({
      fullName: 'Initial Owner', email: 'owner@example.test', password,
    });
    await database.query('delete from public.users where id=$1', [result.ownerId]);
    await assertReplayBlocked();
    const { rows: [marker] } = await database.query(`select user_id, resource_id
      from public.audit_logs where event_type='owner.bootstrap_completed'`);
    assert.equal(marker.user_id, null);
    assert.equal(marker.resource_id, result.ownerId);
    assert.deepEqual(await counts(), { owners: 0, audits: 1 });
  });

  test('refuses to overwrite an existing pending account', async () => {
    await database.query(`insert into public.users
      (email,email_normalized,status,role) values ($1,$1,'pending_verification','client')`,
    ['owner@example.test']);
    const service = new OwnerBootstrapService({ connectionConfig });
    await assert.rejects(
      service.bootstrap({ fullName: 'Initial Owner', email: 'owner@example.test', password }),
      EmailAlreadyExistsError
    );
    assert.deepEqual(await counts(), { owners: 0, audits: 0 });
  });

  test('rolls back Owner creation when transactional audit logging fails', async () => {
    const users = {
      ...authRepository,
      createAuditLog: async () => { throw new Error('forced audit failure'); },
    };
    const service = new OwnerBootstrapService({ connectionConfig, users });
    await assert.rejects(
      service.bootstrap({ fullName: 'Initial Owner', email: 'owner@example.test', password }),
      { code: 'TRANSACTION_AUDIT_INSERT_FAILED' }
    );
    assert.deepEqual(await counts(), { owners: 0, audits: 0 });
    const { rows: [result] } = await database.query('select count(*)::int users from public.users');
    assert.equal(result.users, 0);
  });

  test('waits for the fixed transaction advisory lock before creating the Owner', async () => {
    const blocker = new Client(connectionConfig);
    await blocker.connect();
    await blocker.query('begin');
    await blocker.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['jarvis-prime.initial-owner-bootstrap']);
    let settled = false;
    const pending = new OwnerBootstrapService({ connectionConfig })
      .bootstrap({ fullName: 'Initial Owner', email: 'owner@example.test', password })
      .finally(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const waitedForAdvisoryLock = !settled;
    await blocker.query('commit');
    await blocker.end();
    await pending;
    assert.equal(waitedForAdvisoryLock, true);
    assert.deepEqual(await counts(), { owners: 1, audits: 1 });
  });

  test('serializes concurrent runs so exactly one succeeds', async () => {
    const first = new OwnerBootstrapService({ connectionConfig });
    const second = new OwnerBootstrapService({ connectionConfig });
    const results = await Promise.allSettled([
      first.bootstrap({ fullName: 'First Owner', email: 'first@example.test', password }),
      second.bootstrap({ fullName: 'Second Owner', email: 'second@example.test', password }),
    ]);
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    const rejection = results.find(({ status }) => status === 'rejected');
    assert.ok(rejection.reason instanceof OwnerAlreadyExistsError);
    assert.deepEqual(await counts(), { owners: 1, audits: 1 });
  });

  test('reconciles success when PostgreSQL commits but acknowledgement is lost', async () => {
    const service = new OwnerBootstrapService({
      connectionConfig,
      clientFactory: commitFaultFactory(true),
    });
    const result = await service.bootstrap({
      fullName: 'Initial Owner', email: 'owner@example.test', password,
    });
    assert.match(result.ownerId, /^[0-9a-f-]{36}$/);
    assert.match(result.auditId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(await counts(), { owners: 1, audits: 1 });
  });

  test('returns COMMIT_OUTCOME_UNKNOWN when commit is not applied or confirmed', async () => {
    const service = new OwnerBootstrapService({
      connectionConfig,
      clientFactory: commitFaultFactory(false),
    });
    await assert.rejects(
      service.bootstrap({ fullName: 'Initial Owner', email: 'owner@example.test', password }),
      CommitOutcomeUnknownError
    );
    assert.deepEqual(await counts(), { owners: 0, audits: 0 });
  });
});
