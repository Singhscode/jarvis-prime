import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required.');
const target = new URL(connectionString);
if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
  throw new Error('Client Portal integration tests require a disposable local database.');
}

const ids = Object.fromEntries([
  'owner', 'otherOwner', 'clientUser', 'otherClientUser', 'client', 'otherClient',
  'contact', 'otherContact', 'project', 'otherProject',
].map((name) => [name, randomUUID()]));
const hash = (suffix) => `${suffix}`.repeat(64).slice(0, 64);
let db;

async function asService(operation) {
  await db.query('savepoint service_role_operation');
  await db.query('set role service_role');
  try {
    const result = await operation();
    await db.query('reset role');
    await db.query('release savepoint service_role_operation');
    return result;
  } catch (error) {
    await db.query('rollback to savepoint service_role_operation');
    throw error;
  }
}
async function reissue(ownerId, clientId, contactId, tokenHash = hash('a')) {
  return asService(async () => (await db.query(
    'select public.reissue_client_portal_invitation($1, $2, $3, $4, now() + interval \'23 hours\') as value',
    [ownerId, clientId, contactId, tokenHash]
  )).rows[0].value);
}
async function activate(userId, tokenHash) {
  return asService(async () => (await db.query(
    'select public.activate_client_portal_invitation($1, $2) as value', [userId, tokenHash]
  )).rows[0].value);
}
async function rejected(operation) {
  await db.query('savepoint expected_failure');
  let error;
  try { await operation(); } catch (caught) { error = caught; }
  await db.query('rollback to savepoint expected_failure');
  await db.query('release savepoint expected_failure');
  assert.ok(error, 'operation should fail');
  return { code: error.code, message: error.message };
}

describe('Client Portal PostgreSQL migration and RPCs', { concurrency: false }, () => {
  before(async () => {
    db = new Client({ connectionString });
    await db.connect();
    await db.query('begin');
    await db.query(`insert into public.users (id, email, email_normalized, status, role) values
      ($1, 'owner@phase7.test', 'owner@phase7.test', 'active', 'client'),
      ($2, 'other-owner@phase7.test', 'other-owner@phase7.test', 'active', 'client'),
      ($3, 'member@phase7.test', 'member@phase7.test', 'active', 'client'),
      ($4, 'other-member@phase7.test', 'other-member@phase7.test', 'active', 'client')`,
    [ids.owner, ids.otherOwner, ids.clientUser, ids.otherClientUser]);
    await db.query(`insert into public.crm_clients (id, owner_user_id, name) values
      ($1, $3, 'Phase 7 Client'), ($2, $4, 'Other Client')`,
    [ids.client, ids.otherClient, ids.owner, ids.otherOwner]);
    await db.query(`insert into public.contacts (id, owner_user_id, client_id, name, email) values
      ($1, $3, $5, 'Client Contact', 'member@phase7.test'),
      ($2, $4, $6, 'Other Contact', 'other-member@phase7.test')`,
    [ids.contact, ids.otherContact, ids.owner, ids.otherOwner, ids.client, ids.otherClient]);
    await db.query(`insert into public.crm_projects (id, owner_user_id, client_id, name) values
      ($1, $3, $5, 'Phase 7 Project'), ($2, $4, $6, 'Other Project')`,
    [ids.project, ids.otherProject, ids.owner, ids.otherOwner, ids.client, ids.otherClient]);
  });

  after(async () => {
    if (!db) return;
    await db.query('rollback').catch(() => {});
    await db.end();
  });

  test('verifies private tables, RLS, bucket, indexes, and service-role-only RPC execution', async () => {
    const { rows: [tables] } = await db.query(`select
      (select relrowsecurity from pg_class where oid = 'public.client_portal_memberships'::regclass) as memberships_rls,
      (select relrowsecurity from pg_class where oid = 'public.client_portal_invitations'::regclass) as invitations_rls,
      (select relrowsecurity from pg_class where oid = 'public.client_portal_documents'::regclass) as documents_rls,
      exists (select 1 from storage.buckets where id = 'client-portal-private' and public = false) as private_bucket`);
    assert.deepEqual(tables, { memberships_rls: true, invitations_rls: true, documents_rls: true, private_bucket: true });
    const { rows: [privileges] } = await db.query(`select
      has_function_privilege('service_role', 'public.reissue_client_portal_invitation(uuid,uuid,uuid,text,timestamptz)', 'EXECUTE') as service,
      has_function_privilege('anon', 'public.reissue_client_portal_invitation(uuid,uuid,uuid,text,timestamptz)', 'EXECUTE') as anon,
      has_function_privilege('authenticated', 'public.activate_client_portal_invitation(uuid,text)', 'EXECUTE') as authenticated`);
    assert.deepEqual(privileges, { service: true, anon: false, authenticated: false });
    const anon = new Client({ connectionString });
    await anon.connect();
    try {
      await anon.query('set role anon');
      await assert.rejects(anon.query('select public.activate_client_portal_invitation($1, $2)', [ids.clientUser, hash('z')]), { code: '42501' });
    } finally { await anon.end(); }
  });

  test('requires an owned contact with a matching active client account and revokes prior invitations on resend', async () => {
    const first = await reissue(ids.owner, ids.client, ids.contact, hash('a'));
    const second = await reissue(ids.owner, ids.client, ids.contact, hash('b'));
    assert.equal(first.membership_id, second.membership_id);
    const { rows: invitations } = await db.query(`select token_hash, revoked_at is not null as revoked
      from public.client_portal_invitations where membership_id = $1 order by created_at`, [first.membership_id]);
    assert.deepEqual(invitations, [{ token_hash: hash('a'), revoked: true }, { token_hash: hash('b'), revoked: false }]);
    const { rows: [audit] } = await db.query(`select action, details from public.audit_logs
      where resource_id = $1 and action = 'resend' limit 1`, [first.membership_id]);
    assert.equal(audit.action, 'resend');
    assert.doesNotMatch(JSON.stringify(audit.details), /token|hash|member@phase7/i);
    const missingAccountContact = randomUUID();
    await db.query(`insert into public.contacts (id, owner_user_id, client_id, name, email)
      values ($1, $2, $3, 'No Account', 'missing-account@phase7.test')`,
    [missingAccountContact, ids.owner, ids.client]);
    const noAccount = await rejected(() => reissue(ids.owner, ids.client, missingAccountContact, hash('c')));
    const failure = await rejected(() => reissue(ids.otherOwner, ids.client, ids.contact, hash('c')));
    assert.deepEqual(noAccount, { code: 'P0001', message: 'PORTAL_MEMBER_NOT_FOUND' });
    assert.deepEqual(failure, noAccount);
  });

  test('activates once, rejects replay and wrong-user redemption, and keeps one active scope', async () => {
    const issued = await reissue(ids.owner, ids.client, ids.contact, hash('d'));
    assert.deepEqual(await activate(ids.otherClientUser, hash('d')), { activated: false });
    assert.deepEqual(await activate(ids.clientUser, hash('d')), { activated: true });
    assert.deepEqual(await activate(ids.clientUser, hash('d')), { activated: false });
    const revoked = await reissue(ids.otherOwner, ids.otherClient, ids.otherContact, hash('e'));
    await asService(() => db.query('select public.revoke_client_portal_membership($1, $2, $3)', [ids.otherOwner, ids.otherClient, revoked.membership_id]));
    assert.deepEqual(await activate(ids.otherClientUser, hash('e')), { activated: false });
    const expiredMembership = randomUUID();
    await db.query(`insert into public.client_portal_memberships
      (id, crm_client_id, contact_id, user_id, email_normalized, status, created_by_user_id)
      values ($1, $2, $3, $4, 'other-member@phase7.test', 'pending', $5)`,
    [expiredMembership, ids.otherClient, ids.otherContact, ids.otherClientUser, ids.otherOwner]);
    await db.query(`insert into public.client_portal_invitations
      (membership_id, token_hash, created_by_user_id, created_at, expires_at)
      values ($1, $2, $3, now() - interval '2 hours', now() - interval '1 hour')`, [expiredMembership, hash('f'), ids.otherOwner]);
    assert.deepEqual(await activate(ids.otherClientUser, hash('f')), { activated: false });
    const { rows: [membership] } = await db.query(`select user_id, status, activated_at is not null as activated
      from public.client_portal_memberships where id = $1`, [issued.membership_id]);
    assert.deepEqual(membership, { user_id: ids.clientUser, status: 'active', activated: true });
    const duplicate = await rejected(() => db.query(`insert into public.client_portal_memberships
      (crm_client_id, contact_id, user_id, email_normalized, status, activated_at, created_by_user_id)
      values ($1, $2, $3, 'member@phase7.test', 'active', now(), $4)`,
    [ids.client, ids.contact, ids.clientUser, ids.owner]));
    assert.equal(duplicate.code, '23505');
    const { rows: failures } = await db.query(`select success, details from public.audit_logs
      where event_type = 'client_portal_invitation' and action = 'activate' and success = false`);
    assert.ok(failures.length >= 2);
    assert.ok(failures.every((row) => JSON.stringify(row.details) === JSON.stringify({ outcome: 'failure' })));
  });

  test('revokes only an owner-scoped membership and all usable invitations atomically', async () => {
    const { rows: [active] } = await db.query(`select id from public.client_portal_memberships
      where user_id = $1 and status = 'active'`, [ids.clientUser]);
    const foreign = await rejected(() => asService(() => db.query(
      'select public.revoke_client_portal_membership($1, $2, $3)', [ids.otherOwner, ids.otherClient, active.id]
    )));
    assert.deepEqual(foreign, { code: 'P0001', message: 'PORTAL_MEMBER_NOT_FOUND' });
    const result = await asService(async () => (await db.query(
      'select public.revoke_client_portal_membership($1, $2, $3) as value', [ids.owner, ids.client, active.id]
    )).rows[0].value);
    assert.deepEqual(result, { id: active.id, status: 'revoked' });
    const { rows: [revoked] } = await db.query(`select status, revoked_at is not null as revoked
      from public.client_portal_memberships where id = $1`, [active.id]);
    assert.deepEqual(revoked, { status: 'revoked', revoked: true });
    const { rows: [audit] } = await db.query(`select action from public.audit_logs
      where event_type = 'client_portal_membership' and resource_id = $1`, [active.id]);
    assert.equal(audit.action, 'revoke');
  });

  test('publishes only a client-scoped project document and rolls metadata back when its audit fails', async () => {
    const published = await asService(async () => (await db.query(`select public.publish_client_portal_document(
      $1, $2, $3, 'client-portal-private', 'client/path.pdf', 'Delivery', 'deliverable'
    ) as value`, [ids.owner, ids.client, ids.project])).rows[0].value);
    assert.equal(published.title, 'Delivery');
    const inaccessible = await rejected(() => asService(() => db.query(`select public.publish_client_portal_document(
      $1, $2, $3, 'client-portal-private', 'client/other.pdf', 'Other', 'report'
    )`, [ids.owner, ids.client, ids.otherProject])));
    assert.deepEqual(inaccessible, { code: 'P0001', message: 'PORTAL_DOCUMENT_NOT_FOUND' });
    await db.query('savepoint document_audit_failure');
    await db.query(`alter table public.audit_logs add constraint phase7_reject_document_audit
      check (event_type <> 'client_portal_document') not valid`);
    let failure;
    try {
      await asService(() => db.query(`select public.publish_client_portal_document(
        $1, $2, null, 'client-portal-private', 'client/rollback.pdf', 'Rollback', 'report'
      )`, [ids.owner, ids.client]));
    } catch (caught) { failure = caught; }
    await db.query('rollback to savepoint document_audit_failure');
    assert.equal(failure?.code, '23514');
    const { rows: [count] } = await db.query(`select count(*)::int as count from public.client_portal_documents
      where storage_path = 'client/rollback.pdf'`);
    assert.equal(count.count, 0);
  });

  test('generates one display Client ID mechanism for direct and converted clients', async () => {
    await db.query('set role postgres');
    const directClientId = randomUUID();
    const otherOwnerClientId = randomUUID();
    const { rows: [direct] } = await db.query(`insert into public.crm_clients
      (id, owner_user_id, name, email, phone, company, notes)
      values ($1, $2, 'Direct Client', 'direct@phase8.test', '+919876543210', 'Direct Co', 'Created directly')
      returning id, client_code, email, phone, company, notes`, [directClientId, ids.owner]);
    assert.equal(direct.id, directClientId);
    assert.match(direct.client_code, /^JP-CLI-\d+$/);
    assert.equal(direct.email, 'direct@phase8.test');
    assert.equal(direct.phone, '+919876543210');
    assert.equal(direct.company, 'Direct Co');
    assert.equal(direct.notes, 'Created directly');
    const { rows: [legacy] } = await db.query('select client_code from public.crm_clients where id = $1', [ids.client]);
    assert.match(legacy.client_code, /^JP-CLI-\d+$/);
    await db.query(`insert into public.crm_clients (id, owner_user_id, name, email, phone, company)
      values ($1, $2, 'Other Direct Client', 'direct@phase8.test', '+919876543211', 'Other Co')`, [otherOwnerClientId, ids.otherOwner]);
    const duplicate = await rejected(() => db.query(`insert into public.crm_clients
      (owner_user_id, name, email, phone, company) values ($1, 'Duplicate', 'DIRECT@PHASE8.TEST', '+919876543212', 'Direct Co')`, [ids.owner]));
    assert.equal(duplicate.code, '23505');

    const conversionContactId = randomUUID(); const conversionLeadId = randomUUID();
    await db.query(`insert into public.contacts (id, owner_user_id, name) values ($1, $2, 'Conversion Contact')`, [conversionContactId, ids.owner]);
    await db.query(`insert into public.crm_leads (id, owner_user_id, contact_id) values ($1, $2, $3)`, [conversionLeadId, ids.owner, conversionContactId]);
    const { rows: [converted] } = await db.query(`select * from public.convert_crm_lead_to_client($1, $2, $3, 'Converted Client')`, [ids.owner, conversionLeadId, conversionContactId]);
    assert.match(converted.client_code, /^JP-CLI-\d+$/);
    assert.notEqual(converted.client_code, direct.client_code);
    const { rows: [linked] } = await db.query(`select
      (select client_id from public.crm_leads where id = $1) as lead_client_id,
      (select client_id from public.contacts where id = $2) as contact_client_id`, [conversionLeadId, conversionContactId]);
    assert.deepEqual(linked, { lead_client_id: converted.id, contact_client_id: converted.id });
  });
});
