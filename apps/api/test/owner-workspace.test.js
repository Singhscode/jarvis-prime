import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const nativeFetch = globalThis.fetch;
process.env.SUPABASE_URL = 'https://owner-workspace.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_SECRET = 'owner-workspace-test-jwt-secret';
process.env.DRY_RUN = 'true';

let databaseFetch = () => { throw new Error('Unexpected database request'); };
const calls = [];
const ownerId = '10000000-0000-4000-8000-000000000001';
const authorizationCalls = [];
const ownerIdentity = () => ({ id: ownerId, role: 'client', status: 'active' });
let workspaceIdentity = ownerIdentity();
let activeClientPortalMembership = false;
globalThis.fetch = async (input, init = {}) => {
  const url = input instanceof Request ? input.url : String(input);
  const requestUrl = new URL(url);
  const isWorkspaceIdentityQuery = requestUrl.pathname.endsWith('/users')
    && requestUrl.searchParams.get('select') === 'id,role,status'
    && requestUrl.searchParams.get('id') === `eq.${ownerId}`;
  if (isWorkspaceIdentityQuery) {
    authorizationCalls.push(url);
    return json(workspaceIdentity);
  }
  const isWorkspaceMembershipQuery = requestUrl.pathname.endsWith('/client_portal_memberships')
    && requestUrl.searchParams.get('select') === 'id'
    && requestUrl.searchParams.get('user_id') === `eq.${ownerId}`;
  if (isWorkspaceMembershipQuery) {
    authorizationCalls.push(url);
    return json(activeClientPortalMembership ? [{ id: '20000000-0000-4000-8000-000000000002' }] : []);
  }
  calls.push(url);
  return databaseFetch(url, init);
};

after(() => { globalThis.fetch = nativeFetch; });

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const count = (value) => new Response(null, { status: 200, headers: { 'content-range': `0-0/${value}` } });

const express = (await import('express')).default;
const { default: ownerWorkspaceRouter } = await import('../src/modules/owner-workspace/owner-workspace.routes.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');
const { createAccessToken } = await import('../src/modules/auth/jwt-service.js');

async function withServer(run) {
  const app = express(); app.use(express.json()); app.use('/owner-workspace', ownerWorkspaceRouter); app.use(errorHandler);
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try { await run(server.address().port); } finally { await new Promise((resolve) => server.close(resolve)); }
}

function token(role = 'client') {
  return createAccessToken({ id: ownerId, email: 'owner@example.test', role }, { id: '20000000-0000-4000-8000-000000000002', device_id: 'test' }, process.env.JWT_SECRET);
}

describe('Owner Workspace', () => {
  test('requires the existing JWT and applies the server-side Owner Workspace predicate before bootstrap', async () => {
    workspaceIdentity = ownerIdentity(); activeClientPortalMembership = false; authorizationCalls.length = 0;
    await withServer(async (port) => {
      let response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/bootstrap`);
      assert.equal(response.status, 401);

      response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/bootstrap`, { headers: { Authorization: `Bearer ${token()}` } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const body = await response.json();
      assert.deepEqual(body.data, { identity: { email: 'owner@example.test' }, capabilities: { overview: 'available' } });
      assert.doesNotMatch(JSON.stringify(body), /session_id|role|refresh/i);

      workspaceIdentity = { id: ownerId, role: 'employee', status: 'active' };
      response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/bootstrap`, { headers: { Authorization: `Bearer ${token('employee')}` } });
      assert.equal(response.status, 403); assert.equal((await response.json()).error.code, 'INSUFFICIENT_PERMISSIONS');

      workspaceIdentity = ownerIdentity(); activeClientPortalMembership = true;
      response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/bootstrap?owner_user_id=attacker`, { headers: { Authorization: `Bearer ${token('client')}` } });
      assert.equal(response.status, 403); assert.equal((await response.json()).error.code, 'INSUFFICIENT_PERMISSIONS');
    });
    assert.ok(authorizationCalls.some((url) => url.includes('/users?')));
    assert.ok(authorizationCalls.some((url) => url.includes('/client_portal_memberships?')));
    workspaceIdentity = ownerIdentity(); activeClientPortalMembership = false;
  });

  test('uses only the JWT subject for bounded aggregate scope and preserves unavailable states', async () => {
    calls.length = 0;
    databaseFetch = (rawUrl) => {
      const url = new URL(rawUrl);
      if (url.pathname.endsWith('/users')) return count(2);
      if (url.pathname.endsWith('/crm_tasks') && url.searchParams.get('completed') === 'eq.false') return count(3);
      if (url.pathname.endsWith('/crm_tasks') && url.searchParams.get('completed') === 'eq.true') return count(4);
      throw new Error(`Unexpected query: ${rawUrl}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/dashboard?owner_user_id=attacker`, { headers: { Authorization: `Bearer ${token('employee')}` } });
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const body = await response.json();
      assert.equal(body.data.metrics.find((metric) => metric.label === 'Active employees').value, 2);
      const unavailable = body.data.metrics.find((metric) => metric.label === 'Active clients');
      assert.equal(unavailable.status, 'unavailable'); assert.equal(Object.hasOwn(unavailable, 'value'), false);
    });
    for (const rawUrl of calls.filter((url) => url.includes('/crm_tasks?'))) { const url = new URL(rawUrl); assert.equal(url.searchParams.get('owner_user_id'), `eq.${ownerId}`); assert.equal(url.searchParams.get('select'), 'id'); }
    const employeeQuery = new URL(calls.find((url) => url.includes('/users?')));
    assert.equal(employeeQuery.searchParams.get('portal_owner_user_id'), `eq.${ownerId}`);
    assert.equal(employeeQuery.searchParams.get('role'), 'eq.employee'); assert.equal(employeeQuery.searchParams.get('status'), 'eq.active');
  });

  test('redacts database failures from the dashboard response', async () => {
    databaseFetch = () => json({ message: 'raw database failure' }, 500);
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/dashboard`, { headers: { Authorization: `Bearer ${token()}` } });
      assert.equal(response.status, 500); const body = await response.json();
      assert.equal(body.error.code, 'OWNER_WORKSPACE_UNAVAILABLE');
      assert.equal(body.error.message, 'Internal server error'); assert.doesNotMatch(JSON.stringify(body), /raw database failure/);
    });
  });
});


test('provides bounded owner-scoped CRM reads with validated filters, sorting, and pagination', async () => {
  calls.length = 0;
  databaseFetch = (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/companies')) return json([
      { id: '30000000-0000-4000-8000-000000000003', name: 'Acme', created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z' },
      { id: '40000000-0000-4000-8000-000000000004', name: 'Beta', created_at: '2026-07-19T00:00:00.000Z', updated_at: '2026-07-19T00:00:00.000Z' },
    ]);
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/crm/companies?owner_user_id=attacker&limit=1&q=Acme&sort=name:asc`, { headers: { Authorization: `Bearer ${token()}` } });
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.data.items.length, 1); assert.equal(body.data.pageInfo.hasNextPage, true);
    const invalid = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/crm/companies?sort=owner_user_id:asc`, { headers: { Authorization: `Bearer ${token()}` } });
    assert.equal(invalid.status, 400);
  });
  const query = new URL(calls.find((url) => url.includes('/companies?')));
  assert.equal(query.searchParams.get('owner_user_id'), `eq.${ownerId}`);
  assert.equal(query.searchParams.get('select'), 'id,name,created_at,updated_at');
  assert.equal(query.searchParams.get('name'), 'ilike.%Acme%');
  assert.equal(query.searchParams.get('order'), 'name.asc,id.asc');
  assert.equal(query.searchParams.get('limit'), '2');
});

test('returns a scoped portal administration snapshot without invitation or storage secrets', async () => {
  calls.length = 0;
  const clientId = '30000000-0000-4000-8000-000000000003';
  databaseFetch = (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/crm_clients')) return json({ id: clientId, name: 'Acme', created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z' });
    if (url.pathname.endsWith('/client_portal_memberships')) return json([{ id: '40000000-0000-4000-8000-000000000004', contact_id: '50000000-0000-4000-8000-000000000005', status: 'pending', created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z', activated_at: null, revoked_at: null }]);
    if (url.pathname.endsWith('/contacts')) return json([{ id: '50000000-0000-4000-8000-000000000005', name: 'Ava', email: 'ava@example.test', title: 'Director' }]);
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/clients/${clientId}/portal?client_id=attacker`, { headers: { Authorization: `Bearer ${token()}` } });
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.data.memberships[0].contact.name, 'Ava'); assert.equal(body.data.activity.items[0].label, 'Client Portal invitation pending');
    assert.doesNotMatch(JSON.stringify(body), /token_hash|storage_path|storage_bucket|email_normalized|raw-invitation|invitation=[^\s"']+/i);
  });
  const clientQuery = new URL(calls.find((url) => url.includes('/crm_clients?')));
  assert.equal(clientQuery.searchParams.get('owner_user_id'), `eq.${ownerId}`); assert.equal(clientQuery.searchParams.get('id'), `eq.${clientId}`);
  const membershipQuery = new URL(calls.find((url) => url.includes('/client_portal_memberships?')));
  assert.equal(membershipQuery.searchParams.get('crm_client_id'), `eq.${clientId}`);
});

test('delegates portal membership revocation with server-derived owner scope', async () => {
  const clientId = '30000000-0000-4000-8000-000000000003';
  const membershipId = '40000000-0000-4000-8000-000000000004';
  let revokeBody;
  databaseFetch = (rawUrl, init) => {
    const path = new URL(rawUrl).pathname;
    if (path.endsWith('/crm_clients')) return json({ id: clientId, name: 'Acme', created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z' });
    if (path.endsWith('/rpc/revoke_client_portal_membership')) { revokeBody = JSON.parse(init.body); return json({ id: membershipId, status: 'revoked' }); }
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/clients/${clientId}/portal-members/${membershipId}?owner_user_id=attacker`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    assert.equal(response.status, 200); assert.deepEqual((await response.json()).data, {});
  });
  assert.equal(revokeBody.p_owner_user_id, ownerId); assert.equal(revokeBody.p_client_id, clientId); assert.equal(revokeBody.p_membership_id, membershipId);
});


test('rejects malformed list input and gives matching missing and out-of-scope detail responses', async () => {
  calls.length = 0;
  databaseFetch = (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/companies')) return json(null);
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const headers = { Authorization: `Bearer ${token()}` };
    for (const path of [
      '/owner-workspace/crm/companies?cursor=not-a-cursor',
      '/owner-workspace/crm/companies?q=%25',
      '/owner-workspace/crm/leads?q=Acme',
    ]) {
      const response = await nativeFetch(`http://127.0.0.1:${port}${path}`, { headers });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
    }
    const first = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/crm/companies/30000000-0000-4000-8000-000000000003`, { headers });
    const second = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/crm/companies/40000000-0000-4000-8000-000000000004`, { headers });
    assert.equal(first.status, 404); assert.equal(second.status, 404);
    assert.deepEqual((await first.json()).error, (await second.json()).error);
  });
  for (const rawUrl of calls) {
    const url = new URL(rawUrl);
    assert.equal(url.searchParams.get('owner_user_id'), `eq.${ownerId}`);
  }
});

test('applies bounded owner-scoped contact filters and fixed-order portal membership cursors', async () => {
  calls.length = 0;
  const clientId = '30000000-0000-4000-8000-000000000003';
  const firstMembership = { id: '40000000-0000-4000-8000-000000000004', contact_id: '50000000-0000-4000-8000-000000000005', status: 'pending', created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z', activated_at: null, revoked_at: null };
  const secondMembership = { ...firstMembership, id: '60000000-0000-4000-8000-000000000006', contact_id: '70000000-0000-4000-8000-000000000007' };
  databaseFetch = (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/contacts') && url.searchParams.get('client_id') === `eq.${clientId}`) return json([{ id: firstMembership.contact_id, name: 'Ava', email: 'ava@example.test', phone: null, title: 'Director', company_id: null, client_id: clientId, created_at: firstMembership.created_at, updated_at: firstMembership.updated_at }]);
    if (url.pathname.endsWith('/crm_clients')) return json({ id: clientId, name: 'Acme', created_at: firstMembership.created_at, updated_at: firstMembership.updated_at });
    if (url.pathname.endsWith('/client_portal_memberships')) return json([firstMembership, secondMembership]);
    if (url.pathname.endsWith('/contacts')) return json([{ id: firstMembership.contact_id, name: 'Ava', email: 'ava@example.test', title: 'Director' }]);
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const headers = { Authorization: `Bearer ${token()}` };
    const contacts = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/crm/contacts?client_id=${clientId}&limit=1`, { headers });
    assert.equal(contacts.status, 200); assert.equal((await contacts.json()).data.items[0].client_id, clientId);
    const firstPage = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/clients/${clientId}/portal?limit=1`, { headers });
    const firstBody = await firstPage.json();
    assert.equal(firstPage.status, 200); assert.equal(firstBody.data.pageInfo.nextCursor, 'MQ');
    const nextPage = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/clients/${clientId}/portal?limit=1&cursor=MQ`, { headers });
    assert.equal(nextPage.status, 200);
  });
  const contactQuery = new URL(calls.find((url) => url.includes('/contacts?') && url.includes(`client_id=eq.${clientId}`)));
  assert.equal(contactQuery.searchParams.get('owner_user_id'), `eq.${ownerId}`);
  const membershipQueries = calls.filter((url) => url.includes('/client_portal_memberships?')).map((url) => new URL(url));
  assert.equal(membershipQueries[0].searchParams.get('order'), 'updated_at.desc,id.desc');
  assert.equal(membershipQueries[0].searchParams.get('offset'), '0'); assert.equal(membershipQueries[0].searchParams.get('limit'), '2');
  assert.equal(membershipQueries[1].searchParams.get('offset'), '1'); assert.equal(membershipQueries[1].searchParams.get('limit'), '2');
});


test('returns fixed, owner-scoped project views with client association and unavailable project fields', async () => {
  calls.length = 0;
  const clientId = '30000000-0000-4000-8000-000000000003';
  const projectId = '40000000-0000-4000-8000-000000000004';
  databaseFetch = (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/crm_projects')) return json([{ id: projectId, client_id: clientId, name: 'Launch' }, { id: '50000000-0000-4000-8000-000000000005', client_id: clientId, name: 'Spare' }]);
    if (url.pathname.endsWith('/crm_clients')) return json([{ id: clientId, name: 'Acme' }]);
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/projects?owner_user_id=attacker&client_id=${clientId}&q=Launch&limit=1&sort=name:asc`, { headers: { Authorization: `Bearer ${token()}` } });
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.data.items[0].client.name, 'Acme'); assert.equal(body.data.items[0].status.status, 'unavailable');
    assert.match(body.data.items[0].progress.reason, /No authoritative project progress field/);
    assert.equal(Object.hasOwn(body.data.items[0], 'owner_user_id'), false);
  });
  const projectQuery = new URL(calls.find((url) => url.includes('/crm_projects?')));
  assert.equal(projectQuery.searchParams.get('select'), 'id,client_id,name'); assert.equal(projectQuery.searchParams.get('owner_user_id'), `eq.${ownerId}`);
  assert.equal(projectQuery.searchParams.get('client_id'), `eq.${clientId}`); assert.equal(projectQuery.searchParams.get('name'), 'ilike.%Launch%');
  assert.equal(projectQuery.searchParams.get('order'), 'name.asc,id.asc'); assert.equal(projectQuery.searchParams.get('limit'), '2');
});

test('returns owner-scoped project task details and delegates completion and assignment validation', async () => {
  calls.length = 0;
  const clientId = '30000000-0000-4000-8000-000000000003'; const projectId = '40000000-0000-4000-8000-000000000004'; const taskId = '50000000-0000-4000-8000-000000000005'; const employeeId = '60000000-0000-4000-8000-000000000006';
  const project = { id: projectId, client_id: clientId, name: 'Launch' }; const task = { id: taskId, project_id: projectId, name: 'Review', completed: false, assigned_user_id: employeeId };
  databaseFetch = (rawUrl, init = {}) => {
    const url = new URL(rawUrl); const select = url.searchParams.get('select');
    if (url.pathname.endsWith('/crm_projects')) return select === 'id' || url.searchParams.get('id')?.startsWith('eq.') ? json(project) : json([project]);
    if (url.pathname.endsWith('/crm_tasks')) return init.method === 'PATCH' ? json({ ...task, completed: JSON.parse(init.body).completed ?? task.completed, assigned_user_id: JSON.parse(init.body).assigned_user_id ?? task.assigned_user_id }) : json([task, { ...task, id: '70000000-0000-4000-8000-000000000007' }]);
    if (url.pathname.endsWith('/crm_clients')) return json([{ id: clientId, name: 'Acme' }]);
    if (url.pathname.endsWith('/users')) return json([{ id: employeeId, full_name: 'Ava Owner', email: 'ava@example.test' }]);
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const headers = { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' };
    const detail = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/projects/${projectId}?limit=1`, { headers });
    assert.equal(detail.status, 200); const view = await detail.json();
    assert.equal(view.data.tasks.items[0].assignee.email, 'ava@example.test'); assert.equal(view.data.tasks.items[0].completed, false);
    assert.equal(view.data.tasks.items[0].priority.status, 'unavailable'); assert.equal(Object.hasOwn(view.data.tasks.items[0], 'assigned_user_id'), false);
    const completion = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/projects/${projectId}/tasks/${taskId}?owner_user_id=attacker`, { method: 'PATCH', headers, body: JSON.stringify({ completed: true }) });
    assert.equal(completion.status, 200); assert.equal((await completion.json()).data.completed, true);
    const assignment = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/projects/${projectId}/tasks/${taskId}`, { method: 'PATCH', headers, body: JSON.stringify({ assigned_user_id: employeeId }) });
    assert.equal(assignment.status, 200);
  });
  const employeeQuery = new URL(calls.find((url) => url.includes('/users?')));
  assert.equal(employeeQuery.searchParams.get('portal_owner_user_id'), `eq.${ownerId}`); assert.equal(employeeQuery.searchParams.get('role'), 'eq.employee');
  assert.equal(calls.some((url) => url.includes('/rpc/complete_employee_portal_task')), false);
});

test('rejects malformed project filters and gives matching missing and out-of-scope project/task responses', async () => {
  databaseFetch = (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/crm_projects') || url.pathname.endsWith('/crm_tasks')) return json(null);
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const headers = { Authorization: `Bearer ${token()}` };
    const invalid = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/projects?client_id=not-a-uuid`, { headers });
    assert.equal(invalid.status, 400);
    const missing = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/projects/30000000-0000-4000-8000-000000000003`, { headers });
    const outside = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/projects/40000000-0000-4000-8000-000000000004`, { headers });
    assert.equal(missing.status, 404); assert.equal(outside.status, 404); assert.deepEqual((await missing.json()).error, (await outside.json()).error);
    const task = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/tasks/50000000-0000-4000-8000-000000000005`, { headers });
    assert.equal(task.status, 404);
  });
});


test('lists owner-scoped employees with bounded workload counts, assignment eligibility, and no credential fields', async () => {
  calls.length = 0;
  const employeeId = '30000000-0000-4000-8000-000000000003';
  databaseFetch = (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/users')) return json([{ id: employeeId, employee_code: 'JP-EMP-000001', full_name: 'Ava Owner', email: 'ava@example.test', status: 'active' }, { id: '40000000-0000-4000-8000-000000000004', employee_code: 'JP-EMP-000002', full_name: 'Ben Owner', email: 'ben@example.test', status: 'pending_verification' }]);
    if (url.pathname.endsWith('/crm_tasks')) return count(url.searchParams.get('completed') === 'eq.true' ? 1 : url.searchParams.get('completed') === 'eq.false' ? 2 : 3);
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/employees?owner_user_id=attacker&q=Ava&limit=1&sort=name:asc`, { headers: { Authorization: `Bearer ${token()}` } });
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.data.items[0].workload.assigned, 3); assert.equal(body.data.items[0].workload.open, 2); assert.equal(body.data.items[0].status, 'active');
    assert.equal(body.data.items[0].availability.status, 'unavailable'); assert.doesNotMatch(JSON.stringify(body), /password_hash|"role"|portal_owner_user_id|refresh_token/i);
  });
  const employeeQuery = new URL(calls.find((url) => url.includes('/users?')));
  assert.equal(employeeQuery.searchParams.get('select'), 'id,employee_code,full_name,email,status'); assert.equal(employeeQuery.searchParams.get('portal_owner_user_id'), `eq.${ownerId}`);
  assert.equal(employeeQuery.searchParams.get('role'), 'eq.employee'); assert.equal(employeeQuery.searchParams.get('status'), 'in.(active,pending_verification)'); assert.equal(employeeQuery.searchParams.get('full_name'), 'ilike.%Ava%');
});

test('returns owner-scoped employee assignments and projects while keeping employee portal behavior separate', async () => {
  calls.length = 0;
  const employeeId = '30000000-0000-4000-8000-000000000003'; const projectId = '40000000-0000-4000-8000-000000000004'; const clientId = '50000000-0000-4000-8000-000000000005';
  const employee = { id: employeeId, full_name: 'Ava Owner', email: 'ava@example.test' }; const task = { id: '60000000-0000-4000-8000-000000000006', project_id: projectId, name: 'Review', completed: false, assigned_user_id: employeeId };
  databaseFetch = (rawUrl) => {
    const url = new URL(rawUrl); const select = url.searchParams.get('select');
    if (url.pathname.endsWith('/users')) return url.searchParams.get('id')?.startsWith('eq.') ? json(employee) : json([employee]);
    if (url.pathname.endsWith('/crm_tasks')) return select === 'id' ? count(1) : json([task, { ...task, id: '70000000-0000-4000-8000-000000000007' }]);
    if (url.pathname.endsWith('/crm_projects')) return json([{ id: projectId, client_id: clientId, name: 'Launch' }]);
    if (url.pathname.endsWith('/crm_clients')) return json([{ id: clientId, name: 'Acme' }]);
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const headers = { Authorization: `Bearer ${token()}` };
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/employees/${employeeId}?limit=1`, { headers });
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.data.projects[0].name, 'Launch'); assert.equal(body.data.assignments.items[0].project.client.name, 'Acme');
    assert.equal(body.data.employee.performance.status, 'unavailable'); assert.doesNotMatch(JSON.stringify(body), /password_hash|refresh|credential/i);
  });
  const taskQuery = new URL(calls.find((url) => url.includes('/crm_tasks?') && url.includes('assigned_user_id')));
  assert.equal(taskQuery.searchParams.get('owner_user_id'), `eq.${ownerId}`); assert.equal(taskQuery.searchParams.get('assigned_user_id'), `eq.${employeeId}`);
  assert.equal(calls.some((url) => url.includes('/employee-portal') || url.includes('/rpc/complete_employee_portal_task')), false);
});


test('rejects invalid employee list input and gives matching absent and out-of-scope employee responses', async () => {
  databaseFetch = () => { throw new Error('Database should not be queried for invalid employee input'); };
  await withServer(async (port) => {
    const headers = { Authorization: `Bearer ${token()}` };
    for (const query of ['cursor=not-a-cursor', 'sort=owner_user_id:asc', 'q=%25', 'limit=51']) {
      const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/employees?${query}`, { headers });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
    }
  });

  databaseFetch = (rawUrl) => {
    if (new URL(rawUrl).pathname.endsWith('/users')) return json(null);
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const headers = { Authorization: `Bearer ${token()}` };
    const missing = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/employees/30000000-0000-4000-8000-000000000003`, { headers });
    const outside = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/employees/40000000-0000-4000-8000-000000000004`, { headers });
    assert.equal(missing.status, 404); assert.equal(outside.status, 404);
    assert.deepEqual((await missing.json()).error, (await outside.json()).error);
  });
});

test('scopes every employee workload aggregate by owner and direct assignment', async () => {
  calls.length = 0;
  const employeeId = '30000000-0000-4000-8000-000000000003';
  databaseFetch = (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/users')) return json([{ id: employeeId, full_name: 'Ava Owner', email: 'ava@example.test' }]);
    if (url.pathname.endsWith('/crm_tasks')) return count(0);
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/employees`, { headers: { Authorization: `Bearer ${token()}` } });
    assert.equal(response.status, 200);
  });
  const workloadQueries = calls.filter((url) => url.includes('/crm_tasks?')).map((url) => new URL(url));
  assert.equal(workloadQueries.length, 3);
  for (const query of workloadQueries) {
    assert.equal(query.searchParams.get('owner_user_id'), `eq.${ownerId}`);
    assert.equal(query.searchParams.get('assigned_user_id'), `eq.${employeeId}`);
    assert.equal(query.searchParams.get('select'), 'id');
  }
});


test('returns owner-scoped document metadata and reuses private publication and revocation services', async () => {
  calls.length = 0;
  const clientId = '30000000-0000-4000-8000-000000000003'; const documentId = '40000000-0000-4000-8000-000000000004';
  let visible = true;
  const document = () => ({ id: documentId, crm_client_id: clientId, project_id: null, title: 'Launch plan', document_type: 'deliverable', client_visible: visible, created_at: '2026-07-21T00:00:00.000Z', revoked_at: visible ? null : '2026-07-21T01:00:00.000Z', crm_clients: { id: clientId, name: 'Acme', owner_user_id: ownerId }, crm_projects: null });
  databaseFetch = (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/crm_clients')) return json({ id: clientId, name: 'Acme', created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z' });
    if (url.pathname.includes('/storage/v1/object/client-portal-private/')) return json({});
    if (url.pathname.endsWith('/rpc/publish_client_portal_document')) return json({ id: documentId, title: 'Launch plan', document_type: 'deliverable', created_at: document().created_at });
    if (url.pathname.endsWith('/client_portal_documents')) {
      if (init.method === 'PATCH') { visible = false; return json({ id: documentId }); }
      return url.searchParams.get('id') ? json(document()) : json([document(), { ...document(), id: '50000000-0000-4000-8000-000000000005' }]);
    }
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const headers = { Authorization: `Bearer ${token()}` };
    const list = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/documents?q=Launch&visibility=visible&document_type=deliverable&limit=1`, { headers });
    assert.equal(list.status, 200); const listed = await list.json();
    assert.equal(listed.data.items[0].client.name, 'Acme'); assert.equal(listed.data.items[0].visibility, 'visible');
    assert.doesNotMatch(JSON.stringify(listed), /storage_path|storage_bucket|signedUrl|owner_user_id/i);
    const form = new FormData(); form.set('client_id', clientId); form.set('title', 'Launch plan'); form.set('document_type', 'deliverable'); form.set('file', new Blob(['plan'], { type: 'text/plain' }), 'plan.txt');
    const published = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/documents`, { method: 'POST', headers, body: form });
    assert.equal(published.status, 201); assert.equal((await published.json()).data.id, documentId);
    const revoked = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/documents/${documentId}`, { method: 'DELETE', headers });
    assert.equal(revoked.status, 200); assert.equal((await revoked.json()).data.visibility, 'revoked');
  });
  const documentQuery = new URL(calls.find((url) => url.includes('/client_portal_documents?')));
  assert.equal(documentQuery.searchParams.get('crm_clients.owner_user_id'), `eq.${ownerId}`);
  assert.match(documentQuery.searchParams.get('select'), /crm_clients!inner/);
  assert.equal(calls.some((url) => url.includes('createSignedUrl') || url.includes('/signed/')), false);
});

test('returns only redacted direct-owner audit events and source-fidelity settings status', async () => {
  calls.length = 0;
  databaseFetch = (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/audit_logs')) return json([{ id: '30000000-0000-4000-8000-000000000003', event_type: 'client_portal_document', action: 'publish', resource_type: 'client_portal_document', resource_id: '40000000-0000-4000-8000-000000000004', success: true, created_at: '2026-07-21T00:00:00.000Z', details: { storage_path: 'private/path' }, ip_address: '127.0.0.1' }]);
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const headers = { Authorization: `Bearer ${token()}` };
    const audit = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/audit?category=documents`, { headers });
    assert.equal(audit.status, 200); const auditBody = await audit.json();
    assert.equal(auditBody.data.items[0].label, 'Client Portal document published');
    assert.doesNotMatch(JSON.stringify(auditBody), /details|storage_path|ip_address|user_agent|error_message/i);
    const settings = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/settings/status`, { headers });
    assert.equal(settings.status, 200); const settingsBody = await settings.json();
    assert.equal(settingsBody.data.api.status, 'available'); assert.equal(settingsBody.data.companyProfile.status, 'unavailable');
    assert.equal(Object.hasOwn(settingsBody.data, 'secrets'), false);
  });
  const auditQuery = new URL(calls.find((url) => url.includes('/audit_logs?')));
  assert.equal(auditQuery.searchParams.get('user_id'), `eq.${ownerId}`);
  assert.match(auditQuery.searchParams.get('event_type'), /client_portal_document/);
  assert.equal(auditQuery.searchParams.get('select'), 'id,event_type,action,resource_type,resource_id,success,created_at');
});

test('returns bounded grouped owner search results and validates query input', async () => {
  calls.length = 0;
  const companyId = '30000000-0000-4000-8000-000000000003'; const employeeId = '40000000-0000-4000-8000-000000000004'; const documentId = '50000000-0000-4000-8000-000000000005';
  databaseFetch = (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/companies')) return json([{ id: companyId, name: 'Acme', created_at: '2026-07-21T00:00:00.000Z', updated_at: '2026-07-21T00:00:00.000Z' }]);
    if (url.pathname.endsWith('/users')) return json([{ id: employeeId, full_name: 'Ava', email: 'ava@example.test' }]);
    if (url.pathname.endsWith('/client_portal_documents')) return json([{ id: documentId, crm_client_id: companyId, project_id: null, title: 'Acme plan', document_type: 'report', client_visible: true, created_at: '2026-07-21T00:00:00.000Z', revoked_at: null, crm_clients: { id: companyId, name: 'Acme', owner_user_id: ownerId }, crm_projects: null }]);
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const headers = { Authorization: `Bearer ${token()}` };
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/search?q=Acme&types=companies,employees,documents,leads`, { headers });
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.data.groups.find((group) => group.type === 'companies').items[0].label, 'Acme');
    assert.equal(body.data.groups.find((group) => group.type === 'leads').status, 'unavailable');
    const invalid = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/search?q=%25`, { headers });
    assert.equal(invalid.status, 400);
  });
  for (const rawUrl of calls) { const url = new URL(rawUrl); assert.equal(url.searchParams.get('owner_user_id') || url.searchParams.get('crm_clients.owner_user_id') || url.searchParams.get('portal_owner_user_id'), `eq.${ownerId}`); }
});


test('creates a direct client with JWT-derived owner scope and a database-generated display ID', async () => {
  calls.length = 0;
  const clientId = '30000000-0000-4000-8000-000000000003';
  let insertBody;
  databaseFetch = (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/crm_clients') && init.method === 'POST') {
      insertBody = JSON.parse(init.body);
      return json({ id: clientId, client_code: 'JP-CLI-000001', name: 'Acme', created_at: '2026-07-30T00:00:00.000Z', updated_at: '2026-07-30T00:00:00.000Z' });
    }
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/clients`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme', email: 'HELLO@ACME.TEST', phone: '+919876543210', company: 'Acme Pvt Ltd', notes: 'Enterprise customer', owner_user_id: 'attacker' }),
    });
    assert.equal(response.status, 400);

    const created = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/clients`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme', email: 'HELLO@ACME.TEST', phone: '+919876543210', company: 'Acme Pvt Ltd', notes: 'Enterprise customer' }),
    });
    assert.equal(created.status, 201);
    assert.deepEqual((await created.json()).data, { id: clientId, client_code: 'JP-CLI-000001', name: 'Acme', created_at: '2026-07-30T00:00:00.000Z', updated_at: '2026-07-30T00:00:00.000Z' });
  });
  assert.deepEqual(insertBody, { owner_user_id: ownerId, name: 'Acme', email: 'hello@acme.test', phone: '+919876543210', company: 'Acme Pvt Ltd', notes: 'Enterprise customer' });
  const insert = new URL(calls.find((url) => url.includes('/crm_clients?')));
  assert.equal(insert.searchParams.get('select'), 'id,client_code,name,created_at,updated_at');
});

test('validates direct client input and maps duplicate email safely', async () => {
  databaseFetch = (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/crm_clients') && init.method === 'POST') return json({ code: '23505', message: 'duplicate key detail' }, 409);
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const headers = { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' };
    const invalid = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/clients`, { method: 'POST', headers, body: JSON.stringify({ name: 'A', email: 'not-an-email', phone: '123', company: 'A' }) });
    assert.equal(invalid.status, 400); assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
    const duplicate = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/clients`, { method: 'POST', headers, body: JSON.stringify({ name: 'Acme', email: 'hello@acme.test', phone: '+919876543210', company: 'Acme Pvt Ltd' }) });
    assert.equal(duplicate.status, 409); const duplicateBody = await duplicate.json();
    assert.equal(duplicateBody.error.code, 'CLIENT_EMAIL_EXISTS'); assert.doesNotMatch(JSON.stringify(duplicateBody), /duplicate key detail/i);
  });
});

test('preserves the existing Lead to Client conversion branch on the Owner clients endpoint', async () => {
  const leadId = '30000000-0000-4000-8000-000000000003'; const contactId = '40000000-0000-4000-8000-000000000004'; let rpcBody;
  databaseFetch = (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/crm_leads')) return json({ id: leadId, contact_id: contactId });
    if (url.pathname.endsWith('/rpc/convert_crm_lead_to_client')) { rpcBody = JSON.parse(init.body); return json({ id: '50000000-0000-4000-8000-000000000005', client_code: 'JP-CLI-000002', name: 'Converted client' }); }
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/clients`, {
      method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: leadId, name: 'Converted client' }),
    });
    assert.equal(response.status, 201);
  });
  assert.deepEqual(rpcBody, { p_owner_user_id: ownerId, p_lead_id: leadId, p_contact_id: contactId, p_name: 'Converted client' });
});

test('redacts unexpected direct-client database failures', async () => {
  databaseFetch = (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/crm_clients') && init.method === 'POST') {
      return json({ code: 'XX000', message: 'raw PostgreSQL detail: internal schema failure' }, 500);
    }
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/clients`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme', email: 'hello@acme.test', phone: '+919876543210', company: 'Acme Pvt Ltd' }),
    });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.message, 'Internal server error');
    assert.doesNotMatch(JSON.stringify(body), /raw PostgreSQL detail|internal schema failure/i);
  });
});


test('creates employee invitations only through the owner-scoped RPC, validates fields, returns a server-issued Employee ID, and never returns credentials', async () => {
  calls.length = 0; let successfulPayload;
  databaseFetch = (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/rpc/create_owner_employee_invitation')) {
      const payload = JSON.parse(init.body);
      if (payload.p_email === 'duplicate@example.test') return json({ message: 'EMPLOYEE_INVITATION_NOT_AVAILABLE' }, 400);
      successfulPayload = payload;
      return json({ id: '30000000-0000-4000-8000-000000000003', employee_code: 'JP-EMP-000001', invitation_id: '40000000-0000-4000-8000-000000000004', email: 'employee@example.test', status: 'invited', expires_at: '2026-08-06T00:00:00.000Z' });
    }
    if (url.pathname.endsWith('/rpc/record_owner_employee_invitation_delivery')) return json({ id: '40000000-0000-4000-8000-000000000004', delivery_status: 'dry_run' });
    throw new Error(`Unexpected query: ${rawUrl} ${init.method || 'GET'}`);
  };
  await withServer(async (port) => {
    const headers = { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' };
    const invalid = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/employees`, { method: 'POST', headers, body: JSON.stringify({ full_name: 'Ava Employee', email: 'ava@example.test', department: 'Ops', phone: 'invalid', owner_user_id: 'attacker' }) });
    assert.equal(invalid.status, 400);
    const created = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/employees`, { method: 'POST', headers, body: JSON.stringify({ full_name: 'Ava Employee', email: 'employee@example.test', department: 'Operations', phone: '+919876543210' }) });
    assert.equal(created.status, 201); const body = await created.json();
    assert.equal(body.data.status, 'invited'); assert.equal(body.data.employeeCode, 'JP-EMP-000001'); assert.equal(body.data.delivery, 'dry_run'); assert.doesNotMatch(JSON.stringify(body), /token|password|hash|owner_user_id|invitation_id/i);
    workspaceIdentity = { id: ownerId, role: 'employee', status: 'active' };
    const denied = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/employees`, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${token('employee')}` }, body: JSON.stringify({ full_name: 'Ava Employee', email: 'employee2@example.test', department: 'Operations', phone: '+919876543210' }) });
    assert.equal(denied.status, 403);
    workspaceIdentity = ownerIdentity();
  });
  const { createEmployeeInvitation } = await import('../src/modules/owner-workspace/owner-workspace.service.js');
  await assert.rejects(createEmployeeInvitation(ownerId, { full_name: 'Duplicate Employee', email: 'duplicate@example.test', department: 'Operations', phone: '+919876543210' }), { statusCode: 409, code: 'EMPLOYEE_INVITATION_NOT_AVAILABLE' });
  assert.equal(successfulPayload.p_owner_user_id, ownerId); assert.match(successfulPayload.p_token_hash, /^[a-f0-9]{64}$/); assert.equal(Object.hasOwn(successfulPayload, 'p_employee_code'), false);
  const createCall = calls.find((url) => url.includes('/rpc/create_owner_employee_invitation'));
  assert.ok(createCall); assert.equal(new URL(createCall).pathname.endsWith('/rpc/create_owner_employee_invitation'), true);
});

test('records an owner-attributed failed delivery and returns a controlled error when invitation delivery setup throws', async () => {
  calls.length = 0; let deliveryPayload;
  databaseFetch = (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/rpc/create_owner_employee_invitation')) return json({ id: '30000000-0000-4000-8000-000000000003', employee_code: 'JP-EMP-000002', invitation_id: '40000000-0000-4000-8000-000000000004', email: 'employee@example.test', status: 'invited', expires_at: '2026-08-06T00:00:00.000Z' });
    if (url.pathname.endsWith('/rpc/record_owner_employee_invitation_delivery')) { deliveryPayload = JSON.parse(init.body); return json({ id: '40000000-0000-4000-8000-000000000004', delivery_status: 'failed' }); }
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  process.env.WEB_APP_URL = 'not-a-valid-url';
  try {
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/employees`, { method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ full_name: 'Ava Employee', email: 'employee@example.test', department: 'Operations', phone: '+919876543210' }) });
      assert.equal(response.status, 503); const body = await response.json();
      assert.equal(body.error.code, 'EMPLOYEE_INVITATION_DELIVERY_FAILED'); assert.doesNotMatch(JSON.stringify(body), /token|password|hash|WEB_APP_URL|not-a-valid-url/i);
    });
  } finally { delete process.env.WEB_APP_URL; }
  assert.deepEqual(deliveryPayload, { p_owner_user_id: ownerId, p_invitation_id: '40000000-0000-4000-8000-000000000004', p_delivery_status: 'failed' });
});

test('rejects unapproved automation workflow requests before queueing work', async () => {
  databaseFetch = () => { throw new Error('Automation must not access storage for an invalid workflow.'); };
  await withServer(async (port) => {
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/automation-runs`, {
      method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', 'Idempotency-Key': '12345678-1234-1234-1234-123456789012' }, body: JSON.stringify({ workflow: 'daily-outreach' }),
    });
    assert.equal(response.status, 400); const body = await response.json(); assert.equal(body.error.code, 'VALIDATION_ERROR');
  });
});


test('resends an existing pending employee invitation through the Owner-scoped RPC without returning setup credentials', async () => {
  calls.length = 0;
  const employeeId = '30000000-0000-4000-8000-000000000003'; let resendPayload; let deliveryPayload;
  databaseFetch = (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/rpc/prepare_owner_employee_invitation_resend')) {
      resendPayload = JSON.parse(init.body);
      return json({ id: employeeId, invitation_id: '40000000-0000-4000-8000-000000000004', email: 'employee@example.test', status: 'invited', expires_at: '2026-08-06T00:00:00.000Z' });
    }
    if (url.pathname.endsWith('/rpc/record_owner_employee_invitation_delivery')) {
      deliveryPayload = JSON.parse(init.body);
      return json({ id: '40000000-0000-4000-8000-000000000004', delivery_status: 'dry_run' });
    }
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const headers = { Authorization: `Bearer ${token()}` };
    const invalid = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/employees/not-a-uuid/resend-invitation`, { method: 'POST', headers });
    assert.equal(invalid.status, 404);
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/employees/${employeeId}/resend-invitation`, { method: 'POST', headers });
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.data.email, 'employee@example.test'); assert.equal(body.data.delivery, 'dry_run');
    assert.doesNotMatch(JSON.stringify(body), /token|password|hash|owner_user_id|invitation_id/i);
  });
  assert.deepEqual(resendPayload.p_owner_user_id, ownerId); assert.deepEqual(resendPayload.p_employee_user_id, employeeId);
  assert.match(resendPayload.p_token_hash, /^[a-f0-9]{64}$/); assert.equal(deliveryPayload.p_delivery_status, 'dry_run');
});

test('uses the atomic invitation-acceptance RPC for pending employee password setup', async () => {
  const { activatePendingEmployee } = await import('../src/modules/auth/repository.js');
  const employeeId = '30000000-0000-4000-8000-000000000003'; let acceptancePayload;
  databaseFetch = (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/rpc/activate_pending_employee_invitation')) {
      acceptancePayload = JSON.parse(init.body);
      return json({ activated: true, accepted: true, already_accepted: false });
    }
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  const result = await activatePendingEmployee(employeeId);
  assert.deepEqual(result, { activated: true, accepted: true, already_accepted: false });
  assert.deepEqual(acceptancePayload, { p_employee_user_id: employeeId });
});


test('accepts a pending employee invitation during a successful password setup', async () => {
  const { resetPassword } = await import('../src/modules/auth/auth-service.js');
  const { hashToken } = await import('../src/modules/auth/crypto.js');
  const employeeId = '30000000-0000-4000-8000-000000000003'; let acceptanceCalls = 0; const requests = [];
  databaseFetch = (rawUrl, init = {}) => {
    const url = new URL(rawUrl); const path = url.pathname; requests.push(`${init.method || 'GET'} ${path}`);
    if (path.endsWith('/users') && init.method !== 'PATCH') return json({ id: employeeId, email: 'employee@example.test', email_normalized: 'employee@example.test', password_hash: null, role: 'employee', status: 'pending_verification' });
    if (path.endsWith('/password_resets') && init.method !== 'PATCH') return json({ id: '40000000-0000-4000-8000-000000000004', token_hash: hashToken('setup-token'), expires_at: '2026-08-06T00:00:00.000Z', used_at: null });
    if (path.endsWith('/password_history')) return json([]);
    if (path.endsWith('/rpc/activate_pending_employee_invitation')) { acceptanceCalls += 1; return json({ activated: true, accepted: true, already_accepted: false }); }
    if (path.endsWith('/users') || path.endsWith('/password_resets') || path.endsWith('/sessions') || path.endsWith('/audit_logs')) return json({});
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  const result = await resetPassword({ email: 'employee@example.test', resetToken: 'setup-token', newPassword: 'Starlight98!Clarity' }, '127.0.0.1');
  assert.equal(result.success, true, `${result.message}; requests: ${requests.join(', ')}`); assert.equal(acceptanceCalls, 1);
});

test('keeps the employee business identifier migration forward-only and invitation-compatible', async () => {
  const migration = await readFile(new URL('../../../database/supabase/migrations/20260807000015_add_employee_business_identifier.sql', import.meta.url), 'utf8');
  const routes = await readFile(new URL('../src/modules/owner-workspace/owner-workspace.routes.js', import.meta.url), 'utf8');
  assert.match(routes, /employeeInvitationLimiter = createRateLimiter\(\{ windowMs: 60 \* 60_000, max: 5/);
  assert.match(routes, /owner-employee-invitation:\$\{req\.user\?\.sub \|\| req\.ip\}/);
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(migration, /ALTER TABLE public\.users ADD COLUMN employee_code text;/);
  assert.match(migration, /CREATE UNIQUE INDEX users_employee_code_unique_idx/);
  assert.match(migration, /JP-EMP-/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.create_owner_employee_invitation/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.prepare_owner_employee_invitation_resend/);
  assert.match(migration, /'employee_code', v_employee\.employee_code/);
  assert.match(migration, /'owner_employee_invitation', 'create'/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER COLUMN id|DISABLE ROW LEVEL SECURITY/i);
});


test('creates client contacts only for the authorized Owner and denies invalid or unavailable owner scope', async () => {
  const clientId = '30000000-0000-4000-8000-000000000003';
  const contactId = '40000000-0000-4000-8000-000000000004';
  const contactValues = { name: 'Nia', email: 'nia@example.test', phone: '+15555550100', title: 'Operations' };
  let inserted = null;

  workspaceIdentity = ownerIdentity(); activeClientPortalMembership = false; calls.length = 0;
  databaseFetch = (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/crm_clients')) return json({ id: clientId });
    if (url.pathname.endsWith('/contacts') && init.method === 'POST') {
      inserted = JSON.parse(init.body);
      return json({ id: contactId, ...inserted, created_at: '2026-07-21T00:00:00.000Z', updated_at: '2026-07-21T00:00:00.000Z' }, 201);
    }
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/clients/${clientId}/contacts`, {
      method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(contactValues),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).data.id, contactId);
  });
  assert.deepEqual(inserted, { owner_user_id: ownerId, client_id: clientId, ...contactValues });
  const ownershipQuery = new URL(calls.find((url) => url.includes('/crm_clients?')));
  assert.equal(ownershipQuery.searchParams.get('id'), `eq.${clientId}`);
  assert.equal(ownershipQuery.searchParams.get('owner_user_id'), `eq.${ownerId}`);

  calls.length = 0; inserted = null;
  databaseFetch = (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/crm_clients')) return json(null);
    if (url.pathname.endsWith('/contacts') && init.method === 'POST') throw new Error('Contact insertion must not occur outside owner scope');
    throw new Error(`Unexpected query: ${rawUrl}`);
  };
  await withServer(async (port) => {
    const headers = { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' };
    const malformed = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/clients/not-a-uuid/contacts`, { method: 'POST', headers, body: JSON.stringify(contactValues) });
    assert.equal(malformed.status, 404);
    const outsideScope = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/clients/${clientId}/contacts`, { method: 'POST', headers, body: JSON.stringify(contactValues) });
    assert.equal(outsideScope.status, 404);
  });
  assert.equal(inserted, null);

  calls.length = 0; workspaceIdentity = { id: ownerId, role: 'employee', status: 'active' };
  databaseFetch = () => { throw new Error('Owner-scoped contact access must be denied before database work'); };
  await withServer(async (port) => {
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/clients/${clientId}/contacts`, {
      method: 'POST', headers: { Authorization: `Bearer ${token('employee')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(contactValues),
    });
    assert.equal(response.status, 403);
  });
  assert.equal(calls.length, 0);

  workspaceIdentity = ownerIdentity(); activeClientPortalMembership = true; calls.length = 0;
  await withServer(async (port) => {
    const response = await nativeFetch(`http://127.0.0.1:${port}/owner-workspace/clients/${clientId}/contacts`, {
      method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(contactValues),
    });
    assert.equal(response.status, 403);
  });
  assert.equal(calls.length, 0);
  workspaceIdentity = ownerIdentity(); activeClientPortalMembership = false;
});
