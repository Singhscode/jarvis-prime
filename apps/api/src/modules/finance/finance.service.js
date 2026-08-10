import { AppError } from '../../middleware/error-handler.js';
import * as crm from '../crm/crm.service.js';
import * as workspace from '../owner-workspace/owner-workspace.service.js';
import {
  EXPENSE_TRANSITIONS, FINANCE_PERMISSIONS, INVOICE_TRANSITIONS, PAYMENT_TRANSITIONS,
} from './finance.constants.js';
import * as repo from './finance.repository.js';
import {
  billingProfileValues, expenseCreateValues, expenseStatusValue, expenseUpdateValues,
  invoiceCreateValues, invoiceStatusValue, invoiceUpdateValues, pageOptions, paymentCreateValues,
  paymentStatusValue, uuid,
} from './finance.validation.js';

function notFound(name) {
  return new AppError(`${name} not found.`, 404, `FINANCE_${name.toUpperCase()}_NOT_FOUND`);
}

function unavailable() {
  return new AppError('Finance is temporarily unavailable.', 503, 'FINANCE_UNAVAILABLE', false);
}

function operationError(error, resource) {
  if (error instanceof AppError) throw error;
  if (error?.code === 'P0001') {
    if (error.message === 'FINANCE_ACCESS_DENIED') throw new AppError('Finance access is not permitted.', 403, 'INSUFFICIENT_PERMISSIONS');
    if (error.message?.includes('NOT_FOUND')) throw notFound(resource);
    if (error.message?.includes('NOT_EDITABLE') || error.message?.includes('STATUS_TRANSITION')) {
      throw new AppError(`${resource} cannot be changed in its current state.`, 409, 'FINANCE_STATE_CONFLICT');
    }
    if (error.message?.startsWith('FINANCE_')) throw new AppError('Finance request is invalid.', 400, 'VALIDATION_ERROR');
  }
  if (error?.code === '23505') throw new AppError(`${resource} already exists.`, 409, 'FINANCE_CONFLICT');
  if (error?.code === '23503' || error?.code === '23514') throw new AppError('Finance request is invalid.', 400, 'VALIDATION_ERROR');
  throw unavailable();
}

async function scope(userId, permission, { ownerOnly = false } = {}) {
  try {
    await workspace.assertOwnerWorkspaceAccess(userId);
    return { actorUserId: userId, ownerUserId: userId, isOwner: true };
  } catch (error) {
    if (error?.code !== 'INSUFFICIENT_PERMISSIONS') throw error;
  }
  if (ownerOnly) throw new AppError('Finance access is not permitted.', 403, 'INSUFFICIENT_PERMISSIONS');
  try {
    const employee = await repo.getActiveEmployeeActor(userId);
    if (!employee?.portal_owner_user_id || !(await repo.hasEmployeePermission(employee.portal_owner_user_id, userId, permission))) {
      throw new AppError('Finance access is not permitted.', 403, 'INSUFFICIENT_PERMISSIONS');
    }
    return { actorUserId: userId, ownerUserId: employee.portal_owner_user_id, isOwner: false };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unavailable();
  }
}

export async function getFinanceWorkspaceAccess(userId, claims) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.READ);
  return {
    identity: { email: claims?.email || 'Authenticated user' },
    capabilities: { billingProfile: actor.isOwner ? 'manage' : 'read' },
  };
}

export async function listFinanceClients(userId, query) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.READ);
  try { return await crm.listOwnerClients(actor.ownerUserId, query); }
  catch (error) { if (error instanceof AppError) throw error; throw unavailable(); }
}

async function invoiceDetail(ownerUserId, rawInvoiceId) {
  const detail = await repo.listInvoiceItems(ownerUserId, uuid(rawInvoiceId, 'invoice_id'));
  if (!detail) throw notFound('Invoice');
  return detail;
}

async function requireTransition(current, next, transitions, resource) {
  if (!transitions[current]?.has(next)) {
    throw new AppError(`${resource} cannot be changed in its current state.`, 409, 'FINANCE_STATE_CONFLICT');
  }
}

export async function getOverview(userId) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.READ);
  try { return await repo.getOverview(actor.actorUserId, actor.ownerUserId); }
  catch (error) { operationError(error, 'Overview'); }
}

export async function getBillingProfile(userId) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.READ);
  try { return await repo.getBillingProfile(actor.ownerUserId); }
  catch { throw unavailable(); }
}

export async function upsertBillingProfile(userId, values) {
  const actor = await scope(userId, null, { ownerOnly: true });
  try {
    const existing = await repo.getBillingProfile(actor.ownerUserId);
    await repo.upsertBillingProfile(actor.actorUserId, actor.ownerUserId, billingProfileValues(values, { existing }));
    return await repo.getBillingProfile(actor.ownerUserId);
  } catch (error) { operationError(error, 'Billing profile'); }
}

export async function listInvoices(userId, query) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.READ);
  try { return await repo.listInvoices(actor.ownerUserId, pageOptions(query, new Set(['draft', 'issued', 'paid', 'void']))); }
  catch (error) { if (error instanceof AppError) throw error; throw unavailable(); }
}

export async function getInvoice(userId, invoiceId) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.READ);
  try { return await invoiceDetail(actor.ownerUserId, invoiceId); }
  catch (error) { if (error instanceof AppError) throw error; throw unavailable(); }
}

export async function createInvoice(userId, values) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.INVOICES_WRITE);
  try {
    const created = await repo.createInvoice(actor.actorUserId, actor.ownerUserId, invoiceCreateValues(values));
    return await invoiceDetail(actor.ownerUserId, created.id);
  } catch (error) { operationError(error, 'Invoice'); }
}

export async function updateInvoice(userId, invoiceId, values) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.INVOICES_WRITE);
  try {
    const detail = await invoiceDetail(actor.ownerUserId, invoiceId);
    if (detail.invoice.status !== 'draft') throw new AppError('Invoice cannot be changed in its current state.', 409, 'FINANCE_STATE_CONFLICT');
    await repo.updateInvoice(actor.actorUserId, actor.ownerUserId, detail.invoice.id, invoiceUpdateValues(values, detail.invoice, detail.items));
    return await invoiceDetail(actor.ownerUserId, detail.invoice.id);
  } catch (error) { operationError(error, 'Invoice'); }
}

export async function updateInvoiceStatus(userId, invoiceId, values) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.INVOICES_WRITE);
  try {
    const detail = await invoiceDetail(actor.ownerUserId, invoiceId); const status = invoiceStatusValue(values);
    await requireTransition(detail.invoice.status, status, INVOICE_TRANSITIONS, 'Invoice');
    await repo.updateInvoiceStatus(actor.actorUserId, actor.ownerUserId, detail.invoice.id, status);
    return await invoiceDetail(actor.ownerUserId, detail.invoice.id);
  } catch (error) { operationError(error, 'Invoice'); }
}

export async function listPayments(userId, query) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.READ);
  try { return await repo.listPayments(actor.ownerUserId, pageOptions(query, new Set(['pending', 'recorded', 'failed', 'void']))); }
  catch (error) { if (error instanceof AppError) throw error; throw unavailable(); }
}

export async function getPayment(userId, paymentId) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.READ);
  try {
    const payment = await repo.getPayment(actor.ownerUserId, uuid(paymentId, 'payment_id'));
    if (!payment) throw notFound('Payment');
    return payment;
  } catch (error) { if (error instanceof AppError) throw error; throw unavailable(); }
}

export async function createPayment(userId, values) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.PAYMENTS_WRITE);
  try {
    const created = await repo.createPayment(actor.actorUserId, actor.ownerUserId, paymentCreateValues(values));
    return await repo.getPayment(actor.ownerUserId, created.id);
  } catch (error) { operationError(error, 'Payment'); }
}

export async function updatePaymentStatus(userId, paymentId, values) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.PAYMENTS_WRITE);
  try {
    const payment = await repo.getPayment(actor.ownerUserId, uuid(paymentId, 'payment_id'));
    if (!payment) throw notFound('Payment');
    const status = paymentStatusValue(values); await requireTransition(payment.status, status, PAYMENT_TRANSITIONS, 'Payment');
    const updated = await repo.updatePaymentStatus(actor.actorUserId, actor.ownerUserId, payment.id, status);
    return await repo.getPayment(actor.ownerUserId, updated.id);
  } catch (error) { operationError(error, 'Payment'); }
}

export async function listExpenses(userId, query) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.READ);
  try { return await repo.listExpenses(actor.ownerUserId, pageOptions(query, new Set(['draft', 'submitted', 'approved', 'reimbursed', 'void']))); }
  catch (error) { if (error instanceof AppError) throw error; throw unavailable(); }
}

export async function getExpense(userId, expenseId) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.READ);
  try {
    const expense = await repo.getExpense(actor.ownerUserId, uuid(expenseId, 'expense_id'));
    if (!expense) throw notFound('Expense');
    return expense;
  } catch (error) { if (error instanceof AppError) throw error; throw unavailable(); }
}

export async function createExpense(userId, values) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.EXPENSES_WRITE);
  try {
    const created = await repo.createExpense(actor.actorUserId, actor.ownerUserId, actor.isOwner ? null : actor.actorUserId, expenseCreateValues(values));
    return await repo.getExpense(actor.ownerUserId, created.id);
  } catch (error) { operationError(error, 'Expense'); }
}

export async function updateExpense(userId, expenseId, values) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.EXPENSES_WRITE);
  try {
    const expense = await repo.getExpense(actor.ownerUserId, uuid(expenseId, 'expense_id'));
    if (!expense) throw notFound('Expense');
    if (expense.status !== 'draft') throw new AppError('Expense cannot be changed in its current state.', 409, 'FINANCE_STATE_CONFLICT');
    const updated = await repo.updateExpense(actor.actorUserId, actor.ownerUserId, expense.id, expenseUpdateValues(values, expense));
    return await repo.getExpense(actor.ownerUserId, updated.id);
  } catch (error) { operationError(error, 'Expense'); }
}

export async function updateExpenseStatus(userId, expenseId, values) {
  const actor = await scope(userId, FINANCE_PERMISSIONS.EXPENSES_WRITE);
  try {
    const expense = await repo.getExpense(actor.ownerUserId, uuid(expenseId, 'expense_id'));
    if (!expense) throw notFound('Expense');
    const status = expenseStatusValue(values); await requireTransition(expense.status, status, EXPENSE_TRANSITIONS, 'Expense');
    const updated = await repo.updateExpenseStatus(actor.actorUserId, actor.ownerUserId, expense.id, status);
    return await repo.getExpense(actor.ownerUserId, updated.id);
  } catch (error) { operationError(error, 'Expense'); }
}
