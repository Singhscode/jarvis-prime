import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const nativeFetch = globalThis.fetch;
process.env.SUPABASE_URL = 'https://employee-invitations.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_SECRET = 'employee-invitations-test-jwt-secret';

let databaseFetch = () => { throw new Error('Unexpected database request'); };
globalThis.fetch = (input, init = {}) => databaseFetch(String(input), init);
after(() => { globalThis.fetch = nativeFetch; });

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

const express = (await import('express')).default;
const { router } = await import('../src/modules/auth/auth.routes.js');

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    await run(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('Employee invitation activation', () => {
  test('hashes the single-use token and employee password before atomic activation', async () => {
    const rawInvitation = 'a'.repeat(43);
    const rawPassword = 'Unique!Employee2026';
    let rpcBody;
    databaseFetch = (rawUrl, init) => {
      assert.match(new URL(rawUrl).pathname, /\/rpc\/activate_employee_invitation$/);
      rpcBody = JSON.parse(init.body);
      return json({ activated: true, employee_id: '30000000-0000-4000-8000-000000000003', status: 'active' });
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/auth/employee-invitations/activate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation: rawInvitation, password: rawPassword }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.employee, { id: '30000000-0000-4000-8000-000000000003', status: 'active' });
      assert.doesNotMatch(JSON.stringify(body), /invitation|password|hash/i);
    });

    assert.match(rpcBody.p_token_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(rpcBody.p_token_hash, rawInvitation);
    assert.match(rpcBody.p_password_hash, /^(scrypt:|\$argon2)/);
    assert.notEqual(rpcBody.p_password_hash, rawPassword);
  });

  test('does not consume weak-password attempts and returns one generic replay response', async () => {
    let rpcCalls = 0;
    databaseFetch = () => { rpcCalls += 1; return json({ activated: false }); };
    await withServer(async (port) => {
      const weak = await nativeFetch(`http://127.0.0.1:${port}/auth/employee-invitations/activate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation: 'b'.repeat(43), password: 'weak' }),
      });
      assert.equal(weak.status, 400);
      assert.equal((await weak.json()).error.code, 'VALIDATION_PASSWORD_TOO_SHORT');
      assert.equal(rpcCalls, 0);

      const replay = await nativeFetch(`http://127.0.0.1:${port}/auth/employee-invitations/activate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation: 'c'.repeat(43), password: 'Another!Unique2026' }),
      });
      assert.equal(replay.status, 400);
      const body = await replay.json();
      assert.deepEqual(body.error, {
        code: 'INVALID_EMPLOYEE_INVITATION',
        message: 'This activation link is invalid or expired.',
      });
      assert.equal(rpcCalls, 1);
    });
  });
});

test('migration enforces explicit Owner entitlement, row locking, single use, and service-role-only RPC access', async () => {
  const migration = await readFile(new URL('../../../database/supabase/migrations/20260728000015_create_employee_invitations.sql', import.meta.url), 'utf8');
  assert.match(migration, /owner_workspace_entitlements/);
  assert.match(migration, /FOR UPDATE OF owner_user, entitlement/);
  assert.match(migration, /WHERE consumed_at IS NULL AND revoked_at IS NULL/);
  assert.match(migration, /SET consumed_at = now\(\)/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.employee_invitations FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.activate_employee_invitation\(text, text\)\s+TO service_role/);
  assert.doesNotMatch(migration, /GRANT (SELECT|INSERT|UPDATE|DELETE).*employee_invitations TO (anon|authenticated)/i);
});