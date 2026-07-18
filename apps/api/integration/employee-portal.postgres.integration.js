import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

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