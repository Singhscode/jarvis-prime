import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { provisionEmployee } from '../scripts/provision-employee.js';

const { Client } = pg;
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required.');
const target = new URL(connectionString);
if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
  throw new Error('Employee Portal integration tests require a disposable local database.');
}

const ids = {
  owner: '10000000-0000-4000-8000-000000000001',
  otherOwner: '10000000-0000-4000-8000-000000000002',
  employee: '20000000-0000-4000-8000-000000000001',
  otherEmployee: '20000000-0000-4000-8000-000000000002',
  client: '30000000-0000-4000-8000-000000000001',
  otherClient: '30000000-0000-4000-8000-000000000002',
  project: '40000000-0000-4000-8000-000000000001',
  otherProject: '40000000-0000-4000-8000-000000000002',
  assignedTask: '50000000-0000-4000-8000-000000000001',
  unassignedTask: '50000000-0000-4000-8000-000000000002',
  otherOwnerTask: '50000000-0000-4000-8000-000000000003',
  missingTask: '50000000-0000-4000-8000-000000000099',
};

let db;
const rpc = (taskId, completed, justification) => db.query(
  'select public.complete_employee_portal_task($1, $2, $3, $4) as task',
  [ids.employee, taskId, completed, justification]
);

async function rejectedRpc(taskId) {
  await db.query('savepoint expected_rpc_error');
  await db.query('set local role service_role');
  let error;
  try { await rpc(taskId, true, 'Denied'); } catch (caught) { error = caught; }
  await db.query('rollback to savepoint expected_rpc_error');
  assert.ok(error, 'RPC should reject inaccessible work');
  return { code: error.code, message: error.message };
}

describe('Employee Portal PostgreSQL RPC', { concurrency: false }, () => {
  before(async () => {
    db = new Client({ connectionString });
    await db.connect();
    await db.query('begin');
    await db.query(`insert into public.users (id, email, email_normalized, status, role) values
      ($1, 'owner@phase6.test', 'owner@phase6.test', 'active', 'client'),
      ($2, 'other-owner@phase6.test', 'other-owner@phase6.test', 'active', 'client')`,
    [ids.owner, ids.otherOwner]);
    await db.query(`insert into public.users
      (id, email, email_normalized, status, role, portal_owner_user_id) values
      ($1, 'employee@phase6.test', 'employee@phase6.test', 'active', 'employee', $3),
      ($2, 'other-employee@phase6.test', 'other-employee@phase6.test', 'active', 'employee', $3)`,
    [ids.employee, ids.otherEmployee, ids.owner]);
    await db.query(`insert into public.crm_clients (id, owner_user_id, name) values
      ($1, $3, 'Phase 6 Client'), ($2, $4, 'Other Client')`,
    [ids.client, ids.otherClient, ids.owner, ids.otherOwner]);
    await db.query(`insert into public.crm_projects (id, owner_user_id, client_id, name) values
      ($1, $3, $5, 'Phase 6 Project'), ($2, $4, $6, 'Other Project')`,
    [ids.project, ids.otherProject, ids.owner, ids.otherOwner, ids.client, ids.otherClient]);
    await db.query(`insert into public.crm_tasks
      (id, owner_user_id, project_id, name, assigned_user_id) values
      ($1, $4, $6, 'Assigned Task', $5),
      ($2, $4, $6, 'Different Assignee', $7),
      ($3, $8, $9, 'Other Owner Task', $5)`, [
      ids.assignedTask, ids.unassignedTask, ids.otherOwnerTask, ids.owner, ids.employee,
      ids.project, ids.otherEmployee, ids.otherOwner, ids.otherProject,
    ]);
  });

  after(async () => {
    if (!db) return;
    await db.query('rollback').catch(() => {});
    await db.end();
  });

  test('restricts RPC execution to service_role', async () => {
    const { rows: [privileges] } = await db.query(`select
      has_function_privilege('service_role', 'public.complete_employee_portal_task(uuid,uuid,boolean,text)', 'EXECUTE') as service_role,
      has_function_privilege('anon', 'public.complete_employee_portal_task(uuid,uuid,boolean,text)', 'EXECUTE') as anon,
      has_function_privilege('authenticated', 'public.complete_employee_portal_task(uuid,uuid,boolean,text)', 'EXECUTE') as authenticated`);
    assert.deepEqual(privileges, { service_role: true, anon: false, authenticated: false });

    const anon = new Client({ connectionString });
    await anon.connect();
    try {
      await anon.query('set role anon');
      await assert.rejects(
        anon.query('select public.complete_employee_portal_task($1, $2, true, $3)',
          [ids.employee, ids.assignedTask, 'Denied']),
        { code: '42501' }
      );
    } finally { await anon.end(); }
  });

  test('completes an assigned task and inserts one audit row', async () => {
    await db.query('set local role service_role');
    const { rows: [result] } = await rpc(ids.assignedTask, true, '  Completed review  ');
    await db.query('reset role');
    assert.equal(result.task.completed, true);

    const { rows: [audit] } = await db.query(`select user_id, event_type, action,
      resource_type, resource_id, details from public.audit_logs where resource_id = $1`,
    [ids.assignedTask]);
    assert.equal(audit.user_id, ids.employee);
    assert.equal(audit.event_type, 'employee_portal_task_completion');
    assert.equal(audit.action, 'update');
    assert.equal(audit.resource_type, 'crm_task');
    assert.equal(audit.details.justification, 'Completed review');
    assert.equal(audit.details.old_completed, false);
    assert.equal(audit.details.new_completed, true);
  });

  test('rolls task update back when audit insertion fails', async () => {
    await db.query('savepoint audit_failure');
    await db.query(`alter table public.audit_logs add constraint phase6_reject_audit
      check (event_type <> 'employee_portal_task_completion') not valid`);
    await db.query('set local role service_role');
    let error;
    try { await rpc(ids.assignedTask, false, 'Must roll back'); } catch (caught) { error = caught; }
    await db.query('rollback to savepoint audit_failure');
    assert.equal(error?.code, '23514');
    const { rows: [task] } = await db.query(
      'select completed from public.crm_tasks where id = $1', [ids.assignedTask]
    );
    assert.equal(task.completed, true);
    const { rows: [auditCount] } = await db.query(
      'select count(*)::int as count from public.audit_logs where resource_id = $1',
      [ids.assignedTask]
    );
    assert.equal(auditCount.count, 1);
  });

  test('enforces owner and assignment isolation with nondisclosing errors', async () => {
    const ownerError = await rejectedRpc(ids.otherOwnerTask);
    const assignmentError = await rejectedRpc(ids.unassignedTask);
    const missingError = await rejectedRpc(ids.missingTask);
    assert.deepEqual(ownerError, { code: 'P0001', message: 'TASK_NOT_FOUND' });
    assert.deepEqual(assignmentError, ownerError);
    assert.deepEqual(missingError, ownerError);

    const { rows } = await db.query(
      'select id, completed from public.crm_tasks where id = any($1::uuid[]) order by id',
      [[ids.unassignedTask, ids.otherOwnerTask]]
    );
    assert.deepEqual(rows, [
      { id: ids.unassignedTask, completed: false },
      { id: ids.otherOwnerTask, completed: false },
    ]);
  });
});


function refreshCookie(response) {
  const header = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie');
  const match = header?.match(/refreshToken=[^;]+/);
  assert.ok(match, 'refresh response must set a refresh cookie');
  return match[0];
}

describe('Employee Portal clean-install lifecycle', { concurrency: false }, () => {
  const apiUrl = process.env.EMPLOYEE_PORTAL_TEST_API_URL;
  let lifecycleDb;
  let server;
  let baseUrl;
  let ownerId;
  let employeeId;

  before(async () => {
    if (!apiUrl) throw new Error('EMPLOYEE_PORTAL_TEST_API_URL is required.');
    const apiTarget = new URL(apiUrl);
    if (!['127.0.0.1', 'localhost'].includes(apiTarget.hostname)) {
      throw new Error('Employee Portal lifecycle tests require a local API URL.');
    }

    ownerId = randomUUID();
    const ownerEmail = `owner-${ownerId}@phase6.test`;
    const employeeEmail = `employee-${randomUUID()}@phase6.test`;
    const lifecyclePassword = 'PortalLifecycle!2026';
    const clientId = randomUUID();
    const projectId = randomUUID();
    const taskId = randomUUID();
    lifecycleDb = new Client({ connectionString });
    await lifecycleDb.connect();
    await lifecycleDb.query(`insert into public.users
      (id, email, email_normalized, status, role, email_verified_at)
      values ($1, $2, $2, 'active', 'client', now())`, [ownerId, ownerEmail]);
    const employee = await provisionEmployee({
      connectionString,
      email: employeeEmail,
      password: lifecyclePassword,
      ownerUserId: ownerId,
      fullName: 'Lifecycle Employee',
    });
    employeeId = employee.id;
    await lifecycleDb.query(`insert into public.crm_clients (id, owner_user_id, name)
      values ($1, $2, 'Lifecycle Client')`, [clientId, ownerId]);
    await lifecycleDb.query(`insert into public.crm_projects (id, owner_user_id, client_id, name)
      values ($1, $2, $3, 'Lifecycle Project')`, [projectId, ownerId, clientId]);
    await lifecycleDb.query(`insert into public.crm_tasks
      (id, owner_user_id, project_id, name, assigned_user_id)
      values ($1, $2, $3, 'Lifecycle Task', $4)`, [taskId, ownerId, projectId, employeeId]);

    const { createApp } = await import('../src/app.js');
    const { app } = await createApp({ enableScheduler: false, enableRateLimit: false });
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (!lifecycleDb) return;
    await lifecycleDb.query('delete from public.audit_logs where user_id = any($1::uuid[])', [[ownerId, employeeId]]);
    await lifecycleDb.query('delete from public.refresh_tokens where user_id = any($1::uuid[])', [[ownerId, employeeId]]);
    await lifecycleDb.query('delete from public.sessions where user_id = any($1::uuid[])', [[ownerId, employeeId]]);
    await lifecycleDb.query('delete from public.crm_tasks where owner_user_id = $1', [ownerId]);
    await lifecycleDb.query('delete from public.crm_projects where owner_user_id = $1', [ownerId]);
    await lifecycleDb.query('delete from public.crm_clients where owner_user_id = $1', [ownerId]);
    await lifecycleDb.query('delete from public.users where id = any($1::uuid[])', [[employeeId, ownerId]]);
    await lifecycleDb.end();
  });

  test('logs in, refreshes concurrently, loads work, completes a task, logs out, and logs in again', async () => {
    const { rows: [employeeRecord] } = await lifecycleDb.query(
      'select email from public.users where id = $1', [employeeId]
    );
    const email = employeeRecord.email;
    const login = async () => fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'PortalLifecycle!2026', deviceName: 'Lifecycle Test' }),
    });

    const loginResponse = await login();
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    assert.ok(loginBody.tokens.accessToken);
    const originalCookie = refreshCookie(loginResponse);

    const [firstRefresh, secondRefresh] = await Promise.all([
      fetch(`${baseUrl}/api/auth/refresh`, { method: 'POST', headers: { cookie: originalCookie } }),
      fetch(`${baseUrl}/api/auth/refresh`, { method: 'POST', headers: { cookie: originalCookie } }),
    ]);
    assert.equal(firstRefresh.status, 200);
    assert.equal(secondRefresh.status, 200);
    const refreshBody = await firstRefresh.json();
    const refreshedCookie = refreshCookie(firstRefresh);

    const snapshotResponse = await fetch(`${baseUrl}/api/employee-portal`, {
      headers: { authorization: `Bearer ${refreshBody.accessToken}` },
    });
    assert.equal(snapshotResponse.status, 200);
    const snapshot = await snapshotResponse.json();
    assert.equal(snapshot.data.tasks.length, 1);
    const task = snapshot.data.tasks[0];

    const completeResponse = await fetch(`${baseUrl}/api/employee-portal/tasks/${task.id}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${refreshBody.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ completed: true, justification: 'Lifecycle verification complete.' }),
    });
    assert.equal(completeResponse.status, 200);
    assert.equal((await completeResponse.json()).data.completed, true);

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${refreshBody.accessToken}`, cookie: refreshedCookie },
    });
    assert.equal(logoutResponse.status, 200);
    assert.match(logoutResponse.headers.get('set-cookie') || '', /refreshToken=;/);

    const secondLoginResponse = await login();
    assert.equal(secondLoginResponse.status, 200);
    assert.ok((await secondLoginResponse.json()).tokens.accessToken);
  });
});