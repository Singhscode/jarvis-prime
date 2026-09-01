import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required.');
const target = new URL(connectionString);
if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
  throw new Error('Sales-agent integration tests require a disposable local database.');
}

const ids = Object.fromEntries([
  'owner', 'otherOwner', 'inactiveOwner', 'client', 'otherClient', 'inactiveClient',
  'provenance', 'suppressed', 'duplicate', 'main', 'rejected', 'stopped',
  'failedEvaluation', 'releaseSuppressed', 'capOne', 'capTwo',
].map((name) => [name, randomUUID()]));
const runId = randomUUID();
const collectedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const ownerIds = [ids.owner, ids.otherOwner, ids.inactiveOwner];
const prospectKeys = [
  'provenance', 'suppressed', 'duplicate', 'main', 'rejected', 'stopped',
  'failedEvaluation', 'releaseSuppressed', 'capOne', 'capTwo',
];
const prospects = Object.fromEntries(prospectKeys.map((key) => {
  const firstName = key.slice(0, 1).toUpperCase() + key.slice(1);
  return [key, {
    id: ids[key],
    clientId: key === 'failedEvaluation' ? ids.inactiveClient : ids.client,
    fullName: `${firstName} Prospect`,
    firstName,
    company: 'Acme',
    email: `${key}.${runId}@test.local`,
    source: 'manual',
    reference: `crm://sales-agent-tests/${ids[key]}`,
    collectedAt,
    consentStatus: key === 'releaseSuppressed' ? 'opted_in' : 'legitimate_interest',
    consentBasis: key === 'releaseSuppressed'
      ? 'Explicit consent captured in the trusted CRM.'
      : 'Relevant B2B role documented by the Owner.',
  }];
}));
prospects.failedEvaluation.clientId = ids.client;
const inactiveProspect = {
  id: randomUUID(),
  clientId: ids.inactiveClient,
  fullName: 'Inactive Prospect',
  firstName: 'Inactive',
  company: 'Acme',
  email: `inactive.${runId}@test.local`,
  source: 'manual',
  reference: `crm://sales-agent-tests/inactive-${runId}`,
  collectedAt,
  consentStatus: 'opted_in',
  consentBasis: 'Explicit consent captured in the trusted CRM.',
};
const allProspects = [...Object.values(prospects), inactiveProspect];
let db;

function hash(subject, body) {
  return createHash('sha256').update(`${subject}\n${body}`, 'utf8').digest('hex');
}

function renderedBody(action, address = 'Jarvis Prime · 123 Test Street') {
  return `${action.body}\n\n—\n${address}\nDon't want these emails? Unsubscribe: https://example.test/unsubscribe?email=${action.recipient_email}`;
}

async function withRole(role, operation, connection = db) {
  await connection.query('begin');
  try {
    await connection.query(`set local role ${role}`);
    const result = await operation();
    await connection.query('commit');
    return result;
  } catch (error) {
    await connection.query('rollback').catch(() => {});
    throw error;
  }
}

async function asService(operation, connection = db) {
  return withRole('service_role', operation, connection);
}

async function expectDomainError(operation, message) {
  let error;
  try {
    await operation();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `operation should fail with ${message}`);
  assert.equal(error.code, 'P0001');
  assert.equal(error.message, message);
  return error;
}

async function prepare({
  ownerId = ids.owner,
  prospect,
  key,
  evaluationPassed = true,
  reference = prospect.reference,
  connection = db,
}) {
  const subject = 'A concise Acme question';
  const body = `Hi ${prospect.firstName}, a concise question about Acme priorities.`;
  const values = [
    ownerId,
    prospect.id,
    null,
    1,
    prospect.source,
    reference,
    prospect.collectedAt,
    prospect.consentStatus,
    prospect.consentBasis,
    { source: prospect.source, reference: prospect.reference },
    { fullName: prospect.fullName, company: prospect.company },
    { score: 82, qualified: true },
    { subject, body, step: 1 },
    { checks: [] },
    evaluationPassed,
    subject,
    body,
    hash(subject, body),
    'deterministic',
    'reviewed-personalization-template',
    'sales-email-personalization',
    '1.0.0',
    'phase15a-deterministic-evaluation@1.0.0',
    key,
  ];
  const { rows: [action] } = await asService(() => connection.query(`
    select * from public.create_sales_agent_outbound_action(
      $1::uuid, $2::uuid, $3::uuid, $4::integer, $5::text, $6::text,
      $7::timestamptz, $8::text, $9::text, $10::jsonb, $11::jsonb,
      $12::jsonb, $13::jsonb, $14::jsonb, $15::boolean, $16::text,
      $17::text, $18::text, $19::text, $20::text, $21::text, $22::text,
      $23::text, $24::text
    )
  `, values), connection);
  return action;
}

async function decide(action, decision, reason, ownerId = ids.owner, connection = db) {
  const { rows: [result] } = await asService(() => connection.query(`
    select * from public.decide_sales_agent_outbound_action(
      $1::uuid, $2::uuid, $3::integer, $4::text, $5::text
    )
  `, [ownerId, action.id, action.revision, decision, reason]), connection);
  return result;
}

async function approve(action, connection = db) {
  return decide(action, 'approve', hash(action.subject, renderedBody(action)), ids.owner, connection);
}

async function revise(action, subject, body, connection = db) {
  const { rows: [result] } = await asService(() => connection.query(`
    select * from public.revise_sales_agent_outbound_action(
      $1::uuid, $2::uuid, $3::integer, $4::text, $5::text,
      $6::text, $7::jsonb, $8::boolean, $9::text
    )
  `, [
    ids.owner,
    action.id,
    action.revision,
    subject,
    body,
    hash(subject, body),
    { checks: [] },
    true,
    'phase15a-deterministic-evaluation@1.0.0',
  ]), connection);
  return result;
}

async function release(action, releaseKey, dailyLimit, address, connection = db) {
  const { rows: [result] } = await asService(() => connection.query(`
    select * from public.release_sales_agent_outbound_action_dry_run(
      $1::uuid, $2::uuid, $3::integer, $4::text, $5::integer, $6::text
    )
  `, [
    ids.owner,
    action.id,
    action.revision,
    releaseKey,
    dailyLimit,
    renderedBody(action, address),
  ]), connection);
  return result;
}

async function actionByKey(key) {
  const { rows: [action] } = await db.query(
    'select * from public.outbound_actions where prepare_idempotency_key = $1',
    [key],
  );
  return action;
}

describe('Phase 15A PostgreSQL approval boundary', { concurrency: false }, () => {
  before(async () => {
    db = new Client({ connectionString });
    await db.connect();
    await db.query(`insert into public.users
      (id, email, email_normalized, full_name, status, role, email_verified_at)
      values
      ($1, $4, $4, 'Sales Agent Owner', 'active', 'client', now()),
      ($2, $5, $5, 'Other Sales Agent Owner', 'active', 'client', now()),
      ($3, $6, $6, 'Inactive Sales Agent Owner', 'inactive', 'client', now())`, [
      ids.owner,
      ids.otherOwner,
      ids.inactiveOwner,
      `owner.${runId}@test.local`,
      `other-owner.${runId}@test.local`,
      `inactive-owner.${runId}@test.local`,
    ]);
    await db.query(`insert into public.clients (id, name, status, owner_user_id) values
      ($1, 'Sales Agent Client', 'active', $4),
      ($2, 'Other Sales Agent Client', 'active', $5),
      ($3, 'Inactive Owner Client', 'active', $6)`, [
      ids.client,
      ids.otherClient,
      ids.inactiveClient,
      ids.owner,
      ids.otherOwner,
      ids.inactiveOwner,
    ]);
    for (const prospect of allProspects) {
      await db.query(`insert into public.prospects
        (id, client_id, full_name, first_name, company, email, source,
         source_reference, source_collected_at, consent_status, consent_basis, stage)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'new')`, [
        prospect.id,
        prospect.clientId,
        prospect.fullName,
        prospect.firstName,
        prospect.company,
        prospect.email,
        prospect.source,
        prospect.reference,
        prospect.collectedAt,
        prospect.consentStatus,
        prospect.consentBasis,
      ]);
    }
  });

  after(async () => {
    if (!db) return;
    const prospectIds = allProspects.map((prospect) => prospect.id);
    try {
      await db.query('begin');
      await db.query('delete from public.events where prospect_id = any($1::uuid[])', [prospectIds]);
      await db.query('delete from public.linkedin_actions where prospect_id = any($1::uuid[])', [prospectIds]);
      await db.query('delete from public.webhook_events where outbound_action_id in (select id from public.outbound_actions where prospect_id = any($1::uuid[]))', [prospectIds]);
      await db.query('delete from public.audit_logs where user_id = any($1::uuid[])', [ownerIds]);
      await db.query('update public.outbound_actions set message_id = null where prospect_id = any($1::uuid[])', [prospectIds]);
      await db.query('delete from public.messages where prospect_id = any($1::uuid[])', [prospectIds]);
      await db.query('delete from public.outbound_actions where prospect_id = any($1::uuid[])', [prospectIds]);
      await db.query('alter table public.sales_agent_artifacts disable trigger sales_agent_artifacts_append_only');
      await db.query('delete from public.sales_agent_artifacts where prospect_id = any($1::uuid[])', [prospectIds]);
      await db.query('alter table public.sales_agent_artifacts enable trigger sales_agent_artifacts_append_only');
      await db.query('delete from public.suppression where email = any($1::text[])', [allProspects.map((prospect) => prospect.email)]);
      await db.query('delete from public.prospects where id = any($1::uuid[])', [prospectIds]);
      await db.query('delete from public.clients where id = any($1::uuid[])', [[ids.client, ids.otherClient, ids.inactiveClient]]);
      await db.query('delete from public.users where id = any($1::uuid[])', [ownerIds]);
      await db.query('commit');
    } catch (error) {
      await db.query('rollback').catch(() => {});
      throw error;
    } finally {
      await db.end();
    }
  });

  test('keeps tables and RPCs private while exposing only the verified wrapper to service_role', async () => {
    const { rows: [state] } = await db.query(`select
      has_function_privilege('service_role',
        'public.create_sales_agent_outbound_action(uuid,uuid,uuid,integer,text,text,timestamp with time zone,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,text,text,text,text,text,text,text,text)',
        'execute') as service_wrapper,
      has_function_privilege('service_role',
        'public.create_sales_agent_outbound_action_v22(uuid,uuid,uuid,integer,text,text,timestamp with time zone,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,text,text,text,text,text,text,text,text)',
        'execute') as service_v22,
      has_function_privilege('authenticated',
        'public.decide_sales_agent_outbound_action(uuid,uuid,integer,text,text)',
        'execute') as authenticated_decide,
      has_table_privilege('authenticated', 'public.outbound_actions', 'select') as authenticated_actions_read,
      has_table_privilege('authenticated', 'public.sales_agent_artifacts', 'select') as authenticated_artifacts_read`);
    assert.deepEqual(state, {
      service_wrapper: true,
      service_v22: false,
      authenticated_decide: false,
      authenticated_actions_read: false,
      authenticated_artifacts_read: false,
    });

    await db.query('begin');
    await db.query('set local role authenticated');
    await assert.rejects(db.query('select * from public.outbound_actions'), { code: '42501' });
    await db.query('rollback');
  });

  test('binds preparation to persisted provenance and active Owner scope', async () => {
    await expectDomainError(() => prepare({
      prospect: prospects.provenance,
      key: `provenance-forged-${runId}`,
      reference: 'browser://forged-evidence',
    }), 'PROVENANCE_NOT_APPROVED');
    const persisted = await db.query(`select source_reference, consent_status, consent_basis
      from public.prospects where id = $1`, [prospects.provenance.id]);
    assert.deepEqual(persisted.rows[0], {
      source_reference: prospects.provenance.reference,
      consent_status: prospects.provenance.consentStatus,
      consent_basis: prospects.provenance.consentBasis,
    });

    const prepared = await prepare({
      prospect: prospects.provenance,
      key: `provenance-valid-${runId}`,
    });
    assert.equal(prepared.status, 'pending_review');
    const artifacts = await db.query(
      'select artifact_type from public.sales_agent_artifacts where prospect_id = $1 order by created_at, id',
      [prospects.provenance.id],
    );
    assert.equal(artifacts.rowCount, 5);

    await expectDomainError(() => prepare({
      ownerId: ids.otherOwner,
      prospect: prospects.main,
      key: `cross-owner-${runId}`,
    }), 'OUTBOUND_ACTION_NOT_FOUND');
    await expectDomainError(() => prepare({
      ownerId: ids.inactiveOwner,
      prospect: inactiveProspect,
      key: `inactive-owner-${runId}`,
    }), 'INSUFFICIENT_PERMISSIONS');
  });

  test('blocks suppression and duplicate active actions while preserving prepare idempotency', async () => {
    await db.query('insert into public.suppression (email, reason) values ($1, $2)', [
      prospects.suppressed.email,
      'unsubscribe',
    ]);
    await expectDomainError(() => prepare({
      prospect: prospects.suppressed,
      key: `suppressed-${runId}`,
    }), 'OUTBOUND_SUPPRESSED');

    const key = `duplicate-primary-${runId}`;
    const first = await prepare({ prospect: prospects.duplicate, key });
    const retry = await prepare({ prospect: prospects.duplicate, key });
    assert.equal(retry.id, first.id);
    assert.equal(await db.query(
      'select count(*)::integer as count from public.sales_agent_artifacts where prospect_id = $1',
      [prospects.duplicate.id],
    ).then(({ rows }) => rows[0].count), 5);
    await expectDomainError(() => prepare({
      prospect: prospects.duplicate,
      key: `duplicate-secondary-${runId}`,
    }), 'DUPLICATE_OUTBOUND_ACTION');
  });

  test('binds approval to the full rendered body and invalidates it on append-only Owner revision', async () => {
    const key = `main-state-${runId}`;
    let action = await prepare({ prospect: prospects.main, key });
    await expectDomainError(() => decide(action, 'approve', 'not-a-release-hash'), 'OUTBOUND_APPROVAL_BLOCKED');

    action = await approve(action);
    assert.equal(action.status, 'approved');
    assert.equal(action.approved_hash, action.content_hash);
    assert.equal(action.approved_release_hash, hash(action.subject, renderedBody(action)));

    await expectDomainError(() => release(
      action,
      `changed-footer-${runId}`,
      500,
      'Jarvis Prime · CHANGED Address',
    ), 'OUTBOUND_RELEASE_BLOCKED');
    assert.equal((await actionByKey(key)).status, 'approved');
    assert.equal(await db.query(
      'select count(*)::integer as count from public.messages where outbound_action_id = $1',
      [action.id],
    ).then(({ rows }) => rows[0].count), 0);

    action = await revise(
      action,
      'A revised Acme question',
      `Hi ${prospects.main.firstName}, this revised note remains about Acme.`,
    );
    assert.equal(action.revision, 2);
    assert.equal(action.status, 'pending_review');
    assert.equal(action.approved_hash, null);
    assert.equal(action.approved_release_hash, null);
    await expectDomainError(() => release(
      action,
      `before-reapproval-${runId}`,
      500,
      'Jarvis Prime · 123 Test Street',
    ), 'OUTBOUND_ACTION_STATE_CONFLICT');

    action = await approve(action);
    const released = await release(
      action,
      `main-release-${runId}`,
      500,
      'Jarvis Prime · 123 Test Street',
    );
    const retry = await release(
      action,
      `main-release-${runId}`,
      500,
      'Jarvis Prime · 123 Test Street',
    );
    assert.equal(released.id, retry.id);
    assert.equal(released.status, 'released_dry_run');
    assert.equal(released.provider_status, 'dry_run');

    const messages = await db.query(`select status, provider_id, body
      from public.messages where outbound_action_id = $1`, [action.id]);
    assert.equal(messages.rowCount, 1);
    assert.equal(messages.rows[0].status, 'dry_run');
    assert.equal(messages.rows[0].provider_id, null);
    assert.equal(messages.rows[0].body, renderedBody(action));
    const events = await db.query(`select type, meta from public.events
      where outbound_action_id = $1`, [action.id]);
    assert.deepEqual(events.rows, [{ type: 'dry_run', meta: { mode: 'dry_run', step: 1 } }]);
  });

  test('blocks legacy sent/dry-run writes and keeps artifacts append-only', async () => {
    await expectDomainError(() => db.query(`insert into public.messages
      (prospect_id, client_id, channel, step, subject, body, status)
      values ($1, $2, 'email', 1, 'Legacy', 'Legacy body', 'sent')`, [
      prospects.main.id,
      ids.client,
    ]), 'OUTBOUND_APPROVAL_REQUIRED');
    await expectDomainError(() => db.query(`insert into public.messages
      (prospect_id, client_id, channel, step, subject, body, status)
      values ($1, $2, 'email', 1, 'Legacy', 'Legacy body', 'dry_run')`, [
      prospects.main.id,
      ids.client,
    ]), 'OUTBOUND_APPROVAL_REQUIRED');

    const { rows: [artifact] } = await db.query(
      'select id from public.sales_agent_artifacts where prospect_id = $1 order by created_at, id limit 1',
      [prospects.provenance.id],
    );
    await expectDomainError(() => db.query(
      'update public.sales_agent_artifacts set content = content where id = $1',
      [artifact.id],
    ), 'SALES_AGENT_ARTIFACTS_ARE_APPEND_ONLY');
    await expectDomainError(() => db.query(
      'delete from public.sales_agent_artifacts where id = $1',
      [artifact.id],
    ), 'SALES_AGENT_ARTIFACTS_ARE_APPEND_ONLY');
  });

  test('persists reject and stop decisions and blocks failed deterministic evaluation', async () => {
    let rejectedAction = await prepare({
      prospect: prospects.rejected,
      key: `rejected-${runId}`,
    });
    rejectedAction = await decide(rejectedAction, 'reject', 'Brand review rejected this draft.');
    assert.equal(rejectedAction.status, 'rejected');
    assert.equal(rejectedAction.decision_reason, 'Brand review rejected this draft.');
    await expectDomainError(() => release(
      rejectedAction,
      `rejected-release-${runId}`,
      500,
      'Jarvis Prime · 123 Test Street',
    ), 'OUTBOUND_ACTION_STATE_CONFLICT');

    let stoppedAction = await prepare({
      prospect: prospects.stopped,
      key: `stopped-${runId}`,
    });
    stoppedAction = await approve(stoppedAction);
    stoppedAction = await decide(stoppedAction, 'stop', 'Owner stopped outreach before release.');
    assert.equal(stoppedAction.status, 'stopped');
    assert.equal(stoppedAction.approved_hash, null);
    assert.equal(stoppedAction.approved_release_hash, null);
    assert.ok(stoppedAction.stopped_at);

    const failed = await prepare({
      prospect: prospects.failedEvaluation,
      key: `failed-evaluation-${runId}`,
      evaluationPassed: false,
    });
    assert.equal(failed.status, 'changes_required');
    assert.equal(failed.evaluation.passed, false);
    await expectDomainError(() => approve(failed), 'OUTBOUND_APPROVAL_BLOCKED');
  });

  test('rechecks suppression at release time', async () => {
    let action = await prepare({
      prospect: prospects.releaseSuppressed,
      key: `release-suppressed-${runId}`,
    });
    action = await approve(action);
    await db.query('insert into public.suppression (email, reason) values ($1, $2)', [
      prospects.releaseSuppressed.email,
      'unsubscribe',
    ]);
    await expectDomainError(() => release(
      action,
      `release-suppressed-key-${runId}`,
      500,
      'Jarvis Prime · 123 Test Street',
    ), 'OUTBOUND_RELEASE_BLOCKED');
  });

  test('serializes concurrent releases so only one consumes the final daily slot', async () => {
    let first = await prepare({ prospect: prospects.capOne, key: `cap-one-${runId}` });
    let second = await prepare({ prospect: prospects.capTwo, key: `cap-two-${runId}` });
    first = await approve(first);
    second = await approve(second);

    const { rows: [{ count: baseline }] } = await db.query(`select count(*)::integer as count
      from public.messages where status in ('sent', 'dry_run')
        and created_at >= date_trunc('day', now())`);
    const limit = baseline + 1;
    assert.ok(limit <= 500, 'disposable test database must have room for the cap probe');

    const firstDb = new Client({ connectionString });
    const secondDb = new Client({ connectionString });
    await Promise.all([firstDb.connect(), secondDb.connect()]);
    try {
      const outcomes = await Promise.allSettled([
        release(first, `cap-one-release-${runId}`, limit, 'Jarvis Prime · 123 Test Street', firstDb),
        release(second, `cap-two-release-${runId}`, limit, 'Jarvis Prime · 123 Test Street', secondDb),
      ]);
      assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
      const [failure] = outcomes.filter((outcome) => outcome.status === 'rejected');
      assert.equal(failure.reason.code, 'P0001');
      assert.equal(failure.reason.message, 'OUTBOUND_DAILY_CAP_REACHED');
    } finally {
      await Promise.all([firstDb.end(), secondDb.end()]);
    }

    const states = await db.query(`select status from public.outbound_actions
      where id = any($1::uuid[]) order by status`, [[first.id, second.id]]);
    assert.deepEqual(states.rows.map(({ status }) => status), ['approved', 'released_dry_run']);
    const { rows: [{ count: afterCount }] } = await db.query(`select count(*)::integer as count
      from public.messages where status in ('sent', 'dry_run')
        and created_at >= date_trunc('day', now())`);
    assert.equal(afterCount, limit);
  });
});
