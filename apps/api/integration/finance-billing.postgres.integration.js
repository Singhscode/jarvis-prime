import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required.');
const target = new URL(connectionString);
if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
  throw new Error('Finance integration tests require a disposable local database.');
}

const ids = Object.fromEntries([
  'owner', 'otherOwner', 'employee', 'otherEmployee', 'client', 'secondClient', 'otherClient',
  'profile', 'otherProfile', 'invoice',
].map((name) => [name, randomUUID()]));
let db;

async function rejected(operation) {
  await db.query('savepoint expected_failure');
  let error;
  try { await operation(); } catch (caught) { error = caught; }
  await db.query('rollback to savepoint expected_failure');
  await db.query('release savepoint expected_failure');
  assert.ok(error, 'operation should fail');
  return error;
}

async function asService(operation) {
  await db.query('savepoint service_role_operation');
  await db.query('set local role service_role');
  try {
    const result = await operation();
    await db.query('reset role');
    await db.query('release savepoint service_role_operation');
    return result;
  } catch (error) {
    await db.query('rollback to savepoint service_role_operation');
    await db.query('release savepoint service_role_operation');
    throw error;
  }
}

async function insertInvoice({ ownerId = ids.owner, profileId = ids.profile, clientId = ids.client, number = 'INV-001', total = 1000 } = {}) {
  return db.query(`insert into public.finance_invoices
    (id, owner_user_id, billing_profile_id, crm_client_id, invoice_number, currency, subtotal_amount_minor, total_amount_minor)
    values ($1, $2, $3, $4, $5, 'INR', $6, $6)`, [randomUUID(), ownerId, profileId, clientId, number, total]);
}

describe('Finance & Billing PostgreSQL foundation', { concurrency: false }, () => {
  before(async () => {
    db = new Client({ connectionString });
    await db.connect();
    await db.query('begin');
    await db.query(`insert into public.users (id, email, email_normalized, status, role, portal_owner_user_id) values
      ($1, 'finance-owner@test.local', 'finance-owner@test.local', 'active', 'client', null),
      ($2, 'finance-other-owner@test.local', 'finance-other-owner@test.local', 'active', 'client', null),
      ($3, 'finance-employee@test.local', 'finance-employee@test.local', 'active', 'employee', $1),
      ($4, 'finance-other-employee@test.local', 'finance-other-employee@test.local', 'active', 'employee', $2)`,
    [ids.owner, ids.otherOwner, ids.employee, ids.otherEmployee]);
    await db.query(`insert into public.crm_clients (id, owner_user_id, name) values
      ($1, $4, 'Finance Client'), ($2, $4, 'Second Finance Client'), ($3, $5, 'Other Finance Client')`,
    [ids.client, ids.secondClient, ids.otherClient, ids.owner, ids.otherOwner]);
    await db.query(`insert into public.finance_billing_profiles (id, owner_user_id, legal_name) values
      ($1, $3, 'Finance Owner'), ($2, $4, 'Other Finance Owner')`,
    [ids.profile, ids.otherProfile, ids.owner, ids.otherOwner]);
    await db.query(`insert into public.finance_invoices
      (id, owner_user_id, billing_profile_id, crm_client_id, invoice_number, currency, subtotal_amount_minor, total_amount_minor)
      values ($1, $2, $3, $4, 'INV-001', 'INR', 1000, 1000)`,
    [ids.invoice, ids.owner, ids.profile, ids.client]);
  });

  after(async () => {
    if (!db) return;
    await db.query('rollback').catch(() => {});
    await db.end();
  });

  test('keeps finance tables private, RLS-enabled, and service-role-only', async () => {
    const { rows: [state] } = await db.query(`select
      (select bool_and(relrowsecurity) from pg_class where oid = any(array[
        'public.finance_billing_profiles'::regclass, 'public.finance_employee_permissions'::regclass,
        'public.finance_invoices'::regclass, 'public.finance_invoice_items'::regclass,
        'public.finance_payments'::regclass, 'public.finance_expenses'::regclass,
        'public.finance_documents'::regclass])) as all_rls,
      has_table_privilege('service_role', 'public.finance_invoices', 'select') as service_read,
      has_table_privilege('anon', 'public.finance_invoices', 'select') as anon_read,
      has_table_privilege('authenticated', 'public.finance_invoices', 'insert') as authenticated_write,
      exists (select 1 from storage.buckets where id = 'finance-private' and public = false) as private_bucket`);
    assert.deepEqual(state, { all_rls: true, service_read: true, anon_read: false, authenticated_write: false, private_bucket: true });
  });

  test('enforces owner-scoped profile, client, invoice, and item relationships', async () => {
    const crossOwner = await rejected(() => insertInvoice({ clientId: ids.otherClient, number: 'INV-CROSS-OWNER' }));
    assert.equal(crossOwner.code, '23503');
    const duplicateNumber = await rejected(() => insertInvoice({ number: 'INV-001' }));
    assert.equal(duplicateNumber.code, '23505');
    const invalidTotals = await rejected(() => db.query(`insert into public.finance_invoices
      (owner_user_id, billing_profile_id, crm_client_id, invoice_number, currency, subtotal_amount_minor, total_amount_minor)
      values ($1, $2, $3, 'INV-BAD-TOTAL', 'INR', 10, 9)`, [ids.owner, ids.profile, ids.client]));
    assert.equal(invalidTotals.code, '23514');
    await db.query(`insert into public.finance_invoice_items
      (invoice_id, line_number, description, quantity, unit_amount_minor, line_amount_minor)
      values ($1, 1, 'Foundation', 1, 1000, 1000)`, [ids.invoice]);
    const duplicateLine = await rejected(() => db.query(`insert into public.finance_invoice_items
      (invoice_id, line_number, description, quantity, unit_amount_minor, line_amount_minor)
      values ($1, 1, 'Duplicate', 1, 1, 1)`, [ids.invoice]));
    assert.equal(duplicateLine.code, '23505');
  });

  test('rejects invalid finance employee and expense ownership', async () => {
    await db.query(`insert into public.finance_employee_permissions
      (owner_user_id, employee_user_id, permission) values ($1, $2, 'finance.read')`, [ids.owner, ids.employee]);
    const foreignEmployee = await rejected(() => db.query(`insert into public.finance_employee_permissions
      (owner_user_id, employee_user_id, permission) values ($1, $2, 'finance.read')`, [ids.owner, ids.otherEmployee]));
    assert.equal(foreignEmployee.code, 'P0001');
    const foreignExpense = await rejected(() => db.query(`insert into public.finance_expenses
      (owner_user_id, submitted_by_employee_user_id, category, description, currency, amount_minor, incurred_at)
      values ($1, $2, 'Travel', 'Out-of-scope employee', 'INR', 100, current_date)`, [ids.owner, ids.otherEmployee]));
    assert.equal(foreignExpense.code, 'P0001');
  });

  test('prevents payment client substitution and invalid receipt relationships', async () => {
    const wrongPaymentClient = await rejected(() => db.query(`insert into public.finance_payments
      (owner_user_id, crm_client_id, invoice_id, currency, amount_minor)
      values ($1, $2, $3, 'INR', 1000)`, [ids.owner, ids.secondClient, ids.invoice]));
    assert.equal(wrongPaymentClient.code, 'P0001');
    const invalidDocument = await rejected(() => db.query(`insert into public.finance_documents
      (owner_user_id, invoice_id, payment_id, document_type, storage_bucket, storage_path, title)
      values ($1, $2, $3, 'receipt', 'finance-private', 'finance/invalid.pdf', 'Invalid receipt')`,
    [ids.owner, ids.invoice, randomUUID()]));
    assert.equal(invalidDocument.code, '23514');
  });

  test('uses service-only Finance RPCs for atomic mutations, Owner scope, and audit events', async () => {
    const payload = {
      billing_profile_id: ids.profile,
      crm_client_id: ids.client,
      invoice_number: 'INV-RPC-001',
      currency: 'INR',
      issued_at: null,
      due_at: null,
      subtotal_amount_minor: 2500,
      tax_amount_minor: 0,
      total_amount_minor: 2500,
      notes: null,
      items: [{ line_number: 1, description: 'Audited service', quantity: '1.000', unit_amount_minor: 2500, tax_amount_minor: 0, line_amount_minor: 2500 }],
    };
    const { rows: [created] } = await asService(() => db.query(
      `select public.finance_mutate_invoice($1, $2, null, 'create', $3::jsonb) as invoice`,
      [ids.owner, ids.owner, payload]
    ));
    assert.equal(created.invoice.invoice_number, 'INV-RPC-001');
    const audit = await db.query(`select user_id, event_type, action, resource_id, details
      from public.audit_logs where resource_id = $1`, [created.invoice.id]);
    assert.deepEqual(audit.rows, [{ user_id: ids.owner, event_type: 'finance.invoice', action: 'create', resource_id: created.invoice.id, details: { status: 'draft' } }]);
    const crossOwnerClient = await rejected(() => asService(() => db.query(
      `select public.finance_mutate_invoice($1, $2, null, 'create', $3::jsonb)`,
      [ids.owner, ids.owner, { ...payload, invoice_number: 'INV-RPC-FOREIGN', crm_client_id: ids.otherClient }]
    )));
    assert.equal(crossOwnerClient.code, '23503');
    const { rows: [overview] } = await asService(() => db.query(
      'select public.finance_get_overview($1, $2) as summary', [ids.owner, ids.owner]
    ));
    assert.equal(overview.summary.totalInvoicedMinor, 0);
  });

  test('denies direct finance-table access to anonymous callers', async () => {
    await db.query('savepoint anonymous_access_denial');
    await db.query('set local role anon');
    await assert.rejects(db.query('select * from public.finance_invoices'), { code: '42501' });
    await db.query('rollback to savepoint anonymous_access_denial');
    await db.query('release savepoint anonymous_access_denial');
  });

  test('permits exact employee Finance RPC permissions and records only safe payment and expense audit details', async () => {
    await db.query(`insert into public.finance_employee_permissions (owner_user_id, employee_user_id, permission) values
      ($1, $2, 'finance.invoices.write'), ($1, $2, 'finance.payments.write'), ($1, $2, 'finance.expenses.write')`, [ids.owner, ids.employee]);
    const invoicePayload = { billing_profile_id: ids.profile, crm_client_id: ids.client, invoice_number: 'INV-EMPLOYEE-001', currency: 'INR', issued_at: null, due_at: null, subtotal_amount_minor: 1200, tax_amount_minor: 0, total_amount_minor: 1200, notes: null, items: [{ line_number: 1, description: 'Employee scoped service', quantity: '1.000', unit_amount_minor: 1200, tax_amount_minor: 0, line_amount_minor: 1200 }] };
    const { rows: [employeeInvoice] } = await asService(() => db.query(
      `select public.finance_mutate_invoice($1, $2, null, 'create', $3::jsonb) as invoice`, [ids.employee, ids.owner, invoicePayload]
    ));
    assert.equal(employeeInvoice.invoice.invoice_number, 'INV-EMPLOYEE-001');

    const paymentPayload = { crm_client_id: ids.client, invoice_id: ids.invoice, status: 'pending', currency: 'INR', amount_minor: 1000, provider: null, provider_reference: null, received_at: null };
    const { rows: [payment] } = await asService(() => db.query(
      `select public.finance_mutate_payment($1, $2, null, 'create', $3::jsonb) as payment`, [ids.employee, ids.owner, paymentPayload]
    ));
    await asService(() => db.query(`select public.finance_mutate_payment($1, $2, $3, 'status', '{"status":"recorded"}'::jsonb)`, [ids.employee, ids.owner, payment.payment.id]));

    const expensePayload = { category: 'Travel', description: 'Local business travel', status: 'draft', currency: 'INR', amount_minor: 250, incurred_at: '2026-08-10' };
    const { rows: [expense] } = await asService(() => db.query(
      `select public.finance_mutate_expense($1, $2, null, 'create', $3::jsonb) as expense`, [ids.employee, ids.owner, expensePayload]
    ));
    await asService(() => db.query(`select public.finance_mutate_expense($1, $2, $3, 'status', '{"status":"submitted"}'::jsonb)`, [ids.employee, ids.owner, expense.expense.id]));
    await asService(() => db.query(`select public.finance_mutate_expense($1, $2, $3, 'status', '{"status":"approved"}'::jsonb)`, [ids.employee, ids.owner, expense.expense.id]));

    const { rows: audits } = await db.query(`select user_id, event_type, action, details from public.audit_logs where resource_id = any($1::uuid[]) order by event_type, action`, [[employeeInvoice.invoice.id, payment.payment.id, expense.expense.id]]);
    assert.equal(audits.length, 6);
    for (const audit of audits) {
      assert.equal(audit.user_id, ids.employee);
      assert.deepEqual(Object.keys(audit.details), ['status']);
      assert.doesNotMatch(JSON.stringify(audit.details), /password|token|secret|credential|storage_path|provider_reference/i);
    }

    const foreignActor = await rejected(() => asService(() => db.query('select public.finance_get_overview($1, $2)', [ids.otherEmployee, ids.owner])));
    assert.equal(foreignActor.code, 'P0001');
  });
});
