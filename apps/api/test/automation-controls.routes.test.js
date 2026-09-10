import { after, test } from 'node:test';
import assert from 'node:assert/strict';

const nativeFetch = globalThis.fetch;
process.env.SUPABASE_URL = 'https://automation-controls.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_SECRET = 'automation-controls-test-jwt-secret';
process.env.DRY_RUN = 'true';

const ownerId = '10000000-0000-4000-8000-000000000001';
const controlCalls = [];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname.endsWith('/users')) return json({ id: ownerId, role: 'client', status: 'active' });
  if (url.pathname.endsWith('/client_portal_memberships')) return json([]);
  if (url.pathname.endsWith('/rpc/automation_set_control')) {
    controlCalls.push(JSON.parse(init.body));
    return json({ replayed: false, event_id: '20000000-0000-4000-8000-000000000002' });
  }
  throw new Error(`Unexpected database request: ${url}`);
};

after(() => { globalThis.fetch = nativeFetch; });

const express = (await import('express')).default;
const { default: automationRouter } = await import('../src/modules/automation/automation.execution.routes.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');
const { createAccessToken } = await import('../src/modules/auth/jwt-service.js');

function ownerToken() {
  return createAccessToken(
    { id: ownerId, email: 'owner@example.test', role: 'client' },
    { id: '20000000-0000-4000-8000-000000000003', device_id: 'test' },
    process.env.JWT_SECRET,
  );
}

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use('/automation', automationRouter);
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    await run(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function controlRequest(port, idempotencyKey) {
  const headers = {
    Authorization: `Bearer ${ownerToken()}`,
    'Content-Type': 'application/json',
  };
  if (idempotencyKey !== undefined) headers['Idempotency-Key'] = idempotencyKey;
  return nativeFetch(`http://127.0.0.1:${port}/automation/controls`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      scopeType: 'OWNER',
      scopeId: 'OWNER',
      paused: true,
      emergencyStop: false,
      reasonCode: 'OWNER_PAUSED',
    }),
  });
}

test('Owner control route forwards valid idempotency keys and rejects missing or malformed keys before the durable RPC', async () => {
  controlCalls.length = 0;
  await withServer(async (port) => {
    const validKey = 'automation-control-test-0001';
    const accepted = await controlRequest(port, validKey);
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).success, true);
    assert.equal(controlCalls.length, 1);
    assert.equal(controlCalls[0].p_owner, ownerId);
    assert.equal(controlCalls[0].p_scope_id, ownerId);
    assert.equal(controlCalls[0].p_idempotency, validKey);

    const missing = await controlRequest(port);
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).error.code, 'VALIDATION_ERROR');

    const malformed = await controlRequest(port, 'bad key');
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, 'VALIDATION_ERROR');
  });
  assert.equal(controlCalls.length, 1);
});
