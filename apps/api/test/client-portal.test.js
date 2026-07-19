import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.SUPABASE_URL = 'https://client-portal.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_SECRET = 'client-portal-test-jwt-secret';
const nativeFetch = globalThis.fetch;
const calls = [];
let databaseFetch;
globalThis.fetch = async (input, init = {}) => {
  const url = input instanceof Request ? input.url : String(input);
  const method = init.method || (input instanceof Request ? input.method : 'GET');
  const text = init.body || (input instanceof Request ? await input.clone().text() : '');
  let body = text || null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  calls.push({ url, method, body });
  return databaseFetch(url, method, body);
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});
const ids = {
  user: '10000000-0000-4000-8000-000000000001',
  owner: '20000000-0000-4000-8000-000000000002',
  client: '30000000-0000-4000-8000-000000000003',
  document: '40000000-0000-4000-8000-000000000004',
  membership: '50000000-0000-4000-8000-000000000005',
};
const membership = { id: ids.membership, crm_client_id: ids.client, user_id: ids.user, status: 'active' };
const service = await import('../src/modules/crm/crm.service.js');

function path(url) { return new URL(url).pathname; }
function clientFetch(snapshot = true) {
  return (url) => {
    if (path(url).endsWith('/client_portal_memberships')) return json([membership]);
    if (path(url).endsWith('/crm_clients')) return json(snapshot ? { id: ids.client, name: 'Acme' } : null);
    if (path(url).endsWith('/crm_projects')) return json([{ id: 'project-1', name: 'Launch' }]);
    if (path(url).endsWith('/crm_tasks')) return json([{ id: 'task-1', project_id: 'project-1', name: 'Review', completed: false }]);
    if (path(url).endsWith('/client_portal_documents')) return json([]);
    throw new Error(`Unexpected database request: ${url}`);
  };
}

describe('Client Portal API boundary', () => {
  test('requires a client JWT and exactly one active membership', async () => {
    const express = (await import('express')).default;
    const { clientPortalRouter } = await import('../src/modules/crm/crm.routes.js');
    const { errorHandler } = await import('../src/middleware/error-handler.js');
    const { createAccessToken } = await import('../src/modules/auth/jwt-service.js');
    const app = express();
    app.use(express.json());
    app.use('/client-portal', clientPortalRouter);
    app.use(errorHandler);
    const server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const tokenFor = (role) => createAccessToken(
      { id: ids.user, email: 'client@example.test', role },
      { id: ids.membership, device_id: 'test' }, process.env.JWT_SECRET
    );
    try {
      let response = await nativeFetch(`http://127.0.0.1:${server.address().port}/client-portal`);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, 'MISSING_TOKEN');
      response = await nativeFetch(`http://127.0.0.1:${server.address().port}/client-portal`, {
        headers: { Authorization: `Bearer ${tokenFor('employee')}` },
      });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, 'INSUFFICIENT_PERMISSIONS');
      databaseFetch = () => json([]);
      response = await nativeFetch(`http://127.0.0.1:${server.address().port}/client-portal`, {
        headers: { Authorization: `Bearer ${tokenFor('client')}` },
      });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, 'INSUFFICIENT_PERMISSIONS');
      calls.length = 0;
      databaseFetch = clientFetch();
      response = await nativeFetch(`http://127.0.0.1:${server.address().port}/client-portal?client_id=attacker`, {
        headers: { Authorization: `Bearer ${tokenFor('client')}`, 'x-client-id': 'attacker' },
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.client.id, ids.client);
      const scopeQuery = new URL(calls.find((call) => call.url.includes('/client_portal_memberships?')).url);
      assert.equal(scopeQuery.searchParams.get('user_id'), `eq.${ids.user}`);
      const scopedClientQuery = new URL(calls.find((call) => call.url.includes('/crm_clients?')).url);
      assert.equal(scopedClientQuery.searchParams.get('id'), `eq.${ids.client}`);
    } finally { await new Promise((resolve) => server.close(resolve)); }
  });

  test('derives a safe snapshot from membership scope and fixed projections only', async () => {
    calls.length = 0;
    databaseFetch = clientFetch();
    const snapshot = await service.getClientPortal(ids.user);
    assert.deepEqual(snapshot, {
      client: { id: ids.client, name: 'Acme' },
      projects: [{ id: 'project-1', name: 'Launch' }],
      tasks: [{ id: 'task-1', project_id: 'project-1', name: 'Review', completed: false }],
      documents: [],
    });
    const membershipQuery = new URL(calls.find((call) => call.url.includes('/client_portal_memberships?')).url);
    assert.equal(membershipQuery.searchParams.get('user_id'), `eq.${ids.user}`);
    assert.equal(membershipQuery.searchParams.get('status'), 'eq.active');
    assert.equal(membershipQuery.searchParams.get('limit'), '2');
    const projectQuery = new URL(calls.find((call) => call.url.includes('/crm_projects?')).url);
    const taskQuery = new URL(calls.find((call) => call.url.includes('/crm_tasks?')).url);
    const documentQuery = new URL(calls.find((call) => call.url.includes('/client_portal_documents?')).url);
    assert.equal(projectQuery.searchParams.get('select'), 'id,name');
    assert.equal(projectQuery.searchParams.get('client_id'), `eq.${ids.client}`);
    assert.equal(taskQuery.searchParams.get('select'), 'id,project_id,name,completed');
    assert.equal(documentQuery.searchParams.get('select'), 'id,project_id,title,document_type,created_at');
    assert.equal(documentQuery.searchParams.get('crm_client_id'), `eq.${ids.client}`);
    assert.equal(documentQuery.searchParams.get('client_visible'), 'eq.true');
    assert.equal(documentQuery.searchParams.get('revoked_at'), 'is.null');
  });

  test('rejects ambiguous membership and maps snapshot provider failures safely', async () => {
    databaseFetch = () => json([membership, { ...membership, id: ids.document }]);
    await assert.rejects(service.getClientPortal(ids.user), { code: 'INSUFFICIENT_PERMISSIONS', statusCode: 403 });
    databaseFetch = () => json({ code: 'XX000', message: 'provider internals' }, 500);
    await assert.rejects(service.getClientPortal(ids.user), {
      code: 'INTERNAL_ERROR', statusCode: 500, isOperational: false,
    });
  });

  test('validates and hashes activation input while returning one generic invalid result', async () => {
    databaseFetch = () => { throw new Error('database must not be reached'); };
    await assert.rejects(service.activateClientPortalMembership(ids.user, { invitation: 'x', client_id: ids.client }), {
      code: 'INVALID_FIELDS', statusCode: 400,
    });
    calls.length = 0;
    databaseFetch = (url) => {
      if (path(url).endsWith('/rpc/activate_client_portal_invitation')) return json({ activated: false });
      throw new Error(`Unexpected database request: ${url}`);
    };
    await assert.rejects(service.activateClientPortalMembership(ids.user, { invitation: 'raw-invitation' }), {
      code: 'INVALID_ACTIVATION', statusCode: 400,
    });
    assert.notEqual(calls.at(-1).body.p_token_hash, 'raw-invitation');
    databaseFetch = (url) => path(url).endsWith('/rpc/activate_client_portal_invitation')
      ? json({ activated: true }) : json({});
    assert.deepEqual(await service.activateClientPortalMembership(ids.user, { invitation: 'raw-invitation' }), { activated: true });
  });

  test('scopes document signing, audits denial, and never returns storage metadata', async () => {
    calls.length = 0;
    databaseFetch = (url, method) => {
      if (path(url).endsWith('/client_portal_memberships')) return json([membership]);
      if (path(url).endsWith('/client_portal_documents')) return json(null);
      if (path(url).endsWith('/audit_logs') && method === 'POST') return json({});
      throw new Error(`Unexpected database request: ${url}`);
    };
    await assert.rejects(service.getClientPortalDocumentDownload(ids.user, ids.document), {
      code: 'DOCUMENT_NOT_FOUND', statusCode: 404,
    });
    const deniedAudit = calls.find((call) => call.url.includes('/audit_logs'));
    assert.deepEqual(deniedAudit.body.details, { portal: 'client' });
    assert.equal(deniedAudit.body.resource_id, null);

    calls.length = 0;
    databaseFetch = (url, method) => {
      if (path(url).endsWith('/client_portal_memberships')) return json([membership]);
      if (path(url).endsWith('/client_portal_documents')) {
        return json({ id: ids.document, storage_bucket: 'client-portal-private', storage_path: 'server/private.pdf' });
      }
      if (path(url).includes('/storage/v1/object/sign/client-portal-private/')) return json({ signedURL: '/signed/private.pdf' });
      if (path(url).endsWith('/audit_logs') && method === 'POST') return json({});
      throw new Error(`Unexpected database request: ${url}`);
    };
    const result = await service.getClientPortalDocumentDownload(ids.user, ids.document);
    assert.match(result.url, /signed\/private\.pdf$/);
    assert.ok(result.expiresAt);
    assert.doesNotMatch(JSON.stringify(result), /storage_path|storage_bucket/);
    const documentQuery = new URL(calls.find((call) => call.url.includes('/client_portal_documents?')).url);
    assert.equal(documentQuery.searchParams.get('select'), 'id,storage_path');
    assert.equal(documentQuery.searchParams.get('id'), `eq.${ids.document}`);
    assert.equal(documentQuery.searchParams.get('crm_client_id'), `eq.${ids.client}`);
    assert.equal(calls.filter((call) => call.url.includes('/audit_logs')).at(-1).body.success, true);
  });

  test('rejects unsafe owner document input and compensates a failed metadata publish', async () => {
    await assert.rejects(service.publishClientPortalDocument(ids.owner, ids.client, {
      buffer: Buffer.from('x'), mimeType: 'application/pdf',
    }, { title: 'File', document_type: 'invoice' }), { code: 'VALIDATION_ERROR', statusCode: 400 });
    databaseFetch = () => { throw new Error('storage path must never reach the repository'); };
    await assert.rejects(service.publishClientPortalDocument(ids.owner, ids.client, {
      buffer: Buffer.from('x'), mimeType: 'application/pdf',
    }, { title: 'File', document_type: 'deliverable', storage_path: 'attacker-controlled' }), {
      code: 'INVALID_FIELDS', statusCode: 400,
    });
    calls.length = 0;
    databaseFetch = (url) => {
      if (path(url).includes('/storage/v1/object/client-portal-private/')) return json({});
      if (path(url).endsWith('/rpc/publish_client_portal_document')) {
        return json({ code: 'P0001', message: 'PORTAL_DOCUMENT_NOT_FOUND' }, 400);
      }
      if (path(url).endsWith('/storage/v1/object/client-portal-private')) return json({});
      throw new Error(`Unexpected database request: ${url}`);
    };
    await assert.rejects(service.publishClientPortalDocument(ids.owner, ids.client, {
      buffer: Buffer.from('file'), mimeType: 'application/pdf',
    }, { title: 'File', document_type: 'deliverable', project_id: '60000000-0000-4000-8000-000000000006' }), {
      code: 'PORTAL_DOCUMENT_NOT_FOUND', statusCode: 404,
    });
    assert.ok(calls.some((call) => call.method === 'DELETE' && call.url.includes('/storage/v1/object/client-portal-private')));
  });

  test('keeps the migration additive, private, and service-role-only', async () => {
    const migration = await readFile(new URL(
      '../../../database/supabase/migrations/20260718000010_create_client_portal.sql', import.meta.url
    ), 'utf8');
    for (const table of ['client_portal_memberships', 'client_portal_invitations', 'client_portal_documents']) {
      assert.match(migration, new RegExp(`create table public\\.${table}`));
      assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    }
    assert.equal((migration.match(/security definer/gi) || []).length, 4);
    assert.equal((migration.match(/set search_path = ''/gi) || []).length, 4);
    assert.match(migration, /values \('client-portal-private', 'client-portal-private', false\)/);
    assert.doesNotMatch(migration, /\b(drop|truncate|delete from public\.(users|crm_clients|contacts))\b/i);
  });
});
