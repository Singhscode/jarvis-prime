import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const nativeFetch = globalThis.fetch;
process.env.SUPABASE_URL = 'https://client-account-provisioning.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_SECRET = 'client-account-provisioning-test-jwt-secret';
process.env.DRY_RUN = 'true';
process.env.WEB_APP_URL = 'https://app.example.test';

const ownerId = '10000000-0000-4000-8000-000000000001';
const employeeId = '10000000-0000-4000-8000-000000000011';
const clientPortalUserId = '10000000-0000-4000-8000-000000000012';
const users = {
  [ownerId]: { id: ownerId, role: 'client', status: 'active' },
  [employeeId]: { id: employeeId, role: 'employee', status: 'active' },
  [clientPortalUserId]: { id: clientPortalUserId, role: 'client', status: 'active' },
};
const calls = [];
let databaseFetch = () => { throw new Error('Unexpected database request'); };
globalThis.fetch = async (input, init = {}) => {
  const url = input instanceof Request ? input.url : String(input);
  const requestUrl = new URL(url);
  if (requestUrl.pathname.endsWith('/users') && requestUrl.searchParams.get('select') === 'id,role,status') {
    const id = requestUrl.searchParams.get('id')?.replace(/^eq\./, '');
    return json(users[id] || null);
  }
  if (requestUrl.pathname.endsWith('/client_portal_memberships') && requestUrl.searchParams.get('select') === 'id') {
    const userId = requestUrl.searchParams.get('user_id')?.replace(/^eq\./, '');
    return json(userId === clientPortalUserId ? [{ id: 'membership-1' }] : []);
  }
  calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
  return databaseFetch(url, init);
};
after(() => { globalThis.fetch = nativeFetch; });

const json = (body, status = 200) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });
const express = (await import('express')).default;
const { default: ownerWorkspaceRouter } = await import('../src/modules/owner-workspace/owner-workspace.routes.js');
const { default: accountActivationRouter } = await import('../src/modules/crm/client-portal-account.routes.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');
const { createAccessToken } = await import('../src/modules/auth/jwt-service.js');

async function withServer(router, path, run) {
  const app = express(); app.use(express.json()); app.use(path, router); app.use(errorHandler);
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try { await run(`http://127.0.0.1:${server.address().port}${path}`); } finally { await new Promise((resolve) => server.close(resolve)); }
}

function tokenFor(userId) {
  const user = users[userId];
  return createAccessToken({ id: user.id, email: `${user.role}@example.test`, role: user.role }, { id: '20000000-0000-4000-8000-000000000002', device_id: 'test' }, process.env.JWT_SECRET);
}

function ownerToken() {
  return tokenFor(ownerId);
}

describe('Client account provisioning API', () => {
  test('provisions through owner scope, sends only the email link, and returns safe delivery data', async () => {
    calls.length = 0;
    databaseFetch = (url) => {
      if (new URL(url).pathname.endsWith('/rpc/provision_client_account')) {
        return json({ client_id: '30000000-0000-4000-8000-000000000003', client_code: 'JP-CLI-000123', client_name: 'Acme', membership_id: '40000000-0000-4000-8000-000000000004', expires_at: '2026-08-11T00:00:00.000Z' });
      }
      throw new Error(`Unexpected database request: ${url}`);
    };
    await withServer(ownerWorkspaceRouter, '/owner-workspace', async (origin) => {
      const response = await nativeFetch(`${origin}/clients/provision`, {
        method: 'POST', headers: { Authorization: `Bearer ${ownerToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Acme', contact_name: 'Ava Client', email: 'Ava@Example.test', phone: '+14155552671' }),
      });
      assert.equal(response.status, 201);
      const body = await response.json();
      assert.deepEqual(body.data.client, { id: '30000000-0000-4000-8000-000000000003', clientCode: 'JP-CLI-000123', name: 'Acme' });
      assert.equal(body.data.delivery.status, 'dry_run');
      assert.doesNotMatch(JSON.stringify(body), /token|invitation|password|session|capability/i);

      const invalid = await nativeFetch(`${origin}/clients/provision`, {
        method: 'POST', headers: { Authorization: `Bearer ${ownerToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Acme', contact_name: 'Ava Client', email: 'ava@example.test', role: 'owner' }),
      });
      assert.equal(invalid.status, 400);
    });
    const rpc = calls.find((call) => call.url.endsWith('/rpc/provision_client_account'));
    assert.equal(rpc.body.p_owner_user_id, ownerId);
    assert.equal(rpc.body.p_email, 'ava@example.test');
    assert.match(rpc.body.p_token_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(rpc.body.p_token_hash, 'ava@example.test');
  });

  test('returns the safe existing Client account message without provisioning a duplicate', async () => {
    calls.length = 0;
    databaseFetch = (url) => {
      if (new URL(url).pathname.endsWith('/rpc/provision_client_account')) {
        return json({ code: 'P0001', message: 'CLIENT_ACCOUNT_ALREADY_EXISTS' }, 400);
      }
      throw new Error(`Unexpected database request: ${url}`);
    };
    await withServer(ownerWorkspaceRouter, '/owner-workspace', async (origin) => {
      const response = await nativeFetch(`${origin}/clients/provision`, {
        method: 'POST', headers: { Authorization: `Bearer ${ownerToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Acme', contact_name: 'Ava Client', email: 'ava@example.test' }),
      });
      assert.equal(response.status, 409);
      const error = (await response.json()).error;
      assert.equal(error.code, 'CLIENT_ACCOUNT_ALREADY_EXISTS');
      assert.equal(error.message, 'Client account already exists.');
    });
    assert.equal(calls.filter((call) => call.url.endsWith('/rpc/provision_client_account')).length, 1);
  });

  test('denies Employee and Client Portal identities before provisioning', async () => {
    calls.length = 0;
    databaseFetch = () => { throw new Error('Provisioning RPC must not be reached'); };
    await withServer(ownerWorkspaceRouter, '/owner-workspace', async (origin) => {
      for (const identity of [employeeId, clientPortalUserId]) {
        const response = await nativeFetch(`${origin}/clients/provision`, {
          method: 'POST', headers: { Authorization: `Bearer ${tokenFor(identity)}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Acme', contact_name: 'Ava Client', email: 'ava@example.test' }),
        });
        assert.equal(response.status, 403);
        const error = (await response.json()).error;
        assert.equal(error.code, 'INSUFFICIENT_PERMISSIONS');
        assert.equal(error.message, 'Owner Workspace access is not permitted.');
      }
    });
    assert.equal(calls.some((call) => call.url.endsWith('/rpc/provision_client_account')), false);
  });

  test('activates with a hash-only invitation, never creates a session, and returns generic failures', async () => {
    calls.length = 0;
    let activationResult = { activated: true };
    databaseFetch = (url) => {
      if (new URL(url).pathname.endsWith('/rpc/activate_provisioned_client_account')) return json(activationResult);
      throw new Error(`Unexpected database request: ${url}`);
    };
    await withServer(accountActivationRouter, '/client-portal', async (origin) => {
      const headers = { 'Content-Type': 'application/json' };
      const success = await nativeFetch(`${origin}/account-activate`, {
        method: 'POST', headers, body: JSON.stringify({ invitation: 'A'.repeat(43), password: 'StrongClient1!' }),
      });
      assert.equal(success.status, 200);
      assert.deepEqual((await success.json()).data, { activated: true });
      assert.equal(success.headers.get('set-cookie'), null);

      activationResult = { activated: false };
      const rejected = await nativeFetch(`${origin}/account-activate`, {
        method: 'POST', headers, body: JSON.stringify({ invitation: 'B'.repeat(43), password: 'StrongClient1!' }),
      });
      assert.equal(rejected.status, 400);
      const invalid = await rejected.json();
      assert.deepEqual(invalid.error, { code: 'INVALID_ACCOUNT_ACTIVATION', message: 'Account activation could not be completed.' });

      const malformed = await nativeFetch(`${origin}/account-activate`, {
        method: 'POST', headers, body: JSON.stringify({ invitation: 'not-a-token', password: 'weak' }),
      });
      assert.equal(malformed.status, 400);
      assert.deepEqual((await malformed.json()).error, invalid.error);
    });
    const activation = calls.find((call) => call.url.endsWith('/rpc/activate_provisioned_client_account'));
    assert.match(activation.body.p_token_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(activation.body.p_token_hash, 'A'.repeat(43));
    assert.notEqual(activation.body.p_password_hash, 'StrongClient1!');
    assert.doesNotMatch(JSON.stringify(activation.body), /StrongClient1!|A{43}/);
  });
});
