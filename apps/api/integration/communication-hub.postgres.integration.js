import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required.');
const target = new URL(connectionString);
if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
  throw new Error('Communication Hub integration tests require a disposable local database.');
}

const ids = Object.fromEntries([
  'owner', 'otherOwner', 'employee', 'clientUser', 'otherClientUser', 'client', 'otherClient',
  'contact', 'otherContact', 'clientMembership', 'otherMembership',
].map((name) => [name, randomUUID()]));
const emails = {
  owner: `communication-owner-${ids.owner}@test.local`,
  otherOwner: `communication-other-owner-${ids.otherOwner}@test.local`,
  employee: `communication-employee-${ids.employee}@test.local`,
  client: `communication-client-${ids.clientUser}@test.local`,
  otherClient: `communication-other-client-${ids.otherClientUser}@test.local`,
};
const digest = (value) => createHash('sha256').update(value).digest('hex');
const createKey = (suffix) => `communication-create-${suffix}`;
const sendKey = (suffix) => `communication-send-${suffix}`;
let db;
let threadId;
let initialMessageId;

async function asService(operation, client = db) {
  await client.query('begin');
  try {
    await client.query('set local role service_role');
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function rejected(operation) {
  let error;
  try { await operation(); } catch (caught) { error = caught; }
  assert.ok(error, 'operation should fail');
  return error;
}

function participants({ includeClient = true } = {}) {
  return [
    { kind: 'owner', user_id: ids.owner },
    { kind: 'employee', user_id: ids.employee },
    ...(includeClient ? [{ kind: 'client', membership_id: ids.clientMembership }] : []),
  ];
}

async function createThread({ key = createKey('primary-0001'), body = 'Initial message', requestHash = digest('primary-request'), rows = participants() } = {}) {
  return asService(async (client) => (await client.query(
    'select public.communication_create_thread($1,$2,$3,$4::jsonb,$5,$6,$7) as value',
    [ids.owner, ids.owner, 'Project update', JSON.stringify(rows), body, key, requestHash]
  )).rows[0].value);
}

async function send(actorId, body, key, requestHash = digest(`${key}:${body}`), attachmentMetadata = []) {
  return asService(async (client) => (await client.query(
    'select public.communication_send_message($1,$2,$3,$4,$5,$6,$7::jsonb) as value',
    [actorId, ids.owner, threadId, body, key, requestHash, JSON.stringify(attachmentMetadata)]
  )).rows[0].value);
}

describe('Communication Hub PostgreSQL migration and atomic RPCs', { concurrency: false }, () => {
  before(async () => {
    db = new Client({ connectionString });
    await db.connect();
    await db.query(`insert into public.users (id,email,email_normalized,full_name,status,role,portal_owner_user_id) values
      ($1,$6,$6,'Owner','active','client',null),
      ($2,$7,$7,'Other Owner','active','client',null),
      ($3,$8,$8,'Employee','active','employee',$1),
      ($4,$9,$9,'Client','active','client',null),
      ($5,$10,$10,'Other Client','active','client',null)`,
    [ids.owner, ids.otherOwner, ids.employee, ids.clientUser, ids.otherClientUser,
      emails.owner, emails.otherOwner, emails.employee, emails.client, emails.otherClient]);
    await db.query(`insert into public.crm_clients (id,owner_user_id,name) values
      ($1,$3,'Communication Client'), ($2,$4,'Other Communication Client')`, [ids.client, ids.otherClient, ids.owner, ids.otherOwner]);
    await db.query(`insert into public.contacts (id,owner_user_id,client_id,name,email) values
      ($1,$3,$5,'Communication Contact',$7),
      ($2,$4,$6,'Other Communication Contact',$8)`,
    [ids.contact, ids.otherContact, ids.owner, ids.otherOwner, ids.client, ids.otherClient, emails.client, emails.otherClient]);
    await db.query(`insert into public.client_portal_memberships
      (id,crm_client_id,contact_id,user_id,email_normalized,status,activated_at,created_by_user_id) values
      ($1,$3,$5,$9,$11,'active',now(),$4),
      ($2,$6,$7,$10,$12,'active',now(),$8)`,
    [ids.clientMembership, ids.otherMembership, ids.client, ids.owner, ids.contact, ids.otherClient, ids.otherContact, ids.otherOwner,
      ids.clientUser, ids.otherClientUser, emails.client, emails.otherClient]);
  });

  after(async () => {
    if (!db) return;
    const ownerIds = [ids.owner, ids.otherOwner, ids.employee, ids.clientUser, ids.otherClientUser];
    await db.query('delete from public.communication_delivery_events where owner_user_id = any($1::uuid[])', [[ids.owner, ids.otherOwner]]).catch(() => {});
    await db.query('delete from public.communication_deliveries where owner_user_id = any($1::uuid[])', [[ids.owner, ids.otherOwner]]).catch(() => {});
    await db.query('delete from public.communication_notifications where owner_user_id = any($1::uuid[])', [[ids.owner, ids.otherOwner]]).catch(() => {});
    await db.query('delete from public.communication_attachments where owner_user_id = any($1::uuid[])', [[ids.owner, ids.otherOwner]]).catch(() => {});
    await db.query('delete from public.communication_messages where owner_user_id = any($1::uuid[])', [[ids.owner, ids.otherOwner]]).catch(() => {});
    await db.query('delete from public.communication_participants where owner_user_id = any($1::uuid[])', [[ids.owner, ids.otherOwner]]).catch(() => {});
    await db.query('delete from public.communication_threads where owner_user_id = any($1::uuid[])', [[ids.owner, ids.otherOwner]]).catch(() => {});
    await db.query('delete from public.communication_preferences where owner_user_id = any($1::uuid[])', [[ids.owner, ids.otherOwner]]).catch(() => {});
    await db.query('delete from public.audit_logs where user_id = any($1::uuid[])', [ownerIds]).catch(() => {});
    await db.query('delete from public.client_portal_memberships where id = any($1::uuid[])', [[ids.clientMembership, ids.otherMembership]]).catch(() => {});
    await db.query('delete from public.contacts where id = any($1::uuid[])', [[ids.contact, ids.otherContact]]).catch(() => {});
    await db.query('delete from public.crm_clients where id = any($1::uuid[])', [[ids.client, ids.otherClient]]).catch(() => {});
    await db.query('delete from public.users where id = any($1::uuid[])', [ownerIds]).catch(() => {});
    await db.end();
  });

  test('keeps all Communication tables private, RLS-enabled, service-role-only, and in a private bucket', async () => {
    const { rows: [state] } = await db.query(`select
      (select bool_and(relrowsecurity) from pg_class where oid = any(array[
        'public.communication_threads'::regclass, 'public.communication_participants'::regclass,
        'public.communication_messages'::regclass, 'public.communication_attachments'::regclass,
        'public.communication_notifications'::regclass, 'public.communication_preferences'::regclass,
        'public.communication_deliveries'::regclass, 'public.communication_delivery_events'::regclass
      ])) as all_rls,
      has_table_privilege('service_role','public.communication_threads','select') as service_read,
      has_table_privilege('service_role','public.communication_messages','insert') as service_write,
      has_table_privilege('anon','public.communication_threads','select') as anon_read,
      has_table_privilege('authenticated','public.communication_messages','insert') as authenticated_write,
      exists (select 1 from storage.buckets where id = 'communication-private' and public = false) as private_bucket`);
    assert.deepEqual(state, { all_rls: true, service_read: true, service_write: false, anon_read: false, authenticated_write: false, private_bucket: true });
    const anon = new Client({ connectionString });
    await anon.connect();
    try {
      await anon.query('set role anon');
      await assert.rejects(anon.query('select * from public.communication_threads'), { code: '42501' });
      await assert.rejects(anon.query('select public.communication_create_thread($1,$1,$2,$3,$4,$5,$6)', [ids.owner, 'Blocked', '[]', 'Blocked', createKey('blocked-0001'), digest('blocked')]), { code: '42501' });
    } finally { await anon.end(); }
  });

  test('creates one owner-scoped fixed participant thread and detects idempotent replay/conflict', async () => {
    const first = await createThread();
    threadId = first.thread_id; initialMessageId = first.message_id;
    assert.equal(first.created, true);
    const replay = await createThread();
    assert.deepEqual(replay, { thread_id: threadId, message_id: initialMessageId, created: false });
    const conflict = await rejected(() => createThread({ body: 'Different initial body', requestHash: digest('different-request') }));
    assert.deepEqual({ code: conflict.code, message: conflict.message }, { code: 'P0001', message: 'COMMUNICATION_IDEMPOTENCY_CONFLICT' });
    const { rows: threadRows } = await db.query('select id,last_sequence from public.communication_threads where owner_user_id = $1', [ids.owner]);
    assert.deepEqual(threadRows, [{ id: threadId, last_sequence: '1' }]);
    const { rows: participantRows } = await db.query(`select user_id,participant_kind,status from public.communication_participants
      where owner_user_id = $1 and thread_id = $2 order by participant_kind`, [ids.owner, threadId]);
    assert.deepEqual(participantRows, [
      { user_id: ids.clientUser, participant_kind: 'client', status: 'active' },
      { user_id: ids.employee, participant_kind: 'employee', status: 'active' },
      { user_id: ids.owner, participant_kind: 'owner', status: 'active' },
    ]);
    const invalidClientLocator = await rejected(() => createThread({ key: createKey('client-user-0001'), requestHash: digest('client-user'), rows: [
      { kind: 'owner', user_id: ids.owner }, { kind: 'client', user_id: ids.clientUser },
    ] }));
    assert.equal(invalidClientLocator.code, 'P0001');
  });

  test('makes create-thread replay concurrency-safe and accepts a 128-character key', async () => {
    const invokeCreate = async (key, requestHash, body = 'Concurrent initial message') => {
      const connection = new Client({ connectionString });
      await connection.connect();
      try {
        return await asService(async (client) => (await client.query(
          'select public.communication_create_thread($1,$2,$3,$4::jsonb,$5,$6,$7) as value',
          [ids.owner, ids.owner, 'Concurrent thread', JSON.stringify(participants()), body, key, requestHash]
        )).rows[0].value, connection);
      } finally { await connection.end(); }
    };

    const replayKey = createKey(`race-${randomUUID()}`); const replayHash = digest('concurrent-create-replay');
    const replayResults = await Promise.all([invokeCreate(replayKey, replayHash), invokeCreate(replayKey, replayHash)]);
    assert.deepEqual(replayResults.map((result) => result.created).sort(), [false, true]);
    assert.equal(replayResults[0].thread_id, replayResults[1].thread_id);
    assert.equal(replayResults[0].message_id, replayResults[1].message_id);

    const conflictKey = createKey(`race-${randomUUID()}`);
    const conflictResults = await Promise.allSettled([
      invokeCreate(conflictKey, digest('concurrent-create-a'), 'Concurrent body A'),
      invokeCreate(conflictKey, digest('concurrent-create-b'), 'Concurrent body B'),
    ]);
    assert.equal(conflictResults.filter((result) => result.status === 'fulfilled').length, 1);
    const rejectedResult = conflictResults.find((result) => result.status === 'rejected');
    assert.deepEqual(
      { code: rejectedResult.reason.code, message: rejectedResult.reason.message },
      { code: 'P0001', message: 'COMMUNICATION_IDEMPOTENCY_CONFLICT' }
    );

    const boundaryKey = `communication-${'x'.repeat(114)}`;
    assert.equal(boundaryKey.length, 128);
    const boundary = await createThread({ key: boundaryKey, requestHash: digest('boundary-key') });
    assert.equal(boundary.created, true);
    const { rows: [initial] } = await db.query('select idempotency_key from public.communication_messages where id = $1', [boundary.message_id]);
    assert.equal(initial.idempotency_key, `initial:${boundaryKey}`);
  });

  test('isolates Owner, Employee, Client, cross-owner, and non-participant access', async () => {
    const otherOwner = await rejected(() => asService((client) => client.query(
      'select public.communication_send_message($1,$2,$3,$4,$5,$6,$7::jsonb)',
      [ids.otherOwner, ids.owner, threadId, 'Denied', sendKey('other-owner-0001'), digest('other-owner'), '[]']
    )));
    const otherClient = await rejected(() => asService((client) => client.query(
      'select public.communication_mark_read($1,$2,$3,1)', [ids.otherClientUser, ids.owner, threadId]
    )));
    const employeeRead = await asService((client) => client.query(
      'select public.communication_mark_read($1,$2,$3,1) as value', [ids.employee, ids.owner, threadId]
    ));
    const clientRead = await asService((client) => client.query(
      'select public.communication_mark_read($1,$2,$3,1) as value', [ids.clientUser, ids.owner, threadId]
    ));
    assert.equal(employeeRead.rows[0].value.last_read_sequence, 1);
    assert.equal(clientRead.rows[0].value.last_read_sequence, 1);
    assert.deepEqual({ code: otherOwner.code, message: otherOwner.message }, { code: 'P0001', message: 'COMMUNICATION_ACCESS_DENIED' });
    assert.deepEqual({ code: otherClient.code, message: otherClient.message }, { code: 'P0001', message: 'COMMUNICATION_ACCESS_DENIED' });
  });

  test('allocates concurrent immutable message sequence numbers and rejects conflicting replay', async () => {
    const sendConcurrent = async (actorId, suffix) => {
      const connection = new Client({ connectionString }); await connection.connect();
      try {
        return await asService(async (client) => (await client.query(
          'select public.communication_send_message($1,$2,$3,$4,$5,$6,$7::jsonb) as value',
          [actorId, ids.owner, threadId, `Concurrent ${suffix}`, sendKey(`concurrent-${suffix}-0001`), digest(`concurrent-${suffix}`), '[]']
        )).rows[0].value, connection);
      } finally { await connection.end(); }
    };
    const [ownerMessage, clientMessage] = await Promise.all([sendConcurrent(ids.owner, 'owner'), sendConcurrent(ids.clientUser, 'client')]);
    assert.deepEqual([ownerMessage.sequence, clientMessage.sequence].sort((left, right) => left - right), [2, 3]);
    const { rows: messages } = await db.query(`select sequence,body from public.communication_messages
      where owner_user_id = $1 and thread_id = $2 order by sequence`, [ids.owner, threadId]);
    assert.deepEqual(messages.map((message) => Number(message.sequence)), [1, 2, 3]);
    const immutable = await rejected(() => db.query('update public.communication_messages set body = $1 where id = $2', ['Tampered', initialMessageId]));
    assert.deepEqual({ code: immutable.code, message: immutable.message }, { code: 'P0001', message: 'COMMUNICATION_CONTENT_IMMUTABLE' });
    const replay = await send(ids.owner, 'Concurrent owner', sendKey('concurrent-owner-0001'), digest('concurrent-owner'));
    assert.equal(replay.created, false);
    const conflict = await rejected(() => send(ids.owner, 'Changed replay', sendKey('concurrent-owner-0001'), digest('changed-replay')));
    assert.deepEqual({ code: conflict.code, message: conflict.message }, { code: 'P0001', message: 'COMMUNICATION_IDEMPOTENCY_CONFLICT' });
  });

  test('revokes stale recipients, advances reads monotonically, and respects future notification preferences', async () => {
    await db.query('update public.users set status = $1 where id = $2', ['disabled', ids.employee]);
    const revocationMessage = await send(ids.owner, 'Employee no longer eligible', sendKey('revocation-0001'));
    assert.equal(revocationMessage.sequence, 4);
    const { rows: [employeeParticipant] } = await db.query(`select status,revoked_at is not null as revoked
      from public.communication_participants where owner_user_id = $1 and thread_id = $2 and user_id = $3`, [ids.owner, threadId, ids.employee]);
    assert.deepEqual(employeeParticipant, { status: 'revoked', revoked: true });
    const { rows: employeeNotifications } = await db.query(`select id from public.communication_notifications
      where owner_user_id = $1 and recipient_user_id = $2 and message_id = $3`, [ids.owner, ids.employee, revocationMessage.message_id]);
    assert.equal(employeeNotifications.length, 0);
    await asService((client) => client.query('select public.communication_mark_read($1,$2,$3,4)', [ids.clientUser, ids.owner, threadId]));
    await asService((client) => client.query('select public.communication_mark_read($1,$2,$3,1)', [ids.clientUser, ids.owner, threadId]));
    const { rows: [readState] } = await db.query(`select last_read_sequence from public.communication_participants
      where owner_user_id = $1 and thread_id = $2 and user_id = $3`, [ids.owner, threadId, ids.clientUser]);
    assert.equal(readState.last_read_sequence, '4');
    await asService((client) => client.query('select public.communication_upsert_preferences($1,$2,false,true)', [ids.clientUser, ids.owner]));
    const preferenceMessage = await send(ids.owner, 'Preference suppression', sendKey('preference-0001'));
    const { rows: suppressed } = await db.query(`select id from public.communication_notifications
      where owner_user_id = $1 and recipient_user_id = $2 and message_id = $3`, [ids.owner, ids.clientUser, preferenceMessage.message_id]);
    assert.equal(suppressed.length, 0);
    const { rows: [thread] } = await db.query('select last_sequence from public.communication_threads where id = $1', [threadId]);
    assert.equal(thread.last_sequence, '5');
  });

  test('enforces retry bounds and applies webhook evidence idempotently in any valid order', async () => {
    const { rows: [notification] } = await db.query(`select id from public.communication_notifications
      where owner_user_id = $1 and recipient_user_id = $2 order by created_at limit 1`, [ids.owner, ids.clientUser]);
    const insertDelivery = async ({ status = 'pending', attemptCount = 0, providerId = `provider-${randomUUID()}` } = {}) => {
      const id = randomUUID();
      await db.query(`insert into public.communication_deliveries
        (id,owner_user_id,notification_id,recipient_user_id,channel,provider,status,idempotency_key,provider_message_id,attempt_count,next_attempt_at)
        values ($1,$2,$3,$4,'email','resend',$5,$6,$7,$8,now())`,
      [id, ids.owner, notification.id, ids.clientUser, status, `delivery-${randomUUID()}`, providerId, attemptCount]);
      return { id, providerId };
    };
    const occurredAt = '2026-08-12T12:00:00.000Z';
    const event = async ({ providerId, eventId, eventType, payloadHash = digest(eventId), metadata = { source: 'integration' }, client = db }) =>
      asService(async (connection) => (await connection.query(
        'select public.communication_record_delivery_event($1,$2,$3,$4,$5,$6,$7::jsonb) as value',
        ['resend', eventId, providerId, eventType, payloadHash, occurredAt, JSON.stringify(metadata)]
      )).rows[0].value, client);

    const exhausted = await insertDelivery({ status: 'failed_retryable', attemptCount: 3 });
    const exhaustedClaim = await asService((client) => client.query('select public.communication_claim_due_deliveries(10) as value'));
    assert.equal(exhaustedClaim.rows.length, 0);
    const { rows: [exhaustedState] } = await db.query('select status,attempt_count from public.communication_deliveries where id = $1', [exhausted.id]);
    assert.deepEqual(exhaustedState, { status: 'failed_retryable', attempt_count: 3 });

    const acceptedFirst = await insertDelivery();
    const { rows: [claimed] } = await asService((client) => client.query('select public.communication_claim_due_deliveries(10) as value'));
    assert.equal(claimed.value.id, acceptedFirst.id);
    assert.equal(claimed.value.attempt_count, 1);
    const acceptedEventId = `event-${randomUUID()}`;
    assert.equal((await event({ providerId: acceptedFirst.providerId, eventId: acceptedEventId, eventType: 'accepted' })).status, 'accepted');
    assert.equal((await event({ providerId: acceptedFirst.providerId, eventId: acceptedEventId, eventType: 'accepted' })).duplicate, true);
    const deliveredEventId = `event-${randomUUID()}`;
    assert.equal((await event({ providerId: acceptedFirst.providerId, eventId: deliveredEventId, eventType: 'delivered' })).status, 'delivered');
    assert.equal((await event({ providerId: acceptedFirst.providerId, eventId: deliveredEventId, eventType: 'delivered' })).duplicate, true);
    assert.equal((await event({ providerId: acceptedFirst.providerId, eventId: `event-${randomUUID()}`, eventType: 'failed' })).status, 'delivered');

    const deliveredFirst = await insertDelivery();
    assert.equal((await event({ providerId: deliveredFirst.providerId, eventId: `event-${randomUUID()}`, eventType: 'delivered' })).status, 'delivered');
    assert.equal((await event({ providerId: deliveredFirst.providerId, eventId: `event-${randomUUID()}`, eventType: 'accepted' })).status, 'delivered');
    const { rows: [deliveredState] } = await db.query(
      'select status,accepted_at is not null as accepted,delivered_at is not null as delivered from public.communication_deliveries where id = $1',
      [deliveredFirst.id]
    );
    assert.deepEqual(deliveredState, { status: 'delivered', accepted: true, delivered: true });

    const concurrent = await insertDelivery(); const concurrentEventId = `event-${randomUUID()}`;
    const firstConnection = new Client({ connectionString }); const secondConnection = new Client({ connectionString });
    await Promise.all([firstConnection.connect(), secondConnection.connect()]);
    let concurrentResults;
    try {
      concurrentResults = await Promise.all([
        event({ providerId: concurrent.providerId, eventId: concurrentEventId, eventType: 'delivered', client: firstConnection }),
        event({ providerId: concurrent.providerId, eventId: concurrentEventId, eventType: 'delivered', client: secondConnection }),
      ]);
    } finally { await Promise.all([firstConnection.end(), secondConnection.end()]); }
    assert.deepEqual(concurrentResults.map((result) => result.duplicate).sort(), [false, true]);
    const { rows: [eventCount] } = await db.query(
      'select count(*)::int as count from public.communication_delivery_events where provider = $1 and provider_event_id = $2',
      ['resend', concurrentEventId]
    );
    assert.equal(eventCount.count, 1);

    for (const conflicting of [
      { eventType: 'accepted', payloadHash: digest(concurrentEventId) },
      { eventType: 'delivered', payloadHash: digest('changed-payload') },
    ]) {
      const conflict = await rejected(() => event({ providerId: concurrent.providerId, eventId: concurrentEventId, ...conflicting }));
      assert.deepEqual({ code: conflict.code, message: conflict.message }, { code: 'P0001', message: 'COMMUNICATION_WEBHOOK_EVIDENCE_CONFLICT' });
    }
    const otherDelivery = await insertDelivery({ status: 'outcome_unknown' });
    const providerConflict = await rejected(() => event({ providerId: otherDelivery.providerId, eventId: concurrentEventId, eventType: 'delivered' }));
    assert.deepEqual({ code: providerConflict.code, message: providerConflict.message }, { code: 'P0001', message: 'COMMUNICATION_WEBHOOK_EVIDENCE_CONFLICT' });

    assert.equal((await event({ providerId: acceptedFirst.providerId, eventId: `event-${randomUUID()}`, eventType: 'bounced' })).status, 'failed_permanent');
    assert.equal((await event({ providerId: acceptedFirst.providerId, eventId: `event-${randomUUID()}`, eventType: 'delivered' })).status, 'failed_permanent');
    const { rows: [terminal] } = await db.query('select status,terminal_reason from public.communication_deliveries where id = $1', [acceptedFirst.id]);
    assert.deepEqual(terminal, { status: 'failed_permanent', terminal_reason: 'bounced' });
  });

  test('rolls back a thread creation when its redacted audit insert fails', async () => {
    const key = createKey('rollback-0001');
    await db.query('begin');
    try {
      await db.query(`alter table public.audit_logs add constraint communication_reject_audit
        check (event_type <> 'communication.thread') not valid`);
      await db.query('set local role service_role');
      await assert.rejects(db.query(
        'select public.communication_create_thread($1,$2,$3,$4::jsonb,$5,$6,$7)',
        [ids.owner, ids.owner, 'Rollback', JSON.stringify([
          { kind: 'owner', user_id: ids.owner }, { kind: 'client', membership_id: ids.clientMembership },
        ]), 'Will roll back', key, digest('rollback')]
      ), { code: '23514' });
    } finally { await db.query('rollback'); }
    const { rows: [count] } = await db.query(`select count(*)::int as count from public.communication_threads
      where owner_user_id = $1 and create_idempotency_key = $2`, [ids.owner, key]);
    assert.equal(count.count, 0);
  });
});
