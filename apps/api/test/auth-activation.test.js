import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const nativeFetch = globalThis.fetch;
process.env.SUPABASE_URL = 'https://auth-activation.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_SECRET = 'auth-activation-test-jwt-secret';
process.env.DRY_RUN = 'true';
process.env.INITIAL_OWNER_EMAIL = 'owner@example.test';
process.env.WEB_APP_URL = 'https://app.example.test';

let databaseFetch = () => { throw new Error('Unexpected database request'); };
const requests = [];
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

globalThis.fetch = async (input, init = {}) => {
  const url = input instanceof Request ? input.url : String(input);
  const method = init.method || (input instanceof Request ? input.method : 'GET');
  const text = init.body || (input instanceof Request ? await input.clone().text() : '');
  const body = text ? JSON.parse(text) : null;
  requests.push({ url, method, body });
  return databaseFetch(url, method, body);
};

after(() => { globalThis.fetch = nativeFetch; });

const express = (await import('express')).default;
const { router: authRouter } = await import('../src/modules/auth/auth.routes.js');
const { resetPassword } = await import('../src/modules/auth/auth-service.js');
const { hashPassword, hashToken, verifyPassword } = await import('../src/modules/auth/crypto.js');

async function withServer(run) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use('/auth', authRouter);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try { await run(server.address().port); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

describe('registration activation', { concurrency: false }, () => {
  test('registration stores only a token hash, preserves password hashing, and audits without secrets', async () => {
    requests.length = 0;
    const userId = '10000000-0000-4000-8000-000000000001';
    const password = 'Starlight98!Clarity';
    databaseFetch = (rawUrl, method, body) => {
      const path = new URL(rawUrl).pathname;
      if (path.endsWith('/users') && method === 'GET') return json(null);
      if (path.endsWith('/users') && method === 'POST') {
        return json({ ...body[0], id: userId, role: 'client' });
      }
      if (path.endsWith('/rpc/issue_registration_email_verification')) return json(true);
      if (path.endsWith('/audit_logs')) return json({});
      throw new Error(`Unexpected request: ${method} ${path}`);
    };

    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.1' },
        body: JSON.stringify({ email: 'owner@example.test', password, full_name: 'Owner' }),
      });
      assert.equal(response.status, 201);
      const responseBody = await response.json();
      assert.equal(responseBody.success, true);
      assert.doesNotMatch(JSON.stringify(responseBody), /password|token|session/i);
    });

    const userInsert = requests.find((request) =>
      new URL(request.url).pathname.endsWith('/users') && request.method === 'POST'
    ).body[0];
    assert.notEqual(userInsert.password_hash, password);
    assert.equal(await verifyPassword(password, userInsert.password_hash), true);
    assert.equal(userInsert.status, 'pending_verification');

    const issuance = requests.find((request) =>
      new URL(request.url).pathname.endsWith('/rpc/issue_registration_email_verification')
    ).body;
    assert.equal(issuance.p_user_id, userId);
    assert.equal(issuance.p_authorized_email, 'owner@example.test');
    assert.match(issuance.p_token_hash, /^[a-f0-9]{64}$/);
    assert.ok(new Date(issuance.p_expires_at) > new Date());
    assert.equal(JSON.stringify(requests).includes(password), false);
    const audits = requests.filter((request) => new URL(request.url).pathname.endsWith('/audit_logs'));
    assert.ok(audits.some((request) => request.body[0].event_type === 'user.created'));
    assert.ok(audits.some((request) => request.body[0].event_type === 'email.verification_sent'));
    assert.doesNotMatch(JSON.stringify(audits), /activate#|token_hash|password_hash/i);
  });

  test('ordinary public registration remains pending and receives no Owner activation capability', async () => {
    requests.length = 0;
    databaseFetch = (rawUrl, method, body) => {
      const path = new URL(rawUrl).pathname;
      if (path.endsWith('/users') && method === 'GET') return json(null);
      if (path.endsWith('/users') && method === 'POST') {
        return json({ ...body[0], id: '11000000-0000-4000-8000-000000000001', role: 'client' });
      }
      if (path.endsWith('/audit_logs')) return json({});
      throw new Error(`Unexpected request: ${method} ${path}`);
    };

    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.9' },
        body: JSON.stringify({
          email: 'ordinary@example.test',
          password: 'Ordinary98!Clarity',
          full_name: 'Ordinary User',
        }),
      });
      assert.equal(response.status, 201);
      assert.equal((await response.json()).user.status, 'pending_verification');
    });

    assert.equal(requests.some((request) =>
      new URL(request.url).pathname.endsWith('/rpc/issue_registration_email_verification')
    ), false);
    assert.equal(requests.some((request) =>
      new URL(request.url).pathname.endsWith('/audit_logs')
      && request.body[0].event_type === 'email.verification_sent'
    ), false);
  });

  test('valid activation hashes the capability, returns no account or session, and cannot be reused', async () => {
    const token = 'A'.repeat(43);
    let available = true;
    let consumeBody;
    databaseFetch = (rawUrl, _method, body) => {
      const path = new URL(rawUrl).pathname;
      if (path.endsWith('/rpc/consume_registration_email_verification')) {
        consumeBody = body;
        if (available) { available = false; return json(true); }
        return json(false);
      }
      throw new Error(`Unexpected request: ${path}`);
    };

    await withServer(async (port) => {
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.2' },
        body: JSON.stringify({ token }),
      };
      const first = await nativeFetch(`http://127.0.0.1:${port}/auth/activate`, options);
      assert.equal(first.status, 200);
      const firstBody = await first.json();
      assert.deepEqual(firstBody, { success: true, message: 'Email verified successfully.' });
      assert.doesNotMatch(JSON.stringify(firstBody), /user|role|status|session|jwt|token/i);
      assert.equal(consumeBody.p_token_hash, hashToken(token));
      assert.equal(consumeBody.p_authorized_email, 'owner@example.test');
      assert.notEqual(consumeBody.p_token_hash, token);

      const reused = await nativeFetch(`http://127.0.0.1:${port}/auth/activate`, options);
      assert.equal(reused.status, 400);
      assert.deepEqual(await reused.json(), {
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired verification link.' },
      });
    });
  });

  test('invalid, expired, wrong-state, and membership-bound capabilities share one response', async () => {
    let consumeCalls = 0;
    databaseFetch = (rawUrl) => {
      const path = new URL(rawUrl).pathname;
      if (path.endsWith('/rpc/consume_registration_email_verification')) {
        consumeCalls += 1;
        return json(false);
      }
      throw new Error(`Unexpected request: ${path}`);
    };

    await withServer(async (port) => {
      const expected = { error: { code: 'INVALID_TOKEN', message: 'Invalid or expired verification link.' } };
      for (const [index, state] of ['invalid', 'expired', 'active', 'employee', 'suspended', 'deleted', 'membership'].entries()) {
        const response = await nativeFetch(`http://127.0.0.1:${port}/auth/activate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': `10.0.1.${index + 1}`,
            'X-Test-State': state,
          },
          body: JSON.stringify({ token: String(index).repeat(43) }),
        });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), expected);
      }
    });
    assert.equal(consumeCalls, 7);
  });

  test('rejects malformed and caller-selected account fields before database access', async () => {
    let consumeCalls = 0;
    databaseFetch = () => { consumeCalls += 1; return json(true); };
    const bodies = [
      {},
      { token: 'short' },
      { token: 'A'.repeat(43), role: 'client' },
      { token: 'A'.repeat(43), status: 'active' },
      { token: 'A'.repeat(43), owner_user_id: 'attacker' },
      { token: 'A'.repeat(43), permissions: ['admin'] },
      { token: 'A'.repeat(43), client_portal_membership: null },
    ];

    await withServer(async (port) => {
      for (const [index, body] of bodies.entries()) {
        const response = await nativeFetch(`http://127.0.0.1:${port}/auth/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.0.2.${index + 1}` },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error.code, 'INVALID_TOKEN');
      }
    });
    assert.equal(consumeCalls, 0);
  });

  test('rate limits activation attempts by IP', async () => {
    databaseFetch = (rawUrl) => {
      if (new URL(rawUrl).pathname.endsWith('/rpc/consume_registration_email_verification')) return json(false);
      throw new Error(`Unexpected request: ${rawUrl}`);
    };
    await withServer(async (port) => {
      for (let attempt = 1; attempt <= 6; attempt += 1) {
        const response = await nativeFetch(`http://127.0.0.1:${port}/auth/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.3.1' },
          body: JSON.stringify({ token: 'R'.repeat(43) }),
        });
        assert.equal(response.status, attempt <= 5 ? 400 : 429);
        if (attempt === 6) assert.equal((await response.json()).error.code, 'RATE_LIMITED');
      }
    });
  });

  test('password reset changes a client password without activating the pending client', async () => {
    requests.length = 0;
    const userId = '20000000-0000-4000-8000-000000000002';
    const oldPasswordHash = await hashPassword('OldStarlight98!');
    const resetToken = 'reset-capability';
    databaseFetch = (rawUrl, method) => {
      const path = new URL(rawUrl).pathname;
      if (path.endsWith('/users') && method === 'GET') {
        return json({
          id: userId,
          email: 'pending@example.test',
          password_hash: oldPasswordHash,
          role: 'client',
          status: 'pending_verification',
        });
      }
      if (path.endsWith('/password_resets') && method === 'GET') {
        return json({ id: '30000000-0000-4000-8000-000000000003', token_hash: hashToken(resetToken) });
      }
      if (path.endsWith('/password_history') && method === 'GET') return json([]);
      if (path.endsWith('/password_history') || path.endsWith('/users')
          || path.endsWith('/password_resets') || path.endsWith('/sessions')
          || path.endsWith('/audit_logs')) return json({});
      throw new Error(`Unexpected request: ${method} ${path}`);
    };

    const newPassword = 'NewStarlight99!';
    const result = await resetPassword({
      email: 'pending@example.test', resetToken, newPassword,
    }, '127.0.0.1');
    assert.equal(result.success, true);
    assert.equal(requests.some((request) =>
      new URL(request.url).pathname.endsWith('/rpc/activate_pending_employee_invitation')
    ), false);
    const userUpdate = requests.find((request) =>
      new URL(request.url).pathname.endsWith('/users') && request.method === 'PATCH'
    ).body;
    assert.notEqual(userUpdate.password_hash, newPassword);
    assert.equal(await verifyPassword(newPassword, userUpdate.password_hash), true);
    assert.equal(Object.hasOwn(userUpdate, 'status'), false);
    assert.equal(Object.hasOwn(userUpdate, 'email_verified_at'), false);
  });

  test('migration enforces one-time pending-client activation, authorization, audit, and service-only execution', async () => {
    const migration = await readFile(new URL(
      '../../../database/supabase/migrations/20260809000016_add_registration_email_verification.sql',
      import.meta.url
    ), 'utf8');
    const service = await readFile(new URL('../src/modules/auth/auth-service.js', import.meta.url), 'utf8');
    const ownerRepository = await readFile(new URL(
      '../src/modules/owner-workspace/owner-workspace.repository.js', import.meta.url
    ), 'utf8');

    assert.match(migration, /BEGIN;[\s\S]*COMMIT;/);
    assert.match(migration, /token_hash !~ '\^\[a-f0-9\]\{64\}\$'/);
    assert.match(migration, /t\.verified_at IS NULL[\s\S]*t\.expires_at > now\(\)/);
    assert.match(migration, /u\.email_normalized = v_authorized_email/);
    assert.match(migration, /u\.role = 'client'[\s\S]*u\.status = 'pending_verification'/);
    assert.match(migration, /NOT EXISTS \([\s\S]*public\.client_portal_memberships/);
    assert.match(migration, /SET status = 'active', email_verified_at = now\(\)/);
    assert.match(migration, /WHERE id = v_token_id AND verified_at IS NULL/);
    assert.match(migration, /'email\.verification_issued'/);
    assert.match(migration, /'email\.verified'/);
    assert.match(migration, /SECURITY DEFINER SET search_path = ''/);
    assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /GRANT EXECUTE[\s\S]*TO service_role/);
    assert.doesNotMatch(migration, /password_hash|CREATE POLICY|DISABLE ROW LEVEL SECURITY/i);

    assert.match(service, /configuredInitialOwnerEmail\(\)/);
    assert.match(service, /normalizeEmail\(user\.email\) === authorizedEmail/);
    assert.match(service, /activationUrl\.hash = new URLSearchParams\(\{ token \}\)\.toString\(\)/);
    assert.doesNotMatch(service, /activationUrl\.searchParams\.set\('token'/);
    assert.match(service, /if \(user\.role === 'employee'\)[\s\S]*activatePendingEmployee/);
    assert.match(ownerRepository, /user\.role !== 'client' \|\| user\.status !== 'active'/);
    assert.match(ownerRepository, /client_portal_memberships[\s\S]*\.eq\('user_id', userId\)/);
  });
});
