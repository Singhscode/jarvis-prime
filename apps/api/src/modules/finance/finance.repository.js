import { getDb } from '../../database/db.js';

const PROFILE_FIELDS = 'id,legal_name,billing_email,tax_identifier,billing_address,currency,created_at,updated_at';
const INVOICE_FIELDS = 'id,billing_profile_id,crm_client_id,invoice_number,status,currency,issued_at,due_at,subtotal_amount_minor,tax_amount_minor,total_amount_minor,notes,created_at,updated_at';
const ITEM_FIELDS = 'id,invoice_id,line_number,description,quantity,unit_amount_minor,tax_amount_minor,line_amount_minor,created_at,updated_at';
const PAYMENT_FIELDS = 'id,crm_client_id,invoice_id,status,currency,amount_minor,provider,provider_reference,received_at,created_at,updated_at';
const EXPENSE_FIELDS = 'id,submitted_by_employee_user_id,category,description,status,currency,amount_minor,incurred_at,created_at,updated_at';

function client() {
  const { client: db, usingMemory } = getDb();
  if (usingMemory) throw new Error('Finance requires a Supabase database.');
  return db;
}

function resultError(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function getActiveEmployeeActor(userId) {
  return resultError(await client().from('users').select('id,role,status,portal_owner_user_id')
    .eq('id', userId).eq('role', 'employee').eq('status', 'active').maybeSingle());
}

export async function hasEmployeePermission(ownerUserId, employeeUserId, permission) {
  const data = resultError(await client().from('finance_employee_permissions').select('id')
    .eq('owner_user_id', ownerUserId).eq('employee_user_id', employeeUserId).eq('permission', permission).limit(1));
  return data.length === 1;
}

export async function getBillingProfile(ownerUserId) {
  return resultError(await client().from('finance_billing_profiles').select(PROFILE_FIELDS)
    .eq('owner_user_id', ownerUserId).maybeSingle());
}

export async function upsertBillingProfile(actorUserId, ownerUserId, values) {
  return resultError(await client().rpc('finance_upsert_billing_profile', {
    p_actor_user_id: actorUserId, p_owner_user_id: ownerUserId, p_legal_name: values.legal_name,
    p_billing_email: values.billing_email, p_tax_identifier: values.tax_identifier,
    p_billing_address: values.billing_address, p_currency: values.currency,
  }));
}

export async function listInvoices(ownerUserId, options) {
  let query = client().from('finance_invoices').select(INVOICE_FIELDS).eq('owner_user_id', ownerUserId);
  if (options.status) query = query.eq('status', options.status);
  if (options.client_id) query = query.eq('crm_client_id', options.client_id);
  return resultError(await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(options.limit)) || [];
}

export async function getInvoice(ownerUserId, invoiceId) {
  return resultError(await client().from('finance_invoices').select(INVOICE_FIELDS)
    .eq('owner_user_id', ownerUserId).eq('id', invoiceId).maybeSingle());
}

export async function listInvoiceItems(ownerUserId, invoiceId) {
  const invoice = await getInvoice(ownerUserId, invoiceId);
  if (!invoice) return null;
  const items = resultError(await client().from('finance_invoice_items').select(ITEM_FIELDS)
    .eq('invoice_id', invoiceId).order('line_number', { ascending: true })) || [];
  return { invoice, items };
}

async function mutate(functionName, actorUserId, ownerUserId, idKey, id, action, payload) {
  return resultError(await client().rpc(functionName, {
    p_actor_user_id: actorUserId, p_owner_user_id: ownerUserId, [idKey]: id, p_action: action, p_payload: payload,
  }));
}

export function createInvoice(actorUserId, ownerUserId, values) {
  return mutate('finance_mutate_invoice', actorUserId, ownerUserId, 'p_invoice_id', null, 'create', values);
}

export function updateInvoice(actorUserId, ownerUserId, invoiceId, values) {
  return mutate('finance_mutate_invoice', actorUserId, ownerUserId, 'p_invoice_id', invoiceId, 'update', values);
}

export function updateInvoiceStatus(actorUserId, ownerUserId, invoiceId, status) {
  return mutate('finance_mutate_invoice', actorUserId, ownerUserId, 'p_invoice_id', invoiceId, 'status', { status });
}

export async function listPayments(ownerUserId, options) {
  let query = client().from('finance_payments').select(PAYMENT_FIELDS).eq('owner_user_id', ownerUserId);
  if (options.status) query = query.eq('status', options.status);
  if (options.client_id) query = query.eq('crm_client_id', options.client_id);
  return resultError(await query.order('received_at', { ascending: false }).order('id', { ascending: false }).limit(options.limit)) || [];
}

export async function getPayment(ownerUserId, paymentId) {
  return resultError(await client().from('finance_payments').select(PAYMENT_FIELDS)
    .eq('owner_user_id', ownerUserId).eq('id', paymentId).maybeSingle());
}

export function createPayment(actorUserId, ownerUserId, values) {
  return mutate('finance_mutate_payment', actorUserId, ownerUserId, 'p_payment_id', null, 'create', values);
}

export function updatePaymentStatus(actorUserId, ownerUserId, paymentId, status) {
  return mutate('finance_mutate_payment', actorUserId, ownerUserId, 'p_payment_id', paymentId, 'status', { status });
}

export async function listExpenses(ownerUserId, options) {
  let query = client().from('finance_expenses').select(EXPENSE_FIELDS).eq('owner_user_id', ownerUserId);
  if (options.status) query = query.eq('status', options.status);
  return resultError(await query.order('incurred_at', { ascending: false }).order('id', { ascending: false }).limit(options.limit)) || [];
}

export async function getExpense(ownerUserId, expenseId) {
  return resultError(await client().from('finance_expenses').select(EXPENSE_FIELDS)
    .eq('owner_user_id', ownerUserId).eq('id', expenseId).maybeSingle());
}

export function createExpense(actorUserId, ownerUserId, _submittedByEmployeeUserId, values) {
  return mutate('finance_mutate_expense', actorUserId, ownerUserId, 'p_expense_id', null, 'create', values);
}

export function updateExpense(actorUserId, ownerUserId, expenseId, values) {
  return mutate('finance_mutate_expense', actorUserId, ownerUserId, 'p_expense_id', expenseId, 'update', values);
}

export function updateExpenseStatus(actorUserId, ownerUserId, expenseId, status) {
  return mutate('finance_mutate_expense', actorUserId, ownerUserId, 'p_expense_id', expenseId, 'status', { status });
}

export async function getOverview(actorUserId, ownerUserId) {
  return resultError(await client().rpc('finance_get_overview', {
    p_actor_user_id: actorUserId, p_owner_user_id: ownerUserId,
  }));
}
