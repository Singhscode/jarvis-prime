import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const nativeFetch = globalThis.fetch;
process.env.SUPABASE_URL = 'https://finance.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_SECRET = 'finance-test-jwt-secret';
process.env.DRY_RUN = 'true';

const ownerId = '10000000-0000-4000-8000-000000000001';
const employeeId = '20000000-0000-4000-8000-000000000002';
const clientId = '30000000-0000-4000-8000-000000000003';
const invoiceId = '40000000-0000-4000-8000-000000000004';
const paymentId = '50000000-0000-4000-8000-000000000005';
const expenseId = '60000000-0000-4000-8000-000000000006';
const profileId = '70000000-0000-4000-8000-000000000007';
const calls = [];
let employeePermission = true;
let ownerPortalMembership = false;

const owner = { id: ownerId, role: 'client', status: 'active' };
const employee = { id: employeeId, role: 'employee', status: 'active', portal_owner_user_id: ownerId };
const profile = { id: profileId, legal_name: 'JARVIS PRIME', billing_email: null, tax_identifier: null, billing_address: {}, currency: 'INR' };
const invoice = { id: invoiceId, billing_profile_id: profileId, crm_client_id: clientId, invoice_number: 'INV-001', status: 'draft', currency: 'INR', issued_at: null, due_at: null, subtotal_amount_minor: 1000, tax_amount_minor: 0, total_amount_minor: 1000, notes: null };
const item = { id: randomUUID(), invoice_id: invoiceId, line_number: 1, description: 'Foundation', quantity: '1.000', unit_amount_minor: 1000, tax_amount_minor: 0, line_amount_minor: 1000 };
const payment = { id: paymentId, crm_client_id: clientId, invoice_id: invoiceId, status: 'pending', currency: 'INR', amount_minor: 1000, provider: null, provider_reference: null, received_at: null };
const expense = { id: expenseId, submitted_by_employee_user_id: null, category: 'Travel', description: 'Local travel', status: 'draft', currency: 'INR', amount_minor: 100, incurred_at: '2026-08-10' };

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const select = url.searchParams.get('select'); const userId = url.searchParams.get('id');
  if (url.pathname.endsWith('/users') && userId === `eq.${ownerId}`) return json(owner);
  if (url.pathname.endsWith('/users') && userId === `eq.${employeeId}`) return json(employee);
  if (url.pathname.endsWith('/client_portal_memberships') && url.searchParams.get('user_id') === `eq.${ownerId}`) return json(ownerPortalMembership ? [{ id: randomUUID() }] : []);
  if (url.pathname.endsWith('/finance_employee_permissions')) return json(employeePermission ? [{ id: randomUUID() }] : []);
  calls.push({ url, init });
  if (url.pathname.endsWith('/rpc/finance_get_overview')) return json({ totalInvoicedMinor: 1000, totalPaidMinor: 0, outstandingMinor: 1000, expensesMinor: 100, currency: 'mixed' });
  if (url.pathname.endsWith('/rpc/finance_upsert_billing_profile')) return json(profile);
  if (url.pathname.endsWith('/rpc/finance_mutate_invoice')) return json({ id: invoiceId });
  if (url.pathname.endsWith('/rpc/finance_mutate_payment')) return json({ id: paymentId });
  if (url.pathname.endsWith('/rpc/finance_mutate_expense')) return json({ id: expenseId });
  if (url.pathname.endsWith('/finance_billing_profiles')) return json(profile);
  if (url.pathname.endsWith('/finance_invoices')) return json(url.searchParams.get('id') ? invoice : [invoice]);
  if (url.pathname.endsWith('/finance_invoice_items')) return json([item]);
  if (url.pathname.endsWith('/finance_payments')) return json(url.searchParams.get('id') ? payment : [payment]);
  if (url.pathname.endsWith('/finance_expenses')) return json(url.searchParams.get('id') ? expense : [expense]);
  if (url.pathname.endsWith('/crm_clients')) return json([{ id: clientId, client_code: 'JP-CLI-000001', name: 'Acme', created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z' }]);
  throw new Error(`Unexpected database request: ${url}`);
};

after(() => { globalThis.fetch = nativeFetch; });

const express = (await import('express')).default;
const { default: financeRouter } = await import('../src/modules/finance/finance.routes.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');
const { createAccessToken } = await import('../src/modules/auth/jwt-service.js');

function token(id = ownerId, role = 'client') {
  return createAccessToken({ id, email: `${id}@example.test`, role }, { id: randomUUID(), device_id: 'test' }, process.env.JWT_SECRET);
}

function expiredToken() {
  const [header, encodedPayload] = token().split('.');
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  payload.exp = 1;
  const expiredPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', process.env.JWT_SECRET).update(`${header}.${expiredPayload}`).digest('base64url');
  return `${header}.${expiredPayload}.${signature}`;
}

async function withServer(run) {
  const app = express(); app.use(express.json()); app.use('/finance', financeRouter); app.use(errorHandler);
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try { await run(server.address().port); } finally { await new Promise((resolve) => server.close(resolve)); }
}

const invoiceBody = () => ({ billing_profile_id: profileId, crm_client_id: clientId, invoice_number: 'INV-NEW', currency: 'INR', issued_at: null, due_at: null, subtotal_amount_minor: 1000, tax_amount_minor: 0, total_amount_minor: 1000, items: [{ line_number: 1, description: 'Foundation', quantity: '1.000', unit_amount_minor: 1000, tax_amount_minor: 0, line_amount_minor: 1000 }] });

describe('Finance API', () => {
  test('requires a JWT and derives Owner overview scope from the database subject only', async () => {
    calls.length = 0; ownerPortalMembership = false;
    await withServer(async (port) => {
      const unauthenticated = await nativeFetch(`http://127.0.0.1:${port}/finance/overview`);
      assert.equal(unauthenticated.status, 401);
      const malformed = await nativeFetch(`http://127.0.0.1:${port}/finance/overview`, { headers: { authorization: 'Bearer not-a-jwt' } });
      assert.equal(malformed.status, 401);
      const expired = await nativeFetch(`http://127.0.0.1:${port}/finance/overview`, { headers: { authorization: `Bearer ${expiredToken()}` } });
      assert.equal(expired.status, 401);
      const response = await nativeFetch(`http://127.0.0.1:${port}/finance/overview?owner_user_id=attacker`, { headers: { authorization: `Bearer ${token()}` } });
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.deepEqual((await response.json()).data, { totalInvoicedMinor: 1000, totalPaidMinor: 0, outstandingMinor: 1000, expensesMinor: 100, currency: 'mixed' });
    });
    const overview = calls.find((call) => call.url.pathname.endsWith('/rpc/finance_get_overview'));
    assert.deepEqual(JSON.parse(overview.init.body), { p_actor_user_id: ownerId, p_owner_user_id: ownerId });
  });

  test('allows an explicitly permitted employee but denies normal employees and Client Portal identities', async () => {
    employeePermission = true; ownerPortalMembership = false;
    await withServer(async (port) => {
      let response = await nativeFetch(`http://127.0.0.1:${port}/finance/invoices`, { headers: { authorization: `Bearer ${token(employeeId, 'employee')}` } });
      assert.equal(response.status, 200);
      employeePermission = false;
      response = await nativeFetch(`http://127.0.0.1:${port}/finance/invoices`, { headers: { authorization: `Bearer ${token(employeeId, 'employee')}` } });
      assert.equal(response.status, 403);
      ownerPortalMembership = true;
      response = await nativeFetch(`http://127.0.0.1:${port}/finance/invoices`, { headers: { authorization: `Bearer ${token()}` } });
      assert.equal(response.status, 403);
    });
    employeePermission = true; ownerPortalMembership = false;
  });

  test('validates billing profiles and rejects caller-controlled financial ownership before persistence', async () => {
    calls.length = 0;
    await withServer(async (port) => {
      const billing = await nativeFetch(`http://127.0.0.1:${port}/finance/billing-profile`, { headers: { authorization: `Bearer ${token()}` } });
      assert.equal(billing.status, 200); assert.equal((await billing.json()).data.id, profileId);
      const invalid = await nativeFetch(`http://127.0.0.1:${port}/finance/invoices`, { method: 'POST', headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...invoiceBody(), owner_user_id: employeeId }) });
      assert.equal(invalid.status, 400);
    });
    assert.equal(calls.some((call) => call.url.pathname.endsWith('/rpc/finance_mutate_invoice')), false);
  });

  test('creates and updates invoice records only through the scoped audited RPC', async () => {
    calls.length = 0;
    await withServer(async (port) => {
      const created = await nativeFetch(`http://127.0.0.1:${port}/finance/invoices`, { method: 'POST', headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, body: JSON.stringify(invoiceBody()) });
      assert.equal(created.status, 201); assert.equal((await created.json()).data.invoice.id, invoiceId);
      const status = await nativeFetch(`http://127.0.0.1:${port}/finance/invoices/${invoiceId}/status`, { method: 'PATCH', headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'issued' }) });
      assert.equal(status.status, 200);
    });
    const writes = calls.filter((call) => call.url.pathname.endsWith('/rpc/finance_mutate_invoice'));
    assert.equal(writes.length, 2);
    assert.equal(JSON.parse(writes[0].init.body).p_owner_user_id, ownerId);
    assert.equal(JSON.parse(writes[0].init.body).p_action, 'create');
    assert.equal(JSON.parse(writes[1].init.body).p_action, 'status');
  });

  test('creates payment and expense records without accepting a caller-supplied submitter', async () => {
    calls.length = 0;
    await withServer(async (port) => {
      const paymentResponse = await nativeFetch(`http://127.0.0.1:${port}/finance/payments`, { method: 'POST', headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, body: JSON.stringify({ crm_client_id: clientId, invoice_id: invoiceId, currency: 'INR', amount_minor: 1000 }) });
      assert.equal(paymentResponse.status, 201); assert.equal((await paymentResponse.json()).data.id, paymentId);
      const expenseResponse = await nativeFetch(`http://127.0.0.1:${port}/finance/expenses`, { method: 'POST', headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, body: JSON.stringify({ category: 'Travel', description: 'Local travel', currency: 'INR', amount_minor: 100, incurred_at: '2026-08-10' }) });
      assert.equal(expenseResponse.status, 201); assert.equal((await expenseResponse.json()).data.id, expenseId);
      const invalid = await nativeFetch(`http://127.0.0.1:${port}/finance/expenses`, { method: 'POST', headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, body: JSON.stringify({ category: 'Travel', description: 'Bad owner', currency: 'INR', amount_minor: 100, incurred_at: '2026-08-10', submitted_by_employee_user_id: employeeId }) });
      assert.equal(invalid.status, 400);
    });
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('/rpc/finance_mutate_payment')).length, 1);
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('/rpc/finance_mutate_expense')).length, 1);
  });
});

test('keeps Finance writes in explicit service-role-only audited database RPCs', async () => {
  const migration = await readFile(new URL('../../../database/supabase/migrations/20260810000018_add_finance_api_mutation_rpcs.sql', import.meta.url), 'utf8');
  for (const fn of ['finance_upsert_billing_profile', 'finance_mutate_invoice', 'finance_mutate_payment', 'finance_mutate_expense']) {
    assert.match(migration, new RegExp(`CREATE FUNCTION public\\.${fn}`));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}`));
  }
  assert.match(migration, /INSERT INTO public\.audit_logs/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.finance_mutate_invoice/);
});

test('derives Finance dashboard admission and client references from server-side Finance scope only', async () => {
  calls.length = 0; employeePermission = true; ownerPortalMembership = false;
  await withServer(async (port) => {
    const employeeHeaders = { authorization: `Bearer ${token(employeeId, 'employee')}` };
    let response = await nativeFetch(`http://127.0.0.1:${port}/finance/access`, { headers: employeeHeaders });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, { identity: { email: `${employeeId}@example.test` }, capabilities: { billingProfile: 'read' } });
    response = await nativeFetch(`http://127.0.0.1:${port}/finance/clients?limit=50&sort=name:asc`, { headers: employeeHeaders });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.items[0].id, clientId);

    employeePermission = false;
    response = await nativeFetch(`http://127.0.0.1:${port}/finance/access`, { headers: employeeHeaders });
    assert.equal(response.status, 403);
    employeePermission = true; ownerPortalMembership = true;
    response = await nativeFetch(`http://127.0.0.1:${port}/finance/access`, { headers: { authorization: `Bearer ${token()}` } });
    assert.equal(response.status, 403);
    ownerPortalMembership = false;

    for (const path of ['/finance/invoices/not-a-uuid', '/finance/payments/not-a-uuid', '/finance/expenses/not-a-uuid']) {
      response = await nativeFetch(`http://127.0.0.1:${port}${path}`, { headers: { authorization: `Bearer ${token()}` } });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
    }
  });
  employeePermission = true; ownerPortalMembership = false;
  const clientQuery = new URL(calls.find((call) => call.url.pathname.endsWith('/crm_clients')).url);
  assert.equal(clientQuery.searchParams.get('owner_user_id'), `eq.${ownerId}`);
});
