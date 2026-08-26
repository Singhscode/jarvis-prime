import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required.');
if (!['127.0.0.1', 'localhost'].includes(new URL(connectionString).hostname)) throw new Error('Client deletion integration tests require a disposable local database.');
let db;
async function service(run) { await db.query('savepoint service_role_operation'); await db.query('set role service_role'); try { const value = await run(); await db.query('reset role'); await db.query('release savepoint service_role_operation'); return value; } catch (error) { await db.query('rollback to savepoint service_role_operation'); throw error; } }
async function rejected(run) { await db.query('savepoint expected_failure'); let error; try { await run(); } catch (caught) { error = caught; } await db.query('rollback to savepoint expected_failure'); await db.query('release savepoint expected_failure'); assert.ok(error, 'operation should fail'); return { code: error.code, message: error.message }; }
async function fixture({ withLead = false } = {}) {
  const ids = Object.fromEntries(['owner', 'portalUser', 'client', 'contact', 'lead', 'membership'].map((name) => [name, randomUUID()]));
  await db.query(`insert into public.users (id,email,email_normalized,status,role) values ($1,'delete-owner@test.local','delete-owner@test.local','active','client'),($2,'delete-user@test.local','delete-user@test.local','active','client')`, [ids.owner, ids.portalUser]);
  await db.query(`insert into public.crm_clients (id,owner_user_id,name) values ($1,$2,'Delete Me')`, [ids.client, ids.owner]);
  await db.query(`insert into public.contacts (id,owner_user_id,client_id,name,email) values ($1,$2,$3,'Delete Contact','delete-user@test.local')`, [ids.contact, ids.owner, ids.client]);
  if (withLead) await db.query(`insert into public.crm_leads (id,owner_user_id,contact_id,client_id) values ($1,$2,$3,$4)`, [ids.lead, ids.owner, ids.contact, ids.client]);
  await db.query(`insert into public.client_portal_memberships (id,crm_client_id,contact_id,user_id,email_normalized,status,created_by_user_id) values ($1,$2,$3,$4,'delete-user@test.local','pending',$5)`, [ids.membership, ids.client, ids.contact, ids.portalUser, ids.owner]);
  await db.query(`insert into public.client_portal_invitations (membership_id,token_hash,created_by_user_id,expires_at) values ($1,$2,$3,now()+interval '1 hour')`, [ids.membership, 'a'.repeat(64), ids.owner]);
  return ids;
}

async function provision(ownerId, email, tokenHash = 'b'.repeat(64)) {
  return service(async () => (await db.query(
    `select public.provision_client_account($1, 'Recreated Client', 'Recreated Contact', $2, null, $3, now() + interval '1 hour') value`,
    [ownerId, email, tokenHash],
  )).rows[0].value);
}

describe('Owner client account deletion RPC', { concurrency: false }, () => {
  before(async () => { db = new Client({ connectionString }); await db.connect(); await db.query('begin'); });
  after(async () => { await db?.query('rollback').catch(() => {}); await db?.end(); });

  test('is service-role only and preserves RLS boundaries', async () => {
    const { rows: [access] } = await db.query(`select has_function_privilege('service_role','public.delete_owner_client_account(uuid,uuid)','EXECUTE') service, has_function_privilege('anon','public.delete_owner_client_account(uuid,uuid)','EXECUTE') anon, has_function_privilege('authenticated','public.delete_owner_client_account(uuid,uuid)','EXECUTE') authenticated, (select relrowsecurity from pg_class where oid='public.client_portal_memberships'::regclass) memberships_rls, (select relrowsecurity from pg_class where oid='public.client_portal_documents'::regclass) documents_rls`);
    assert.deepEqual(access, { service: true, anon: false, authenticated: false, memberships_rls: true, documents_rls: true });
    const anon = new Client({ connectionString }); await anon.connect(); try { await anon.query('set role anon'); await assert.rejects(anon.query('select public.delete_owner_client_account($1,$2)', [randomUUID(), randomUUID()]), { code: '42501' }); } finally { await anon.end(); }
  });

  test('removes an exclusive provisioned contact, leaves email eligibility unblocked, and permits a new provision with the same email', async () => {
    await db.query('savepoint successful_delete'); const ids = await fixture();
    await db.query(`insert into public.sessions (user_id,ip_address,expires_at) values ($1,'127.0.0.1',now()+interval '1 hour')`, [ids.portalUser]);
    await db.query(`insert into public.audit_logs (user_id,event_type,action,success) values ($1,'test','before_delete',true)`, [ids.portalUser]);
    const result = await service(async () => (await db.query('select public.delete_owner_client_account($1,$2) value', [ids.owner, ids.client])).rows[0].value);
    assert.deepEqual(result, { id: ids.client });
    const { rows: [state] } = await db.query(`select
      (select count(*) from public.crm_clients where id=$1)::int clients,
      (select count(*) from public.contacts where id=$2)::int contacts,
      (select count(*) from public.client_portal_memberships where crm_client_id=$1)::int memberships,
      (select count(*) from public.client_portal_invitations where membership_id=$3)::int invitations,
      (select count(*) from public.users where id=$4)::int users,
      (select count(*) from public.sessions where user_id=$4)::int sessions,
      (select user_id is null from public.audit_logs where event_type='test' and action='before_delete') audit_preserved`, [ids.client, ids.contact, ids.membership, ids.portalUser]);
    assert.deepEqual(state, { clients: 0, contacts: 0, memberships: 0, invitations: 0, users: 0, sessions: 0, audit_preserved: true });
    const recreated = await provision(ids.owner, 'delete-user@test.local');
    assert.notEqual(recreated.client_id, ids.client);
    const { rows: [recreatedState] } = await db.query(`select
      (select count(*) from public.crm_clients where id=$1)::int clients,
      (select count(*) from public.contacts where owner_user_id=$2 and lower(btrim(email))='delete-user@test.local')::int contacts,
      (select count(*) from public.users where email_normalized='delete-user@test.local')::int users`, [recreated.client_id, ids.owner]);
    assert.deepEqual(recreatedState, { clients: 1, contacts: 1, users: 1 });
    await db.query('rollback to savepoint successful_delete');
  });

  test('preserves a contact with independent CRM use and detaches only its deleted client link', async () => {
    await db.query('savepoint independent_contact'); const ids = await fixture({ withLead: true });
    await service(async () => db.query('select public.delete_owner_client_account($1,$2)', [ids.owner, ids.client]));
    const { rows: [state] } = await db.query(`select
      (select count(*) from public.crm_clients where id=$1)::int clients,
      (select client_id is null from public.contacts where id=$2) contact_preserved_detached,
      (select client_id is null from public.crm_leads where id=$3) lead_preserved_detached`, [ids.client, ids.contact, ids.lead]);
    assert.deepEqual(state, { clients: 0, contact_preserved_detached: true, lead_preserved_detached: true });
    await db.query('rollback to savepoint independent_contact');
  });

  test('fails closed for finance, projects/tasks, documents, shared portal users, owner/employee identities, and audit write failures', async () => {
    const blocker = async (insert) => { await db.query('savepoint blocker'); const ids = await fixture(); await insert(ids); const failure = await rejected(() => service(() => db.query('select public.delete_owner_client_account($1,$2)', [ids.owner, ids.client]))); assert.deepEqual(failure, { code: 'P0001', message: 'CLIENT_ACCOUNT_DELETE_CONFLICT' }); const { rows: [preserved] } = await db.query('select count(*)::int count from public.crm_clients where id=$1', [ids.client]); assert.equal(preserved.count, 1); await db.query('rollback to savepoint blocker'); };
    await blocker((ids) => db.query(`insert into public.finance_payments (owner_user_id,crm_client_id,currency,amount_minor) values ($1,$2,'INR',1)`, [ids.owner, ids.client]));
    await blocker(async (ids) => { const profile = randomUUID(); await db.query(`insert into public.finance_billing_profiles (id,owner_user_id,legal_name) values ($1,$2,'Delete Test')`, [profile, ids.owner]); await db.query(`insert into public.finance_invoices (owner_user_id,billing_profile_id,crm_client_id,invoice_number,currency) values ($1,$2,$3,'DELETE-TEST','INR')`, [ids.owner, profile, ids.client]); });
    await blocker((ids) => db.query(`insert into public.crm_projects (owner_user_id,client_id,name) values ($1,$2,'blocked project')`, [ids.owner, ids.client]));
    await blocker((ids) => db.query(`insert into public.client_portal_documents (crm_client_id,storage_bucket,storage_path,title,document_type,created_by_user_id) values ($1,'client-portal-private',$2,'blocked','report',$3)`, [ids.client, `blocked/${randomUUID()}`, ids.owner]));
    await blocker(async (ids) => { const otherClient = randomUUID(); const otherContact = randomUUID(); const otherMembership = randomUUID(); await db.query('insert into public.crm_clients (id,owner_user_id,name) values ($1,$2,$3)', [otherClient, ids.owner, 'Other']); await db.query('insert into public.contacts (id,owner_user_id,client_id,name,email) values ($1,$2,$3,$4,$5)', [otherContact, ids.owner, otherClient, 'Other contact', 'other-delete-user@test.local']); await db.query(`insert into public.client_portal_memberships (id,crm_client_id,contact_id,user_id,email_normalized,status,created_by_user_id,revoked_at) values ($1,$2,$3,$4,'delete-user@test.local','revoked',$5,now())`, [otherMembership, otherClient, otherContact, ids.portalUser, ids.owner]); });
    await blocker((ids) => db.query('update public.users set role=$1 where id=$2', ['employee', ids.portalUser]));
    await blocker((ids) => db.query(`insert into public.companies (owner_user_id,name) values ($1,'portal identity owns data')`, [ids.portalUser]));
    await db.query('savepoint audit_failure'); const ids = await fixture(); await db.query(`alter table public.audit_logs add constraint reject_client_delete_audit check (event_type <> 'client_account') not valid`); const failure = await rejected(() => service(() => db.query('select public.delete_owner_client_account($1,$2)', [ids.owner, ids.client]))); assert.equal(failure.code, '23514'); const { rows: [rolledBack] } = await db.query(`select (select count(*)::int from public.crm_clients where id=$1) clients,(select client_id=$1 from public.contacts where id=$2) contact_still_attached,(select count(*)::int from public.client_portal_memberships where id=$3) memberships`, [ids.client, ids.contact, ids.membership]); assert.deepEqual(rolledBack, { clients: 1, contact_still_attached: true, memberships: 1 }); await db.query('rollback to savepoint audit_failure');
  });

  test('returns the same safe not-found error for missing and foreign clients', async () => {
    await db.query('savepoint not_found'); const ids = await fixture(); const foreignOwner = randomUUID(); await db.query(`insert into public.users (id,email,email_normalized,status,role) values ($1,'foreign-owner@test.local','foreign-owner@test.local','active','client')`, [foreignOwner]);
    const missing = await rejected(() => service(() => db.query('select public.delete_owner_client_account($1,$2)', [ids.owner, randomUUID()])));
    const foreign = await rejected(() => service(() => db.query('select public.delete_owner_client_account($1,$2)', [foreignOwner, ids.client])));
    assert.deepEqual(missing, { code: 'P0001', message: 'CLIENT_ACCOUNT_NOT_FOUND' }); assert.deepEqual(foreign, missing); await db.query('rollback to savepoint not_found');
  });
});
