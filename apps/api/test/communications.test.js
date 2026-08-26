import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const nativeFetch = globalThis.fetch;
process.env.SUPABASE_URL = 'https://communications.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_SECRET = 'communications-test-jwt-secret';
process.env.DRY_RUN = 'true';

const ids = {
  owner: '10000000-0000-4000-8000-000000000001',
  employee: '20000000-0000-4000-8000-000000000002',
  thread: '30000000-0000-4000-8000-000000000003',
  message: '40000000-0000-4000-8000-000000000004',
  attachment: '50000000-0000-4000-8000-000000000005',
  notification: '60000000-0000-4000-8000-000000000006',
};
const calls = [];
let created = false;
let loseSendResponse = false;
let failThreadProjection = false;
let webhookRpcError = null;
const sentMessages = new Map();
const attachmentRecords = [];
const uploadedPaths = [];
const removedPaths = [];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function queryValue(url, name) { return url.searchParams.get(name); }
async function dbFetch(input, init = {}) {
  const request = input instanceof Request ? input : null;
  const url = new URL(request ? request.url : String(input));
  const rawBody = init.body || (request ? await request.clone().text() : '');
  let body = null;
  try { body = rawBody ? JSON.parse(rawBody) : null; } catch {}
  calls.push({ url, init, body });
  const path = url.pathname;
  const method = request?.method || init.method || 'GET';
  const singular = request?.headers.get('accept')?.includes('application/vnd.pgrst.object');
  if (path.includes('/storage/v1/object/') && path.includes('communication-private')) {
    if (method === 'DELETE') {
      removedPaths.push(...(body?.prefixes || []));
      return json([]);
    }
    if (path.includes('/sign/')) {
      return json({ signedURL: 'https://communications.test/storage/signed?token=signed&download=report.pdf' });
    }
    const storagePath = decodeURIComponent(path.split('/communication-private/')[1] || '');
    uploadedPaths.push(storagePath);
    return json({ Key: `communication-private/${storagePath}` });
  }
  if (path.endsWith('/users')) {
    const owner = { id: ids.owner, role: 'client', status: 'active', full_name: 'Owner User' };
    return json(singular ? owner : [owner]);
  }
  if (path.endsWith('/client_portal_memberships')) return json([]);
  if (path.endsWith('/rpc/communication_sync_actor_participants')) return json(null);
  if (path.endsWith('/rpc/communication_create_thread')) { created = true; return json({ thread_id: ids.thread, message_id: ids.message, created: true }); }
  if (path.endsWith('/rpc/communication_send_message')) {
    const messageId = randomUUID(); const sequence = sentMessages.size + 2;
    const message = { id: messageId, thread_id: ids.thread, sender_user_id: ids.owner, sequence, body: body.p_body,
      idempotency_key: body.p_idempotency_key, request_sha256: body.p_request_sha256, created_at: '2026-08-12T00:01:00.000Z' };
    sentMessages.set(body.p_idempotency_key, message);
    for (const attachment of body.p_attachment_metadata || []) attachmentRecords.push({
      id: randomUUID(), message_id: messageId, storage_path: attachment.storage_path,
      display_filename: attachment.display_filename, media_type: attachment.media_type,
      size_bytes: attachment.size_bytes, created_at: '2026-08-12T00:01:00.000Z',
    });
    if (loseSendResponse) return json({ code: 'PGRST000', message: 'Response lost after commit' }, 503);
    return json({ thread_id: ids.thread, message_id: messageId, sequence, created: true });
  }
  if (path.endsWith('/rpc/communication_set_notification_state')) return json({
    id: body.p_notification_id, state: body.p_state,
    read_at: '2026-08-12T00:02:00.000Z', dismissed_at: body.p_state === 'dismissed' ? '2026-08-12T00:02:00.000Z' : null,
  });
  if (path.endsWith('/rpc/communication_record_delivery_event')) {
    if (webhookRpcError) return json(webhookRpcError, 409);
    return json({ duplicate: false, delivery_id: randomUUID(), status: 'delivered' });
  }
  if (path.endsWith('/communication_participants')) {
    if (!created) return json(singular ? null : []);
    const participant = { thread_id: ids.thread, user_id: ids.owner, participant_kind: 'owner', status: 'active', last_read_sequence: 0, joined_at: '2026-08-12T00:00:00.000Z' };
    return json(singular ? participant : [participant]);
  }
  if (path.endsWith('/communication_threads')) {
    if (failThreadProjection) return json({ code: 'PGRST000', message: 'Projection unavailable' }, 503);
    const thread = { id: ids.thread, subject: 'Project update', last_sequence: sentMessages.size + 1, last_message_at: '2026-08-12T00:00:00.000Z', created_at: '2026-08-12T00:00:00.000Z' };
    return json(created ? (singular ? thread : [thread]) : (singular ? null : []));
  }
  if (path.endsWith('/communication_messages')) {
    const keyFilter = queryValue(url, 'idempotency_key');
    if (keyFilter) {
      const message = sentMessages.get(keyFilter.replace(/^eq\./, '')) || null;
      return json(singular ? message : (message ? [message] : []));
    }
    const messages = created ? [
      { id: ids.message, thread_id: ids.thread, sender_user_id: ids.owner, sequence: 1, body: 'Initial update', created_at: '2026-08-12T00:00:00.000Z' },
      ...sentMessages.values(),
    ] : [];
    return json(messages);
  }
  if (path.endsWith('/communication_attachments')) {
    const idFilter = queryValue(url, 'id');
    if (idFilter) {
      const attachment = idFilter === `eq.${ids.attachment}` ? {
        id: ids.attachment, message_id: ids.message, storage_path: `${ids.owner}/${ids.thread}/download/report.pdf`,
        display_filename: 'report.pdf', media_type: 'application/pdf', size_bytes: 42,
      } : null;
      return json(singular ? attachment : (attachment ? [attachment] : []));
    }
    const messageFilter = queryValue(url, 'message_id')?.replace(/^eq\./, '');
    const rows = messageFilter ? attachmentRecords.filter((attachment) => attachment.message_id === messageFilter) : attachmentRecords;
    return json(rows);
  }
  throw new Error(`Unexpected database request: ${url}`);
}
globalThis.fetch = dbFetch;
after(() => { globalThis.fetch = nativeFetch; });

const express = (await import('express')).default;
const { default: communicationsRouter } = await import('../src/modules/communications/communications.routes.js');
const { createCommunicationWebhookRouter } = await import('../src/modules/communications/communications.webhooks.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');
const { createAccessToken } = await import('../src/modules/auth/jwt-service.js');

function token(userId = ids.owner, role = 'client') {
  return createAccessToken({ id: userId, email: 'owner@example.test', role }, { id: randomUUID(), device_id: 'test' }, process.env.JWT_SECRET);
}

async function withApp(run) {
  const app = express();
  app.use('/communications/webhooks/email', createCommunicationWebhookRouter());
  app.use(express.json());
  app.use('/communications', communicationsRouter);
  app.use(errorHandler);
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try { await run(server.address().port); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test('Communication API requires JWT, derives Owner scope, and keeps empty state private', async () => {
  created = false; calls.length = 0;
  await withApp(async (port) => {
    let response = await nativeFetch(`http://127.0.0.1:${port}/communications/threads`);
    assert.equal(response.status, 401);
    response = await nativeFetch(`http://127.0.0.1:${port}/communications/threads?owner_user_id=attacker`, {
      headers: { authorization: `Bearer ${token()}` },
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
    response = await nativeFetch(`http://127.0.0.1:${port}/communications/threads`, {
      headers: { authorization: `Bearer ${token()}` },
    });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual((await response.json()).data, { items: [], pageInfo: { nextCursor: null, hasNextPage: false } });
  });
  const sync = calls.find((call) => call.url.pathname.endsWith('/rpc/communication_sync_actor_participants'));
  assert.deepEqual(sync.body, { p_actor_user_id: ids.owner, p_owner_user_id: ids.owner });
});

test('Communication thread creation requires exact input and an idempotency key before mutation', async () => {
  created = false; calls.length = 0;
  await withApp(async (port) => {
    const headers = { authorization: `Bearer ${token()}`, 'content-type': 'application/json' };
    let response = await nativeFetch(`http://127.0.0.1:${port}/communications/threads`, {
      method: 'POST', headers, body: JSON.stringify({ subject: 'Project update', body: 'Initial update', participants: [], ownerUserId: 'attacker' }),
    });
    assert.equal(response.status, 400);
    response = await nativeFetch(`http://127.0.0.1:${port}/communications/threads`, {
      method: 'POST', headers, body: JSON.stringify({ subject: 'Project update', body: 'Initial update', participants: [{ kind: 'employee', userId: ids.employee }] }),
    });
    assert.equal(response.status, 400);
    response = await nativeFetch(`http://127.0.0.1:${port}/communications/threads`, {
      method: 'POST', headers: { ...headers, 'Idempotency-Key': 'communication-create-key-0001' },
      body: JSON.stringify({ subject: 'Project update', body: 'Initial update', participants: [{ kind: 'employee', userId: ids.employee }] }),
    });
    assert.equal(response.status, 201);
    const data = (await response.json()).data;
    assert.equal(data.thread.id, ids.thread);
    assert.doesNotMatch(JSON.stringify(data), /owner_user_id|storage_path|provider/i);
  });
  const rpc = calls.find((call) => call.url.pathname.endsWith('/rpc/communication_create_thread'));
  assert.equal(rpc.body.p_owner_user_id, ids.owner);
  assert.deepEqual(rpc.body.p_participants[0], { kind: 'owner', user_id: ids.owner });
});

test('Communication mutation rejects malformed message bodies and client-supplied authority fields', async () => {
  created = false; calls.length = 0;
  await withApp(async (port) => {
    const response = await nativeFetch(`http://127.0.0.1:${port}/communications/threads/${ids.thread}/messages`, {
      method: 'POST', headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json', 'Idempotency-Key': 'communication-message-key-0001' },
      body: JSON.stringify({ body: 'Hello', ownerUserId: 'attacker' }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
  });
  assert.equal(calls.some((call) => call.url.pathname.endsWith('/rpc/communication_send_message')), false);
});

test('Communication query inputs are exact allowlists', async () => {
  created = true; calls.length = 0;
  const headers = { authorization: `Bearer ${token()}` };
  await withApp(async (port) => {
    for (const path of [
      '/communications/threads?unexpected=1',
      `/communications/threads/${ids.thread}?cursor=forbidden`,
      '/communications/notifications?owner_user_id=attacker',
    ]) {
      const response = await nativeFetch(`http://127.0.0.1:${port}${path}`, { headers });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
    }
  });
});

test('Communication notification lifecycle exposes exact read and dismissed projections', async () => {
  created = true; calls.length = 0;
  await withApp(async (port) => {
    for (const state of ['read', 'dismissed']) {
      const response = await nativeFetch(`http://127.0.0.1:${port}/communications/notifications/${ids.notification}`, {
        method: 'PATCH', headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ state }),
      });
      assert.equal(response.status, 200);
      const data = (await response.json()).data;
      assert.deepEqual(Object.keys(data).sort(), ['dismissedAt', 'id', 'readAt', 'state']);
      assert.equal(data.state, state);
      assert.equal(data.readAt, '2026-08-12T00:02:00.000Z');
      assert.equal(data.dismissedAt, state === 'dismissed' ? '2026-08-12T00:02:00.000Z' : null);
    }
  });
  assert.deepEqual(calls.filter((call) => call.url.pathname.endsWith('/rpc/communication_set_notification_state')).map((call) => call.body.p_state), ['read', 'dismissed']);
});

test('Communication attachment download stays authenticated and returns only a short-lived signed URL', async () => {
  created = true; calls.length = 0;
  await withApp(async (port) => {
    let response = await nativeFetch(`http://127.0.0.1:${port}/communications/threads/${ids.thread}/attachments/${ids.attachment}/download`);
    assert.equal(response.status, 401);
    response = await nativeFetch(`http://127.0.0.1:${port}/communications/threads/${ids.thread}/attachments/${ids.attachment}/download`, {
      headers: { authorization: `Bearer ${token()}` },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const data = (await response.json()).data;
    assert.match(data.url, /token=signed/);
    assert.match(data.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(Object.keys(data).sort().join(','), 'expiresAt,url');
  });
});

test('Communication attachment operations are unique and never clean up after a committed or ambiguous send', async () => {
  created = true; calls.length = 0; sentMessages.clear(); attachmentRecords.length = 0;
  uploadedPaths.length = 0; removedPaths.length = 0; loseSendResponse = true; failThreadProjection = false;
  const sendAttachment = async (port, key) => {
    const form = new FormData(); form.append('body', 'Same attachment message');
    form.append('attachments', new Blob([Buffer.from('safe text')], { type: 'text/plain' }), 'notes.txt');
    return nativeFetch(`http://127.0.0.1:${port}/communications/threads/${ids.thread}/messages`, {
      method: 'POST', headers: { authorization: `Bearer ${token()}`, 'Idempotency-Key': key }, body: form,
    });
  };
  await withApp(async (port) => {
    let response = await sendAttachment(port, 'communication-message-response-loss-0001');
    assert.equal(response.status, 201);
    assert.equal((await response.json()).data.created, false);
    loseSendResponse = false;
    response = await sendAttachment(port, 'communication-message-distinct-path-0002');
    assert.equal(response.status, 201);
    assert.equal(uploadedPaths.length, 2);
    assert.notEqual(uploadedPaths[0], uploadedPaths[1]);
    assert.equal(removedPaths.length, 0);

    failThreadProjection = true;
    response = await sendAttachment(port, 'communication-message-projection-fail-0003');
    assert.equal(response.status, 503);
    assert.equal(removedPaths.length, 0);
  });
  failThreadProjection = false; loseSendResponse = false;
});

test('Communication webhook verifies exact raw bytes and only records normalized delivery events', async () => {
  const priorSecret = process.env.COMMUNICATION_RESEND_WEBHOOK_SECRET;
  process.env.COMMUNICATION_RESEND_WEBHOOK_SECRET = 'whsec_c2lnbmluZy1zZWNyZXQ=';
  calls.length = 0;
  try {
    await withApp(async (port) => {
      const payload = JSON.stringify({ type: 'email.delivered', data: { email_id: 'provider-message-1', created_at: '2026-08-12T00:00:00.000Z' } });
      const timestamp = String(Math.floor(Date.now() / 1000)); const eventId = 'evt_communication_1';
      const signature = createHmac('sha256', Buffer.from('signing-secret')).update(`${eventId}.${timestamp}.${payload}`).digest('base64');
      let response = await nativeFetch(`http://127.0.0.1:${port}/communications/webhooks/email/resend`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'svix-id': eventId, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` }, body: payload,
      });
      assert.equal(response.status, 200); assert.deepEqual(await response.json(), { received: true, duplicate: false });
      response = await nativeFetch(`http://127.0.0.1:${port}/communications/webhooks/email/resend`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'svix-id': eventId, 'svix-timestamp': timestamp, 'svix-signature': 'v1,invalid' }, body: payload,
      });
      assert.equal(response.status, 401);

      const conflictId = 'evt_communication_conflict';
      const conflictSignature = createHmac('sha256', Buffer.from('signing-secret')).update(`${conflictId}.${timestamp}.${payload}`).digest('base64');
      webhookRpcError = { code: 'P0001', message: 'COMMUNICATION_WEBHOOK_EVIDENCE_CONFLICT raw provider detail' };
      response = await nativeFetch(`http://127.0.0.1:${port}/communications/webhooks/email/resend`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'svix-id': conflictId, 'svix-timestamp': timestamp, 'svix-signature': `v1,${conflictSignature}` }, body: payload,
      });
      assert.equal(response.status, 409);
      const conflictBody = await response.json();
      assert.equal(conflictBody.error.code, 'COMMUNICATION_WEBHOOK_EVIDENCE_CONFLICT');
      assert.doesNotMatch(JSON.stringify(conflictBody), /raw provider detail|provider-message-1/);
      webhookRpcError = null;
    });
    const event = calls.find((call) => call.url.pathname.endsWith('/rpc/communication_record_delivery_event'));
    assert.equal(event.body.p_provider_message_id, 'provider-message-1');
    assert.equal(event.body.p_event_type, 'delivered');
    assert.doesNotMatch(JSON.stringify(event.body), /owner|recipient|thread|payload\s*:/i);
  } finally {
    webhookRpcError = null;
    if (priorSecret === undefined) delete process.env.COMMUNICATION_RESEND_WEBHOOK_SECRET;
    else process.env.COMMUNICATION_RESEND_WEBHOOK_SECRET = priorSecret;
  }
});

test('Communication migration remains additive, RLS-protected, server-only, and separate from outreach authority', async () => {
  const migration = await readFile(new URL('../../../database/supabase/migrations/20260810000022_add_communication_hub.sql', import.meta.url), 'utf8');
  for (const table of ['communication_threads', 'communication_participants', 'communication_messages', 'communication_attachments', 'communication_notifications', 'communication_preferences', 'communication_deliveries', 'communication_delivery_events']) {
    assert.match(migration, new RegExp(`CREATE TABLE public\\.${table}`, 'i'));
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'));
  }
  for (const fn of ['communication_create_thread', 'communication_send_message', 'communication_mark_read', 'communication_set_notification_state', 'communication_upsert_preferences']) {
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}`, 'i'));
  }
  assert.match(migration, /communication-private/);
  assert.doesNotMatch(migration, /public\.(prospects|messages|events|campaigns|suppression|webhook_events|notifications)\b/i);
});


test('Communication attachment parser accepts only bounded validated private-message files', async () => {
  const { parseCommunicationMessage } = await import('../src/modules/communications/communications-message-parser.js');
  const app = express();
  app.post('/parse', parseCommunicationMessage, (req, res) => res.json({
    body: req.communicationMessage.body,
    files: req.communicationMessage.files.map((file) => ({ filename: file.filename, mediaType: file.mediaType, sizeBytes: file.sizeBytes, sha256: file.sha256 })),
  }));
  app.use(errorHandler);
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const endpoint = `http://127.0.0.1:${server.address().port}/parse`;
  const validPdf = new FormData();
  validPdf.append('body', 'Attachment message');
  validPdf.append('attachments', new Blob([Buffer.from('%PDF-1.7\nSafe')], { type: 'application/pdf' }), 'report.pdf');
  const invalidContent = new FormData();
  invalidContent.append('body', 'Attachment message');
  invalidContent.append('attachments', new Blob([Buffer.from('not a PDF')], { type: 'application/pdf' }), 'report.pdf');
  const tooMany = new FormData();
  tooMany.append('body', 'Attachment message');
  for (let index = 0; index < 6; index++) {
    tooMany.append('attachments', new Blob([Buffer.from('%PDF-1.7\nSafe')], { type: 'application/pdf' }), `report-${index}.pdf`);
  }
  try {
    let response = await nativeFetch(endpoint, { method: 'POST', body: validPdf });
    assert.equal(response.status, 200);
    const parsed = await response.json();
    assert.deepEqual(parsed.body, 'Attachment message');
    assert.deepEqual(parsed.files.map((file) => ({ filename: file.filename, mediaType: file.mediaType, sizeBytes: file.sizeBytes })), [{ filename: 'report.pdf', mediaType: 'application/pdf', sizeBytes: 13 }]);
    assert.match(parsed.files[0].sha256, /^[0-9a-f]{64}$/);
    response = await nativeFetch(endpoint, { method: 'POST', body: invalidContent });
    assert.equal(response.status, 400);
    response = await nativeFetch(endpoint, { method: 'POST', body: tooMany });
    assert.equal(response.status, 400);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
