import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const nativeFetch = globalThis.fetch;
process.env.SUPABASE_URL = 'https://employee-portal.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_SECRET = 'employee-portal-test-jwt-secret';

let databaseFetch;
const calls = [];
globalThis.fetch = async (input, init = {}) => {
  const url = input instanceof Request ? input.url : String(input);
  const method = init.method || (input instanceof Request ? input.method : 'GET');
  const bodyText = init.body || (input instanceof Request ? await input.clone().text() : '');
  calls.push({ url, method, body: bodyText ? JSON.parse(bodyText) : null });
  return databaseFetch(url, method, bodyText ? JSON.parse(bodyText) : null);
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});
const employee = {
  id: '10000000-0000-4000-8000-000000000001',
  role: 'employee',
  status: 'active',
  portal_owner_user_id: '20000000-0000-4000-8000-000000000002',
};
const taskId = '30000000-0000-4000-8000-000000000003';

const service = await import('../src/modules/crm/crm.service.js');

describe('Employee Portal', () => {
  test('requires authentication and an employee JWT role', async () => {
    const express = (await import('express')).default;
    const { employeePortalRouter } = await import('../src/modules/crm/crm.routes.js');
    const { errorHandler } = await import('../src/middleware/error-handler.js');
    const { createAccessToken } = await import('../src/modules/auth/jwt-service.js');
    const app = express();
    app.use(express.json());
    app.use('/employee-portal', employeePortalRouter);
    app.use(errorHandler);
    const server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
      const { port } = server.address();
      let response = await nativeFetch(`http://127.0.0.1:${port}/employee-portal`);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, 'MISSING_TOKEN');

      const token = createAccessToken(
        { id: employee.id, email: 'client@example.test', role: 'client' },
        { id: '40000000-0000-4000-8000-000000000004', device_id: 'test' },
        process.env.JWT_SECRET
      );
      response = await nativeFetch(`http://127.0.0.1:${port}/employee-portal`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, 'INSUFFICIENT_PERMISSIONS');

      databaseFetch = () => json({ code: 'XX000', message: 'raw snapshot failure' }, 500);
      const employeeToken = createAccessToken(
        { id: employee.id, email: 'employee@example.test', role: 'employee' },
        { id: '50000000-0000-4000-8000-000000000005', device_id: 'test' },
        process.env.JWT_SECRET
      );
      response = await nativeFetch(`http://127.0.0.1:${port}/employee-portal`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      assert.equal(response.status, 500);
      const errorBody = await response.json();
      assert.equal(errorBody.error.code, 'INTERNAL_ERROR');
      assert.equal(errorBody.error.message, 'Internal server error');
      assert.doesNotMatch(JSON.stringify(errorBody), /XX000|raw snapshot failure/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('clears an invalid refresh cookie with its original scope', async () => {
    const routes = await readFile(new URL('../src/modules/auth/auth.routes.js', import.meta.url), 'utf8');
    const refreshRoute = routes.slice(routes.indexOf("router.post('/refresh'"));
    const failureBranch = refreshRoute.slice(0, refreshRoute.indexOf('// Rotate the cookie'));
    assert.match(failureBranch, /res\.clearCookie\('refreshToken', \{[\s\S]*httpOnly: true,[\s\S]*secure: process\.env\.NODE_ENV === 'production',[\s\S]*sameSite: 'strict',[\s\S]*path: '\/api\/auth',[\s\S]*\}\);/);
  });

  test('reloads active employee status and requires portal owner scope', async () => {
    databaseFetch = () => json(null);
    await assert.rejects(service.getEmployeePortal(employee.id), {
      code: 'INSUFFICIENT_PERMISSIONS', statusCode: 403,
    });

    databaseFetch = (url) => url.includes('/users')
      ? json({ ...employee, portal_owner_user_id: null })
      : json([]);
    await assert.rejects(service.getEmployeePortal(employee.id), {
      code: 'EMPLOYEE_SCOPE_MISSING', statusCode: 403,
    });
  });

  test('isolates snapshot queries by owner and direct assignment', async () => {
    calls.length = 0;
    databaseFetch = (rawUrl) => {
      const path = new URL(rawUrl).pathname;
      if (path.endsWith('/users')) return json(employee);
      if (path.endsWith('/crm_tasks')) {
        return json([{ id: taskId, project_id: 'project-1', name: 'Review', completed: false }]);
      }
      if (path.endsWith('/crm_projects')) {
        return json([{ id: 'project-1', client_id: 'client-1', name: 'Launch' }]);
      }
      if (path.endsWith('/crm_clients')) return json([{ id: 'client-1', name: 'Acme' }]);
      if (path.endsWith('/crm_leads')) return json([{ id: 'lead-1', contact_id: 'contact-1' }]);
      throw new Error(`Unexpected database path: ${path}`);
    };

    const snapshot = await service.getEmployeePortal(employee.id);
    assert.deepEqual(snapshot.tasks.map((task) => task.id), [taskId]);
    assert.deepEqual(snapshot.projects.map((project) => project.id), ['project-1']);
    const taskQuery = new URL(calls.find((call) => call.url.includes('/crm_tasks?')).url);
    assert.equal(taskQuery.searchParams.get('owner_user_id'), `eq.${employee.portal_owner_user_id}`);
    assert.equal(taskQuery.searchParams.get('assigned_user_id'), `eq.${employee.id}`);
    assert.equal(taskQuery.searchParams.get('select'), 'id,project_id,name,completed');
    const projectQuery = new URL(calls.find((call) => call.url.includes('/crm_projects?')).url);
    assert.match(projectQuery.searchParams.get('id'), /project-1/);
  });

  test('rejects forbidden, malformed, incomplete, and oversized completion input', async () => {
    databaseFetch = () => { throw new Error('database should not be called'); };
    await assert.rejects(
      service.completeEmployeeTask(employee.id, taskId, {
        completed: true, justification: 'Done', owner_user_id: 'attacker',
      }),
      { code: 'INVALID_FIELDS' }
    );
    await assert.rejects(
      service.completeEmployeeTask(employee.id, taskId, { completed: true }),
      { code: 'VALIDATION_ERROR' }
    );
    await assert.rejects(
      service.completeEmployeeTask(employee.id, 'not-a-uuid', {
        completed: true, justification: 'Done',
      }),
      { code: 'VALIDATION_ERROR', statusCode: 400 }
    );
    await assert.rejects(
      service.completeEmployeeTask(employee.id, taskId, {
        completed: true, justification: 'x'.repeat(1001),
      }),
      { code: 'VALIDATION_ERROR' }
    );
  });

  test('trims completion input and translates scoped RPC failures', async () => {
    databaseFetch = (_url, _method, body) => json({
      id: body.p_task_id, project_id: 'project-1', name: 'Review', completed: body.p_completed,
    });
    const updated = await service.completeEmployeeTask(employee.id, taskId, {
      completed: true, justification: '  Completed review  ',
    });
    assert.equal(updated.completed, true);
    assert.equal(calls.at(-1).body.p_justification, 'Completed review');
    assert.equal(calls.at(-1).body.p_employee_user_id, employee.id);

    databaseFetch = () => json({ code: 'P0001', message: 'TASK_NOT_FOUND' }, 400);
    await assert.rejects(
      service.completeEmployeeTask(employee.id, taskId, { completed: false, justification: 'Reopen' }),
      { code: 'TASK_NOT_FOUND', statusCode: 404 }
    );
    databaseFetch = () => json({ code: 'XX000', message: 'raw database failure' }, 500);
    await assert.rejects(
      service.completeEmployeeTask(employee.id, taskId, { completed: true, justification: 'Done' }),
      { code: 'INTERNAL_ERROR', statusCode: 500, isOperational: false }
    );
  });

  test('keeps task update and audit insertion in one atomic RPC', async () => {
    const migration = await readFile(new URL(
      '../../../database/supabase/migrations/20260715000008_add_employee_portal_scope.sql',
      import.meta.url
    ), 'utf8');
    assert.equal((migration.match(/create function/gi) || []).length, 1);
    assert.equal((migration.match(/create index/gi) || []).length, 1);
    assert.ok(migration.indexOf('update public.crm_tasks') < migration.indexOf('insert into public.audit_logs'));
    assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
    assert.match(migration, /assigned_user_id = p_employee_user_id/);
    assert.doesNotMatch(migration, /\bcommit\b|\bcreate table\b|\bcreate trigger\b/i);
  });
});


test('returns an error when logout session revocation fails', async () => {
  databaseFetch = () => json({ code: 'XX000', message: 'session write failed' }, 500);
  const express = (await import('express')).default;
  const { router: authRouter } = await import('../src/modules/auth/auth.routes.js');
  const { createAccessToken } = await import('../src/modules/auth/jwt-service.js');
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const token = createAccessToken(
      { id: employee.id, email: 'employee@example.test', role: 'employee' },
      { id: '60000000-0000-4000-8000-000000000006', device_id: 'test' },
      process.env.JWT_SECRET
    );
    const response = await nativeFetch(`http://127.0.0.1:${server.address().port}/auth/logout`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error.code, 'INTERNAL_ERROR');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('allows an owner to assign only an active employee in that owner scope', async () => {
  const crm = await import('../src/modules/crm/crm.service.js');
  const ownerId = employee.portal_owner_user_id;
  calls.length = 0;
  databaseFetch = (rawUrl, _method, body) => {
    const url = new URL(rawUrl);
    if (url.pathname.endsWith('/crm_projects') && url.searchParams.get('select') === 'id') {
      return json({ id: 'project-1' });
    }
    if (url.pathname.endsWith('/users')) return json(employee);
    if (url.pathname.endsWith('/crm_tasks')) {
      return json({ id: taskId, project_id: 'project-1', assigned_user_id: body.assigned_user_id });
    }
    throw new Error(`Unexpected database path: ${url.pathname}`);
  };

  const updated = await crm.updateTask(ownerId, 'project-1', taskId, {
    assigned_user_id: employee.id,
  });
  assert.equal(updated.assigned_user_id, employee.id);
  const employeeQuery = new URL(calls.find((call) => call.url.includes('/users?')).url);
  assert.equal(employeeQuery.searchParams.get('portal_owner_user_id'), `eq.${ownerId}`);

  await assert.rejects(
    crm.updateTask(ownerId, 'project-1', taskId, { assigned_user_id: 'not-a-uuid' }),
    { code: 'VALIDATION_ERROR', statusCode: 400 }
  );
});